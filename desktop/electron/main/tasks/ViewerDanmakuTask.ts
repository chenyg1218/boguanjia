import { Result } from '@praha/byethrow'
import { ErrorFactory } from '@praha/error-factory'
import { merge } from 'lodash-es'
import { IPC_CHANNELS } from 'shared/ipcChannels'
import { AbortError } from '#/errors/AppError'
import type { ScopedLogger } from '#/logger'
import type { IPerformComment } from '#/platforms/IPlatform'
import { insertRandomSpaces, randomInt, replaceVariant, takeScreenshot } from '#/utils'
import windowManager from '#/windowManager'
import { createIntervalTask } from './IntervalTask'
import { runWithRetry } from './retry'

const TASK_NAME = '小号互动'
/** 默认偏保守，降低刷屏风险 */
export const DEFAULT_VIEWER_INTERVAL: [number, number] = [60_000, 120_000]
/** 硬下限 3 秒；默认仍建议 60～120 秒 */
const MIN_INTERVAL_MS = 3_000

const retryOptions = {
  maxRetries: 3,
  retryDelay: 1000,
}

export function createViewerDanmakuTask(
  platform: IPerformComment,
  taskConfig: ViewerDanmakuConfig,
  account: { id: string; name: string },
  lgr: ScopedLogger,
) {
  const logger = lgr.scope(TASK_NAME)
  let arrayIndex = -1
  let config = { ...taskConfig }

  const intervalTaskResult = createIntervalTask(execute, {
    interval: config.scheduler.interval,
    logger,
    taskName: TASK_NAME,
  })

  if (Result.isFailure(intervalTaskResult)) {
    return intervalTaskResult
  }

  const intervalTask = intervalTaskResult.value

  function getNextMessage() {
    const messages = config.messages
    if (config.random) {
      if (messages.length <= 1) {
        arrayIndex = 0
      } else if (arrayIndex < 0) {
        arrayIndex = randomInt(0, messages.length - 1)
      } else {
        const nextIndex = randomInt(0, messages.length - 2)
        arrayIndex = nextIndex < arrayIndex ? nextIndex : nextIndex + 1
      }
    } else {
      arrayIndex = (arrayIndex + 1) % messages.length
    }
    return messages[arrayIndex]
  }

  function validateConfig(userConfig: ViewerDanmakuConfig): Result.Result<void, Error> {
    const [a, b] = userConfig.scheduler.interval
    if (Math.min(a, b) < MIN_INTERVAL_MS) {
      return Result.fail(
        new ViewerDanmakuValidationError({
          description: `发送间隔不能低于 ${MIN_INTERVAL_MS / 1000} 秒`,
        }),
      )
    }
    if (userConfig.messages.length === 0) {
      return Result.fail(
        new ViewerDanmakuValidationError({ description: '必须提供至少一条话术' }),
      )
    }
    const emptyIdx = userConfig.messages.findIndex(m => m.content.trim().length === 0)
    if (emptyIdx >= 0) {
      return Result.fail(
        new ViewerDanmakuValidationError({
          description: `第 ${emptyIdx + 1} 条话术为空`,
        }),
      )
    }
    return Result.succeed()
  }

  async function execute(signal: AbortSignal) {
    return runWithRetry(
      async () => {
        if (signal.aborted) return Result.fail(new AbortError())
        const message = getNextMessage()
        let content = replaceVariant(message.content)
        if (config.extraSpaces) {
          content = insertRandomSpaces(content)
        }
        const sent = await platform.performComment(content)
        if (Result.isFailure(sent)) return sent
        logger.success(`发送评论: ${content}`)
        return Result.succeed()
      },
      {
        ...retryOptions,
        logger,
        signal,
        onRetryError: () => {
          const page = platform.getCommentPage()
          if (page) takeScreenshot(page, TASK_NAME, account.name)
        },
      },
    )
  }

  function updateConfig(newConfig: Partial<ViewerDanmakuConfig>) {
    const mergedConfig = merge({}, config, newConfig)
    return Result.pipe(
      validateConfig(mergedConfig),
      Result.andThen(_ => intervalTask.validateInterval(mergedConfig.scheduler.interval)),
      Result.inspect(() => {
        config = mergedConfig
        intervalTask.restart()
      }),
      Result.inspectError(err => logger.error('配置更新失败：', err)),
    )
  }

  intervalTask.addStopListener((_id, reason) => {
    windowManager.send(IPC_CHANNELS.tasks.viewerDanmaku.stoppedEvent, {
      accountId: account.id,
      reason,
    })
  })

  return Result.pipe(
    validateConfig(config),
    Result.map(() => ({
      ...intervalTask,
      updateConfig,
    })),
  )
}

class ViewerDanmakuValidationError extends ErrorFactory({
  name: 'ViewerDanmakuValidationError',
  message: ({ description }) => `小号互动配置验证失败: ${description}`,
  fields: ErrorFactory.fields<{ description: string }>(),
}) {}
