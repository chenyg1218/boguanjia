import type { Page } from 'playwright'
import { sleep } from '#/utils'

/** 关掉商品页「我知道了」引导。没有弹窗时很快返回。 */
export async function dismissWechatChannelModals(page: Page) {
  if (page.isClosed()) return false
  for (const frame of page.frames()) {
    const clicked = await frame
      .evaluate(() => {
        const dialogs = Array.from(document.querySelectorAll('.weui-desktop-dialog'))
        for (const dialog of dialogs) {
          const style = window.getComputedStyle(dialog)
          if (style.display === 'none' || style.visibility === 'hidden') continue
          const rect = dialog.getBoundingClientRect()
          if (rect.width < 8 || rect.height < 8) continue
          const nodes = Array.from(dialog.querySelectorAll('button, a, span'))
          const know = nodes.find(node => (node.textContent ?? '').trim() === '我知道了')
          if (know instanceof HTMLElement) {
            know.click()
            return true
          }
        }
        return false
      })
      .catch(() => false)
    if (clicked) return true
  }
  return false
}

/** 连接商品页时稍等弹窗出现再关掉；一直没有就尽快返回。 */
export async function dismissWechatChannelModalsUntilGone(page: Page, timeoutMs = 4000) {
  await sleep(800)
  const deadline = Date.now() + timeoutMs
  let dismissed = false
  let misses = 0
  while (Date.now() < deadline) {
    if (page.isClosed()) return dismissed
    const hit = await dismissWechatChannelModals(page).catch(() => false)
    if (hit) {
      dismissed = true
      misses = 0
      await sleep(350)
      continue
    }
    if (dismissed) return true
    misses += 1
    if (misses >= 2) return false
    await sleep(300)
  }
  return dismissed
}
