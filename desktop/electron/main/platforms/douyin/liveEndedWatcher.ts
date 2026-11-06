import type { Page, Response } from 'playwright'
import { sleep } from '#/utils'
import { SELECTORS } from './constant'

const LIVE_STATUS_POLL_MS = 3_000
const LIVE_STARTED_POLL_MS = 1_000
const NUDGE_INTERVAL_MS = 8_000

/** 抖音 / 巨量百应停播轮询：不依赖评论监听是否开启 */
export class DouyinLiveEndedWatcher {
  private onLiveEnded: ((reason: string) => void) | null = null
  private watching = false
  private liveEndedNotified = false
  private pollRunning = false

  constructor(private page: Page) {}

  start(onLiveEnded: (reason: string) => void) {
    this.onLiveEnded = onLiveEnded
    this.watching = true
    this.liveEndedNotified = false
    void this.pollLiveStatus()
  }

  stop() {
    this.watching = false
    this.onLiveEnded = null
  }

  private async pollLiveStatus() {
    if (this.pollRunning) return
    this.pollRunning = true
    try {
      while (this.watching && !this.liveEndedNotified) {
        const ended = await pageLooksLikeLiveEnded(this.page).catch(() => false)
        if (ended) {
          this.notifyLiveEnded('page-status')
          break
        }
        await sleep(LIVE_STATUS_POLL_MS)
      }
    } finally {
      this.pollRunning = false
    }
  }

  private notifyLiveEnded(reason: string) {
    if (!this.watching || this.liveEndedNotified) return
    this.liveEndedNotified = true
    this.onLiveEnded?.(reason)
  }
}

export type LiveStartedRef = {
  roomId: string
  secUid?: string
}

/**
 * 中控开播检测（L1）：
 * - 主信号：promotions_v2 等接口中的本场 room_id
 * - 辅信号：可见评论框 / 直播中标签 / DOM 中的 room_id
 * - 未开播时轻量刺激中控，促使接口重发
 */
/** DOM 确认开播后，软停播需连续命中才认定结束 */
const SOFT_ENDED_STREAK = 5

export class DouyinLiveStartedWatcher {
  private watching = false
  private currentRoomId: string | null = null
  /** 本场是否由接口 room_id 确认（强信号） */
  private liveFromNetwork = false
  private softEndedStreak = 0
  private hardEndedStreak = 0
  private onStarted: ((ref: LiveStartedRef) => void) | null = null
  private onEnded: (() => void) | null = null
  private responseHandler: ((response: Response) => void) | null = null
  private pollRunning = false

  constructor(private page: Page) {}

  start(handlers: {
    onStarted: (ref: LiveStartedRef) => void
    onEnded: () => void
  }) {
    this.stop()
    this.watching = true
    this.currentRoomId = null
    this.liveFromNetwork = false
    this.softEndedStreak = 0
    this.hardEndedStreak = 0
    this.onStarted = handlers.onStarted
    this.onEnded = handlers.onEnded
    this.attachResponseListener()
    void this.pollLoop()
  }

  stop() {
    this.watching = false
    this.detachResponseListener()
    this.onStarted = null
    this.onEnded = null
    this.currentRoomId = null
    this.liveFromNetwork = false
    this.softEndedStreak = 0
    this.hardEndedStreak = 0
  }

  getCurrentRoomId() {
    return this.currentRoomId
  }

  private attachResponseListener() {
    this.responseHandler = (response: Response) => {
      if (!this.watching) return
      void (async () => {
        const ref = await extractLiveRefFromResponse(response)
        if (ref?.roomId) this.notifyStarted(ref, true)
      })()
    }
    this.page.on('response', this.responseHandler)
  }

  private detachResponseListener() {
    if (this.responseHandler) {
      this.page.off('response', this.responseHandler)
      this.responseHandler = null
    }
  }

