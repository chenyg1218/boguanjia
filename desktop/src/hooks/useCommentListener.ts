import { useEffect, useRef } from 'react'
import { IPC_CHANNELS } from 'shared/ipcChannels'
import { abilities } from '@/abilities'
import { mergeWithoutArray } from '@/utils/misc'
import { useAccounts } from './useAccounts'
import { useAutoReplyStore } from './useAutoReply'
import {
  createDefaultConfig,
  useAutoReplyConfigStore,
} from './useAutoReplyConfig'
import { useLiveControlStore } from './useLiveControl'
import { useOnboardingStore } from './useOnboarding'
import { useToast } from './useToast'

/** 取消进行中的启动（用户停止、或配置重启抢先 stop） */
const listenGeneration = new Map<string, number>()
/** 配置热更新重启期间，避免「已停止」状态再次把监听拉起来 */
const restartingIds = new Set<string>()

function getListenerConfig(accountId: string) {
  return mergeWithoutArray(
    createDefaultConfig(),
    useAutoReplyConfigStore.getState().contexts[accountId]?.config ?? {},
  )
}

function supportsCommentListener(accountId: string) {
  const platform = useLiveControlStore.getState().contexts[accountId]?.platform
  if (!platform) return false
  return Boolean(abilities[platform]?.autoReply?.source?.length)
}

function isReplyRunning(accountId: string) {
  return useAutoReplyStore.getState().contexts[accountId]?.isRunning === true
}

function accountPrefix(accountId: string) {
  const name = useAccounts.getState().accounts.find(a => a.id === accountId)?.name
  return name ? `「${name}」` : ''
}

async function invokeStop(accountId: string) {
  try {
    await window.ipcRenderer.invoke(
      IPC_CHANNELS.tasks.autoReply.stopCommentListener,
      accountId,
    )
  } catch {
    // 未在监听时 stop 可忽略
  }
}

/** 启动评论监听。调用方应只在自动回复任务开启时使用。 */
export async function ensureCommentListener(accountId: string): Promise<boolean> {
  if (!supportsCommentListener(accountId)) return false

  const connected =
    useLiveControlStore.getState().contexts[accountId]?.isConnected === 'connected'
  if (!connected) return false

  const generation = (listenGeneration.get(accountId) ?? 0) + 1
  listenGeneration.set(accountId, generation)
  const setIsListening = useAutoReplyStore.getState().setIsListening

  try {
    setIsListening(accountId, 'waiting')
    const config = getListenerConfig(accountId)
    const result = await window.ipcRenderer.invoke(
      IPC_CHANNELS.tasks.autoReply.startCommentListener,
      accountId,
      {
        source: config.entry,
        ws: config.ws?.enable ? { port: config.ws.port } : undefined,
      },
    )
    if (listenGeneration.get(accountId) !== generation) {
      await invokeStop(accountId)
      return false
    }
    if (!result.ok) {
      setIsListening(accountId, 'error')
      return false
    }
    // 启动过程中用户已停止任务，或监听已异常退出
    if (!isReplyRunning(accountId)) {
      await invokeStop(accountId)
      return false
    }
    setIsListening(accountId, 'listening')
    return true
  } catch {
    if (listenGeneration.get(accountId) === generation) {
      setIsListening(accountId, 'error')
    }
    return false
  }
}

/** 停止评论监听，并作废尚未完成的启动。 */
export async function stopCommentListener(accountId: string) {
  listenGeneration.set(accountId, (listenGeneration.get(accountId) ?? 0) + 1)
  const listening = useAutoReplyStore.getState().contexts[accountId]?.isListening
  if (listening && listening !== 'stopped') {
    useAutoReplyStore.getState().setIsListening(accountId, 'stopped')
  }
  await invokeStop(accountId)
}

/**
 * 评论监听跟随自动回复任务：
 * 任务开启后才启动；停止任务或断开连接时不主动拉起。
 * 任务运行中若监听来源 / WebSocket 变更，则重启监听。
 * 启动失败或异常停止记为 error，不自动死循环重试。
 */
export function useReplyTaskCommentListener() {
  const { toast } = useToast()
  const accountId = useAccounts(s => s.currentAccountId)
  const isConnected = useLiveControlStore(s => s.contexts[accountId]?.isConnected)
  const isRunning = useAutoReplyStore(s => s.contexts[accountId]?.isRunning ?? false)
  const isListening = useAutoReplyStore(
    s => s.contexts[accountId]?.isListening ?? 'stopped',
  )
  const entry = useAutoReplyConfigStore(
    s => s.contexts[accountId]?.config?.entry ?? createDefaultConfig().entry,
  )
  const wsEnable = useAutoReplyConfigStore(
    s => s.contexts[accountId]?.config?.ws?.enable ?? false,
  )
  const wsPort = useAutoReplyConfigStore(
    s => s.contexts[accountId]?.config?.ws?.port ?? 12354,
  )

  const configKey = `${entry}:${wsEnable ? 1 : 0}:${wsPort}`
  const appliedConfigRef = useRef<string | null>(null)

  useEffect(() => {
    if (isConnected !== 'connected') {
      appliedConfigRef.current = null
      return
    }
    if (!supportsCommentListener(accountId)) return
    if (restartingIds.has(accountId)) return

    if (!isRunning) {
      appliedConfigRef.current = null
      if (isListening === 'listening' || isListening === 'waiting') {
        void stopCommentListener(accountId)
      }
      return
    }

    if (isListening === 'waiting') return

    if (isListening === 'listening') {
      if (appliedConfigRef.current === configKey) return
      if (appliedConfigRef.current === null) {
        // 断线重连后主进程已恢复监听，只对齐配置标记
        appliedConfigRef.current = configKey
        return
      }
      const previous = appliedConfigRef.current
      appliedConfigRef.current = configKey
      restartingIds.add(accountId)
      void (async () => {
        try {
          await stopCommentListener(accountId)
          if (!isReplyRunning(accountId)) return
          const ok = await ensureCommentListener(accountId)
          if (!ok && isReplyRunning(accountId)) {
            useAutoReplyStore.getState().setIsRunning(accountId, false)
            toast.error(`${accountPrefix(accountId)}评论监听重启失败，自动回复已停止`)
          }
        } finally {
          restartingIds.delete(accountId)
          if (useAutoReplyStore.getState().contexts[accountId]?.isListening === 'listening') {
            appliedConfigRef.current = configKey
          } else if (appliedConfigRef.current === configKey) {
            appliedConfigRef.current = previous
          }
        }
      })()
      return
    }

    // error：不自动重试，等用户再次开始任务或点重试
    if (isListening === 'error') return

    appliedConfigRef.current = configKey
    void (async () => {
      const ok = await ensureCommentListener(accountId)
      if (!isReplyRunning(accountId)) return
      if (!ok) {
        useAutoReplyStore.getState().setIsRunning(accountId, false)
        toast.error(`${accountPrefix(accountId)}评论监听启动失败，自动回复未开始`)
        return
      }
      useOnboardingStore.getState().markStartedTaskOnce()
    })()
  }, [accountId, isConnected, isRunning, isListening, configKey, toast])
}
