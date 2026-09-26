/** 基础版 / 超出档位时禁用账号的统一提示 */
export const DISABLED_ACCOUNT_HINT = '该账号已超出当前档位可用数量，请升级旗舰版或切换到已授权账号'

/** 运行中检测到卡密到期 */
export const LICENSE_EXPIRED_HINT =
  '专业版/旗舰版已到期，已切换为基础版（仅 1 个账号）。请到「会员权益」续充卡密'

export const CONNECT_LIVE_CONTROL_FIRST = '请先连接直播控制台'

export const CONNECT_REQUIRED_HINT = '请先到「打开中控台」连接直播后台，连接成功后再回来开启任务。'

export const TASK_TYPE_LABEL: Record<string, string> = {
  'auto-comment': '自动发言',
  'auto-popup': '自动弹窗',
}
