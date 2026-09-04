/**
 * 播管家卡密授权（与 Python boguanjia.auth 协议对齐）。
 * 免费版：1 个账号；专业版（卡密有效）：多账号。
 */
import { createHash, createHmac, createPublicKey, verify as cryptoVerify } from 'node:crypto'
import { execSync } from 'node:child_process'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { app, net } from 'electron'
import { createLogger } from '#/logger'

const logger = createLogger('授权')

const LICENSE_SALT = 'boguanjia-license-v2'
const CARD_HASH_SALT = 'jindou-card-fp-v1'
const DEMO_CARD_RE = /^DEMO-(\d{1,4})-(.+)$/i
const BUILTIN_REDEEM_URL = 'https://license.sugaiming.com/redeem'
const ALLOWED_HOSTS = new Set(['license.sugaiming.com'])
const LICENSE_VERIFY_KEY_HEX =
  'a7ec268cfd7188093355cc4b8a87a22c4060746a18daa6a34cf511f6594a4ca4'
const API_REQUEST_KEY_HEX =
  '4ddd278c4798a5b936397ae7bd0057fdc8431aada88dbf5a68622fa3a4b4e608'
const USER_AGENT = 'Boguanjia/2.3 (+https://jindou.local)'
/** 与金豆助手 auth._REDEEM_RETRIES 对齐 */
const REDEEM_RETRIES = 3

export interface LicenseState {
  expires_at: string
  token: string
  machine_id: string
  announcement: string
  last_redeem_at: string
  applied_cards: string[]
  clock_server_at: string
  clock_local_at: string
  last_validate_at: string
}

export interface LicenseStatus {
  isPro: boolean
  expiresAt: string
  announcement: string
  machineId: string
  maxAccounts: number
}

interface LicenseConfig {
  redeem_url: string
  announcement: string
  timeout_seconds: number
  offline_grace_days: number
}

function emptyState(): LicenseState {
  return {
    expires_at: '',
    token: '',
    machine_id: '',
    announcement: '播管家，欢迎使用',
    last_redeem_at: '',
    applied_cards: [],
    clock_server_at: '',
    clock_local_at: '',
    last_validate_at: '',
  }
}

function pad2(n: number) {
  return String(n).padStart(2, '0')
}

