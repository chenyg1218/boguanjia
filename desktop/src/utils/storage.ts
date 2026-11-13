import { version as APP_VERSION } from '../../package.json'

/**
 * 存储版本信息的键名
 */
const STORAGE_VERSION_KEY = 'storage-version'

/**
 * 当前应用使用的所有 localStorage 键名
 * 用于账号删除时清理数据；版本迁移时这些键一律保留
 */
export const STORAGE_KEYS = {
  // 账号相关
  ACCOUNTS: 'accounts-storage',
  ACCOUNT_PANEL_COLLAPSED: 'account-panel-collapsed',

  // 各功能模块配置（按主账号 contexts 存储）
  AUTO_MESSAGE: 'auto-message-storage',
  AUTO_REPLY: 'auto-reply',
  AUTO_POPUP: 'auto-popup-storage',
  LIVE_CONTROL: 'live-control-storage',
  CHROME_CONFIG: 'chrome-config',
  VOICE_BROADCAST: 'voice-broadcast-storage',

  // 场景快照
  SCENES: 'boguanjia-scenes',

  // 互动号（列表 + 按互动号 id 的 contexts）
  VIEWER_ACCOUNTS: 'viewer-accounts-storage',
  VIEWER_DANMAKU: 'viewer-danmaku-storage',

  // 引导 / 向导
  ONBOARDING: 'onboarding-storage',
  FEATURE_WIZARD: 'feature-wizard-storage',

  // 全局配置（不按账号存储）
  AI_CHAT: 'ai-chat-storage',
  UPDATE: 'update-storage',
  STORAGE_VERSION: STORAGE_VERSION_KEY,
} as const

/**
 * 已确认废弃的 localStorage 键名（历史版本使用）
 * 仅删除列入此处的键；未知键一律保留，避免升级误删新功能配置
 */
export const DEPRECATED_STORAGE_KEYS: string[] = []

/**
 * 按主账号 contexts 存储的 localStorage 键名列表
 */
const ACCOUNT_BASED_STORAGE_KEYS = [
  STORAGE_KEYS.AUTO_MESSAGE,
  STORAGE_KEYS.AUTO_REPLY,
  STORAGE_KEYS.AUTO_POPUP,
  STORAGE_KEYS.LIVE_CONTROL,
  STORAGE_KEYS.CHROME_CONFIG,
  STORAGE_KEYS.VOICE_BROADCAST,
]

/**
 * 按互动号账号 id 存 contexts 的键
 */
const VIEWER_ACCOUNT_BASED_STORAGE_KEYS = [STORAGE_KEYS.VIEWER_DANMAKU]

/**
 * 获取指定账号在指定存储键中的数据
 */
export function getAccountData<T>(storageKey: string, accountId: string): T | undefined {
  try {
    const data = localStorage.getItem(storageKey)
    if (!data) return undefined

    const parsed = JSON.parse(data)
    return parsed.state?.contexts?.[accountId] as T | undefined
  } catch {
    return undefined
  }
}

/**
 * 删除指定账号在指定存储键中的数据
 */
export function removeAccountData(storageKey: string, accountId: string): void {
  try {
    const data = localStorage.getItem(storageKey)
    if (!data) return

    const parsed = JSON.parse(data)
    if (parsed.state?.contexts?.[accountId]) {
      delete parsed.state.contexts[accountId]
      localStorage.setItem(storageKey, JSON.stringify(parsed))
    }
  } catch (error) {
    console.error(`Failed to remove account data for ${storageKey}:`, error)
  }
}

/**
 * 清理指定账号的所有 localStorage 数据
 * 包括所有按账号存储的配置
 */
export function clearAccountStorage(accountId: string): void {
  if (!accountId || accountId === 'default') return

  for (const key of ACCOUNT_BASED_STORAGE_KEYS) {
    removeAccountData(key, accountId)
  }
}

/**
 * 清理所有已废弃的 localStorage 键
 * 在版本迁移时调用
 * @returns 清理的废弃键数量
 */
