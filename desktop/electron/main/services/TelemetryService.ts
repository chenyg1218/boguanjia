/**
 * 运营埋点：上报到核销服务 /telemetry（与卡密同一 HMAC 签名）。
 * 仅记录启动 / 平台 / 中控连接 / 功能任务；失败静默，不阻断业务。
 */
import { createHash, createHmac } from 'node:crypto'
import { app, net } from 'electron'
import { createLogger } from '#/logger'
import { licenseService } from '#/services/LicenseService'

const logger = createLogger('埋点')

const API_REQUEST_KEY_HEX =
  '4ddd278c4798a5b936397ae7bd0057fdc8431aada88dbf5a68622fa3a4b4e608'
const BUILTIN_REDEEM_URL = 'https://license.sugaiming.com/bgj/redeem'
const USER_AGENT = 'Boguanjia/2.3 (+https://boguanjia.local)'

export type TelemetryEventName = 'app_launch' | 'platform_selected' | 'connect' | 'task_start'

export type TelemetryProps = {
  platform?: string
  result?: 'ok' | 'fail'
  reason?: string
  task_type?: string
  app_version?: string
  plan?: string
}

type QueuedEvent = {
  name: TelemetryEventName
  props: TelemetryProps
  created_at: string
}

class TelemetryService {
  private queue: QueuedEvent[] = []
  private flushTimer: ReturnType<typeof setTimeout> | null = null
  private flushing = false
  private launchedThisProcess = false

  track(name: TelemetryEventName, props: TelemetryProps = {}) {
    if (!app.isPackaged && process.env.BGJ_TELEMETRY_DEBUG !== '1') {
      // 开发态默认不上报，避免污染线上；需要联调时设 BGJ_TELEMETRY_DEBUG=1
      return
    }
    const cleaned = this.sanitizeProps(props)
    this.queue.push({
      name,
      props: cleaned,
      created_at: new Date().toISOString().replace(/\.\d{3}Z$/, 'Z'),
    })
    if (this.queue.length >= 8) {
      void this.flush()
      return
    }
    if (!this.flushTimer) {
      this.flushTimer = setTimeout(() => {
        this.flushTimer = null
        void this.flush()
      }, 1500)
    }
  }

  /** 进程内只记一次启动 */
  trackAppLaunch() {
    if (this.launchedThisProcess) return
    this.launchedThisProcess = true
    const status = licenseService.status()
    this.track('app_launch', {
      app_version: app.getVersion(),
      plan: status.plan,
      platform: status.boundPlatform || undefined,
    })
  }

  trackPlatformSelected(platform: string) {
    this.track('platform_selected', {
      platform,
      app_version: app.getVersion(),
      plan: licenseService.status().plan,
    })
  }

  trackConnect(platform: string, ok: boolean, reason?: string) {
    this.track('connect', {
      platform,
      result: ok ? 'ok' : 'fail',
      reason: ok ? undefined : this.shortReason(reason),
      app_version: app.getVersion(),
      plan: licenseService.status().plan,
    })
  }

  trackTaskStart(taskType: string, platform?: string) {
    this.track('task_start', {
      task_type: taskType,
      platform: platform || licenseService.status().boundPlatform || undefined,
      app_version: app.getVersion(),
      plan: licenseService.status().plan,
    })
  }

  async flush() {
    if (this.flushing || this.queue.length === 0) return
    this.flushing = true
    if (this.flushTimer) {
      clearTimeout(this.flushTimer)
      this.flushTimer = null
    }
    const batch = this.queue.splice(0, 20)
    try {
      const url = this.telemetryUrl()
      if (!url) return
      const mid = licenseService.machineFingerprint()
      const payload: Record<string, unknown> = {
        machine_id: mid,
        events: batch,
      }
      await this.postSigned(url, payload)
    } catch (err) {
      // 失败放回队列头部，最多攒 40 条，避免内存涨
      this.queue = [...batch, ...this.queue].slice(0, 40)
      logger.debug('上报失败（将重试）', err)
    } finally {
      this.flushing = false
      if (this.queue.length > 0 && !this.flushTimer) {
        this.flushTimer = setTimeout(() => {
          this.flushTimer = null
          void this.flush()
        }, 5000)
      }
    }
  }

  private shortReason(reason?: string) {
    const text = String(reason || '')
      .replace(/\s+/g, ' ')
      .trim()
    if (!text) return undefined
    return text.slice(0, 80)
  }

  private sanitizeProps(props: TelemetryProps): TelemetryProps {
    const out: TelemetryProps = {}
    if (props.platform) out.platform = String(props.platform).slice(0, 32)
    if (props.result === 'ok' || props.result === 'fail') out.result = props.result
    if (props.reason) out.reason = this.shortReason(props.reason)
    if (props.task_type) out.task_type = String(props.task_type).replace(/[^a-zA-Z0-9_\-]/g, '').slice(0, 40)
    if (props.app_version) out.app_version = String(props.app_version).slice(0, 32)
    if (props.plan) out.plan = String(props.plan).slice(0, 16)
    return out
  }

  private telemetryUrl() {
    const redeem = BUILTIN_REDEEM_URL
    return redeem.replace(/\/redeem\/?$/, '/telemetry')
  }

  private signingApiPath(requestUrl: string) {
    const u = new URL(requestUrl)
    const pathname = u.pathname.replace(/\/$/, '') || '/'
    if (pathname.endsWith('/telemetry')) return '/telemetry'
    return pathname
  }

  /** 与服务端 json.dumps(..., sort_keys=True) 对齐（含嵌套 events） */
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

  private async postSigned(url: string, payload: Record<string, unknown>) {
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
    const timer = setTimeout(() => ctrl.abort(), 12_000)
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
      if (!res.ok) {
        throw new Error(`telemetry HTTP ${res.status}`)
      }
    } finally {
      clearTimeout(timer)
    }
  }
}

export const telemetryService = new TelemetryService()
