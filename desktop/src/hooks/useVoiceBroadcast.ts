import { useMemoizedFn } from 'ahooks'
import { useEffect, useMemo, useRef } from 'react'
import { IPC_CHANNELS } from 'shared/ipcChannels'
import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import { immer } from 'zustand/middleware/immer'
import { useShallow } from 'zustand/react/shallow'
import { EVENTS, eventEmitter } from '@/utils/events'
import { useAccounts } from './useAccounts'
import { useIpcListener } from './useIpc'
import { useToast } from './useToast'

export type VoiceBroadcastConfig = {
  script: string
  voice: string
  rate: number
  volume: number
  outputDeviceId: string
  loop: boolean
  loopMode: 'sequential' | 'random'
  lineGapSec: [number, number]
  bookLoopGapSec: number
  timeAnnounce: {
    enable: boolean
    mode: 'fixed' | 'random'
    intervalSec: [number, number]
    includeElapsed: boolean
  }
}

type VoiceStatus = {
  running: boolean
  paused: boolean
  accountId: string | null
  currentLine: string
  startedAt: number | null
}

type VoiceContext = {
  config: VoiceBroadcastConfig
  status: VoiceStatus
}

const CHILD_VOICES = new Set(['zh-CN-XiaoshuangNeural', 'zh-CN-XiaoyouNeural'])

const defaultConfig = (): VoiceBroadcastConfig => ({
  script: '',
  voice: 'zh-CN-XiaoxiaoNeural',
  rate: 100,
  volume: 100,
  outputDeviceId: '',
  loop: true,
  loopMode: 'sequential',
  lineGapSec: [2, 4],
  bookLoopGapSec: 5,
  timeAnnounce: {
    enable: true,
    mode: 'random',
    intervalSec: [120, 180],
    includeElapsed: false,
  },
})

function sanitizeVoice(voice: string | undefined): string {
  if (!voice || CHILD_VOICES.has(voice)) return 'zh-CN-XiaoxiaoNeural'
  return voice
}

const defaultStatus = (): VoiceStatus => ({
  running: false,
  paused: false,
  accountId: null,
  currentLine: '',
  startedAt: null,
})

const defaultContext = (): VoiceContext => ({
  config: defaultConfig(),
  status: defaultStatus(),
})

interface VoiceBroadcastStore {
  contexts: Record<string, VoiceContext>
  setConfig: (accountId: string, config: Partial<VoiceBroadcastConfig>) => void
  setStatus: (status: VoiceStatus) => void
  clearRunning: (accountId?: string) => void
}

export const useVoiceBroadcastStore = create<VoiceBroadcastStore>()(
  persist(
    immer(set => {
      eventEmitter.on(EVENTS.ACCOUNT_REMOVED, (accountId: string) => {
        set(state => {
          delete state.contexts[accountId]
        })
        void window.ipcRenderer.invoke(IPC_CHANNELS.tasks.voiceBroadcast.stop, accountId)
      })

      const ensure = (state: VoiceBroadcastStore, accountId: string) => {
        if (!state.contexts[accountId]) {
          state.contexts[accountId] = defaultContext()
        }
        return state.contexts[accountId]
      }

      return {
        contexts: { default: defaultContext() },
        setConfig: (accountId, config) =>
          set(state => {
            const ctx = ensure(state, accountId)
            const nextVoice =
              config.voice !== undefined
                ? sanitizeVoice(config.voice)
                : sanitizeVoice(ctx.config.voice)
            ctx.config = {
              ...ctx.config,
              ...config,
              voice: nextVoice,
              timeAnnounce: {
                ...ctx.config.timeAnnounce,
                ...(config.timeAnnounce ?? {}),
              },
            }
          }),
        setStatus: status =>
          set(state => {
            const id = status.accountId
            if (!id) return
            ensure(state, id).status = { ...status, accountId: id }
          }),
        clearRunning: accountId =>
          set(state => {
            if (accountId && state.contexts[accountId]) {
              state.contexts[accountId].status = defaultStatus()
              return
            }
            for (const ctx of Object.values(state.contexts)) {
              ctx.status = defaultStatus()
            }
          }),
      }
    }),
    {
      name: 'voice-broadcast-storage',
      version: 3,
      partialize: state => ({
        contexts: Object.fromEntries(
          Object.entries(state.contexts).map(([id, ctx]) => [
            id,
            {
              config: { ...ctx.config, voice: sanitizeVoice(ctx.config.voice) },
              status: defaultStatus(),
            },
          ]),
        ),
      }),
      migrate: (persisted: unknown, version) => {
        const state = persisted as { contexts?: Record<string, VoiceContext> }
        if (!state?.contexts) return state
        for (const ctx of Object.values(state.contexts)) {
          if (!ctx?.config) continue
          if (version < 2) {
            ctx.config.voice = sanitizeVoice(ctx.config.voice)
          }
          if (version < 3) {
            if (!ctx.config.loopMode) ctx.config.loopMode = 'sequential'
            if (!ctx.config.lineGapSec) ctx.config.lineGapSec = [2, 4]
            if (ctx.config.bookLoopGapSec === undefined) ctx.config.bookLoopGapSec = 5
          }
        }
        return state
      },
    },
  ),
)

export function useCurrentVoiceBroadcast<T>(getter: (ctx: VoiceContext) => T): T {
  const currentAccountId = useAccounts(s => s.currentAccountId)
  const fallback = useRef(defaultContext())
  return useVoiceBroadcastStore(
    useShallow(state => getter(state.contexts[currentAccountId] ?? fallback.current)),
  )
}

