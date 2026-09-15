import { Result } from '@praha/byethrow'
import type { ElementHandle, Page } from 'playwright'
import { UnexpectedError } from '#/errors/AppError'
import {
  ElementContentMismatchedError,
  ElementDisabledError,
  ElementNotFoundError,
  MaxTryCountExceededError,
  PageNotFoundError,
  type PlatformError,
} from '#/errors/PlatformError'
import { abortableSleep, sleep } from '#/utils'
import type { IElementFinder } from './IElementFinder'

/** 判断是否已在中控台 / 是否跳到登录页的等待上限 */
const CONNECT_PROBE_TIMEOUT_MS = 90_000

export async function connect(
  page: Page,
  loginConstants: {
    liveControlUrl: string
    loginUrlRegex: RegExp
    isInLiveControlSelector: string
  },
) {
  await page.goto(loginConstants.liveControlUrl, {
    waitUntil: 'domcontentloaded',
  })
  try {
    await Promise.race([
      page.waitForURL(loginConstants.loginUrlRegex, {
        timeout: CONNECT_PROBE_TIMEOUT_MS,
        waitUntil: 'domcontentloaded',
      }),
      page.waitForSelector(loginConstants.isInLiveControlSelector, {
        timeout: CONNECT_PROBE_TIMEOUT_MS,
        // 抖店登录后可能出现重复/未完全可见的同名节点，attached 即可判定已进入中控台（对齐 oba #320）
        state: 'attached',
      }),
    ])
  } catch {
    throw new Error(
      '打开中控台超时：页面未进入登录页或直播控制台。请检查网络，或关闭无头模式后重试',
    )
  }

  const isConnected = !loginConstants.loginUrlRegex.test(page.url())
  return isConnected
}

export async function getAccountName(page: Page, accountNameSelector: string) {
  const name = await page.waitForSelector(accountNameSelector).then(el => el.textContent())
  return name?.trim() ?? null
}

const COMMENT_FILL_TIMEOUT_MS = 5000
const COMMENT_BUTTON_WAIT_MS = 2500
const COMMENT_SENT_WAIT_MS = 3000

type CommentInput = Awaited<
  ReturnType<IElementFinder['getCommentTextarea']>
> extends Result.Result<infer T, unknown>
  ? T
  : never

/** 原生方式写入受控 input/textarea（快手等 React 受控框 fill 常不同步） */
async function nativeSetCommentValue(
  textarea: CommentInput,
  message: string,
) {
  await (textarea as ElementHandle<HTMLTextAreaElement | HTMLInputElement>).evaluate(
    (el, value) => {
      const input = el as HTMLTextAreaElement | HTMLInputElement
      input.focus()
      const proto =
        input instanceof HTMLTextAreaElement
          ? window.HTMLTextAreaElement.prototype
          : window.HTMLInputElement.prototype
      const setter = Object.getOwnPropertyDescriptor(proto, 'value')?.set
      setter?.call(input, value)
      input.dispatchEvent(new InputEvent('input', { bubbles: true, inputType: 'insertText', data: value }))
      input.dispatchEvent(new Event('change', { bubbles: true }))
    },
    message,
  )
}

/** 写入评论框，并尽量同步受控组件状态（避免 fill 后 DOM 有字、React 仍为空） */
async function fillCommentInput(textarea: CommentInput, message: string) {
  await textarea.click({ timeout: COMMENT_FILL_TIMEOUT_MS }).catch(() => undefined)
  await textarea.fill('', { timeout: COMMENT_FILL_TIMEOUT_MS }).catch(() => undefined)
  await nativeSetCommentValue(textarea, message)

  let current = ''
  try {
    current = await textarea.inputValue()
  } catch {
    current = ''
  }
  if (current === message) return

  await textarea.fill(message, { timeout: COMMENT_FILL_TIMEOUT_MS }).catch(() => undefined)
  try {
    current = await textarea.inputValue()
  } catch {
    current = ''
  }
  if (current === message) {
    await nativeSetCommentValue(textarea, message)
    return
  }

  // 最后用逐字输入，确保键盘事件驱动受控组件
  await textarea.fill('', { timeout: COMMENT_FILL_TIMEOUT_MS }).catch(() => undefined)
  if ('pressSequentially' in textarea && typeof textarea.pressSequentially === 'function') {
    await textarea.pressSequentially(message, { delay: 12 })
  } else {
    await textarea.type(message, { delay: 12 })
  }
}

async function waitForClickableSubmit(
  page: Page,
  elementFinder: IElementFinder,
  timeoutMs = COMMENT_BUTTON_WAIT_MS,
) {
  const deadline = Date.now() + timeoutMs
  let lastError: PlatformError | null = null
  while (Date.now() < deadline) {
    const btn = await elementFinder.getClickableSubmitCommentButton(page)
    if (Result.isSuccess(btn)) return btn
    lastError = btn.error
    await sleep(150)
  }
  return Result.fail(
    lastError ??
      new ElementNotFoundError({
        elementName: '提交评论按钮',
      }),
  )
}

