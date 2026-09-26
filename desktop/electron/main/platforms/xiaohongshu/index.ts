import { Result } from '@praha/byethrow'
import type { ElementHandle, Page } from 'playwright'
import type { BrowserSession } from '#/managers/BrowserSessionManager'
import { ElementNotFoundError } from '#/errors/PlatformError'
import { abortableSleep } from '#/utils'
import {
  comment,
  ensurePage,
  getAccountName,
  getAllGoodsIdsFromScroller,
  getItemFromVirtualScroller,
  openUrlByElement,
  toggleButton,
} from '../helper'
import type { ICommentListener, ILiveEndedWatch, IPerformComment, IPerformPopup, IPlatform } from '../IPlatform'
import { XiaohongshuCommentListener } from './commentListener'
import { REGEXPS, SELECTORS, TEXTS, URLS, POPUP_CARD_VISIBLE_MS } from './constant'
import { xiaohongshuElementFinder as elementFinder } from './elment-finder'
import { XiaohongshuLiveEndedWatcher } from './liveEndedWatcher'

const PLATFORM_NAME = '小红书' as const

/** 判断是否已在工作台 / 登录页 / 招商中间页 */
const CONNECT_PROBE_TIMEOUT_MS = 90_000
/** 进入中控业务区的等待上限 */
const LIVE_CONTROL_ENTER_TIMEOUT_MS = 60_000

const LIVE_CONTROL_STUCK_HINT =
  '千帆中控台页面壳子已打开，但业务区一直加载不出（常见于自动化直开 live_center_control）。请关掉无头模式后重试；仍失败则在设置中清除该账号登录状态，用系统 Chrome 先打开工作台再连。'

const ZHAOSHANG_STUCK_HINT =
  '登录后停在小红书招商页（shop-type）且无法进入千帆中控台。请先用系统 Chrome 打开 https://ark.xiaohongshu.com 确认能进入「直播中控」；若店铺未完成入驻或店铺类型选择，请先在官网完成。也可在设置中清除该账号登录状态后，关闭无头模式再重试。'

/**
 * 千帆 SSO / 招商跳转会中断当前导航，Playwright 常抛 net::ERR_ABORTED。
 * 此时页面其实已在跳转链上，忽略该错误后继续等最终落地页即可。
 */
async function softGoto(page: Page, url: string) {
  try {
    await page.goto(url, { waitUntil: 'domcontentloaded', timeout: CONNECT_PROBE_TIMEOUT_MS })
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    if (/ERR_ABORTED|Navigation aborted|interrupted by another navigation/i.test(message)) {
      return
    }
    throw err
  }
}

async function waitLiveControlReady(page: Page, timeoutMs = LIVE_CONTROL_ENTER_TIMEOUT_MS) {
  await page.waitForFunction(
    ({ readySelector, urlPattern }) => {
      if (!new RegExp(urlPattern).test(location.href)) return false
      return !!document.querySelector(readySelector)
    },
    {
      readySelector: SELECTORS.LIVE_CONTROL_READY,
      urlPattern: 'ark\\.xiaohongshu\\.com\\/live_center_control',
    },
    { timeout: timeoutMs },
  )
}

/**
 * 小红书（千帆）
 */
