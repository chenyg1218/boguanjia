import { useAutoMessageStore } from '@/hooks/useAutoMessage'
import { useAutoPopUpStore } from '@/hooks/useAutoPopUp'
import { useAutoReplyConfigStore } from '@/hooks/useAutoReplyConfig'
import { useChromeConfigStore } from '@/hooks/useChromeConfig'

/** 可跨账号复制的配置模块（不含登录态 / 运行态 / 全局 AI Key） */
export type CopyAccountConfigModule = 'autoMessage' | 'autoPopUp' | 'autoReply' | 'chrome'

export const COPY_ACCOUNT_MODULE_LABELS: Record<CopyAccountConfigModule, string> = {
  autoMessage: '自动发言',
  autoPopUp: '自动弹窗',
  autoReply: '自动回复',
  chrome: '浏览器设置',
}

export interface CopyAccountConfigOptions {
  fromAccountId: string
  toAccountIds: string[]
  modules: CopyAccountConfigModule[]
}

export interface CopyAccountConfigResult {
  copiedModules: CopyAccountConfigModule[]
  targetCount: number
}

function deepClone<T>(value: T): T {
  return structuredClone(value)
}

function copyAutoMessage(fromAccountId: string, toAccountId: string) {
  const source = useAutoMessageStore.getState().contexts[fromAccountId]
  if (!source) return

  const { setConfig, setBatchCount } = useAutoMessageStore.getState()
  setConfig(toAccountId, deepClone(source.config))
  if (typeof source.batchCount === 'number') {
    setBatchCount(toAccountId, source.batchCount)
  }
}

function copyAutoPopUp(fromAccountId: string, toAccountId: string) {
  const source = useAutoPopUpStore.getState().contexts[fromAccountId]
  if (!source) return

  const { setConfig, setShortcuts, setGlobalShortcut } = useAutoPopUpStore.getState()
  setConfig(toAccountId, deepClone(source.config))
  setShortcuts(toAccountId, deepClone(source.shortcuts ?? []))
  setGlobalShortcut(toAccountId, Boolean(source.isGlobalShortcut))
}

function copyAutoReply(fromAccountId: string, toAccountId: string) {
  const source = useAutoReplyConfigStore.getState().contexts[fromAccountId]
  if (!source?.config) return

  // 整份覆盖：mergeWithoutArray 对数组按源替换，等价于完整拷贝配置
  useAutoReplyConfigStore.getState().updateConfig(toAccountId, deepClone(source.config))
}

function copyChrome(fromAccountId: string, toAccountId: string) {
  const source = useChromeConfigStore.getState().contexts[fromAccountId]
  if (!source) return

  const { setPath, setHeadless } = useChromeConfigStore.getState()
  // 只复制路径与无头，绝不复制登录态
  setPath(toAccountId, source.path)
  setHeadless(toAccountId, source.headless)
}

const MODULE_COPYERS: Record<
  CopyAccountConfigModule,
  (fromAccountId: string, toAccountId: string) => void
> = {
  autoMessage: copyAutoMessage,
  autoPopUp: copyAutoPopUp,
  autoReply: copyAutoReply,
  chrome: copyChrome,
}

/**
 * 将源账号的选定配置深拷贝到目标账号（经 store API，保持内存与持久化一致）。
 * 不复制：登录态、任务运行态、AI Key（全局）。
 */
export function copyAccountConfig(options: CopyAccountConfigOptions): CopyAccountConfigResult {
  const { fromAccountId, toAccountIds, modules } = options
  const targets = [...new Set(toAccountIds)].filter(id => id && id !== fromAccountId)
  const uniqueModules = [...new Set(modules)]

  if (!fromAccountId || targets.length === 0 || uniqueModules.length === 0) {
    return { copiedModules: [], targetCount: 0 }
  }

  for (const toAccountId of targets) {
    for (const module of uniqueModules) {
      MODULE_COPYERS[module](fromAccountId, toAccountId)
    }
  }

  return {
    copiedModules: uniqueModules,
    targetCount: targets.length,
  }
}
