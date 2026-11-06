import type playwright from 'playwright'
import { chromium } from 'playwright-extra'
import stealth from 'puppeteer-extra-plugin-stealth'
import { findChromium } from '#/utils/checkChrome'

export interface BrowserSession {
  browser: playwright.Browser
  context: playwright.BrowserContext
  page: playwright.Page
}

export interface BrowserConfig {
  headless?: boolean
  storageState?: string
}

export type StorageState = playwright.BrowserContextOptions['storageState']

chromium.use(stealth())

class BrowserSessionManager {
  private chromePath: string | null = null

  public setChromePath(path: string) {
    this.chromePath = path
  }

  private async getChromePathOrDefault() {
    if (!this.chromePath) {
      this.chromePath = await findChromium()
    }
    return this.chromePath
  }

  private async createBrowser(headless = true) {
    const path = await this.getChromePathOrDefault()
    return chromium.launch({
      headless,
      executablePath: path,
      // 降低自动化特征：小红书千帆等直开中控时业务区易一直转圈
      ignoreDefaultArgs: ['--enable-automation'],
      args: [
        '--disable-blink-features=AutomationControlled',
        // 降低部分站点首屏崩溃/闪退概率（观众端抖音等）
        '--disable-renderer-backgrounding',
        '--disable-ipc-flooding-protection',
        // 有头模式固定足够宽，避免直播站收起顶栏导致看不到红色「登录」
        ...(headless ? [] : ['--window-size=1440,900', '--window-position=60,40']),
      ],
    })
  }

  public async createSession(
    headless = true,
    storageState?: StorageState,
  ): Promise<BrowserSession> {
    const browser = await this.createBrowser(headless)
    let context: playwright.BrowserContext
    try {
      context = await browser.newContext({
        viewport: null, // 显式设置 null，关闭固定视口
        storageState,
        locale: 'zh-CN',
      })
    } catch (error) {
      // 损坏的 storageState 会导致无法建上下文，清掉后由上层重试更干净
      await browser.close().catch(() => undefined)
      throw error
    }
    const page = await context.newPage()
    return { browser, context, page }
  }
}

export const browserManager = new BrowserSessionManager()
