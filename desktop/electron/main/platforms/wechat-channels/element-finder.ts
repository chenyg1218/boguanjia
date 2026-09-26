import { Result } from '@praha/byethrow'
import type { ElementHandle, Locator, Page } from 'playwright'
import {
  ElementDisabledError,
  ElementNotFoundError,
  type PlatformError,
} from '#/errors/PlatformError'
import { commonElementFinder, type IElementFinder } from '../IElementFinder'
import { SELECTORS } from './constant'

const GOODS_ITEM_SELECTORS = [
  SELECTORS.GOODS_ITEM,
  '.commodity-list-wrap .table-row-wrap',
  '.table-body-wrap .table-row-wrap',
] as const

const GOODS_SCROLL_SELECTORS = [
  '.commodity-list-wrap .table-body-wrap',
  '.commodity-list-wrap',
] as const

async function queryHandles(page: Page, selector: string) {
  if (page.isClosed()) return []
  let best: ElementHandle<SVGElement | HTMLElement>[] = []
  for (const frame of page.frames()) {
    const found = await frame.$$(selector).catch(() => [])
    if (found.length > best.length) best = found
  }
  return best
}

async function queryFirstHandle(page: Page, selector: string) {
  const handles = await queryHandles(page, selector)
  return handles[0] ?? null
}

type WechatChannelElementFinder = IElementFinder & {
  getNewCommentButton(page: Page): Result.ResultAsync<Locator, PlatformError>
  getComments(page: Page): Result.ResultAsync<Locator[], PlatformError>
  getPinCommentActionItem(page: Page): Locator
}

export const wechatChannelElementFinder: WechatChannelElementFinder = {
  async getPopUpButtonFromGoodsItem(item: ElementHandle<SVGElement | HTMLElement>) {
    const button = await item.$(SELECTORS.goodsItem.POPUP_BUTTON)
    if (button) return Result.succeed(button)

    const candidates = await item.$$('span, button, a').catch(() => [])
    for (const candidate of candidates) {
      const text = ((await candidate.textContent().catch(() => '')) ?? '').replace(/\s+/g, '')
      if (text === '讲解' || text === '结束讲解' || text === '开始讲解') {
        return Result.succeed(candidate)
      }
    }
    return Result.fail(
      new ElementNotFoundError({
        elementName: '讲解按钮',
        selector: SELECTORS.goodsItem.POPUP_BUTTON,
      }),
    )
  },

  async getIdFromGoodsItem(item: ElementHandle<SVGElement | HTMLElement>) {
    // 注：视频号的商品 ID 通过 textContent 获取，其余平台是 InputValue
    return commonElementFinder.getIdFromGoodsItem(item, SELECTORS.goodsItem.ID, true)
  },

  async getCurrentGoodsItemsList(page: Page) {
    let items: ElementHandle<SVGElement | HTMLElement>[] = []
    for (const selector of GOODS_ITEM_SELECTORS) {
      items = await queryHandles(page, selector)
      if (items.length > 0) break
    }
    if (items.length === 0) {
      return Result.fail(
        new ElementNotFoundError({
          elementName: '商品列表',
          selector: SELECTORS.GOODS_ITEM,
        }),
      )
    }
    if (items.length <= 1) {
      return Result.succeed(items)
    }
    return Result.pipe(
      Result.sequence([
        this.getIdFromGoodsItem(items[0]),
        this.getIdFromGoodsItem(items[items.length - 1]),
      ]),
      Result.andThen(([firstIdValue, lastIdValue]) => {
        // 视频号可能是倒序的，需要转成正序
        if (firstIdValue > lastIdValue) {
          items.reverse()
        }
        return Result.succeed(items)
      }),
    )
  },

  async getGoodsItemsScrollContainer(page: Page) {
    for (const selector of GOODS_SCROLL_SELECTORS) {
      const container = await queryFirstHandle(page, selector)
      if (container) return Result.succeed(container)
    }
    return Result.fail(new ElementNotFoundError({ elementName: '商品列表' }))
  },

  async getCommentTextarea(page: Page) {
    const iframe = page.locator(SELECTORS.LIVE_CONTROL_IFRAME)
    const textarea = iframe.locator(SELECTORS.commentInput.TEXTAREA)
    return Result.succeed(textarea)
  },

  async getClickableSubmitCommentButton(page: Page) {
    // 评论区在 wujie iframe 内，不能用 page.$（只会查主文档）
    const button = page
      .locator(SELECTORS.LIVE_CONTROL_IFRAME)
      .locator(SELECTORS.commentInput.SUBMIT_BUTTON)
      .first()
    if ((await button.count()) === 0) {
      return Result.fail(
        new ElementNotFoundError({
          elementName: '发送按钮',
          selector: SELECTORS.commentInput.SUBMIT_BUTTON,
        }),
      )
    }
    const className = (await button.getAttribute('class')) ?? ''
    const disabledAttr = await button.getAttribute('disabled')
    if (
      className.includes(SELECTORS.commentInput.SUBMIT_BUTTON_DISABLED) ||
      disabledAttr !== null ||
      (await button.isDisabled().catch(() => false))
    ) {
      return Result.fail(
        new ElementDisabledError({
          elementName: '发送按钮',
          element: await button.evaluate(el => el.outerHTML),
        }),
      )
    }
    const handle = await button.elementHandle()
    if (!handle) {
      return Result.fail(
        new ElementNotFoundError({
          elementName: '发送按钮',
          selector: SELECTORS.commentInput.SUBMIT_BUTTON,
        }),
      )
    }
    return Result.succeed(handle)
  },

  async getPinTopLabel() {
    return commonElementFinder.getEmptyPinTopLabel()
  },

  async getComments(page: Page) {
    const iframe = page.locator(SELECTORS.LIVE_CONTROL_IFRAME)
    const comments = await iframe.locator('.live-message-item-container .message-content').all()
    if (comments.length === 0) {
      return Result.fail(new ElementNotFoundError({ elementName: '评论' }))
    }
    return Result.succeed(comments)
  },

  async getNewCommentButton(page: Page): Result.ResultAsync<Locator, PlatformError> {
    const newCommentButton = page.locator('.comment__load')
    if (await newCommentButton.isVisible()) {
      return Result.succeed(newCommentButton)
    }
    return Result.fail(
      new ElementNotFoundError({
        elementName: '新消息按钮',
        selector: SELECTORS.commentInput.SUBMIT_BUTTON,
      }),
    )
  },

  getPinCommentActionItem(page: Page) {
    return page.locator(
      '.live-message-container .action-popover .action-popover__action-item:text("上墙")',
    )
  },
}
