import type { AutoReplyConfig } from './hooks/useAutoReplyConfig'

type ListeningSource = AutoReplyConfig['entry']

export const listeningSources: Record<ListeningSource, { name: string; tips: string }> = {
  kuaishou: {
    name: '快手中控台',
    tips: '快手监听目前支持用户评论消息',
  },
} as const

type Ability = {
  autoReply?: {
    source: ListeningSource[]
  }
}

export const abilities: Record<LiveControlPlatform, Ability> = {
  kuaishou: {
    autoReply: {
      source: ['kuaishou'],
    },
  },
}

export const autoReplyPlatforms = Object.entries(abilities)
  .filter(([_, s]) => s.autoReply && s.autoReply.source.length > 0)
  .map(([p, _]) => p) as LiveControlPlatform[]
