/** 中控台断开原因 */
export type DisconnectReason = 'manual' | 'unexpected' | 'license'

/** 可在重连后自动恢复的任务 */
export type ResumableTaskType = 'auto-comment' | 'auto-popup' | 'comment-listener'

export function isResumableTaskType(type: string): type is ResumableTaskType {
  return type === 'auto-comment' || type === 'auto-popup' || type === 'comment-listener'
}
