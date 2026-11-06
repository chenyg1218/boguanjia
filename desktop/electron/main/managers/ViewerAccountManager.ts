import { Result } from '@praha/byethrow'
import { ErrorFactory } from '@praha/error-factory'
import type { DisconnectReason } from 'shared/session'
import { emitter } from '#/event/eventBus'
import { createLogger } from '#/logger'
import { ViewerAccountSession } from '#/services/ViewerAccountSession'
import { TaskStopReason } from '#/tasks/ITask'

class ViewerAccountNotFoundError extends ErrorFactory({
  name: 'ViewerAccountNotFoundError',
  message: '互动号未连接，请先登录并进入直播间',
}) {}

export class ViewerAccountManager {
  accountSessions: Map<string, ViewerAccountSession> = new Map()
  accountNames: Map<string, string> = new Map()
  private logger = createLogger('互动号管理')

  constructor() {
    const unexpectedClose = ({ accountId }: { accountId: string }) => {
      this.closeSession(accountId, 'unexpected')
    }
    emitter.on('viewer-page-closed', unexpectedClose)
    emitter.on('viewer-browser-disconnected', unexpectedClose)
  }

  async createSession(account: ViewerAccount) {
    this.setAccountName(account.id, account.name)
    const exist = this.accountSessions.get(account.id)
    if (exist) {
      this.logger.warn('检测到已连接的互动号，将先断开再重连')
      await exist.disconnect('manual')
      this.accountSessions.delete(account.id)
    }
    const session = new ViewerAccountSession(account)
    this.accountSessions.set(account.id, session)
    return session
  }

  getSession(accountId: string): Result.Result<ViewerAccountSession, Error> {
    const session = this.accountSessions.get(accountId)
    if (!session) return Result.fail(new ViewerAccountNotFoundError())
    return Result.succeed(session)
  }

  setAccountName(accountId: string, name: string) {
    this.accountNames.set(accountId, name)
  }

  getAccountName(accountId: string) {
    return this.accountNames.get(accountId) ?? '未命名互动号'
  }

  connectedCount() {
    return this.accountSessions.size
  }

  async closeSession(accountId: string, reason: DisconnectReason = 'manual') {
    const session = this.accountSessions.get(accountId)
    if (!session) return
    // 先从 map 移除，避免 disconnect 触发的事件再次进入 closeSession
    this.accountSessions.delete(accountId)
    await session.disconnect(reason)
  }

  stopAllDanmaku() {
    for (const session of this.accountSessions.values()) {
      // 同时取消「进房等待」与已在跑的弹幕任务
      session.stopDanmaku(TaskStopReason.MANUAL)
    }
  }

  /** 开播后预热：已登录互动号提前打开本场链接，缩短「开始任务」进房时间 */
  warmupAll(entry: { roomUrl?: string; roomId?: string; secUid?: string }) {
    if (!entry.roomUrl?.trim() && !entry.roomId?.trim()) return
    for (const session of this.accountSessions.values()) {
      void session.warmupRoom(entry)
    }
  }

  cleanup() {
    ;[...this.accountSessions.keys()].forEach(id => {
      void this.closeSession(id, 'manual')
    })
  }
}

export const viewerAccountManager = new ViewerAccountManager()
