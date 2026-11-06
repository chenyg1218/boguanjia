import { useMemoizedFn } from 'ahooks'
import { ChevronDown, CircleAlert, Copy, Loader2, Plus, Trash2 } from 'lucide-react'
import { useEffect, useMemo, useRef, useState } from 'react'
import { IPC_CHANNELS } from 'shared/ipcChannels'
import { maxViewerAccountsForPlan, planDisplayName } from 'shared/licensePlan'
import { PLATFORM_NAMES } from 'shared/platforms'
import { ConnectRequiredEmpty } from '@/components/common/ConnectRequiredEmpty'
import { Title } from '@/components/common/Title'
import { CarbonPlayFilledAlt, CarbonStopFilledAlt } from '@/components/icons/carbon'
import {
  FeatureSetupWizard,
  FeatureWizardTrigger,
} from '@/components/onboarding/FeatureSetupWizard'
import { WizardHighlight } from '@/components/onboarding/WizardTarget'
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { Checkbox } from '@/components/ui/checkbox'
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Switch } from '@/components/ui/switch'
import { useAccounts } from '@/hooks/useAccounts'
import { useChromeConfigStore } from '@/hooks/useChromeConfig'
import { useLicense } from '@/hooks/useLicense'
import { useLiveControlStore } from '@/hooks/useLiveControl'
import { useToast } from '@/hooks/useToast'
import { useCurrentViewerAccount, useViewerAccountsStore } from '@/hooks/useViewerAccounts'
import {
  getViewerDanmakuConfig,
  staggerDelayMs,
  toViewerDanmakuTaskConfig,
  useCurrentViewerDanmakuConfig,
  useViewerDanmakuActions,
  useViewerDanmakuStore,
} from '@/hooks/useViewerDanmaku'
import { cn } from '@/lib/utils'
import ScriptLibrary from './components/ScriptLibrary'
import { VIEWER_DANMAKU_WIZARD_STEPS } from './wizardSteps'

function sleep(ms: number) {
  return new Promise<void>(resolve => setTimeout(resolve, ms))
}

/** 默认名：互动号1、互动号2…（跳过已占用序号） */
function nextViewerDefaultName(accounts: { name: string }[]): string {
  const used = new Set<number>()
  for (const a of accounts) {
    const m = /^互动号\s*(\d+)$/.exec(a.name.trim())
    if (m) used.add(Number(m[1]))
  }
  let n = 1
  while (used.has(n)) n++
  return `互动号${n}`
}