  private notifyStarted(ref: LiveStartedRef, fromNetwork: boolean) {
    if (!this.watching) return
    if (this.currentRoomId === ref.roomId) {
      // 同场再次收到接口 room_id：刷新强信号，清掉误判的软停播计数
      if (fromNetwork) {
        this.liveFromNetwork = true
        this.softEndedStreak = 0
        this.hardEndedStreak = 0
      }
      return
    }
    // 已锁定本场：忽略其它 room_id（旁路接口常带历史/其它场次 id，会导致反复清缓存）
    if (this.currentRoomId) return

    this.currentRoomId = ref.roomId
    this.liveFromNetwork = fromNetwork
    this.softEndedStreak = 0
    this.hardEndedStreak = 0
    this.onStarted?.(ref)
  }

  private notifyEnded() {
    if (!this.watching || this.currentRoomId == null) return
    this.currentRoomId = null
    this.liveFromNetwork = false
    this.softEndedStreak = 0
    this.hardEndedStreak = 0
    this.onEnded?.()
  }

  private async pollLoop() {
    if (this.pollRunning) return
    this.pollRunning = true
    let lastNudgeAt = 0
    try {
      // 连接后立刻检一次，不等第一个周期
      await this.checkFallbackSignals()
      lastNudgeAt = Date.now()
      await nudgeLiveControl(this.page)

      while (this.watching) {
        if (this.currentRoomId) {
          await this.pollWhileLive()
        } else {
          await this.checkFallbackSignals()
          if (!this.currentRoomId && Date.now() - lastNudgeAt >= NUDGE_INTERVAL_MS) {
            lastNudgeAt = Date.now()
            await nudgeLiveControl(this.page)
          }
        }
        await sleep(LIVE_STARTED_POLL_MS)
      }
    } finally {
      this.pollRunning = false
    }
  }

  /**
   * 已确认开播后：停播须谨慎。
   * - 硬停播：可见「直播总结」关闭钮 → 立即结束
   * - 网络 room_id 确认的开播：不再用「未开播」区判停（该节点开播后仍可能可见，会误清缓存）
   * - 仅 DOM 确认的开播：未开播区连续多拍才软停播
   */
  private async pollWhileLive() {
    // 硬停播需连续两拍，避免 UI 闪一下误清
    if (await isSelectorVisible(this.page, SELECTORS.LIVE_OVER_CLOSE_BUTTON)) {
      this.hardEndedStreak++
      if (this.hardEndedStreak >= 2) this.notifyEnded()
      return
    }
    this.hardEndedStreak = 0

    // 接口已给出本场 room_id：只认直播总结硬停播
    if (this.liveFromNetwork) {
      this.softEndedStreak = 0
      return
    }

    const softEnded = await isSelectorVisible(this.page, SELECTORS.NO_LIVE)
    if (!softEnded) {
      this.softEndedStreak = 0
      return
    }

    this.softEndedStreak++
    if (this.softEndedStreak >= SOFT_ENDED_STREAK) {
      this.notifyEnded()
    }
  }

  private async checkFallbackSignals() {
    if (!this.watching || this.currentRoomId) return

    // DOM 可见开播控件
    if (await pageLooksLikeLiveOn(this.page).catch(() => false)) {
      const fromDom = await extractRoomIdFromPage(this.page)
      if (fromDom?.roomId) {
        this.notifyStarted(fromDom, false)
        return
      }
    }

    // 页面 HTML 里已有本场 room_id（接口已写入但 response 监听错过时）
    const fromHtml = await extractRoomIdFromPage(this.page)
    if (fromHtml?.roomId) {
      // 有长号 room_id 即可 L1；不再因可能误判的「停播」文案挡住
      const hardEnded = await isSelectorVisible(this.page, SELECTORS.LIVE_OVER_CLOSE_BUTTON)
      if (!hardEnded) this.notifyStarted(fromHtml, false)
    }
  }
}

async function isSelectorVisible(page: Page, selector: string): Promise<boolean> {
  if (page.isClosed()) return false
  try {
    const el = await page.$(selector)
    if (!el) return false
    return await el.isVisible()
  } catch {
    return false
  }
}

