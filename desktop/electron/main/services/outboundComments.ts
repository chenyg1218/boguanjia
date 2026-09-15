/** 本账号刚发出的评论内容，用于把回环消息标成主播评论，避免 AI/关键词再次回复 */

const OUTBOUND_TTL_MS = 60_000
const OUTBOUND_MAX = 30

const recentOutbound = new Map<string, { content: string; at: number }[]>()

/** 去掉空白后比较，兼容自动发言随机空格被平台回环时折叠的情况 */
export function normalizeOutboundContent(content: string) {
  return content.replace(/\s+/g, '').trim()
}

function prune(accountId: string, now = Date.now()) {
  const list = recentOutbound.get(accountId)
  if (!list?.length) return []
  const alive = list.filter(item => now - item.at < OUTBOUND_TTL_MS)
  recentOutbound.set(accountId, alive)
  return alive
}

export function rememberOutboundComment(accountId: string, content: string) {
  const normalized = normalizeOutboundContent(content)
  if (!normalized) return
  const now = Date.now()
  const next = [{ content: normalized, at: now }, ...prune(accountId, now)]
  recentOutbound.set(accountId, next.slice(0, OUTBOUND_MAX))
}

/** 发送失败时撤回一条登记，避免误伤后续同文案观众评论 */
export function forgetOutboundComment(accountId: string, content: string) {
  const normalized = normalizeOutboundContent(content)
  if (!normalized) return
  const alive = prune(accountId)
  const hitIndex = alive.findIndex(item => item.content === normalized)
  if (hitIndex < 0) return
  alive.splice(hitIndex, 1)
  recentOutbound.set(accountId, alive)
}

/** 若命中刚发出的内容，消费一次并返回 true */
export function consumeOutboundComment(accountId: string, content: string | undefined): boolean {
  if (!content) return false
  const normalized = normalizeOutboundContent(content)
  if (!normalized) return false
  const alive = prune(accountId)
  const hitIndex = alive.findIndex(item => item.content === normalized)
  if (hitIndex < 0) return false
  alive.splice(hitIndex, 1)
  recentOutbound.set(accountId, alive)
  return true
}

export function clearOutboundComments(accountId: string) {
  recentOutbound.delete(accountId)
}
