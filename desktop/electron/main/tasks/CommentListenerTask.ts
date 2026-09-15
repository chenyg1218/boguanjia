import { Result } from '@praha/byethrow'
import { IPC_CHANNELS } from 'shared/ipcChannels'
import type { ScopedLogger } from '#/logger'
import type { ICommentListener } from '#/platforms/IPlatform'
import { consumeOutboundComment } from '#/services/outboundComments'
import { WebSocketService } from '#/services/WebSocketService'
import windowManager from '#/windowManager'
import { createTask } from './BaseTask'
import { TaskStopReason } from './ITask'

const TASK_NAME = '自动回复'

export function createCommentListenerTask(
  platform: ICommentListener,
  config: CommentListenerConfig,
  account: Account,
  _logger: ScopedLogger,
) {
  const logger = _logger.scope(TASK_NAME)
  let wsService: WebSocketService | null

  async function execute() {
    try {
      if (config.ws) {
        wsService = new WebSocketService()
        // WebSocket 服务启动失败不会影响评论监听
        wsService.start(config.ws.port).catch(err => {
          wsService?.stop(err)
          wsService = null
        })
      }
      await platform.startCommentListener(broadcastMessage, config.source)
      logger.info('开始监听评论')
    } catch (err) {
      // 失败了还要告诉渲染层关闭按钮
      windowManager.send(IPC_CHANNELS.tasks.autoReply.listenerStopped, {
        accountId: account.id,
        reason: TaskStopReason.ERROR,
      })
      task.stop(TaskStopReason.ERROR, err)
    }
  }

  function broadcastMessage(message: LiveMessage) {
    const comment: LiveMessage = {
      ...message,
      time: Date.now(),
    }
    const alreadyHost = 'is_host' in comment && Boolean(comment.is_host)
    // 已标主播的消息（如小红书 send_comment）不消费 outbound，留给可能的二次回环
    if (
      !alreadyHost &&
      'content' in comment &&
      typeof comment.content === 'string' &&
      consumeOutboundComment(account.id, comment.content)
    ) {
      ;(comment as LiveMessage & { is_host?: boolean }).is_host = true
    }
    windowManager.send(IPC_CHANNELS.tasks.autoReply.showComment, {
      accountId: account.id,
      comment: comment,
    })

    wsService?.broadcast(comment)
  }

  function updateConfig(cfg: Partial<CommentListenerConfig>) {
    if (cfg.ws && cfg.ws.port !== config.ws?.port) {
      config.ws = cfg.ws
      if (!wsService) {
        wsService = new WebSocketService()
      }
      wsService.stop()
      wsService.start(config.ws.port).catch(err => {
        wsService?.stop(err)
        wsService = null
      })
    }
    if (cfg.source && config.source !== cfg.source) {
      config.source = cfg.source
      platform.stopCommentListener()
      platform.startCommentListener(broadcastMessage, cfg.source)
    }
    return Result.succeed()
  }

  const task = createTask(
    {
      taskName: TASK_NAME,
      logger,
    },
    {
      onStart: async () => {
        await execute()
      },
      onStop: () => {
        platform.stopCommentListener()
        wsService?.stop()
        wsService = null
      },
    },
  )

  task.addStopListener((_id, reason) => {
    // start 失败时 execute 已发过 ERROR；此处补齐手动/会话停止
    if (reason !== TaskStopReason.ERROR) {
      windowManager.send(IPC_CHANNELS.tasks.autoReply.listenerStopped, {
        accountId: account.id,
        reason,
      })
    }
  })

  return Result.succeed({
    ...task,
    updateConfig,
  })
}
