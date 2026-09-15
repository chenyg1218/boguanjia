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
import { useUpdateConfigStore, useUpdateStore } from './hooks/useUpdate'
// v1.2 暂缓：语音读稿播放器
// import { useVoiceBroadcastPlayer } from './hooks/useVoiceBroadcast'
import './App.css'

function useGlobalIpcListener() {
  const { handleComment } = useAutoReply()
  const { setIsListening } = useAutoReplyStore()
  const { setIsConnected, setAccountName } = useLiveControlStore()
  const setIsRunningAutoMessage = useAutoMessageStore(s => s.setIsRunning)
  const setIsRunningAutoPopUp = useAutoPopUpStore(s => s.setIsRunning)
  const handleUpdate = useUpdateStore.use.handleUpdate()
  const handleAutoUpdate = useUpdateStore.use.handleAutoUpdate()
  const { toast } = useToast()

  useIpcListener(IPC_CHANNELS.tasks.autoReply.showComment, ({ comment, accountId }) => {
    handleComment(comment, accountId)
  })

  useIpcListener(IPC_CHANNELS.tasks.liveControl.disconnectedEvent, ({ accountId, reason }) => {
    setIsConnected(accountId, 'disconnected')
    setIsRunningAutoMessage(accountId, false)
    setIsRunningAutoPopUp(accountId, false)
    setIsListening(accountId, 'stopped')
    // 异常断连保留自动回复开关：监听恢复后可继续回复
    if (reason !== 'unexpected') {
      useAutoReplyStore.getState().setIsRunning(accountId, false)
    }

    const name = useAccounts.getState().accounts.find(a => a.id === accountId)?.name
    const prefix = name ? `「${name}」` : ''
    if (reason === 'license') {
      toast.error(`${prefix}授权变更，直播控制台已断开`)
    } else if (reason === 'unexpected') {
      toast.error(`${prefix}直播控制台异常断开，重新连接后将尝试恢复任务`)
    } else {
      toast.error(`${prefix}直播控制台已断开，可重新连接后继续`)
    }
  })

  useIpcListener(IPC_CHANNELS.tasks.liveControl.tasksResumedEvent, ({ accountId, tasks }) => {
    for (const type of tasks) {
      if (type === 'auto-comment') setIsRunningAutoMessage(accountId, true)
      if (type === 'auto-popup') setIsRunningAutoPopUp(accountId, true)
      if (type === 'comment-listener') setIsListening(accountId, 'listening')
    }
    const name = useAccounts.getState().accounts.find(a => a.id === accountId)?.name
    toast.success(
      name ? `「${name}」已自动恢复 ${tasks.length} 个任务` : `已自动恢复 ${tasks.length} 个任务`,
    )
  })

  useIpcListener(IPC_CHANNELS.tasks.autoMessage.stoppedEvent, ({ accountId, reason }) => {
    setIsRunningAutoMessage(accountId, false)
    if (reason !== 'error') return
    const name = useAccounts.getState().accounts.find(a => a.id === accountId)?.name
    toast.error(name ? `「${name}」自动发言已停止，可重新启动` : '自动发言已停止，可重新启动')
  })

  useIpcListener(IPC_CHANNELS.tasks.autoPopUp.stoppedEvent, ({ accountId, reason }) => {
    setIsRunningAutoPopUp(accountId, false)
    if (reason !== 'error') return
    const name = useAccounts.getState().accounts.find(a => a.id === accountId)?.name
    toast.error(name ? `「${name}」自动弹窗已停止，可重新启动` : '自动弹窗已停止，可重新启动')
  })

  useIpcListener(IPC_CHANNELS.tasks.autoReply.listenerStopped, ({ accountId }) => {
    setIsListening(accountId, 'stopped')
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

  // 启动检查到更新：按设置决定静默下载或弹窗提示
  useIpcListener(IPC_CHANNELS.app.notifyUpdate, info => {
    const { notifyEnabled, autoUpdate, getDownloadSource } = useUpdateConfigStore.getState()
    if (!notifyEnabled && !autoUpdate) {
      return
    }
    if (autoUpdate) {
      handleAutoUpdate(info, getDownloadSource())
      if (notifyEnabled) {
      toast.info(`发现新版本 v${info.latestVersion}，正在后台下载…`, {
          title: '软件更新',
        })
      }
      return
    }
    if (notifyEnabled) {
      handleUpdate(info)
    }
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
  // useVoiceBroadcastPlayer()

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
