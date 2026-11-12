import { Result } from '@praha/byethrow'
import { AbortError } from '#/errors/AppError'
import {
  CommentAreaBlockedError,
  ElementContentMismatchedError,
  ElementDisabledError,
  ElementNotFoundError,
  GoodsListBlockedError,
  MaxTryCountExceededError,
} from '#/errors/PlatformError'
import { abortableSleep } from '#/utils'

/** 遮挡/列表刷新等暂时失败时的轮询间隔 */
export const TRANSIENT_POLL_MS = 2000

/** 自动弹窗：面板遮挡、找不到讲解按钮等，等待后重试，不中断任务 */
export function isTransientPopupError(err: unknown): boolean {
  if (err instanceof GoodsListBlockedError) return true
  if (err instanceof ElementNotFoundError) return true
  if (err instanceof ElementDisabledError) return true
  if (err instanceof ElementContentMismatchedError) return true
  if (err instanceof MaxTryCountExceededError) {
    return /讲解|查找商品|切换讲解|弹窗|弹卡/.test(err.message)
  }
  return false
}

/** 自动发言 / 自动回复：评论区暂时不可用，等待后重试，不中断任务 */
export function isTransientCommentError(err: unknown): boolean {
  if (err instanceof CommentAreaBlockedError) return true
  if (err instanceof ElementNotFoundError) return true
  if (err instanceof ElementDisabledError) return true
  if (err instanceof MaxTryCountExceededError) {
    return /评论|发送|回复/.test(err.message)
  }
  // 部分平台把填写失败包成 UnexpectedError
  if (err instanceof Error && /填写评论失败|评论发送后输入框未清空|公屏可能未真正发出/.test(err.message)) {
    return true
  }
  return false
}

/**
 * 遇到暂时失败时原地轮询，直到成功或遇到不可恢复错误。
 * 不主动关闭用户面板；恢复后继续同一条操作。
 */
export async function runUntilNotTransient<T>(
  fn: () => Promise<Result.Result<T, Error>>,
  options: {
    isTransient: (err: unknown) => boolean
    pollMs?: number
    signal?: AbortSignal
    onWaiting?: (err: Error) => void
    onResumed?: () => void
  },
): Result.ResultAsync<T, Error> {
  let waitingLogged = false
  while (true) {
    if (options.signal?.aborted) {
      return Result.fail(new AbortError())
    }

    const result = await fn()
    if (Result.isSuccess(result)) {
      if (waitingLogged) options.onResumed?.()
      return result
    }

    if (!options.isTransient(result.error)) {
      return result
    }

    if (!waitingLogged) {
      options.onWaiting?.(result.error)
      waitingLogged = true
    }

    const sleepResult = await abortableSleep(options.pollMs ?? TRANSIENT_POLL_MS, options.signal)
    if (Result.isFailure(sleepResult)) return sleepResult
  }
}
