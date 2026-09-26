import type { FeatureWizardStepDef } from '@/hooks/useFeatureWizard'

export const AUTO_MESSAGE_WIZARD_STEPS: FeatureWizardStepDef[] = [
  {
    id: 'messages',
    title: '添加自动发言话术',
    description:
      '在「消息列表」中添加要发送的话术，一行一句。可用 {候选A/候选B}，每次发送会随机挑一个词，避免句式太单一。',
    confirmLabel: '我已了解如何添加话术',
    targetId: 'auto-message-messages',
  },
  {
    id: 'interval',
    title: '设置发送间隔',
    description:
      '在「发送设置」里填写间隔秒数。建议填一个范围（如 8～15 秒），每次间隔会略有不同，更自然、也不容易被平台当成刷屏。',
    confirmLabel: '我已了解发送间隔设置',
    targetId: 'auto-message-settings',
  },
  {
    id: 'options',
    title: '了解随机发送与防屏蔽',
    description:
      '可开启「随机发送」打乱话术顺序；「插入随机空格」能降低被当成刷屏屏蔽的概率。字数限制默认开启，更稳妥。',
    confirmLabel: '我已了解这些发送选项',
    targetId: 'auto-message-settings',
  },
  {
    id: 'start',
    title: '开始自动发言任务',
    description:
      '确认已连接直播控制台后，点击右上角「开始任务」。任务运行中修改设置需重新启动才会生效。',
    confirmLabel: '我知道如何开始任务了',
    targetId: 'auto-message-start',
  },
  {
    id: 'onekey',
    title: '了解一键刷屏',
    description:
      '「一键刷屏」可按设定条数连续发送评论，适合开场或关键节点快速暖场。请注意频率，避免触发平台限流。',
    confirmLabel: '我知道一键刷屏入口了',
    targetId: 'auto-message-onekey',
  },
]
