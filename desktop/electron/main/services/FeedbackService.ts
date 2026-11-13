/**
 * 用户问题反馈：上报到核销服务 /feedback（与卡密同一 HMAC 签名）。
 * 支持纯文字 + 最多 3 张已压缩的 JPEG（base64）；可拉取本机历史记录。
 */
import { createHash, createHmac } from 'node:crypto'
import { app, net } from 'electron'
import { createLogger } from '#/logger'
import { licenseService } from '#/services/LicenseService'

const logger = createLogger('反馈')

const API_REQUEST_KEY_HEX =
  '4ddd278c4798a5b936397ae7bd0057fdc8431aada88dbf5a68622fa3a4b4e608'
const BUILTIN_REDEEM_URL = 'https://license.sugaiming.com/bgj/redeem'
const USER_AGENT = 'Boguanjia/2.3 (+https://boguanjia.local)'

export type FeedbackCategory = 'bug' | 'feature' | 'other'
export type FeedbackStatus = 'open' | 'read' | 'done' | 'ignored'

export type FeedbackSubmitInput = {
  category: FeedbackCategory
  title: string
  body: string
  contact?: string
  /** JPEG base64（可带 data: 前缀），最多 3 张 */
  images?: string[]
}

export type FeedbackSubmitResult = {
  ok: boolean
  message: string
  id?: number
}

export type FeedbackListItem = {
  id: number
  category: FeedbackCategory | string
  title: string
  body: string
  contact: string
  app_version: string
  plan: string
  bound_platform: string
  status: FeedbackStatus | string
  image_count: number
  created_at: string
  updated_at: string
}

export type FeedbackListResult = {
  ok: boolean
  message?: string
  items: FeedbackListItem[]
}

class FeedbackService {
  async submit(input: FeedbackSubmitInput): Promise<FeedbackSubmitResult> {
    const category = input.category
    if (category !== 'bug' && category !== 'feature' && category !== 'other') {
      return { ok: false, message: '请选择反馈类型' }
    }
    const title = String(input.title || '')
      .replace(/\s+/g, ' ')
      .trim()
    const body = String(input.body || '').trim()
    if (!title) return { ok: false, message: '请填写标题' }
    if (title.length > 80) return { ok: false, message: '标题过长' }
    if (!body) return { ok: false, message: '请填写描述' }
    if (body.length > 2000) return { ok: false, message: '描述过长' }

    const contact = String(input.contact || '')
      .replace(/\s+/g, ' ')
      .trim()
      .slice(0, 64)

    const images = (input.images || [])
      .map(s => String(s || '').trim())
      .filter(Boolean)
      .slice(0, 3)
    if (images.length > 3) {
      return { ok: false, message: '最多上传 3 张截图' }
    }

    const url = this.feedbackUrl()
    if (!url) return { ok: false, message: '反馈服务未配置' }

    const status = licenseService.status()
    const payload: Record<string, unknown> = {
      machine_id: licenseService.machineFingerprint(),
      category,
      title,
      body,
      contact,
      app_version: app.getVersion(),
      plan: status.plan,
      bound_platform: status.boundPlatform || '',
      created_at: new Date().toISOString().replace(/\.\d{3}Z$/, 'Z'),
      images: images.map(data => ({ mime: 'image/jpeg', data })),
    }

    try {
      const result = await this.postSigned(url, payload)
      if (!result.ok) {
        return { ok: false, message: result.error || '提交失败，请稍后重试' }
      }
      return {
        ok: true,
        message: '已提交，我们会尽快查看',
        id: typeof result.id === 'number' ? result.id : undefined,
      }
    } catch (err) {
      logger.warn('提交反馈失败', err)
      return { ok: false, message: '网络异常，请稍后重试或通过微信联系' }
    }
  }

