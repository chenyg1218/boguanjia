import { useCallback } from 'react'
import { IPC_CHANNELS } from 'shared/ipcChannels'
import { DISABLED_ACCOUNT_HINT, TASK_TYPE_LABEL } from '@/constants/copy'
import { useAccounts } from './useAccounts'
import { useToast } from './useToast'

/**
 * 支持的任务类型
 */
type Task = AutoCommentTask | AutoPopupTask

/**
 * 任务类型字符串
 */
export type TaskType = Task['type']

/**
 * 任务控制 Hook 参数
 */
interface UseTaskControlParams<T extends TaskType> {
  /** 任务类型 */
  taskType: T
  /** 获取任务运行状态的函数 */
  getIsRunning: () => boolean
  /** 获取任务配置的函数 */
  getConfig: () => Extract<Task, { type: T }>['config']
  /** 设置任务运行状态的函数 */
  setIsRunning: (running: boolean) => void
  /** 任务启动成功提示消息 */
  startSuccessMessage?: string
  /** 任务启动失败提示消息（主进程无具体原因时的回落） */
  startFailureMessage?: string
}

/**
 * 通用的任务控制 Hook：统一启动/停止与错误提示
 */
export function useTaskControl<T extends TaskType>(params: UseTaskControlParams<T>) {
  const {
    taskType,
    getIsRunning,
    getConfig,
    setIsRunning,
    startSuccessMessage,
    startFailureMessage,
  } = params

  const { toast } = useToast()
  const accountId = useAccounts(store => store.currentAccountId)
  const account = useAccounts(store => store.accounts.find(a => a.id === accountId))
  const label = TASK_TYPE_LABEL[taskType] ?? '任务'

  const onStartTask = useCallback(async () => {
    if (account?.disabled) {
      toast.error(DISABLED_ACCOUNT_HINT)
      return
    }

    const config = getConfig()

    let result: TaskIpcResult
    if (taskType === 'auto-comment') {
      result = await window.ipcRenderer.invoke(
        IPC_CHANNELS.tasks.autoMessage.start,
        accountId,
        config as AutoCommentConfig,
      )
    } else {
      result = await window.ipcRenderer.invoke(
        IPC_CHANNELS.tasks.autoPopUp.start,
        accountId,
        config as AutoPopupConfig,
      )
    }

    if (result.ok) {
      setIsRunning(true)
      toast.success(startSuccessMessage || `${label}已启动`)
    } else {
      setIsRunning(false)
      toast.error(
        result.error ||
          startFailureMessage ||
          `${label}启动失败。请确认已连接直播控制台后重试`,
      )
    }
  }, [
    account?.disabled,
    getConfig,
    setIsRunning,
    toast,
    accountId,
    startSuccessMessage,
    startFailureMessage,
    taskType,
    label,
  ])

  const onStopTask = useCallback(async () => {
    if (taskType === 'auto-comment') {
      await window.ipcRenderer.invoke(IPC_CHANNELS.tasks.autoMessage.stop, accountId)
    } else {
      await window.ipcRenderer.invoke(IPC_CHANNELS.tasks.autoPopUp.stop, accountId)
    }
    setIsRunning(false)
  }, [setIsRunning, accountId, taskType])

  return {
    isRunning: getIsRunning(),
    onStartTask,
    onStopTask,
  }
}
