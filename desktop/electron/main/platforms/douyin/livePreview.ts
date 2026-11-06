import type { Page } from 'playwright'
import { createLogger } from '#/logger'
import { sleep } from '#/utils'
import { SELECTORS, TEXTS } from './constant'

const logger = createLogger('抖音中控').scope('直播画面')

const WAIT_TOGGLE_MS = 5_000
const WAIT_ON_MS = 5_000
const POLL_MS = 300

type PreviewState = 'on' | 'off' | 'missing'

type PreviewEvalResult = { state: PreviewState; clicked?: boolean }

export async function ensureLivePreviewOn(page: Page): Promise<void> {
  if (page.isClosed()) return
  try {
    const appeared = await waitForToggle(page, WAIT_TOGGLE_MS)
    if (!appeared) return

    const current = await readPreviewState(page)
    if (current === 'on' || current === 'missing') return

    await clickPreviewToggle(page)

    const deadline = Date.now() + WAIT_ON_MS
    while (Date.now() < deadline) {
      if (page.isClosed()) return
      if ((await readPreviewState(page)) === 'on') return
      await sleep(POLL_MS)
    }
    logger.warn('已点击「画面」，但未确认开启，自动弹窗可能仍会失败')
  } catch {
    // 未开播 / 旧版无此开关时不影响连接和弹窗主流程
  }
}

async function waitForToggle(page: Page, timeoutMs: number) {
  const deadline = Date.now() + timeoutMs
  while (Date.now() < deadline) {
    if (page.isClosed()) return false
    if ((await readPreviewState(page)) !== 'missing') return true
    await sleep(POLL_MS)
  }
  return false
}

async function readPreviewState(page: Page): Promise<PreviewState> {
  const result = await page.evaluate(inspectPreview, {
    interaction: TEXTS.LIVE_INTERACTION,
    toggle: TEXTS.LIVE_PREVIEW_TOGGLE,
    videoSelector: SELECTORS.LIVE_PREVIEW_VIDEO,
    clickableSelector: SELECTORS.LIVE_PREVIEW_TOGGLE,
  })
  return result.state
}

async function clickPreviewToggle(page: Page) {
  await page.evaluate(inspectPreview, {
    interaction: TEXTS.LIVE_INTERACTION,
    toggle: TEXTS.LIVE_PREVIEW_TOGGLE,
    videoSelector: SELECTORS.LIVE_PREVIEW_VIDEO,
    clickableSelector: SELECTORS.LIVE_PREVIEW_TOGGLE,
    click: true,
  })
}

function inspectPreview(params: {
  interaction: string
  toggle: string
  videoSelector: string
  clickableSelector: string
  click?: boolean
}): PreviewEvalResult {
  function isVisible(el: Element) {
    const node = el as HTMLElement
    const style = window.getComputedStyle(node)
    const rect = node.getBoundingClientRect()
    return (
      rect.width > 0 &&
      rect.height > 0 &&
      style.display !== 'none' &&
      style.visibility !== 'hidden' &&
      style.opacity !== '0'
    )
  }

  function normalizedText(el: Element) {
    return (el.textContent ?? '').replace(/\s+/g, '')
  }

  function clickableAncestor(el: HTMLElement) {
    const found = el.closest(params.clickableSelector)
    return (found as HTMLElement | null) ?? el
  }

  function looksOn(el: HTMLElement) {
    const nodes = [el, ...Array.from(el.children)] as HTMLElement[]
    for (const cur of nodes) {
      if (cur.getAttribute('aria-pressed') === 'true') return true
      if (cur.getAttribute('aria-checked') === 'true') return true
      if (cur.getAttribute('aria-selected') === 'true') return true
      const state = `${cur.getAttribute('data-state') ?? ''} ${cur.getAttribute('data-checked') ?? ''}`
      if (/\b(on|true|checked|selected|open)\b/i.test(state)) return true
      const cls = String(cur.className ?? '')
      if (/(^|[^a-zA-Z])(active|selected|checked|isActive|isSelected|isChecked)([^a-zA-Z]|$)/i.test(cls)) {
        return true
      }
    }
    return false
  }

  function hasPreviewVideo() {
    return Array.from(document.querySelectorAll(params.videoSelector)).some(el => isVisible(el))
  }

  const matches = (
    Array.from(document.querySelectorAll('*')).filter(el => {
      if (!(el instanceof HTMLElement)) return false
      if (normalizedText(el) !== params.toggle) return false
      return isVisible(el)
    }) as HTMLElement[]
  ).sort((a, b) => {
    const ar = a.getBoundingClientRect()
    const br = b.getBoundingClientRect()
    return ar.width * ar.height - br.width * br.height
  })

  if (!matches.length) return { state: 'missing' }

  const interactionNodes = Array.from(document.querySelectorAll('*')).filter(el => {
    if (!(el instanceof HTMLElement)) return false
    const text = normalizedText(el)
    return text.includes(params.interaction) && text.length < 40 && isVisible(el)
  }) as HTMLElement[]

  let target = matches[0]
  if (interactionNodes.length) {
    const tops = interactionNodes.map(el => el.getBoundingClientRect().top)
    const near = matches.filter(el => {
      const top = el.getBoundingClientRect().top
      return tops.some(t => Math.abs(t - top) < 80)
    })
    if (near.length) target = near[0]
  }

  const clickable = clickableAncestor(target)
  if (hasPreviewVideo() || looksOn(clickable)) return { state: 'on' }

  if (params.click) {
    clickable.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }))
    return { state: 'off', clicked: true }
  }
  return { state: 'off' }
}
