import { useEffect } from 'react'
import { Outlet } from 'react-router'
import { IPC_CHANNELS } from 'shared/ipcChannels'
import { AccountPanel } from '@/components/common/AccountPanel'
import { LicenseAccountGuard } from '@/components/common/LicenseAccountGuard'
import LogDisplayer from '@/components/common/LogDisplayer'
import Sidebar from '@/components/common/Sidebar'
import { TaskStatusBar } from '@/components/common/TaskStatusBar'
import { Toaster } from '@/components/ui/toaster'
import { UpdateDialog } from './components/update/UpdateDialog'
import { useAccounts } from './hooks/useAccounts'
import { useAutoMessageStore } from './hooks/useAutoMessage'
import { useAutoPopUpStore } from './hooks/useAutoPopUp'
import { useAutoReply, useAutoReplyStore } from './hooks/useAutoReply'
import { useChromeConfigStore } from './hooks/useChromeConfig'
import { useIpcListener } from './hooks/useIpc'
import { useLiveControlStore } from './hooks/useLiveControl'
import { useToast } from './hooks/useToast'
import { useUpdateStore } from './hooks/useUpdate'
import './App.css'

function useGlobalIpcListener() {
  const { handleComment } = useAutoReply()
  const { setIsListening } = useAutoReplyStore()
  const { setIsConnected, setAccountName } = useLiveControlStore()
  const setIsRunningAutoMessage = useAutoMessageStore(s => s.setIsRunning)
  const setIsRunningAutoPopUp = useAutoPopUpStore(s => s.setIsRunning)
  const handleUpdate = useUpdateStore.use.handleUpdate()
  const { toast } = useToast()

  useIpcListener(IPC_CHANNELS.tasks.autoReply.showComment, ({ comment, accountId }) => {
    handleComment(comment, accountId)
  })

  useIpcListener(IPC_CHANNELS.tasks.liveControl.disconnectedEvent, id => {
    setIsConnected(id, 'disconnected')
    const name = useAccounts.getState().accounts.find(a => a.id === id)?.name
    toast.error(
      name
        ? `「${name}」直播控制台已断开，可重新连接后继续`
        : '直播控制台已断开，可重新连接后继续',
    )
  })

  useIpcListener(IPC_CHANNELS.tasks.autoMessage.stoppedEvent, id => {
    setIsRunningAutoMessage(id, false)
    const name = useAccounts.getState().accounts.find(a => a.id === id)?.name
    toast.error(name ? `「${name}」自动发言已停止，可重新启动` : '自动发言已停止，可重新启动')
  })

  useIpcListener(IPC_CHANNELS.tasks.autoPopUp.stoppedEvent, id => {
    setIsRunningAutoPopUp(id, false)
    const name = useAccounts.getState().accounts.find(a => a.id === id)?.name
    toast.error(name ? `「${name}」自动弹窗已停止，可重新启动` : '自动弹窗已停止，可重新启动')
  })

  useIpcListener(IPC_CHANNELS.tasks.autoReply.listenerStopped, id => {
    setIsListening(id, 'stopped')
  })

  useIpcListener(IPC_CHANNELS.chrome.saveState, id => {
    // 登录态已由主进程加密落盘；清空 renderer 中可能残留的明文
    useChromeConfigStore.getState().clearStorageState(id)
  })

  useIpcListener(IPC_CHANNELS.tasks.liveControl.notifyAccountName, params => {
    if (params.ok) {
      setAccountName(params.accountId, params.accountName || '')
    }
  })

  // 强制更新：发现新版本后始终弹窗，不可跳过
  useIpcListener(IPC_CHANNELS.app.notifyUpdate, info => {
    handleUpdate(info)
  })
}

function App() {
  const { accounts, currentAccountId } = useAccounts()

  useEffect(() => {
    const account = accounts.find(acc => acc.id === currentAccountId)
    if (account) {
      window.ipcRenderer.invoke(IPC_CHANNELS.account.switch, { account })
    }
  }, [accounts, currentAccountId])

  useGlobalIpcListener()

  return (
    <>
      <div className="flex h-screen flex-col bg-gray-50">
        <div className="flex min-h-0 flex-1 overflow-hidden">
          <Sidebar />

          <div className="flex min-w-0 flex-1 flex-col overflow-hidden">
            <TaskStatusBar />
            <main className="flex-1 overflow-y-auto p-8">
              <Outlet />
            </main>
            <div className="h-[180px] shrink-0 border-t bg-white shadow-inner">
              <LogDisplayer />
            </div>
          </div>

          <AccountPanel />
        </div>
      </div>
      <UpdateDialog />
      <LicenseAccountGuard />
      <Toaster />
    </>
  )
}

export default App
