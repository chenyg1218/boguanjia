import { Result } from '@praha/byethrow'
import { IPC_CHANNELS } from 'shared/ipcChannels'
import { createLogger } from '#/logger'
import { EDGE_TTS_VOICES } from '#/services/edgeTts'
import { assertAccountLicensed } from '#/services/licenseGate'
import {
  type VoiceBroadcastConfig,
  voiceBroadcastService,
} from '#/services/VoiceBroadcastService'
import { typedIpcMainHandle } from '#/utils'

const logger = createLogger('语音设置')

function setupIpcHandlers() {
  typedIpcMainHandle(IPC_CHANNELS.tasks.voiceBroadcast.start, async (_, accountId, config) => {
    const licensed = assertAccountLicensed(accountId)
    if (Result.isFailure(licensed)) {
      const msg = licensed.error instanceof Error ? licensed.error.message : String(licensed.error)
      logger.error('启动失败：', licensed.error)
      return { ok: false as const, error: msg }
    }
    return voiceBroadcastService.start(accountId, config as VoiceBroadcastConfig)
  })

  typedIpcMainHandle(IPC_CHANNELS.tasks.voiceBroadcast.stop, async (_, accountId) => {
    voiceBroadcastService.stop(accountId)
    return true
  })

  typedIpcMainHandle(IPC_CHANNELS.tasks.voiceBroadcast.pause, async (_, accountId) => {
    voiceBroadcastService.pause(accountId)
    return true
  })

  typedIpcMainHandle(IPC_CHANNELS.tasks.voiceBroadcast.resume, async (_, accountId) => {
    voiceBroadcastService.resume(accountId)
    return true
  })

  typedIpcMainHandle(
    IPC_CHANNELS.tasks.voiceBroadcast.updateConfig,
    async (_, accountId, config) => {
      voiceBroadcastService.updateConfig(accountId, config as Partial<VoiceBroadcastConfig>)
    },
  )

  typedIpcMainHandle(IPC_CHANNELS.tasks.voiceBroadcast.getStatus, async (_, accountId) => {
    return voiceBroadcastService.getStatus(accountId)
  })

  typedIpcMainHandle(IPC_CHANNELS.tasks.voiceBroadcast.getAllStatuses, async () => {
    return voiceBroadcastService.getAllStatuses()
  })

  typedIpcMainHandle(IPC_CHANNELS.tasks.voiceBroadcast.listVoices, async () => {
    return EDGE_TTS_VOICES.map(v => ({ id: v.id, label: v.label }))
  })

  typedIpcMainHandle(IPC_CHANNELS.tasks.voiceBroadcast.playDone, async (_, playId, error) => {
    voiceBroadcastService.notifyPlayDone(playId, error)
  })

  typedIpcMainHandle(
    IPC_CHANNELS.tasks.voiceBroadcast.insert,
    async (_, accountId, text, interrupt) => {
      return voiceBroadcastService.insert(accountId, text, interrupt !== false)
    },
  )

  typedIpcMainHandle(
    IPC_CHANNELS.tasks.voiceBroadcast.speakOnce,
    async (_, accountId, text, options) => {
      return voiceBroadcastService.speakOnce(accountId, text, options)
    },
  )
}

export function setupVoiceBroadcastIpcHandlers() {
  setupIpcHandlers()
}
