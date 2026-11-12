import { Result } from '@praha/byethrow'
import type { Page } from 'playwright'
import { CommentAreaBlockedError, GoodsListBlockedError } from '#/errors/PlatformError'
import type { BrowserSession } from '#/managers/BrowserSessionManager'
import {
  comment,
  connect,
  ensurePage,
  getAccountName,
  getAllGoodsIdsFromScroller,
  getItemFromVirtualScroller,
  toggleButton,
} from '../helper'
import type { ILiveEndedWatch, IPerformComment, IPerformPopup, IPlatform } from '../IPlatform'
import { isCommentAreaBlocked, isGoodsListBlocked } from '../douyin/overlays'
import { REGEXPS, SELECTORS, TEXTS, URLS } from './constant'
import { douyinEosElementFinder as elementFinder } from './element-finder'
import { DouyinEosLiveEndedWatcher } from './liveEndedWatcher'

const PLATFORM_NAME = '抖音团购' as const

/**
 * 抖音团购
 */
export class DouyinEosPlatform implements IPlatform, IPerformPopup, IPerformComment, ILiveEndedWatch {
  readonly _isPerformComment = true
  readonly _isPerformPopup = true
  readonly _isLiveEndedWatch = true
  public mainPage: Page | null = null
  private liveEndedWatcher: DouyinEosLiveEndedWatcher | null = null

  async connect(browserSession: BrowserSession) {
    const { page } = browserSession
    const isConnected = await connect(page, {
      isInLiveControlSelector: SELECTORS.IN_LIVE_CONTROL,
      liveControlUrl: URLS.LIVE_CONTROL,
      loginUrlRegex: REGEXPS.LOGIN_PAGE,
    })
    if (isConnected) {
      this.mainPage = page
    }
    return isConnected
  }

  async login(browserSession: BrowserSession) {
    if (!REGEXPS.LOGIN_PAGE.test(browserSession.page.url())) {
      await browserSession.page.goto(URLS.LOGIN_PAGE)
    }
    await browserSession.page.waitForSelector(SELECTORS.LOGGED_IN, {
      timeout: 0,
    })
  }

  async getAccountName(session: BrowserSession) {
    const accountName = await getAccountName(session.page, SELECTORS.ACCOUNT_NAME)
    return accountName ?? ''
  }

  disconnect(): Promise<void> {
    throw new Error('Method not implemented.')
  }

  async performPopup(id: number, signal?: AbortSignal) {
    return Result.pipe(
      ensurePage(this.mainPage),
      Result.andThen(async page => {
        // 面板盖住时仍直接走 DOM（dispatchEvent），不要求视觉可点
        const result = await toggleButton(
          () =>
            Result.pipe(
              getItemFromVirtualScroller(page, elementFinder, id),
              Result.andThen(item => elementFinder.getPopUpButtonFromGoodsItem(item)),
            ),
          TEXTS.POPUP_BUTTON,
          TEXTS.POPUP_BUTTON_CANCLE,
          signal,
        )
        if (Result.isFailure(result) && (await isGoodsListBlocked(page, SELECTORS.GOODS_LIST_ROOT))) {
          return Result.fail(new GoodsListBlockedError())
        }
        return result
      }),
    )
  }

  async performComment(message: string) {
    return Result.pipe(
      ensurePage(this.mainPage),
      Result.andThen(async page => {
        const result = await comment(page, elementFinder, message, false)
        if (
          Result.isFailure(result) &&
          (await isCommentAreaBlocked(page, SELECTORS.commentInput.ROOT))
        ) {
          return Result.fail(new CommentAreaBlockedError())
        }
        return result
      }),
    )
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

  startLiveEndedWatch(onEnded: (reason: string) => void) {
    this.stopLiveEndedWatch()
    const page = ensurePage(this.mainPage)
    if (Result.isFailure(page)) {
      throw page.error
    }
    this.liveEndedWatcher = new DouyinEosLiveEndedWatcher(page.value)
    this.liveEndedWatcher.start(onEnded)
  }

  stopLiveEndedWatch() {
    this.liveEndedWatcher?.stop()
    this.liveEndedWatcher = null
  }

  get platformName() {
    return PLATFORM_NAME
  }
}
