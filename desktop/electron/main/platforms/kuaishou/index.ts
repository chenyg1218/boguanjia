import { Result } from '@praha/byethrow'
import type { Page } from 'playwright'
import { ElementContentMismatchedError, PageNotFoundError } from '#/errors/PlatformError'
import type { BrowserSession } from '#/managers/BrowserSessionManager'
import { sleep } from '#/utils'
import {
  comment,
  connect,
  ensurePage,
  getAccountName,
  getAllGoodsIdsFromScroller,
  getItemFromVirtualScroller,
} from '../helper'
import type { ICommentListener, IPerformComment, IPerformPopup, IPlatform } from '../IPlatform'
import { KuaishouCommentListener } from './commentListener'
import { REGEXPS, SELECTORS, URLS } from './constant'
import { kuaishouElementFinder as elementFinder } from './element-finder'
import { dismissKuaishouModals, dismissKuaishouModalsUntilGone } from './overlays'

const PLATFORM_NAME = '快手小店' as const

export class KuaishouPlatform
  implements IPlatform, IPerformPopup, IPerformComment, ICommentListener
{
  readonly _isPerformPopup = true
  readonly _isPerformComment = true
  readonly _isCommentListener = true
  private mainPage: Page | null = null
  private commentListener: KuaishouCommentListener | null = null

  async connect(browserSession: BrowserSession): Promise<boolean> {
    const { page } = browserSession
    await KuaishouCommentListener.hook(page)
    const isConnected = await connect(page, {
      isInLiveControlSelector: SELECTORS.IN_LIVE_CONTROL,
      liveControlUrl: URLS.LIVE_CONTROL,
      loginUrlRegex: REGEXPS.LOGIN_PAGE,
    })

    if (isConnected) {
      // 快手小店会弹出莫名其妙的窗口，按 ESC 关闭
      let popover = await page
        .waitForSelector(SELECTORS.DRIVER_POPOVER, { timeout: 3000 })
        .catch(_ => null)
      while (popover) {
        await page.press('body', 'Escape')
        await sleep(1000)
        popover = await page.$(SELECTORS.DRIVER_POPOVER)
      }
      // 进中控台时可能已有团购引导 / 残留开播提示
      await dismissKuaishouModalsUntilGone(page, 2000)
      this.mainPage = page
    }

    return isConnected
  }

  async login(browserSession: BrowserSession): Promise<void> {
    const LOGIN_TIMEOUT_MS = 5 * 60 * 1000
    if (!REGEXPS.LOGIN_PAGE.test(browserSession.page.url())) {
      await browserSession.page.goto(URLS.LOGIN_PAGE)
    }
    try {
      await browserSession.page.waitForSelector(SELECTORS.LOGGED_IN, {
        timeout: LOGIN_TIMEOUT_MS,
      })
    } catch {
      throw new Error('登录超时（5 分钟内未完成扫码）。请关闭无头模式后重新连接并完成扫码')
    }
  }

  async getAccountName(session: BrowserSession): Promise<string> {
    const accountName = await getAccountName(session.page, SELECTORS.ACCOUNT_NAME)
    return accountName ?? ''
  }

  disconnect(): Promise<void> {
    throw new Error('断开连接功能暂未实现，请等待后续版本')
  }

  async performComment(message: string, pinTop?: boolean) {
    const pageResult = ensurePage(this.mainPage)
    if (Result.isFailure(pageResult)) return pageResult
    // 开播提示 / 讲解确认会挡住评论框，发送前先点掉
    await dismissKuaishouModalsUntilGone(pageResult.value, 2500)
    return comment(pageResult.value, elementFinder, message, pinTop)
  }

  getCommentPage() {
    return this.mainPage
  }

  async performPopup(id: number) {
    if (!this.mainPage) {
      return Result.fail(new PageNotFoundError())
    }
    // 开播提示挡着点不了「开始讲解」
    await dismissKuaishouModalsUntilGone(this.mainPage, 2000)

    const item = await getItemFromVirtualScroller(this.mainPage, elementFinder, id)
    if (Result.isFailure(item)) {
      return item
    }
    const button = await elementFinder.getPopUpButtonFromGoodsItem(item.value)
    if (Result.isFailure(button)) {
      return button
    }
    const buttonText = (await button.value.textContent())?.trim() ?? ''
    if (buttonText !== '结束讲解' && buttonText !== '开始讲解') {
      return Result.fail(
        new ElementContentMismatchedError({
          current: buttonText,
          target: '结束讲解或开始讲解',
        }),
      )
    }
    await button.value.dispatchEvent('click')
    // 「确定结束当前讲解？」「确认开始新的讲解么?」
    await dismissKuaishouModalsUntilGone(this.mainPage, 3500, { preferPopupConfirm: true })

    // 结束讲解 - 需要再次开始讲解
    if (buttonText === '结束讲解') {
      await sleep(100)
      const newButton = await elementFinder.getPopUpButtonFromGoodsItem(item.value)
      if (Result.isFailure(newButton)) {
        return newButton
      }
      const newButtonText = (await newButton.value.textContent())?.trim() ?? ''
      if (newButtonText !== '开始讲解') {
        return Result.fail(
          new ElementContentMismatchedError({
            current: newButtonText,
            target: '开始讲解',
          }),
        )
      }
      await newButton.value.dispatchEvent('click')
      await dismissKuaishouModalsUntilGone(this.mainPage, 3500, { preferPopupConfirm: true })
    }
    return Result.succeed()
  }

  startCommentListener(onComment: (comment: LiveMessage) => void): void | Promise<void> {
    const page = ensurePage(this.mainPage)
    if (Result.isFailure(page)) {
      throw page.error
    }
    if (!this.commentListener) {
      this.commentListener = new KuaishouCommentListener(page.value)
    }
    this.commentListener.startCommentListener(onComment)
  }

  stopCommentListener(): void {
    this.commentListener?.stopCommentListener()
  }
  getCommentListenerPage(): Page {
    if (!this.commentListener) {
      throw new Error('评论监听未启动。请先点击「开始监听」')
    }
    return this.commentListener.getPage()
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

  get platformName() {
    return PLATFORM_NAME
  }
}