function fmtLocal(d = new Date()): string {
  return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())} ${pad2(d.getHours())}:${pad2(d.getMinutes())}:${pad2(d.getSeconds())}`
}

function parseLocal(value: string): Date | null {
  const m = /^(\d{4})-(\d{2})-(\d{2}) (\d{2}):(\d{2}):(\d{2})$/.exec((value || '').trim())
  if (!m) return null
  return new Date(+m[1], +m[2] - 1, +m[3], +m[4], +m[5], +m[6])
}

function parseServerTime(value: string): Date | null {
  const raw = (value || '').trim()
  if (!raw) return null
  try {
    const iso = raw.endsWith('Z') ? `${raw.slice(0, -1)}+00:00` : raw
    const d = new Date(iso)
    if (!Number.isNaN(d.getTime())) return d
  } catch {
    /* fallthrough */
  }
  return parseLocal(raw)
}

function serverExpiresToLocal(value: string): string {
  const d = parseServerTime(value)
  return d ? fmtLocal(d) : ''
}

function b64urlDecode(text: string): Buffer {
  const pad = '='.repeat((4 - (text.length % 4)) % 4)
  return Buffer.from(text.replace(/-/g, '+').replace(/_/g, '/') + pad, 'base64')
}

export class LicenseService {
  private state: LicenseState = emptyState()
  private cachedMachineId = ''

  private statePath() {
    return path.join(app.getPath('userData'), 'license-account.json')
  }

  private config(): LicenseConfig {
    return {
      redeem_url: BUILTIN_REDEEM_URL,
      announcement:
        '购买卡密后在此激活；未到期续充将叠加剩余时长。\n卡密购买：https://www.zaofaka.com/links/1CD589E2',
      timeout_seconds: 15,
      offline_grace_days: 2,
    }
  }

  machineFingerprint(): string {
    if (this.cachedMachineId) return this.cachedMachineId
    const parts: string[] = []
    if (process.platform === 'win32') {
      try {
        const out = execSync(
          'reg query "HKLM\\SOFTWARE\\Microsoft\\Cryptography" /v MachineGuid',
          { encoding: 'utf8' },
        )
        const m = /MachineGuid\s+REG_SZ\s+(\S+)/i.exec(out)
        if (m?.[1]) parts.push(`mg:${m[1].trim()}`)
      } catch {
        /* ignore */
      }
    }
    const node = (os.hostname() || '').trim()
    if (node) parts.push(`hn:${node}`)
    try {
      const nics = os.networkInterfaces()
      for (const list of Object.values(nics)) {
        for (const nic of list || []) {
          if (!nic.internal && nic.mac && nic.mac !== '00:00:00:00:00:00') {
            parts.push(`mac:${nic.mac.replace(/:/g, '').toLowerCase()}`)
            break
          }
        }
        if (parts.some(p => p.startsWith('mac:'))) break
      }
    } catch {
      /* ignore */
    }
    if (!parts.length) parts.push('unknown')
    this.cachedMachineId = createHash('sha256').update(parts.join('|'), 'utf8').digest('hex').slice(0, 32)
    return this.cachedMachineId
  }

  load(): LicenseState {
    try {
      const raw = fs.readFileSync(this.statePath(), 'utf8')
      const data = JSON.parse(raw)
      this.state = { ...emptyState(), ...data }
    } catch {
      this.state = emptyState()
    }
    if (!this.state.machine_id) {
      this.state.machine_id = this.machineFingerprint()
    }
    return this.state
  }

  private save(state: LicenseState) {
    this.state = state
    fs.mkdirSync(path.dirname(this.statePath()), { recursive: true })
    fs.writeFileSync(this.statePath(), JSON.stringify(state, null, 2), 'utf8')
  }

  private makeDemoToken(expiresAt: string, machineId: string) {
    return createHash('sha256')
      .update(`${expiresAt}|${machineId}|${LICENSE_SALT}`, 'utf8')
      .digest('hex')
      .slice(0, 32)
  }

  private hashCard(card: string) {
    const normalized = card.trim().toUpperCase()
    return createHash('sha256')
      .update(`${normalized}|${CARD_HASH_SALT}`, 'utf8')
      .digest('hex')
      .slice(0, 40)
  }

  private verifyV2Token(token: string, expectMachineId: string): boolean {
    if (!token.startsWith('v2.')) return false
    const parts = token.slice(3).split('.')
    if (parts.length !== 2) return false
    const body = b64urlDecode(parts[0])
    const sig = b64urlDecode(parts[1])
    try {
      const publicKey = createPublicKey({
        key: Buffer.concat([
          Buffer.from('302a300506032b6570032100', 'hex'),
          Buffer.from(LICENSE_VERIFY_KEY_HEX, 'hex'),
        ]),
        format: 'der',
        type: 'spki',
      })
      const ok = cryptoVerify(null, body, publicKey, sig)
      if (!ok) return false
      const payload = JSON.parse(body.toString('utf8')) as {
        m?: string
        e?: string
        i?: string
        g?: number
      }
      const mid = String(payload.m || '').trim().toLowerCase()
      if (mid !== expectMachineId.trim().toLowerCase()) return false
      const issued = parseServerTime(String(payload.i || ''))
      if (!issued) return false
      const grace = Math.max(1, Math.min(30, Number(payload.g) || 2))
      const now = Date.now() / 1000
      const issuedTs = issued.getTime() / 1000
      if (now - issuedTs > grace * 86400) return false
      if (issuedTs - now > 3600) return false
      return true
    } catch (err) {
      logger.warn('凭证验签失败', err)
      return false
    }
  }

  private tokenMatches(state: LicenseState): boolean {
    if (!state.expires_at || !state.token) return false
    const mid = this.machineFingerprint()
    if (state.machine_id && state.machine_id !== mid) return false
    if (state.token.startsWith('v2.')) {
      return this.verifyV2Token(state.token, mid)
    }
    // 仅开发态（无正式 redeem）接受本地 salt token
    if (this.resolveRedeemUrl()) return false
    return state.token === this.makeDemoToken(state.expires_at, mid)
  }

  private isExpired(state: LicenseState): boolean {
    const exp = parseLocal(state.expires_at)
    if (!exp) return true
    return exp.getTime() <= Date.now()
  }

  isPro(): boolean {
    const state = this.state.expires_at ? this.state : this.load()
    if (!this.tokenMatches(state)) return false
    if (this.isExpired(state)) return false
    return true
  }

  status(): LicenseStatus {
    this.load()
    const pro = this.isPro()
    return {
      isPro: pro,
      expiresAt: this.state.expires_at,
      announcement: this.config().announcement,
      machineId: this.machineFingerprint(),
      maxAccounts: pro ? Number.POSITIVE_INFINITY : 1,
    }
  }

  private resolveRedeemUrl(): string {
    const configured = (this.config().redeem_url || '').trim()
    if (!configured) return ''
    try {
      const host = new URL(configured).hostname
      if (!ALLOWED_HOSTS.has(host)) return BUILTIN_REDEEM_URL
    } catch {
      return BUILTIN_REDEEM_URL
    }
    return configured
  }

  private validateUrl(): string {
    const redeem = this.resolveRedeemUrl()
    if (!redeem) return ''
    return redeem.replace(/\/redeem\/?$/, '/validate')
  }

  private requestSignature(apiPath: string, machineId: string, ts: string, body: Buffer) {
    const bodyHash = createHash('sha256').update(body).digest('hex')
    const msg = `v1|${apiPath}|${machineId}|${ts}|${bodyHash}`
    return createHmac('sha256', Buffer.from(API_REQUEST_KEY_HEX, 'hex')).update(msg).digest('hex')
  }

  private canonicalBody(payload: Record<string, unknown>) {
    const cleaned: Record<string, unknown> = {}
    for (const k of Object.keys(payload).sort()) {
      if (k === 'sig') continue
      cleaned[k] = payload[k]
    }
    return Buffer.from(JSON.stringify(cleaned), 'utf8')
  }

  private async postJson(url: string, payload: Record<string, unknown>) {
    const u = new URL(url)
    const apiPath = (u.pathname.replace(/\/$/, '') || '/') as string
    const mid = String(payload.machine_id || this.machineFingerprint())
    const ts = String(Math.floor(Date.now() / 1000))
    const signed: Record<string, unknown> = { ...payload, ts }
    const canon = this.canonicalBody(signed)
    signed.sig = this.requestSignature(apiPath, mid, ts, canon)
    const finalObj: Record<string, unknown> = {}
    for (const k of Object.keys(signed).sort()) finalObj[k] = signed[k]
    const finalBody = Buffer.from(JSON.stringify(finalObj), 'utf8')
    const timeoutMs = (this.config().timeout_seconds || 15) * 1000
    const headers = {
      'Content-Type': 'application/json',
      Accept: 'application/json',
      'User-Agent': USER_AGENT,
    }

    // 使用 Electron net.fetch（Chromium 网络栈），与更新检查一致；
    // 避免主进程 Node/undici fetch 在部分网络环境下 TLS 被重置。
    let lastErr: unknown
    for (let attempt = 0; attempt < REDEEM_RETRIES; attempt++) {
      const ctrl = new AbortController()
      const timer = setTimeout(() => ctrl.abort(), timeoutMs)
      try {
        const res = await net.fetch(url, {
          method: 'POST',
          headers,
          body: finalBody,
          signal: ctrl.signal,
        })
        const text = await res.text()
        let data: Record<string, unknown> = {}
        try {
          data = text ? JSON.parse(text) : {}
        } catch {
          data = {}
        }
        return { ok: res.ok, status: res.status, data }
      } catch (err) {
        lastErr = err
        if (attempt + 1 < REDEEM_RETRIES) {
          await new Promise(r => setTimeout(r, 600 * (attempt + 1)))
          continue
        }
      } finally {
        clearTimeout(timer)
      }
    }
    throw lastErr instanceof Error ? lastErr : new Error(String(lastErr || '核销请求失败'))
  }

  private stackExpires(current: string, days: number): string {
    const now = new Date()
    let base = now
    const cur = parseLocal(current)
    if (cur && cur.getTime() > now.getTime()) base = cur
    base = new Date(base.getTime() + days * 86400000)
    return fmtLocal(base)
  }

  async activate(card: string): Promise<{ ok: boolean; message: string; status: LicenseStatus }> {
    const normalized = (card || '').trim().toUpperCase()
    if (!normalized) {
      return { ok: false, message: '请输入卡密', status: this.status() }
    }

    this.load()
    const mid = this.machineFingerprint()
    const fp = this.hashCard(normalized)
    if (this.state.applied_cards.includes(fp) || this.state.applied_cards.includes(normalized.toLowerCase())) {
      if (this.isPro()) {
        return {
          ok: true,
          message: `此卡密已在本机生效。到期时间：${this.state.expires_at}`,
          status: this.status(),
        }
      }
      return { ok: false, message: '此卡密已在本机使用过，请使用新卡密续充', status: this.status() }
    }

    const redeemUrl = this.resolveRedeemUrl()
    let days = 0
    let serverTime = ''
    let serverExpires = ''
    let licenseToken = ''
    let tip = ''

    if (!redeemUrl) {
      const m = DEMO_CARD_RE.exec(normalized)
      if (!m) {
        return { ok: false, message: '未配置核销地址；演示可用 DEMO-30-测试', status: this.status() }
      }
      days = Number(m[1])
      tip = `演示激活成功，增加 ${days} 天`
    } else {
      let data: Record<string, unknown>
      try {
        ;({ data } = await this.postJson(redeemUrl, { card: normalized, machine_id: mid }))
      } catch (err) {
        logger.warn('卡密核销请求失败', err)
        return {
          ok: false,
          message: '无法连接授权服务器，请检查网络后重试；若持续失败请联系发卡方',
          status: this.status(),
        }
      }
      if (!data.ok) {
        return {
          ok: false,
          message: String(data.error || data.message || '卡密无效'),
          status: this.status(),
        }
      }
      days = Number(data.days || 0)
      if (days <= 0) {
        return { ok: false, message: '核销成功但未返回有效天数', status: this.status() }
      }
      serverTime = String(data.server_time || '')
      serverExpires = String(data.expires_at || '')
      licenseToken = String(data.license_token || '').trim()
      tip = data.replay ? `补领成功，增加 ${days} 天` : `核销成功，增加 ${days} 天`
    }

    let newExpires = serverExpiresToLocal(serverExpires)
    if (!newExpires) newExpires = this.stackExpires(this.state.expires_at, days)

    let newToken = licenseToken
    if (!newToken) {
      if (redeemUrl) {
        return { ok: false, message: '核销成功但未返回授权凭证，请升级服务端后重试', status: this.status() }
      }
      newToken = this.makeDemoToken(newExpires, mid)
    } else if (newToken.startsWith('v2.') && !this.verifyV2Token(newToken, mid)) {
      return { ok: false, message: '授权凭证无效', status: this.status() }
    }

    const applied = [...this.state.applied_cards]
    if (!applied.includes(fp)) applied.push(fp)
    const localNow = fmtLocal()
    this.save({
      ...this.state,
      expires_at: newExpires,
      token: newToken,
      machine_id: mid,
      announcement: this.config().announcement,
      last_redeem_at: localNow,
      applied_cards: applied,
      clock_server_at: serverTime || this.state.clock_server_at,
      clock_local_at: serverTime ? localNow : this.state.clock_local_at,
      last_validate_at: serverTime ? localNow : this.state.last_validate_at,
    })

    return { ok: true, message: `${tip}。到期时间：${newExpires}`, status: this.status() }
  }

  async syncOnStartup(): Promise<{ status: LicenseStatus; warning?: string }> {
    this.load()
    const url = this.validateUrl()
    if (!url) {
      return { status: this.status() }
    }
    try {
      const mid = this.machineFingerprint()
      const { data } = await this.postJson(url, { machine_id: mid })
      const serverTime = String(data.server_time || '')
      const localNow = fmtLocal()

      if (data.revoked) {
        this.save({
          ...this.state,
          expires_at: '',
          token: '',
          clock_server_at: serverTime || this.state.clock_server_at,
          clock_local_at: serverTime ? localNow : this.state.clock_local_at,
        })
        return { status: this.status(), warning: '授权已被吊销，请联系发卡方' }
      }

      if (data.known === false && this.state.expires_at && this.state.token) {
        this.save({
          ...this.state,
          expires_at: '',
          token: '',
          applied_cards: [],
          clock_server_at: serverTime || this.state.clock_server_at,
          clock_local_at: serverTime ? localNow : this.state.clock_local_at,
        })
        return { status: this.status(), warning: '服务端无此机器授权记录，请重新激活卡密' }
      }

      let next = { ...this.state }
      if (serverTime) {
        next.clock_server_at = serverTime
        next.clock_local_at = localNow
        next.last_validate_at = localNow
      }
      const serverExp = String(data.expires_at || '')
      const licenseToken = String(data.license_token || '').trim()
      if (data.known && serverExp) {
        const localExp = serverExpiresToLocal(serverExp)
        if (localExp) {
          if (licenseToken.startsWith('v2.') && !this.verifyV2Token(licenseToken, mid)) {
            return { status: this.status(), warning: '服务端凭证无效' }
          }
          if (!licenseToken) {
            return { status: this.status(), warning: '服务端未返回授权凭证' }
          }
          next = {
            ...next,
            expires_at: localExp,
            token: licenseToken,
            machine_id: mid,
          }
        }
      }
      this.save(next)
      if (!this.isPro()) {
        return { status: this.status(), warning: '授权无效或已过期，免费版仅支持 1 个账号' }
      }
      return { status: this.status() }
    } catch (err) {
      logger.warn('启动授权同步失败（可离线宽限）', err)
      return { status: this.status(), warning: this.isPro() ? undefined : '授权校验网络异常' }
    }
  }
}

export const licenseService = new LicenseService()
