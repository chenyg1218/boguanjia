import { randomUUID } from 'node:crypto'
import { IPC_CHANNELS } from 'shared/ipcChannels'
import { createLogger } from '#/logger'
import { replaceVariant } from '#/utils/common'
import windowManager from '#/windowManager'
import { synthesizeEdgeTts } from './edgeTts'

const logger = createLogger('语音设置')

export type VoiceBroadcastConfig = {
  script: string
  voice: string
  /** 50–150，100 正常 */
  rate: number
  /** 0–100，播放音量 */
  volume: number
  /** HTMLAudioElement.setSinkId，空字符串=系统默认 */
  outputDeviceId: string
  loop: boolean
  /** 顺序 / 随机循环 */
  loopMode?: 'sequential' | 'random'
  /** 条间间隔秒 [min,max] */
  lineGapSec?: [number, number]
  /** 整本播完后再开一轮的间隔秒 */
  bookLoopGapSec?: number
  timeAnnounce: {
    enable: boolean
    /** 固定秒 / 随机区间 [min,max] 秒 */
    mode: 'fixed' | 'random'
    intervalSec: [number, number]
    includeElapsed: boolean
  }
}

export type VoiceBroadcastStatus = {
  running: boolean
  paused: boolean
  accountId: string | null
  currentLine: string
  startedAt: number | null
}

type PlayRequest = {
  playId: string
  accountId: string
  mime: string
  base64: string
  volume: number
  outputDeviceId: string
}

type Session = {
  accountId: string
  config: VoiceBroadcastConfig
  lines: string[]
  lineIndex: number
  /** 随机模式下剩余未播下标 */
  randomBag: number[]
  running: boolean
  paused: boolean
  startedAt: number | null
  nextAnnounceAt: number
  loopToken: number
  currentPlayId: string | null
  currentLine: string
  insertQueue: string[]
  oneShotBusy: boolean
  /** 被插播打断后需重念的原文（展开变量前） */
  resumeLine: string | null
  /** 当前正在念的话术原文（非插播/报时） */
  activeSourceLine: string | null
}

function splitScriptLines(script: string): string[] {
  return script
    .split(/\r?\n/)
    .map(l => l.trim())
    .filter(Boolean)
}

function formatNowTime(): string {
  const d = new Date()
  const h = d.getHours()
  const m = d.getMinutes()
  return `现在是${h}点${m.toString().padStart(2, '0')}分`
}

function formatElapsed(startedAt: number): string {
  const sec = Math.max(0, Math.floor((Date.now() - startedAt) / 1000))
  const h = Math.floor(sec / 3600)
  const m = Math.floor((sec % 3600) / 60)
  if (h > 0) return `本场已播报${h}小时${m}分钟`
  if (m > 0) return `本场已播报${m}分钟`
  return `本场已播报${sec}秒`
}

function nextAnnounceDelayMs(config: VoiceBroadcastConfig['timeAnnounce']): number {
  const [a, b] = config.intervalSec
  const min = Math.max(10, Math.min(a, b))
  const max = Math.max(min, Math.max(a, b))
  if (config.mode === 'fixed') return min * 1000
  return (min + Math.floor(Math.random() * (max - min + 1))) * 1000
}

function gapDelayMs(range: [number, number] | undefined, fallback = 0): number {
  if (!range) return fallback * 1000
  const min = Math.max(0, Math.min(range[0], range[1]))
  const max = Math.max(min, Math.max(range[0], range[1]))
  if (max <= 0) return 0
  return (min + Math.floor(Math.random() * (max - min + 1))) * 1000
}

function deviceKey(outputDeviceId: string): string {
  return outputDeviceId || '__default__'
}

function idleStatus(accountId: string | null = null): VoiceBroadcastStatus {
  return {
    running: false,
    paused: false,
    accountId,
    currentLine: '',
    startedAt: null,
  }
}

class VoiceBroadcastService {
  private sessions = new Map<string, Session>()
  private playWaiters = new Map<
    string,
    { accountId: string; resolve: () => void; reject: (e: Error) => void }
  >()

  getStatus(accountId: string): VoiceBroadcastStatus {
    const s = this.sessions.get(accountId)
    if (!s) return idleStatus(accountId)
    return {
      running: s.running,
      paused: s.paused,
      accountId: s.accountId,
      currentLine: s.currentLine,
      startedAt: s.startedAt,
    }
  }

