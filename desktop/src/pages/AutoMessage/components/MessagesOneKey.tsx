import { useMemo, useState } from 'react'
import { IPC_CHANNELS } from 'shared/ipcChannels'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { useAccounts } from '@/hooks/useAccounts'
import { useAutoMessageActions, useCurrentAutoMessage } from '@/hooks/useAutoMessage'
import { useCurrentLiveControl } from '@/hooks/useLiveControl'
import { useToast } from '@/hooks/useToast'

export function MessageOneKey() {
  const [isRunning, setIsRunning] = useState(false)
  const batchCount = useCurrentAutoMessage(ctx => ctx.batchCount ?? 5)
  const { setBatchCount } = useAutoMessageActions()
  const messages = useCurrentAutoMessage(ctx => ctx.config.messages)
  const isConnected = useCurrentLiveControl(ctx => ctx.isConnected)
  const accountId = useAccounts(s => s.currentAccountId)
  const { toast } = useToast()

  const mappedMessages = useMemo(() => messages.map(msg => msg.content), [messages])

  const handleClick = async () => {
    setIsRunning(true)
    try {
      const result = await window.ipcRenderer.invoke(
        IPC_CHANNELS.tasks.autoMessage.sendBatchMessages,
        accountId,
        mappedMessages,
        batchCount,
      )
      if (!result.ok) {
        toast.error(
          result.error ||
            '一键刷屏失败。请确认已连接直播控制台且评论框可用，或稍后再试',
        )
      }
    } catch (error) {
      toast.error(
        error instanceof Error
          ? error.message
          : '一键刷屏失败。请确认已连接直播控制台后重试',
      )
    } finally {
      setIsRunning(false)
    }
  }

  return (
    <Card>
      <CardContent className="pt-6">
        <div className="space-y-6">
          <div className="flex items-center justify-between">
            <div className="space-y-1">
              <Label>一键刷屏</Label>
              <p className="text-sm text-muted-foreground">连续发送多条评论</p>
            </div>
            <div className="flex gap-4 justify-end">
              <Input
                placeholder="刷屏条数"
                type="number"
                value={batchCount}
                onChange={e => setBatchCount(+e.target.value)}
                className="w-24"
              />
              <Button onClick={handleClick} disabled={isConnected !== 'connected' || isRunning}>
                {isRunning ? '运行中' : '一键刷屏'}
              </Button>
            </div>
          </div>
        </div>
      </CardContent>
    </Card>
  )
}
