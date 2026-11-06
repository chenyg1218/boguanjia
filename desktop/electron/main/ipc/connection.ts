import { IPC_CHANNELS } from 'shared/ipcChannels'
import { createLogger } from '#/logger'
import { accountManager } from '#/managers/AccountManager'
import { browserManager } from '#/managers/BrowserSessionManager'
import { accountLicenseError } from '#/services/licenseGate'
import { licenseService } from '#/services/LicenseService'
import { telemetryService } from '#/services/TelemetryService'
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
        const platformDenied = licenseService.platformConnectError(platform)
        if (platformDenied) {
          telemetryService.trackPlatformSelected(platform)
          telemetryService.trackConnect(platform, false, platformDenied)
          return { ok: false, error: platformDenied }
        }
        telemetryService.trackPlatformSelected(platform)
        if (chromePath) {
          browserManager.setChromePath(chromePath)
        }
        const accountSession = accountManager.createSession(platform, account)
        await accountSession.connect({
          headless,
          storageState,
        })
        telemetryService.trackConnect(platform, true)
        return {
          ok: true,
          needsPlatformBindConfirm: licenseService.needsPlatformBindConfirm(),
        }
      } catch (error) {
        const logger = createLogger(`@${account.name}`).scope(TASK_NAME)
        logger.error('连接直播控制台失败：', error)
        accountManager.closeSession(account.id, 'manual')
        const msg = friendlyError(error, '连接直播控制台失败，请查看运行日志后重试')
        telemetryService.trackConnect(platform, false, msg)
        return { ok: false, error: msg }
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

  typedIpcMainHandle(IPC_CHANNELS.tasks.liveControl.listConnected, async () => {
    return accountManager.listConnected()
  })
}

export function setupLiveControlIpcHandlers() {
  setupIpcHandlers()
}