/** 发送成功后中控评论框通常会清空；未清空则视为未真正发出 */
async function waitForCommentInputCleared(
  page: Page,
  elementFinder: IElementFinder,
  timeoutMs = COMMENT_SENT_WAIT_MS,
) {
  const deadline = Date.now() + timeoutMs
  while (Date.now() < deadline) {
    const textarea = await elementFinder.getCommentTextarea(page)
    if (Result.isFailure(textarea)) return textarea
    let value = ''
    try {
      value = (await textarea.value.inputValue()).trim()
    } catch {
      value = ''
    }
    if (value.length === 0) return Result.succeed()
    await sleep(200)
  }
  return Result.fail(
    new UnexpectedError({
      description: '评论发送后输入框未清空，公屏可能未真正发出，将重试',
    }),
  )
}

/**
 * 发送钮优先真实 click（对齐 zhongkongzhushou / 驼铃公屏发送），
 * 失败再回退 dispatchEvent。讲解弹窗仍用 dispatchEvent，勿混用。
 */
async function clickSubmitCommentButton(button: ElementHandle<SVGElement | HTMLElement>) {
  try {
    await button.click({ timeout: 5000 })
  } catch {
    await button.dispatchEvent('click')
  }
}

/** 聚焦评论框后回车发送（快手等中控主路径；reply-content 内 button 可能是快捷回复下拉） */
async function pressEnterToSubmit(
  page: Page,
  elementFinder: IElementFinder,
) {
  const ta = await elementFinder.getCommentTextarea(page)
  if (Result.isFailure(ta)) return ta
  try {
    await ta.value.click({ timeout: 2000 })
  } catch {
    await ta.value.focus().catch(() => undefined)
  }
  await ta.value.press('Enter').catch(() => undefined)
  return Result.succeed()
}

export async function comment(
  page: Page,
  elementFinder: IElementFinder,
  message: string,
  pinTop?: boolean,
): Result.ResultAsync<boolean, PlatformError> {
  async function clickPinTopButton(): Result.ResultAsync<boolean, PlatformError> {
    return Result.pipe(
      elementFinder.getPinTopLabel(page),
      Result.inspect(label => label.dispatchEvent('click')),
      Result.map(_ => true),
      // 即使没有 pinTop 也不会中断程序
      Result.orElse(_ => Result.succeed(false)),
    )
  }

  const textareaResult = await elementFinder.getCommentTextarea(page)
  if (Result.isFailure(textareaResult)) return textareaResult

  try {
    await fillCommentInput(textareaResult.value, message)
  } catch (err) {
    return Result.fail(
      new UnexpectedError({
        description: `填写评论失败: ${err instanceof Error ? err.message : String(err)}`,
      }),
    )
  }

  const pinned = pinTop ? await clickPinTopButton() : Result.succeed(false)
  if (Result.isFailure(pinned)) return pinned

  // 优先点「发送」按钮（快手中控有明确发送钮；回车不一定触发）
  const submit = await waitForClickableSubmit(page, elementFinder, 2000)
  if (Result.isSuccess(submit)) {
    await clickSubmitCommentButton(submit.value)
    const clearedAfterClick = await waitForCommentInputCleared(page, elementFinder, 2000)
    if (Result.isSuccess(clearedAfterClick)) return Result.succeed(pinned.value)
  }

  await pressEnterToSubmit(page, elementFinder)
  const cleared = await waitForCommentInputCleared(page, elementFinder, 2000)
  if (Result.isSuccess(cleared)) return Result.succeed(pinned.value)

  // 再点一次发送（填入后按钮可能刚启用）
  const submitAgain = await waitForClickableSubmit(page, elementFinder, 1500)
  if (Result.isSuccess(submitAgain)) {
    await clickSubmitCommentButton(submitAgain.value)
    const clearedAgain = await waitForCommentInputCleared(page, elementFinder)
    if (Result.isSuccess(clearedAgain)) return Result.succeed(pinned.value)
  }

  return Result.fail(
    new UnexpectedError({
      description: '评论发送后输入框未清空，公屏可能未真正发出',
    }),
  )
}

