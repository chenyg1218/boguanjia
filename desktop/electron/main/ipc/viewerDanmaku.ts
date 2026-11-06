import { Result } from '@praha/byethrow'
import { IPC_CHANNELS } from 'shared/ipcChannels'
import { createLogger } from '#/logger'
import { viewerAccountManager } from '#/managers/ViewerAccountManager'
import { telemetryService } from '#/services/TelemetryService'
import { toTaskResult, typedIpcMainHandle } from '#/utils'

const TASK_NAME = '小号互动'

function setupIpcHandlers() {
  typedIpcMainHandle(
    IPC_CHANNELS.tasks.viewerDanmaku.start,
    async (_, accountId, config, options) => {
      const result = await Result.pipe(
        viewerAccountManager.getSession(accountId),
        Result.andThen(session => session.startDanmaku(config, options)),
        Result.inspect(() => {
          telemetryService.trackTaskStart('viewer-danmaku')
        }),
        Result.inspectError(error => {
          const logger = createLogger(
            `@互动/${viewerAccountManager.getAccountName(accountId)}`,
          ).scope(TASK_NAME)
          logger.error('启动任务失败：', error)
        }),
      )
      return toTaskResult(result)
    },
  )

  typedIpcMainHandle(IPC_CHANNELS.tasks.viewerDanmaku.stop, async (_, accountId) => {
    return Result.pipe(
      viewerAccountManager.getSession(accountId),
      Result.inspect(session => session.stopDanmaku()),
      Result.inspectError(error => {
        const logger = createLogger(
          `@互动/${viewerAccountManager.getAccountName(accountId)}`,
        ).scope(TASK_NAME)
        logger.error('停止任务失败：', error)
      }),
      r => Result.isSuccess(r),
    )
  })

  typedIpcMainHandle(IPC_CHANNELS.tasks.viewerDanmaku.stopAll, async () => {
    viewerAccountManager.stopAllDanmaku()
    return true
  })

  typedIpcMainHandle(
    IPC_CHANNELS.tasks.viewerDanmaku.updateConfig,
    async (_, accountId, newConfig) => {
      const logger = createLogger(
        `@互动/${viewerAccountManager.getAccountName(accountId)}`,
      ).scope(TASK_NAME)
      Result.pipe(
        viewerAccountManager.getSession(accountId),
        Result.andThen(session => session.updateDanmakuConfig(newConfig)),
        Result.inspect(_ => logger.info('更新配置成功')),
        Result.inspectError(error => logger.error('更新配置失败：', error)),
      )
    },
  )
}

export function setupViewerDanmakuIpcHandlers() {
  setupIpcHandlers()
}
