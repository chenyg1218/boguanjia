import { Result } from '@praha/byethrow'
import type { Page } from 'playwright'
import type { PlatformError } from '#/errors/PlatformError'
import type { BrowserSession } from '#/managers/BrowserSessionManager'
import { DouyinPlatform } from '../douyin'
import { CompassListener, ControlListener } from '../douyin/commentListener'
// 百应和抖店共用
import { connect, ensurePage, openUrlByElement } from '../helper'
import type {
  IAudienceRoomUrl,
  ICommentListener,
  ILiveEndedWatch,
  IPerformComment,
  IPerformPopup,
  IPlatform,
  ISendRedPacket,
} from '../IPlatform'
import { ensureLivePreviewOn } from '../douyin/livePreview'
import { resolveDouyinAudienceRoom } from '../douyin/resolveAudienceRoomUrl'
import { REGEXPS, SELECTORS, URLS } from './constant'

const PLATFORM_NAME = '巨量百应' as const

/**
 * 巨量百应
 */
export class BuyinPlatform
  implements
    IPlatform,
    IPerformPopup,
    IPerformComment,
    ICommentListener,
    ISendRedPacket,
    ILiveEndedWatch,
    IAudienceRoomUrl
{
  readonly _isSendRedPacket = true
  readonly _isPerformComment = true
  readonly _isPerformPopup = true
  readonly _isCommentListener = true
  readonly _isLiveEndedWatch = true
  readonly _isAudienceRoomUrl = true

  private mainPage: Page | null = null
  private commentListener: ICommentListener | null = null
  private accountName = ''

  get platformName() {
    return PLATFORM_NAME
  }

  async connect(browserSession: BrowserSession) {
    const { page } = browserSession
    const isConnected = await connect(page, {
      isInLiveControlSelector: SELECTORS.IN_LIVE_CONTROL,
      liveControlUrl: URLS.LIVE_CONTROL_PAGE,
      loginUrlRegex: REGEXPS.LOGIN_PAGE,
    })
    if (isConnected) {
      // 2025.11 巨量百应的中控台和登录时一样，样式会乱，同样的解决方法
      const newPage = await openUrlByElement(page, URLS.LIVE_CONTROL_PAGE)
      browserSession.page = newPage
      this.mainPage = newPage
      await page.close()
      await ensureLivePreviewOn(newPage)
    }
    return isConnected
  }

  async login(browserSession: BrowserSession) {
    // 进入登录页面
    // 巨量百应（2025.8）也有和抖店同样的问题
    // 解决方法：通过控件主动打开登录页面
    const newPage = await openUrlByElement(browserSession.page, URLS.LOGIN_PAGE)
    await browserSession.page.close()
    browserSession.page = newPage

    await browserSession.page.waitForSelector(SELECTORS.LOGGED_IN, {
      timeout: 0,
    })
  }

  async getAccountName(session: BrowserSession) {
    await session.page.waitForSelector(SELECTORS.ACCOUNT_NAME)
    const accountName = await session.page.$(SELECTORS.ACCOUNT_NAME).then(el => el?.textContent())
    this.accountName = accountName?.trim() ?? ''
    const listener = this.commentListener as
      | ControlListener
      | CompassListener
      | null
    listener?.setHostAccountName?.(this.accountName)
    return this.accountName
  }

  disconnect(): Promise<void> {
    throw new Error('Method not implemented.')
  }

  async resolveAudienceRoomUrl(
    viewerPage?: Page | null,
    known?: { roomId?: string; secUid?: string },
  ) {
    const page = this.mainPage
    if (!page || page.isClosed()) {
      throw new Error('中控台未就绪，请先连接中控台并确认已开播')
    }
    return resolveDouyinAudienceRoom(page, viewerPage, known)
  }

  async performPopup(...args: Parameters<IPerformPopup['performPopup']>) {
    return await DouyinPlatform.prototype.performPopup.call(this, ...args)
  }

  async listGoodsIds() {
    return DouyinPlatform.prototype.listGoodsIds!.call(this)
  }

  sendRedPacket(
    ...args: Parameters<ISendRedPacket['sendRedPacket']>
  ): Result.ResultAsync<void, PlatformError> {
    return DouyinPlatform.prototype.sendRedPacket.call(this, ...args)
  }

  getRedPacketPage(): Page | null {
    return this.mainPage
  }

  async performComment(message: string, pinTop: boolean) {
    return await DouyinPlatform.prototype.performComment.call(this, message, pinTop)
  }

  startCommentListener(
    onComment: (comment: LiveMessage) => void,
    source: 'control' | 'compass',
    onEnded?: (reason: string) => void,
  ) {
    const pageResult = ensurePage(this.mainPage)
    if (Result.isFailure(pageResult)) {
      throw pageResult.error
    }
    const page = pageResult.value
    if (source === 'control') {
      const listener = new ControlListener(page)
      listener.setHostAccountName(this.accountName)
      this.commentListener = listener
    } else {
      const listener = new CompassListener('buyin', page)
      listener.setHostAccountName(this.accountName)
      this.commentListener = listener
    }
    return this.commentListener.startCommentListener(onComment, source, onEnded)
  }

  stopCommentListener(): void {
    this.commentListener?.stopCommentListener()
  }

  startLiveEndedWatch(onEnded: (reason: string) => void) {
    return DouyinPlatform.prototype.startLiveEndedWatch.call(this, onEnded)
  }

  stopLiveEndedWatch() {
    return DouyinPlatform.prototype.stopLiveEndedWatch.call(this)
  }

  getCommentListenerPage(): Page {
    if (!this.commentListener) {
      throw new Error('未找到评论监听页面')
    }
    return this.commentListener?.getCommentListenerPage() ?? this.mainPage
  }

  getPopupPage() {
    return this.mainPage
  }

  getCommentPage() {
    return this.mainPage
  }
}
