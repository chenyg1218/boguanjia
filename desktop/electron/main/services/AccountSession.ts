import { Result } from '@praha/byethrow'
import type { Page } from 'playwright'
import { IPC_CHANNELS } from 'shared/ipcChannels'
import { type DisconnectReason, isResumableTaskType, type ResumableTaskType } from 'shared/session'
import { TaskNotSupportedError, UnexpectedError } from '#/errors/AppError'
import { emitter } from '#/event/eventBus'
import { createLogger } from '#/logger'
import {
  type BrowserSession,
  browserManager,
  type StorageState,
} from '#/managers/BrowserSessionManager'
import { viewerAccountManager } from '#/managers/ViewerAccountManager'
import { platformFactory } from '#/platforms'
import {
  DouyinLiveStartedWatcher,
  type LiveStartedRef,
} from '#/platforms/douyin/liveEndedWatcher'
import {
  type IPlatform,
  isAudienceRoomUrl,
  isCommentListener,
  isLiveEndedWatch,
  isPerformComment,
  isPerformPopup,
  type ResolvedAudienceRoomUrl,
} from '#/platforms/IPlatform'
import { audienceRoomCache } from '#/services/AudienceRoomCache'
import {
  clearOutboundComments,
  forgetOutboundComment,
  rememberOutboundComment,
} from '#/services/outboundComments'
import { sessionStateStore } from '#/services/SessionStateStore'
import { createAutoCommentTask } from '#/tasks/AutoCommentTask'
import { createAutoPopupTask, performPopupOnce } from '#/tasks/AutoPopupTask'
import { createCommentListenerTask } from '#/tasks/CommentListenerTask'
import type { ITask } from '#/tasks/ITask'
import { TaskStopReason } from '#/tasks/ITask'
import { createSendBatchMessageTask } from '#/tasks/SendBatchMessageTask'
import windowManager from '#/windowManager'

/** L2 解析失败后的重试间隔（有互动号时） */
const RESOLVE_RETRY_MS = 2_000
/** 等待互动号登录时的慢重试（主要靠登录事件触发，此处仅兜底） */
const RESOLVE_WAIT_VIEWER_MS = 15_000
/** 支持自动检测开播并缓存观众端链接的平台 */
const AUTO_ROOM_CACHE_PLATFORMS: LiveControlPlatform[] = ['douyin', 'buyin']

export type DesiredTaskStore = {
  getDesiredTasks: () => LiveControlTask[]
  setDesiredTask: (task: LiveControlTask) => void
  deleteDesiredTask: (type: ResumableTaskType) => void
  clearDesiredTasks: () => void
}

export class AccountSession {
  private platform: IPlatform
  private browserSession: BrowserSession | null = null
  private activeTasks: Map<LiveControlTask['type'], ITask> = new Map()
  /** 串行化单条公屏发送，避免回复互相踩评论框 */
  private commentSendChain: Promise<unknown> = Promise.resolve()
  private disconnecting = false
  private pageCloseHandler: (() => void) | null = null
  private browserDisconnectHandler: (() => void) | null = null
  /** 避免 LIVE_ENDED 级联停任务时互相重入 */
  private cascadingLiveEnded = false
  private liveEndedWatching = false
  /** 连接后检测开播（L1）并解析观众端链接（L2） */
  private liveStartedWatching = false
  private liveStartedWatcher: DouyinLiveStartedWatcher | null = null
  private resolvingAudienceRoom = false
  private resolveRetryTimer: ReturnType<typeof setTimeout> | null = null
  /** 「等待互动号」提示只打一次，避免重试刷屏 */
  private waitingViewerHintShown = false
  private platformKey: LiveControlPlatform

  constructor(
    platformName: LiveControlPlatform,
    private account: Account,
    private desired: DesiredTaskStore,
    private logger = createLogger(`@${account.name}`),
  ) {
    this.platformKey = platformName
    this.platform = new platformFactory[platformName]()
  }

  get livePlatform(): LiveControlPlatform {
    return this.platformKey
  }

