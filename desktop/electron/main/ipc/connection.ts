import { IPC_CHANNELS } from 'shared/ipcChannels'
import { createLogger } from '#/logger'
import { accountManager } from '#/managers/AccountManager'
import { browserManager } from '#/managers/BrowserSessionManager'
import { accountLicenseError } from '#/services/licenseGate'
import { friendlyError, typedIpcMainHandle } from '#/utils'

const TASK_NAME = '中控台'

function setupIpcHandlers() {
  typedIpcMainHandle(
    IPC_CHANNELS.tasks.liveControl.connect,
    async (_, { chromePath, headless, storageState, platform, account }) => {
      try {
        // 主进程强制校验；不信任渲染进程传来的 disabled
        const denied = accountLicenseError(account.id)
        if (denied) {
          return { ok: false, error: denied }
        }
        if (chromePath) {
          browserManager.setChromePath(chromePath)
        }
        const accountSession = accountManager.createSession(platform, account)
        await accountSession.connect({
          headless,
          storageState,
        })
        return { ok: true }
      } catch (error) {
        const logger = createLogger(`@${account.name}`).scope(TASK_NAME)
        logger.error('连接直播控制台失败：', error)
        accountManager.closeSession(account.id, 'manual')
        return { ok: false, error: friendlyError(error, '连接直播控制台失败，请查看运行日志后重试') }
      }
    },
  )

  typedIpcMainHandle(IPC_CHANNELS.tasks.liveControl.disconnect, async (_, accountId) => {
    try {
      accountManager.closeSession(accountId, 'manual')
      return { ok: true }
    } catch (error) {
      const logger = createLogger(`@${accountManager.getAccountName(accountId)}`).scope(TASK_NAME)
      logger.error('断开连接失败：', error)
      return { ok: false, error: friendlyError(error, '断开连接失败') }
    }
  })
}

export function setupLiveControlIpcHandlers() {
  setupIpcHandlers()
}
