import { Result } from '@praha/byethrow'
import type { ElementHandle, Page } from 'playwright'
import {
  ElementContentMismatchedError,
  ElementDisabledError,
  ElementNotFoundError,
} from '#/errors/PlatformError'
import { commonElementFinder, type IElementFinder } from '../IElementFinder'
import { SELECTORS, TEXTS } from './constant'

function normalizeText(text: string | null | undefined) {
  return (text ?? '').replace(/\s+/g, '').trim()
}

async function findActionButton(
  item: ElementHandle<SVGElement | HTMLElement>,
  names: string[],
  elementName: string,
) {
  const actions = await item.$$(SELECTORS.GOODS_ITEM_INNER.ACTION_BTN)
  for (const action of actions) {
    const text = normalizeText(await action.textContent())
    if (!names.includes(text)) continue
    if (
      await action.evaluate(
        (el, disabledClass) => el.classList.contains(disabledClass),
        SELECTORS.GOODS_ITEM_INNER.ACTION_DISABLED,
      )
    ) {
      return Result.fail(
        new ElementDisabledError({
          elementName,
          element: await action.evaluate(el => el.outerHTML),
        }),
      )
    }
    return Result.succeed(action)
  }
  return Result.fail(
    new ElementNotFoundError({
      elementName,
      selector: SELECTORS.GOODS_ITEM_INNER.ACTION_BTN,
    }),
  )
}

export const xiaohongshuElementFinder: IElementFinder & {
  getPopUpCardButtonFromGoodsItem: IElementFinder['getPopUpButtonFromGoodsItem']
} = {
  /** 观众侧商品卡：「弹卡 / 弹卡中」 */
  getPopUpCardButtonFromGoodsItem(item) {
    return findActionButton(item, [TEXTS.POPUP_CARD, TEXTS.POPUP_CARD_BUSY], '弹卡')
  },

  async getPopUpButtonFromGoodsItem(item: ElementHandle<SVGElement | HTMLElement>) {
    // 新版卡片：优先「讲解 / 结束讲解」（用间隔控制讲多久）
    const explainBtn = await findActionButton(
      item,
      [TEXTS.POPUP_BUTTON, TEXTS.POPUP_BUTTON_CANCLE],
      '讲解',
    )
    if (Result.isSuccess(explainBtn)) return explainBtn
    if (!(explainBtn.error instanceof ElementNotFoundError)) return explainBtn

    // 旧版 table：.more-operation 里的讲解
    const pannel = await item.$(SELECTORS.GOODS_ITEM_INNER.OPERATION_PANNEL)
    if (!pannel) {
      return Result.fail(
        new ElementNotFoundError({
          elementName: '讲解按钮',
          selector: SELECTORS.GOODS_ITEM_INNER.ACTION_BTN,
        }),
      )
    }
    const operations = await pannel.$$(SELECTORS.GOODS_ITEM_INNER.OPERATION_ITEM)
    for (const operation of operations) {
      if ((await operation.textContent())?.includes(TEXTS.POPUP_BUTTON)) {
        if (
          await operation.evaluate(
            (e, disabledClass) => e.classList.contains(disabledClass),
            SELECTORS.GOODS_ITEM_INNER.POPUP_BUTTON_DISABLED,
          )
        ) {
          return Result.fail(
            new ElementDisabledError({
              elementName: '讲解',
              element: await operation.evaluate(el => el.outerHTML),
            }),
          )
        }
        return Result.succeed(operation)
      }
    }
    return Result.fail(
      new ElementNotFoundError({
        elementName: '讲解按钮',
      }),
    )
  },

  async getIdFromGoodsItem(item: ElementHandle<SVGElement | HTMLElement>) {
    const candidates: string[] = []

    const push = (raw: string | null | undefined) => {
      const text = normalizeText(raw)
      if (text) candidates.push(text)
    }

    // 只读序号
    const numEl = await item.$(SELECTORS.GOODS_ITEM_INNER.ID_NUM)
    if (numEl) push(await numEl.textContent())

    // 可编辑序号：class 在 Delight Input 根节点上，真正的 <input> 在内部
    const indexRoot = await item.$(SELECTORS.GOODS_ITEM_INNER.ID_WRAP)
    if (indexRoot) {
      const nested = await indexRoot.$('input')
      if (nested) {
        push(await nested.inputValue().catch(() => ''))
        push(await nested.getAttribute('placeholder'))
      }
      // 「顶」等文案里仍可能夹着数字；取首个正整数
      const indexText = normalizeText(await indexRoot.textContent())
      const matched = indexText.match(/\d+/)
      if (matched) candidates.push(matched[0])
    }

    for (const sel of [
      `${SELECTORS.GOODS_ITEM_INNER.ID_INPUT} input`,
      SELECTORS.GOODS_ITEM_INNER.ID_INPUT,
    ]) {
      const el = await item.$(sel)
      if (!el) continue
      push(await el.inputValue().catch(() => ''))
      push(await el.getAttribute('placeholder'))
      push(await el.textContent())
    }

    for (const raw of candidates) {
      const id = Number.parseInt(raw, 10)
      if (!Number.isNaN(id) && id > 0) return Result.succeed(id)
    }

    // 旧版 table
    const legacy = await commonElementFinder.getIdFromGoodsItem(
      item,
      SELECTORS.GOODS_ITEM_INNER.ID,
    )
    if (Result.isSuccess(legacy)) return legacy

    return Result.fail(
      new ElementContentMismatchedError({
        current: candidates[0] ?? '',
        target: '数字',
      }),
    )
  },

  async getCurrentGoodsItemsList(page: Page) {
    const cardItems = await commonElementFinder.getCurrentGoodsItemsList(page, SELECTORS.GOODS_ITEM)
    if (Result.isSuccess(cardItems)) return cardItems
    return commonElementFinder.getCurrentGoodsItemsList(page, SELECTORS.GOODS_ITEM_LEGACY)
  },

  async getGoodsItemsScrollContainer(page: Page) {
    const cardWrap = await commonElementFinder.getGoodsItemsScrollContainer(
      page,
      SELECTORS.GOODS_ITEMS_WRAPPER,
    )
    if (Result.isSuccess(cardWrap)) return cardWrap
    return commonElementFinder.getGoodsItemsScrollContainer(
      page,
      SELECTORS.GOODS_ITEMS_WRAPPER_LEGACY,
    )
  },

  getCommentTextarea(page: Page) {
    return commonElementFinder.getCommentTextarea(page, SELECTORS.COMMENT_INPUT.TEXTAREA)
  },

  async getClickableSubmitCommentButton(page: Page) {
    const submitButton = await page.$(SELECTORS.COMMENT_INPUT.SUBMIT_BUTTON)
    if (!submitButton) {
      return Result.fail(
        new ElementNotFoundError({
          elementName: '发送评论按钮',
          selector: SELECTORS.COMMENT_INPUT.SUBMIT_BUTTON,
        }),
      )
    }
    if (
      await submitButton.evaluate(
        (el, SELECTORS) => el.className.includes(SELECTORS.COMMENT_INPUT.SUBMIT_BUTTON_DISABLED),
        SELECTORS,
      )
    ) {
      return Result.fail(
        new ElementDisabledError({
          elementName: '发送评论按钮',
          element: await submitButton.evaluate(el => el.outerHTML),
        }),
      )
    }
    return Result.succeed(submitButton)
  },

  async getPinTopLabel() {
    return commonElementFinder.getEmptyPinTopLabel()
  },
}
