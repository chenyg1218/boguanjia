import { Result } from '@praha/byethrow'
import { IPC_CHANNELS } from 'shared/ipcChannels'
import type { DisconnectReason } from 'shared/session'
import { AbortError, TaskNotSupportedError } from '#/errors/AppError'
import { emitter } from '#/event/eventBus'
import { createLogger } from '#/logger'
import {
  type BrowserSession,
  browserManager,
  type StorageState,
} from '#/managers/BrowserSessionManager'
import { viewerAccountManager } from '#/managers/ViewerAccountManager'
import { createViewerPlatform, type GenericViewerPlatform } from '#/platforms/viewer'
import { isPerformComment } from '#/platforms/IPlatform'
import { audienceRoomCache } from '#/services/AudienceRoomCache'
import { sessionStateStore } from '#/services/SessionStateStore'
import type { ITask } from '#/tasks/ITask'
import { TaskStopReason } from '#/tasks/ITask'
import { createViewerDanmakuTask } from '#/tasks/ViewerDanmakuTask'
import windowManager from '#/windowManager'

const TASK_TYPE = 'viewer-danmaku' as const

type PersistedViewerState = {
  storageState?: StorageState
  roomUrl?: string
}

function isTargetClosedError(error: unknown): boolean {
  const msg = error instanceof Error ? error.message : String(error)
  return /has been closed|Target closed|browser.*closed|浏览器被关闭|浏览器未就绪/i.test(msg)
}

/** 互动号会话存储键，避免与中控账号 id 冲突 */
export function viewerSessionKey(accountId: string) {
  return `viewer_${accountId}`
}

/**
 * 真人小号会话：观众端登录 → 用户进直播间 → 定时弹幕。
 * 与中控 AccountSession 平行，不共享任务与平台适配。
 */
export class ViewerAccountSession {
  private platform: GenericViewerPlatform
  private browserSession: BrowserSession | null = null
  private danmakuTask: ITask | null = null
  private disconnecting = false
  private connecting = false
  private connectGen = 0
  private pageCloseHandler: (() => void) | null = null
  private browserDisconnectHandler: (() => void) | null = null
  private roomUrl = ''
  /** 进房等待可取消 */
  private enterRoomAbort: AbortController | null = null

  constructor(
    private account: ViewerAccount,
    private logger = createLogger(`@互动/${account.name}`),
  ) {
    this.platform = createViewerPlatform(account.platform || 'douyin')
  }

  async connect(config: {
    headless?: boolean
    roomUrl?: string
    /** 仅用已保存登录态恢复；失效则失败，不弹扫码窗 */
    restoreOnly?: boolean
  }) {
    if (this.connecting) {
      throw new Error('该互动号正在连接中，请稍候')
    }
    this.connecting = true
    const gen = ++this.connectGen
    const headless = config.headless ?? false
    const restoreOnly = Boolean(config.restoreOnly)

    try {
      const persisted = this.loadPersistedState()
      if (restoreOnly && !persisted.storageState) {
        throw new Error('无已保存的互动号登录态')
      }
      const roomUrl = config.roomUrl?.trim() || persisted.roomUrl
      if (roomUrl) {
        // 用户显式填写的链接必须通过平台校验（首页不算直播间）
        this.platform.setRoomUrl(roomUrl, Boolean(config.roomUrl?.trim()))
        this.roomUrl = this.platform.getRoomUrl() || roomUrl
      }
      const storageState = persisted.storageState

      let lastError: unknown
      for (let attempt = 0; attempt < 2; attempt++) {
        if (gen !== this.connectGen) {
          throw new Error('连接已取消')
        }
        try {
          if (attempt > 0) {
            this.logger.warn('浏览器异常关闭，正在自动重试…')
            await this.closeBrowserQuietly()
          }
          this.browserSession = await browserManager.createSession(
            headless,
            attempt === 0 ? storageState : undefined,
          )
          await this.ensureAuthenticated(this.browserSession, headless, restoreOnly)
          if (gen !== this.connectGen) {
            throw new Error('连接已取消')
          }
          this.attachBrowserWatchers(this.browserSession, gen)
          await this.persistStorageState()
          this.logger.success(
            restoreOnly
              ? '互动号已自动恢复登录'
              : '互动号已登录（进房将在开始任务时进行）',
          )

          // 通知中控：若已有 L1 可立即补解析；若已有 L2 则本号预热进房
          emitter.emit('viewer-logged-in', { accountId: this.account.id })
          const cached = audienceRoomCache.get()
          if (cached?.roomUrl || cached?.roomId) {
            void this.warmupRoom(cached)
          }

          try {
            const accountName = await this.platform.getAccountName(this.browserSession)
            if (accountName && accountName !== '观众号') {
              viewerAccountManager.setAccountName(this.account.id, accountName)
            }
            windowManager.send(IPC_CHANNELS.tasks.viewerControl.notifyAccountName, {
              ok: true,
              accountId: this.account.id,
              accountName,
            })
          } catch (error) {
            this.logger.error('获取互动号昵称失败：', error)
            windowManager.send(IPC_CHANNELS.tasks.viewerControl.notifyAccountName, { ok: false })
          }
          return
        } catch (error) {
          lastError = error
          if (!isTargetClosedError(error) || attempt >= 1) {
            throw error
          }
        }
      }
      throw lastError
    } finally {
      this.connecting = false
    }
  }

