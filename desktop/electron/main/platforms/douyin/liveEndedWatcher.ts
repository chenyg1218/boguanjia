import type { Page } from 'playwright'
import { sleep } from '#/utils'
import { SELECTORS } from './constant'

const LIVE_STATUS_POLL_MS = 3_000

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

/** 中控台是否已停播：直播总结弹窗 / 未开播区域 / 明确结束文案 */
export async function pageLooksLikeLiveEnded(page: Page): Promise<boolean> {
  if (page.isClosed()) return true

  const liveOver = await page.$(SELECTORS.LIVE_OVER_CLOSE_BUTTON)
  if (liveOver) return true

  const noLive = await page.$(SELECTORS.NO_LIVE)
  if (noLive) return true

  return page.evaluate(() => {
    const body = document.body?.innerText ?? ''
    return /本场直播已结束|直播已结束|直播结束啦/.test(body)
  })
}
