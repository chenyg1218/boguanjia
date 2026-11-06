import { Result } from '@praha/byethrow'
import type { Page } from 'playwright'
import { UnexpectedError } from '#/errors/AppError'
import { ElementNotFoundError, type PlatformError } from '#/errors/PlatformError'
import { AbortError } from '#/errors/AppError'
import type { BrowserSession } from '#/managers/BrowserSessionManager'
import { abortableSleep, sleep } from '#/utils'
import type { IPerformComment, IPlatform } from '../IPlatform'
import type { ViewerPlatformConfig } from './configs'

const COMMENT_FILL_TIMEOUT_MS = 5000
const GOTO_TIMEOUT_MS = 60_000

function isTargetClosedError(error: unknown): boolean {
  const msg = error instanceof Error ? error.message : String(error)
  return /has been closed|Target closed|browser.*closed/i.test(msg)
}

/**
 * 通用观众端：打开平台首页登录，用户手动进直播间后发弹幕。
 * DOM 因平台改版失效时，优先改 configs.ts 选择器。
 */
export class GenericViewerPlatform implements IPlatform, IPerformComment {
  readonly _isPerformComment = true

  public mainPage: Page | null = null
  private accountName = ''
  /** 进房成功后记住的地址，供无头模式重建会话 */
  private roomUrl = ''
  /** 中控内部 room_id；直开 live 卡住时走 reflow */
  private roomId = ''
  private secUid = ''

  constructor(private readonly cfg: ViewerPlatformConfig) {}

  get platformName() {
    return this.cfg.displayName
  }

  /** 读取当前记住的直播间地址（可能为空） */
  getRoomUrl() {
    return this.roomUrl
  }

  setRoomUrl(roomUrl: string, strict = false) {
    const trimmed = roomUrl.trim()
    if (!trimmed) {
      this.roomUrl = ''
      return
    }
    try {
      this.roomUrl = this.cfg.normalizeRoomUrl(trimmed)
    } catch (error) {
      if (strict) throw error
      // 用户手动进房后的 URL 可能不完全符合校验，原样保留
      this.roomUrl = trimmed.startsWith('http') ? trimmed : `https://${trimmed}`
    }
  }

  /** 同步中控解析结果：观众端链接 + 内部 room_id（供 reflow 兜底） */
  setRoomEntry(entry: { roomUrl?: string; roomId?: string; secUid?: string }, strict = false) {
    if (entry.roomUrl) this.setRoomUrl(entry.roomUrl, strict)
    if (entry.roomId?.trim()) this.roomId = entry.roomId.trim()
    if (entry.secUid?.trim()) this.secUid = entry.secUid.trim()
  }

  /**
   * 仅检查是否已登录（不要求进房）。
   * 已登录返回 true；需扫码返回 false。
   */
  async connect(browserSession: BrowserSession): Promise<boolean> {
    let page = this.ensureLivePage(browserSession)
    const target = this.cfg.homeUrl
    if (target && (!page.url() || page.url() === 'about:blank')) {
      await this.safeGoto(page, target)
    } else if (target && this.cfg.loginHintRegex.test(page.url())) {
      await this.safeGoto(page, target)
    } else if (target && !(await this.isLoggedIn(page))) {
      await this.safeGoto(page, target)
    }

    page = this.ensureLivePage(browserSession)
    if (!(await this.isLoggedIn(page))) return false

    this.mainPage = page
    // 若已在直播间则顺带记住
    const input = await this.findCommentInput(page, 1_500)
    if (Result.isSuccess(input)) this.captureRoomUrl(page)
    return true
  }

