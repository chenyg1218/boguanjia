import { Result } from '@praha/byethrow'
import type { Page } from 'playwright'
import { maxViewerAccountsForPlan } from 'shared/licensePlan'
import { IPC_CHANNELS } from 'shared/ipcChannels'
import { createLogger } from '#/logger'
import { accountManager } from '#/managers/AccountManager'
import { browserManager } from '#/managers/BrowserSessionManager'
import { viewerAccountManager } from '#/managers/ViewerAccountManager'
import { audienceRoomCache } from '#/services/AudienceRoomCache'
import { licenseService } from '#/services/LicenseService'
import { sessionStateStore } from '#/services/SessionStateStore'
import { viewerSessionKey } from '#/services/ViewerAccountSession'
import { friendlyError, typedIpcMainHandle } from '#/utils'
import windowManager from '#/windowManager'

const TASK_NAME = '互动号'

function setupIpcHandlers() {
  typedIpcMainHandle(
    IPC_CHANNELS.tasks.viewerControl.connect,
    async (_, { chromePath, headless, account, roomUrl }) => {
      try {
        const plan = licenseService.status().plan
        const max = maxViewerAccountsForPlan(plan)
        const already = viewerAccountManager.accountSessions.has(account.id)
        if (!already && max >= 0 && viewerAccountManager.connectedCount() >= max) {
          return {
            ok: false,
            error: `当前档位最多同时连接 ${max} 个互动号，请先断开其他号或升级会员`,
          }
        }
        if (chromePath) {
          browserManager.setChromePath(chromePath)
        }
        const session = await viewerAccountManager.createSession(account)
        await session.connect({ headless, roomUrl })
        return { ok: true }
      } catch (error) {
        const logger = createLogger(`@互动/${account.name}`).scope(TASK_NAME)
        logger.error('连接互动号失败：', error)
        await viewerAccountManager.closeSession(account.id, 'manual')
        return {
          ok: false,
          error: friendlyError(error, '连接互动号失败，请查看运行日志后重试'),
        }
      }
    },
  )

  typedIpcMainHandle(IPC_CHANNELS.tasks.viewerControl.disconnect, async (_, accountId) => {
    try {
      await viewerAccountManager.closeSession(accountId, 'manual')
      return { ok: true }
    } catch (error) {
      const logger = createLogger(
        `@互动/${viewerAccountManager.getAccountName(accountId)}`,
      ).scope(TASK_NAME)
      logger.error('断开互动号失败：', error)
      return { ok: false, error: friendlyError(error, '断开互动号失败') }
    }
  })

  typedIpcMainHandle(IPC_CHANNELS.tasks.viewerControl.listConnected, async () => {
    return [...viewerAccountManager.accountSessions.entries()].map(([accountId]) => ({
      accountId,
      accountName: viewerAccountManager.getAccountName(accountId),
    }))
  })

  typedIpcMainHandle(
    IPC_CHANNELS.tasks.viewerControl.autoReconnect,
    async (_, { chromePath, headless, accounts }) => {
      if (chromePath) {
        browserManager.setChromePath(chromePath)
      }
      const plan = licenseService.status().plan
      const max = maxViewerAccountsForPlan(plan)
      const results: Array<{ accountId: string; ok: boolean; skipped?: boolean }> = []

      for (const account of accounts) {
        if (viewerAccountManager.accountSessions.has(account.id)) {
          results.push({ accountId: account.id, ok: true })
          continue
        }
        if (!sessionStateStore.exists(viewerSessionKey(account.id))) {
          results.push({ accountId: account.id, ok: false, skipped: true })
          continue
        }
        if (max >= 0 && viewerAccountManager.connectedCount() >= max) {
          results.push({ accountId: account.id, ok: false, skipped: true })
          continue
        }
        const logger = createLogger(`@互动/${account.name}`).scope(TASK_NAME)
        try {
          const session = await viewerAccountManager.createSession(account)
          await session.connect({ headless, restoreOnly: true })
          results.push({ accountId: account.id, ok: true })
        } catch (error) {
          await viewerAccountManager.closeSession(account.id, 'manual')
          logger.info(
            '后台恢复互动号跳过：',
            error instanceof Error ? error.message : String(error),
          )
          results.push({ accountId: account.id, ok: false })
        }
      }
      return results
    },
  )

  typedIpcMainHandle(IPC_CHANNELS.tasks.viewerControl.getCachedRoom, async () => {
    const cached = audienceRoomCache.get()
    if (!cached?.roomUrl) return { ok: false as const }
    return {
      ok: true as const,
      midAccountId: cached.midAccountId,
      roomUrl: cached.roomUrl,
      roomId: cached.roomId,
      secUid: cached.secUid,
    }
  })

  typedIpcMainHandle(
    IPC_CHANNELS.tasks.viewerControl.resolveRoomUrl,
    async (_, midAccountId, viewerAccountId) => {
      const logger = createLogger(
        `@${accountManager.getAccountName(midAccountId)}`,
      ).scope('同步直播间')

      // 优先用指定互动号；否则取任意已连接号，用观众站 cookie 把 room_id 转成 web_rid
      let livePage: Page | null = null
      if (viewerAccountId) {
        const specified = viewerAccountManager.getSession(viewerAccountId)
        if (Result.isSuccess(specified)) {
          livePage = specified.value.getLivePage()
        }
      }
      if (!livePage) {
        for (const session of viewerAccountManager.accountSessions.values()) {
          const page = session.getLivePage()
          if (page) {
            livePage = page
            break
          }
        }
      }

      const result = await Result.pipe(
        accountManager.getSession(midAccountId),
        Result.andThen(session => session.resolveAudienceRoomUrl(livePage)),
      )
      if (Result.isFailure(result)) {
        logger.error('从中控同步直播间链接失败：', result.error)
        return {
          ok: false as const,
          error: friendlyError(result.error, '无法从中控台获取直播间链接，请确认已开播'),
        }
      }
      audienceRoomCache.set({
        midAccountId,
        ...result.value,
      })
      logger.success(`已同步直播间：${result.value.roomUrl}`)
      windowManager.send(IPC_CHANNELS.tasks.viewerControl.roomReadyEvent, {
        midAccountId,
        roomUrl: result.value.roomUrl,
        roomId: result.value.roomId,
        secUid: result.value.secUid,
      })
      void viewerAccountManager.warmupAll(result.value)
      return {
        ok: true as const,
        roomUrl: result.value.roomUrl,
        roomId: result.value.roomId,
        secUid: result.value.secUid,
      }
    },
  )
}

export function setupViewerControlIpcHandlers() {
  setupIpcHandlers()
}
