import { Result } from '@praha/byethrow'
import type { Page } from 'playwright'
import { UnexpectedError } from '#/errors/AppError'
import { ElementContentMismatchedError, type PlatformError } from '#/errors/PlatformError'
import type { BrowserSession } from '#/managers/BrowserSessionManager'
import {
  comment,
  ensurePage,
  getAccountName,
  getAllGoodsIdsFromScroller,
  getItemFromVirtualScroller,
  toggleButton,
} from '../helper'
import type {
  ICommentListener,
  ILiveEndedWatch,
  IPerformComment,
  IPerformPopup,
  IPinComment,
  IPlatform,
} from '../IPlatform'
import { WeChatChannelCommentListener } from './commentListener'
import { REGEXPS, SELECTORS, TEXT, URLS } from './constant'
import { wechatChannelElementFinder as elementFinder } from './element-finder'
import { WeChatChannelLiveEndedWatcher } from './liveEndedWatcher'
import {
  dismissWechatChannelModals,
  dismissWechatChannelModalsUntilGone,
} from './overlays'

const PLATFORM_NAME = '微信视频号' as const

/**
 * 微信视频号
 */
export class WechatChannelPlatform
  implements
    IPlatform,
    IPerformPopup,
    IPerformComment,
    ICommentListener,
    IPinComment,
    ILiveEndedWatch
{
  readonly _isPinComment = true
  readonly _isCommentListener = true
  readonly _isPerformComment = true
  readonly _isPerformPopup = true
  readonly _isLiveEndedWatch = true
  private mainPage: Page | null = null
  /** 商品列表页面 */
  private productsPage: Page | null = null
  private commentListener: WeChatChannelCommentListener | null = null
  private liveEndedWatcher: WeChatChannelLiveEndedWatcher | null = null
  private accountName = ''
  async connect(session: BrowserSession) {
    const { page } = session
    await page.goto(URLS.LIVE_CONTROL_PAGE, {
      waitUntil: 'domcontentloaded',
    })

    // 微信视频号有三种可能
    // 1. 未登录 -> 跳转登录页面
    // 2. 已登录但未开播 -> 跳转到首页
    // 3. 已登录且开播 -> 正常访问中控台
    await Promise.race([
      page.waitForURL(REGEXPS.LOGIN_PAGE, {
        timeout: 0,
      }),
      page.waitForSelector(SELECTORS.LOGIN.IN_LIVE_CONTROL, {
        timeout: 0,
      }),
      page.waitForURL(REGEXPS.INDEX_PAGE, { timeout: 0 }),
    ])

    // 未开播，跳转到首页了
    if (REGEXPS.INDEX_PAGE.test(page.url())) {
      throw new Error('视频号未开播的情况下无法连接到中控台，请先开播后再连接')
    }

    const isConnected = !REGEXPS.LOGIN_PAGE.test(session.page.url())

    // 视频号的商品列表不在中控台，需要额外打开新的页面
    if (isConnected) {
      this.mainPage = page
      this.productsPage = await session.context.newPage()
      await this.productsPage.goto(URLS.PRODUCTS_PAGE, { waitUntil: 'domcontentloaded' })
      // 「直播间讲解支持送礼物模式」会挡住商品列表
      await dismissWechatChannelModalsUntilGone(this.productsPage)
    }
    return isConnected
  }

  async login(browserSession: BrowserSession) {
    const { page } = browserSession
    if (!REGEXPS.LOGIN_PAGE.test(page.url())) {
      await page.goto(URLS.LOGIN_PAGE)
    }
    await browserSession.page.waitForSelector(SELECTORS.LOGIN.LOGGED_IN, {
      timeout: 0,
    })
  }

  async getAccountName(session: BrowserSession): Promise<string> {
    // 视频号如果窗口过小的话无法正常获取账号名
    // 直接访问视频号首页就能搞到用户名了
    const tempPage = await session.context.newPage()
    await tempPage.goto(URLS.INDEX_PAGE)
    const accountName = await getAccountName(tempPage, SELECTORS.ACCOUNT_NAME)
    await tempPage.close()
    this.accountName = accountName ?? ''
    this.commentListener?.setHostAccountName(this.accountName)
    return this.accountName
  }

  /** 商品页被关掉或还没打开时重新打开，避免弹窗直接报页面已关闭 */
  private async ensureProductsPage() {
    const main = ensurePage(this.mainPage)
    if (Result.isFailure(main)) return main
    if (!this.productsPage || this.productsPage.isClosed()) {
      const page = await main.value.context().newPage()
      this.productsPage = page
      await page.goto(URLS.PRODUCTS_PAGE, { waitUntil: 'domcontentloaded' })
      await dismissWechatChannelModalsUntilGone(page)
    } else {
      await dismissWechatChannelModals(this.productsPage)
    }
    if (!this.productsPage || this.productsPage.isClosed()) {
      return Result.fail(
        new UnexpectedError({
          description: '视频号商品页已关闭，请重新连接中控台后再开自动弹窗',
        }),
      )
    }
    return Result.succeed(this.productsPage)
  }

  async disconnect(): Promise<void> {
    throw new Error('Method not implemented.')
  }

  async performPopup(id: number, signal?: AbortSignal) {
    const page = await this.ensureProductsPage()
    if (Result.isFailure(page)) return page
    const current = page.value
    return toggleButton(
      () =>
        Result.pipe(
          getItemFromVirtualScroller(current, elementFinder, id),
          Result.andThen(item => elementFinder.getPopUpButtonFromGoodsItem(item)),
        ),
      TEXT.POPUP_BUTTON,
      TEXT.POPUP_BUTTON_CANCLE,
      signal,
    )
  }

  async performComment(message: string) {
    return Result.pipe(
      ensurePage(this.mainPage),
      Result.andThen(page => comment(page, elementFinder, message, false)),
    )
  }

  startCommentListener(
    onComment: (comment: LiveMessage) => void,
    source?: CommentListenerConfig['source'],
    onEnded?: (reason: string) => void,
  ) {
    const page = ensurePage(this.mainPage)
    if (Result.isFailure(page)) {
      throw page.error
    }
    this.commentListener = new WeChatChannelCommentListener(page.value)
    this.commentListener.setHostAccountName(this.accountName)
    this.commentListener.startCommentListener(onComment, source, onEnded)
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
    this.liveEndedWatcher = new WeChatChannelLiveEndedWatcher(page.value)
    this.liveEndedWatcher.start(onEnded)
  }

  stopLiveEndedWatch() {
    this.liveEndedWatcher?.stop()
    this.liveEndedWatcher = null
  }

  async pinComment(comment: string): Result.ResultAsync<void, PlatformError> {
    const page = ensurePage(this.mainPage)
    if (Result.isFailure(page)) {
      return page
    }
    // 要先点击“新消息”按钮加载评论！
    const newCommentButton = await elementFinder.getNewCommentButton(page.value)
    if (Result.isSuccess(newCommentButton)) {
      await newCommentButton.value.click()
    }
    const els = await elementFinder.getComments(page.value)
    if (Result.isFailure(els)) {
      return els
    }
    for (const el of els.value.reverse()) {
      const text = ((await el.textContent()) ?? '').trim()
      if (comment === text) {
        // 找到匹配的评论，点击上墙按钮
        await el.click()
        const pinCommentActionItem = elementFinder.getPinCommentActionItem(page.value)
        await pinCommentActionItem.click()
        return Result.succeed()
      }
    }
    return Result.fail(
      new ElementContentMismatchedError({
        current: '未匹配任何评论',
        target: comment,
      }),
    )
  }

  getPinCommentPage(): Page | null {
    return this.mainPage
  }

  getCommentListenerPage(): Page {
    return Result.unwrap(ensurePage(this.commentListener?.getCommentListenerPage()))
  }

  getPopupPage() {
    return this.productsPage
  }

  async listGoodsIds() {
    const page = await this.ensureProductsPage()
    if (Result.isFailure(page)) return page
    return getAllGoodsIdsFromScroller(page.value, elementFinder)
  }

  getCommentPage() {
    return this.mainPage
  }

  get platformName() {
    return PLATFORM_NAME
  }
}
