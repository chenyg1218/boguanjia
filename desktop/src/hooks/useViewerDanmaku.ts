import { useMemo } from 'react'
import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import { immer } from 'zustand/middleware/immer'
import { useShallow } from 'zustand/react/shallow'
import { useViewerAccountsStore } from './useViewerAccounts'

export interface ViewerMessage {
  id: string
  content: string
}

export type ViewerDanmakuUiConfig = {
  scheduler: ViewerDanmakuConfig['scheduler']
  messages: ViewerMessage[]
  random?: boolean
  extraSpaces?: boolean
}

/** 默认保守间隔；顺序发送；随机空格开 */
export const defaultViewerDanmakuConfig = (): ViewerDanmakuUiConfig => ({
  scheduler: {
    interval: [60_000, 120_000],
  },
  messages: [],
  random: false,
  extraSpaces: true,
})

const EMPTY_CONFIG = defaultViewerDanmakuConfig()

function cloneConfig(src: ViewerDanmakuUiConfig): ViewerDanmakuUiConfig {
  return {
    scheduler: { interval: [...src.scheduler.interval] as [number, number] },
    messages: src.messages.map(m => ({ id: crypto.randomUUID(), content: m.content })),
    random: src.random,
    extraSpaces: src.extraSpaces,
  }
}

interface ViewerDanmakuStore {
  contexts: Record<string, { config: ViewerDanmakuUiConfig }>
  ensureContext: (accountId: string, copyFromId?: string | null) => void
  removeContext: (accountId: string) => void
  setConfig: (accountId: string, patch: Partial<ViewerDanmakuUiConfig>) => void
  copyConfigTo: (fromAccountId: string, toAccountIds: string[]) => void
}

export const useViewerDanmakuStore = create<ViewerDanmakuStore>()(
  persist(
    immer(set => ({
      contexts: {},

      ensureContext: (accountId, copyFromId) =>
        set(state => {
          if (state.contexts[accountId]) return
          const from =
            (copyFromId && state.contexts[copyFromId]?.config) ||
            Object.values(state.contexts)[0]?.config
          state.contexts[accountId] = {
            config: from ? cloneConfig(from) : defaultViewerDanmakuConfig(),
          }
        }),

      removeContext: accountId =>
        set(state => {
          delete state.contexts[accountId]
        }),

      setConfig: (accountId, patch) =>
        set(state => {
          if (!state.contexts[accountId]) {
            state.contexts[accountId] = { config: defaultViewerDanmakuConfig() }
          }
          const cfg = state.contexts[accountId].config
          // 按 id+内容比较；仅比 content 会把「新增一条空话术」误判为无变化
          if (patch.messages && Object.keys(patch).length === 1) {
            const prev = cfg.messages
            const next = patch.messages
            if (
              prev.length === next.length &&
              prev.every((m, i) => m.id === next[i]?.id && m.content === next[i]?.content)
            ) {
              return
            }
          }
          state.contexts[accountId].config = { ...cfg, ...patch }
        }),

      copyConfigTo: (fromAccountId, toAccountIds) =>
        set(state => {
          const src = state.contexts[fromAccountId]?.config
          if (!src || toAccountIds.length === 0) return
          for (const id of toAccountIds) {
            if (id === fromAccountId) continue
            state.contexts[id] = { config: cloneConfig(src) }
          }
        }),
    })),
    {
      name: 'viewer-danmaku-storage',
      version: 3,
      migrate: (persisted, version) => {
        const old = persisted as {
          contexts?: Record<string, { config?: ViewerDanmakuUiConfig }>
          config?: ViewerDanmakuUiConfig
        }
        // v2 全局一份 → 暂无账号上下文，等账号 ensure 时再种
        if (version < 3) {
          if (old.contexts && Object.keys(old.contexts).length > 0) {
            return { contexts: old.contexts }
          }
          return { contexts: {} }
        }
        return persisted as { contexts: Record<string, { config: ViewerDanmakuUiConfig }> }
      },
      partialize: state => ({ contexts: state.contexts }),
    },
  ),
)

export function useCurrentViewerDanmakuConfig(): ViewerDanmakuUiConfig {
  const accountId = useViewerAccountsStore(s => s.currentAccountId)
  return useViewerDanmakuStore(
    useShallow(s => {
      if (!accountId) return EMPTY_CONFIG
      return s.contexts[accountId]?.config ?? EMPTY_CONFIG
    }),
  )
}

export function useViewerDanmakuActions() {
  const accountId = useViewerAccountsStore(s => s.currentAccountId)
  const setConfig = useViewerDanmakuStore(s => s.setConfig)
  const copyConfigTo = useViewerDanmakuStore(s => s.copyConfigTo)

  return useMemo(() => {
    const update = (patch: Partial<ViewerDanmakuUiConfig>) => {
      if (!accountId) return
      setConfig(accountId, patch)
    }
    return {
      setScheduler: (scheduler: ViewerDanmakuConfig['scheduler']) => update({ scheduler }),
      setMessages: (messages: ViewerMessage[]) => update({ messages }),
      setRandom: (random: boolean) => update({ random }),
      setExtraSpaces: (extraSpaces: boolean) => update({ extraSpaces }),
      addMessage: (content = '') => {
        if (!accountId) return null
        const id = crypto.randomUUID()
        const cfg = useViewerDanmakuStore.getState().contexts[accountId]?.config
        const messages = [...(cfg?.messages ?? []), { id, content }]
        setConfig(accountId, { messages })
        return id
      },
      updateMessage: (id: string, content: string) => {
        if (!accountId) return
        const cfg = useViewerDanmakuStore.getState().contexts[accountId]?.config
        if (!cfg) return
        setConfig(accountId, {
          messages: cfg.messages.map(m => (m.id === id ? { ...m, content } : m)),
        })
      },
      removeMessage: (id: string) => {
        if (!accountId) return
        const cfg = useViewerDanmakuStore.getState().contexts[accountId]?.config
        if (!cfg) return
        setConfig(accountId, { messages: cfg.messages.filter(m => m.id !== id) })
      },
      copyConfigTo,
    }
  }, [accountId, setConfig, copyConfigTo])
}

export function getViewerDanmakuConfig(accountId: string): ViewerDanmakuUiConfig {
  return (
    useViewerDanmakuStore.getState().contexts[accountId]?.config ?? defaultViewerDanmakuConfig()
  )
}

export function toViewerDanmakuTaskConfig(config: ViewerDanmakuUiConfig): ViewerDanmakuConfig {
  return {
    scheduler: config.scheduler,
    messages: config.messages
      .filter(m => m.content.trim().length > 0)
      .map(m => ({ content: m.content.trim() })),
    random: config.random,
    extraSpaces: config.extraSpaces,
  }
}

/** 多号启动错峰：index>0 时返回 0～maxMs 的随机额外延迟 */
export function staggerDelayMs(index: number, maxMs = 5000): number {
  if (index <= 0) return 0
  return Math.floor(Math.random() * maxMs)
}
