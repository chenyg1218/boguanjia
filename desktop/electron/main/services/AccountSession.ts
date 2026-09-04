import { Result } from '@praha/byethrow'
import { IPC_CHANNELS } from 'shared/ipcChannels'
import { TaskNotSupportedError } from '#/errors/AppError'
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
import { sessionStateStore } from '#/services/SessionStateStore'
import { createAutoCommentTask } from '#/tasks/AutoCommentTask'
import { createAutoPopupTask } from '#/tasks/AutoPopupTask'
import { createCommentListenerTask } from '#/tasks/CommentListenerTask'
import type { ITask } from '#/tasks/ITask'
import { createSendBatchMessageTask } from '#/tasks/SendBatchMessageTask'
import windowManager from '#/windowManager'

export class AccountSession {
  private platform: IPlatform
  private browserSession: BrowserSession | null = null
  private activeTasks: Map<LiveControlTask['type'], ITask> = new Map()

  constructor(
    platformName: LiveControlPlatform,
    private account: Account,
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

    // 此时可以确保正在中控台页面，获取用户名
    this.platform
      .getAccountName(this.browserSession)
      .then(accountName => {
        windowManager.send(IPC_CHANNELS.tasks.liveControl.notifyAccountName, {
          ok: true,
          accountId: this.account.id,
          accountName,
        })
      })
      .catch(error => {
        this.logger.error('获取用户名失败：', error)
        windowManager.send(IPC_CHANNELS.tasks.liveControl.notifyAccountName, {
          ok: false,
        })
      })

    this.browserSession.page.on('close', () => {
      emitter.emit('page-closed', { accountId: this.account.id })
    })
    this.logger.success('成功与中控台建立连接')
  }

  disconnect() {
    this.logger.warn('与中控台断开连接')
    this.browserSession?.browser.close().catch(e => this.logger.error('无法关闭浏览器：', e))
    Array.from(this.activeTasks.values()).forEach(task => {
      task.stop()
    })
    this.activeTasks.clear()
    windowManager.send(IPC_CHANNELS.tasks.liveControl.disconnectedEvent, this.account.id)
  }

  private async persistStorageState() {
    if (!this.browserSession) return
    const state = JSON.stringify(await this.browserSession.context.storageState())
    sessionStateStore.save(this.account.id, state)
    windowManager.send(IPC_CHANNELS.chrome.saveState, this.account.id)
  }

  private async ensureAuthenticated(session: BrowserSession, headless = true) {
    this.browserSession = session
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
  }

  public async startTask(task: LiveControlTask): Result.ResultAsync<void, Error> {
    const newTask = makeTask(task, this.platform, this.account, this.logger)
    if (Result.isFailure(newTask)) {
      return newTask
    }
    newTask.value.addStopListener(() => {
      this.activeTasks.delete(task.type)
    })
    await newTask.value.start()
    this.activeTasks.set(task.type, newTask.value)
    return Result.succeed()
  }

  public stopTask(taskType: LiveControlTask['type']) {
    const task = this.activeTasks.get(taskType)
    if (task) {
      task.stop()
    } else {
      this.logger.warn('无法停止任务：未找到正在运行中的任务')
    }
  }

  public updateTaskConfig<T extends LiveControlTask>(
    type: T['type'],
    config: Partial<T['config']>,
  ): Result.Result<void, Error> {
    const task = this.activeTasks.get(type)
    if (task?.updateConfig) {
      return task.updateConfig(config)
    }
    return Result.fail(new TaskNotSupportedError({ taskName: `update-${type}` }))
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
    return createSendBatchMessageTask(platform, task.config, logger)
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
