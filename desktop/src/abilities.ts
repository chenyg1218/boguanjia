import type { AutoReplyConfig } from './hooks/useAutoReplyConfig'

type ListeningSource = AutoReplyConfig['entry']

export const listeningSources: Record<ListeningSource, { name: string; tips: string }> = {
  compass: {
    name: '电商罗盘大屏',
    tips: '从电商罗盘大屏看评论。能看到评论、点赞、进场等。请先在弹出的浏览器里打开罗盘大屏。',
  },
  control: {
    name: '中控台',
    tips: '从直播中控台看评论。只能看到评论，看不到点赞和进场。一般选这个就够。',
  },
  'wechat-channel': {
    name: '视频号',
    tips: '从视频号直播间看评论。目前只能看到观众评论。',
  },
  xiaohongshu: {
    name: '小红书',
    tips: '从小红书直播间看评论。目前只能看到观众评论。',
  },
  taobao: {
    name: '淘宝',
    tips: '从淘宝直播间看评论。目前只能看到观众评论。',
  },
  kuaishou: {
    name: '快手中控台',
    tips: '从快手中控台看评论。目前只能看到观众评论。',
  },
} as const

type Ability = {
  autoReply?: {
    source: ListeningSource[]
  }
}

export const abilities: Record<LiveControlPlatform, Ability> = {
  douyin: {
    autoReply: {
      source: ['compass', 'control'],
    },
  },
  buyin: {
    autoReply: {
      source: ['compass', 'control'],
    },
  },
  eos: {},
  kuaishou: {
    autoReply: {
      source: ['kuaishou'],
    },
  },
  wxchannel: {
    autoReply: {
      source: ['wechat-channel'],
    },
  },
  xiaohongshu: {
    autoReply: {
      source: ['xiaohongshu'],
    },
  },
  pgy: {
    autoReply: {
      source: ['xiaohongshu'],
    },
  },
  taobao: {
    autoReply: {
      source: ['taobao'],
    },
  },
}

export const autoReplyPlatforms = Object.entries(abilities)
  .filter(([_, s]) => s.autoReply && s.autoReply.source.length > 0)
  .map(([p, _]) => p) as LiveControlPlatform[]
