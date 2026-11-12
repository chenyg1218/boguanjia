import type { Page } from 'playwright'

/**
 * 判断目标区域是否被遮罩挡住或节点已消失（仅用于失败后的等待策略，不主动关面板）。
 * 弹窗/发言仍优先直接操作 DOM；视觉挡住不等于一定失败。
 */
async function isAreaBlocked(page: Page, rootSelector: string): Promise<boolean> {
  if (page.isClosed()) return true
  return page
    .evaluate(selector => {
      function visible(el: HTMLElement) {
        const style = window.getComputedStyle(el)
        if (style.display === 'none' || style.visibility === 'hidden' || style.opacity === '0') {
          return false
        }
        const rect = el.getBoundingClientRect()
        return rect.width > 8 && rect.height > 8
      }

      const root = document.querySelector(selector) as HTMLElement | null
      if (!root || !visible(root)) return true

      const rect = root.getBoundingClientRect()
      const samples: Array<[number, number]> = [
        [rect.left + rect.width * 0.5, rect.top + Math.min(48, rect.height * 0.2)],
        [rect.left + rect.width * 0.3, rect.top + rect.height * 0.4],
        [rect.left + rect.width * 0.7, rect.top + rect.height * 0.4],
      ]

      let blockedHits = 0
      for (const [x, y] of samples) {
        if (x < 0 || y < 0 || x > window.innerWidth || y > window.innerHeight) {
          blockedHits += 1
          continue
        }
        const top = document.elementFromPoint(x, y) as HTMLElement | null
        if (!top || !root.contains(top)) blockedHits += 1
      }
      return blockedHits >= 2
    }, rootSelector)
    .catch(() => true)
}

export async function isGoodsListBlocked(page: Page, goodsRootSelector: string): Promise<boolean> {
  return isAreaBlocked(page, goodsRootSelector)
}

/** 评论输入区是否被挡住或节点消失 */
export async function isCommentAreaBlocked(
  page: Page,
  commentRootSelector: string,
): Promise<boolean> {
  return isAreaBlocked(page, commentRootSelector)
}
