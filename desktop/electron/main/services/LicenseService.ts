/**
 * 播管家卡密授权（与 Python boguanjia.auth 协议对齐）。
 * 基础版：1 账号；专业版：3 账号；旗舰版：无上限。
 */
import { createHash, createHmac, createPublicKey, verify as cryptoVerify } from 'node:crypto'
import { execSync } from 'node:child_process'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { app, net } from 'electron'
import { IPC_CHANNELS } from 'shared/ipcChannels'
import {
  canRedeemPlan,
  maxAccountsForPlan,
  normalizeLicensePlan,
  type LicensePlan,
} from 'shared/licensePlan'
import { createLogger } from '#/logger'
import { accountManager } from '#/managers/AccountManager'
import windowManager from '#/windowManager'

const logger = createLogger('授权')

const LICENSE_SALT = 'boguanjia-license-v2'
const CARD_HASH_SALT = 'jindou-card-fp-v1'
const DEMO_CARD_RE = /^DEMO-(\d{1,4})-(.+)$/i
const BUILTIN_REDEEM_URL = 'https://license.sugaiming.com/bgj/redeem'
const ALLOWED_HOSTS = new Set(['license.sugaiming.com'])
const LICENSE_VERIFY_KEY_HEX =
  'a7ec268cfd7188093355cc4b8a87a22c4060746a18daa6a34cf511f6594a4ca4'
const API_REQUEST_KEY_HEX =
  '4ddd278c4798a5b936397ae7bd0057fdc8431aada88dbf5a68622fa3a4b4e608'
const USER_AGENT = 'Boguanjia/2.3 (+https://boguanjia.local)'
/** 与金豆助手 auth._REDEEM_RETRIES 对齐 */
const REDEEM_RETRIES = 3
/** 付费档运行中本地兜底复检间隔（捕获凭证宽限过期等） */
const LOCAL_FALLBACK_MS = 60_000
/** 联网心跳间隔 */
const HEARTBEAT_MS = 6 * 60 * 60 * 1000
/** setTimeout 安全上限（约 24.8 天） */
const MAX_TIMEOUT_MS = 2_147_483_647
/** 与 Python auth._CLOCK_ROLLBACK_SEC 对齐：本地相对锚定倒退超过此值视为拨表 */
const CLOCK_ROLLBACK_SEC = 3600
/** 墙钟相对进程时间明显停滞/倒退的判定窗口 */
const WALL_FREEZE_MONO_MS = 5 * 60 * 1000
const FREE_DEFAULT_ACCOUNT_ID = 'default'
const EXPIRED_RUNTIME_HINT =
  '专业版/旗舰版已到期，已切换为基础版（仅 1 个账号）。请到「设置 → 收费计划」续充卡密'
const LICENSE_ACCOUNT_DENIED =
  '该账号已超出当前档位可用数量，请升级旗舰版或切换到已授权账号'
const CLOCK_ANOMALY_HINT =
  '检测到系统时间异常，授权已暂停。请恢复正确时间并联网后，到设置页点击刷新'
const OFFLINE_MONOTONIC_HINT =
  '已超过离线使用期限，请联网后重新校验授权（设置页点击刷新）'

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
  /** 本地缓存的档位；正式授权以凭证载荷 p 为准 */
  plan: LicensePlan
}

export interface LicenseStatus {
  isPro: boolean
  plan: LicensePlan
  expiresAt: string
  announcement: string
  machineId: string
  /** -1 表示无上限 */
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
    plan: 'free',
  }
}