  async connect(config: { headless?: boolean; storageState?: string }) {
    let storageState: StorageState | undefined

    const fromDisk = sessionStateStore.load(this.account.id)
    if (fromDisk) {
      this.logger.info('已恢复上次登录状态')
      storageState = JSON.parse(fromDisk)
    } else if (config.storageState) {
      this.logger.info('正在迁移旧版登录状态')
      storageState = JSON.parse(config.storageState)
    }

    this.browserSession = await browserManager.createSession(config.headless, storageState)

    await this.ensureAuthenticated(this.browserSession, config.headless)

    await this.persistStorageState()

    this.attachBrowserWatchers(this.browserSession)
    this.logger.success('成功与中控台建立连接')

    // 先拿到账号名再恢复任务，避免评论监听启动时主播昵称仍为空
    try {
      const accountName = await this.platform.getAccountName(this.browserSession)
      windowManager.send(IPC_CHANNELS.tasks.liveControl.notifyAccountName, {
        ok: true,
        accountId: this.account.id,
        accountName,
      })
    } catch (error) {
      this.logger.error('获取用户名失败：', error)
      windowManager.send(IPC_CHANNELS.tasks.liveControl.notifyAccountName, {
        ok: false,
        accountId: this.account.id,
      })
    }

    await this.resumeDesiredTasks()
    this.ensureLiveStartedWatch()
  }

  disconnect(reason: DisconnectReason = 'manual') {
    if (this.disconnecting) return
    this.disconnecting = true

    this.logger.warn(`与中控台断开连接（${reason}）`)
    this.detachBrowserWatchers()
    this.stopLiveEndedWatch()
    this.stopLiveStartedWatch()
    this.clearAudienceRoomCache('disconnect')
    clearOutboundComments(this.account.id)

    if (reason === 'manual' || reason === 'license') {
      this.desired.clearDesiredTasks()
    }

    const browser = this.browserSession?.browser
    this.browserSession = null

    Array.from(this.activeTasks.values()).forEach(task => {
      task.stop(TaskStopReason.SESSION)
    })
    this.activeTasks.clear()

    browser?.close().catch(e => this.logger.error('无法关闭浏览器：', e))

    windowManager.send(IPC_CHANNELS.tasks.liveControl.disconnectedEvent, {
      accountId: this.account.id,
      reason,
    })

    this.disconnecting = false
  }

  private attachBrowserWatchers(session: BrowserSession) {
    this.detachBrowserWatchers()

    this.pageCloseHandler = () => {
      emitter.emit('page-closed', { accountId: this.account.id })
    }
    session.page.on('close', this.pageCloseHandler)

    this.browserDisconnectHandler = () => {
      emitter.emit('browser-disconnected', { accountId: this.account.id })
    }
    session.browser.on('disconnected', this.browserDisconnectHandler)
  }

  private detachBrowserWatchers() {
    const session = this.browserSession
    if (session && this.pageCloseHandler) {
      session.page.off('close', this.pageCloseHandler)
    }
    if (session && this.browserDisconnectHandler) {
      session.browser.off('disconnected', this.browserDisconnectHandler)
    }
    this.pageCloseHandler = null
    this.browserDisconnectHandler = null
  }

  private async persistStorageState() {
    if (!this.browserSession) return
    const state = JSON.stringify(await this.browserSession.context.storageState())
    sessionStateStore.save(this.account.id, state)
    windowManager.send(IPC_CHANNELS.chrome.saveState, this.account.id)
  }

  private async ensureAuthenticated(session: BrowserSession, headless = true) {
    this.browserSession = session
    try {
      const isConnected = await this.platform.connect(this.browserSession)
      if (!isConnected) {
        if (headless) {
          await this.browserSession.browser.close()
          this.logger.info('需要登录，请在打开的浏览器中扫码（约 5 分钟内完成）')
          this.browserSession = await browserManager.createSession(false)
        }
        await this.platform.login(this.browserSession)
        const storageState = await this.browserSession.context.storageState()
        sessionStateStore.save(this.account.id, JSON.stringify(storageState))
        if (headless) {
          await this.browserSession.browser.close()
          this.logger.info('登录成功，浏览器将继续以无头模式运行')
          this.browserSession = await browserManager.createSession(headless, storageState)
        }
        await this.ensureAuthenticated(this.browserSession, headless)
      }
    } catch (error) {
      // 如视频号「已登录未开播」：尽量先落盘，减少下次扫码
      await this.persistStorageState().catch(() => {})
      throw error
    }
  }