  /** 扫码登录账号即可，不要求进直播间 */
  async login(
    browserSession: BrowserSession,
    onProgress?: (phase: 'waiting_login' | 'waiting_room', message: string) => void,
  ): Promise<void> {
    let page = this.ensureLivePage(browserSession)
    if (this.cfg.homeUrl) {
      await this.safeGoto(page, this.cfg.homeUrl)
    }

    // 先尽量点出扫码层，避免停在「顶栏被收起、看不到登录」的页面
    await this.ensureLoginPromptVisible(browserSession, onProgress)

    const deadline = Date.now() + 5 * 60 * 1000
    let lastEnsureAt = Date.now()
    while (Date.now() < deadline) {
      try {
        page = this.ensureLivePage(browserSession)
      } catch {
        throw new Error('登录过程中浏览器被关闭，请重新点击登录')
      }

      // 扫码成功后若停在 SSO 页，再回首页（仅 SSO → 首页，已登录的直播页不再强刷）
      try {
        const href = page.url()
        if (this.cfg.homeUrl && this.cfg.loginHintRegex.test(href) && (await this.hasAuthCookie(page))) {
          onProgress?.('waiting_login', '登录完成，正在回到直播首页…')
          await this.safeGoto(page, this.cfg.homeUrl)
          await sleep(1000)
          page = this.ensureLivePage(browserSession)
        }
      } catch {
        // 下一轮重试
      }

      if (await this.isLoggedIn(page)) {
        this.mainPage = page
        return
      }

      // 顶栏「登录」消失且未真正登录时（常见于布局收起），定期重新打开登录入口
      const now = Date.now()
      if (now - lastEnsureAt > 6_000) {
        lastEnsureAt = now
        await this.ensureLoginPromptVisible(browserSession, onProgress)
      } else if (await this.isLoginQrVisible(page)) {
        onProgress?.('waiting_login', '请用抖音 App 扫描页面上的二维码登录')
      } else {
        onProgress?.('waiting_login', '请在浏览器右上角点红色「登录」，用抖音 App 扫码')
      }
      await sleep(1000)
    }
    throw new Error('登录超时：请在弹出的浏览器中完成扫码后重试')
  }

