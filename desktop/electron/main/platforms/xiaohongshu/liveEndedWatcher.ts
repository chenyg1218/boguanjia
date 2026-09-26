import type { Page } from 'playwright'
import { sleep } from '#/utils'
import { SELECTORS } from './constant'

const LIVE_STATUS_POLL_MS = 4_000
const WEAK_END_CONFIRM_POLLS = 2
const LIVE_ENDED_TEXT_RE = /本场直播已结束|直播已结束|直播结束啦|暂未开播|当前未开播|未在直播/

/** 小红书 / 蒲公英停播轮询：不依赖评论监听是否开启 */
export class XiaohongshuLiveEndedWatcher {
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
        const strong = await pageLooksLikeLiveEnded(this.page).catch(() => false)
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

export async function pageLooksLikeLiveEnded(page: Page): Promise<boolean> {
  if (page.isClosed()) return true
  return page.evaluate(patternSource => {
    const re = new RegExp(patternSource)
    const nodes = [
      document.querySelector('.comment-container'),
      document.querySelector('.comment-input'),
      document.querySelector('[class*="liveStatus"]'),
      document.querySelector('[class*="live-status"]'),
      document.querySelector('[class*="noLive"]'),
      document.querySelector('[class*="no-live"]'),
      document.querySelector('[class*="empty"]'),
    ].filter((n): n is Element => Boolean(n))

    for (const node of nodes) {
      if (re.test(node.textContent ?? '')) return true
    }
    // 局部没命中时再扫 body，但要求是明确的「已结束」类文案，避免「结束讲解」误伤
    const body = document.body?.innerText ?? ''
    return /本场直播已结束|直播已结束|直播结束啦/.test(body)
  }, LIVE_ENDED_TEXT_RE.source)
}

export async function isCommentInputUnavailable(page: Page): Promise<boolean> {
  if (page.isClosed()) return true
  return page.evaluate(selectors => {
    const textarea = document.querySelector(selectors.textarea) as HTMLTextAreaElement | null
    if (!textarea) return true
    if (textarea.disabled || textarea.readOnly) return true
    const style = window.getComputedStyle(textarea)
    if (style.display === 'none' || style.visibility === 'hidden') return true
    return false
  }, {
    textarea: SELECTORS.COMMENT_INPUT.TEXTAREA,
  })
}
