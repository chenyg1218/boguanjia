import type { FeatureWizardStepDef } from '@/hooks/useFeatureWizard'

export const VIEWER_DANMAKU_WIZARD_STEPS: FeatureWizardStepDef[] = [
  {
    id: 'accounts',
    title: '添加并登录互动号',
    description:
      '目前仅支持抖音 / 百应。点击「添加互动号」，再用观众号扫码登录。每个互动号独立登录、独立话术；开始任务时会一起进直播间发评论。',
    confirmLabel: '我已了解如何添加互动号',
    targetId: 'viewer-danmaku-accounts',
  },
  {
    id: 'scripts',
    title: '配置各号话术',
    description:
      '选中某个互动号后，在话术库中添加要发送的内容。可按顺序发或随机发；多个号可互相复制配置。',
    confirmLabel: '我已了解如何配置话术',
    targetId: 'viewer-danmaku-scripts',
  },
  {
    id: 'settings',
    title: '设置发送间隔与防屏蔽',
    description:
      '填写发送间隔秒数（建议 60～120 秒），节奏更自然。可开启「插入随机空格」降低被当成刷屏屏蔽的概率。',
    confirmLabel: '我已了解发送设置',
    targetId: 'viewer-danmaku-settings',
  },
  {
    id: 'start',
    title: '开始小号互动任务',
    description:
      '确认当前为抖音 / 百应中控、已连接且直播间已开播后，点击右上角「开始任务」。开播后会自动缓存本场链接并预热；进房中或发送中均可点「停止」。',
    confirmLabel: '我知道如何开始任务了',
    targetId: 'viewer-danmaku-start',
  },
]
