import { create } from 'zustand'
import { createJSONStorage, persist } from 'zustand/middleware'
import { immer } from 'zustand/middleware/immer'
import { EVENTS, eventEmitter } from '@/utils/events'
import { mergeWithoutArray } from '@/utils/misc'
import { useAccounts } from './useAccounts'

interface AutoReplyBaseConfig {
  entry: CommentListenerConfig['source']
  hideUsername: boolean
  comment: {
    keywordReply: {
      enable: boolean
      rules: {
        keywords: string[]
        contents: string[]
      }[]
    }
    aiReply: {
      enable: boolean
      prompt: string
      autoSend: boolean
    }
  }
  blockList: string[]
  ws?: {
    enable: boolean
    port: number
  }
}

export type AutoReplyConfig = AutoReplyBaseConfig

const defaultPrompt =
  '你是一个直播间的助手，负责回复观众的评论。请用简短友好的语气回复，不要超过50个字。'

const createDefaultConfig = (): AutoReplyConfig => {
  return {
    entry: 'kuaishou',
    hideUsername: false,
    comment: {
      keywordReply: {
        enable: false,
        rules: [],
      },
      aiReply: {
        enable: false,
        prompt: defaultPrompt,
        autoSend: false,
      },
    },
    blockList: [],
    ws: {
      enable: false,
      port: 12354,
    },
  }
}

type DeepPartial<T> = T extends (...args: unknown[]) => unknown
  ? T
  : T extends Array<infer U>
    ? Array<DeepPartial<U>>
    : T extends object
      ? {
          [P in keyof T]?: DeepPartial<T[P]>
        }
      : T

interface AutoReplyConfigStore {
  contexts: Record<string, { config: AutoReplyConfig }>
  updateConfig: (accountId: string, configUpdates: DeepPartial<AutoReplyConfig>) => void
}

export const useAutoReplyConfigStore = create<AutoReplyConfigStore>()(
  persist(
    immer(set => {
      eventEmitter.on(EVENTS.ACCOUNT_REMOVED, (accountId: string) => {
        set(state => {
          delete state.contexts[accountId]
        })
      })

      const ensureContext = (state: AutoReplyConfigStore, accountId: string) => {
        if (!state.contexts[accountId]) {
          state.contexts[accountId] = { config: createDefaultConfig() }
        }
        return state.contexts[accountId]
      }

      return {
        contexts: {},
        updateConfig: (accountId, configUpdates) =>
          set(state => {
            const context = ensureContext(state, accountId)
            context.config = mergeWithoutArray(context.config, configUpdates)
          }),
      }
    }),
    {
      name: 'auto-reply',
      version: 4,
      storage: createJSONStorage(() => localStorage),
      migrate: (persisted: unknown) => {
        // v4：恢复多平台监听来源，不再强制改写 entry
        return persisted as AutoReplyConfigStore
      },
    },
  ),
)

export const useAutoReplyConfig = () => {
  const store = useAutoReplyConfigStore()
  const currentAccountId = useAccounts(ctx => ctx.currentAccountId)
  const config = mergeWithoutArray(
    createDefaultConfig(),
    store.contexts[currentAccountId]?.config ?? {},
  )

  return {
    config,
    updateKeywordRules: (rules: AutoReplyConfig['comment']['keywordReply']['rules']) => {
      store.updateConfig(currentAccountId, {
        comment: { keywordReply: { rules } },
      })
    },
    updateAIReplySettings: (settings: DeepPartial<AutoReplyConfig['comment']['aiReply']>) => {
      store.updateConfig(currentAccountId, { comment: { aiReply: settings } })
    },
    updateGeneralSettings: (
      settings: DeepPartial<Pick<AutoReplyConfig, 'entry' | 'hideUsername'>>,
    ) => {
      store.updateConfig(currentAccountId, settings)
    },
    updateBlockList: (blockList: string[]) => {
      store.updateConfig(currentAccountId, { blockList })
    },
    updateKeywordReplyEnabled: (enable: boolean) => {
      store.updateConfig(currentAccountId, {
        comment: { keywordReply: { enable } },
      })
    },
    updateWSConfig: (wsConfig: DeepPartial<AutoReplyConfig['ws']>) => {
      store.updateConfig(currentAccountId, { ws: wsConfig })
    },
  }
}
