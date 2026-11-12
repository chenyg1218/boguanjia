import { Result } from '@praha/byethrow'
import { IPC_CHANNELS } from 'shared/ipcChannels'
import { AbortError } from '#/errors/AppError'
import type { ScopedLogger } from '#/logger'
import {
  type IPlatform,
  isPerformPopup,
  type IPerformPopup,
} from '#/platforms/IPlatform'
import { abortableSleep, mergeWithoutArray, randomInt, takeScreenshot } from '#/utils'
import windowManager from '#/windowManager'
import { createIntervalTask } from './IntervalTask'
import { runWithRetry } from './retry'
import { isTransientPopupError, runUntilNotTransient } from './transientControl'

const TASK_NAME = '自动弹窗'
/** 切品前的短暂间隔（讲解时长已在 execute 内等待完毕时使用） */
const SWITCH_GAP_MS = 500

const retryOptions = {
  maxRetries: 3,
  retryDelay: 1000,
}

function buildExecutionQueue(config: AutoPopupConfig): { id: number; interval: [number, number] }[] {
  const globalInterval = config.scheduler.interval
  const items = config.goodsItems
  if (!items || items.length === 0) {
    return config.goodsIds.map(id => ({ id, interval: globalInterval }))
  }
  const queue: { id: number; interval: [number, number] }[] = []
  for (const item of items) {
    const count = Math.max(1, Math.min(item.repeatCount ?? 1, 10000))
    const interval = item.itemInterval && item.itemInterval[0] > 0 && item.itemInterval[1] > 0
      ? item.itemInterval
      : globalInterval
    for (let i = 0; i < count; i++) {
      queue.push({ id: item.id, interval })
    }
  }
  return queue
}

function resolveHoldMs(interval: [number, number]) {
  const [mn, mx] = [Math.min(...interval), Math.max(...interval)]
  return randomInt(mn, mx)
}