  async disconnect(reason: DisconnectReason = 'manual') {
    if (this.disconnecting) return
    this.disconnecting = true
    this.connectGen++
    this.logger.warn(`互动号断开（${reason}）`)
    this.detachBrowserWatchers()
    this.stopDanmaku(TaskStopReason.SESSION)

    const browser = this.browserSession?.browser
    this.browserSession = null
    if (browser) {
      await browser.close().catch(e => this.logger.error('无法关闭浏览器：', e))
    }

    windowManager.send(IPC_CHANNELS.tasks.viewerControl.disconnectedEvent, {
      accountId: this.account.id,
      reason,
    })
    this.disconnecting = false
  }

  startDanmaku(
    config: ViewerDanmakuConfig,
    options?: { roomUrl?: string; roomId?: string; secUid?: string },
  ): Result.ResultAsync<void, Error> {
    return this._startDanmaku(config, options)
  }

  private async _startDanmaku(
    config: ViewerDanmakuConfig,
    options?: { roomUrl?: string; roomId?: string; secUid?: string },
  ): Result.ResultAsync<void, Error> {
    if (!this.browserSession) {
      return Result.fail(new TaskNotSupportedError({ taskName: TASK_TYPE }))
    }
    if (!isPerformComment(this.platform)) {
      return Result.fail(new TaskNotSupportedError({ taskName: TASK_TYPE }))
    }
    if (this.danmakuTask) {
      this.stopDanmaku(TaskStopReason.SESSION)
    }

    // 主进程缓存优先，避免渲染进程/本地残留的过期 roomId 进错房或卡加载
    const cached = audienceRoomCache.get()
    const roomUrl = (cached?.roomUrl || options?.roomUrl)?.trim()
    const roomId = (cached?.roomId || options?.roomId)?.trim()
    const secUid = (cached?.secUid || options?.secUid)?.trim()
    if (roomUrl || roomId) {
      try {
        this.platform.setRoomEntry(
          { roomUrl, roomId, secUid },
          Boolean(roomUrl),
        )
        this.roomUrl = this.platform.getRoomUrl() || roomUrl || this.roomUrl
      } catch (error) {
        return Result.fail(error instanceof Error ? error : new Error(String(error)))
      }
    }

    this.enterRoomAbort?.abort()
    this.enterRoomAbort = new AbortController()
    const signal = this.enterRoomAbort.signal

    // 中控开播后开始任务时再进房（优先用中控同步的链接自动打开）
    try {
      await this.platform.ensureInRoom(
        this.browserSession,
        message => {
          this.emitProgress('waiting_room', message)
        },
        signal,
      )
      this.syncRoomUrlFromPlatform()
      await this.persistStorageState()
    } catch (error) {
      if (error instanceof AbortError || signal.aborted) {
        return Result.fail(new AbortError())
      }
      return Result.fail(error instanceof Error ? error : new Error(String(error)))
    } finally {
      if (this.enterRoomAbort?.signal === signal) {
        this.enterRoomAbort = null
      }
    }

    if (signal.aborted) {
      return Result.fail(new AbortError())
    }

    const created = createViewerDanmakuTask(this.platform, config, this.account, this.logger)
    if (Result.isFailure(created)) return created

    created.value.addStopListener(() => {
      this.danmakuTask = null
    })
    await created.value.start()
    this.danmakuTask = created.value
    return Result.succeed()
  }

  stopDanmaku(reason: TaskStopReason = TaskStopReason.MANUAL) {
    this.enterRoomAbort?.abort()
    this.enterRoomAbort = null
    if (!this.danmakuTask) return
    this.danmakuTask.stop(reason)
    this.danmakuTask = null
  }

  updateDanmakuConfig(config: Partial<ViewerDanmakuConfig>): Result.Result<void, Error> {
    if (!this.danmakuTask?.updateConfig) {
      return Result.fail(new TaskNotSupportedError({ taskName: `update-${TASK_TYPE}` }))
    }
    return this.danmakuTask.updateConfig(config)
  }

  isConnected() {
    return Boolean(this.browserSession)
  }

  isConnecting() {
    return this.connecting
  }

  /** 供中控 room_id → web_rid 转换使用的观众站页面 */
  getLivePage() {
    const page = this.browserSession?.page
    if (!page || page.isClosed()) return null
    return page
  }