/** 在虚拟列表中找到目标序号的位置 */
export async function getItemFromVirtualScroller(
  page: Page,
  elementFinder: IElementFinder,
  targetId: number,
  maxRetries = 10,
): Result.ResultAsync<ElementHandle<SVGElement | HTMLElement>, PlatformError> {
  const SCROLL_TOLERANCE = 10
  const LOAD_WAIT_MS = 1000

  /**
   * 在当前渲染的DOM节点中查找具有特定ID的商品。
   */
  async function findItemInCurrentView(id: number) {
    const currentGoodsItems = await elementFinder.getCurrentGoodsItemsList(page)
    if (Result.isFailure(currentGoodsItems)) {
      return currentGoodsItems
    }
    try {
      // 并发执行，效率比顺序遍历快了10倍以上
      const foundItem = await Promise.any(
        currentGoodsItems.value.map(async goodsItem => {
          const itemIdResult = await elementFinder.getIdFromGoodsItem(goodsItem)
          if (Result.isSuccess(itemIdResult) && itemIdResult.value === id) {
            return goodsItem
          }
          throw new Error('未匹配')
        }),
      )
      return Result.succeed(foundItem)
    } catch (err) {
      // Promise.any 全部出错抛出的错误为 AggregateError
      // 表示全部都未找到
      if (err instanceof AggregateError) {
        return Result.succeed(null)
      }
      return Result.fail(new UnexpectedError({ cause: err }))
    }
  }

  /**
   * 根据目标ID和当前列表的ID范围，决定下一个滚动的锚点元素（列表的第一个或最后一个）。
   */
  async function determineScrollTarget(
    id: number,
  ): Result.ResultAsync<ElementHandle<SVGElement | HTMLElement>, PlatformError> {
    const currentGoodsItems = await elementFinder.getCurrentGoodsItemsList(page)
    if (Result.isFailure(currentGoodsItems)) {
      return currentGoodsItems
    }

    const firstItem = currentGoodsItems.value[0]
    const lastItem = currentGoodsItems.value[currentGoodsItems.value.length - 1]

    return Result.pipe(
      Result.sequence([
        elementFinder.getIdFromGoodsItem(firstItem),
        elementFinder.getIdFromGoodsItem(lastItem),
      ]),
      Result.andThen(([firstId, lastId]) => {
        // 判断列表是正序还是倒序
        const isReversed = firstId > lastId
        // logger.warn(`商品 ${id} 不在当前范围 [${firstId} ~ ${lastId}]，继续滚动查找...`);
        // 目标ID小于当前范围的起始ID (正序) 或 大于 (倒序)，需要向上滚
        if ((!isReversed && id < firstId) || (isReversed && id > firstId)) {
          return Result.succeed(firstItem)
        }
        // 否则，向下滚
        return Result.succeed(lastItem)
      }),
    )
  }

  /**
   * 等待列表加载新内容。
   */
  async function waitForNewItemsToLoad() {
    // 最后的备选方案：短暂 sleep
    await sleep(LOAD_WAIT_MS)
  }

  let lastScrollTop = Number.NaN
  let retries = 0

  while (retries < maxRetries) {
    // 1. 在当前视图中查找
    const foundItem = await findItemInCurrentView(targetId)
    if (Result.isFailure(foundItem)) {
      return foundItem
    }
    if (foundItem.value) {
      return Result.succeed(foundItem.value)
    }

    // 1. 先找到目标点并滚动
    const scrollTarget = await determineScrollTarget(targetId)
    if (Result.isFailure(scrollTarget)) {
      return scrollTarget
    }
    await scrollTarget.value.scrollIntoViewIfNeeded({ timeout: 5000 })
    await waitForNewItemsToLoad()

    // 2. 获取当前的滚动位置
    const scrollContainer = await elementFinder.getGoodsItemsScrollContainer(page)
    if (Result.isFailure(scrollContainer)) {
      return scrollContainer
    }
    const currentScrollTop = await scrollContainer.value.evaluate(el => el.scrollTop)

    // 3. 检查是否滚动到底了 (终止条件)
    if (
      !Number.isNaN(lastScrollTop) &&
      Math.abs(lastScrollTop - currentScrollTop) <= SCROLL_TOLERANCE
    ) {
      // logger.debug(`滚动位置未改变，无法找到更多内容。ScrollTop: ${currentScrollTop}`);
      return Result.fail(
        new ElementNotFoundError({
          elementName: `id为${targetId}的商品`,
        }),
      )
    }
    lastScrollTop = currentScrollTop

    retries++
  }

  return Result.fail(
    new MaxTryCountExceededError({
      taskName: '查找商品',
      maxTryCount: maxRetries,
    }),
  )
}

/**
 * 滚动采集中控台商品列表中的全部序号（兼容虚拟列表）。
 * 扫描结束后尽量恢复原滚动位置。
 */
