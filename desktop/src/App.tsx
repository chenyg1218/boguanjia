import { useEffect } from 'react'
import { Outlet } from 'react-router'
import { IPC_CHANNELS } from 'shared/ipcChannels'
import { AccountPanel } from '@/components/common/AccountPanel'
import { LicenseAccountGuard } from '@/components/common/LicenseAccountGuard'
import LogDisplayer from '@/components/common/LogDisplayer'
import Sidebar from '@/components/common/Sidebar'
import { TaskStatusBar } from '@/components/common/TaskStatusBar'
import { Toaster } from '@/components/ui/toaster'
import { QuickStartDialog } from './components/onboarding/QuickStartDialog'
import { UpdateDialog } from './components/update/UpdateDialog'
import { useAccounts } from './hooks/useAccounts'
import { useAutoMessageStore } from './hooks/useAutoMessage'
import { useAutoPopUpStore } from './hooks/useAutoPopUp'
import { useAutoReply, useAutoReplyStore } from './hooks/useAutoReply'
import { useReplyTaskCommentListener } from './hooks/useCommentListener'
import { useChromeConfigStore } from './hooks/useChromeConfig'
import { useIpcListener } from './hooks/useIpc'
import { useLiveControlStore } from './hooks/useLiveControl'
import { useOnboardingStore } from './hooks/useOnboarding'
import { useToast } from './hooks/useToast'
import { useUpdateConfigStore, useUpdateStore } from './hooks/useUpdate'
import { useViewerAccountsStore } from './hooks/useViewerAccounts'
// 暂隐：直播话术 / 语音设置
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
    // 界面一律停掉；异常断连的 desired 仍保留，重连后由 tasksResumed 恢复
    useAutoReplyStore.getState().setIsRunning(accountId, false)
    useViewerAccountsStore.getState().clearRoomEntry()

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
      if (type === 'comment-listener') {
        setIsListening(accountId, 'listening')
        useAutoReplyStore.getState().setIsRunning(accountId, true)
      }
    }
    if (tasks.length > 0) {
      useOnboardingStore.getState().markStartedTaskOnce()
    }
    const name = useAccounts.getState().accounts.find(a => a.id === accountId)?.name
    toast.success(
      name ? `「${name}」已自动恢复 ${tasks.length} 个任务` : `已自动恢复 ${tasks.length} 个任务`,
    )
  })

  useIpcListener(IPC_CHANNELS.tasks.autoMessage.stoppedEvent, ({ accountId, reason }) => {
    setIsRunningAutoMessage(accountId, false)
    if (reason !== 'error' && reason !== 'live_ended') return
    const name = useAccounts.getState().accounts.find(a => a.id === accountId)?.name
    const prefix = name ? `「${name}」` : ''
    if (reason === 'live_ended') {
      toast.info(`${prefix}检测到直播已结束，自动发言已停止`)
      return
    }
    toast.error(`${prefix}自动发言已停止，可重新启动`)
  })

  useIpcListener(IPC_CHANNELS.tasks.autoPopUp.stoppedEvent, ({ accountId, reason }) => {
    setIsRunningAutoPopUp(accountId, false)
    if (reason !== 'error' && reason !== 'live_ended') return
    const name = useAccounts.getState().accounts.find(a => a.id === accountId)?.name
    const prefix = name ? `「${name}」` : ''
    if (reason === 'live_ended') {
      toast.info(`${prefix}检测到直播已结束，自动弹窗已停止`)
      return
    }
    toast.error(`${prefix}自动弹窗已停止，可重新启动`)
  })

  useIpcListener(IPC_CHANNELS.tasks.autoReply.listenerStopped, ({ accountId, reason }) => {
    // 异常停止标为 error，避免自动重试；手动/会话/停播仍为 stopped
    setIsListening(accountId, reason === 'error' ? 'error' : 'stopped')
    if (reason !== 'error' && reason !== 'live_ended') return
    const wasRunning = useAutoReplyStore.getState().contexts[accountId]?.isRunning === true
    useAutoReplyStore.getState().setIsRunning(accountId, false)
    if (!wasRunning) return
    const name = useAccounts.getState().accounts.find(a => a.id === accountId)?.name
    const prefix = name ? `「${name}」` : ''
    if (reason === 'live_ended') {
      toast.info(`${prefix}检测到直播已结束，自动回复已停止`)
      return
    }
    toast.error(`${prefix}评论监听已停止，自动回复已结束`)
  })

  useIpcListener(IPC_CHANNELS.tasks.viewerControl.disconnectedEvent, ({ accountId, reason }) => {
    const store = useViewerAccountsStore.getState()
    store.setConnected(accountId, 'disconnected')
    store.setRunning(accountId, false)
    const name = store.accounts.find(a => a.id === accountId)?.name
    const prefix = name ? `「${name}」` : ''
    if (reason === 'unexpected') {
      toast.error(`${prefix}互动号异常断开，请重新登录进房`)
    } else if (reason !== 'manual') {
      toast.error(`${prefix}互动号已断开`)
    }
  })

  useIpcListener(IPC_CHANNELS.tasks.viewerControl.progressEvent, ({ accountId, message }) => {
    useViewerAccountsStore.getState().setConnectHint(accountId, message)
  })

  useIpcListener(IPC_CHANNELS.tasks.viewerControl.roomReadyEvent, payload => {
    useViewerAccountsStore.getState().setRoomEntry({
      roomUrl: payload.roomUrl,
      roomId: payload.roomId,
      secUid: payload.secUid,
    })
  })

  useIpcListener(IPC_CHANNELS.tasks.viewerControl.roomClearedEvent, () => {
    useViewerAccountsStore.getState().clearRoomEntry()
  })

  useIpcListener(IPC_CHANNELS.tasks.viewerControl.notifyAccountName, params => {
    if (!params.ok) return
    const store = useViewerAccountsStore.getState()
    const nick = params.accountName?.trim()
    store.setAccountName(params.accountId, nick || '')
    // 登录成功后用平台昵称替换默认「互动号N」（用户自定义名不覆盖）
    if (!nick || nick === '观众号') return
    const current = store.accounts.find(a => a.id === params.accountId)?.name ?? ''
    if (!current || /^互动号\s*\d+$/.test(current.trim())) {
      store.updateAccount(params.accountId, { name: nick })
    }
  })

  useIpcListener(IPC_CHANNELS.tasks.viewerDanmaku.stoppedEvent, ({ accountId, reason }) => {
    const store = useViewerAccountsStore.getState()
    store.setRunning(accountId, false)
    store.setEntering(accountId, false)
    if (reason !== 'error') return
    const name = store.accounts.find(a => a.id === accountId)?.name
    const prefix = name ? `「${name}」` : ''
    toast.error(`${prefix}小号互动已停止，可重新启动`)
  })

  useIpcListener(IPC_CHANNELS.chrome.saveState, id => {
    // 登录态已由主进程加密落盘；清空 renderer 中可能残留的明文
    useChromeConfigStore.getState().clearStorageState(id)
  })

  useIpcListener(IPC_CHANNELS.tasks.liveControl.notifyAccountName, params => {
    if (params.ok) {
      setAccountName(params.accountId, params.accountName || '')
      // 新连上中控：清掉上一场残留的直播间展示，等开播检测再写入
      useViewerAccountsStore.getState().clearRoomEntry()
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

function useSyncLiveControlConnection() {
  const setIsConnected = useLiveControlStore(s => s.setIsConnected)
  const setAccountName = useLiveControlStore(s => s.setAccountName)

  useEffect(() => {
    let cancelled = false

    const sync = async () => {
      try {
        const connected = await window.ipcRenderer.invoke(
          IPC_CHANNELS.tasks.liveControl.listConnected,
        )
        if (cancelled || !Array.isArray(connected)) return

        const connectedIds = new Set(connected.map(c => c.accountId))
        const store = useLiveControlStore.getState()

        for (const { accountId, accountName } of connected) {
          const current = store.contexts[accountId]?.isConnected
          // 勿把「连接中」提前标成已连接（会话在 connect 完成前就会进 Map）
          if (current !== 'connecting') {
            setIsConnected(accountId, 'connected')
          }
          const existingName = store.contexts[accountId]?.accountName
          if (!existingName && accountName && accountName !== '未定义账号') {
            setAccountName(accountId, accountName)
          }
        }

        // 主进程已无会话的账号，渲染层若仍显示已连接则纠正（勿打断 connecting）
        for (const [accountId, ctx] of Object.entries(store.contexts)) {
          if (
            ctx.isConnected === 'connected' &&
            !connectedIds.has(accountId)
          ) {
            setIsConnected(accountId, 'disconnected')
          }
        }
      } catch {
        /* 启动阶段主进程未就绪时忽略 */
      }
    }

    const run = () => {
      void sync()
    }

    if (useLiveControlStore.persist.hasHydrated()) {
      run()
    }
    const unsub = useLiveControlStore.persist.onFinishHydration(run)
    // 连接完成后偶发状态不同步时再对齐一次
    const timer = window.setTimeout(run, 1500)

    return () => {
      cancelled = true
      unsub()
      window.clearTimeout(timer)
    }
  }, [setIsConnected, setAccountName])
}

/**
 * 启动后按需后台恢复互动号登录态并预热直播间。
 * 需在「小号互动」开启「启动时自动恢复」；无本地登录态或需重新扫码的号会跳过。
 */
function useAutoReconnectViewerAccounts() {
  useEffect(() => {
    let cancelled = false
    let ran = false

    const run = async () => {
      if (ran || cancelled) return
      if (!useViewerAccountsStore.persist.hasHydrated()) return
      if (!useChromeConfigStore.persist.hasHydrated()) return
      ran = true

      const { accounts, autoReconnectOnLaunch } = useViewerAccountsStore.getState()
      if (!autoReconnectOnLaunch || accounts.length === 0) return

      const midId = useAccounts.getState().currentAccountId
      const chrome = useChromeConfigStore.getState().contexts[midId] ?? { path: '', headless: false }
      const setConnected = useViewerAccountsStore.getState().setConnected

      for (const a of accounts) {
        const rt = useViewerAccountsStore.getState().runtime[a.id]
        if (rt?.isConnected === 'connected' || rt?.isConnected === 'connecting') continue
        setConnected(a.id, 'connecting')
      }

      try {
        const results = await window.ipcRenderer.invoke(
          IPC_CHANNELS.tasks.viewerControl.autoReconnect,
          {
            chromePath: chrome.path || undefined,
            headless: chrome.headless,
            accounts,
          },
        )
        if (cancelled || !Array.isArray(results)) return
        for (const r of results) {
          if (r.ok) {
            setConnected(r.accountId, 'connected')
          } else {
            setConnected(r.accountId, 'disconnected')
          }
        }
      } catch {
        for (const a of accounts) {
          const rt = useViewerAccountsStore.getState().runtime[a.id]
          if (rt?.isConnected === 'connecting') {
            setConnected(a.id, 'disconnected')
          }
        }
      }
    }

    const tryRun = () => {
      void run()
    }

    if (
      useViewerAccountsStore.persist.hasHydrated() &&
      useChromeConfigStore.persist.hasHydrated()
    ) {
      tryRun()
    }
    const unsubViewer = useViewerAccountsStore.persist.onFinishHydration(tryRun)
    const unsubChrome = useChromeConfigStore.persist.onFinishHydration(tryRun)
    const timer = window.setTimeout(tryRun, 800)

    return () => {
      cancelled = true
      unsubViewer()
      unsubChrome()
      window.clearTimeout(timer)
    }
  }, [])
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
  useSyncLiveControlConnection()
  useAutoReconnectViewerAccounts()
  useReplyTaskCommentListener()
  // 暂隐：直播话术 / 语音设置
  // useVoiceBroadcastPlayer()

  return (
    <>
      <div className="flex h-screen flex-col bg-gray-50">
        <div className="flex min-h-0 flex-1 overflow-hidden">
          <Sidebar />

          <div className="flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden">
            <TaskStatusBar />
            <main className="min-h-0 flex-1 overflow-y-auto px-8 pb-10 pt-6">
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
      <QuickStartDialog />
      <LicenseAccountGuard />
      <Toaster />
    </>
  )
}

export default App
