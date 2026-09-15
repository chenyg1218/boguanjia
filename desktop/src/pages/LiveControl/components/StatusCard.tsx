import { useMemoizedFn } from 'ahooks'
import { CheckIcon, CircleAlert, GlobeIcon, XIcon } from 'lucide-react'
import React, { useState } from 'react'
import { IPC_CHANNELS } from 'shared/ipcChannels'
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Separator } from '@/components/ui/separator'
import { Switch } from '@/components/ui/switch'
import { DISABLED_ACCOUNT_HINT } from '@/constants/copy'
import { useAccounts } from '@/hooks/useAccounts'
import {
  useChromeConfigStore,
  useCurrentChromeConfig,
  useCurrentChromeConfigActions,
} from '@/hooks/useChromeConfig'
import { useCurrentLiveControl, useCurrentLiveControlActions } from '@/hooks/useLiveControl'
import { useToast } from '@/hooks/useToast'
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
    <Card>
      <CardHeader>
        <CardTitle>控制台状态</CardTitle>
        <CardDescription>选好平台后点「连接」，在弹出的浏览器里扫码登录</CardDescription>
      </CardHeader>
      <CardContent>
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <ConnectState />
            <div className="flex items-center gap-2">
              <PlatformSelect />
              <ConnectToLiveControl />
            </div>
          </div>
          <StatusAlert />
          <Separator />
          <HeadlessSetting />
        </div>
      </CardContent>
    </Card>
  )
})

const ConnectToLiveControl = React.memo(() => {
  const { setIsConnected } = useCurrentLiveControlActions()
  const platform = useCurrentLiveControl(context => context.platform)
  const isConnected = useCurrentLiveControl(context => context.isConnected)
  const chromePath = useCurrentChromeConfig(context => context.path)
  const storageState = useCurrentChromeConfig(context => context.storageState)
  let headless = useCurrentChromeConfig(context => context.headless)
  const account = useAccounts(store => store.getCurrentAccount())
  const { toast } = useToast()

  if (platform === 'taobao') {
    headless = false
  }

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
      setIsConnected('connecting')
      // storageState 仅用于旧版 localStorage → 主进程加密存储的一次性迁移
      const result = await window.ipcRenderer.invoke(IPC_CHANNELS.tasks.liveControl.connect, {
        headless,
        chromePath,
        storageState: storageState || undefined,
        platform,
        account,
      })

      if (result.ok) {
        setIsConnected('connected')
        if (storageState) {
          useChromeConfigStore.getState().clearStorageState(account.id)
        }
        toast.success('已连接到直播控制台')
      } else {
        throw new Error(result.error || '连接直播控制台失败')
      }
    } catch (error) {
      setIsConnected('disconnected')
      toast.error(error instanceof Error ? error.message : '连接直播控制台失败')
    }
  })

  const disconnectLiveControl = useMemoizedFn(async () => {
    if (!account) {
      toast.error('当前账号无效，请在右侧账号栏重新选择')
      return
    }
    try {
      const result = await window.ipcRenderer.invoke(
        IPC_CHANNELS.tasks.liveControl.disconnect,
        account.id,
      )
      if (result && typeof result === 'object' && 'ok' in result && !result.ok) {
        toast.error(result.error || '断开连接失败，可重启应用后再试')
        return
      }
      toast.success('已断开连接')
    } catch (error) {
      toast.error(error instanceof Error ? error.message : '断开连接失败，可重启应用后再试')
    } finally {
      setIsConnected('disconnected')
    }
  })

  const handleButtonClick = useMemoizedFn(() => {
    if (isConnected === 'connected') {
      disconnectLiveControl()
    } else {
      connectLiveControl()
    }
  })

  return isConnected === 'connected' ? (
    <DisconnectButton handleButtonClick={handleButtonClick} />
  ) : (
    <ConnectButton isLoading={isConnected === 'connecting'} handleButtonClick={handleButtonClick} />
  )
})

const ConnectButton = React.memo(
  ({ isLoading, handleButtonClick }: { isLoading: boolean; handleButtonClick: () => void }) => {
    return (
      <Button variant={'default'} onClick={handleButtonClick} disabled={isLoading} size="sm">
        <GlobeIcon className="mr-2 h-4 w-4" />
        {isLoading ? '连接中...' : '连接直播控制台'}
      </Button>
    )
  },
)

const DisconnectButton = React.memo(({ handleButtonClick }: { handleButtonClick: () => void }) => {
  const [isHovered, setIsHovered] = useState(false)
  return (
    <Button
      variant="secondary"
      onClick={handleButtonClick}
      size="sm"
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
    >
      {isHovered ? (
        <>
          <XIcon className="mr-2 h-4 w-4" />
          断开连接
        </>
      ) : (
        <>
          <CheckIcon className="mr-2 h-4 w-4" />
          已连接
        </>
      )}
    </Button>
  )
})

const ConnectState = React.memo(() => {
  const isConnected = useCurrentLiveControl(context => context.isConnected)
  const accountName = useCurrentLiveControl(context => context.accountName)
  const label =
    isConnected === 'connected'
      ? `已连接${accountName ? ` (${accountName})` : ''}`
      : isConnected === 'connecting'
        ? '连接中…'
        : '未连接'
  return (
    <div className="flex items-center gap-4">
      <div
        className={`w-2 h-2 rounded-full ${
          isConnected === 'connected'
            ? 'bg-green-500'
            : isConnected === 'connecting'
              ? 'bg-sky-500 animate-pulse'
              : 'bg-gray-300'
        }`}
      />
      <span className="text-sm text-muted-foreground">{label}</span>
    </div>
  )
})

const HeadlessSetting = () => {
  const headless = useCurrentChromeConfig(context => context.headless ?? false)
  const platform = useCurrentLiveControl(context => context.platform)
  const isConnected = useCurrentLiveControl(context => context.isConnected)
  const { setHeadless } = useCurrentChromeConfigActions()
  return (
    <div className="flex justify-between items-center">
      <div>
        <div className="text-sm">无头模式</div>
        <div className="text-muted-foreground text-xs">
          打开后不弹出浏览器窗口。第一次请先关掉，方便扫码登录；登录成功后再开。
        </div>
      </div>
      <Switch
        checked={headless && platform !== 'taobao'}
        disabled={platform === 'taobao' || isConnected !== 'disconnected'}
        onCheckedChange={v => setHeadless(v)}
      />
    </div>
  )
}

export default StatusCard
