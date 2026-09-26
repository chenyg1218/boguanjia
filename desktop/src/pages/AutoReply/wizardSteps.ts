import type { FeatureWizardStepDef } from '@/hooks/useFeatureWizard'

export const AUTO_REPLY_WIZARD_STEPS: FeatureWizardStepDef[] = [
  {
    id: 'listening',
    title: '选择评论来源',
    description:
      '在「回复规则」里选择从哪里读取观众评论（中控台 / 其他来源因平台而异）。来源选对后，开始任务时才会按这个来源监听。',
    confirmLabel: '我已了解评论来源设置',
    targetId: 'auto-reply-listening',
    route: '/auto-reply',
  },
  {
    id: 'keyword',
    title: '配置关键词回复',
    description:
      '开启关键词回复，添加「触发词 → 回复内容」。观众评论命中关键词时会自动回公屏。也可切换到 AI 回复标签页试用。',
    confirmLabel: '我已了解如何配置回复规则',
    targetId: 'auto-reply-keyword',
    route: '/auto-reply',
  },
  {
    id: 'comments',
    title: '查看实时评论',
    description:
      '切换到「运行监控」后，左侧是评论列表。开始任务后，直播间评论会显示在这里。',
    confirmLabel: '我知道评论列表在哪里了',
    targetId: 'auto-reply-comments',
    route: '/auto-reply',
  },
  {
    id: 'preview',
    title: '了解回复预览',
    description:
      '右侧是待发送 / 已回复的预览区，方便核对自动回复内容，也可手动确认发送。',
    confirmLabel: '我知道回复预览区了',
    targetId: 'auto-reply-preview',
    route: '/auto-reply',
  },
  {
    id: 'start',
    title: '开始自动回复',
    description:
      '规则配置完成后，点击右上角「开始任务」。任务开始后才会监听评论，并按规则自动回复。停止任务后监听也会一起停。',
    confirmLabel: '我知道如何开始任务了',
    targetId: 'auto-reply-start',
    route: '/auto-reply',
  },
]
