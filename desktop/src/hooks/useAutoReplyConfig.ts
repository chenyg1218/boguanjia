import { create } from 'zustand'
import { createJSONStorage, persist } from 'zustand/middleware'
import { immer } from 'zustand/middleware/immer'
import { EVENTS, eventEmitter } from '@/utils/events'
import {
  type KeywordReplyChannel,
  type KeywordRule,
  normalizeKeywordRule,
} from '@/utils/keywordRules'
import { mergeWithoutArray } from '@/utils/misc'
import { useAccounts } from './useAccounts'

export type { KeywordReplyChannel, KeywordRule }

interface AutoReplyBaseConfig {
  entry: CommentListenerConfig['source']
  hideUsername: boolean
  comment: {
    keywordReply: {
      enable: boolean
      matchMode: 'includes' | 'exact'
      /** 全局默认通道；单条规则可覆盖 */
      channel: KeywordReplyChannel
      rules: KeywordRule[]
    }
    aiReply: {
      enable: boolean
      prompt: string
      autoSend: boolean
      channel: KeywordReplyChannel
    }
    /**
     * @deprecated v9 起合并进 keywordReply.rules.goodsId，仅保留兼容
     */
    keywordPopUp: {
      enable: boolean
      rules: {
        keywords: string[]
        goodsId: number
      }[]
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
        matchMode: 'includes',
        channel: 'comment',
        rules: [],
      },
      aiReply: {
        enable: false,
        prompt: defaultPrompt,
        autoSend: false,
        channel: 'comment',
      },
      keywordPopUp: {
        enable: false,
        rules: [],
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

function mergePopUpIntoKeywordRules(config: AutoReplyConfig) {
  const kr = config.comment.keywordReply
  if (!kr) return
  if (!kr.channel) kr.channel = 'comment'
  kr.rules = (kr.rules ?? []).map(r => normalizeKeywordRule(r as KeywordRule))

  const kp = config.comment.keywordPopUp
  if (!kp?.rules?.length) {
    config.comment.keywordPopUp = { enable: false, rules: [] }
    return
  }

  for (const pr of kp.rules) {
    if (!pr.keywords?.length || !pr.goodsId) continue
    const hit = kr.rules.find(r => r.keywords.some(k => pr.keywords.includes(k)))
    if (hit) {
      hit.goodsId = pr.goodsId
    } else {
      kr.rules.push(
        normalizeKeywordRule({
          keywords: pr.keywords,
          contents: [`宝宝看小黄车第${pr.goodsId}号`],
          channel: 'comment',
          goodsId: pr.goodsId,
          cooldownSec: 8,
        }),
      )
    }
  }
  if (kp.enable) {
    kr.enable = true
  }
  config.comment.keywordPopUp = { enable: false, rules: [] }
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
      version: 9,
      storage: createJSONStorage(() => localStorage),
      migrate: (persisted: unknown, version) => {
        const state = persisted as AutoReplyConfigStore
        if (!state?.contexts) return state
        for (const ctx of Object.values(state.contexts)) {
          if (!ctx?.config) continue
          if (version < 5 && ctx.config.comment?.keywordReply && !ctx.config.comment.keywordReply.matchMode) {
            ctx.config.comment.keywordReply.matchMode = 'includes'
          }
          if (version < 6) {
            if (!ctx.config.comment.keywordPopUp) {
              ctx.config.comment.keywordPopUp = { enable: false, rules: [] }
            }
          }
          if (version < 8) {
            // 旧版曾有顶层 channel / eventReply，清理残留
            if ('eventReply' in ctx.config) {
              delete (ctx.config as { eventReply?: unknown }).eventReply
            }
          }
          if (version < 9) {
            const kr = ctx.config.comment?.keywordReply as
              | (AutoReplyConfig['comment']['keywordReply'] & { channel?: KeywordReplyChannel })
              | undefined
            if (kr) {
              if (!kr.channel) kr.channel = 'comment'
            }
            const ai = ctx.config.comment?.aiReply as
              | (AutoReplyConfig['comment']['aiReply'] & { channel?: KeywordReplyChannel })
              | undefined
            if (ai && !ai.channel) {
              ai.channel = 'comment'
            }
            mergePopUpIntoKeywordRules(ctx.config)
          }
        }
        return state
      },
    },
  ),
)

export { createDefaultConfig }

export const useAutoReplyConfig = () => {
  const store = useAutoReplyConfigStore()
  const currentAccountId = useAccounts(ctx => ctx.currentAccountId)
  const config = mergeWithoutArray(
    createDefaultConfig(),
    store.contexts[currentAccountId]?.config ?? {},
  )

  return {
    config,
    updateConfig: (updates: DeepPartial<AutoReplyConfig>) => {
      store.updateConfig(currentAccountId, updates)
    },
    updateKeywordRules: (rules: KeywordRule[]) => {
      store.updateConfig(currentAccountId, {
        comment: { keywordReply: { rules: rules.map(normalizeKeywordRule) } },
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
    updateKeywordMatchMode: (matchMode: 'includes' | 'exact') => {
      store.updateConfig(currentAccountId, {
        comment: { keywordReply: { matchMode } },
      })
    },
    updateKeywordDefaultChannel: (channel: KeywordReplyChannel) => {
      store.updateConfig(currentAccountId, {
        comment: { keywordReply: { channel } },
      })
    },
    updateWSConfig: (wsConfig: DeepPartial<AutoReplyConfig['ws']>) => {
      store.updateConfig(currentAccountId, { ws: wsConfig })
    },
  }
}
