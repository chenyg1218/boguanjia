import { useEffect, useRef } from 'react'
import { IPC_CHANNELS } from 'shared/ipcChannels'
import { useAccounts } from '@/hooks/useAccounts'
import { useAutoMessageStore } from '@/hooks/useAutoMessage'
import { useAutoPopUpStore } from '@/hooks/useAutoPopUp'
import { useAutoReplyStore } from '@/hooks/useAutoReply'
import { useLicense } from '@/hooks/useLicense'
import { useLiveControlStore } from '@/hooks/useLiveControl'
import { useToast } from '@/hooks/useToast'

/**
 * 专业版过期 / 未激活时：自动禁用多余账号（保留配置与登录态），续费后自动恢复。
 * 主进程会同步拆掉多余会话；此处负责前端状态与软禁用。
 */
export function LicenseAccountGuard() {
  const ready = useLicense(s => s.ready)
  const isPro = useLicense(s => s.status.isPro)
  const accounts = useAccounts(s => s.accounts)
  const currentAccountId = useAccounts(s => s.currentAccountId)
  const setAccountDisabled = useAccounts(s => s.setAccountDisabled)
  const enableAllAccounts = useAccounts(s => s.enableAllAccounts)
  const switchAccount = useAccounts(s => s.switchAccount)
  const setMessageRunning = useAutoMessageStore(s => s.setIsRunning)
  const setPopupRunning = useAutoPopUpStore(s => s.setIsRunning)
  const setReplyRunning = useAutoReplyStore(s => s.setIsRunning)
  const setListening = useAutoReplyStore(s => s.setIsListening)
  const setConnected = useLiveControlStore(s => s.setIsConnected)
  const { toast } = useToast()
  const convergingRef = useRef(false)
  const handledRef = useRef(false)

  const activeExtras = accounts.filter(a => a.id !== 'default' && !a.disabled)
  const needConverge = ready && !isPro && activeExtras.length > 0
  const extraIdsKey = activeExtras.map(a => a.id).join(',')

  useEffect(() => {
    if (ready && isPro) {
      enableAllAccounts()
      handledRef.current = false
      convergingRef.current = false
    }
  }, [ready, isPro, enableAllAccounts])

  useEffect(() => {
    if (!needConverge || handledRef.current || convergingRef.current) return

    const extras = accounts.filter(a => a.id !== 'default' && !a.disabled)
    if (extras.length === 0) return

    convergingRef.current = true
    handledRef.current = true

    void (async () => {
      for (const acc of extras) {
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

      if (currentAccountId !== 'default') {
        switchAccount('default')
      }

      toast.success('已降为免费版：多余账号已自动禁用（配置与登录态保留），续费后自动恢复')
      convergingRef.current = false
    })()
  }, [
    needConverge,
    extraIdsKey,
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
