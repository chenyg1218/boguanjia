/** 生产环境支持的直播平台 key 与显示名（主进程 / 渲染进程共用） */
export const PLATFORM_NAMES: Record<LiveControlPlatform, string> = {
  douyin: '抖音小店',
  buyin: '巨量百应',
  eos: '抖音团购',
  xiaohongshu: '小红书千帆',
  pgy: '小红书蒲公英',
  wxchannel: '视频号',
  kuaishou: '快手小店',
  taobao: '淘宝',
}

const PLATFORM_KEYS = new Set<string>(Object.keys(PLATFORM_NAMES))

export function isLiveControlPlatform(value: unknown): value is LiveControlPlatform {
  return typeof value === 'string' && PLATFORM_KEYS.has(value)
}

export function platformDisplayName(platform: string): string {
  if (isLiveControlPlatform(platform)) return PLATFORM_NAMES[platform]
  return platform || '未知平台'
}

/** 基础版 / 专业版需锁定单平台；旗舰版不限 */
export function planLocksPlatform(plan: 'free' | 'pro' | 'flagship'): boolean {
  return plan === 'free' || plan === 'pro'
}