  getAllStatuses(): VoiceBroadcastStatus[] {
    return [...this.sessions.values()]
      .filter(s => s.running || s.paused || s.currentLine)
      .map(s => this.getStatus(s.accountId))
  }

  /** 与其它运行中账号是否共用同一输出设备 */
  findDeviceConflict(accountId: string, outputDeviceId: string): string | null {
    const key = deviceKey(outputDeviceId)
    for (const s of this.sessions.values()) {
      if (s.accountId === accountId || !s.running) continue
      if (deviceKey(s.config.outputDeviceId) === key) {
        return s.accountId
      }
    }
    return null
  }

  insert(
    accountId: string,
    text: string,
    interrupt = true,
  ): { ok: true } | { ok: false; error: string } {
    const line = text.trim()
    if (!line) return { ok: false, error: '插播文本为空' }
    const s = this.sessions.get(accountId)
    if (!s?.running || !s.config) {
      return { ok: false, error: '请先开始读稿后再插播' }
    }
    if (interrupt) {
      if (s.activeSourceLine && !s.resumeLine) {
        s.resumeLine = s.activeSourceLine
      }
      s.insertQueue.unshift(line)
      this.rejectCurrentPlay(s, '插播打断')
    } else {
      s.insertQueue.push(line)
    }
    logger.info(`[${accountId}] 已加入插播：${line.slice(0, 40)}`)
    return { ok: true }
  }

  /**
   * 一次性播报。该账号读稿中则插播；否则用该账号配置单次播放（不占循环）。
   */
  async speakOnce(
    accountId: string,
    text: string,
    options?: { interrupt?: boolean; config?: Partial<VoiceBroadcastConfig> },
  ): Promise<{ ok: true } | { ok: false; error: string }> {
    const line = text.trim()
    if (!line) return { ok: false, error: '播报文本为空' }

    const existing = this.sessions.get(accountId)
    if (existing?.running) {
      return this.insert(accountId, line, options?.interrupt !== false)
    }

    if (existing?.oneShotBusy) {
      return { ok: false, error: '上一段单次播报尚未结束' }
    }

    const base = existing?.config
    const cfg: VoiceBroadcastConfig = {
      script: line,
      voice: options?.config?.voice || base?.voice || 'zh-CN-XiaoxiaoNeural',
      rate: options?.config?.rate ?? base?.rate ?? 100,
      volume: options?.config?.volume ?? base?.volume ?? 100,
      outputDeviceId: options?.config?.outputDeviceId ?? base?.outputDeviceId ?? '',
      loop: false,
      timeAnnounce: {
        enable: false,
        mode: 'fixed',
        intervalSec: [120, 120],
        includeElapsed: false,
      },
    }

    let s = existing
    if (!s) {
      s = this.createIdleSession(accountId, cfg)
      this.sessions.set(accountId, s)
    } else {
      s.config = { ...s.config, ...cfg, timeAnnounce: cfg.timeAnnounce }
    }

    s.oneShotBusy = true
    const token = s.loopToken
    try {
      await this.speak(s, line, token)
      return { ok: true }
    } catch (err) {
      return { ok: false, error: err instanceof Error ? err.message : String(err) }
    } finally {
      s.oneShotBusy = false
      s.currentLine = ''
      this.emitStatus(s)
    }
  }

  updateConfig(accountId: string, partial: Partial<VoiceBroadcastConfig>) {
    const s = this.sessions.get(accountId)
    if (!s) return
    s.config = {
      ...s.config,
      ...partial,
      timeAnnounce: {
        ...s.config.timeAnnounce,
        ...(partial.timeAnnounce ?? {}),
      },
    }
    if (typeof partial.script === 'string') {
      s.lines = splitScriptLines(partial.script)
      if (s.lineIndex >= s.lines.length) s.lineIndex = 0
    }
  }

