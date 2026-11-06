import { IPC_CHANNELS } from 'shared/ipcChannels'
import { maxViewerAccountsForPlan } from 'shared/licensePlan'
import { isLiveControlPlatform } from 'shared/platforms'
import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import { immer } from 'zustand/middleware/immer'
import { useLicense } from './useLicense'

type ConnectionStatus = 'connecting' | 'connected' | 'disconnected'

interface ViewerAccountRuntime {
  isConnected: ConnectionStatus
  accountName: string | null
  isRunning: boolean
  /** 正在进房（开始任务后、评论循环前） */
  isEntering: boolean
  /** 连接中的进度文案（等待扫码 / 等待进房） */
  connectHint: string | null
}

/** 稳定空对象，避免 selector 每次返回新引用导致 Maximum update depth */
const EMPTY_RUNTIME: ViewerAccountRuntime = {
  isConnected: 'disconnected',
  accountName: null,
  isRunning: false,
  isEntering: false,
  connectHint: null,
}

interface ViewerAccountsStore {
  accounts: ViewerAccount[]
  currentAccountId: string | null
  runtime: Record<string, ViewerAccountRuntime>
  /** 启动时是否自动恢复已保存登录态的互动号（默认关，避免一开应用就弹浏览器） */
  autoReconnectOnLaunch: boolean
  setAutoReconnectOnLaunch: (enabled: boolean) => void
  addAccount: (name: string, platform?: LiveControlPlatform) => string | null
  removeAccount: (id: string) => void
  switchAccount: (id: string) => void
  updateAccount: (
    id: string,
    patch: Partial<Pick<ViewerAccount, 'name' | 'platform'>>,
  ) => void
  setConnected: (id: string, status: ConnectionStatus) => void
  setConnectHint: (id: string, hint: string | null) => void
  setAccountName: (id: string, name: string | null) => void
  setRunning: (id: string, running: boolean) => void
  setEntering: (id: string, entering: boolean) => void
  stopAllRunning: () => void
  /** 各号共用的本场直播间链接（中控开播后自动缓存，非用户手填） */
  roomUrl: string
  roomId: string
  roomSecUid: string
  setRoomUrl: (url: string) => void
  setRoomEntry: (entry: { roomUrl?: string; roomId?: string; secUid?: string }) => void
  clearRoomEntry: () => void
}

function createRuntime(): ViewerAccountRuntime {
  return {
    isConnected: 'disconnected',
    accountName: null,
    isRunning: false,
    isEntering: false,
    connectHint: null,
  }
}

function normalizeAccount(raw: Partial<ViewerAccount> & { id: string; name: string }): ViewerAccount {
  return {
    id: raw.id,
    name: raw.name,
    platform: isLiveControlPlatform(raw.platform) ? raw.platform : 'douyin',
  }
}

