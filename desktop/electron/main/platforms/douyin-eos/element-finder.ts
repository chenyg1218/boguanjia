import { Result } from '@praha/byethrow'
import type { ElementHandle, Page } from 'playwright'
import { ElementDisabledError, ElementNotFoundError } from '#/errors/PlatformError'
import { commonElementFinder, type IElementFinder } from './../IElementFinder'
import { SELECTORS } from './constant'

export const douyinEosElementFinder: IElementFinder = {
  async getPinTopLabel() {
    return commonElementFinder.getEmptyPinTopLabel()
  },

  async getClickableSubmitCommentButton(page: Page) {
    const sendMessageButton = await page.$(SELECTORS.commentInput.SUBMIT_BUTTON)
    if (!sendMessageButton) {
      return Result.fail(
        new ElementNotFoundError({
          elementName: '发送评论按钮',
          selector: SELECTORS.commentInput.SUBMIT_BUTTON,
        }),
      )
    }
    if (await sendMessageButton.evaluate(el => el.className.includes('disable'))) {
      return Result.fail(
        new ElementDisabledError({
          elementName: '发送评论按钮',
          element: await sendMessageButton.evaluate(el => el.outerHTML),
        }),
      )
    }
    return Result.succeed(sendMessageButton)
  },

  async getPopUpButtonFromGoodsItem(item: ElementHandle<SVGElement | HTMLElement>) {
    let button: ElementHandle<SVGElement | HTMLElement> | null
    try {
      button = await item.$(SELECTORS.goodsItem.POPUP_BUTTON)
    } catch {
      return Result.fail(
        new ElementNotFoundError({
          elementName: '讲解按钮',
          selector: SELECTORS.goodsItem.POPUP_BUTTON,
        }),
      )
    }
    if (!button) {
      return Result.fail(
        new ElementNotFoundError({
          elementName: '讲解按钮',
          selector: SELECTORS.goodsItem.POPUP_BUTTON,
        }),
      )
    }
    try {
      const state = await button.evaluate(el => {
        if (!el.isConnected) return { attached: false as const }
        const className = typeof el.className === 'string' ? el.className : String(el.className ?? '')
        return {
          attached: true as const,
          disabled: className.includes('disabled'),
          html: el.outerHTML,
        }
      })
      if (!state.attached) {
        return Result.fail(
          new ElementNotFoundError({
            elementName: '讲解按钮',
            selector: SELECTORS.goodsItem.POPUP_BUTTON,
          }),
        )
      }
      if (state.disabled) {
        return Result.fail(
          new ElementDisabledError({
            elementName: '讲解按钮',
            element: state.html,
          }),
        )
      }
    } catch {
      return Result.fail(
        new ElementNotFoundError({
          elementName: '讲解按钮',
          selector: SELECTORS.goodsItem.POPUP_BUTTON,
        }),
      )
    }
    return Result.succeed(button as ElementHandle<HTMLButtonElement>)
  },

  async getIdFromGoodsItem(item: ElementHandle<SVGElement | HTMLElement>) {
    return commonElementFinder.getIdFromGoodsItem(item, SELECTORS.goodsItem.ID)
  },

  async getCurrentGoodsItemsList(page: Page) {
    return commonElementFinder.getCurrentGoodsItemsList(page, SELECTORS.GOODS_ITEM)
  },

  async getGoodsItemsScrollContainer(page: Page) {
    return commonElementFinder.getGoodsItemsScrollContainer(page, SELECTORS.GOODS_ITEMS_WRAPPER)
  },

  async getCommentTextarea(page: Page) {
    return commonElementFinder.getCommentTextarea(page, SELECTORS.commentInput.TEXTAREA)
  },
}