export class XiaohongshuPlatform
  implements IPlatform, IPerformPopup, IPerformComment, ICommentListener, ILiveEndedWatch
{
  readonly _isCommentListener = true
  readonly _isPerformComment = true
  readonly _isPerformPopup = true
  readonly _isLiveEndedWatch = true
  private mainPage: Page | null = null
  private commentListener: XiaohongshuCommentListener | null = null
  private liveEndedWatcher: XiaohongshuLiveEndedWatcher | null = null
  private accountName = ''

  async connect(browserSession: BrowserSession) {
    const { page } = browserSession

    // 先到工作台首页（与系统 Chrome 路径一致），不要直开 live_center_control
    const landed = Promise.race([
      page.waitForURL(REGEXPS.LOGIN_PAGE, {
        timeout: CONNECT_PROBE_TIMEOUT_MS,
        waitUntil: 'domcontentloaded',
      }),
      page.waitForURL(REGEXPS.ZHAOSHANG, {
        timeout: CONNECT_PROBE_TIMEOUT_MS,
        waitUntil: 'domcontentloaded',
      }),
      page.waitForSelector(SELECTORS.LOGGED_IN, {
        timeout: CONNECT_PROBE_TIMEOUT_MS,
        state: 'attached',
      }),
      page.waitForSelector(SELECTORS.ARK_SHELL, {
        timeout: CONNECT_PROBE_TIMEOUT_MS,
        state: 'attached',
      }),
    ])

    await softGoto(page, URLS.ARK_HOME)

    try {
      await landed
    } catch {
      throw new Error(
        '打开千帆工作台超时：页面未进入登录页、招商页或工作台。请检查网络，或关闭无头模式后重试',
      )
    }

    if (REGEXPS.LOGIN_PAGE.test(page.url())) {
      return false
    }

    if (REGEXPS.ZHAOSHANG.test(page.url())) {
      try {
        await this.enterLiveControl(browserSession)
        return true
      } catch {
        throw new Error(ZHAOSHANG_STUCK_HINT)
      }
    }

    await this.enterLiveControl(browserSession)
    return true
  }

  async login(browserSession: BrowserSession): Promise<void> {
    const { page } = browserSession
    if (!REGEXPS.LOGIN_PAGE.test(page.url()) && !REGEXPS.ZHAOSHANG.test(page.url())) {
      await softGoto(page, URLS.LOGIN_PAGE)
    }

    // 扫码成功后落到工作台或招商页即可（勿等中控业务区）
    await Promise.race([
      page.waitForSelector(SELECTORS.LOGGED_IN, { timeout: 0 }),
      page.waitForSelector(SELECTORS.ARK_SHELL, { timeout: 0 }),
      page.waitForURL(REGEXPS.ARK, { timeout: 0, waitUntil: 'domcontentloaded' }),
      page.waitForURL(REGEXPS.ZHAOSHANG, { timeout: 0, waitUntil: 'domcontentloaded' }),
    ])
  }

  /** 侧栏点击「直播中控」；千帆常会新开标签，必须跟到新页，否则会一直在首页空等 */
  private async clickLiveControlNav(page: Page): Promise<Page | null> {
    const context = page.context()
    const popupWait = context.waitForEvent('page', { timeout: 8_000 }).catch(() => null)

    let clicked = false
    try {
      const byRole = page.getByRole('link', { name: TEXTS.LIVE_CONTROL_NAV })
      if ((await byRole.count()) > 0) {
        await byRole.first().click({ timeout: 8_000 })
        clicked = true
      } else {
        const byText = page.getByText(TEXTS.LIVE_CONTROL_NAV, { exact: true })
        if ((await byText.count()) > 0) {
          await byText.first().click({ timeout: 8_000 })
          clicked = true
        }
      }
    } catch {
      return null
    }
    if (!clicked) return null

    const popup = await popupWait
    if (popup) {
      await popup.waitForLoadState('domcontentloaded').catch(() => undefined)
      return popup
    }

    try {
      await page.waitForURL(REGEXPS.LIVE_CONTROL, {
        timeout: 8_000,
        waitUntil: 'domcontentloaded',
      })
    } catch {
      // SPA 可能不改 URL，仍返回当前页交给后续 ready 检测
    }
    return page
  }

  private findLiveControlPage(page: Page): Page | undefined {
    return page
      .context()
      .pages()
      .find(p => !p.isClosed() && REGEXPS.LIVE_CONTROL.test(p.url()))
  }

  /**
   * 进入直播中控业务区：
   * 1. 优先在工作台侧栏点「直播中控」（对齐人工路径，并跟进新标签）
   * 2. 失败再用 `<a target=_blank>` 打开中控 URL
   * 3. 必须以「中控 URL + 评论区/商品列表」为准，不能只看顶栏
   */
  private async enterLiveControl(browserSession: BrowserSession) {
    let page = browserSession.page
    let previous: Page | null = null

    const adopt = (next: Page) => {
      if (page !== next) previous = page
      browserSession.page = next
      this.mainPage = next
      page = next
    }

    const closePrevious = async () => {
      if (previous && previous !== page && !previous.isClosed()) {
        await previous.close().catch(() => undefined)
      }
      previous = null
    }

    /** 仅在业务区就绪后切换主页面，避免半加载标签被当成已连接 */
    const tryReady = async (target: Page, timeoutMs: number) => {
      await waitLiveControlReady(target, timeoutMs)
      adopt(target)
      await closePrevious()
    }

    // 已在中控且业务区就绪
    if (REGEXPS.LIVE_CONTROL.test(page.url())) {
      const ready = await page.$(SELECTORS.LIVE_CONTROL_READY)
      if (ready) {
        this.mainPage = page
        return
      }
      await softGoto(page, URLS.ARK_HOME)
      await page
        .waitForSelector(SELECTORS.ARK_SHELL, {
          timeout: 20_000,
          state: 'attached',
        })
        .catch(() => undefined)
    }

    // 不在 ark 时，用 a 标签打开工作台
    if (!REGEXPS.ARK.test(page.url())) {
      const home = await openUrlByElement(page, URLS.ARK_HOME)
      adopt(home)
      await closePrevious()
      await home
        .waitForSelector(SELECTORS.ARK_SHELL, {
          timeout: 20_000,
          state: 'attached',
        })
        .catch(() => undefined)
    }

    // 路径 1：侧栏点击（可能新开「直播中控台」标签）
    const afterClick = await this.clickLiveControlNav(page)
    if (afterClick) {
      try {
        await tryReady(afterClick, 25_000)
        return
      } catch {
        // 继续兜底
      }
    }

    // 路径 1b：上下文里已有中控标签（点击时新开但未及时接到）
    const existing = this.findLiveControlPage(page)
    if (existing) {
      try {
        await tryReady(existing, 25_000)
        return
      } catch {
        // 继续兜底
      }
    }

    // 路径 2：a 标签新开中控
    const controlPage = await openUrlByElement(page, URLS.LIVE_CONTROL_PAGE)
    try {
      await tryReady(controlPage, 40_000)
    } catch {
      if (REGEXPS.ZHAOSHANG.test(controlPage.url())) {
        throw new Error(ZHAOSHANG_STUCK_HINT)
      }
      throw new Error(LIVE_CONTROL_STUCK_HINT)
    }
  }

  async getAccountName(session: BrowserSession) {
    const accountName = await getAccountName(session.page, SELECTORS.ACCOUNT_NAME)
    if (accountName) {
      this.accountName = accountName.endsWith('的店') ? accountName.slice(0, -2) : accountName
      this.commentListener?.setAccountName(this.accountName)
    }
    return this.accountName
  }

  disconnect(): Promise<void> {
    throw new Error('Method not implemented.')
  }

  async performPopup(id: number, signal?: AbortSignal) {
    // 讲解 + 弹卡 →（任务侧按讲解时长续弹卡）→ 下一轮先结束再讲下一品
    return Result.pipe(
      ensurePage(this.mainPage),
      Result.andThen(async page => {
        const ended = await endCurrentExplain(page, signal)
        if (Result.isFailure(ended)) return ended
        return getItemFromVirtualScroller(page, elementFinder, id)
      }),
      Result.andThen(item => elementFinder.getPopUpButtonFromGoodsItem(item)),
      Result.andThen(btn => startExplain(btn, signal)),
      Result.andThen(() => this.refreshPopupCard(id, signal)),
    )
  }

  /** 观众侧商品卡约 15s 收起；返回续弹间隔供任务侧使用 */
  getPopupCardVisibleMs() {
    return POPUP_CARD_VISIBLE_MS
  }

  /** 在仍讲解该品时再次点击「弹卡」，延长观众侧展示 */
  async refreshPopupCard(id: number, signal?: AbortSignal) {
    return Result.pipe(
      ensurePage(this.mainPage),
      Result.andThen(page => getItemFromVirtualScroller(page, elementFinder, id)),
      Result.andThen(item => clickPopUpCard(item, signal)),
    )
  }

  async performComment(message: string) {
    return Result.pipe(
      ensurePage(this.mainPage),
      Result.andThen(page => comment(page, elementFinder, message, false)),
    )
  }

  async startCommentListener(
    onComment: (comment: LiveMessage) => void,
    _source?: CommentListenerConfig['source'],
    onEnded?: (reason: string) => void,
  ): Promise<void> {
    const page = ensurePage(this.mainPage)
    if (Result.isFailure(page)) {
      throw page.error
    }
    this.commentListener = new XiaohongshuCommentListener(page.value)
    this.commentListener.setAccountName(this.accountName)
    await this.commentListener.startCommentListener(onComment, onEnded)
  }

  stopCommentListener(): void {
    this.commentListener?.stopCommentListener()
  }

  startLiveEndedWatch(onEnded: (reason: string) => void) {
    this.stopLiveEndedWatch()
    const page = ensurePage(this.mainPage)
    if (Result.isFailure(page)) {
      throw page.error
    }
    this.liveEndedWatcher = new XiaohongshuLiveEndedWatcher(page.value)
    this.liveEndedWatcher.start(onEnded)
  }

  stopLiveEndedWatch() {
    this.liveEndedWatcher?.stop()
    this.liveEndedWatcher = null
  }

  getCommentListenerPage(): Page {
    if (!this.commentListener) {
      throw new Error('Comment listener not started')
    }
    return this.commentListener.getCommentListenerPage()
  }

  getPopupPage() {
    return this.mainPage
  }

  async listGoodsIds() {
    return Result.pipe(
      ensurePage(this.mainPage),
      Result.andThen(page => getAllGoodsIdsFromScroller(page, elementFinder)),
    )
  }

  getCommentPage() {
    return this.mainPage
  }

  get platformName() {
    return PLATFORM_NAME
  }
}

