import { useMemo } from 'react'
import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import { immer } from 'zustand/middleware/immer'
import { EVENTS, eventEmitter } from '@/utils/events'
import { useAccounts } from './useAccounts'

interface ChromeConfigV1 {
  path: string
  cookies: string
}

interface ChromeConfigV2 {
  path: string
  cookies: {
    buyin: string
    douyin: string
    eos: string
  }
}

interface ChromeConfig {
  path: string
  /** 仅作旧版一次性迁移；新版本登录态在主进程加密存储 */
  storageState: string
  headless: boolean
}

interface ChromeConfigStore {
  contexts: Record<string, ChromeConfig>
  setPath: (accountId: string, path: string) => void
  setStorageState: (accountId: string, storageState: string) => void
  setHeadless: (accountId: string, headless: boolean) => void
  clearStorageState: (accountId: string) => void
}

const defaultContext = (): ChromeConfig => ({
  path: '',
  storageState: '',
  headless: false,
})

export const useChromeConfigStore = create<ChromeConfigStore>()(
  persist(
    immer(set => {
      eventEmitter.on(EVENTS.ACCOUNT_REMOVED, (accountId: string) => {
        set(state => {
          delete state.contexts[accountId]
        })
      })

      const ensureContext = (state: ChromeConfigStore, accountId: string) => {
        if (!state.contexts[accountId]) {
          state.contexts[accountId] = defaultContext()
        }
        return state.contexts[accountId]
      }
      return {
        contexts: {
          default: defaultContext(),
        },
        setPath: (accountId, path) => {
          set(state => {
            const context = ensureContext(state, accountId)
            context.path = path
          })
        },
        setStorageState: (accountId, storageState) => {
          set(state => {
            const context = ensureContext(state, accountId)
            context.storageState = storageState
          })
        },
        clearStorageState: accountId => {
          set(state => {
            const context = ensureContext(state, accountId)
            context.storageState = ''
          })
        },
        setHeadless: (accountId, headless) => {
          set(state => {
            const context = ensureContext(state, accountId)
            context.headless = headless
          })
        },
      }
    }),
    {
      name: 'chrome-config',
      version: 5,
      // 登录态不再持久化到 localStorage
      partialize: state => ({
        contexts: Object.fromEntries(
          Object.entries(state.contexts).map(([id, ctx]) => [
            id,
            { path: ctx.path, headless: ctx.headless, storageState: '' },
          ]),
        ),
      }),
      migrate: (persistedState, version) => {
        if (version === 0) {
          const persisted = persistedState as ChromeConfigV1
          return {
            contexts: {
              default: {
                path: persisted?.path,
                storageState: '',
                headless: false,
              },
            },
          }
        }
        if (version === 1) {
          const persisted = persistedState as {
            contexts: Record<string, ChromeConfigV1>
          }
          return {
            contexts: Object.fromEntries(
              Object.entries(persisted.contexts).map(([accountId, context]) => [
                accountId,
                {
                  ...context,
                  storageState: '',
                  headless: false,
                },
              ]),
            ),
          }
        }
        if (version === 3) {
          const persisted = persistedState as ChromeConfigV2
          return {
            contexts: {
              default: {
                path: persisted?.path,
                storageState: '',
                headless: false,
              },
            },
          }
        }
        // v4 → v5：保留 path/headless；storageState 留给首连时迁移到主进程后清空
        if (version === 4) {
          const persisted = persistedState as { contexts?: Record<string, ChromeConfig> }
          return {
            contexts: Object.fromEntries(
              Object.entries(persisted.contexts ?? {}).map(([accountId, context]) => [
                accountId,
                {
                  path: context?.path ?? '',
                  headless: context?.headless ?? false,
                  // 暂留明文供主进程迁移；partialize 之后不再写回
                  storageState: context?.storageState ?? '',
                },
              ]),
            ),
          }
        }
        return persistedState as { contexts: Record<string, ChromeConfig> }
      },
    },
  ),
)

export function useCurrentChromeConfig<T>(getters: (state: ChromeConfig) => T): T {
  const currentAccountId = useAccounts(state => state.currentAccountId)
  return useChromeConfigStore(state => {
    const context = state.contexts[currentAccountId] ?? defaultContext()
    return getters(context)
  })
}

export function useCurrentChromeConfigActions() {
  const setPath = useChromeConfigStore(state => state.setPath)
  const setStorageState = useChromeConfigStore(state => state.setStorageState)
  const setHeadless = useChromeConfigStore(state => state.setHeadless)
  const currentAccountId = useAccounts(state => state.currentAccountId)

  return useMemo(
    () => ({
      setPath: (path: string) => setPath(currentAccountId, path),
      setStorageState: (storageState: string) => setStorageState(currentAccountId, storageState),
      setHeadless: (headless: boolean) => setHeadless(currentAccountId, headless),
    }),
    [currentAccountId, setPath, setStorageState, setHeadless],
  )
}