function parseDemoPlan(label: string): LicensePlan {
  const raw = (label || '').trim().toLowerCase()
  if (raw.includes('flagship') || raw.includes('旗舰')) return 'flagship'
  if (raw.includes('pro') || raw.includes('专业')) return 'pro'
  // 演示默认专业版，便于本地验证 3 账号上限
  return 'pro'
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
  private watchStarted = false
  private expireTimer: ReturnType<typeof setTimeout> | null = null
  private fallbackTimer: ReturnType<typeof setInterval> | null = null
  private heartbeatTimer: ReturnType<typeof setInterval> | null = null
  private lastEmittedKey = ''
  private heartbeatInFlight = false
  private clockRecoverInFlight = false
  /** 距上次成功联网校验的进程单调时长（不受系统拨表影响） */
  private monoMsWithoutSync = 0
  private lastPerfNow = 0
  private lastWallNow = 0
  private wallFreezeSuspectedFlag = false
  /** 渲染进程同步的账号 ID 顺序（default 优先）；用于档位上限强制 */
  private licensedAccountIds: string[] = [FREE_DEFAULT_ACCOUNT_ID]

  private statePath() {
    return path.join(app.getPath('userData'), 'license-account.json')
  }

  private config(): LicenseConfig {
    return {
      redeem_url: BUILTIN_REDEEM_URL,
      announcement:
        '购买卡密后在此激活；没到期再充，剩余天数会自动加上。专业版 29元/月·3账号，旗舰版 39元/月·无上限。\n卡密购买：https://www.zaofaka.com/links/1CD589E2',
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

  private verifyV2Token(
    token: string,
    expectMachineId: string,
    opts?: { nowMs?: number; expectExpiresLocal?: string },
  ): { ok: boolean; plan?: LicensePlan } {
    if (!token.startsWith('v2.')) return { ok: false }
    const parts = token.slice(3).split('.')
    if (parts.length !== 2) return { ok: false }
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
      if (!ok) return { ok: false }
      const payload = JSON.parse(body.toString('utf8')) as {
        m?: string
        e?: string
        i?: string
        g?: number
        p?: string
      }
      const mid = String(payload.m || '').trim().toLowerCase()
      if (mid !== expectMachineId.trim().toLowerCase()) return { ok: false }
      const issued = parseServerTime(String(payload.i || ''))
      if (!issued) return { ok: false }
      const grace = Math.max(1, Math.min(30, Number(payload.g) || 2))
      const now = (opts?.nowMs ?? Date.now()) / 1000
      const issuedTs = issued.getTime() / 1000
      if (now - issuedTs > grace * 86400) return { ok: false }
      if (issuedTs - now > 3600) return { ok: false }
      // 载荷到期须能对上本地展示到期，防止只改 license-account.json
      if (opts?.expectExpiresLocal) {
        const tokenExpLocal = serverExpiresToLocal(String(payload.e || ''))
        if (!tokenExpLocal || tokenExpLocal !== opts.expectExpiresLocal) return { ok: false }
      }
      // 旧凭证无 p：按旗舰兼容（历史付费=多账号无上限）
      const plan = payload.p
        ? normalizeLicensePlan(payload.p, 'flagship')
        : 'flagship'
      return { ok: true, plan }
    } catch (err) {
      logger.warn('凭证验签失败', err)
      return { ok: false }
    }
  }

  private clockRollbackSuspected(state: LicenseState): boolean {
    const loc = parseLocal(state.clock_local_at)
    if (!loc) return false
    return (Date.now() - loc.getTime()) / 1000 < -CLOCK_ROLLBACK_SEC
  }

  /**
   * 可信「现在」：优先用 server_time + 本地流逝时间。
   * 拨表回退时不再用「冻结时间」续命，调用方应直接判定授权无效。
   */
  private trustedNow(state: LicenseState): Date {
    const srv = parseServerTime(state.clock_server_at)
    const loc = parseLocal(state.clock_local_at)
    if (!srv || !loc) return new Date()
    if (this.clockRollbackSuspected(state)) return new Date()
    const deltaMs = Date.now() - loc.getTime()
    return new Date(srv.getTime() + deltaMs)
  }

  /**
   * 正式授权的时钟完整性：缺锚定、拨表回退、墙钟冻结均不通过。
   * 清掉 license-account.json 里的 clock_* 再拨表也无法绕过。
   */
  private clockIntegrityOk(state: LicenseState): boolean {
    if (!state.token) return true
    if (this.resolveRedeemUrl()) {
      if (!state.clock_server_at || !state.clock_local_at) return false
    }
    if (this.clockRollbackSuspected(state)) return false
    if (this.wallFreezeSuspectedFlag) return false
    return true
  }

  private offlineGraceOk(state: LicenseState): boolean {
    const graceDays = Math.max(0, Math.min(this.config().offline_grace_days, 2))
    // 进程单调时钟：系统时间冻住也无法无限离线
    if (this.monoMsWithoutSync > graceDays * 86400000) return false

    if (this.resolveRedeemUrl() && !state.clock_server_at && !state.last_validate_at) {
      return false
    }
    if (!state.clock_server_at && !state.last_validate_at) return true
    const anchor = parseLocal(state.last_validate_at) || parseLocal(state.clock_local_at)
    if (!anchor) return true
    return this.trustedNow(state).getTime() <= anchor.getTime() + graceDays * 86400000
  }

  private tokenMatches(state: LicenseState): boolean {
    if (!state.expires_at || !state.token) return false
    const mid = this.machineFingerprint()
    if (state.machine_id && state.machine_id !== mid) return false
    if (state.token.startsWith('v2.')) {
      return this.verifyV2Token(state.token, mid, {
        nowMs: this.trustedNow(state).getTime(),
        expectExpiresLocal: state.expires_at,
      }).ok
    }
    // 仅开发态（无正式 redeem）接受本地 salt token
    if (this.resolveRedeemUrl()) return false
    return state.token === this.makeDemoToken(state.expires_at, mid)
  }

  private isExpired(state: LicenseState): boolean {
    const exp = parseLocal(state.expires_at)
    if (!exp) return true
    return exp.getTime() <= this.trustedNow(state).getTime()
  }

  private paidOk(state: LicenseState = this.state): boolean {
    if (!this.tokenMatches(state)) return false
    if (!this.clockIntegrityOk(state)) return false
    if (!this.offlineGraceOk(state)) return false
    if (this.isExpired(state)) return false
    return true
  }

  /** 有效档位：凭证载荷优先，其次本地缓存；无效授权视为免费 */
  private resolvePlan(state: LicenseState = this.state): LicensePlan {
    if (!this.paidOk(state)) return 'free'
    if (state.token.startsWith('v2.')) {
      const verified = this.verifyV2Token(state.token, this.machineFingerprint(), {
        nowMs: this.trustedNow(state).getTime(),
        expectExpiresLocal: state.expires_at,
      })
      if (verified.ok && verified.plan) return verified.plan
    }
    const cached = normalizeLicensePlan(state.plan, 'free')
    if (cached === 'free') return 'flagship'
    return cached
  }

  isPro(): boolean {
    const state = this.state.expires_at ? this.state : this.load()
    return this.paidOk(state)
  }

  /**
   * 同步渲染进程账号列表（顺序：default 优先）。
   * 主进程按档位上限裁剪后作为 canUseAccount 白名单。
   */
  syncLicensedAccounts(accountIds: string[]): string[] {
    const cleaned = (accountIds || [])
      .map(id => String(id || '').trim())
      .filter(Boolean)
    const ordered = [
      ...cleaned.filter(id => id === FREE_DEFAULT_ACCOUNT_ID),
      ...cleaned.filter(id => id !== FREE_DEFAULT_ACCOUNT_ID),
    ]
    const unique = [...new Set(ordered.length ? ordered : [FREE_DEFAULT_ACCOUNT_ID])]
    this.licensedAccountIds = unique
    this.enforceAccountLimitSessions()
    return this.allowedAccountIds()
  }

  private allowedAccountIds(): string[] {
    const max = maxAccountsForPlan(this.resolvePlan())
    if (max < 0) return [...this.licensedAccountIds]
    if (max <= 1) return [FREE_DEFAULT_ACCOUNT_ID]
    const ids = this.licensedAccountIds.length
      ? this.licensedAccountIds
      : [FREE_DEFAULT_ACCOUNT_ID]
    return ids.slice(0, max)
  }

  /** 基础版仅 default；专业/旗舰按白名单（未同步前仅 default，避免越权） */
  canUseAccount(accountId: string): boolean {
    return this.allowedAccountIds().includes(accountId)
  }

  accountDeniedMessage(): string {
    return LICENSE_ACCOUNT_DENIED
  }

  status(): LicenseStatus {
    this.load()
    return this.statusFromState()
  }

  private statusFromState(): LicenseStatus {
    const pro = this.paidOk(this.state)
    const plan = this.resolvePlan(this.state)
    return {
      isPro: pro,
      plan,
      expiresAt: this.state.expires_at,
      announcement: this.config().announcement,
      machineId: this.machineFingerprint(),
      maxAccounts: maxAccountsForPlan(plan),
    }
  }

  private statusKey(status: LicenseStatus) {
    return `${status.isPro ? 1 : 0}|${status.plan}|${status.maxAccounts}|${status.expiresAt}`
  }

  /** 超出档位上限时关闭多余会话（不信任前端） */
  private enforceAccountLimitSessions() {
    const allowed = new Set(this.allowedAccountIds())
    for (const accountId of [...this.sessionIds()]) {
      if (!allowed.has(accountId)) {
        logger.info(`档位上限：关闭多余账号会话 ${accountId}`)
        accountManager.closeSession(accountId, 'license')
      }
    }
  }

  /** @deprecated 使用 enforceAccountLimitSessions */
  private enforceFreeTierSessions() {
    this.enforceAccountLimitSessions()
  }

  private sessionIds(): string[] {
    return [...accountManager.accountSessions.keys()]
  }

  private noteSuccessfulSync() {
    this.monoMsWithoutSync = 0
    this.wallFreezeSuspectedFlag = false
    this.lastPerfNow = performance.now()
    this.lastWallNow = Date.now()
  }

  /** 用进程单调时间检测「墙钟被冻住/大幅滞后」 */
  private updateWallFreezeDetector() {
    const perf = performance.now()
    const wall = Date.now()
    if (this.lastPerfNow > 0 && this.lastWallNow > 0) {
      const monoDelta = perf - this.lastPerfNow
      const wallDelta = wall - this.lastWallNow
      if (monoDelta >= WALL_FREEZE_MONO_MS && wallDelta < monoDelta * 0.5) {
        this.wallFreezeSuspectedFlag = true
        logger.warn('检测到系统时间停滞或异常滞后（相对进程时间）')
      }
    }
    this.lastPerfNow = perf
    this.lastWallNow = wall
  }

  private tickMonotonicOffline() {
    this.monoMsWithoutSync += LOCAL_FALLBACK_MS
    this.updateWallFreezeDetector()
  }

  /**
   * 拨表/缺锚定/墙钟冻结：立刻按非 Pro 推送，并强制联网恢复。
   * 联网失败则保持降级，直到时间恢复且校验成功。
   */
  private async recoverFromClockAnomaly() {
    if (this.clockRecoverInFlight) return
    this.clockRecoverInFlight = true
    try {
      const status = this.statusFromState()
      this.publishStatus(status, CLOCK_ANOMALY_HINT, true)
      this.armLocalTimers()
      const result = await this.heartbeat()
      if (!result.status.isPro) {
        this.publishStatus(
          result.status,
          result.warning || CLOCK_ANOMALY_HINT,
          true,
        )
      }
    } finally {
      this.clockRecoverInFlight = false
    }
  }

  private demoteForOfflineMonotonic() {
    if (!this.state.token && !this.state.expires_at) return
    logger.warn('单调时钟离线超时，强制降级')
    this.save({
      ...this.state,
      token: '',
      plan: 'free',
    })
    const status = this.statusFromState()
    this.publishStatus(status, OFFLINE_MONOTONIC_HINT, true)
    this.armLocalTimers()
  }

  /**
   * 推送状态给渲染进程。force 时即使未变化也推（例如带 warning）。
   */
  private publishStatus(status: LicenseStatus, warning?: string, force = false) {
    const key = this.statusKey(status)
    if (!force && key === this.lastEmittedKey && warning === undefined) return
    const prevPro = this.lastEmittedKey.startsWith('1|')
    this.lastEmittedKey = key
    let tip = warning
    if (tip === undefined && prevPro && !status.isPro) {
      tip = EXPIRED_RUNTIME_HINT
    }
    this.enforceAccountLimitSessions()
    windowManager.send(IPC_CHANNELS.license.changed, {
      status,
      warning: tip,
    })
  }

  private clearLocalTimers() {
    if (this.expireTimer) {
      clearTimeout(this.expireTimer)
      this.expireTimer = null
    }
    if (this.fallbackTimer) {
      clearInterval(this.fallbackTimer)
      this.fallbackTimer = null
    }
  }

  private armLocalTimers() {
    this.clearLocalTimers()
    if (!this.watchStarted) return

    const status = this.statusFromState()
    const exp = parseLocal(this.state.expires_at)
    if (exp) {
      const delay = exp.getTime() - Date.now()
      if (delay > 0) {
        this.expireTimer = setTimeout(
          () => this.recheckLocal(),
          Math.min(delay + 500, MAX_TIMEOUT_MS),
        )
      }
    }

    // 有授权票或专业版：每分钟复检 + 单调离线计时（防冻住系统时间）
    if (status.isPro || this.state.token) {
      this.fallbackTimer = setInterval(() => this.recheckLocal({ tick: true }), LOCAL_FALLBACK_MS)
    }
  }

  /** 本地即时复检：到期、凭证失效、时钟异常时推送前端 */
  recheckLocal(opts?: { tick?: boolean }): LicenseStatus {
    this.load()
    if (opts?.tick) {
      this.tickMonotonicOffline()
    } else {
      this.updateWallFreezeDetector()
    }

    if (this.state.token) {
      const graceDays = Math.max(0, Math.min(this.config().offline_grace_days, 2))
      if (this.monoMsWithoutSync > graceDays * 86400000) {
        this.demoteForOfflineMonotonic()
        return this.statusFromState()
      }
    }

    if (this.state.token && !this.clockIntegrityOk(this.state)) {
      void this.recoverFromClockAnomaly()
      return this.statusFromState()
    }

    const status = this.statusFromState()
    this.publishStatus(status)
    this.armLocalTimers()
    return status
  }

  private armHeartbeat() {
    if (this.heartbeatTimer) {
      clearInterval(this.heartbeatTimer)
      this.heartbeatTimer = null
    }
    if (!this.watchStarted) return
    this.heartbeatTimer = setInterval(() => {
      void this.heartbeat()
    }, HEARTBEAT_MS)
  }

  /** 低频联网校验（吊销 / 服务端改期 / 刷新凭证） */
  async heartbeat(): Promise<{ status: LicenseStatus; warning?: string }> {
    if (this.heartbeatInFlight) {
      return { status: this.statusFromState() }
    }
    this.heartbeatInFlight = true
    try {
      const result = await this.syncOnStartup({ fromHeartbeat: true })
      return result
    } finally {
      this.heartbeatInFlight = false
    }
  }

  /**
   * 启动运行中监视：到期定时 + 1 分钟兜底 + 6 小时心跳。
   * 幂等，可在启动同步后调用。
   */
  startRuntimeWatch() {
    if (this.watchStarted) {
      this.recheckLocal()
      return
    }
    this.watchStarted = true
    this.load()
    this.lastPerfNow = performance.now()
    this.lastWallNow = Date.now()
    const status = this.statusFromState()
    this.lastEmittedKey = this.statusKey(status)
    if (this.state.token && !this.clockIntegrityOk(this.state)) {
      void this.recoverFromClockAnomaly()
    }
    this.armLocalTimers()
    this.armHeartbeat()
    logger.info('已启动授权运行中监视（本地到期 + 低频心跳 + 时钟完整性）')
  }

  stopRuntimeWatch() {
    this.watchStarted = false
    this.clearLocalTimers()
    if (this.heartbeatTimer) {
      clearInterval(this.heartbeatTimer)
      this.heartbeatTimer = null
    }
  }

  /** 休眠恢复：本地立刻复检，并补一次联网心跳 */
  async onSystemResume() {
    this.recheckLocal()
    await this.heartbeat()
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

  /**
   * 签名用的 API 路径须与后端收到的路径一致。
   * 公网可能是 /bgj/redeem（nginx 反代），后端实际是 /redeem。
   */
  private signingApiPath(requestUrl: string): string {
    const u = new URL(requestUrl)
    const pathname = u.pathname.replace(/\/$/, '') || '/'
    if (pathname.endsWith('/redeem')) return '/redeem'
    if (pathname.endsWith('/validate')) return '/validate'
    return pathname
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
    const apiPath = this.signingApiPath(url)
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
    let redeemedPlan: LicensePlan = 'pro'
    let upgraded = false

    if (!redeemUrl) {
      const m = DEMO_CARD_RE.exec(normalized)
      if (!m) {
        return {
          ok: false,
          message: '未配置核销地址；演示可用 DEMO-30-PRO 或 DEMO-30-FLAGSHIP',
          status: this.status(),
        }
      }
      days = Number(m[1])
      redeemedPlan = parseDemoPlan(m[2])
      const current = this.paidOk(this.state) ? this.resolvePlan(this.state) : null
      const decision = canRedeemPlan(current, redeemedPlan)
      if (!decision.ok) {
        return { ok: false, message: decision.error, status: this.status() }
      }
      redeemedPlan = decision.resultPlan
      upgraded = Boolean(current && redeemedPlan !== current)
      tip = upgraded
        ? `演示升级成功（升至${redeemedPlan === 'flagship' ? '旗舰版' : '专业版'}），增加 ${days} 天`
        : `演示激活成功（${redeemedPlan === 'flagship' ? '旗舰版' : '专业版'}），增加 ${days} 天`
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
      redeemedPlan = normalizeLicensePlan(data.plan, 'flagship')
      upgraded = Boolean(data.upgraded)
      tip = data.replay
        ? `补领成功，增加 ${days} 天`
        : upgraded
          ? `升级成功，增加 ${days} 天`
          : `核销成功，增加 ${days} 天`
    }

    let newExpires = serverExpiresToLocal(serverExpires)
    if (!newExpires) newExpires = this.stackExpires(this.state.expires_at, days)

    let newToken = licenseToken
    let tokenPlan: LicensePlan | undefined
    if (!newToken) {
      if (redeemUrl) {
        return { ok: false, message: '核销成功但未返回授权凭证，请升级服务端后重试', status: this.status() }
      }
      newToken = this.makeDemoToken(newExpires, mid)
    } else if (newToken.startsWith('v2.')) {
      const verified = this.verifyV2Token(newToken, mid, { expectExpiresLocal: newExpires })
      if (!verified.ok) {
        return { ok: false, message: '授权凭证无效', status: this.status() }
      }
      tokenPlan = verified.plan
    }

    // 正式环境以服务端返回 / 凭证为准；演示环境用本地裁定结果
    const nextPlan = tokenPlan || redeemedPlan

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
      plan: nextPlan,
    })

    const status = this.statusFromState()
    if (serverTime) this.noteSuccessfulSync()
    this.publishStatus(status, undefined, true)
    this.armLocalTimers()
    const planLabel = status.plan === 'flagship' ? '旗舰版' : '专业版'
    return {
      ok: true,
      message: `${tip}（${planLabel}，账号${status.maxAccounts < 0 ? '无上限' : `上限 ${status.maxAccounts}`}）。到期时间：${newExpires}`,
      status,
    }
  }

  async syncOnStartup(opts?: {
    fromHeartbeat?: boolean
  }): Promise<{ status: LicenseStatus; warning?: string }> {
    this.load()
    const url = this.validateUrl()
    if (!url) {
      const status = this.statusFromState()
      this.publishStatus(status)
      this.armLocalTimers()
      return { status }
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
          plan: 'free',
          clock_server_at: serverTime || this.state.clock_server_at,
          clock_local_at: serverTime ? localNow : this.state.clock_local_at,
        })
        if (serverTime) this.noteSuccessfulSync()
        const status = this.statusFromState()
        const warning = '授权已被吊销，请联系发卡方'
        this.publishStatus(status, warning, true)
        this.armLocalTimers()
        return { status, warning }
      }

      if (data.known === false && this.state.expires_at && this.state.token) {
        this.save({
          ...this.state,
          expires_at: '',
          token: '',
          plan: 'free',
          applied_cards: [],
          clock_server_at: serverTime || this.state.clock_server_at,
          clock_local_at: serverTime ? localNow : this.state.clock_local_at,
        })
        if (serverTime) this.noteSuccessfulSync()
        const status = this.statusFromState()
        const warning = '服务端无此机器授权记录，请重新激活卡密'
        this.publishStatus(status, warning, true)
        this.armLocalTimers()
        return { status, warning }
      }

      let next = { ...this.state }
      if (serverTime) {
        next.clock_server_at = serverTime
        next.clock_local_at = localNow
        next.last_validate_at = localNow
      }
      const serverExp = String(data.expires_at || '')
      const licenseToken = String(data.license_token || '').trim()
      const serverPlan = normalizeLicensePlan(data.plan, 'flagship')
      if (data.known && serverExp) {
        const localExp = serverExpiresToLocal(serverExp)
        if (localExp) {
          const verified = licenseToken.startsWith('v2.')
            ? this.verifyV2Token(licenseToken, mid, {
                nowMs: parseServerTime(serverTime)?.getTime() ?? Date.now(),
                expectExpiresLocal: localExp,
              })
            : { ok: false as const }
          const tokenOk = verified.ok

          // 服务端已过期、未发票或验签失败：强制写回服务端到期并清空凭证，杜绝本地篡改续命
          if (data.expired || !licenseToken || !tokenOk) {
            if (!licenseToken) {
              logger.warn('授权同步：服务端未返回 license_token，强制按服务端到期降级')
            } else if (data.expired) {
              logger.info('授权同步：服务端已过期，强制降级')
            } else {
              logger.warn('授权同步：服务端 license_token 验签失败，强制降级')
            }
            this.save({
              ...next,
              expires_at: localExp,
              token: '',
              plan: 'free',
              machine_id: mid,
            })
            if (serverTime) this.noteSuccessfulSync()
            const status = this.statusFromState()
            const warning = data.expired
              ? '授权已过期，基础版仅支持 1 个账号；请到设置页续充卡密'
              : '授权校验未通过，请点击刷新重试；仍失败请重新激活卡密'
            this.publishStatus(status, warning, true)
            this.armLocalTimers()
            return { status, warning }
          }
          next = {
            ...next,
            expires_at: localExp,
            token: licenseToken,
            machine_id: mid,
            plan: verified.plan || serverPlan,
          }
        }
      }
      this.save(next)
      if (serverTime) this.noteSuccessfulSync()
      const status = this.statusFromState()
      if (!status.isPro) {
        // 从未激活过卡密的纯免费用户无需提示「已过期」
        const hadLicense = Boolean(this.state.expires_at) || Boolean(data.known)
        const warning = hadLicense
          ? '授权无效或已过期，基础版仅支持 1 个账号'
          : undefined
        this.publishStatus(status, warning, Boolean(warning))
        this.armLocalTimers()
        return { status, warning }
      }
      this.publishStatus(status)
      this.armLocalTimers()
      return { status }
    } catch (err) {
      const label = opts?.fromHeartbeat ? '授权心跳失败' : '启动授权同步失败（可离线宽限）'
      logger.warn(label, err)
      const status = this.statusFromState()
      const warning = status.isPro ? undefined : '授权校验网络异常'
      this.publishStatus(status, warning)
      this.armLocalTimers()
      return { status, warning }
    }
  }
}

export const licenseService = new LicenseService()
