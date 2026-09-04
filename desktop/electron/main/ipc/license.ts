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
}

export function setupLicenseIpcHandlers() {
  setupIpcHandlers()
}