export default function ViewerDanmakuPage() {
  const plan = useLicense(s => s.status.plan)
  const maxViewers = maxViewerAccountsForPlan(plan)
  // 与 AccountPanel / TaskStatusBar 同一数据源：按当前中控账号直接读 store，避免中间层漏更新
  const midAccountId = useAccounts(s => s.currentAccountId)
  const midPlatform = useLiveControlStore(s => s.contexts[midAccountId]?.platform ?? 'buyin')
  const isConnected = useLiveControlStore(
    s => s.contexts[midAccountId]?.isConnected ?? 'disconnected',
  )
  const [showSettingsPreview, setShowSettingsPreview] = useState(false)
  const [riskTipOpen, setRiskTipOpen] = useState(false)
  // 与「自动发言」一致：中控已连接即可进入配置界面
  const showContent = isConnected === 'connected' || showSettingsPreview
  const midConnected = isConnected === 'connected'

  const accounts = useViewerAccountsStore(s => s.accounts)
  const currentId = useViewerAccountsStore(s => s.currentAccountId)
  const runtimeMap = useViewerAccountsStore(s => s.runtime)
  const autoReconnectOnLaunch = useViewerAccountsStore(s => s.autoReconnectOnLaunch)
  const setAutoReconnectOnLaunch = useViewerAccountsStore(s => s.setAutoReconnectOnLaunch)
  const addAccount = useViewerAccountsStore(s => s.addAccount)
  const removeAccount = useViewerAccountsStore(s => s.removeAccount)
  const switchAccount = useViewerAccountsStore(s => s.switchAccount)
  const updateAccount = useViewerAccountsStore(s => s.updateAccount)
  const setConnected = useViewerAccountsStore(s => s.setConnected)
  const setRunning = useViewerAccountsStore(s => s.setRunning)
  const setEntering = useViewerAccountsStore(s => s.setEntering)
  const stopAllRunning = useViewerAccountsStore(s => s.stopAllRunning)
  const setRoomEntry = useViewerAccountsStore(s => s.setRoomEntry)

  const ensureContext = useViewerDanmakuStore(s => s.ensureContext)
  const removeContext = useViewerDanmakuStore(s => s.removeContext)

  const account = useCurrentViewerAccount()
  const config = useCurrentViewerDanmakuConfig()
  const {
    setScheduler,
    setRandom,
    setExtraSpaces,
    addMessage,
    updateMessage,
    removeMessage,
    copyConfigTo,
  } = useViewerDanmakuActions()

  const { toast } = useToast()
  const [busy, setBusy] = useState(false)
  /** 递增以取消进行中的「开始全部」流程（含同步直播间） */
  const startGenRef = useRef(0)
  const [copySourceId, setCopySourceId] = useState<string | null>(null)
  const [copyTargetIds, setCopyTargetIds] = useState<string[]>([])
  const chromePath = useChromeConfigStore(s => s.contexts.default?.path ?? '')
  const headless = false

  const copySourceAccount = useMemo(
    () => accounts.find(a => a.id === copySourceId) ?? null,
    [accounts, copySourceId],
  )
  const copyTargets = useMemo(
    () => accounts.filter(a => a.id !== copySourceId),
    [accounts, copySourceId],
  )
  const isCopyDialogOpen = copySourceId !== null

  // 切换/新增号时确保有独立配置
  useEffect(() => {
    if (currentId) ensureContext(currentId)
  }, [currentId, ensureContext])

  useEffect(() => {
    for (const a of accounts) {
      ensureContext(a.id)
    }
  }, [accounts, ensureContext])

  // 未登录小号跟随中控台当前平台；已登录后保持各自平台
  useEffect(() => {
    if (!midPlatform) return
    for (const a of accounts) {
      const status = runtimeMap[a.id]?.isConnected
      if (status === 'disconnected' && a.platform !== midPlatform) {
        updateAccount(a.id, { platform: midPlatform })
      }
    }
  }, [midPlatform, accounts, runtimeMap, updateAccount])

  const connectedReady = accounts.filter(a => runtimeMap[a.id]?.isConnected === 'connected')
  const anyRunning = accounts.some(a => runtimeMap[a.id]?.isRunning)
  const anyEntering = accounts.some(a => runtimeMap[a.id]?.isEntering)
  /** 进房中、任务运行中，或正在同步中控链接：按钮显示「停止」且可点 */
  const anyActive = anyRunning || anyEntering
  const showStop = anyActive || busy
  const canStart = midConnected && connectedReady.length > 0
  const canCopyConfig = accounts.length >= 2

  const loginAccount = useMemoizedFn(async (accountId: string) => {
    const acc = useViewerAccountsStore.getState().accounts.find(a => a.id === accountId)
    if (!acc) return false
    toast.info('请在弹出的浏览器窗口中扫码登录')
    setConnected(accountId, 'connecting')
    try {
      const result = await window.ipcRenderer.invoke(IPC_CHANNELS.tasks.viewerControl.connect, {
        chromePath: chromePath || undefined,
        headless,
        account: acc,
      })
      if (result.ok) {
        setConnected(accountId, 'connected')
        toast.success('登录成功。可先配话术，直播间开播后再点「开始任务」')
        return true
      }
      setConnected(accountId, 'disconnected')
      toast.error(result.error || '登录失败')
      return false
    } catch (e) {
      setConnected(accountId, 'disconnected')
      toast.error(e instanceof Error ? e.message : '登录失败')
      return false
    }
  })

  const handleAddAccount = useMemoizedFn(() => {
    const copyFrom = currentId
    const id = addAccount(nextViewerDefaultName(accounts), midPlatform || 'douyin')
    if (!id) {
      toast.error(`${planDisplayName(plan)}最多 ${maxViewers} 个互动号`)
      return
    }
    ensureContext(id, copyFrom)
    switchAccount(id)
  })

  const handleRemove = useMemoizedFn((id: string) => {
    removeAccount(id)
    removeContext(id)
  })

  const handleDisconnect = useMemoizedFn(async (accountId: string) => {
    await window.ipcRenderer.invoke(IPC_CHANNELS.tasks.viewerControl.disconnect, accountId)
    setConnected(accountId, 'disconnected')
    setRunning(accountId, false)
  })

  const handleStartAll = useMemoizedFn(async () => {
    if (!midConnected) {
      toast.error('请先连接中控台，并确保直播间已开播后再开始任务')
      return
    }
    if (connectedReady.length === 0) {
      toast.error('请先添加互动号并登录')
      return
    }

    const gen = ++startGenRef.current
    setBusy(true)
    try {
      // 以主进程缓存为准，避免本地残留过期 roomId/链接
      let roomOptions: { roomUrl: string; roomId?: string; secUid?: string }
      const cached = await window.ipcRenderer.invoke(
        IPC_CHANNELS.tasks.viewerControl.getCachedRoom,
      )
      if (gen !== startGenRef.current) return

      if (cached.ok && cached.roomUrl) {
        roomOptions = {
          roomUrl: cached.roomUrl,
          roomId: cached.roomId,
          secUid: cached.secUid,
        }
        setRoomEntry(roomOptions)
      } else {
        toast.info('正在获取本场直播间…')
        const helperViewerId = connectedReady[0]?.id
        const roomResult = await window.ipcRenderer.invoke(
          IPC_CHANNELS.tasks.viewerControl.resolveRoomUrl,
          midAccountId,
          helperViewerId,
        )
        if (gen !== startGenRef.current) return
        if (!roomResult.ok) {
          toast.error(roomResult.error || '无法获取直播间链接，请确认已开播')
          return
        }
        roomOptions = {
          roomUrl: roomResult.roomUrl,
          roomId: roomResult.roomId,
          secUid: roomResult.secUid,
        }
        setRoomEntry(roomOptions)
      }

      toast.info('正在进房…')

      let started = 0
      let skippedEmpty = 0
      let failed = 0
      let cancelled = 0

      // 并行进房：二号起错开约 0.3～0.5s
      const jobs: Promise<void>[] = []
      let launchIndex = 0
      for (const a of connectedReady) {
        if (gen !== startGenRef.current) {
          cancelled++
          break
        }
        if (runtimeMap[a.id]?.isRunning) {
          started++
          continue
        }
        const cfg = getViewerDanmakuConfig(a.id)
        const taskConfig = toViewerDanmakuTaskConfig(cfg)
        if (taskConfig.messages.length === 0) {
          skippedEmpty++
          continue
        }
        const i = launchIndex++
        setEntering(a.id, true)
        jobs.push(
          (async () => {
            await sleep(i === 0 ? 0 : 300 + staggerDelayMs(i, 200))
            if (gen !== startGenRef.current) {
              setEntering(a.id, false)
              cancelled++
              return
            }
            // 启动前再读一次缓存（开播检测可能刚完成）
            const latest = await window.ipcRenderer.invoke(
              IPC_CHANNELS.tasks.viewerControl.getCachedRoom,
            )
            const startOptions =
              latest.ok && latest.roomUrl
                ? {
                    roomUrl: latest.roomUrl,
                    roomId: latest.roomId,
                    secUid: latest.secUid,
                  }
                : roomOptions
            const result = await window.ipcRenderer.invoke(
              IPC_CHANNELS.tasks.viewerDanmaku.start,
              a.id,
              taskConfig,
              startOptions,
            )
            if (gen !== startGenRef.current) {
              cancelled++
              return
            }
            if (result.ok) {
              setRunning(a.id, true)
              started++
            } else {
              setEntering(a.id, false)
              const err = result.error || '启动失败'
              if (/操作已取消|已取消/.test(err)) {
                cancelled++
                return
              }
              failed++
              toast.error(`「${a.name}」${err}`)
            }
          })(),
        )
      }
      if (jobs.length) await Promise.all(jobs)

      if (gen !== startGenRef.current) return
      const parts: string[] = []
      if (started) parts.push(`已启动 ${started} 个`)
      if (skippedEmpty) parts.push(`跳过 ${skippedEmpty} 个（无话术）`)
      if (failed) parts.push(`失败 ${failed} 个`)
      if (cancelled && !started) parts.push('已取消')
      if (parts.length) toast.success(parts.join('，'))
      else toast.error('没有可启动的互动号')
    } finally {
      if (gen === startGenRef.current) {
        setBusy(false)
        for (const a of connectedReady) {
          const rt = useViewerAccountsStore.getState().runtime[a.id]
          if (rt?.isEntering && !rt.isRunning) setEntering(a.id, false)
        }
      }
    }
  })

  const handleStopAll = useMemoizedFn(async () => {
    startGenRef.current++
    stopAllRunning()
    setBusy(false)
    await window.ipcRenderer.invoke(IPC_CHANNELS.tasks.viewerDanmaku.stopAll)
    toast.success('已全部停止')
  })

  const handleIntervalChange = useMemoizedFn((index: 0 | 1, value: string) => {
    const numValue = Number(value) * 1000
    if (!Number.isFinite(numValue) || numValue < 3000) return
    setScheduler({
      interval:
        index === 0
          ? [numValue, Math.max(numValue, config.scheduler.interval[1])]
          : [Math.min(config.scheduler.interval[0], numValue), numValue],
    })
  })

  const openCopyDialog = useMemoizedFn((accountId: string) => {
    const targets = accounts.filter(a => a.id !== accountId)
    if (targets.length === 0) {
      toast.error('请先添加其他互动号，再复制配置')
      return
    }
    setCopySourceId(accountId)
    setCopyTargetIds(targets.length === 1 ? [targets[0].id] : [])
  })

  const handleCopyDialogOpenChange = useMemoizedFn((open: boolean) => {
    if (!open) {
      setCopySourceId(null)
      setCopyTargetIds([])
    }
  })

  const toggleCopyTarget = useMemoizedFn((accountId: string, checked: boolean) => {
    setCopyTargetIds(prev =>
      checked ? [...new Set([...prev, accountId])] : prev.filter(id => id !== accountId),
    )
  })

  const handleCopyConfig = useMemoizedFn(() => {
    if (!copySourceAccount) return
    if (copyTargetIds.length === 0) {
      toast.error('请至少选择一个目标互动号')
      return
    }
    copyConfigTo(copySourceAccount.id, copyTargetIds)
    const targetNames = accounts
      .filter(a => copyTargetIds.includes(a.id))
      .map(a => a.name)
      .join('、')
    handleCopyDialogOpenChange(false)
    toast.success(`已将「${copySourceAccount.name}」的话术与设置复制到「${targetNames}」`)
  })

  return (
    <FeatureSetupWizard
      wizardId="viewer-danmaku"
      title="小号互动设置向导"
      steps={VIEWER_DANMAKU_WIZARD_STEPS}
      autoOpen={showContent}
    >
      <div className="container py-8 space-y-4">
        <div className="flex items-center justify-between gap-4">
          <div className="min-w-0 flex-1 space-y-3">
            <Title
              title="小号互动"
              description="目前仅支持抖音 / 百应。用观众号进直播间发评论暖场：添加并登录互动号、配好话术后，中控开播再点「开始任务」。使用前请先查看下方风险提示。"
            />
            {showContent ? (
              <FeatureWizardTrigger
                wizardId="viewer-danmaku"
                stepCount={VIEWER_DANMAKU_WIZARD_STEPS.length}
              />
            ) : null}
          </div>
          <WizardHighlight targetId="viewer-danmaku-start" className="shrink-0">
            <Button
              className="min-w-[7.5rem]"
              variant={showStop ? 'destructive' : 'default'}
              disabled={!showStop && !canStart}
              title={
                showStop
                  ? '点击停止'
                  : !midConnected
                    ? '请先连接直播控制台'
                    : connectedReady.length === 0
                      ? '请先登录互动号'
                      : undefined
              }
              onClick={() => {
                if (showStop) void handleStopAll()
                else void handleStartAll()
              }}
            >
              {busy && !anyActive ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
              {showStop ? (
                <>
                  <CarbonStopFilledAlt className="mr-2 h-4 w-4" />
                  停止任务
                </>
              ) : (
                <>
                  <CarbonPlayFilledAlt className="mr-2 h-4 w-4" />
                  开始任务
                </>
              )}
            </Button>
          </WizardHighlight>
        </div>

        <Alert>
          <CircleAlert className="!text-red-600" />
          <Collapsible open={riskTipOpen} onOpenChange={setRiskTipOpen} className="col-start-2 min-w-0">
            <CollapsibleTrigger className="flex w-full items-center gap-1 text-left outline-none">
              <AlertTitle className="mb-0 text-red-600">互动号风险提示</AlertTitle>
              <ChevronDown
                className={cn(
                  'h-3.5 w-3.5 shrink-0 text-red-600 transition-transform',
                  riskTipOpen && 'rotate-180',
                )}
              />
            </CollapsibleTrigger>
            <CollapsibleContent>
              <AlertDescription className="pt-1.5">
                <p>
                  多号自动进房发评可能被平台判定为异常互动，互动号存在限言、验证码、禁言甚至封号风险。
                  非必要请勿使用；继续使用即视为自行承担相关风险。
                </p>
                <p>若仍使用：间隔建议 60～120 秒、少开号、话术勿雷同，下播后立刻停止。</p>
              </AlertDescription>
            </CollapsibleContent>
          </Collapsible>
        </Alert>

        {!showContent ? (
          <ConnectRequiredEmpty
            settingsLabel="查看小号互动设置"
            onViewSettings={() => setShowSettingsPreview(true)}
          />
        ) : (
          <div className="grid gap-6">
            <WizardHighlight targetId="viewer-danmaku-accounts">
              <Card>
                <CardContent className="pt-6 space-y-3">
                  <div className="flex items-center justify-between gap-3">
                    <div className="min-w-0 space-y-1">
                      <Label>
                        互动号
                        <span className="ml-2 tabular-nums text-foreground/80 font-normal">
                          {accounts.length}/{maxViewers < 0 ? '∞' : maxViewers}
                        </span>
                      </Label>
                      <p className="text-sm text-muted-foreground">
                        目前仅支持抖音 / 百应。添加观众号并扫码登录；开播后点「开始任务」会自动进房发送
                      </p>
                    </div>
                    <Button
                      size="default"
                      className="h-10 shrink-0 px-5 text-sm font-medium shadow-sm"
                      disabled={busy || (maxViewers >= 0 && accounts.length >= maxViewers)}
                      onClick={handleAddAccount}
                    >
                      <Plus className="mr-1.5 h-4 w-4" />
                      添加互动号
                    </Button>
                  </div>

                  <div className="flex items-center justify-between gap-3 rounded-md border px-3 py-2.5">
                    <div className="min-w-0 space-y-0.5">
                      <Label htmlFor="viewer-auto-reconnect" className="text-sm font-medium">
                        启动时自动恢复互动号
                      </Label>
                      <p className="text-xs text-muted-foreground">
                        默认关闭。开启后应用启动会后台恢复已登录互动号（可能弹出浏览器）
                      </p>
                    </div>
                    <Switch
                      id="viewer-auto-reconnect"
                      checked={autoReconnectOnLaunch}
                      onCheckedChange={setAutoReconnectOnLaunch}
                    />
                  </div>

                  {accounts.length === 0 ? (
                    <p className="rounded-md border border-dashed px-3 py-8 text-center text-sm text-muted-foreground">
                      添加互动号 → 扫码登录并配话术 → 开播后点「开始任务」自动进房
                    </p>
                  ) : (
                    <ul className="divide-y rounded-md border">
                      {accounts.map(a => {
                        const rt = runtimeMap[a.id]
                        const selected = a.id === currentId
                        const connecting = rt?.isConnected === 'connecting'
                        const connected = rt?.isConnected === 'connected'
                        const running = rt?.isRunning
                        const entering = rt?.isEntering
                        const waitingRoom = Boolean(
                          entering || (connected && !running && rt?.connectHint),
                        )
                        const status = running
                          ? '发送中'
                          : entering
                            ? '进房中…'
                            : connecting
                              ? '等待扫码…'
                              : waitingRoom
                                ? '等待进房…'
                                : connected
                                  ? '已登录'
                                  : '未登录'
                        return (
                          <li key={a.id}>
                            <div
                              className={cn(
                                'flex items-center gap-2 px-3 py-2.5 text-sm transition-colors',
                                selected ? 'bg-primary/5' : 'hover:bg-muted/40',
                              )}
                            >
                              <button
                                type="button"
                                className="min-w-0 flex-1 text-left"
                                onClick={() => switchAccount(a.id)}
                              >
                                <div className="font-medium truncate">{a.name}</div>
                                <div className="text-xs text-muted-foreground truncate">
                                  {PLATFORM_NAMES[a.platform] ?? a.platform} · {status}
                                </div>
                                {(connecting || waitingRoom) && rt?.connectHint ? (
                                  <div className="mt-0.5 text-xs text-amber-600 dark:text-amber-400 line-clamp-2">
                                    {rt.connectHint}
                                  </div>
                                ) : null}
                              </button>
                              {canCopyConfig ? (
                                <Button
                                  size="icon"
                                  variant="ghost"
                                  className="h-8 w-8 text-muted-foreground"
                                  disabled={busy || connecting}
                                  onClick={() => openCopyDialog(a.id)}
                                  title="复制配置到其他互动号"
                                  aria-label="复制配置到其他互动号"
                                >
                                  <Copy className="h-4 w-4" />
                                </Button>
                              ) : null}
                              {connected ? (
                                <Button
                                  size="sm"
                                  variant="outline"
                                  onClick={() => void handleDisconnect(a.id)}
                                >
                                  断开
                                </Button>
                              ) : (
                                <Button
                                  size="sm"
                                  disabled={busy || connecting}
                                  onClick={() => void loginAccount(a.id)}
                                >
                                  {connecting ? (
                                    <Loader2 className="mr-1 h-3.5 w-3.5 animate-spin" />
                                  ) : null}
                                  登录
                                </Button>
                              )}
                              <Button
                                size="icon"
                                variant="ghost"
                                className="h-8 w-8 text-muted-foreground hover:text-destructive"
                                disabled={busy || connecting}
                                onClick={() => handleRemove(a.id)}
                                aria-label="删除"
                              >
                                <Trash2 className="h-4 w-4" />
                              </Button>
                            </div>
                          </li>
                        )
                      })}
                    </ul>
                  )}
                </CardContent>
              </Card>
            </WizardHighlight>

            <WizardHighlight targetId="viewer-danmaku-scripts">
              <Card>
                <CardContent className="pt-6">
                  <div className="space-y-6">
                    <div className="space-y-1">
                      <Label>
                        {account ? `消息列表 · ${account.name}` : '消息列表'}
                      </Label>
                      <p className="text-sm text-muted-foreground">
                        添加要自动发的话术，一行一句。可用 {'{候选A/候选B}'}，每次发送随机挑一个词
                      </p>
                    </div>
                    {!account ? (
                      <p className="rounded-md border border-dashed px-3 py-8 text-center text-sm text-muted-foreground">
                        添加互动号后，在此配置该号的话术
                      </p>
                    ) : (
                      <ScriptLibrary
                        messages={config.messages}
                        onAdd={addMessage}
                        onUpdate={updateMessage}
                        onRemove={removeMessage}
                      />
                    )}
                  </div>
                </CardContent>
              </Card>
            </WizardHighlight>

            {account ? (
              <WizardHighlight targetId="viewer-danmaku-settings">
                <Card>
                  <CardContent className="pt-6">
                    <div className="space-y-6">
                      <div className="flex items-center justify-between">
                        <div className="space-y-1">
                          <Label>发送设置</Label>
                          <p className="text-sm text-muted-foreground">控制发多快、发哪一句</p>
                        </div>
                        <div className="flex items-center space-x-2">
                          <Switch
                            id="vd-random"
                            checked={!!config.random}
                            onCheckedChange={setRandom}
                          />
                          <Label htmlFor="vd-random" className="cursor-pointer">
                            随机发送
                          </Label>
                        </div>
                      </div>

                      <div className="space-y-2">
                        <Label>发送间隔（秒）</Label>
                        <p className="text-sm text-muted-foreground">
                          每发完一条后，在此范围内随机等待。最短 3 秒，建议 60～120
                        </p>
                        <div className="flex items-center gap-2">
                          <Input
                            type="number"
                            className="w-20"
                            min={3}
                            value={config.scheduler.interval[0] / 1000}
                            onChange={e => handleIntervalChange(0, e.target.value)}
                          />
                          <span className="text-sm text-muted-foreground">至</span>
                          <Input
                            type="number"
                            className="w-20"
                            min={3}
                            value={config.scheduler.interval[1] / 1000}
                            onChange={e => handleIntervalChange(1, e.target.value)}
                          />
                          <span className="text-sm text-muted-foreground">秒</span>
                        </div>
                      </div>

                      <div className="flex items-center justify-between">
                        <div className="space-y-1">
                          <Label htmlFor="vd-spaces" className="cursor-pointer">
                            插入随机空格
                          </Label>
                          <p className="text-sm text-muted-foreground">
                            在话术中插入空格，降低被当成刷屏屏蔽的概率
                          </p>
                        </div>
                        <Switch
                          id="vd-spaces"
                          checked={!!config.extraSpaces}
                          onCheckedChange={setExtraSpaces}
                        />
                      </div>
                    </div>
                  </CardContent>
                </Card>
              </WizardHighlight>
            ) : null}
          </div>
        )}

        <Dialog open={isCopyDialogOpen} onOpenChange={handleCopyDialogOpenChange}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>复制配置到其他互动号</DialogTitle>
              <DialogDescription>
                来源：{copySourceAccount?.name ?? '—'}。将覆盖目标互动号已有话术与设置，不会复制登录态。
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-4">
              <div className="space-y-2">
                <Label>目标互动号</Label>
                <div className="max-h-36 space-y-2 overflow-y-auto rounded-md border p-2">
                  {copyTargets.map(target => (
                    <label
                      key={target.id}
                      className="flex cursor-pointer items-center gap-2 rounded-sm px-1 py-1 hover:bg-muted/50"
                    >
                      <Checkbox
                        checked={copyTargetIds.includes(target.id)}
                        onCheckedChange={checked => toggleCopyTarget(target.id, checked === true)}
                      />
                      <span className="truncate text-sm">{target.name}</span>
                    </label>
                  ))}
                </div>
              </div>

              <p className="text-xs text-amber-700">将覆盖目标互动号的话术、发送间隔等设置，登录态不会被复制。</p>

              <div className="flex justify-end gap-2">
                <Button variant="outline" onClick={() => handleCopyDialogOpenChange(false)}>
                  取消
                </Button>
                <Button disabled={copyTargetIds.length === 0} onClick={handleCopyConfig}>
                  确认复制
                </Button>
              </div>
            </div>
          </DialogContent>
        </Dialog>
      </div>
    </FeatureSetupWizard>
  )
}