  public async startTask(task: LiveControlTask): Result.ResultAsync<void, Error> {
    if (this.activeTasks.has(task.type)) {
      this.stopTask(task.type, TaskStopReason.SESSION)
    }

    const newTask = makeTask(task, this.platform, this.account, this.logger)
    if (Result.isFailure(newTask)) {
      return newTask
    }

    if (isResumableTaskType(task.type)) {
      this.desired.setDesiredTask(task)
    }

    newTask.value.addStopListener((_id, reason) => {
      this.activeTasks.delete(task.type)
      if (
        isResumableTaskType(task.type) &&
        (reason === TaskStopReason.MANUAL ||
          reason === TaskStopReason.ERROR ||
          reason === TaskStopReason.LIVE_ENDED)
      ) {
        this.desired.deleteDesiredTask(task.type)
      }
      if (reason === TaskStopReason.LIVE_ENDED) {
        this.cascadeStopOnLiveEnded(task.type)
      }
      if (!this.hasFollowLiveTasks()) {
        this.stopLiveEndedWatch()
      }
    })

    await newTask.value.start()
    this.activeTasks.set(task.type, newTask.value)
    if (isFollowLiveTaskType(task.type)) {
      this.ensureLiveEndedWatch()
    }
    return Result.succeed()
  }

  public stopTask(
    taskType: LiveControlTask['type'],
    reason: TaskStopReason = TaskStopReason.MANUAL,
  ) {
    if (isResumableTaskType(taskType) && reason === TaskStopReason.MANUAL) {
      this.desired.deleteDesiredTask(taskType)
    }
    const task = this.activeTasks.get(taskType)
    if (!task) {
      this.logger.warn('无法停止任务：未找到正在运行中的任务')
      return
    }
    task.stop(reason)
  }

  /** 跟播类任务：停播后应全部停下 */
  private hasFollowLiveTasks() {
    return FOLLOW_LIVE_TASK_TYPES.some(type => this.activeTasks.has(type))
  }

  private ensureLiveEndedWatch() {
    if (this.liveEndedWatching || !isLiveEndedWatch(this.platform)) return
    this.liveEndedWatching = true
    try {
      this.platform.startLiveEndedWatch(reason => {
        this.logger.warn(`检测到直播已结束（${reason}）`)
        this.cascadeStopOnLiveEnded(null)
      })
    } catch (error) {
      this.liveEndedWatching = false
      this.logger.error('启动停播检测失败：', error)
    }
  }

  private stopLiveEndedWatch() {
    if (!this.liveEndedWatching) return
    this.liveEndedWatching = false
    if (isLiveEndedWatch(this.platform)) {
      this.platform.stopLiveEndedWatch()
    }
  }

  /**
   * 任一跟播任务因停播停止时，级联停下其余跟播任务。
   * @param sourceType 已停的任务；null 表示由平台停播检测直接触发
   */
  private cascadeStopOnLiveEnded(sourceType: LiveControlTask['type'] | null) {
    if (this.cascadingLiveEnded) return
    this.cascadingLiveEnded = true
    try {
      for (const type of FOLLOW_LIVE_TASK_TYPES) {
        if (type === sourceType) continue
        if (this.activeTasks.has(type)) {
          this.stopTask(type, TaskStopReason.LIVE_ENDED)
        }
      }
    } finally {
      this.cascadingLiveEnded = false
      this.stopLiveEndedWatch()
      this.clearAudienceRoomCache('live_ended')
    }
  }

