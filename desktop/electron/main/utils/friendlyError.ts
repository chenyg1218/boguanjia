import { Result } from '@praha/byethrow'
import { errorMessage } from './common'

/** 任务类型 → 中文名（用于日志与用户提示） */
const TASK_LABELS: Record<string, string> = {
  'auto-comment': '自动发言',
  'auto-popup': '自动弹窗',
  'send-batch-messages': '一键评论',
  'comment-listener': '评论监听',
  'update-auto-comment': '更新自动发言配置',
  'update-auto-popup': '更新自动弹窗配置',
  'update-send-batch-messages': '更新一键评论配置',
  'update-comment-listener': '更新评论监听配置',
  toggleButton: '切换讲解按钮',
}

export function taskLabel(taskName: string): string {
  return TASK_LABELS[taskName] ?? taskName
}

/**
 * 将底层错误转成用户可读、可行动的中文说明。
 * 堆栈/英文技术细节不进入提示文案。
 */
export function friendlyError(error: unknown, fallback = '操作失败，请查看运行日志后重试'): string {
  const raw = errorMessage(error).split('\n')[0].trim()
  if (!raw) return fallback

  // 先替换错误文案里的英文任务名
  let msg = raw
  for (const [en, zh] of Object.entries(TASK_LABELS)) {
    if (msg.includes(en)) {
      msg = msg.replaceAll(en, zh)
    }
  }

  if (/未找到浏览器|ChromiumNotFound|executable|Executable doesn't exist/i.test(msg)) {
    return '未找到 Chrome/Edge，请到「应用设置 → 浏览器设置」检测或手动选择路径'
  }
  if (/Timeout|timeout|超时|waiting for/i.test(msg)) {
    return '操作超时。请关闭无头模式后重试，并确认中控台页面已打开且网络正常'
  }
  if (/Target closed|browser.*closed|已关闭|Target page.*closed/i.test(msg)) {
    return '浏览器或页面已关闭，连接中断。请重新连接直播控制台'
  }
  if (/ECONNREFUSED|net::|ERR_/i.test(msg)) {
    return `网络或页面加载失败：${msg}。请检查网络后重试`
  }
  if (/找不到元素|ElementNotFound|locator\.|strict mode violation/i.test(msg)) {
    return `${msg}。请确认已开播、中控台页面未改版，可刷新页面后重试`
  }
  if (/已禁用|ElementDisabled|disabled/i.test(msg) && /按钮|讲解|发送/.test(msg)) {
    return `${msg}。请确认已开播后再试`
  }
  if (/暂不支持任务|TaskNotImplemented|TaskNotSupported/i.test(msg)) {
    return `${msg}。请确认当前平台支持该功能`
  }
  if (/基础版仅可用|免费版仅可用|请续费专业版|LicenseAccountDenied/i.test(msg)) {
    return /基础版|免费版/.test(msg)
      ? msg.replaceAll('免费版', '基础版')
      : '该账号已禁用（基础版仅可用默认账号），请开通专业版或旗舰版后使用，或切换到默认账号'
  }
  if (/评论监听未启动|Comment listener/i.test(msg)) {
    return '评论监听未启动。请先点击「开始监听」'
  }
  if (/Method not implemented/i.test(msg)) {
    return '该功能暂未实现，请等待后续版本'
  }
  if (/Fetch timeout|获取更新超时/i.test(msg)) {
    return '获取更新超时，请检查网络或更换更新源后重试'
  }
  if (/HTTP\s*\d+/i.test(msg)) {
    return `网络请求失败（${msg.match(/HTTP\s*\d+/i)?.[0] ?? 'HTTP 错误'}），请检查网络后重试`
  }

  // 已是中文友好文案则直接用；否则截断过长英文
  if (/[\u4e00-\u9fff]/.test(msg)) {
    return msg.length > 120 ? `${msg.slice(0, 120)}…` : msg
  }
  return fallback
}

export function toTaskResult(r: Result.Result<unknown, Error>): TaskIpcResult {
  if (Result.isSuccess(r)) return { ok: true }
  return { ok: false, error: friendlyError(r.error) }
}