  /**
   * 开播后预热：有 roomId 时优先 reflow（不等评论框）。
   * 若正在进房/发评则跳过，避免与开始任务抢页面。
   */
  async warmupRoom(entry: { roomUrl?: string; roomId?: string; secUid?: string }) {
    if (!this.browserSession || this.disconnecting) return
    if (this.danmakuTask || this.enterRoomAbort || this.connecting) return
    const roomUrl = entry.roomUrl?.trim()
    const roomId = entry.roomId?.trim()
    if (!roomUrl && !roomId) return

    try {
      this.platform.setRoomEntry(
        { roomUrl, roomId, secUid: entry.secUid?.trim() },
        Boolean(roomUrl),
      )
      await this.platform.warmupOpenRoom(this.browserSession, msg => {
        this.emitProgress('waiting_room', msg)
      })
      this.syncRoomUrlFromPlatform()
    } catch (error) {
      this.logger.warn('预热进房失败（开始任务时会重试）：', error)
    }
  }

  private attachBrowserWatchers(session: BrowserSession, gen: number) {
    this.detachBrowserWatchers()
    this.pageCloseHandler = () => {
      if (gen !== this.connectGen) return
      emitter.emit('viewer-page-closed', { accountId: this.account.id })
    }
    session.page.on('close', this.pageCloseHandler)
    this.browserDisconnectHandler = () => {
      if (gen !== this.connectGen) return
      emitter.emit('viewer-browser-disconnected', { accountId: this.account.id })
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

  private async closeBrowserQuietly() {
    this.detachBrowserWatchers()
    const browser = this.browserSession?.browser
    this.browserSession = null
    if (browser?.isConnected()) {
      await browser.close().catch(() => undefined)
    }
  }

  private loadPersistedState(): PersistedViewerState {
    const fromDisk = sessionStateStore.load(viewerSessionKey(this.account.id))
    if (!fromDisk) return {}
    try {
      const parsed = JSON.parse(fromDisk) as PersistedViewerState | StorageState
      // 兼容旧格式：整段即为 Playwright storageState
      if (parsed && typeof parsed === 'object' && 'cookies' in parsed) {
        this.logger.info('已恢复互动号登录状态')
        return { storageState: parsed as StorageState }
      }
      const wrapped = parsed as PersistedViewerState
      if (wrapped.storageState || wrapped.roomUrl) {
        this.logger.info('已恢复互动号登录状态')
      }
      return {
        storageState: wrapped.storageState,
        roomUrl: typeof wrapped.roomUrl === 'string' ? wrapped.roomUrl : undefined,
      }
    } catch {
      this.logger.warn('互动号登录状态损坏，将重新登录')
      return {}
    }
  }

  private async persistStorageState() {
    if (!this.browserSession) return
    this.syncRoomUrlFromPlatform()
    const storageState = await this.browserSession.context.storageState()
    const payload: PersistedViewerState = {
      storageState,
      roomUrl: this.roomUrl || undefined,
    }
    sessionStateStore.save(viewerSessionKey(this.account.id), JSON.stringify(payload))
  }

  private syncRoomUrlFromPlatform() {
    const url = this.platform.getRoomUrl()
    if (url) this.roomUrl = url
  }

  private emitProgress(phase: 'waiting_login' | 'waiting_room', message: string) {
    this.logger.info(message)
    windowManager.send(IPC_CHANNELS.tasks.viewerControl.progressEvent, {
      accountId: this.account.id,
      phase,
      message,
    })
  }

  private async ensureAuthenticated(
    session: BrowserSession,
    headless = false,
    restoreOnly = false,
  ) {
    this.browserSession = session
    if (this.roomUrl) this.platform.setRoomUrl(this.roomUrl)

    const isLoggedIn = await this.platform.connect(this.browserSession)
    if (!isLoggedIn) {
      if (restoreOnly) {
        throw new Error('互动号登录已失效，请打开「小号互动」重新扫码登录')
      }
      if (headless) {
        await this.browserSession.browser.close()
        this.emitProgress('waiting_login', '请在打开的浏览器中扫码登录（约 5 分钟内完成）')
        this.browserSession = await browserManager.createSession(false)
      } else {
        this.emitProgress('waiting_login', '请在弹出的浏览器中扫码登录')
      }
      await this.platform.login(this.browserSession, (phase, message) => {
        this.emitProgress(phase, message)
      })
      const storageState = await this.browserSession.context.storageState()
      sessionStateStore.save(
        viewerSessionKey(this.account.id),
        JSON.stringify({
          storageState,
          roomUrl: this.roomUrl || undefined,
        } satisfies PersistedViewerState),
      )
      if (headless && this.roomUrl) {
        await this.browserSession.browser.close()
        this.logger.info('登录成功，浏览器将继续以无头模式运行')
        this.browserSession = await browserManager.createSession(headless, storageState)
        this.platform.setRoomUrl(this.roomUrl)
        await this.ensureAuthenticated(this.browserSession, headless, false)
      }
    }
  }
}