export function createAutoPopupTask(
  platform: IPlatform & IPerformPopup,
  taskConfig: AutoPopupConfig,
  account: Account,
  _logger: ScopedLogger,
) {
  const logger = _logger.scope(TASK_NAME)
  let config = { ...taskConfig }
  let queue = buildExecutionQueue(config)
  let queueIndex = -1

  const intervalTaskResult = createIntervalTask(execute, {
    interval: config.scheduler.interval,
    taskName: TASK_NAME,
    logger,
  })

  if (Result.isFailure(intervalTaskResult)) {
    return intervalTaskResult
  }

  const intervalTask = intervalTaskResult.value

  async function execute(signal: AbortSignal) {
    const next = getNext()
    const holdMs = resolveHoldMs(next.interval)
    const cardVisibleMs = platform.getPopupCardVisibleMs?.() ?? null
    const needsCardRefresh =
      typeof cardVisibleMs === 'number' &&
      cardVisibleMs > 0 &&
      typeof platform.refreshPopupCard === 'function'

    // 需要续弹卡时：讲解时长在本函数内等待，间隔任务只留切品空隙
    intervalTask.updateInterval(needsCardRefresh ? SWITCH_GAP_MS : next.interval)

    // 全平台：遮挡/找不到讲解按钮等暂时失败时等待恢复，不停任务、不切品
    const result = await runUntilNotTransient(
      () =>
        runWithRetry(
          async () => {
            if (signal.aborted) {
              return Result.fail(new AbortError())
            }
            return platform.performPopup(next.id, signal)
          },
          {
            ...retryOptions,
            logger,
            signal,
            shouldRetry: err => !isTransientPopupError(err),
            onRetryError: err => {
              if (isTransientPopupError(err)) return
              const page = platform.getPopupPage()
              if (page) takeScreenshot(page, TASK_NAME, account.name)
            },
          },
        ),
      {
        isTransient: isTransientPopupError,
        signal,
        onWaiting: err =>
          logger.warn(
            `暂时无法讲解商品 ${next.id}（${err.message}），等待恢复后继续；任务不停止`,
          ),
        onResumed: () => logger.info(`商品列表已恢复，继续讲解商品 ${next.id}`),
      },
    )

    if (Result.isFailure(result)) {
      return result
    }
    logger.success(`商品 ${next.id} 讲解成功`)

    if (!needsCardRefresh || cardVisibleMs == null) {
      return result
    }

    // 讲解时长内按平台弹卡可见时长续点，让观众侧展示覆盖整段讲解
    const refreshEveryMs = cardVisibleMs
    let elapsed = 0
    while (elapsed + refreshEveryMs < holdMs) {
      const sleepResult = await abortableSleep(refreshEveryMs, signal)
      if (Result.isFailure(sleepResult)) return sleepResult
      elapsed += refreshEveryMs

      const refreshResult = await runWithRetry(
        async () => {
          if (signal.aborted) {
            return Result.fail(new AbortError())
          }
          const refreshed = await platform.refreshPopupCard!(next.id, signal)
          if (Result.isSuccess(refreshed)) {
            logger.info(
              `商品 ${next.id} 续弹商品卡（已讲 ${Math.round(elapsed / 1000)}s / ${Math.round(holdMs / 1000)}s）`,
            )
          }
          return refreshed
        },
        {
          ...retryOptions,
          logger,
          signal,
          onRetryError: () => {
            const page = platform.getPopupPage()
            if (page) takeScreenshot(page, TASK_NAME, account.name)
          },
        },
      )
      if (Result.isFailure(refreshResult)) {
        return refreshResult
      }
    }

    const remaining = holdMs - elapsed
    if (remaining > 0) {
      const sleepResult = await abortableSleep(remaining, signal)
      if (Result.isFailure(sleepResult)) return sleepResult
    }

    return Result.succeed()
  }

  function getNext(): { id: number; interval: [number, number] } {
    if (config.random) {
      queueIndex = randomInt(0, queue.length - 1)
    } else {
      queueIndex = (queueIndex + 1) % queue.length
    }
    return queue[queueIndex]
  }

  function validateConfig(userConfig: AutoPopupConfig) {
    return Result.pipe(
      intervalTask.validateInterval(userConfig.scheduler.interval),
      Result.andThen(() => {
        const hasItems = userConfig.goodsItems && userConfig.goodsItems.length > 0
        const hasIds = userConfig.goodsIds.length > 0
        if (!hasItems && !hasIds)
          return Result.fail(new Error('商品配置验证失败: 必须提供至少一个商品ID'))
        return Result.succeed()
      }),
      Result.inspect(() => {
        const q = buildExecutionQueue(userConfig)
        logger.info(`商品配置验证通过，共加载 ${q.length} 个弹窗任务`)
      }),
    )
  }

  function updateConfig(newConfig: Partial<AutoPopupConfig>) {
    const mergedConfig = mergeWithoutArray(config, newConfig)
    return Result.pipe(
      validateConfig(mergedConfig),
      Result.andThen(_ => intervalTask.validateInterval(mergedConfig.scheduler.interval)),
      Result.inspect(() => {
        config = mergedConfig
        queue = buildExecutionQueue(config)
        queueIndex = -1
        intervalTask.restart()
      }),
      Result.inspectError(err => logger.error('配置更新失败：', err)),
    )
  }

  intervalTask.addStopListener((_id, reason) => {
    windowManager.send(IPC_CHANNELS.tasks.autoPopUp.stoppedEvent, {
      accountId: account.id,
      reason,
    })
  })

  return Result.pipe(
    validateConfig(config),
    Result.map(_ => ({
      ...intervalTask,
      updateConfig,
    })),
  )
}

/** 单次弹指定商品（关键词触发等）；暂时失败时等待恢复，不直接放弃 */
export async function performPopupOnce(
  platform: IPlatform,
  goodsId: number,
  logger: ScopedLogger,
): Result.ResultAsync<void, Error> {
  if (!isPerformPopup(platform)) {
    return Result.fail(new Error('当前平台不支持弹窗'))
  }
  const scoped = logger.scope(TASK_NAME)
  const result = await runUntilNotTransient(() => platform.performPopup(goodsId), {
    isTransient: isTransientPopupError,
    onWaiting: err =>
      scoped.warn(`暂时无法弹窗商品 ${goodsId}（${err.message}），等待恢复后继续`),
    onResumed: () => scoped.info(`已恢复，继续弹窗商品 ${goodsId}`),
  })
  if (Result.isSuccess(result)) {
    scoped.success(`单次弹窗商品 ${goodsId} 成功`)
  }
  return result
}
