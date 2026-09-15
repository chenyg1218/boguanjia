import type { Page } from 'playwright'
import { sleep } from '#/utils'
import { dismissKuaishouModals } from './overlays'

interface RecvData {
  commentList?: Comment[]
  replyRate?: {}
}

interface Comment {
  commentContent: string
  commentId: string
  fromUserId: string
  fromUserName: string
  commentTime: string // timestamp
  /** 来源类型；勿用 === 0 判主播，实测观众评论也可能是 0 */
  commentSource?: number
  /** 明确为「主播」时才是主播评论 */
  commentSourceTips?: string
}

export class KuaishouCommentListener {
  private handleComment: (comment: LiveMessage) => void = () => {}
  private isListening = false
  private isFunctionInjected = false
  private keepAliveRunning = false

  constructor(private page: Page) {}

  static async hook(page: Page) {
    await page.route('**/lib-es-link*.js', async route => {
      // 强行禁掉 JS 缓存，防止浏览器读取 304 缓存导致注入失败
      const response = await route.fetch({ headers: { 'Cache-Control': 'no-cache' } })
      let jsContent = await response.text()

      if (jsContent.includes('decodePayload')) {
        jsContent = jsContent.replace(
          /([a-zA-Z0-9_$]+)\s*=\s*this\.decodePayload\(([^)]*?["']receive["']\s*)\)/g,
          '$1 = (function(res) { try { window.__onLiveMessage && window.__onLiveMessage(res) } catch(e) {} return res; })(this.decodePayload($2))',
        )
      }
      await route.fulfill({ response, body: jsContent })
    })
  }

  handleMessage(data: RecvData) {
    if (data?.commentList) {
      for (const comment of data.commentList) {
        this.handleComment({
          content: comment.commentContent,
          msg_type: 'comment',
          msg_id: comment.commentId,
          nick_name: comment.fromUserName,
          time: Number(comment.commentTime),
          // 只信文案提示；commentSource===0 会把观众也标成主播，导致关键词永不回复
          is_host: comment.commentSourceTips === '主播',
        })
      }
    }
  }

  startCommentListener(onComment: (comment: LiveMessage) => void) {
    this.handleComment = onComment
    this.isListening = true
    if (!this.isFunctionInjected) {
      this.page.exposeFunction('__onLiveMessage', (data: RecvData) => {
        if (this.isListening) this.handleMessage(data)
      })
      this.isFunctionInjected = true
    }
    void this.keepPageRunning()
  }

  stopCommentListener(): void {
    this.isListening = false
  }

  /** 监听期间周期性关掉开播提示 / 残留讲解确认，避免挡评论 */
  private async keepPageRunning() {
    if (this.keepAliveRunning) return
    this.keepAliveRunning = true
    try {
      while (this.isListening) {
        await dismissKuaishouModals(this.page).catch(() => null)
        await sleep(2000)
      }
    } finally {
      this.keepAliveRunning = false
    }
  }

  getPage() {
    return this.page
  }
}