export function clearDeprecatedStorage(): number {
  let count = 0
  for (const key of DEPRECATED_STORAGE_KEYS) {
    if (localStorage.getItem(key)) {
      localStorage.removeItem(key)
      count++
    }
  }
  return count
}

/**
 * 从 contexts 结构中删除不在 validIds 内的条目（保留 default）
 */
function cleanupOrphanedContexts(
  storageKey: string,
  validIds: Set<string>,
  keepDefault = true,
): number {
  try {
    const data = localStorage.getItem(storageKey)
    if (!data) return 0

    const parsed = JSON.parse(data)
    const contexts = parsed.state?.contexts || {}
    const contextKeys = Object.keys(contexts)

    let hasChanges = false
    let count = 0
    for (const accountId of contextKeys) {
      if (keepDefault && accountId === 'default') continue
      if (!validIds.has(accountId)) {
        delete contexts[accountId]
        count++
        hasChanges = true
      }
    }

    if (hasChanges) {
      localStorage.setItem(storageKey, JSON.stringify(parsed))
    }
    return count
  } catch (error) {
    console.error(`[Storage] Failed to cleanup orphaned data for ${storageKey}:`, error)
    return 0
  }
}

/**
 * 清理孤立的账号数据（账号已被删除但数据仍存在）
 * 在版本迁移或手动清理时调用
 * @returns 清理的孤立数据数量
 */
export function cleanupOrphanedAccountData(): number {
  const validAccountIds = new Set(getExistingAccountIds())
  let totalCount = 0

  for (const storageKey of ACCOUNT_BASED_STORAGE_KEYS) {
    totalCount += cleanupOrphanedContexts(storageKey, validAccountIds, true)
  }

  const validViewerIds = new Set(getExistingViewerAccountIds())
  for (const storageKey of VIEWER_ACCOUNT_BASED_STORAGE_KEYS) {
    totalCount += cleanupOrphanedContexts(storageKey, validViewerIds, false)
  }

  return totalCount
}

/**
 * 执行完整的存储清理
 * 包括清理显式废弃键和孤立数据；不删除未知键，不触碰主进程登录态
 * @returns 清理的总数据量
 */
export function performFullCleanup(): number {
  const deprecatedCount = clearDeprecatedStorage()
  const orphanedCount = cleanupOrphanedAccountData()
  localStorage.setItem(STORAGE_VERSION_KEY, APP_VERSION)
  return deprecatedCount + orphanedCount
}

/**
 * 获取主账号列表 id
 */
function getExistingAccountIds(): string[] {
  try {
    const accountsData = localStorage.getItem(STORAGE_KEYS.ACCOUNTS)
    if (!accountsData) return []

    const parsed = JSON.parse(accountsData)
    const accounts = parsed.state?.accounts || []
    return accounts.map((acc: { id: string }) => acc.id)
  } catch {
    return []
  }
}

/**
 * 获取互动号账号列表 id
 */
function getExistingViewerAccountIds(): string[] {
  try {
    const data = localStorage.getItem(STORAGE_KEYS.VIEWER_ACCOUNTS)
    if (!data) return []

    const parsed = JSON.parse(data)
    const accounts = parsed.state?.accounts || []
    return accounts.map((acc: { id: string }) => acc.id)
  } catch {
    return []
  }
}

/**
 * 获取所有 localStorage 键名（用于调试）
 */
export function getAllStorageKeys(): string[] {
  const keys: string[] = []
  for (let i = 0; i < localStorage.length; i++) {
    const key = localStorage.key(i)
    if (key) keys.push(key)
  }
  return keys
}

/**
 * 启动程序时自动判断是否需要执行版本迁移清理
 */
export function autoCleanupStorage(): void {
  const storedVersion = localStorage.getItem(STORAGE_VERSION_KEY)
  if (storedVersion !== APP_VERSION) {
    performFullCleanup()
  }
}