export const useViewerAccountsStore = create<ViewerAccountsStore>()(
  persist(
    immer((set, get) => ({
      accounts: [],
      currentAccountId: null,
      runtime: {},
      autoReconnectOnLaunch: false,
      roomUrl: '',
      roomId: '',
      roomSecUid: '',

      setAutoReconnectOnLaunch: enabled => {
        set(state => {
          state.autoReconnectOnLaunch = enabled
        })
      },

      setRoomUrl: url => {
        set(state => {
          state.roomUrl = url.trim()
        })
      },

      setRoomEntry: entry => {
        set(state => {
          if (entry.roomUrl !== undefined) state.roomUrl = entry.roomUrl.trim()
          if (entry.roomId !== undefined) state.roomId = entry.roomId.trim()
          if (entry.secUid !== undefined) state.roomSecUid = entry.secUid.trim()
        })
      },

      clearRoomEntry: () => {
        set(state => {
          state.roomUrl = ''
          state.roomId = ''
          state.roomSecUid = ''
        })
      },

      addAccount: (name: string, platform: LiveControlPlatform = 'douyin') => {
        const plan = useLicense.getState().status.plan
        const max = maxViewerAccountsForPlan(plan)
        if (max >= 0 && get().accounts.length >= max) {
          return null
        }
        const id = crypto.randomUUID()
        set(state => {
          state.accounts.push({ id, name, platform })
          state.runtime[id] = createRuntime()
          state.currentAccountId = id
        })
        return id
      },

      removeAccount: (id: string) => {
        set(state => {
          state.accounts = state.accounts.filter(a => a.id !== id)
          delete state.runtime[id]
          if (state.currentAccountId === id) {
            state.currentAccountId = state.accounts[0]?.id ?? null
          }
        })
        void window.ipcRenderer
          .invoke(IPC_CHANNELS.tasks.viewerControl.disconnect, id)
          .catch(() => {})
        void window.ipcRenderer
          .invoke(IPC_CHANNELS.chrome.clearState, `viewer_${id}`)
          .catch(() => {})
      },

      switchAccount: (id: string) => {
        set(state => {
          if (state.accounts.some(a => a.id === id)) {
            state.currentAccountId = id
          }
        })
      },

      updateAccount: (id, patch) => {
        set(state => {
          const account = state.accounts.find(a => a.id === id)
          if (!account) return
          if (patch.name !== undefined) account.name = patch.name
          if (patch.platform !== undefined) account.platform = patch.platform
        })
      },

      setConnected: (id, status) => {
        set(state => {
          if (!state.runtime[id]) state.runtime[id] = createRuntime()
          state.runtime[id].isConnected = status
          if (status !== 'connecting') {
            state.runtime[id].connectHint = null
          }
          if (status === 'disconnected') {
            state.runtime[id].isRunning = false
            state.runtime[id].isEntering = false
          }
        })
      },

      setConnectHint: (id, hint) => {
        set(state => {
          if (!state.runtime[id]) state.runtime[id] = createRuntime()
          state.runtime[id].connectHint = hint
        })
      },

      setAccountName: (id, name) => {
        set(state => {
          if (!state.runtime[id]) state.runtime[id] = createRuntime()
          state.runtime[id].accountName = name
        })
      },

      setRunning: (id, running) => {
        set(state => {
          if (!state.runtime[id]) state.runtime[id] = createRuntime()
          state.runtime[id].isRunning = running
          if (running) {
            state.runtime[id].isEntering = false
            state.runtime[id].connectHint = null
          }
        })
      },

      setEntering: (id, entering) => {
        set(state => {
          if (!state.runtime[id]) state.runtime[id] = createRuntime()
          state.runtime[id].isEntering = entering
        })
      },

      stopAllRunning: () => {
        set(state => {
          for (const rt of Object.values(state.runtime)) {
            rt.isRunning = false
            rt.isEntering = false
          }
        })
      },
    })),
    {
      name: 'viewer-accounts-storage',
      version: 4,
      partialize: state => ({
        accounts: state.accounts,
        currentAccountId: state.currentAccountId,
        autoReconnectOnLaunch: state.autoReconnectOnLaunch,
        roomUrl: state.roomUrl,
        roomId: state.roomId,
        roomSecUid: state.roomSecUid,
      }),
      migrate: persisted => {
        const p = persisted as {
          accounts?: Array<Partial<ViewerAccount> & { id: string; name: string }>
          currentAccountId?: string | null
          autoReconnectOnLaunch?: boolean
          roomUrl?: string
          roomId?: string
          roomSecUid?: string
        }
        const accounts = (p.accounts ?? []).map(normalizeAccount)
        return {
          accounts,
          currentAccountId: p.currentAccountId ?? accounts[0]?.id ?? null,
          // 升级用户也默认关，避免启动弹窗；需要预热再手动打开
          autoReconnectOnLaunch: p.autoReconnectOnLaunch === true,
          roomUrl: typeof p.roomUrl === 'string' ? p.roomUrl : '',
          roomId: typeof p.roomId === 'string' ? p.roomId : '',
          roomSecUid: typeof p.roomSecUid === 'string' ? p.roomSecUid : '',
        }
      },
      merge: (persisted, current) => {
        const p = persisted as {
          accounts?: Array<Partial<ViewerAccount> & { id: string; name: string }>
          currentAccountId?: string | null
          autoReconnectOnLaunch?: boolean
          roomUrl?: string
          roomId?: string
          roomSecUid?: string
        }
        const accounts = (p.accounts ?? []).map(normalizeAccount)
        const runtime: Record<string, ViewerAccountRuntime> = {}
        for (const a of accounts) {
          runtime[a.id] = createRuntime()
        }
        return {
          ...current,
          accounts,
          currentAccountId: p.currentAccountId ?? accounts[0]?.id ?? null,
          autoReconnectOnLaunch: p.autoReconnectOnLaunch === true,
          roomUrl: typeof p.roomUrl === 'string' ? p.roomUrl : '',
          roomId: typeof p.roomId === 'string' ? p.roomId : '',
          roomSecUid: typeof p.roomSecUid === 'string' ? p.roomSecUid : '',
          runtime,
        }
      },
    },
  ),
)

export function useCurrentViewerAccount(): ViewerAccount | null {
  return useViewerAccountsStore(s => {
    const id = s.currentAccountId
    if (!id) return null
    return s.accounts.find(a => a.id === id) ?? null
  })
}

export function useCurrentViewerRuntime(): ViewerAccountRuntime {
  return useViewerAccountsStore(s => {
    const id = s.currentAccountId
    if (!id) return EMPTY_RUNTIME
    return s.runtime[id] ?? EMPTY_RUNTIME
  })
}
