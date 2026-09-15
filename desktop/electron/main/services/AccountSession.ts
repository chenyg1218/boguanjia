import { Result } from '@praha/byethrow'
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
import { platformFactory } from '#/platforms'
import {
  type IPlatform,
  isCommentListener,
  isPerformComment,
  isPerformPopup,
} from '#/platforms/IPlatform'
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

  constructor(
    platformName: LiveControlPlatform,
    private account: Account,
    private desired: DesiredTaskStore,
    private logger = createLogger(`@${account.name}`),
  ) {
    this.platform = new platformFactory[platformName]()
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
      })
    }

    await this.resumeDesiredTasks()
  }

  disconnect(reason: DisconnectReason = 'manual') {
    if (this.disconnecting) return
    this.disconnecting = true

    this.logger.warn(`与中控台断开连接（${reason}）`)
    this.detachBrowserWatchers()
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
        (reason === TaskStopReason.MANUAL || reason === TaskStopReason.ERROR)
      ) {
        this.desired.deleteDesiredTask(task.type)
      }
    })

    await newTask.value.start()
    this.activeTasks.set(task.type, newTask.value)
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
