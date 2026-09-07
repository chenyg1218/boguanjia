import { useEffect, useRef } from 'react'
import { IPC_CHANNELS } from 'shared/ipcChannels'
import { pickLicensedAccountIds } from 'shared/licensePlan'
import { useAccounts } from '@/hooks/useAccounts'
import { useAutoMessageStore } from '@/hooks/useAutoMessage'
import { useAutoPopUpStore } from '@/hooks/useAutoPopUp'
import { useAutoReplyStore } from '@/hooks/useAutoReply'
import { useLicense } from '@/hooks/useLicense'
import { useLiveControlStore } from '@/hooks/useLiveControl'
import { useToast } from '@/hooks/useToast'

/**
 * 按档位账号上限收敛：禁用超额账号（保留配置），并把白名单同步给主进程。
 */
export function LicenseAccountGuard() {
  const ready = useLicense(s => s.ready)
  const plan = useLicense(s => s.status.plan)
  const maxAccounts = useLicense(s => s.status.maxAccounts)
  const accounts = useAccounts(s => s.accounts)
  const currentAccountId = useAccounts(s => s.currentAccountId)
  const setAccountDisabled = useAccounts(s => s.setAccountDisabled)
  const switchAccount = useAccounts(s => s.switchAccount)
  const setMessageRunning = useAutoMessageStore(s => s.setIsRunning)
  const setPopupRunning = useAutoPopUpStore(s => s.setIsRunning)
  const setReplyRunning = useAutoReplyStore(s => s.setIsRunning)
  const setListening = useAutoReplyStore(s => s.setIsListening)
  const setConnected = useLiveControlStore(s => s.setIsConnected)
  const { toast } = useToast()
  const convergingRef = useRef(false)
  const lastKeyRef = useRef('')

  const accountIdsKey = accounts.map(a => a.id).join(',')
  const disabledKey = accounts.map(a => `${a.id}:${a.disabled ? 1 : 0}`).join(',')

  useEffect(() => {
    if (!ready) return

    const allowed = new Set(pickLicensedAccountIds(accounts, maxAccounts))
    const extrasToDisable = accounts.filter(a => a.id !== 'default' && !allowed.has(a.id) && !a.disabled)
    const toEnable = accounts.filter(a => allowed.has(a.id) && a.disabled)

    const key = `${plan}|${maxAccounts}|${accountIdsKey}|${[...allowed].join(',')}`
    void window.ipcRenderer
      .invoke(IPC_CHANNELS.license.syncAccounts, [...allowed])
      .catch(() => {})

    if (key === lastKeyRef.current && extrasToDisable.length === 0 && toEnable.length === 0) {
      return
    }
    lastKeyRef.current = key

    for (const acc of toEnable) {
      setAccountDisabled(acc.id, false)
    }

    if (extrasToDisable.length === 0) {
      if (currentAccountId !== 'default' && !allowed.has(currentAccountId)) {
        switchAccount('default')
      }
      return
    }

    if (convergingRef.current) return
    convergingRef.current = true

    void (async () => {
      for (const acc of extrasToDisable) {
        try {
          await window.ipcRenderer.invoke(IPC_CHANNELS.tasks.autoMessage.stop, acc.id)
        } catch {
          /* ignore */
        }
        try {
          await window.ipcRenderer.invoke(IPC_CHANNELS.tasks.autoPopUp.stop, acc.id)
        } catch {
          /* ignore */
        }
        try {
          await window.ipcRenderer.invoke(IPC_CHANNELS.tasks.autoReply.stopCommentListener, acc.id)
        } catch {
          /* ignore */
        }
        try {
          await window.ipcRenderer.invoke(IPC_CHANNELS.tasks.liveControl.disconnect, acc.id)
        } catch {
          /* ignore */
        }
        setMessageRunning(acc.id, false)
        setPopupRunning(acc.id, false)
        setReplyRunning(acc.id, false)
        setListening(acc.id, 'stopped')
        setConnected(acc.id, 'disconnected')
        setAccountDisabled(acc.id, true)
      }

      if (!allowed.has(currentAccountId)) {
        switchAccount('default')
      }

      const tip =
        maxAccounts <= 1
          ? '已降为基础版：多余账号已自动禁用（配置保留），开通专业版/旗舰版后按档位恢复'
          : `已按当前档位限制为 ${maxAccounts} 个账号：超额账号已禁用（配置保留）`
      toast.success(tip)
      convergingRef.current = false
    })()
  }, [
    ready,
    plan,
    maxAccounts,
    accountIdsKey,
    disabledKey,
    accounts,
    currentAccountId,
    setAccountDisabled,
    setConnected,
    setListening,
    setMessageRunning,
    setPopupRunning,
    setReplyRunning,
    switchAccount,
    toast,
  ])

  return null
}
