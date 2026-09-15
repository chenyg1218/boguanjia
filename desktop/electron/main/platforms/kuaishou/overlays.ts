import type { Page } from 'playwright'
import { sleep } from '#/utils'

type DismissKind = 'popup-confirm' | 'live-on' | 'group-buying' | 'other'

/**
 * 关闭快手中控挡操作的 ant-modal。
 * - 讲解确认：确定结束/确认开始 + 「覆盖当前讲解」→ 点「确定」
 * - 开播提示：已开启直播 → 点「我知道了」
 * - 团购引导：暂不切换（第一个按钮）
 */
export async function dismissKuaishouModals(
  page: Page,
  options?: { preferPopupConfirm?: boolean },
): Promise<DismissKind | null> {
  const preferPopup = options?.preferPopupConfirm ?? false

  return page.evaluate(preferPopup => {
    function isVisible(el: HTMLElement) {
      const style = window.getComputedStyle(el)
      return style.display !== 'none' && style.visibility !== 'hidden'
    }

    const roots = Array.from(document.querySelectorAll('.ant-modal-root'))
    for (const root of roots) {
      const wrap = root.querySelector('.ant-modal-wrap') as HTMLElement | null
      if (!wrap || !isVisible(wrap)) continue

      const text = (wrap.textContent ?? '').replace(/\s+/g, '')
      const buttons = Array.from(wrap.querySelectorAll('button')) as HTMLButtonElement[]

      // 开播提示（出现后会挡评论框，且可能触发刷新）
      if (text.includes('已开启直播') || text.includes('直播开启提示') || text.includes('我知道了')) {
        const ok =
          buttons.find(b => (b.textContent ?? '').trim() === '我知道了') ?? buttons[buttons.length - 1]
        if (ok) {
          ok.click()
          return 'live-on' as const
        }
      }

      // 讲解切换确认（开始新讲解 / 结束当前讲解）
      const isPopupConfirm =
        text.includes('确认开始') ||
        text.includes('确定结束') ||
        text.includes('覆盖当前讲解') ||
        text.includes('新的讲解')
      if (isPopupConfirm || (preferPopup && buttons.some(b => (b.textContent ?? '').trim() === '确定'))) {
        const checkbox = wrap.querySelector(
          'input.ant-checkbox-input, .ant-checkbox input[type=checkbox]',
        ) as HTMLInputElement | null
        if (checkbox && !checkbox.checked) {
          checkbox.click()
        }
        const ok =
          buttons.find(b => (b.textContent ?? '').trim() === '确定') ?? buttons[buttons.length - 1]
        if (ok) {
          ok.click()
          return 'popup-confirm' as const
        }
      }

      // 团购模式引导
      if (text.includes('团购') && buttons.length > 0) {
        buttons[0].click()
        return 'group-buying' as const
      }
    }
    return null
  }, preferPopup)
}

/**
 * 短时间内反复尝试关闭弹窗（讲解确认 / 开播提示）。
 * 一开始就没有弹窗时立刻返回，避免每次发评论空等数秒。
 */
export async function dismissKuaishouModalsUntilGone(
  page: Page,
  timeoutMs = 3000,
  options?: { preferPopupConfirm?: boolean },
) {
  const first = await dismissKuaishouModals(page, options).catch(() => null)
  if (!first) return null

  let last: DismissKind | null = first
  const deadline = Date.now() + timeoutMs
  await sleep(280)
  while (Date.now() < deadline) {
    const kind = await dismissKuaishouModals(page, options).catch(() => null)
    if (kind) {
      last = kind
      await sleep(280)
      continue
    }
    return last
  }
  return last
}
