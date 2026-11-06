import { useMemoizedFn } from 'ahooks'
import {
  Cable,
  CheckIcon,
  CircleAlert,
  GlobeIcon,
  Loader2,
  XIcon,
} from 'lucide-react'
import React, { useRef, useState } from 'react'
import { IPC_CHANNELS } from 'shared/ipcChannels'
import { platformDisplayName } from 'shared/platforms'
import { WizardHighlight } from '@/components/onboarding/WizardTarget'
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { Switch } from '@/components/ui/switch'
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip'
import { DISABLED_ACCOUNT_HINT } from '@/constants/copy'
import { useAccounts } from '@/hooks/useAccounts'
import {
  useChromeConfigStore,
  useCurrentChromeConfig,
  useCurrentChromeConfigActions,
} from '@/hooks/useChromeConfig'
import { useLicense } from '@/hooks/useLicense'
import { useCurrentLiveControl, useLiveControlStore } from '@/hooks/useLiveControl'
import { useOnboardingStore } from '@/hooks/useOnboarding'
import { useToast } from '@/hooks/useToast'
import { cn } from '@/lib/utils'
import PlatformSelect from './PlatformSelect'

const StatusAlert = React.memo(() => {
  const platform = useCurrentLiveControl(state => state.platform)
  if (platform === 'wxchannel') {
    return (
      <Alert>
        <CircleAlert className="h-4 w-4" />
        <AlertTitle>你选择了视频号平台，请注意以下事项：</AlertTitle>
        <AlertDescription>
          <ol className="list-decimal list-inside">
            <li>
              请先确认<strong>开播后</strong>再连接中控台
            </li>
            <li>
              视频号助手无法<strong>一号多登</strong>，在别处登录视频号助手会
              <strong>中断连接</strong>!
            </li>
          </ol>
        </AlertDescription>
      </Alert>
    )
  }
  if (platform === 'taobao') {
    return (
      <Alert>
        <CircleAlert className="h-4 w-4" />
        <AlertTitle>你选择了淘宝平台，请注意以下事项：</AlertTitle>
        <AlertDescription>
          <ol className="list-decimal list-inside">
            <li>
              请先确认<strong>开播后</strong>
              再连接中控台，因为进入淘宝中控台需要获取<strong>直播间ID</strong>
            </li>
            <li>
              目前淘宝会触发人机验证，所以将<strong>强制关闭无头模式</strong>
              ，除了登录和人机验证之外请尽量不要操作浏览器
            </li>
          </ol>
        </AlertDescription>
      </Alert>
    )
  }
  // 与 oba 一致：仅视频号 / 淘宝展示平台专属连接提示，其余平台不打扰
  return null
})

const StatusCard = React.memo(() => {
  return (
    <Card className="border-foreground/15 shadow-md">
      <CardContent className="p-6 sm:p-7">
        <div className="mb-5 flex items-center justify-between gap-4">
          <div className="text-lg font-bold tracking-tight text-foreground">控制台状态</div>
          <HeadlessSetting />
        </div>

        <div className="flex flex-col gap-5 lg:flex-row lg:items-center lg:justify-between">
          <ConnectState />
          <div className="flex flex-wrap items-center gap-3 lg:justify-end">
            <WizardHighlight targetId="live-platform" className="inline-flex shrink-0">
              <PlatformSelect />
            </WizardHighlight>
            <WizardHighlight targetId="live-connect" className="inline-flex shrink-0">
              <ConnectToLiveControl />
            </WizardHighlight>
          </div>
        </div>

        <div className="mt-5 empty:mt-0 empty:hidden">
          <StatusAlert />
        </div>
      </CardContent>
    </Card>
  )
})

