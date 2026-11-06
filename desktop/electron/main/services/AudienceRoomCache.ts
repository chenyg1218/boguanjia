/** L1 仅有 roomId；L2 补齐 roomUrl 后可预热进房 */
export type AudienceRoomCacheEntry = {
  midAccountId: string
  roomId?: string
  secUid?: string
  /** 观众端完整链接；有值表示 L2 可进房 */
  roomUrl?: string
}

/** 中控开播后自动解析并缓存的本场观众端链接（供小号互动进房） */
let cache: AudienceRoomCacheEntry | null = null

export const audienceRoomCache = {
  get(): AudienceRoomCacheEntry | null {
    return cache
  },

  set(entry: AudienceRoomCacheEntry) {
    cache = entry
  },

  /** 是否已具备可进房的观众端链接 */
  isReady(midAccountId?: string): boolean {
    if (!cache?.roomUrl) return false
    if (midAccountId && cache.midAccountId !== midAccountId) return false
    return true
  },

  clear(midAccountId?: string) {
    if (!midAccountId || cache?.midAccountId === midAccountId) {
      cache = null
    }
  },
}