  /**
   * 开始任务前：进入直播间（出现评论框）。
   * 有 room_id 时优先走分享入口 reflow；预热已打开本场则只等待，不重复跳转。
   * 侧栏一出现即放行，发评时再等输入框。
   */
  async ensureInRoom(
    browserSession: BrowserSession,
    onProgress?: (message: string) => void,
    signal?: AbortSignal,
  ): Promise<void> {
    const throwIfAborted = () => {
      if (signal?.aborted) throw new AbortError()
    }
    throwIfAborted()

    let page = this.ensureLivePage(browserSession)

    // 快速路径：评论框或侧栏已在 → 立刻开始任务（发评路径会再等输入框）
    if (await this.isRoomInteractive(page)) {
      this.mainPage = page
      this.captureRoomUrl(page)
      return
    }

    throwIfAborted()
    /** 预热已打开本场（含仍在加载）：开始任务时只等，避免再次 reflow 打断页面 */
    const alreadyOpenAtStart = Boolean(
      (this.roomUrl && this.isAlreadyOnRoom(page)) || this.isOnLiveRoomPage(page),
    )
    /** 首跳是否走了 reflow（决定换路时先试主站） */
    let openedViaReflow = false

    if (alreadyOpenAtStart) {
      onProgress?.('正在进入直播间…')
    } else if (this.roomId) {
      onProgress?.('正在进入直播间…')
      await this.enterViaReflow(page)
      openedViaReflow = true
      throwIfAborted()
    } else if (this.roomUrl) {
      onProgress?.('正在进入直播间…')
      await this.safeGoto(page, this.roomUrl, true)
      throwIfAborted()
    } else {
      onProgress?.('请在弹出窗口进入本场直播间，看到评论区即可')
    }

    // 进房后耐心等评论区，不要频繁刷新（刷新会把已在加载的页面打断，反而更慢）
    const enteredAt = Date.now()
    const deadline = enteredAt + 5 * 60 * 1000
    let showedWaitingHint = false
    /** 最多换路 2 次：主站 ↔ reflow */
    let reloadCount = 0
    const maxReloads = 2
    const reloadAfterMs = alreadyOpenAtStart ? 10_000 : openedViaReflow ? 15_000 : 25_000
    let loadingSince: number | null = null
    while (Date.now() < deadline) {
      throwIfAborted()
      try {
        page = this.ensureLivePage(browserSession)
      } catch {
        throw new Error('进房过程中浏览器被关闭，请重新登录互动号')
      }

      if (await this.hasActionRequired(page)) {
        onProgress?.(
          '页面需要验证，请在互动号浏览器中完成后再等待自动继续',
        )
      }

      // 评论区有时要先点一下才会挂载 contenteditable
      await this.nudgeChatInput(page)

      if (await this.isRoomInteractive(page)) {
        this.mainPage = page
        this.captureRoomUrl(page)
        onProgress?.('已进入直播间')
        return
      }

      const chatReady = await this.isChatSidebarReady(page)
      const loading = !chatReady && (await this.isLiveLoading(page))
      if (loading) {
        if (!loadingSince) loadingSince = Date.now()
      } else {
        loadingSince = null
      }

      // 卡住无侧栏时换路：卡「加载中」约 8s，或总等待超过阈值；最多 2 次
      const stuckLoading =
        Boolean(loadingSince) && Date.now() - (loadingSince ?? 0) >= 8_000
      const dueForReload =
        Date.now() - enteredAt > reloadAfterMs + reloadCount * 20_000 || stuckLoading
      if (
        reloadCount < maxReloads &&
        !chatReady &&
        (this.roomUrl || this.roomId) &&
        dueForReload
      ) {
        reloadCount++
        if (reloadCount === 1) {
          onProgress?.('进房较慢，正在换一种方式…')
        }
        // 预热/首路已是 reflow 时，奇数次换主站；否则奇数次走 reflow
        const tryMainFirst = openedViaReflow || alreadyOpenAtStart
        if (tryMainFirst) {
          if (reloadCount % 2 === 1 && this.roomUrl) {
            await this.safeGoto(page, this.roomUrl, true)
          } else if (this.roomId) {
            await this.enterViaReflow(page)
          } else if (this.roomUrl) {
            await this.safeGoto(page, this.roomUrl, true)
          }
        } else if (reloadCount % 2 === 1 && this.roomId) {
          await this.enterViaReflow(page)
        } else if (this.roomUrl) {
          await this.safeGoto(page, this.roomUrl, true)
        } else if (this.roomId) {
          await this.enterViaReflow(page)
        }
        loadingSince = null
        throwIfAborted()
      }

      // 仅提示一次等待，不展示秒数（日志面向普通用户）
      if (!showedWaitingHint && !this.roomUrl && !this.roomId) {
        showedWaitingHint = true
        onProgress?.('请在弹出窗口进入本场直播间，看到评论区即可')
      }
      const waited = await abortableSleep(300, signal)
      if (Result.isFailure(waited)) throw waited.error
    }
    throw new Error('进房超时：请确认直播间已开播且评论框可见后重试')
  }

