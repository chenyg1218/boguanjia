import { useMemoizedFn } from 'ahooks'
import { CheckIcon, CircleAlert, GlobeIcon, XIcon } from 'lucide-react'
import React, { useState } from 'react'
import { IPC_CHANNELS } from 'shared/ipcChannels'
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Separator } from '@/components/ui/separator'
import { Switch } from '@/components/ui/switch'
import { useAccounts } from '@/hooks/useAccounts'
import { useCurrentChromeConfig, useCurrentChromeConfigActions } from '@/hooks/useChromeConfig'
import { useCurrentLiveControl, useCurrentLiveControlActions } from '@/hooks/useLiveControl'
import { useToast } from '@/hooks/useToast'

const StatusAlert = React.memo(() => (
  <Alert>
    <CircleAlert className="h-4 w-4" />
    <AlertTitle>快手小店连接提示</AlertTitle>
    <AlertDescription>
      <ol className="list-decimal list-inside">
        <li>
          首次登录请<strong>关闭无头模式</strong>，在弹出的浏览器中扫码
        </li>
        <li>登录成功后再开启自动发言 / 弹窗 / 回复；改配置后需停止任务再开始</li>
      </ol>
    </AlertDescription>
  </Alert>
))

const StatusCard = React.memo(() => {
  return (
    <Card>
      <CardHeader>
        <CardTitle>控制台状态</CardTitle>
        <CardDescription>连接快手小店直播中控台</CardDescription>
      </CardHeader>
      <CardContent>
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <ConnectState />
            <div className="flex items-center gap-2">
              <span className="text-sm text-muted-foreground px-2 py-1.5 rounded-md border bg-muted/40">
                快手小店
              </span>
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
  const isConnected = useCurrentLiveControl(context => context.isConnected)
  const chromePath = useCurrentChromeConfig(context => context.path)
  const storageState = useCurrentChromeConfig(context => context.storageState)
  const headless = useCurrentChromeConfig(context => context.headless)
  const account = useAccounts(store => store.getCurrentAccount())
  const { toast } = useToast()

  const connectLiveControl = useMemoizedFn(async () => {
    try {
      if (!account) {
        toast.error('找不到对应账号')
        return
      }
      setIsConnected('connecting')
      const result = await window.ipcRenderer.invoke(IPC_CHANNELS.tasks.liveControl.connect, {
        headless,
        chromePath,
        storageState,
        platform: 'kuaishou',
        account,
      })

      if (result) {
        setIsConnected('connected')
        toast.success('已连接到直播控制台')
      } else {
        throw new Error('连接直播控制台失败')
      }
    } catch (error) {
      setIsConnected('disconnected')
      toast.error(error instanceof Error ? error.message : '连接直播控制台失败')
    }
  })

  const disconnectLiveControl = useMemoizedFn(async () => {
    if (!account) {
      toast.error('找不到对应账号')
      return
    }
    try {
      await window.ipcRenderer.invoke(IPC_CHANNELS.tasks.liveControl.disconnect, account.id)
      toast.success('已断开连接')
    } catch (error) {
      toast.error(error instanceof Error ? error.message : '断开连接失败')
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
  const isConnected = useCurrentLiveControl(context => context.isConnected)
  const { setHeadless } = useCurrentChromeConfigActions()
  return (
    <div className="flex justify-between items-center">
      <div>
        <div className="text-sm">无头模式</div>
        <div className="text-muted-foreground text-xs">
          开启后浏览器将在后台运行，不会在桌面显示
        </div>
      </div>
      <Switch
        checked={headless}
        disabled={isConnected !== 'disconnected'}
        onCheckedChange={v => setHeadless(v)}
      />
    </div>
  )
}

export default StatusCard
