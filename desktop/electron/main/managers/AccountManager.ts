import { Result } from '@praha/byethrow'
import { ErrorFactory } from '@praha/error-factory'
import type { DisconnectReason, ResumableTaskType } from 'shared/session'
import { isResumableTaskType } from 'shared/session'
import { emitter } from '#/event/eventBus'
import { createLogger } from '#/logger'
import { AccountSession } from '#/services/AccountSession'

class AccountNotFoundError extends ErrorFactory({
  name: 'AccountNotFoundError',
  message: '账号不存在，请先连接中控台',
}) {}

export class AccountManager {
  accountSessions: Map<string, AccountSession> = new Map()
  accountNames: Map<string, string> = new Map()
  /** 跨会话保留：异常断连后仍要恢复的任务意图 */
  private desiredTasksByAccount = new Map<string, Map<ResumableTaskType, LiveControlTask>>()
  private logger = createLogger('账号管理')

  constructor() {
    const unexpectedClose = ({ accountId }: { accountId: string }) => {
      this.closeSession(accountId, 'unexpected')
    }
    emitter.on('page-closed', unexpectedClose)
    emitter.on('browser-disconnected', unexpectedClose)
    emitter.on('viewer-logged-in', () => {
      this.retryPendingAudienceRoomResolve()
    })
  }

  /** 互动号已登录且中控仅有 L1（room_id）时，补解析观众端链接 */
  retryPendingAudienceRoomResolve() {
    for (const session of this.accountSessions.values()) {
      session.retryAudienceRoomResolveIfNeeded()
    }
  }

  createSession(platformName: LiveControlPlatform, account: Account) {
    this.setAccountName(account.id, account.name)
    const existSession = this.accountSessions.get(account.id)
    if (existSession) {
      this.logger.warn('检测到已存在建立的连接，将关闭已建立的连接')
      // 用户主动重新连接：清空旧意图，避免误恢复
      existSession.disconnect('manual')
      this.clearDesiredTasks(account.id)
      this.accountSessions.delete(account.id)
    }

    const accountSession = new AccountSession(platformName, account, {
      getDesiredTasks: () => this.getDesiredTasks(account.id),
      setDesiredTask: task => this.setDesiredTask(account.id, task),
      deleteDesiredTask: type => this.deleteDesiredTask(account.id, type),
      clearDesiredTasks: () => this.clearDesiredTasks(account.id),
    })
    this.accountSessions.set(account.id, accountSession)
    return accountSession
  }

  getSession(accountId: string): Result.Result<AccountSession, Error> {
    const accountSession = this.accountSessions.get(accountId)
    if (!accountSession) {
      return Result.fail(new AccountNotFoundError())
    }
    return Result.succeed(accountSession)
  }

  setAccountName(accountId: string, accountName: string) {
    this.accountNames.set(accountId, accountName)
  }

  getAccountName(accountId: string) {
    return this.accountNames.get(accountId) ?? '未定义账号'
  }

  /** 当前仍持有中控浏览器会话的账号列表 */
  listConnected(): Array<{ accountId: string; accountName: string }> {
    return [...this.accountSessions.keys()].map(accountId => ({
      accountId,
      accountName: this.getAccountName(accountId),
    }))
  }

  closeSession(accountId: string, reason: DisconnectReason = 'manual') {
    const accountSession = this.accountSessions.get(accountId)
    if (!accountSession) return

    accountSession.disconnect(reason)
    if (reason === 'manual' || reason === 'license') {
      this.clearDesiredTasks(accountId)
    }
    this.accountSessions.delete(accountId)
  }

  cleanup() {
    ;[...this.accountSessions.keys()].forEach(id => {
      this.closeSession(id, 'manual')
    })
  }

  getDesiredTasks(accountId: string): LiveControlTask[] {
    return [...(this.desiredTasksByAccount.get(accountId)?.values() ?? [])]
  }

  setDesiredTask(accountId: string, task: LiveControlTask) {
    if (!isResumableTaskType(task.type)) return
    let map = this.desiredTasksByAccount.get(accountId)
    if (!map) {
      map = new Map()
      this.desiredTasksByAccount.set(accountId, map)
    }
    map.set(task.type, {
      type: task.type,
      config: structuredClone(task.config),
    } as LiveControlTask)
  }

  deleteDesiredTask(accountId: string, type: ResumableTaskType) {
    this.desiredTasksByAccount.get(accountId)?.delete(type)
  }

  clearDesiredTasks(accountId: string) {
    this.desiredTasksByAccount.delete(accountId)
  }
}

export const accountManager = new AccountManager()