function normalizeBtnText(text: string | null | undefined) {
  return (text ?? '').replace(/\s+/g, '').trim()
}

async function clickExplainButton(btn: ElementHandle<SVGElement | HTMLElement>) {
  try {
    await btn.click({ timeout: 3000 })
  } catch {
    await btn.dispatchEvent('click')
  }
}

/** 结束当前正在讲解的商品（全页最多一个） */
async function endCurrentExplain(page: Page, signal?: AbortSignal) {
  const buttons = await page.$$(SELECTORS.GOODS_ITEM_INNER.ACTION_BTN)
  for (const btn of buttons) {
    const text = normalizeBtnText(await btn.textContent())
    if (text !== TEXTS.POPUP_BUTTON_CANCLE) continue
    await clickExplainButton(btn)
    return abortableSleep(800, signal)
  }
  // 旧版操作面板
  const legacy = await page.$$(SELECTORS.GOODS_ITEM_INNER.OPERATION_ITEM)
  for (const btn of legacy) {
    const text = normalizeBtnText(await btn.textContent())
    if (text !== TEXTS.POPUP_BUTTON_CANCLE) continue
    await clickExplainButton(btn)
    return abortableSleep(800, signal)
  }
  return Result.succeed()
}

/** 开始讲解目标商品，成功后保持「讲解中」直到下一轮或停止任务 */
async function startExplain(
  btn: ElementHandle<SVGElement | HTMLElement>,
  signal?: AbortSignal,
) {
  const text = normalizeBtnText(await btn.textContent())
  if (text === TEXTS.POPUP_BUTTON_CANCLE) {
    return Result.succeed()
  }
  if (text === TEXTS.POPUP_BUTTON) {
    await clickExplainButton(btn)
    return abortableSleep(800, signal)
  }
  // 文案异常时回退旧切换逻辑
  return toggleButton(btn, TEXTS.POPUP_BUTTON, TEXTS.POPUP_BUTTON_CANCLE, signal)
}

/**
 * 点击「弹卡」。无弹卡按钮时（旧版仅讲解）视为成功跳过。
 * 「弹卡中」表示观众侧仍在展示，无需再点。
 */
async function clickPopUpCard(
  item: ElementHandle<SVGElement | HTMLElement>,
  signal?: AbortSignal,
) {
  const btnResult = await elementFinder.getPopUpCardButtonFromGoodsItem(item)
  if (Result.isFailure(btnResult)) {
    // 旧版中控没有独立弹卡，讲解即可
    if (btnResult.error instanceof ElementNotFoundError) {
      return Result.succeed()
    }
    return btnResult
  }
  const text = normalizeBtnText(await btnResult.value.textContent())
  if (text === TEXTS.POPUP_CARD_BUSY) {
    return Result.succeed()
  }
  if (text !== TEXTS.POPUP_CARD) {
    return Result.succeed()
  }
  await clickExplainButton(btnResult.value)
  return abortableSleep(500, signal)
}
