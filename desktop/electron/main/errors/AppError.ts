import { ErrorFactory } from '@praha/error-factory'

export class AppError extends Error {}

export class UnexpectedError extends ErrorFactory({
  name: 'UnexpectedError',
  message: ({ description }) => description || '意外错误，请查看运行日志后重试',
  fields: ErrorFactory.fields<{ description?: string }>(),
}) {}

export class AbortError extends ErrorFactory({
  name: 'AbortedError',
  message: '操作已取消',
}) {}

export class TaskNotSupportedError extends ErrorFactory({
  name: 'TaskNotImplementedError',
  message: ({ taskName, targetName }) => {
    const name = taskName
      .replace(/^update-/, '更新')
      .replace('auto-comment', '自动发言')
      .replace('auto-popup', '自动弹窗')
      .replace('send-batch-messages', '一键评论')
      .replace('comment-listener', '评论监听')
    const platform = targetName ? `「${targetName}」` : '当前平台'
    return `${platform}暂不支持「${name}」`
  },
  fields: ErrorFactory.fields<{ taskName: string; targetName?: string }>(),
}) {}