export function useOtherAccountsVoiceRunningCount(): number {
  const currentAccountId = useAccounts(s => s.currentAccountId)
  return useVoiceBroadcastStore(
    useShallow(
      state =>
        Object.entries(state.contexts).filter(
          ([id, ctx]) => id !== currentAccountId && ctx.status.running,
        ).length,
    ),
  )
}

export function useVoiceBroadcastActions() {
  const currentAccountId = useAccounts(s => s.currentAccountId)
  const setConfig = useVoiceBroadcastStore(s => s.setConfig)
  const clearRunning = useVoiceBroadcastStore(s => s.clearRunning)
  const { toast } = useToast()

  const updateConfig = useMemoizedFn((partial: Partial<VoiceBroadcastConfig>) => {
    setConfig(currentAccountId, partial)
    const running = useVoiceBroadcastStore.getState().contexts[currentAccountId]?.status.running
    if (running) {
      void window.ipcRenderer.invoke(
        IPC_CHANNELS.tasks.voiceBroadcast.updateConfig,
        currentAccountId,
        partial,
      )
    }
  })

  const start = useMemoizedFn(async () => {
    const config =
      useVoiceBroadcastStore.getState().contexts[currentAccountId]?.config ?? defaultConfig()

    const result = await window.ipcRenderer.invoke(
      IPC_CHANNELS.tasks.voiceBroadcast.start,
      currentAccountId,
      config,
    )
    if (!result.ok) {
      toast.error(result.error || '启动读稿失败')
      return false
    }
    toast.success('读稿已启动（支持多账号并行）')
    if (result.warning) {
      toast.info(result.warning)
    }
    return true
  })

  const stop = useMemoizedFn(async () => {
    await window.ipcRenderer.invoke(IPC_CHANNELS.tasks.voiceBroadcast.stop, currentAccountId)
    clearRunning(currentAccountId)
    toast.info('读稿已停止')
  })

  const pause = useMemoizedFn(async () => {
    await window.ipcRenderer.invoke(IPC_CHANNELS.tasks.voiceBroadcast.pause, currentAccountId)
  })

  const resume = useMemoizedFn(async () => {
    await window.ipcRenderer.invoke(IPC_CHANNELS.tasks.voiceBroadcast.resume, currentAccountId)
  })

  const insert = useMemoizedFn(async (text: string, interrupt = true) => {
    const result = await window.ipcRenderer.invoke(
      IPC_CHANNELS.tasks.voiceBroadcast.insert,
      currentAccountId,
      text,
      interrupt,
    )
    if (!result.ok) {
      toast.error(result.error || '插播失败')
      return false
    }
    toast.success(interrupt ? '已打断并插播' : '已加入插播队列')
    return true
  })

  return useMemo(
    () => ({ updateConfig, start, stop, pause, resume, insert }),
    [updateConfig, start, stop, pause, resume, insert],
  )
}

/** 全局：按账号分路播放，互不打断 */
export function useVoiceBroadcastPlayer() {
  const audiosRef = useRef(new Map<string, HTMLAudioElement>())
  const setStatus = useVoiceBroadcastStore(s => s.setStatus)
  const clearRunning = useVoiceBroadcastStore(s => s.clearRunning)

  useEffect(() => {
    void window.ipcRenderer.invoke(IPC_CHANNELS.tasks.voiceBroadcast.getAllStatuses).then(list => {
      for (const status of list) {
        if (status.accountId) setStatus(status)
      }
    })
  }, [setStatus])

  useIpcListener(IPC_CHANNELS.tasks.voiceBroadcast.status, status => {
    setStatus(status)
  })

  useIpcListener(IPC_CHANNELS.tasks.voiceBroadcast.stoppedEvent, payload => {
    clearRunning(payload.accountId)
    const audio = audiosRef.current.get(payload.accountId)
    if (audio) {
      audio.pause()
      audio.src = ''
      audiosRef.current.delete(payload.accountId)
    }
  })

  useIpcListener(IPC_CHANNELS.tasks.voiceBroadcast.playAudio, async payload => {
    const { playId, accountId, mime, base64, volume, outputDeviceId } = payload
    try {
      const prev = audiosRef.current.get(accountId)
      if (prev) {
        prev.pause()
        prev.src = ''
        audiosRef.current.delete(accountId)
      }

      const audio = new Audio(`data:${mime};base64,${base64}`)
      audiosRef.current.set(accountId, audio)
      audio.volume = Math.min(1, Math.max(0, volume / 100))
      if (outputDeviceId && 'setSinkId' in audio) {
        try {
          await (
            audio as HTMLAudioElement & { setSinkId: (id: string) => Promise<void> }
          ).setSinkId(outputDeviceId)
        } catch {
          // 设备不可用时回退默认输出
        }
      }
      await new Promise<void>((resolve, reject) => {
        audio.onended = () => resolve()
        audio.onerror = () => reject(new Error('音频播放失败'))
        void audio.play().catch(reject)
      })
      if (audiosRef.current.get(accountId) === audio) {
        audiosRef.current.delete(accountId)
      }
      await window.ipcRenderer.invoke(IPC_CHANNELS.tasks.voiceBroadcast.playDone, playId)
    } catch (err) {
      audiosRef.current.delete(accountId)
      const msg = err instanceof Error ? err.message : String(err)
      await window.ipcRenderer.invoke(IPC_CHANNELS.tasks.voiceBroadcast.playDone, playId, msg)
    }
  })
}
