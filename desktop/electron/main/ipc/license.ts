import { IPC_CHANNELS } from 'shared/ipcChannels'
import { licenseService } from '#/services/LicenseService'
import { typedIpcMainHandle } from '#/utils'

function setupIpcHandlers() {
  typedIpcMainHandle(IPC_CHANNELS.license.status, () => {
    return licenseService.status()
  })

  typedIpcMainHandle(IPC_CHANNELS.license.activate, async (_, card) => {
    return licenseService.activate(card)
  })

  typedIpcMainHandle(IPC_CHANNELS.license.sync, async () => {
    return licenseService.syncOnStartup()
  })

  typedIpcMainHandle(IPC_CHANNELS.license.syncAccounts, (_, accountIds) => {
    return licenseService.syncLicensedAccounts(accountIds)
  })

  typedIpcMainHandle(IPC_CHANNELS.license.confirmPlatformBind, async (_, platform) => {
    return licenseService.confirmBindPlatform(platform)
  })

  typedIpcMainHandle(IPC_CHANNELS.license.migrateLegacyPlatform, (_, accountId, platform) => {
    return licenseService.migrateLegacyPlatform(accountId, platform)
  })
}

export function setupLicenseIpcHandlers() {
  setupIpcHandlers()
}
