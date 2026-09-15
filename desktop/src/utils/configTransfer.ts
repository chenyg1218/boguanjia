import { useAutoMessageStore } from '@/hooks/useAutoMessage'
import { useAutoPopUpStore } from '@/hooks/useAutoPopUp'
import { useAutoReplyConfigStore } from '@/hooks/useAutoReplyConfig'
import { useChromeConfigStore } from '@/hooks/useChromeConfig'
import { useVoiceBroadcastStore } from '@/hooks/useVoiceBroadcast'

export type ExportAccountBundle = {
  version: 1
  exportedAt: string
  accountId: string
  modules: {
    autoMessage?: unknown
    autoPopUp?: unknown
    autoReply?: unknown
    voiceBroadcast?: unknown
    chrome?: { path: string; headless: boolean }
  }
}

export function buildAccountExport(accountId: string): ExportAccountBundle {
  const autoMessage = useAutoMessageStore.getState().contexts[accountId]
  const autoPopUp = useAutoPopUpStore.getState().contexts[accountId]
  const autoReply = useAutoReplyConfigStore.getState().contexts[accountId]
  const voice = useVoiceBroadcastStore.getState().contexts[accountId]
  const chrome = useChromeConfigStore.getState().contexts[accountId]

  return {
    version: 1,
    exportedAt: new Date().toISOString(),
    accountId,
    modules: {
      autoMessage: autoMessage
        ? structuredClone({
            config: autoMessage.config,
            batchCount: autoMessage.batchCount,
          })
        : undefined,
      autoPopUp: autoPopUp
        ? structuredClone({
            config: autoPopUp.config,
            shortcuts: autoPopUp.shortcuts,
            isGlobalShortcut: autoPopUp.isGlobalShortcut,
          })
        : undefined,
      autoReply: autoReply?.config ? structuredClone(autoReply.config) : undefined,
      voiceBroadcast: voice?.config ? structuredClone(voice.config) : undefined,
      chrome: chrome
        ? { path: chrome.path, headless: chrome.headless }
        : undefined,
    },
  }
}

export function applyAccountImport(accountId: string, bundle: ExportAccountBundle) {
  const m = bundle.modules ?? {}
  if (m.autoMessage && typeof m.autoMessage === 'object') {
    const am = m.autoMessage as { config?: never; batchCount?: number }
    if (am.config) useAutoMessageStore.getState().setConfig(accountId, structuredClone(am.config))
    if (typeof am.batchCount === 'number') {
      useAutoMessageStore.getState().setBatchCount(accountId, am.batchCount)
    }
  }
  if (m.autoPopUp && typeof m.autoPopUp === 'object') {
    const pop = m.autoPopUp as {
      config?: never
      shortcuts?: never
      isGlobalShortcut?: boolean
    }
    if (pop.config) useAutoPopUpStore.getState().setConfig(accountId, structuredClone(pop.config))
    if (pop.shortcuts) {
      useAutoPopUpStore.getState().setShortcuts(accountId, structuredClone(pop.shortcuts))
    }
    if (typeof pop.isGlobalShortcut === 'boolean') {
      useAutoPopUpStore.getState().setGlobalShortcut(accountId, pop.isGlobalShortcut)
    }
  }
  if (m.autoReply) {
    useAutoReplyConfigStore.getState().updateConfig(accountId, structuredClone(m.autoReply) as never)
  }
  if (m.voiceBroadcast) {
    useVoiceBroadcastStore
      .getState()
      .setConfig(accountId, structuredClone(m.voiceBroadcast) as never)
  }
  if (m.chrome) {
    useChromeConfigStore.getState().setPath(accountId, m.chrome.path)
    useChromeConfigStore.getState().setHeadless(accountId, m.chrome.headless)
  }
}

export function downloadJson(filename: string, data: unknown) {
  const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  a.click()
  URL.revokeObjectURL(url)
}

export async function readJsonFile(file: File): Promise<unknown> {
  const text = await file.text()
  return JSON.parse(text)
}