const ConnectToLiveControl = React.memo(() => {
  const setIsConnectedFor = useLiveControlStore(s => s.setIsConnected)
  const platform = useCurrentLiveControl(context => context.platform)
  const isConnected = useCurrentLiveControl(context => context.isConnected)
  const chromePath = useCurrentChromeConfig(context => context.path)
  const storageState = useCurrentChromeConfig(context => context.storageState)
  let headless = useCurrentChromeConfig(context => context.headless)
  const account = useAccounts(store => store.getCurrentAccount())
  const confirmPlatformBind = useLicense(s => s.confirmPlatformBind)
  const { toast } = useToast()
  const [bindDialogOpen, setBindDialogOpen] = useState(false)
  const [pendingBindPlatform, setPendingBindPlatform] = useState<LiveControlPlatform | null>(null)
  const [bindBusy, setBindBusy] = useState(false)
  const bindConfirmedRef = useRef(false)
  const bindCancelRequestedRef = useRef(false)
  const bindDialogShownRef = useRef(false)

  if (platform === 'taobao') {
    headless = false
  }

  const openBindDialog = useMemoizedFn((plat: LiveControlPlatform) => {
    if (bindDialogShownRef.current) return
    bindConfirmedRef.current = false
    bindCancelRequestedRef.current = false
    bindDialogShownRef.current = true
    setPendingBindPlatform(plat)
    setBindDialogOpen(true)
  })

  const disconnectLiveControl = useMemoizedFn(async (opts?: { silent?: boolean }) => {
    if (!account) {
      if (!opts?.silent) toast.error('当前账号无效，请在右侧账号栏重新选择')
      return
    }
    const accountId = account.id
    try {
      const result = await window.ipcRenderer.invoke(
        IPC_CHANNELS.tasks.liveControl.disconnect,
        accountId,
      )
      if (result && typeof result === 'object' && 'ok' in result && !result.ok) {
        if (!opts?.silent) toast.error(result.error || '断开连接失败，可重启应用后再试')
        return
      }
      if (!opts?.silent) toast.success('已断开连接')
    } catch (error) {
      if (!opts?.silent) {
        toast.error(error instanceof Error ? error.message : '断开连接失败，可重启应用后再试')
      }
    } finally {
      // 绑定发起连接的账号，避免异步期间切换账号写错状态
      setIsConnectedFor(accountId, 'disconnected')
    }
  })

  const connectLiveControl = useMemoizedFn(async () => {
    try {
      if (!account) {
        toast.error('当前账号无效，请在右侧账号栏重新选择')
        return
      }
      if (account.disabled) {
        toast.error(DISABLED_ACCOUNT_HINT)
        return
      }
      const accountId = account.id
      bindCancelRequestedRef.current = false
      bindDialogShownRef.current = false
      setIsConnectedFor(accountId, 'connecting')
      // storageState 仅用于旧版 localStorage → 主进程加密存储的一次性迁移
      const result = await window.ipcRenderer.invoke(IPC_CHANNELS.tasks.liveControl.connect, {
        headless,
        chromePath,
        storageState: storageState || undefined,
        platform,
        account,
      })

      if (bindCancelRequestedRef.current) {
        setIsConnectedFor(accountId, 'disconnected')
        return
      }

      if (result.ok) {
        setIsConnectedFor(accountId, 'connected')
        useOnboardingStore.getState().markConnectedOnce()
        if (storageState) {
          useChromeConfigStore.getState().clearStorageState(accountId)
        }
        if (result.needsPlatformBindConfirm) {
          openBindDialog(platform)
          return
        }
        if (!bindConfirmedRef.current) {
          toast.success('已连接到直播控制台')
        }
      } else {
        throw new Error(result.error || '连接直播控制台失败')
      }
    } catch (error) {
      setBindDialogOpen(false)
      setPendingBindPlatform(null)
      bindDialogShownRef.current = false
      if (account) setIsConnectedFor(account.id, 'disconnected')
      toast.error(error instanceof Error ? error.message : '连接直播控制台失败')
    }
  })

  const handleConfirmBind = useMemoizedFn(async () => {
    if (!pendingBindPlatform) return
    setBindBusy(true)
    try {
      const result = await confirmPlatformBind(pendingBindPlatform)
      if (result.ok) {
        bindConfirmedRef.current = true
        setBindDialogOpen(false)
        setPendingBindPlatform(null)
        bindDialogShownRef.current = false
        toast.success(result.message || '已连接到直播控制台')
      } else {
        toast.error(result.message)
      }
    } finally {
      setBindBusy(false)
    }
  })

  const handleBindDialogOpenChange = useMemoizedFn((open: boolean) => {
    if (open) {
      setBindDialogOpen(true)
      return
    }
    setBindDialogOpen(false)
    if (bindConfirmedRef.current) {
      bindDialogShownRef.current = false
      return
    }
    if (!pendingBindPlatform) return
    bindCancelRequestedRef.current = true
    setPendingBindPlatform(null)
    bindDialogShownRef.current = false
    void (async () => {
      await disconnectLiveControl({ silent: true })
      toast.info('已取消绑定并断开连接，可更换平台后重新连接')
    })()
  })

  const handleButtonClick = useMemoizedFn(() => {
    if (isConnected === 'connected') {
      void disconnectLiveControl()
    } else {
      void connectLiveControl()
    }
  })

  const bindName = pendingBindPlatform ? platformDisplayName(pendingBindPlatform) : ''

  return (
    <>
      {isConnected === 'connected' ? (
        <DisconnectButton handleButtonClick={handleButtonClick} />
      ) : (
        <ConnectButton
          isLoading={isConnected === 'connecting'}
          handleButtonClick={handleButtonClick}
        />
      )}
      <AlertDialog open={bindDialogOpen} onOpenChange={handleBindDialogOpenChange}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>确认绑定「{bindName}」？</AlertDialogTitle>
            <AlertDialogDescription>
              登录已成功。基础版 / 专业版绑定后只能用「{bindName}
              」，换其它平台需开通旗舰版。点「再想想」会断开连接，且不绑定。
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={bindBusy}>再想想</AlertDialogCancel>
            <AlertDialogAction
              disabled={bindBusy}
              onClick={e => {
                e.preventDefault()
                void handleConfirmBind()
              }}
            >
              {bindBusy ? '绑定中…' : '确认绑定'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  )
})

const ConnectButton = React.memo(
  ({ isLoading, handleButtonClick }: { isLoading: boolean; handleButtonClick: () => void }) => {
    return (
      <Button
        className="h-12 px-6 text-base font-semibold shadow-sm"
        variant="default"
        onClick={handleButtonClick}
        disabled={isLoading}
        size="lg"
      >
        <GlobeIcon className="h-5 w-5" />
        {isLoading ? '连接中...' : '连接直播控制台'}
      </Button>
    )
  },
)

const DisconnectButton = React.memo(({ handleButtonClick }: { handleButtonClick: () => void }) => {
  const [isHovered, setIsHovered] = useState(false)
  return (
    <Button
      className="h-12 px-6 text-base font-semibold"
      variant="secondary"
      onClick={handleButtonClick}
      size="lg"
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
    >
      {isHovered ? (
        <>
          <XIcon className="h-5 w-5" />
          断开连接
        </>
      ) : (
        <>
          <CheckIcon className="h-5 w-5" />
          已连接
        </>
      )}
    </Button>
  )
})

const ConnectState = React.memo(() => {
  const isConnected = useCurrentLiveControl(context => context.isConnected)
  const accountName = useCurrentLiveControl(context => context.accountName)

  const title =
    isConnected === 'connected' ? '已连接' : isConnected === 'connecting' ? '连接中…' : '未连接'
  const hint =
    isConnected === 'connected'
      ? accountName
        ? `账号：${accountName}`
        : '直播控制台已就绪'
      : isConnected === 'connecting'
        ? '正在打开浏览器，请稍候'
        : '请选择平台并连接直播控制台'

  const StatusIcon = isConnected === 'connecting' ? Loader2 : Cable

  return (
    <div className="flex min-w-0 items-center gap-4">
      <div className="flex h-14 w-14 shrink-0 items-center justify-center rounded-xl border border-foreground/10 bg-muted/50 text-foreground">
        <StatusIcon
          className={cn('h-6 w-6', isConnected === 'connecting' && 'animate-spin')}
        />
      </div>
      <div className="min-w-0 space-y-1.5">
        <div className="text-lg font-bold tracking-tight text-foreground">{title}</div>
        <div className="truncate text-sm text-muted-foreground">{hint}</div>
      </div>
    </div>
  )
})

const HeadlessSetting = () => {
  const headless = useCurrentChromeConfig(context => context.headless ?? false)
  const platform = useCurrentLiveControl(context => context.platform)
  const isConnected = useCurrentLiveControl(context => context.isConnected)
  const { setHeadless } = useCurrentChromeConfigActions()
  const disabled = platform === 'taobao' || isConnected !== 'disconnected'

  return (
    <TooltipProvider delayDuration={200}>
      <Tooltip>
        <TooltipTrigger asChild>
          <label
            className={cn(
              'inline-flex cursor-pointer items-center gap-1.5 text-[11px] text-muted-foreground/80',
              disabled && 'cursor-not-allowed opacity-50',
            )}
          >
            <span>无头</span>
            <Switch
              checked={headless && platform !== 'taobao'}
              disabled={disabled}
              onCheckedChange={v => setHeadless(v)}
            />
          </label>
        </TooltipTrigger>
        <TooltipContent side="bottom" className="max-w-xs text-xs leading-5">
          {platform === 'taobao'
            ? '淘宝平台需关闭无头模式，以便完成人机验证。'
            : '打开后不弹出浏览器窗口。第一次请先关掉，方便扫码登录；登录成功后再开。'}
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  )
}

export default StatusCard
