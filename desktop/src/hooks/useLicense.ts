import { useEffect } from 'react'
import { create } from 'zustand'
import { IPC_CHANNELS } from 'shared/ipcChannels'
import type { LicensePlan } from 'shared/licensePlan'
import { LICENSE_EXPIRED_HINT } from '@/constants/copy'
import { useIpcListener } from './useIpc'
import { useToast } from './useToast'

export interface LicenseStatus {
  isPro: boolean
  plan: LicensePlan
  expiresAt: string
  announcement: string
  machineId: string
  /** -1 表示无上限 */
  maxAccounts: number
}

interface LicenseStore {
  status: LicenseStatus
  warning?: string
  ready: boolean
  refresh: () => Promise<void>
  activate: (card: string) => Promise<{ ok: boolean; message: string }>
  applyRemote: (payload: { status: LicenseStatus; warning?: string }) => void
}

const defaultStatus: LicenseStatus = {
  isPro: false,
  plan: 'free',
  expiresAt: '',
  announcement:
    '购买卡密后在此激活；没到期再充，剩余天数会自动加上。\n卡密购买：https://www.zaofaka.com/links/1CD589E2',
  machineId: '',
  maxAccounts: 1,
}

export const useLicense = create<LicenseStore>(set => ({
  status: defaultStatus,
  warning: undefined,
  ready: false,

  applyRemote: payload => {
    set({
      status: payload.status,
      warning: payload.warning,
      ready: true,
    })
  },

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
  const applyRemote = useLicense(s => s.applyRemote)
  const { toast } = useToast()

  useEffect(() => {
    void refresh()
  }, [refresh])

  useIpcListener(IPC_CHANNELS.license.changed, payload => {
    const prev = useLicense.getState().status
    applyRemote(payload)
    if (prev.isPro && !payload.status.isPro) {
      toast.error(payload.warning || LICENSE_EXPIRED_HINT)
    } else if (
      prev.isPro &&
      payload.status.isPro &&
      prev.maxAccounts !== payload.status.maxAccounts
    ) {
      const next =
        payload.status.maxAccounts < 0
          ? '无上限'
          : `${payload.status.maxAccounts} 个`
      toast.success(`档位已更新：可用账号 ${next}`)
    }
  })
}
