import { useEffect, useRef, useState } from 'react'
import { IPC_CHANNELS } from 'shared/ipcChannels'
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog'
import { useAccounts } from '@/hooks/useAccounts'
import { useAutoMessageStore } from '@/hooks/useAutoMessage'
import { useAutoPopUpStore } from '@/hooks/useAutoPopUp'
import { useAutoReplyStore } from '@/hooks/useAutoReply'
import { useLicense } from '@/hooks/useLicense'
import { useLiveControlStore } from '@/hooks/useLiveControl'
import { useToast } from '@/hooks/useToast'

/**
 * 专业版过期 / 未激活时：若本地账号多于 1 个，提示并收敛到默认账号。
 */
export function LicenseAccountGuard() {
  const ready = useLicense(s => s.ready)
  const isPro = useLicense(s => s.status.isPro)
  const accounts = useAccounts(s => s.accounts)
  const currentAccountId = useAccounts(s => s.currentAccountId)
  const removeAccount = useAccounts(s => s.removeAccount)
  const switchAccount = useAccounts(s => s.switchAccount)
  const setMessageRunning = useAutoMessageStore(s => s.setIsRunning)
  const setPopupRunning = useAutoPopUpStore(s => s.setIsRunning)
  const setReplyRunning = useAutoReplyStore(s => s.setIsRunning)
  const setListening = useAutoReplyStore(s => s.setIsListening)
  const setConnected = useLiveControlStore(s => s.setIsConnected)
  const { toast } = useToast()
  const [open, setOpen] = useState(false)
  const handledRef = useRef(false)

  const extras = accounts.filter(a => a.id !== 'default')
  const needConverge = ready && !isPro && extras.length > 0

  useEffect(() => {
    if (!needConverge) {
      handledRef.current = false
      setOpen(false)
      return
    }
    if (!handledRef.current) {
      setOpen(true)
    }
  }, [needConverge])

  const converge = async () => {
    handledRef.current = true
    setOpen(false)

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
      removeAccount(acc.id)
    }

    if (currentAccountId !== 'default') {
      switchAccount('default')
    }

    toast.success('已降为免费版：仅保留默认账号，多余账号配置已清除')
  }

  return (
    <AlertDialog open={open}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>专业版已失效</AlertDialogTitle>
          <AlertDialogDescription asChild>
            <div className="space-y-2 text-sm text-muted-foreground">
              <p>
                当前为免费版，仅支持 <strong>1 个账号</strong>
                。检测到还有 {extras.length} 个多余账号：
              </p>
              <ul className="list-disc list-inside">
                {extras.map(a => (
                  <li key={a.id}>{a.name}</li>
                ))}
              </ul>
              <p>
                确认后将断开这些账号的中控台与任务，并删除其本地配置；默认账号可继续使用。续充卡密后可再次添加多个账号。
              </p>
            </div>
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogAction onClick={() => void converge()}>仅保留默认账号</AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  )
}
