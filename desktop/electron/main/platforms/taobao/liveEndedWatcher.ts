import type { Page } from 'playwright'
import { sleep } from '#/utils'
import { SELECTORS } from './constant'

const LIVE_STATUS_POLL_MS = 4_000
const WEAK_END_CONFIRM_POLLS = 2
const LIVE_ENDED_TEXT_RE = /本场直播已结束|直播已结束|直播结束啦/

/** 淘宝停播轮询：不依赖评论监听是否开启 */
export class TaobaoLiveEndedWatcher {
  private onLiveEnded: ((reason: string) => void) | null = null
  private watching = false
  private liveEndedNotified = false
  private pollRunning = false
  private weakEndMisses = 0

  constructor(private page: Page) {}

  start(onLiveEnded: (reason: string) => void) {
    this.onLiveEnded = onLiveEnded
    this.watching = true
    this.liveEndedNotified = false
    this.weakEndMisses = 0
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
        const strong = await pageLooksLikeLiveEndedStrong(this.page).catch(() => false)
        if (strong) {
          this.notifyLiveEnded('page-status')
          break
        }
        const commentGone = await isCommentInputUnavailable(this.page).catch(() => false)
        if (commentGone) {
          this.weakEndMisses += 1
          if (this.weakEndMisses >= WEAK_END_CONFIRM_POLLS) {
            this.notifyLiveEnded('comment-unavailable')
            break
          }
        } else {
          this.weakEndMisses = 0
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

async function pageLooksLikeLiveEndedStrong(page: Page): Promise<boolean> {
  if (page.isClosed()) return true
  const url = page.url()
  if (!url.includes('/live/control')) return true
  return page.evaluate(pattern => {
    const re = new RegExp(pattern)
    return re.test(document.body?.innerText ?? '')
  }, LIVE_ENDED_TEXT_RE.source)
}

async function isCommentInputUnavailable(page: Page): Promise<boolean> {
  if (page.isClosed()) return true
  return page.evaluate(sel => {
    const el = document.querySelector(sel) as HTMLTextAreaElement | null
    if (!el) return true
    if (el.disabled || el.readOnly) return true
    const style = window.getComputedStyle(el)
    if (style.display === 'none' || style.visibility === 'hidden') return true
    return false
  }, SELECTORS.commentInput.TEXTAREA)
}
