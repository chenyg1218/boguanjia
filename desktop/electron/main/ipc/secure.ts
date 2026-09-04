import { IPC_CHANNELS } from 'shared/ipcChannels'
import { decryptString, encryptString } from '#/services/SecureStringService'
import { sessionStateStore } from '#/services/SessionStateStore'
import { typedIpcMainHandle } from '#/utils'

function setupIpcHandlers() {
  typedIpcMainHandle(IPC_CHANNELS.secure.encrypt, async (_, plain) => encryptString(plain))
  typedIpcMainHandle(IPC_CHANNELS.secure.decrypt, async (_, cipher) => decryptString(cipher))
  typedIpcMainHandle(IPC_CHANNELS.chrome.clearState, async (_, accountId) => {
    sessionStateStore.remove(accountId)
  })
}

export function setupSecureIpcHandlers() {
  setupIpcHandlers()
}
