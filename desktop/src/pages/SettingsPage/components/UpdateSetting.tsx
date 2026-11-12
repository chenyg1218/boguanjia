import { RefreshCw } from 'lucide-react'
import { useId, useState } from 'react'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { Label } from '@/components/ui/label'
import { Separator } from '@/components/ui/separator'
import { Switch } from '@/components/ui/switch'
import { useUpdateConfigStore, useUpdateStore } from '@/hooks/useUpdate'
import { version } from '../../../../package.json'

export function UpdateSetting() {
  const updateStatus = useUpdateStore.use.status()
  const checkUpdateManually = useUpdateStore.use.checkUpdateManually()
  const notifyEnabled = useUpdateConfigStore(s => s.notifyEnabled)
  const setNotifyEnabled = useUpdateConfigStore(s => s.setNotifyEnabled)
  const autoUpdate = useUpdateConfigStore(s => s.autoUpdate)
  const setAutoUpdate = useUpdateConfigStore(s => s.setAutoUpdate)
  const [isUpToDate, setIsUpToDate] = useState(false)
  const notifyId = useId()
  const autoUpdateId = useId()

  const checkUpdate = async () => {
    const result = await checkUpdateManually()
    if (result) {
      setIsUpToDate(result.upToDate)
    }
  }

  return (
    <Card id="update-section">
      <CardContent className="pt-6">
        <div className="space-y-6">
          <div className="space-y-1">
            <Label>软件更新</Label>
            <p className="text-sm text-muted-foreground">检查并安装最新版本</p>
          </div>

          <div className="flex items-center justify-between gap-4">
            <div className="space-y-1">
              <Label htmlFor={notifyId}>更新提示</Label>
              <p className="text-sm text-muted-foreground">有新版本时显示提示</p>
            </div>
            <Switch id={notifyId} checked={notifyEnabled} onCheckedChange={setNotifyEnabled} />
          </div>

          <div className="flex items-center justify-between gap-4">
            <div className="space-y-1">
              <Label htmlFor={autoUpdateId}>自动更新</Label>
              <p className="text-sm text-muted-foreground">后台下载更新，退出时自动安装</p>
            </div>
            <Switch id={autoUpdateId} checked={autoUpdate} onCheckedChange={setAutoUpdate} />
          </div>

          <Separator />

          <div className="flex items-center justify-between gap-4">
            <div className="space-y-1">
              <Label>检查更新</Label>
              <p className="text-sm text-muted-foreground">手动检查是否有新版本可用</p>
            </div>
            <Button
              variant="outline"
              size="sm"
              className="shrink-0"
              disabled={updateStatus === 'checking'}
              onClick={checkUpdate}
            >
              {updateStatus === 'checking' ? (
                <>
                  <RefreshCw className="mr-0 h-4 w-4 animate-spin" />
                  检查更新中
                </>
              ) : (
                <>
                  <RefreshCw className="mr-0 h-4 w-4" />
                  {isUpToDate ? '已是最新版本' : '检查更新'}
                </>
              )}
            </Button>
          </div>

          <Separator />

          <div className="space-y-1">
            <Label>当前版本</Label>
            <p className="text-sm text-muted-foreground">{version}</p>
          </div>
        </div>
      </CardContent>
    </Card>
  )
}