  /**
   * 中控连接后启动开播检测：
   * L1 = 网络/DOM 拿到本场 room_id；L2 = 解析出观众端 URL 并预热。
   */
  private ensureLiveStartedWatch() {
    if (this.liveStartedWatching) return
    if (!AUTO_ROOM_CACHE_PLATFORMS.includes(this.platformKey)) return
    if (!isAudienceRoomUrl(this.platform)) return
    if (!this.browserSession) return

    this.liveStartedWatching = true
    this.liveStartedWatcher = new DouyinLiveStartedWatcher(this.browserSession.page)
    this.liveStartedWatcher.start({
      onStarted: ref => {
        void this.onLiveStartedL1(ref)
      },
      onEnded: () => {
        this.clearAudienceRoomCache('live_ended')
      },
    })
  }

  private stopLiveStartedWatch() {
    this.liveStartedWatching = false
    this.clearResolveRetry()
    this.liveStartedWatcher?.stop()
    this.liveStartedWatcher = null
  }

  /** L1：已开播（有 room_id），立刻记缓存并尝试解析 L2 */
  private async onLiveStartedL1(ref: LiveStartedRef) {
    if (this.disconnecting) return

    const prev = audienceRoomCache.get()
    // 本场已缓存可进房链接：忽略后续旁路 room_id，避免反复清缓存/预热
    if (prev?.midAccountId === this.account.id && prev.roomUrl) {
      return
    }
    const sameRoom =
      prev?.midAccountId === this.account.id && prev.roomId === ref.roomId
    const alreadyReady = sameRoom && Boolean(prev?.roomUrl)

    audienceRoomCache.set({
      midAccountId: this.account.id,
      roomId: ref.roomId,
      secUid: ref.secUid || (sameRoom ? prev?.secUid : undefined),
      roomUrl: sameRoom ? prev?.roomUrl : undefined,
    })

    if (!sameRoom || !prev?.roomId) {
      this.logger.success(`已检测到开播（room_id=${ref.roomId}）`)
    }

    // 有互动号时立刻用 room_id 预热（不必等 L2 解析完整链接）
    if (!alreadyReady) {
      void viewerAccountManager.warmupAll({
        roomId: ref.roomId,
        secUid: ref.secUid || (sameRoom ? prev?.secUid : undefined),
        roomUrl: sameRoom ? prev?.roomUrl : undefined,
      })
    }

    if (alreadyReady) return
    await this.resolveAudienceRoomL2(ref)
  }

  /** L2：解析观众端链接 → 通知渲染进程 → 预热互动号 */
  private async resolveAudienceRoomL2(ref: LiveStartedRef) {
    if (this.resolvingAudienceRoom || this.disconnecting) return

    const cached = audienceRoomCache.get()
    if (
      cached?.midAccountId === this.account.id &&
      cached.roomId === ref.roomId &&
      cached.roomUrl
    ) {
      return
    }

    this.resolvingAudienceRoom = true
    try {
      let viewerPage: Page | null = null
      for (const session of viewerAccountManager.accountSessions.values()) {
        const page = session.getLivePage()
        if (page) {
          viewerPage = page
          break
        }
      }

      // 无互动号：不反复 resolve，提示一次后慢轮询兜底；登录事件会立刻再触发
      if (!viewerPage) {
        if (!this.waitingViewerHintShown) {
          this.waitingViewerHintShown = true
          this.logger.info('已开播，等待互动号登录后解析进房链接…')
        }
        this.scheduleResolveRetry(ref, RESOLVE_WAIT_VIEWER_MS)
        return
      }

      const result = await this.resolveAudienceRoomUrl(viewerPage, ref)
      if (Result.isFailure(result)) {
        const msg = result.error instanceof Error ? result.error.message : String(result.error)
        const needViewer = /互动号已登录|无法解析观众端/.test(msg)
        if (needViewer) {
          if (!this.waitingViewerHintShown) {
            this.waitingViewerHintShown = true
            this.logger.info('已开播，等待互动号登录后解析进房链接…')
          }
          this.scheduleResolveRetry(ref, RESOLVE_WAIT_VIEWER_MS)
        } else {
          this.logger.warn('已开播，正在解析进房链接（将重试）：', result.error)
          this.scheduleResolveRetry(ref, RESOLVE_RETRY_MS)
        }
        return
      }

      this.waitingViewerHintShown = false
      audienceRoomCache.set({
        midAccountId: this.account.id,
        roomUrl: result.value.roomUrl,
        roomId: result.value.roomId || ref.roomId,
        secUid: result.value.secUid || ref.secUid,
      })
      this.logger.success(`已自动缓存本场直播间：${result.value.roomUrl}`)
      windowManager.send(IPC_CHANNELS.tasks.viewerControl.roomReadyEvent, {
        midAccountId: this.account.id,
        roomUrl: result.value.roomUrl,
        roomId: result.value.roomId || ref.roomId,
        secUid: result.value.secUid || ref.secUid,
      })
      void viewerAccountManager.warmupAll(result.value)
    } finally {
      this.resolvingAudienceRoom = false
    }
  }

