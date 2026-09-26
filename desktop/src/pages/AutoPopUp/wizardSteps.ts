import type { FeatureWizardStepDef } from '@/hooks/useFeatureWizard'

export const AUTO_POPUP_WIZARD_STEPS: FeatureWizardStepDef[] = [
  {
    id: 'goods',
    title: '填写商品序号',
    description:
      '在商品列表中添加要自动弹出的商品序号。可批量导入，也可为单个商品设置重复次数与独立讲解时长。',
    confirmLabel: '我已了解如何添加商品',
    targetId: 'auto-popup-goods',
  },
  {
    id: 'settings',
    title: '设置讲解时长',
    description:
      '在「弹窗设置」里配置每品讲解时长。建议使用范围值，节奏更自然。需要打乱顺序时可开启「随机弹窗」。',
    confirmLabel: '我已了解弹窗设置',
    targetId: 'auto-popup-settings',
  },
  {
    id: 'start',
    title: '开始自动弹窗任务',
    description:
      '确认已连接直播控制台后，点击右上角「开始任务」。运行中修改配置需重新启动才会生效。',
    confirmLabel: '我知道如何开始任务了',
    targetId: 'auto-popup-start',
  },
]
