import { RefreshCw } from 'lucide-react'
import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Label } from '@/components/ui/label'
import { Separator } from '@/components/ui/separator'
import { useUpdateStore } from '@/hooks/useUpdate'
import { version } from '../../../../package.json'

export function UpdateSetting() {
  const updateStatus = useUpdateStore.use.status()
  const checkUpdateManually = useUpdateStore.use.checkUpdateManually()
  const [isUpToDate, setIsUpToDate] = useState(false)

  const checkUpdate = async () => {
    const result = await checkUpdateManually()
    if (result) {
      setIsUpToDate(result.upToDate)
    }
  }

  return (
    <Card id="update-section">
      <CardHeader>
        <CardTitle>软件更新</CardTitle>
        <CardDescription>检查并安装最新版本（发现新版本时须更新后才能继续使用）</CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <div className="space-y-1">
              <Label>检查更新</Label>
              <p className="text-sm text-muted-foreground">手动检查是否有新版本可用</p>
            </div>
            <div className="flex items-center gap-3">
              <Button
                variant="outline"
                disabled={updateStatus === 'checking'}
                onClick={checkUpdate}
                size="sm"
              >
                {updateStatus === 'checking' ? (
                  <>
                    <RefreshCw className="mr-2 h-4 w-4 animate-spin" />
                    检查更新中
                  </>
                ) : (
                  <>
                    <RefreshCw className="mr-2 h-4 w-4" />
                    {isUpToDate ? '已是最新版本' : '检查更新'}
                  </>
                )}
              </Button>
            </div>
          </div>
        </div>

        <Separator />

        <div className="flex items-center justify-between">
          <div className="space-y-1">
            <h4 className="text-sm font-medium leading-none">当前版本</h4>
            <p className="text-sm text-muted-foreground">{version}</p>
          </div>
        </div>
      </CardContent>
    </Card>
  )
}