  private scheduleResolveRetry(ref: LiveStartedRef, delayMs = RESOLVE_RETRY_MS) {
    if (this.resolveRetryTimer || !this.liveStartedWatching) return
    this.resolveRetryTimer = setTimeout(() => {
      this.resolveRetryTimer = null
      if (!this.liveStartedWatching || this.disconnecting) return
      const cached = audienceRoomCache.get()
      // 以缓存为准：误判停播清缓存后不再重试；缓存仍在则继续（不依赖 watcher 瞬时状态）
      if (!cached || cached.midAccountId !== this.account.id) return
      if (cached.roomUrl) return
      if (cached.roomId && cached.roomId !== ref.roomId) return
      void this.resolveAudienceRoomL2({
        roomId: cached.roomId || ref.roomId,
        secUid: cached.secUid || ref.secUid,
      })
    }, delayMs)
  }

  /** 互动号登录后：若已有 L1（room_id）但尚无观众端链接，立刻补解析 */
  public retryAudienceRoomResolveIfNeeded() {
    if (!this.liveStartedWatching || this.disconnecting) return
    const cached = audienceRoomCache.get()
    if (!cached || cached.midAccountId !== this.account.id) return
    if (cached.roomUrl || !cached.roomId) return
    this.clearResolveRetry()
    void this.resolveAudienceRoomL2({
      roomId: cached.roomId,
      secUid: cached.secUid,
    })
  }

  private clearResolveRetry() {
    if (this.resolveRetryTimer) {
      clearTimeout(this.resolveRetryTimer)
      this.resolveRetryTimer = null
    }
  }

  private clearAudienceRoomCache(reason: 'disconnect' | 'live_ended') {
    this.clearResolveRetry()
    this.waitingViewerHintShown = false
    const had = audienceRoomCache.get()?.midAccountId === this.account.id
    audienceRoomCache.clear(this.account.id)
    if (had) {
      windowManager.send(IPC_CHANNELS.tasks.viewerControl.roomClearedEvent, {
        midAccountId: this.account.id,
      })
      if (reason === 'live_ended') {
        this.logger.info('直播已结束，已清除缓存的直播间链接')
      }
    }
  }

  public updateTaskConfig<T extends LiveControlTask>(
    type: T['type'],
    config: Partial<T['config']>,
  ): Result.Result<void, Error> {
    const task = this.activeTasks.get(type)
    if (task?.updateConfig) {
      const result = task.updateConfig(config)
      if (Result.isSuccess(result) && isResumableTaskType(type)) {
        const current = this.desired.getDesiredTasks().find(t => t.type === type)
        if (current) {
          this.desired.setDesiredTask({
            ...current,
            config: { ...current.config, ...config },
          } as LiveControlTask)
        }
      }
      return result
    }
    return Result.fail(new TaskNotSupportedError({ taskName: `update-${type}` }))
  }

  /**
   * 从中控台解析观众端本场直播间链接（小号互动进房用）。
   * @param viewerPage 互动号浏览器页；中控只有内部 room_id 时用其转换 web_rid
   */
  public async resolveAudienceRoomUrl(
    viewerPage?: Page | null,
    known?: { roomId?: string; secUid?: string },
  ): Result.ResultAsync<ResolvedAudienceRoomUrl, Error> {
    if (!this.browserSession) {
      return Result.fail(new Error('请先连接中控台'))
    }
    if (!isAudienceRoomUrl(this.platform)) {
      return Result.fail(
        new Error(`「${this.platform.platformName}」暂不支持从中控同步直播间链接`),
      )
    }
    try {
      const resolved = await this.platform.resolveAudienceRoomUrl(viewerPage, known)
      return Result.succeed(resolved)
    } catch (error) {
      return Result.fail(error instanceof Error ? error : new Error(String(error)))
    }
  }