/** 轻量刺激中控，促使 promotions_v2 等接口重发 */
async function nudgeLiveControl(page: Page) {
  if (page.isClosed()) return
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
}

function takeRoomId(id: string | null | undefined): string | undefined {
  if (id == null) return undefined
  const t = String(id).trim()
  return /^\d{17,}$/.test(t) ? t : undefined
}

function takeSecUid(id: string | null | undefined): string | undefined {
  if (id == null) return undefined
  const t = String(id).trim()
  if (t.length >= 20 && /[A-Za-z]/.test(t)) return t
  return undefined
}

function pickRoomIdFromJson(data: unknown): string | undefined {
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
  return takeRoomId(JSON.stringify(data).match(/"room_id"\s*:\s*"?(\d{17,})"?/)?.[1])
}

function pickSecUidFromJson(data: unknown): string | undefined {
  if (!data || typeof data !== 'object') return undefined
  const raw = JSON.stringify(data)
  return (
    takeSecUid(raw.match(/"sec_uid"\s*:\s*"([^"]{20,})"/i)?.[1]) ||
    takeSecUid(raw.match(/"sec_user_id"\s*:\s*"([^"]{20,})"/i)?.[1])
  )
}

async function extractLiveRefFromResponse(response: Response): Promise<LiveStartedRef | null> {
  try {
    const url = response.url()
    const ct = response.headers()['content-type'] || ''
    if (ct && !/json|javascript|text/i.test(ct)) return null

    // 优先 promotions_v2（本场商品/直播主接口）；其它接口只作首次兜底且易带脏 id
    const fromPromotions = url.includes('promotions_v2')
    const interesting =
      fromPromotions ||
      url.includes('live_room') ||
      /live\/\w+\/info/i.test(url)
    if (!interesting) return null

    const data = await response.json().catch(() => null)
    const roomId = pickRoomIdFromJson(data)
    if (!roomId) return null
    // 非 promotions 的响应：仍可用于「首次」检测（由 sticky 锁定），结构与 promotions 相同
    return { roomId, secUid: pickSecUidFromJson(data) }
  } catch {
    return null
  }
}

async function extractRoomIdFromPage(page: Page): Promise<LiveStartedRef | null> {
  if (page.isClosed()) return null
  try {
    const found = await page.evaluate(() => {
      const html = document.documentElement?.innerHTML ?? ''
      const roomId =
        html.match(/"room_id"\s*:\s*"?(\d{17,})"?/i)?.[1] ||
        html.match(/live_room_id["']?\s*[:=]\s*["']?(\d{17,})/i)?.[1]
      const secUid =
        html.match(/"sec_uid"\s*:\s*"([^"]{20,})"/i)?.[1] ||
        html.match(/"sec_user_id"\s*:\s*"([^"]{20,})"/i)?.[1]
      return { roomId, secUid }
    })
    const roomId = takeRoomId(found.roomId)
    if (!roomId) return null
    return { roomId, secUid: takeSecUid(found.secUid) }
  } catch {
    return null
  }
}

/** 中控台是否已停播：须「可见」的总结弹窗 / 未开播区，避免隐藏节点误判 */
export async function pageLooksLikeLiveEnded(page: Page): Promise<boolean> {
  if (page.isClosed()) return true

  if (await isSelectorVisible(page, SELECTORS.LIVE_OVER_CLOSE_BUTTON)) return true
  if (await isSelectorVisible(page, SELECTORS.NO_LIVE)) return true

  return page.evaluate(() => {
    const body = document.body?.innerText ?? ''
    return /本场直播已结束|直播已结束|直播结束啦/.test(body)
  })
}

/** 中控台是否已开播（可见评论框 / 直播中标签；排除可见未开播区） */
export async function pageLooksLikeLiveOn(page: Page): Promise<boolean> {
  if (page.isClosed()) return false
  if (await pageLooksLikeLiveEnded(page)) return false

  if (await isSelectorVisible(page, SELECTORS.commentInput.TEXTAREA)) return true
  if (await isSelectorVisible(page, 'span[class^="liveTag"]')) return true

  return false
}
