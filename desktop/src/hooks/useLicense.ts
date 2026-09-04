import { useEffect } from 'react'
import { create } from 'zustand'
import { IPC_CHANNELS } from 'shared/ipcChannels'

export interface LicenseStatus {
  isPro: boolean
  expiresAt: string
  announcement: string
  machineId: string
  maxAccounts: number
}

interface LicenseStore {
  status: LicenseStatus
  warning?: string
  ready: boolean
  refresh: () => Promise<void>
  activate: (card: string) => Promise<{ ok: boolean; message: string }>
}

const defaultStatus: LicenseStatus = {
  isPro: false,
  expiresAt: '',
  announcement:
    '购买卡密后在此激活；未到期续充将叠加剩余时长。\n卡密购买：https://www.zaofaka.com/links/1CD589E2',
  machineId: '',
  maxAccounts: 1,
}

export const useLicense = create<LicenseStore>((set, get) => ({
  status: defaultStatus,
  warning: undefined,
  ready: false,

  refresh: async () => {
    try {
      const synced = await window.ipcRenderer.invoke(IPC_CHANNELS.license.sync)
      set({
        status: synced.status,
        warning: synced.warning,
        ready: true,
      })
    } catch {
      try {
        const status = await window.ipcRenderer.invoke(IPC_CHANNELS.license.status)
        set({ status, ready: true })
      } catch {
        set({ ready: true })
      }
    }
  },

  activate: async (card: string) => {
    try {
      const result = await window.ipcRenderer.invoke(IPC_CHANNELS.license.activate, card)
      set({ status: result.status, warning: undefined })
      return { ok: result.ok, message: result.message }
    } catch (err) {
      const message =
        err instanceof Error && /fetch failed|network|ECONN|ETIMEDOUT|ENOTFOUND/i.test(err.message)
          ? '无法连接授权服务器，请检查网络后重试'
          : err instanceof Error
            ? err.message
            : '激活失败'
      return { ok: false, message }
    }
  },
}))

export function useLicenseBootstrap() {
  const refresh = useLicense(s => s.refresh)
  useEffect(() => {
    void refresh()
  }, [refresh])
}