  public async listGoodsIds(): Result.ResultAsync<number[], Error> {
    if (!isPerformPopup(this.platform) || !this.platform.listGoodsIds) {
      return Result.fail(new TaskNotSupportedError({ taskName: 'list-goods-ids' }))
    }
    return this.platform.listGoodsIds()
  }

  public async popupOnce(goodsId: number): Result.ResultAsync<void, Error> {
    return performPopupOnce(this.platform, goodsId, this.logger)
  }

  /**
   * 发送单条公屏评论（自动回复等）。
   * 与任务型 send-batch 分离，并按账号串行，避免连发互相掐断且能如实回传成败。
   */
  public async performCommentOnce(message: string): Result.ResultAsync<boolean, Error> {
    if (!message.trim()) {
      return Result.fail(new UnexpectedError({ description: '回复内容为空' }))
    }
    if (!isPerformComment(this.platform)) {
      return Result.fail(
        new TaskNotSupportedError({
          taskName: 'send-comment',
          targetName: this.platform.platformName,
        }),
      )
    }
    const platform = this.platform
    const accountId = this.account.id
    const run = async (): Promise<Result.Result<boolean, Error>> => {
      rememberOutboundComment(accountId, message)
      const result = await platform.performComment(message)
      if (Result.isFailure(result)) {
        forgetOutboundComment(accountId, message)
      }
      return result
    }
    const done = this.commentSendChain.then(run, run)
    this.commentSendChain = done.then(
      () => undefined,
      () => undefined,
    )
    return done
  }

  private async resumeDesiredTasks() {
    const snapshot = this.desired.getDesiredTasks()
    if (snapshot.length === 0) return

    const resumed: ResumableTaskType[] = []
    for (const task of snapshot) {
      if (!isResumableTaskType(task.type)) continue
      const result = await this.startTask(task)
      if (Result.isSuccess(result)) {
        resumed.push(task.type)
        this.logger.success(`已恢复任务：${task.type}`)
      } else {
        this.logger.error(`恢复任务失败（${task.type}）：`, result.error)
        this.desired.deleteDesiredTask(task.type)
      }
    }

    if (resumed.length > 0) {
      windowManager.send(IPC_CHANNELS.tasks.liveControl.tasksResumedEvent, {
        accountId: this.account.id,
        tasks: resumed,
      })
    }
  }
}

function makeTask<T extends LiveControlTask>(
  task: T,
  platform: IPlatform,
  account: Account,
  logger: ReturnType<typeof createLogger>,
): Result.Result<ITask, Error> {
  if (task.type === 'auto-popup' && isPerformPopup(platform)) {
    return createAutoPopupTask(platform, task.config, account, logger)
  }
  if (task.type === 'auto-comment' && isPerformComment(platform)) {
    return createAutoCommentTask(platform, task.config, account, logger)
  }
  if (task.type === 'send-batch-messages' && isPerformComment(platform)) {
    return createSendBatchMessageTask(platform, task.config, account, logger)
  }
  if (task.type === 'comment-listener' && isCommentListener(platform)) {
    return createCommentListenerTask(platform, task.config, account, logger)
  }
  return Result.fail(
    new TaskNotSupportedError({
      taskName: task.type,
      targetName: platform.platformName,
    }),
  )
}

const FOLLOW_LIVE_TASK_TYPES = ['auto-comment', 'auto-popup', 'comment-listener'] as const

function isFollowLiveTaskType(
  type: LiveControlTask['type'],
): type is (typeof FOLLOW_LIVE_TASK_TYPES)[number] {
  return (FOLLOW_LIVE_TASK_TYPES as readonly string[]).includes(type)
}
