import type { Page, Response } from 'playwright'
import { sleep } from '#/utils'

const LIVE_HOST = 'https://live.douyin.com'
const WAIT_MS = 18_000

/** 中控解析到的本场标识；进房应以 roomId + reflow 为准，避免误抓其它短号 */
export type AudienceRoomRef = {
  webRid?: string
  uniqueId?: string
  roomId?: string
  secUid?: string
  anchorId?: string
  userId?: string
}

export type ResolvedAudienceRoom = {
  roomUrl: string
  roomId?: string
  secUid?: string
}

function isLikelyRoomId(id: string): boolean {
  return /^\d{17,}$/.test(id)
}

function isLikelyPathId(id: string): boolean {
  const t = id.trim()
  if (!t || isLikelyRoomId(t)) return false
  if (/^\d{6,16}$/.test(t)) return true
  return /^[\w.-]{2,64}$/i.test(t)
}

function takePathId(id: string | null | undefined): string | undefined {
  if (id == null) return undefined
  const t = String(id).trim()
  return isLikelyPathId(t) ? t : undefined
}

function takeRoomId(id: string | null | undefined): string | undefined {
  if (id == null) return undefined
  const t = String(id).trim()
  return isLikelyRoomId(t) ? t : undefined
}

function takeSecUid(id: string | null | undefined): string | undefined {
  if (id == null) return undefined
  const t = String(id).trim()
  if (t.length >= 20 && /[A-Za-z]/.test(t)) return t
  return undefined
}

function takeUserLikeId(id: string | null | undefined): string | undefined {
  if (id == null) return undefined
  const t = String(id).trim()
  if (/^\d{6,20}$/.test(t) && !isLikelyRoomId(t)) return t
  return undefined
}

function mergeRef(target: AudienceRoomRef, src: AudienceRoomRef) {
  if (src.webRid && !target.webRid) target.webRid = src.webRid
  if (src.uniqueId && !target.uniqueId) target.uniqueId = src.uniqueId
  if (src.roomId && !target.roomId) target.roomId = src.roomId
  if (src.secUid && !target.secUid) target.secUid = src.secUid
  if (src.anchorId && !target.anchorId) target.anchorId = src.anchorId
  if (src.userId && !target.userId) target.userId = src.userId
}

function pathIdFromRef(ref: AudienceRoomRef): string | undefined {
  return ref.webRid || ref.uniqueId
}

/**
 * 观众端主站进房链接（卖货/普通直播通用），形态对齐：
 * https://live.douyin.com/{web_rid}?activity_name=&anchor_id=...&banner_type=recommend&category_name=all&page_type=live_main_page&user_id=...
 * 比 web_share_link 分享链更稳，电商直播尤其如此。
 */
function buildLiveUrl(pathId: string, ref?: AudienceRoomRef): string {
  const qs = new URLSearchParams()
  qs.set('activity_name', '')
  if (ref?.anchorId) qs.set('anchor_id', ref.anchorId)
  qs.set('banner_type', 'recommend')
  qs.set('category_name', 'all')
  qs.set('page_type', 'live_main_page')
  if (ref?.userId) qs.set('user_id', ref.userId)
  return `${LIVE_HOST}/${pathId}?${qs.toString()}`
}