  async start(
    accountId: string,
    config: VoiceBroadcastConfig,
  ): Promise<{ ok: true; warning?: string } | { ok: false; error: string }> {
    const existing = this.sessions.get(accountId)
    if (existing?.running) {
      return { ok: false, error: '该账号读稿已在运行' }
    }

    const lines = splitScriptLines(config.script)
    if (lines.length === 0) {
      return { ok: false, error: '请先填写读稿文本（每行一句）' }
    }

    const conflictId = this.findDeviceConflict(accountId, config.outputDeviceId)
    const warning = conflictId
      ? `与账号「${conflictId}」使用相同输出设备，多路会混音；请为每个账号选择不同虚拟声卡`
      : undefined

    const s = existing ?? this.createIdleSession(accountId, config)
    s.accountId = accountId
    s.config = config
    s.lines = lines
    s.lineIndex = 0
    s.randomBag = lines.map((_, i) => i)
    s.insertQueue = []
    s.resumeLine = null
    s.activeSourceLine = null
    s.running = true
    s.paused = false
    s.startedAt = Date.now()
    s.nextAnnounceAt = Date.now() + nextAnnounceDelayMs(config.timeAnnounce)
    s.loopToken += 1
    s.currentLine = ''
    s.oneShotBusy = false
    this.sessions.set(accountId, s)

    const token = s.loopToken
    this.emitStatus(s)
    logger.info(`[${accountId}] 开始读稿${warning ? `（警告：${warning}）` : ''}`)
    void this.runLoop(s, token)
    return warning ? { ok: true, warning } : { ok: true }
  }

  stop(accountId: string) {
    const s = this.sessions.get(accountId)
    if (!s) return
    if (!s.running && !s.paused) return
    s.running = false
    s.paused = false
    s.loopToken += 1
    s.insertQueue = []
    this.rejectCurrentPlay(s, '已停止')
    s.currentLine = ''
    s.startedAt = null
    this.emitStatus(s)
    logger.info(`[${accountId}] 已停止读稿`)
    windowManager.send(IPC_CHANNELS.tasks.voiceBroadcast.stoppedEvent, {
      accountId,
      reason: 'stopped',
    })
  }

  pause(accountId: string) {
    const s = this.sessions.get(accountId)
    if (!s?.running || s.paused) return
    s.paused = true
    this.rejectCurrentPlay(s, '已暂停')
    this.emitStatus(s)
    logger.info(`[${accountId}] 已暂停读稿`)
  }

  resume(accountId: string) {
    const s = this.sessions.get(accountId)
    if (!s?.running || !s.paused) return
    s.paused = false
    this.emitStatus(s)
    logger.info(`[${accountId}] 继续读稿`)
  }

  notifyPlayDone(playId: string, error?: string) {
    const waiter = this.playWaiters.get(playId)
    if (!waiter) return
    this.playWaiters.delete(playId)
    if (error) waiter.reject(new Error(error))
    else waiter.resolve()
  }

  removeAccount(accountId: string) {
    this.stop(accountId)
    this.sessions.delete(accountId)
  }

  private createIdleSession(accountId: string, config: VoiceBroadcastConfig): Session {
    return {
      accountId,
      config,
      lines: [],
      lineIndex: 0,
      randomBag: [],
      running: false,
      paused: false,
      startedAt: null,
      nextAnnounceAt: 0,
      loopToken: 0,
      currentPlayId: null,
      currentLine: '',
      insertQueue: [],
      oneShotBusy: false,
      resumeLine: null,
      activeSourceLine: null,
    }
  }

  private rejectCurrentPlay(s: Session, reason: string) {
    if (!s.currentPlayId) return
    const waiter = this.playWaiters.get(s.currentPlayId)
    if (waiter) {
      this.playWaiters.delete(s.currentPlayId)
      waiter.reject(new Error(reason))
    }
    s.currentPlayId = null
  }

  private emitStatus(s: Session) {
    windowManager.send(IPC_CHANNELS.tasks.voiceBroadcast.status, this.getStatus(s.accountId))
  }

  private async waitWhilePaused(s: Session, token: number) {
    while (s.running && s.paused && token === s.loopToken) {
      await sleep(200)
    }
  }

