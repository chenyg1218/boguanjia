import { useMemo, useRef } from 'react'
import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import { immer } from 'zustand/middleware/immer'
import { EVENTS, eventEmitter } from '@/utils/events'
import { useAccounts } from './useAccounts'

type ConnectionStatus = 'connecting' | 'connected' | 'disconnected'

interface LiveControlContext {
  isConnected: ConnectionStatus
  accountName: string | null
  platform: LiveControlPlatform
}

interface LiveControlActions {
  setIsConnected: (accountId: string, connected: ConnectionStatus) => void
  setAccountName: (accountId: string, name: string | null) => void
  setPlatform: (accountId: string, platform: LiveControlPlatform) => void
}

type LiveControlStore = LiveControlActions & {
  contexts: Record<string, LiveControlContext>
}

function defaultContext(): LiveControlContext {
  return {
    isConnected: 'disconnected',
    accountName: null,
    platform: 'buyin',
  }
}

export const useLiveControlStore = create<LiveControlStore>()(
  persist(
    immer(set => {
      eventEmitter.on(EVENTS.ACCOUNT_REMOVED, (accountId: string) => {
        set(state => {
          delete state.contexts[accountId]
        })
      })

      eventEmitter.on(EVENTS.ACCOUNT_ADDED, (accountId: string) => {
        set(state => {
          if (!state.contexts[accountId]) {
            state.contexts[accountId] = defaultContext()
          }
        })
      })

      const ensureContext = (state: LiveControlStore, accountId: string) => {
        if (!state.contexts[accountId]) {
          state.contexts[accountId] = defaultContext()
        }
        return state.contexts[accountId]
      }

      return {
        contexts: {
          default: defaultContext(),
        },
        setIsConnected: (accountId, connected) =>
          set(state => {
            const context = ensureContext(state, accountId)
            context.isConnected = connected
          }),
        setAccountName: (accountId, name) =>
          set(state => {
            const context = ensureContext(state, accountId)
            context.accountName = name
          }),
        setPlatform: (accountId, platform) =>
          set(state => {
            const context = ensureContext(state, accountId)
            context.platform = platform
          }),
      }
    }),
    {
      name: 'live-control-storage',
      version: 2,
      partialize: state => {
        const contexts: Record<string, Pick<LiveControlContext, 'platform'>> = {}
        for (const key in state.contexts) {
          contexts[key] = { platform: state.contexts[key].platform }
        }
        return { contexts }
      },
      migrate: (persistedState, version) => {
        const state = persistedState as {
          contexts?: Record<string, Partial<LiveControlContext>>
        }
        // v2：运行时字段不再落盘；旧版可能残留 isConnected/accountName
        if (version < 2) {
          const contexts: Record<string, Pick<LiveControlContext, 'platform'>> = {}
          for (const [key, ctx] of Object.entries(state.contexts ?? {})) {
            contexts[key] = { platform: ctx.platform ?? 'buyin' }
          }
          return { contexts }
        }
        return persistedState as { contexts: Record<string, Pick<LiveControlContext, 'platform'>> }
      },
      merge: (persistedState, currentState) => {
        const persisted = persistedState as {
          contexts?: Record<string, Pick<LiveControlContext, 'platform'>>
        }
        // 合并进内存，勿整表替换，避免冲掉连接中的运行时状态
        const mergedContexts: Record<string, LiveControlContext> = { ...currentState.contexts }
        for (const [key, saved] of Object.entries(persisted?.contexts ?? {})) {
          const existing = mergedContexts[key]
          mergedContexts[key] = {
            ...(existing ?? defaultContext()),
            platform: saved.platform ?? existing?.platform ?? 'buyin',
            // 连接态与昵称仅运行时有效，永不从本地存储恢复
            isConnected: existing?.isConnected ?? 'disconnected',
            accountName: existing?.accountName ?? null,
          }
        }
        return {
          ...currentState,
          contexts: mergedContexts,
        }
      },
    },
  ),
)

export const useCurrentLiveControlActions = () => {
  const setIsConnected = useLiveControlStore(state => state.setIsConnected)
  const setAccountName = useLiveControlStore(state => state.setAccountName)
  const setPlatform = useLiveControlStore(state => state.setPlatform)
  const currentAccountId = useAccounts(state => state.currentAccountId)
  return useMemo(
    () => ({
      setIsConnected: (connected: ConnectionStatus) => {
        setIsConnected(currentAccountId, connected)
      },
      setAccountName: (name: string | null) => {
        setAccountName(currentAccountId, name)
      },
      setPlatform: (platform: LiveControlPlatform) => {
        setPlatform(currentAccountId, platform)
      },
    }),
    [currentAccountId, setIsConnected, setAccountName, setPlatform],
  )
}

export const useCurrentLiveControl = <T>(getter: (context: LiveControlContext) => T): T => {
  const currentAccountId = useAccounts(state => state.currentAccountId)
  const defaultContextRef = useRef(defaultContext())
  // 勿对原始值套 useShallow：嵌套字段变更时可能拿不到最新 isConnected
  return useLiveControlStore(state => {
    const context = state.contexts[currentAccountId] ?? defaultContextRef.current
    return getter(context)
  })
}
