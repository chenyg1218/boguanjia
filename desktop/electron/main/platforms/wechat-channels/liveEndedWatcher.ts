import type { Page } from 'playwright'
import { sleep } from '#/utils'
import { REGEXPS, SELECTORS } from './constant'

const LIVE_STATUS_POLL_MS = 4_000
/** 仅评论框不可用时，连续确认几次再停，避免加载抖动误停 */
const WEAK_END_CONFIRM_POLLS = 2
const LIVE_ENDED_TEXT_RE = /本场直播已结束|直播已结束|直播结束啦/

/**
 * 视频号停播轮询：不依赖评论监听是否开启，
 * 供自动发言 / 自动弹窗 / 自动回复共用。
 */
export class WeChatChannelLiveEndedWatcher {
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

/** URL 离开中控 / 明确结束文案 */
async function pageLooksLikeLiveEndedStrong(page: Page): Promise<boolean> {
  if (page.isClosed()) return true
  const url = page.url()
  if (REGEXPS.LOGIN_PAGE.test(url) || REGEXPS.INDEX_PAGE.test(url)) return true
  if (!url.includes('/live/liveBuild')) return true

  for (const frame of page.frames()) {
    const hit = await frame
      .evaluate(pattern => {
        const re = new RegExp(pattern)
        return re.test(document.body?.innerText ?? '')
      }, LIVE_ENDED_TEXT_RE.source)
      .catch(() => false)
    if (hit) return true
  }
  return false
}

async function isCommentInputUnavailable(page: Page): Promise<boolean> {
  if (page.isClosed()) return true
  for (const frame of page.frames()) {
    const available = await frame
      .evaluate(sel => {
        const el = document.querySelector(sel) as HTMLTextAreaElement | null
        if (!el) return false
        if (el.disabled || el.readOnly) return false
        const style = window.getComputedStyle(el)
        if (style.display === 'none' || style.visibility === 'hidden') return false
        return true
      }, SELECTORS.commentInput.TEXTAREA)
      .catch(() => false)
    if (available) return false
  }
  return true
}