  private async runLoop(s: Session, token: number) {
    try {
      while (s.running && token === s.loopToken) {
        await this.waitWhilePaused(s, token)
        if (!s.running || token !== s.loopToken) break

        if (s.config.timeAnnounce.enable && Date.now() >= s.nextAnnounceAt) {
          s.activeSourceLine = null
          const parts = [formatNowTime()]
          if (s.config.timeAnnounce.includeElapsed && s.startedAt) {
            parts.push(formatElapsed(s.startedAt))
          }
          await this.speak(s, parts.join('，'), token)
          s.nextAnnounceAt = Date.now() + nextAnnounceDelayMs(s.config.timeAnnounce)
          continue
        }

        if (s.insertQueue.length > 0) {
          s.activeSourceLine = null
          const inserted = s.insertQueue.shift()
          if (inserted) {
            await this.speak(s, replaceVariant(inserted), token)
            await this.waitWhilePaused(s, token)
          }
          continue
        }

        if (s.resumeLine) {
          const raw = s.resumeLine
          s.resumeLine = null
          s.activeSourceLine = raw
          await this.speak(s, replaceVariant(raw), token)
          s.activeSourceLine = null
          await this.waitWhilePaused(s, token)
          const gap = gapDelayMs(s.config.lineGapSec)
          if (gap > 0) await sleep(gap)
          continue
        }

        if (s.lines.length === 0) {
          await sleep(500)
          continue
        }

        const mode = s.config.loopMode ?? 'sequential'
        let bookWrap = false
        if (mode === 'sequential' && s.lineIndex >= s.lines.length) {
          if (!s.config.loop) {
            logger.info(`[${s.accountId}] 读稿播放完毕`)
            break
          }
          bookWrap = true
          s.lineIndex = 0
        }
        if (mode === 'random' && s.randomBag.length === 0) {
          if (!s.config.loop) {
            logger.info(`[${s.accountId}] 读稿播放完毕`)
            break
          }
          bookWrap = true
          s.randomBag = s.lines.map((_, i) => i)
        }
        if (bookWrap) {
          const bookGap = Math.max(0, s.config.bookLoopGapSec ?? 0) * 1000
          if (bookGap > 0) await sleep(bookGap)
        }

        const line =
          mode === 'random'
            ? (() => {
                const ri = Math.floor(Math.random() * s.randomBag.length)
                const idx = s.randomBag.splice(ri, 1)[0]
                return s.lines[idx]
              })()
            : s.lines[s.lineIndex++]

        if (!line) {
          logger.info(`[${s.accountId}] 读稿播放完毕`)
          break
        }

        s.activeSourceLine = line
        await this.speak(s, replaceVariant(line), token)
        s.activeSourceLine = null
        await this.waitWhilePaused(s, token)
        const gap = gapDelayMs(s.config.lineGapSec)
        if (gap > 0) await sleep(gap)
      }
    } catch (err) {
      if (s.running && token === s.loopToken) {
        logger.error(
          `[${s.accountId}] 读稿异常：`,
          err instanceof Error ? err : new Error(String(err)),
        )
      }
    } finally {
      if (token === s.loopToken) {
        s.running = false
        s.paused = false
        s.currentLine = ''
        s.activeSourceLine = null
        s.resumeLine = null
        this.emitStatus(s)
        windowManager.send(IPC_CHANNELS.tasks.voiceBroadcast.stoppedEvent, {
          accountId: s.accountId,
          reason: 'finished',
        })
      }
    }
  }

  private async speak(s: Session, text: string, token: number) {
    if (!s.running && !s.oneShotBusy) return
    if (token !== s.loopToken && s.running) return

    s.currentLine = text
    this.emitStatus(s)

    let buf: Buffer
    try {
      buf = await synthesizeEdgeTts(text, {
        voice: s.config.voice,
        rate: s.config.rate,
      })
    } catch (err) {
      logger.error(
        `[${s.accountId}] TTS 合成失败：`,
        err instanceof Error ? err : new Error(String(err)),
      )
      await sleep(800)
      return
    }

    if (s.running && token !== s.loopToken) return
    if (!s.running && !s.oneShotBusy) return

    const playId = randomUUID()
    s.currentPlayId = playId
    const payload: PlayRequest = {
      playId,
      accountId: s.accountId,
      mime: 'audio/mpeg',
      base64: buf.toString('base64'),
      volume: s.config.volume,
      outputDeviceId: s.config.outputDeviceId,
    }

    const playPromise = new Promise<void>((resolve, reject) => {
      this.playWaiters.set(playId, { accountId: s.accountId, resolve, reject })
      setTimeout(() => {
        if (this.playWaiters.has(playId)) {
          this.playWaiters.delete(playId)
          reject(new Error('播放超时'))
        }
      }, 120_000)
    })

    windowManager.send(IPC_CHANNELS.tasks.voiceBroadcast.playAudio, payload)

    try {
      await playPromise
    } catch {
      // 暂停/停止/打断/超时：忽略
    } finally {
      if (s.currentPlayId === playId) s.currentPlayId = null
    }
  }
}

function sleep(ms: number) {
  return new Promise<void>(resolve => setTimeout(resolve, ms))
}

export const voiceBroadcastService = new VoiceBroadcastService()
