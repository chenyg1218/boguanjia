import { uniqueId } from 'lodash-es'
import type { ScopedLogger } from '#/logger'
import { type ITask, type TaskStopCallback, TaskStopReason } from './ITask'

export interface BaseTaskProps {
  taskName: string
  readonly logger: ScopedLogger
}

export function createTask(
  props: BaseTaskProps,
  hooks: { onStart?: () => Promise<void> | void; onStop?: () => void },
): ITask {
  const { taskName, logger } = props
  const taskId = uniqueId(taskName)
  const stopListeners: TaskStopCallback[] = []
  let isRunning = false

  async function start() {
    if (!isRunning) {
      isRunning = true
      try {
        await hooks.onStart?.()
      } catch (err) {
        stop(TaskStopReason.ERROR, err)
      }
    }
  }

  async function stop(reason: TaskStopReason = TaskStopReason.MANUAL, err?: unknown) {
    if (!isRunning) return
    isRunning = false
    if (err) {
      logger.error('任务因错误中断：', err)
      logger.info('可尝试重新连接直播控制台后再次启动任务')
    } else if (reason === TaskStopReason.LIVE_ENDED) {
      logger.info('检测到直播已结束，任务已停止')
    } else {
      logger.info('任务已停止')
    }
    hooks.onStop?.()
    stopListeners.forEach(cb => {
      cb(taskId, reason, err)
    })
  }

  return {
    start,
    stop,
    getTaskId: () => taskId,
    addStopListener: (cb: TaskStopCallback) => {
      stopListeners.push(cb)
    },
    isRunning: () => isRunning,
  }
}