  async list(): Promise<FeedbackListResult> {
    const url = this.feedbackListUrl()
    if (!url) return { ok: false, message: '反馈服务未配置', items: [] }
    const payload: Record<string, unknown> = {
      machine_id: licenseService.machineFingerprint(),
      limit: 50,
    }
    try {
      const result = await this.postSigned(url, payload)
      if (!result.ok) {
        return { ok: false, message: result.error || '加载失败', items: [] }
      }
      const items = Array.isArray(result.items) ? (result.items as FeedbackListItem[]) : []
      return { ok: true, items }
    } catch (err) {
      logger.warn('拉取反馈列表失败', err)
      return { ok: false, message: '网络异常，暂时无法加载记录', items: [] }
    }
  }

  private feedbackUrl() {
    const redeem = BUILTIN_REDEEM_URL
    return redeem.replace(/\/redeem\/?$/, '/feedback')
  }

  private feedbackListUrl() {
    const redeem = BUILTIN_REDEEM_URL
    return redeem.replace(/\/redeem\/?$/, '/feedback/list')
  }

  private signingApiPath(requestUrl: string) {
    const u = new URL(requestUrl)
    const pathname = u.pathname.replace(/\/$/, '') || '/'
    if (pathname.endsWith('/feedback/list')) return '/feedback/list'
    if (pathname.endsWith('/feedback')) return '/feedback'
    return pathname
  }

  private sortKeysDeep(value: unknown): unknown {
    if (Array.isArray(value)) return value.map(v => this.sortKeysDeep(v))
    if (value && typeof value === 'object') {
      const obj = value as Record<string, unknown>
      const out: Record<string, unknown> = {}
      for (const k of Object.keys(obj).sort()) {
        out[k] = this.sortKeysDeep(obj[k])
      }
      return out
    }
    return value
  }

  private canonicalBody(payload: Record<string, unknown>) {
    const cleaned: Record<string, unknown> = {}
    for (const k of Object.keys(payload).sort()) {
      if (k === 'sig') continue
      cleaned[k] = this.sortKeysDeep(payload[k])
    }
    return Buffer.from(JSON.stringify(cleaned), 'utf8')
  }

  private requestSignature(apiPath: string, machineId: string, ts: string, body: Buffer) {
    const bodyHash = createHash('sha256').update(body).digest('hex')
    const msg = `v1|${apiPath}|${machineId}|${ts}|${bodyHash}`
    return createHmac('sha256', Buffer.from(API_REQUEST_KEY_HEX, 'hex')).update(msg).digest('hex')
  }

  private async postSigned(
    url: string,
    payload: Record<string, unknown>,
  ): Promise<{
    ok: boolean
    error?: string
    id?: number
    items?: FeedbackListItem[]
  }> {
    const apiPath = this.signingApiPath(url)
    const mid = String(payload.machine_id || licenseService.machineFingerprint())
    const ts = String(Math.floor(Date.now() / 1000))
    const signed: Record<string, unknown> = { ...payload, ts }
    const canon = this.canonicalBody(signed)
    signed.sig = this.requestSignature(apiPath, mid, ts, canon)
    const finalObj: Record<string, unknown> = {}
    for (const k of Object.keys(signed).sort()) finalObj[k] = signed[k]
    const finalBody = Buffer.from(JSON.stringify(finalObj), 'utf8')

    const ctrl = new AbortController()
    const timer = setTimeout(() => ctrl.abort(), 30_000)
    try {
      const res = await net.fetch(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Accept: 'application/json',
          'User-Agent': USER_AGENT,
        },
        body: finalBody,
        signal: ctrl.signal,
      })
      const data = (await res.json().catch(() => ({}))) as {
        ok?: boolean
        error?: string
        id?: number
        items?: FeedbackListItem[]
      }
      if (!res.ok || !data.ok) {
        return {
          ok: false,
          error: data.error || `请求失败（HTTP ${res.status}）`,
        }
      }
      return { ok: true, id: data.id, items: data.items }
    } finally {
      clearTimeout(timer)
    }
  }
}

export const feedbackService = new FeedbackService()