  /**
   * 开播预热：优先 reflow 打开，并尽量等到侧栏/评论区就绪，
   * 这样点「开始任务」时可几乎立刻发评。
   */
  async warmupOpenRoom(
    browserSession: BrowserSession,
    onProgress?: (message: string) => void,
  ): Promise<void> {
    let page = this.ensureLivePage(browserSession)
    if (await this.isRoomInteractive(page)) {
      this.mainPage = page
      this.captureRoomUrl(page)
      onProgress?.('直播间已预热，可开始任务')
      return
    }

    const alreadyOpen = Boolean(
      (this.roomUrl && this.isAlreadyOnRoom(page)) || this.isOnLiveRoomPage(page),
    )
    if (!alreadyOpen) {
      if (this.roomId) {
        onProgress?.('正在预热直播间…')
        await this.enterViaReflow(page)
      } else if (this.roomUrl) {
        onProgress?.('正在预热直播间…')
        await this.safeGoto(page, this.roomUrl, true)
      } else {
        return
      }
      this.captureRoomUrl(page)
    } else if (!(await this.isLiveLoading(page)) && (await this.isChatSidebarReady(page))) {
      this.mainPage = page
      onProgress?.('直播间已预热，可开始任务')
      return
    } else {
      onProgress?.('正在预热直播间…')
    }

    // 预热阶段把「等页面就绪」做完；最多约 45s，卡住则换一次主站
    const deadline = Date.now() + 45_000
    let swapped = false
    let loadingSince: number | null = null
    while (Date.now() < deadline) {
      try {
        page = this.ensureLivePage(browserSession)
      } catch {
        return
      }
      await this.nudgeChatInput(page)
      if (await this.isRoomInteractive(page)) {
        this.mainPage = page
        this.captureRoomUrl(page)
        onProgress?.('直播间已预热，可开始任务')
        return
      }
      const chatReady = await this.isChatSidebarReady(page)
      const loading = !chatReady && (await this.isLiveLoading(page))
      if (loading) {
        if (!loadingSince) loadingSince = Date.now()
      } else {
        loadingSince = null
      }
      if (
        !swapped &&
        !chatReady &&
        this.roomUrl &&
        loadingSince &&
        Date.now() - loadingSince >= 8_000
      ) {
        swapped = true
        await this.safeGoto(page, this.roomUrl, true)
        loadingSince = null
      }
      await sleep(400)
    }
    this.captureRoomUrl(page)
    onProgress?.('直播间已预热，可开始任务')
  }

  /** 评论框或聊天侧栏已可用（可开始任务 / 视为预热完成） */
  private async isRoomInteractive(page: Page): Promise<boolean> {
    if (page.isClosed()) return false
    const input = await this.findCommentInput(page, 250)
    if (Result.isSuccess(input)) return true
    return this.isChatSidebarReady(page)
  }

  /** 当前是否已在观众端直播页（不要求 URL 与缓存完全一致） */
  private isOnLiveRoomPage(page: Page): boolean {
    if (page.isClosed()) return false
    try {
      const href = page.url()
      return /live\.douyin\.com\/[\w.-]+/i.test(href) && !this.cfg.loginHintRegex.test(href)
    } catch {
      return false
    }
  }

  /** 尝试点开评论输入区域，促使 contenteditable 挂载 */
  private async nudgeChatInput(page: Page): Promise<void> {
    if (page.isClosed()) return
    try {
      const clicked = await page.evaluate(() => {
        const sels = [
          '#chatInput',
          '[data-e2e="live-chatting"]',
          '[class*="chat"] [placeholder*="说点什么"]',
        ]
        for (const sel of sels) {
          const el = document.querySelector(sel)
          if (el instanceof HTMLElement && el.offsetParent !== null) {
            el.click()
            return true
          }
        }
        return false
      })
      if (clicked) return
    } catch {
      // ignore
    }
  }

  private async isLiveLoading(page: Page): Promise<boolean> {
    if (page.isClosed()) return false
    try {
      return await page.evaluate(() => {
        const t = document.body?.innerText ?? ''
        return t.includes('直播加载中')
      })
    } catch {
      return false
    }
  }

  /** 聊天侧栏已出来（比等 contenteditable 更早） */
  private async isChatSidebarReady(page: Page): Promise<boolean> {
    if (page.isClosed()) return false
    try {
      return await page.evaluate(() => {
        if (document.querySelector('#chatInput, [data-e2e="live-chatting"]')) return true
        const t = document.body?.innerText ?? ''
        return t.includes('在线观众') || t.includes('全部商品')
      })
    } catch {
      return false
    }
  }

  private async hasActionRequired(page: Page): Promise<boolean> {
    if (page.isClosed()) return false
    try {
      return await page
        .getByText(/请采取行动|验证|安全验证|滑动验证/i)
        .first()
        .isVisible({ timeout: 400 })
    } catch {
      return false
    }
  }

