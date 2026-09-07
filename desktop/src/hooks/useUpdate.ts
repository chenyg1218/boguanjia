import { create } from 'zustand'
import { createJSONStorage, persist } from 'zustand/middleware'
import { IPC_CHANNELS } from 'shared/ipcChannels'
import { createSelectors } from '@/utils/zustand'

export type UpdateStatus =
  | 'idle' // 空闲
  | 'checking' // 通过 CDN 简单检查最新版本号
  | 'available' // 有可用更新 (已获取到信息，等待用户确认)
  | 'preparing' // 用户点击更新后，正在请求 Electron-Updater 确认链接
  | 'downloading' // 正在下载
  | 'ready' // 下载完成，等待重启
  | 'error' // 发生错误

export interface VersionState {
  currentVersion: string
  latestVersion: string
  releaseNote?: string
}

interface UpdateState {
  status: UpdateStatus
  versionInfo: VersionState | null
  progress: number
  error: ErrorType | null
  source: string
  /** 静默模式：后台下载，不强制弹窗 */
  silentMode: boolean
}

interface UpdateAction {
  checkUpdateManually: () => Promise<{ upToDate: boolean } | undefined>
  startDownload: (source: string) => void
  installUpdate: () => void
  setProgress: (progress: number) => void
  setStatus: (status: UpdateStatus) => void
  setSilentMode: (silentMode: boolean) => void
  reset: () => void
  handleError: (error: ErrorType) => void
  /** 有更新且仅弹窗提示（不自动下载） */
  handleUpdate: (info: VersionState) => void
  /** 静默自动下载 */
  handleAutoUpdate: (info: VersionState, source: string) => void
  setSource: (source: string) => void
}

type UpdateStore = UpdateState & UpdateAction

function resolveUpdateSource(source: string, customSource: string) {
  if (source === 'custom') {
    return customSource.trim() || 'gitee'
  }
  return source || 'gitee'
}

const useUpdateStoreBase = create<UpdateStore>()((set, get) => ({
  status: 'idle',
  versionInfo: null,
  progress: 0,
  error: null,
  source: 'gitee',
  silentMode: false,

  checkUpdateManually: async () => {
    set({ status: 'checking', error: null, silentMode: false })
    try {
      const result = await window.ipcRenderer.invoke(IPC_CHANNELS.updater.checkUpdate)
      if (result) {
        set({ status: 'available', versionInfo: result })
      } else {
        set({ status: 'idle' })
        return { upToDate: true }
      }
    } catch (e) {
      set({ status: 'error', error: { message: (e as Error).message || '检查更新失败' } })
    }
  },
  startDownload: (source: string) => {
    set({ status: 'preparing', error: null })
    window.ipcRenderer.invoke(IPC_CHANNELS.updater.startDownload, source)
  },
  installUpdate: () => {
    set({ status: 'ready' })
    window.ipcRenderer.invoke(IPC_CHANNELS.updater.quitAndInstall)
  },
  setStatus: (status: UpdateStatus) => set({ status }),
  setProgress: (progress: number) => set({ progress }),
  setSilentMode: (silentMode: boolean) => set({ silentMode }),
  reset: () =>
    set({ status: 'idle', progress: 0, versionInfo: null, error: null, silentMode: false }),
  handleError: (error: ErrorType) => {
    const { status, silentMode } = get()
    if (status === 'preparing' || status === 'downloading' || silentMode) {
      // 静默下载失败时退出静默，便于弹窗重试
      set({ status: 'error', error, silentMode: false })
    }
  },
  handleUpdate: (info: VersionState) => {
    if (get().status === 'idle' || get().status === 'checking') {
      set({ status: 'available', versionInfo: info, silentMode: false })
    }
  },
  handleAutoUpdate: (info: VersionState, source: string) => {
    const { status } = get()
    if (status !== 'idle' && status !== 'checking') {
      return
    }
    set({
      status: 'preparing',
      versionInfo: info,
      silentMode: true,
      error: null,
      progress: 0,
    })
    window.ipcRenderer.invoke(IPC_CHANNELS.updater.startDownload, source)
  },
  setSource: (source: string) => set({ source }),
}))

export const useUpdateStore = createSelectors(useUpdateStoreBase)

interface UpdateConfigStore {
  source: string
  customSource: string
  /** 有新版本时是否提示 */
  notifyEnabled: boolean
  /** 后台静默下载更新 */
  autoUpdate: boolean
  setSource: (source: string) => void
  setCustomSource: (customSource: string) => void
  setNotifyEnabled: (enabled: boolean) => void
  setAutoUpdate: (enabled: boolean) => void
  getDownloadSource: () => string
}

export const useUpdateConfigStore = create<UpdateConfigStore>()(
  persist(
    (set, get) => ({
      source: 'gitee',
      customSource: '',
      notifyEnabled: true,
      autoUpdate: true,
      setSource: source => set({ source }),
      setCustomSource: customSource => set({ customSource }),
      setNotifyEnabled: notifyEnabled => set({ notifyEnabled }),
      setAutoUpdate: autoUpdate => set({ autoUpdate }),
      getDownloadSource: () => resolveUpdateSource(get().source, get().customSource),
    }),
    {
      name: 'update-storage',
      version: 1,
      migrate: (persisted: unknown) => {
        const state = persisted as { source?: string } | null
        // 旧默认源 github → 国内默认 gitee（用户已选代理/自定义的不改）
        if (state && state.source === 'github') {
          state.source = 'gitee'
        }
        return state as UpdateConfigStore
      },
      storage: createJSONStorage(() => localStorage),
    },
  ),
)
