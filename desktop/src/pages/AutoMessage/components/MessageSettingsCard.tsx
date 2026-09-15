import { useMemoizedFn } from 'ahooks'
import React, { useId, useState } from 'react'
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
import { Card, CardContent } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Switch } from '@/components/ui/switch'
import { useAutoMessageActions, useCurrentAutoMessage } from '@/hooks/useAutoMessage'

const MessageSettingsCard = React.memo(() => {
  const { scheduler, random, extraSpaces, unlimitedLength } = useCurrentAutoMessage(
    context => context.config,
  )
  const { setScheduler, setRandom, setExtraSpaces, setUnlimitedLength } = useAutoMessageActions()
  const randomId = useId()
  const extraSpacesId = useId()
  const unlimitedLengthId = useId()
  const [showWarning, setShowWarning] = useState(false)

  const handleUnlimitedLengthChange = useMemoizedFn((checked: boolean) => {
    if (checked) {
      setShowWarning(true)
    } else {
      setUnlimitedLength(false)
    }
  })

  const handleConfirmUnlimited = useMemoizedFn(() => {
    setUnlimitedLength(true)
    setShowWarning(false)
  })

  const handleIntervalChange = useMemoizedFn((index: 0 | 1, value: string) => {
    const numValue = Number(value) * 1000
    setScheduler({
      interval: index === 0 ? [numValue, scheduler.interval[1]] : [scheduler.interval[0], numValue],
    })
  })

  return (
    <Card>
      <CardContent className="pt-6">
        <div className="space-y-6">
          <div className="flex items-center justify-between">
            <div className="space-y-1">
              <Label>发送设置</Label>
              <p className="text-sm text-muted-foreground">控制发多快、发哪一句</p>
            </div>
            <div className="flex items-center space-x-2">
              <Switch id={randomId} checked={random} onCheckedChange={setRandom} />
              <Label htmlFor={randomId} className="cursor-pointer">
                随机发送
              </Label>
            </div>
          </div>

          <div className="space-y-1">
            <Label>发送间隔（秒）</Label>
            <div className="flex items-center space-x-2">
              <Input
                type="number"
                value={scheduler.interval[0] / 1000}
                onChange={e => handleIntervalChange(0, e.target.value)}
                className="w-24"
                min="1"
                placeholder="最小"
              />
              <span className="text-sm text-muted-foreground">至</span>
              <Input
                type="number"
                value={scheduler.interval[1] / 1000}
                onChange={e => handleIntervalChange(1, e.target.value)}
                className="w-24"
                min="1"
                placeholder="最大"
              />
              <span className="text-sm text-muted-foreground">秒</span>
            </div>
            <p className="text-xs text-muted-foreground">
              每隔这么多秒发一句。填一个范围（如 8～15），每次间隔会略有不同，不那么死板。
            </p>
          </div>

          <div className="flex items-center space-x-2">
            <Switch id={extraSpacesId} checked={extraSpaces} onCheckedChange={setExtraSpaces} />
            <Label htmlFor={extraSpacesId} className="cursor-pointer">
              插入随机空格
            </Label>
          </div>
          <p className="text-xs text-muted-foreground -mt-4">
            打开后在话术里加空格，降低被平台当成刷屏屏蔽的概率
          </p>

          <div className="space-y-1">
            <div className="flex items-center space-x-2">
              <Switch
                id={unlimitedLengthId}
                checked={unlimitedLength}
                onCheckedChange={handleUnlimitedLengthChange}
              />
              <Label htmlFor={unlimitedLengthId} className="cursor-pointer">
                解除字数限制
              </Label>
            </div>
            {unlimitedLength ? (
              <p className="text-xs text-amber-600">
                已解除限制：话术太长容易发不出去或被平台限制，建议还是写短一点、发慢一点。
              </p>
            ) : (
              <p className="text-xs text-muted-foreground">
                默认限制字数，更不容易被平台拦截；真要发长文再打开。
              </p>
            )}
          </div>
        </div>
      </CardContent>

      <AlertDialog open={showWarning} onOpenChange={setShowWarning}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>快手风控提示</AlertDialogTitle>
            <AlertDialogDescription asChild>
              <div className="space-y-2 text-sm text-muted-foreground">
                <p>解除后将不再限制单条发言字数。快手侧常见风险：</p>
                <ul className="list-disc list-inside space-y-1">
                  <li>过长评论发送失败或被截断</li>
                  <li>频繁长文案更容易触发平台限流 / 屏蔽</li>
                  <li>建议仍保持简短，并配合合理发送间隔</li>
                </ul>
                <p>确认了解风险后再开启。</p>
              </div>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>取消</AlertDialogCancel>
            <AlertDialogAction onClick={handleConfirmUnlimited}>确认解除</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </Card>
  )
})

export default MessageSettingsCard
