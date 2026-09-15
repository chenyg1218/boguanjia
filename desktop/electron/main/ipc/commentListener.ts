import { Result } from '@praha/byethrow'
import { IPC_CHANNELS } from 'shared/ipcChannels'
import { createLogger } from '#/logger'
import { accountManager } from '#/managers/AccountManager'
import { assertAccountLicensed } from '#/services/licenseGate'
import { toTaskResult, typedIpcMainHandle } from '#/utils'

const TASK_NAME = '自动回复'
const TASK_TYPE = 'comment-listener'

function accountLogger(accountId: string) {
  return createLogger(`@${accountManager.getAccountName(accountId)}`).scope(TASK_NAME)
}

function setupIpcHandlers() {
  typedIpcMainHandle(
    IPC_CHANNELS.tasks.autoReply.startCommentListener,
    async (_, accountId: string, config: CommentListenerConfig) => {
      const result = await Result.pipe(
        assertAccountLicensed(accountId),
        Result.andThen(() => accountManager.getSession(accountId)),
        Result.andThen(accountSession =>
          accountSession.startTask({ type: TASK_TYPE, config: config }),
        ),
        Result.inspectError(error => {
          accountLogger(accountId).error('启动评论监听失败：', error)
        }),
      )
      return toTaskResult(result)
    },
  )

  typedIpcMainHandle(
    IPC_CHANNELS.tasks.autoReply.stopCommentListener,
    async (_, accountId: string) => {
      Result.pipe(
        accountManager.getSession(accountId),
        Result.inspect(accountSession => accountSession.stopTask(TASK_TYPE)),
        Result.inspectError(error => {
          accountLogger(accountId).error('停止监听评论失败：', error)
        }),
      )
    },
  )

  typedIpcMainHandle(IPC_CHANNELS.tasks.autoReply.sendReply, async (_, accountId, message) => {
    const logger = accountLogger(accountId)
    const result = await Result.pipe(
      assertAccountLicensed(accountId),
      Result.andThen(() => accountManager.getSession(accountId)),
      Result.andThen(accountSession => accountSession.performCommentOnce(message)),
      Result.inspect(() => {
        logger.success(`发送回复: ${message}`)
      }),
      Result.inspectError(error => {
        logger.error('发送回复失败：', error)
      }),
    )
    return toTaskResult(result)
  })
}

export function setupAutoReplyIpcHandlers() {
  setupIpcHandlers()
}
