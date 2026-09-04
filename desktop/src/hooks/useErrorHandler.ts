import { useCallback } from 'react'
import { useToast } from './useToast'

/**
 * 统一的错误处理 Hook：优先展示真实原因，再附带场景说明
 */
export function useErrorHandler() {
  const { toast } = useToast()

  /**
   * @param error - 错误对象或错误消息
   * @param context - 可选的场景说明（如「自动发送回复失败」），会与真实原因拼接
   */
  const handleError = useCallback(
    (error: unknown, context?: string) => {
      const reason = error instanceof Error ? error.message : String(error)
      const displayMessage = context
        ? reason
          ? `${context}：${reason}`
          : context
        : reason || '操作失败，请查看运行日志后重试'

      console.error('错误:', error)
      toast.error(displayMessage)
    },
    [toast],
  )

  const withErrorHandling = useCallback(
    <T extends unknown[], R>(asyncFn: (...args: T) => Promise<R>, context?: string) => {
      return async (...args: T): Promise<R | undefined> => {
        try {
          return await asyncFn(...args)
        } catch (error) {
          handleError(error as Error, context)
          return undefined
        }
      }
    },
    [handleError],
  )

  return {
    handleError,
    withErrorHandling,
  }
}