export async function getAllGoodsIdsFromScroller(
  page: Page,
  elementFinder: IElementFinder,
  maxScrollPasses = 30,
): Result.ResultAsync<number[], PlatformError> {
  const SCROLL_TOLERANCE = 10
  const seen = new Set<number>()

  async function collectVisible() {
    const items = await elementFinder.getCurrentGoodsItemsList(page)
    if (Result.isFailure(items)) return items
    for (const item of items.value) {
      const idResult = await elementFinder.getIdFromGoodsItem(item)
      if (Result.isSuccess(idResult)) seen.add(idResult.value)
    }
    return Result.succeed(seen.size)
  }

  const firstCollect = await collectVisible()
  if (Result.isFailure(firstCollect) && seen.size === 0) {
    return firstCollect
  }

  const scrollContainer = await elementFinder.getGoodsItemsScrollContainer(page)
  if (Result.isFailure(scrollContainer)) {
    return seen.size > 0 ? Result.succeed([...seen].sort((a, b) => a - b)) : scrollContainer
  }

  const originalTop = await scrollContainer.value.evaluate(el => el.scrollTop)
  try {
    await scrollContainer.value.evaluate(el => {
      el.scrollTop = 0
    })
    await sleep(300)
    await collectVisible()

    let lastTop = Number.NaN
    for (let pass = 0; pass < maxScrollPasses; pass++) {
      const metrics = await scrollContainer.value.evaluate(el => ({
        top: el.scrollTop,
        height: el.scrollHeight,
        client: el.clientHeight,
      }))
      const maxTop = Math.max(metrics.height - metrics.client, 0)
      if (metrics.top >= maxTop - SCROLL_TOLERANCE) break

      const step = Math.max(Math.floor(metrics.client * 0.8), 160)
      const nextTop = Math.min(metrics.top + step, maxTop)
      await scrollContainer.value.evaluate((el, top) => {
        el.scrollTop = top
      }, nextTop)
      await sleep(350)
      await collectVisible()

      const currentTop = await scrollContainer.value.evaluate(el => el.scrollTop)
      if (!Number.isNaN(lastTop) && Math.abs(lastTop - currentTop) <= SCROLL_TOLERANCE) {
        break
      }
      lastTop = currentTop
    }
  } finally {
    await scrollContainer.value
      .evaluate((el, top) => {
        el.scrollTop = top
      }, originalTop)
      .catch(() => {})
  }

  if (seen.size === 0) {
    return Result.fail(new ElementNotFoundError({ elementName: '商品列表' }))
  }
  return Result.succeed([...seen].sort((a, b) => a - b))
}

const TOGGLE_BUTTON_MAX_TRY_COUNT = 5
export async function toggleButton(
  button: ElementHandle<SVGElement | HTMLElement>,
  sourceContent: string,
  targetContent: string,
  signal?: AbortSignal,
  tryCount = 0,
): Result.ResultAsync<void, Error> {
  if (tryCount > TOGGLE_BUTTON_MAX_TRY_COUNT) {
    return Result.fail(
      new MaxTryCountExceededError({
        taskName: '切换讲解按钮',
        maxTryCount: TOGGLE_BUTTON_MAX_TRY_COUNT,
      }),
    )
  }
  const buttonText = (await button.textContent())?.trim() || ''
  if (buttonText !== sourceContent && buttonText !== targetContent) {
    return Result.fail(
      new ElementContentMismatchedError({
        current: buttonText,
        target: `${targetContent} 或 ${sourceContent}`,
      }),
    )
  }

  // 两种情况：
  // 1. 商品未讲解：buttonText === sourceContent，点击变为 targetContent 即可
  // 2. 商品正在讲解：需要先点击一次取消讲解，变为未讲解状态
  if (buttonText === targetContent && tryCount > 0) {
    return Result.succeed()
  }
  if (await button.isDisabled()) {
    return Result.fail(
      new ElementDisabledError({
        elementName: '讲解按钮',
        element: await button.evaluate(el => el.outerHTML),
      }),
    )
  }
  // button.click() 在抖店&百应的表现很诡异，所以用 dispatchEvent('click')
  await button.dispatchEvent('click')
  return Result.pipe(
    abortableSleep(1000, signal),
    Result.andThen(() => toggleButton(button, sourceContent, targetContent, signal, tryCount + 1)),
  )
}

/** 确保 page 非空 */
export function ensurePage(page: Page | null | undefined): Result.Result<Page, PlatformError> {
  if (!page) {
    return Result.fail(new PageNotFoundError())
  }
  return Result.succeed(page)
}

/** 通过 \<a\> 的点击打开新网页，主要是防止部分反爬的行为 */
export async function openUrlByElement(page: Page, url: string) {
  const context = page.context()
  const [newPage] = await Promise.all([
    context.waitForEvent('page'),
    page.evaluate(url => {
      const el = document.createElement('a')
      el.href = url
      el.target = '_blank'
      el.click()
    }, url),
  ])
  return newPage
}
