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
  boundPlatform: string
  platformEverBound: boolean
  platformLocked: boolean
  needsPlatformBindConfirm: boolean
}

interface LicenseStore {
  status: LicenseStatus
  warning?: string
  ready: boolean
  refresh: () => Promise<void>
  activate: (card: string) => Promise<{ ok: boolean; message: string }>
  confirmPlatformBind: (
    platform: LiveControlPlatform,
  ) => Promise<{ ok: boolean; message: string }>
  migrateLegacyPlatform: (
    accountId: string,
    platform: LiveControlPlatform,
  ) => Promise<{ ok: boolean; message: string }>
  applyRemote: (payload: { status: LicenseStatus; warning?: string }) => void
}

const defaultStatus: LicenseStatus = {
  isPro: false,
  plan: 'free',
  expiresAt: '',
  announcement:
    '已有卡密可在此激活；没到期再充，剩余天数会自动加上。基础版 单平台 · 1个账号，专业版 单平台 · 3个账号，旗舰版账号与平台均不限。',
  machineId: '',
  maxAccounts: 1,
  boundPlatform: '',
  platformEverBound: false,
  platformLocked: true,
  needsPlatformBindConfirm: true,
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

  confirmPlatformBind: async platform => {
    try {
      const result = await window.ipcRenderer.invoke(
        IPC_CHANNELS.license.confirmPlatformBind,
        platform,
      )
      set({ status: result.status })
      return { ok: result.ok, message: result.message }
    } catch (err) {
      return {
        ok: false,
        message: err instanceof Error ? err.message : '绑定平台失败',
      }
    }
  },

  migrateLegacyPlatform: async (accountId, platform) => {
    try {
      const result = await window.ipcRenderer.invoke(
        IPC_CHANNELS.license.migrateLegacyPlatform,
        accountId,
        platform,
      )
      set({ status: result.status })
      return { ok: result.ok, message: result.message }
    } catch {
      return { ok: false, message: '迁移失败' }
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