  private async enterViaReflow(page: Page): Promise<void> {
    if (!this.roomId) return
    const entry = this.secUid
      ? `https://webcast.amemv.com/douyin/webcast/reflow/${this.roomId}?sec_user_id=${encodeURIComponent(this.secUid)}`
      : `https://webcast.amemv.com/douyin/webcast/reflow/${this.roomId}`
    await this.safeGoto(page, entry, true)
    // 等待跳到 live.douyin.com，或从页面里抠出真实直播链接再跳转
    const deadline = Date.now() + 20_000
    while (Date.now() < deadline) {
      try {
        const href = page.url()
        if (/live\.douyin\.com\//i.test(href)) {
          this.captureRoomUrl(page)
          return
        }
        const embedded = await page
          .evaluate(() => {
            const html = document.documentElement?.innerHTML ?? ''
            const m = html.match(
              /https?:\/\/live\.douyin\.com\/[\w.-]+(?:\?[^"'\\\s<>]*)?/i,
            )
            return m?.[0]?.replace(/\\u0026/g, '&').replace(/\\+/g, '') ?? null
          })
          .catch(() => null)
        if (embedded && /live\.douyin\.com\//i.test(embedded)) {
          const clean = embedded.split('#')[0]
          this.roomUrl = clean
          await this.safeGoto(page, clean, true)
          this.captureRoomUrl(page)
          return
        }
      } catch {
        return
      }
      await sleep(400)
    }
    // 未跳转则再试已解析的观众端链接
    if (this.roomUrl) {
      await this.safeGoto(page, this.roomUrl, true)
      this.captureRoomUrl(page)
    }
  }

  /** 仍停在登录/SSO 页，或页面上已出现扫码相关 UI */
  private async isLoginQrVisible(page: Page): Promise<boolean> {
    if (page.isClosed()) return false
    try {
      if (this.cfg.loginHintRegex.test(page.url())) return true
    } catch {
      return false
    }
    const qrSel = this.cfg.selectors.loginQr
    if (!qrSel) return false
    return page.locator(qrSel).first().isVisible({ timeout: 600 }).catch(() => false)
  }

  private async hasAuthCookie(page: Page): Promise<boolean> {
    const re = this.cfg.authCookieRegex
    if (!re) return false
    try {
      const cookies = await page.context().cookies()
      return cookies.some(c => re.test(c.name) && Boolean(c.value))
    } catch {
      return false
    }
  }

  /**
   * 确保用户能看到扫码入口：优先点红色「登录」；若顶栏已收起（图2）则回首页再点。
   * 已登录时不再导航，避免二次刷新丢掉登录态。
   */
  private async ensureLoginPromptVisible(
    browserSession: BrowserSession,
    onProgress?: (phase: 'waiting_login' | 'waiting_room', message: string) => void,
  ): Promise<void> {
    let page = this.ensureLivePage(browserSession)
    if (await this.isLoggedIn(page)) return

    if (await this.isLoginQrVisible(page)) {
      onProgress?.('waiting_login', '请用抖音 App 扫描页面上的二维码登录')
      return
    }

    const clickLogin = async () => {
      const loginBtn = page.locator(this.cfg.selectors.loginEntry).first()
      if (!(await loginBtn.isVisible({ timeout: 2500 }).catch(() => false))) return false
      onProgress?.('waiting_login', '正在打开登录，请稍后用抖音 App 扫码…')
      await loginBtn.click({ timeout: 3000 }).catch(() => undefined)
      await sleep(800)
      return true
    }

    if (await clickLogin()) {
      page = this.ensureLivePage(browserSession)
      if (await this.isLoginQrVisible(page)) {
        onProgress?.('waiting_login', '请用抖音 App 扫描弹出的二维码登录')
      } else {
        onProgress?.('waiting_login', '请在浏览器右上角点红色「登录」，用抖音 App 扫码')
      }
      return
    }

    // 顶栏收起 / 登录按钮不可见：回首页恢复图1布局（此时必无登录 cookie，可安全 goto）
    if (!this.cfg.homeUrl) {
      onProgress?.('waiting_login', '未找到「登录」按钮，请手动打开登录并扫码')
      return
    }
    onProgress?.('waiting_login', '未找到登录按钮，正在重新打开直播首页…')
    await this.safeGoto(page, this.cfg.homeUrl)
    await sleep(1500)
    page = this.ensureLivePage(browserSession)
    if (await this.isLoggedIn(page)) return
    if (await clickLogin()) {
      onProgress?.('waiting_login', '请用抖音 App 扫描弹出的二维码登录')
      return
    }
    onProgress?.(
      'waiting_login',
      '请把浏览器窗口最大化，在右上角找到红色「登录」后用抖音扫码',
    )
  }

  private async isLoggedIn(page: Page): Promise<boolean> {
    if (page.isClosed()) return false
    try {
      if (this.cfg.loginHintRegex.test(page.url())) return false
    } catch {
      return false
    }

    const loginBtn = page.locator(this.cfg.selectors.loginEntry).first()
    if (await loginBtn.isVisible({ timeout: 800 }).catch(() => false)) {
      return false
    }

    // 有会话 cookie → 已登录（即便顶栏「登录」因布局未渲染）
    if (await this.hasAuthCookie(page)) return true

    // 顶栏用户信息（勿把直播卡片头像当成已登录）
    const loggedInEl = page.locator(this.cfg.selectors.loggedIn).first()
    if (await loggedInEl.isVisible({ timeout: 1000 }).catch(() => false)) {
      return true
    }

    // 仅「看不到登录按钮」不能当已登录：顶栏收起时也会出现图2那种无登录入口状态
    return false
  }

  /** 登录跳转可能关掉原标签，优先沿用仍打开的页面 */
  private ensureLivePage(browserSession: BrowserSession): Page {
    if (!browserSession.browser.isConnected()) {
      throw new Error('浏览器未就绪或已关闭，请重试连接互动号')
    }
    if (!browserSession.page.isClosed()) {
      return browserSession.page
    }
    const opened = browserSession.context.pages().filter(p => !p.isClosed())
    if (opened.length === 0) {
      throw new Error('打开页面时浏览器被关闭，请重试连接互动号')
    }
    browserSession.page = opened[opened.length - 1]
    return browserSession.page
  }

  async getAccountName(session: BrowserSession): Promise<string> {
    try {
      let name = await session.page.evaluate(
        ({ accountNameSel, loggedInSel }) => {
          const junk = /^(登录|扫码|头像|avatar|user|我的|个人中心)$/i
          const looksLikeNick = (raw: string | null | undefined): string => {
            const t = (raw || '').replace(/\s+/g, ' ').trim()
            if (!t || t.length > 32 || junk.test(t)) return ''
            return t
          }
          const fromEl = (el: Element | null): string => {
            if (!el) return ''
            const text = looksLikeNick(el.textContent)
            if (text) return text
            if (el instanceof HTMLElement) {
              for (const attr of ['alt', 'title', 'aria-label', 'data-name']) {
                const v = looksLikeNick(el.getAttribute(attr))
                if (v) return v
              }
            }
            // 头像 img 常无文字，尝试父级旁的昵称节点
            const parent = el.parentElement
            if (parent) {
              const sibling = parent.querySelector(
                '[class*="nickname"], [class*="userName"], [class*="user-name"], [class*="name"]',
              )
              const fromSibling = looksLikeNick(sibling?.textContent)
              if (fromSibling) return fromSibling
              const fromParent = looksLikeNick(
                parent.getAttribute?.('aria-label') || parent.getAttribute?.('title'),
              )
              if (fromParent) return fromParent
            }
            return ''
          }

          const trySel = (sel?: string) => {
            if (!sel) return ''
            for (const el of document.querySelectorAll(sel)) {
              const n = fromEl(el)
              if (n) return n
            }
            return ''
          }

          return trySel(accountNameSel) || trySel(loggedInSel) || ''
        },
        {
          accountNameSel: this.cfg.selectors.accountName,
          loggedInSel: this.cfg.selectors.loggedIn,
        },
      )
      if (!name) {
        name = await this.tryFetchAccountName(session)
      }
      this.accountName = name || '观众号'
    } catch {
      this.accountName = '观众号'
    }
    return this.accountName
  }

  /** 页面只有头像无文案时，用登录态接口兜底（目前抖音系） */
  private async tryFetchAccountName(session: BrowserSession): Promise<string> {
    const pageUrl = session.page.url()
    if (!/douyin\.com/i.test(pageUrl)) return ''
    try {
      const nick = await session.page.evaluate(async () => {
        try {
          const res = await fetch('https://live.douyin.com/webcast/user/me/?aid=6383', {
            credentials: 'include',
          })
          if (!res.ok) return ''
          const json = (await res.json()) as {
            data?: { user?: { nickname?: string }; nickname?: string }
            user?: { nickname?: string }
          }
          return (
            json?.data?.user?.nickname ||
            json?.data?.nickname ||
            json?.user?.nickname ||
            ''
          )
        } catch {
          return ''
        }
      })
      return typeof nick === 'string' ? nick.trim() : ''
    } catch {
      return ''
    }
  }

  async disconnect(): Promise<void> {
    this.mainPage = null
  }

  getCommentPage(): Page | null {
    return this.mainPage
  }

  performComment(message: string, _pinTop?: boolean): Result.ResultAsync<boolean, PlatformError> {
    return this.sendDanmaku(message)
  }

  private async safeGoto(page: Page, url: string, soft = false) {
    if (page.isClosed()) {
      if (soft) return
      throw new Error('打开页面时浏览器被关闭，请重试连接互动号')
    }
    try {
      await page.goto(url, { waitUntil: 'domcontentloaded', timeout: GOTO_TIMEOUT_MS })
    } catch (error) {
      if (soft) return
      if (isTargetClosedError(error)) {
        throw new Error(
          '打开页面时浏览器被关闭（可能被系统拦截或页面自行关闭），请重试连接互动号',
        )
      }
      throw error
    }
  }

  private captureRoomUrl(page: Page) {
    try {
      const href = page.url()
      if (href && !this.cfg.loginHintRegex.test(href)) {
        this.roomUrl = href.split('#')[0]
      }
    } catch {
      // ignore
    }
  }

  /** 预热或上次进房后已在目标直播间，避免重复 goto */
  private isAlreadyOnRoom(page: Page): boolean {
    if (!this.roomUrl || page.isClosed()) return false
    try {
      const current = page.url().split('#')[0].split('?')[0]
      const target = this.roomUrl.split('#')[0].split('?')[0]
      if (current === target) return true
      // live.douyin.com/{web_rid} 与带 page_type 的主站链视为同一房
      if (current.includes('live.douyin.com') && target.includes('live.douyin.com')) {
        const curPath = new URL(current).pathname.replace(/\/$/, '')
        const tgtPath = new URL(target).pathname.replace(/\/$/, '')
        if (curPath && curPath === tgtPath) return true
      }
      return false
    } catch {
      return false
    }
  }

  private async findCommentInput(page: Page, timeoutMs = 15_000) {
    const loc = page.locator(this.cfg.selectors.commentInput).first()
    try {
      await loc.waitFor({ state: 'attached', timeout: timeoutMs })
      return Result.succeed(loc)
    } catch {
      return Result.fail(
        new ElementNotFoundError({
          elementName: '观众评论框',
          selector: this.cfg.selectors.commentInput,
        }),
      )
    }
  }

  private async sendDanmaku(message: string): Result.ResultAsync<boolean, PlatformError> {
    const page = this.mainPage
    if (!page || page.isClosed()) {
      return Result.fail(new UnexpectedError({ description: '直播间页面已关闭，请重新连接互动号' }))
    }

    const text = message.trim()
    if (!text) {
      return Result.fail(new UnexpectedError({ description: '评论内容为空' }))
    }

    const inputResult = await this.findCommentInput(page)
    if (Result.isFailure(inputResult)) return inputResult
    const input = inputResult.value

    try {
      await input.click({ timeout: COMMENT_FILL_TIMEOUT_MS })
      // 清空已有内容（含占位建议文案残留）
      await input.press('Control+A').catch(() => undefined)
      await input.press('Backspace').catch(() => undefined)
      await input.fill('').catch(() => undefined)

      // 必须用真实键入，contenteditable + 直接改 DOM 往往点不亮灰色发送按钮
      await input.pressSequentially(text, { delay: 12, timeout: COMMENT_FILL_TIMEOUT_MS })
    } catch {
      try {
        await input.click({ timeout: COMMENT_FILL_TIMEOUT_MS })
        await page.keyboard.type(text, { delay: 12 })
      } catch (err) {
        return Result.fail(
          new UnexpectedError({
            description: `填写评论失败: ${err instanceof Error ? err.message : String(err)}`,
          }),
        )
      }
    }

    // 等发送钮从灰变可点（图标按钮未必有 disabled 属性）
    const submit = await this.findEnabledSubmit(page, 2500)
    if (submit) {
      await submit.click({ timeout: 3000 }).catch(async () => {
        await input.press('Enter')
      })
    } else {
      // 仍灰：回车兜底；若还失败多半是本场限制发言
      await input.press('Enter')
      const stillDisabled = await this.isSubmitVisuallyDisabled(page)
      if (stillDisabled) {
        return Result.fail(
          new UnexpectedError({
            description:
              '发送按钮仍为灰色。请先在输入框打出文字试一下；若手动输入后仍灰，请检查本场是否限制发言（关注/粉丝团等），或换未关联主播的纯观众号',
          }),
        )
      }
    }

    await sleep(400)
    return Result.succeed(false)
  }

  private async findEnabledSubmit(page: Page, timeoutMs: number) {
    const deadline = Date.now() + timeoutMs
    while (Date.now() < deadline) {
      const loc = page.locator(this.cfg.selectors.commentSubmit)
      const count = await loc.count().catch(() => 0)
      for (let i = 0; i < Math.min(count, 8); i++) {
        const btn = loc.nth(i)
        const visible = await btn.isVisible().catch(() => false)
        if (!visible) continue
        const disabledAttr = await btn.isDisabled().catch(() => false)
        if (disabledAttr) continue
        const cls = ((await btn.getAttribute('class').catch(() => '')) || '').toLowerCase()
        if (/disabled|is-disabled|unavailable|gray/.test(cls)) continue
        const aria = await btn.getAttribute('aria-disabled').catch(() => null)
        if (aria === 'true') continue
        // 颜色偏灰时仍可能可点；优先返回可见且未标记 disabled 的按钮
        return btn
      }
      await sleep(200)
    }
    return null
  }

  private async isSubmitVisuallyDisabled(page: Page): Promise<boolean> {
    try {
      const btn = page.locator(this.cfg.selectors.commentSubmit).first()
      if (!(await btn.isVisible({ timeout: 500 }).catch(() => false))) return false
      if (await btn.isDisabled().catch(() => false)) return true
      const aria = await btn.getAttribute('aria-disabled').catch(() => null)
      if (aria === 'true') return true
      const cls = ((await btn.getAttribute('class').catch(() => '')) || '').toLowerCase()
      return /disabled|is-disabled|unavailable/.test(cls)
    } catch {
      return false
    }
  }
}