/** 把 reflow/分享链改写成主站进房链（去掉 web_share_link，补 page_type） */
export function toMainPageLiveUrl(href: string, ref?: AudienceRoomRef): string {
  try {
    const u = new URL(href)
    if (!/live\.douyin\.com$/i.test(u.hostname)) return href
    const pathId = u.pathname.replace(/^\//, '').split('/')[0]
    if (!pathId || isLikelyRoomId(pathId)) return href
    const merged: AudienceRoomRef = { ...ref }
    const anchor = u.searchParams.get('anchor_id')
    if (anchor) merged.anchorId = merged.anchorId || takeUserLikeId(anchor)
    const user = u.searchParams.get('user_id')
    if (user) merged.userId = merged.userId || takeUserLikeId(user)
    const room = u.searchParams.get('room_id')
    if (room) merged.roomId = merged.roomId || takeRoomId(room)
    return buildLiveUrl(pathId, merged)
  } catch {
    return href
  }
}

function reflowUrlFor(ref: AudienceRoomRef): string | null {
  if (!ref.roomId) return null
  return ref.secUid
    ? `https://webcast.amemv.com/douyin/webcast/reflow/${ref.roomId}?sec_user_id=${encodeURIComponent(ref.secUid)}`
    : `https://webcast.amemv.com/douyin/webcast/reflow/${ref.roomId}`
}

function isLiveDouyinRoomUrl(href: string): boolean {
  try {
    const u = new URL(href)
    if (!/live\.douyin\.com$/i.test(u.hostname)) return false
    const rid = u.pathname.replace(/^\//, '').split('/')[0]
    return Boolean(rid) && isLikelyPathId(rid)
  } catch {
    return false
  }
}

/** 只从 promotions_v2 等直播相关接口拿 room_id，避免页面里其它短号污染 */
function pickRoomIdFromPromotions(data: unknown): string | undefined {
  if (!data || typeof data !== 'object') return undefined
  const root = data as Record<string, unknown>
  const nested = (root.data && typeof root.data === 'object' ? root.data : root) as Record<
    string,
    unknown
  >
  for (const key of ['room_id', 'roomId', 'live_room_id']) {
    const id = takeRoomId(nested[key] != null ? String(nested[key]) : undefined)
    if (id) return id
  }
  return takeRoomId(
    JSON.stringify(data).match(/"room_id"\s*:\s*"?(\d{17,})"?/)?.[1],
  )
}

function pickRefFromJson(data: unknown): AudienceRoomRef {
  const out: AudienceRoomRef = {}
  if (!data || typeof data !== 'object') return out

  const walk = (node: unknown, depth: number) => {
    if (depth > 12 || node == null) return
    if (typeof node !== 'object') return
    if (Array.isArray(node)) {
      for (const item of node) walk(item, depth + 1)
      return
    }
    const obj = node as Record<string, unknown>

    for (const key of ['web_rid', 'webRid']) {
      const v = obj[key]
      const id = typeof v === 'string' || typeof v === 'number' ? takePathId(String(v)) : undefined
      if (id && /^\d+$/.test(id)) out.webRid = out.webRid || id
    }
    for (const key of ['unique_id', 'uniqueId', 'display_id', 'displayId', 'short_id']) {
      const v = obj[key]
      const id = typeof v === 'string' || typeof v === 'number' ? takePathId(String(v)) : undefined
      if (!id) continue
      if (/^\d{6,16}$/.test(id)) out.webRid = out.webRid || id
      else out.uniqueId = out.uniqueId || id
    }
    for (const key of ['room_id', 'roomId', 'live_room_id']) {
      const v = obj[key]
      const id = typeof v === 'string' || typeof v === 'number' ? takeRoomId(String(v)) : undefined
      if (id) out.roomId = out.roomId || id
    }
    for (const key of ['sec_uid', 'secUid', 'sec_user_id', 'secUserId']) {
      const v = obj[key]
      const id = typeof v === 'string' ? takeSecUid(v) : undefined
      if (id) out.secUid = out.secUid || id
    }
    for (const key of ['anchor_id', 'anchorId', 'owner_user_id', 'ownerUserId']) {
      const v = obj[key]
      const id = typeof v === 'string' || typeof v === 'number' ? takeUserLikeId(String(v)) : undefined
      if (id) out.anchorId = out.anchorId || id
    }
    for (const key of ['user_id', 'userId', 'uid']) {
      const v = obj[key]
      const id = typeof v === 'string' || typeof v === 'number' ? takeUserLikeId(String(v)) : undefined
      if (id) out.userId = out.userId || id
    }

    for (const key of ['owner', 'author', 'anchor', 'user', 'user_info', 'userInfo', 'room']) {
      if (obj[key]) walk(obj[key], depth + 1)
    }
    for (const v of Object.values(obj)) {
      if (out.webRid && out.roomId && out.secUid) return
      walk(v, depth + 1)
    }
  }
  walk(data, 0)
  return out
}

async function extractRoomIdFromDom(page: Page): Promise<AudienceRoomRef> {
  if (page.isClosed()) return {}
  try {
    return await page.evaluate(() => {
      const html = document.documentElement?.innerHTML ?? ''
      const out: { roomId?: string; secUid?: string } = {}
      const roomId =
        html.match(/"room_id"\s*:\s*"?(\d{17,})"?/i) ||
        html.match(/live_room_id["']?\s*[:=]\s*["']?(\d{17,})/i)
      if (roomId?.[1]) out.roomId = roomId[1]
      const sec =
        html.match(/"sec_uid"\s*:\s*"([^"]{20,})"/i) ||
        html.match(/"sec_user_id"\s*:\s*"([^"]{20,})"/i)
      if (sec?.[1]) out.secUid = sec[1]
      return out
    })
  } catch {
    return {}
  }
}

/** 中控：优先 promotions_v2 的 room_id（本场），不扫页面里零散 short_id */
async function collectAudienceRoomRef(page: Page): Promise<AudienceRoomRef> {
  if (page.isClosed()) {
    throw new Error('中控台页面不可用，请重新连接中控台')
  }

  const acc: AudienceRoomRef = {}
  mergeRef(acc, await extractRoomIdFromDom(page))

  if (acc.roomId) return acc

  return new Promise((resolve, reject) => {
    let settled = false
    let roomOnlyTimer: ReturnType<typeof setTimeout> | null = null

    const done = () => {
      if (settled) return
      settled = true
      cleanup()
      resolve({ ...acc })
    }

    const handleResponse = async (response: Response) => {
      try {
        const url = response.url()
        const ct = response.headers()['content-type'] || ''
        if (ct && !/json|javascript|text/i.test(ct)) return

        if (url.includes('promotions_v2')) {
          const data = await response.json().catch(() => null)
          const roomId = pickRoomIdFromPromotions(data)
          if (roomId) {
            acc.roomId = roomId
            mergeRef(acc, pickRefFromJson(data))
            done()
            return
          }
        }

        if (
          url.includes('live_room') ||
          url.includes('room_id') ||
          url.includes('webcast') ||
          /live\/\w+\/info/i.test(url)
        ) {
          const data = await response.json().catch(() => null)
          const found = pickRefFromJson(data)
          // 只合并 roomId/secUid，不采用零散 web_rid（易进错房）
          if (found.roomId) acc.roomId = acc.roomId || found.roomId
          if (found.secUid) acc.secUid = acc.secUid || found.secUid
          if (found.anchorId) acc.anchorId = acc.anchorId || found.anchorId
          if (found.userId) acc.userId = acc.userId || found.userId
          if (acc.roomId && !roomOnlyTimer) {
            roomOnlyTimer = setTimeout(() => done(), 2_000)
          }
        }
      } catch {
        // ignore
      }
    }

    const timer = setTimeout(() => {
      if (acc.roomId) {
        done()
        return
      }
      if (!settled) {
        settled = true
        cleanup()
        reject(new Error('无法从中控台获取本场 room_id，请确认已开播后重试'))
      }
    }, WAIT_MS)

    const cleanup = () => {
      clearTimeout(timer)
      if (roomOnlyTimer) clearTimeout(roomOnlyTimer)
      page.off('response', handleResponse)
    }

    page.on('response', handleResponse)

    void (async () => {
      try {
        await page
          .locator('#live-control-goods-list-container, [class*="goodsPanel"]')
          .first()
          .hover({ timeout: 2_000 })
          .catch(() => undefined)
        await page.mouse.wheel(0, 240).catch(() => undefined)
      } catch {
        // ignore
      }
      if (settled) return
      mergeRef(acc, await extractRoomIdFromDom(page))
      if (acc.roomId) done()
    })()
  })
}

/**
 * 用观众号打开 reflow，等待跳到 live.douyin.com 真实直播间，返回最终完整链接。
 * 这比自行拼接 web_rid 更接近 App/分享进房路径，也更容易带上正确参数。
 */
export async function captureLiveUrlViaReflow(
  viewerPage: Page,
  ref: AudienceRoomRef,
): Promise<string | null> {
  const entry = reflowUrlFor(ref)
  if (!entry || viewerPage.isClosed()) return null

  const tmp = await viewerPage.context().newPage()
  try {
    let captured: string | null = null

    const onResponse = async (response: Response) => {
      try {
        const data = await response.json().catch(() => null)
        mergeRef(ref, pickRefFromJson(data))
      } catch {
        // ignore
      }
    }
    tmp.on('response', onResponse)

    await tmp.goto(entry, { waitUntil: 'domcontentloaded', timeout: 20_000 }).catch(() => undefined)

    const deadline = Date.now() + 20_000
    while (Date.now() < deadline) {
      const href = tmp.url()
      if (isLiveDouyinRoomUrl(href)) {
        captured = href.split('#')[0]
        break
      }
      // 有的 reflow 停在 amemv，页面里已有 live 链接
      const fromDom = await tmp
        .evaluate(() => {
          const html = document.documentElement?.innerHTML ?? ''
          const m = html.match(/https?:\/\/live\.douyin\.com\/[\w.-]+(?:\?[^"'\\\s]*)?/i)
          return m?.[0]?.replace(/\\u0026/g, '&').replace(/\\/g, '') ?? null
        })
        .catch(() => null)
      if (fromDom && isLiveDouyinRoomUrl(fromDom)) {
        captured = fromDom.split('#')[0]
        break
      }
      await sleep(800)
    }

    // reflow 未跳转时，用解析到的 web_rid 拼标准链接再打开验证
    if (!captured) {
      const pathId = pathIdFromRef(ref)
      if (pathId) {
        const built = buildLiveUrl(pathId, ref)
        await tmp.goto(built, { waitUntil: 'domcontentloaded', timeout: 20_000 }).catch(() => undefined)
        await sleep(2_000)
        const href = tmp.url()
        if (isLiveDouyinRoomUrl(href)) captured = href.split('#')[0]
        else captured = built
      }
    }

    // 尽量从落地页再抠一次主播 id，便于拼主站进房链
    if (captured) {
      const fromPage = await tmp
        .evaluate(() => {
          const html = document.documentElement?.innerHTML ?? ''
          const anchor =
            html.match(/"anchor_id"\s*:\s*"?(\d{6,20})"?/i)?.[1] ||
            html.match(/"owner_user_id"\s*:\s*"?(\d{6,20})"?/i)?.[1] ||
            html.match(/"id_str"\s*:\s*"(\d{6,20})"/i)?.[1]
          const web =
            html.match(/"web_rid"\s*:\s*"?(\d{6,16})"?/i)?.[1] ||
            location.pathname.replace(/^\//, '').split('/')[0]
          return { anchor, web }
        })
        .catch(() => null)
      if (fromPage?.anchor && !isLikelyRoomId(fromPage.anchor)) {
        ref.anchorId = ref.anchorId || fromPage.anchor
      }
      if (fromPage?.web && isLikelyPathId(fromPage.web)) {
        ref.webRid = ref.webRid || (/^\d+$/.test(fromPage.web) ? fromPage.web : undefined)
      }
      // 卖货直播优先用主站推荐进房形态，避免 web_share_link 一直「直播加载中」
      captured = toMainPageLiveUrl(captured, ref)
    }

    tmp.off('response', onResponse)
    return captured
  } finally {
    await tmp.close().catch(() => undefined)
  }
}

export function buildReflowEntryUrl(ref: AudienceRoomRef): string | null {
  return reflowUrlFor(ref)
}

/**
 * 从中控拿本场 room_id，再用互动号通过 reflow 得到真实观众端链接。
 */
export async function resolveDouyinAudienceRoomUrl(
  controlPage: Page,
  viewerPage?: Page | null,
): Promise<string> {
  const resolved = await resolveDouyinAudienceRoom(controlPage, viewerPage)
  return resolved.roomUrl
}

export async function resolveDouyinAudienceRoom(
  controlPage: Page,
  viewerPage?: Page | null,
  /** L1 已检测到的本场标识；有则跳过漫长的中控二次采集 */
  known?: Pick<AudienceRoomRef, 'roomId' | 'secUid'>,
): Promise<ResolvedAudienceRoom> {
  let ref: AudienceRoomRef
  if (known?.roomId) {
    ref = { roomId: known.roomId, secUid: known.secUid }
    // 快速从 DOM 补 secUid 等，不等待网络采集
    mergeRef(ref, await extractRoomIdFromDom(controlPage))
  } else {
    ref = await collectAudienceRoomRef(controlPage)
  }
  if (!ref.roomId) {
    throw new Error('无法从中控台获取本场 room_id，请确认已开播后重试')
  }

  if (viewerPage && !viewerPage.isClosed()) {
    const viaReflow = await captureLiveUrlViaReflow(viewerPage, ref)
    if (viaReflow) {
      return {
        roomUrl: toMainPageLiveUrl(viaReflow, ref),
        roomId: ref.roomId,
        secUid: ref.secUid,
      }
    }
  }

  // 无互动号协助时：仅能拼猜，成功率低
  const pathId = pathIdFromRef(ref)
  if (pathId) {
    return {
      roomUrl: buildLiveUrl(pathId, ref),
      roomId: ref.roomId,
      secUid: ref.secUid,
    }
  }

  throw new Error(
    '已拿到中控 room_id，但无法解析观众端链接。请确认互动号已登录后重试',
  )
}
