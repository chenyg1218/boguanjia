import { useMemoizedFn } from 'ahooks'
import { Pause, Play, Square, Wand2 } from 'lucide-react'
import { useId, useState } from 'react'
import { TaskRestartHint } from '@/components/common/TaskRestartHint'
import { Title } from '@/components/common/Title'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { Checkbox } from '@/components/ui/checkbox'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Switch } from '@/components/ui/switch'
import { Textarea } from '@/components/ui/textarea'
import {
  useCurrentVoiceBroadcast,
  useOtherAccountsVoiceRunningCount,
  useVoiceBroadcastActions,
} from '@/hooks/useVoiceBroadcast'
import { useToast } from '@/hooks/useToast'
import { rewriteTextWithAI } from '@/utils/aiRewrite'

/**
 * 直播话术：只读稿、不发公屏。音色/设备在「语音设置」。
 */
export default function LiveScriptPage() {
  const config = useCurrentVoiceBroadcast(c => c.config)
  const status = useCurrentVoiceBroadcast(c => c.status)
  const otherVoiceRunning = useOtherAccountsVoiceRunningCount()
  const { updateConfig, start, stop, pause, resume, insert } = useVoiceBroadcastActions()
  const { toast } = useToast()
  const [rewriting, setRewriting] = useState(false)
  const [insertText, setInsertText] = useState('')
  const [insertInterrupt, setInsertInterrupt] = useState(true)

  const loopId = useId()

  const handleStartStop = useMemoizedFn(async () => {
    if (status.running) await stop()
    else await start()
  })

  const handleRewrite = useMemoizedFn(async () => {
    if (!config.script.trim()) {
      toast.error('请先填写话术文本')
      return
    }
    setRewriting(true)
    try {
      const next = await rewriteTextWithAI(config.script)
      updateConfig({ script: next })
      toast.success('话术已改写')
    } catch (err) {
      toast.error(err instanceof Error ? err.message : '改写失败')
    } finally {
      setRewriting(false)
    }
  })

  return (
    <div className="container py-8 space-y-4">
      <div className="flex items-center justify-between gap-4">
        <div className="min-w-0 flex-1">
          <Title
            title="直播话术"
            description="只读稿、不发公屏。支持变量 {A/B/C}、循环与条间间隔；关键词读稿可打断后重念本条。音色与输出设备请到「语音设置」。"
          />
        </div>
        <div className="flex shrink-0 items-center gap-2">
          {status.running && (
            <Button variant="outline" onClick={() => (status.paused ? resume() : pause())}>
              {status.paused ? (
                <>
                  <Play className="mr-2 h-4 w-4" />
                  继续
                </>
              ) : (
                <>
                  <Pause className="mr-2 h-4 w-4" />
                  暂停
                </>
              )}
            </Button>
          )}
          <Button
            variant={status.running ? 'destructive' : 'default'}
            onClick={() => void handleStartStop()}
          >
            {status.running ? (
              <>
                <Square className="mr-2 h-4 w-4" />
                停止读稿
              </>
            ) : (
              <>
                <Play className="mr-2 h-4 w-4" />
                开始读稿
              </>
            )}
          </Button>
        </div>
      </div>

      <TaskRestartHint visible={status.running} />

      {otherVoiceRunning > 0 ? (
        <p className="text-sm text-amber-700 bg-amber-50 border border-amber-200 rounded-md px-3 py-2">
          另有 {otherVoiceRunning} 个账号正在读稿。请确认本账号输出设备与其它账号不同，避免混音。
        </p>
      ) : null}

      {status.running && status.currentLine ? (
        <p className="text-sm text-muted-foreground">
          当前：{status.paused ? '（已暂停）' : ''}
          {status.currentLine}
        </p>
      ) : null}

      <div className="grid gap-6">
        <Card>
          <CardContent className="pt-6">
            <div className="space-y-6">
              <div className="space-y-1">
                <div className="flex items-center justify-between gap-2">
                  <Label>话术文本</Label>
                  <Button
                    variant="outline"
                    size="sm"
                    disabled={rewriting}
                    onClick={() => void handleRewrite()}
                  >
                    <Wand2 className="mr-0 h-4 w-4" />
                    {rewriting ? '改写中…' : 'AI 改写'}
                  </Button>
                </div>
                <p className="text-sm text-muted-foreground">
                  每行一句。可用 {'{宝宝/家人/老铁}'} 变量，播出时随机展开；也可用 AI
                  整段改写减少复读。
                </p>
              </div>

              <Textarea
                className="min-h-[220px] font-mono text-sm"
                placeholder="请输入直播话术，一行一句"
                value={config.script}
                onChange={e => updateConfig({ script: e.target.value })}
              />

              <div className="flex flex-wrap items-center gap-4">
                <div className="flex items-center space-x-2">
                  <Switch
                    id={loopId}
                    checked={config.loop}
                    onCheckedChange={checked => updateConfig({ loop: checked })}
                  />
                  <Label htmlFor={loopId} className="cursor-pointer">
                    循环播放
                  </Label>
                </div>
                <div className="flex items-center gap-2">
                  <Label className="whitespace-nowrap">循环方式</Label>
                  <Select
                    value={config.loopMode ?? 'sequential'}
                    onValueChange={v =>
                      updateConfig({ loopMode: v as 'sequential' | 'random' })
                    }
                  >
                    <SelectTrigger className="w-[140px]">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="sequential">顺序循环</SelectItem>
                      <SelectItem value="random">随机循环</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>

              <div className="space-y-1">
                <Label>条间间隔（秒）</Label>
                <div className="flex items-center space-x-2">
                  <Input
                    type="number"
                    min={0}
                    placeholder="最小"
                    className="w-24"
                    value={config.lineGapSec?.[0] ?? 2}
                    onChange={e => {
                      const n = Number(e.target.value) || 0
                      updateConfig({
                        lineGapSec: [n, config.lineGapSec?.[1] ?? n],
                      })
                    }}
                  />
                  <span className="text-sm text-muted-foreground">至</span>
                  <Input
                    type="number"
                    min={0}
                    placeholder="最大"
                    className="w-24"
                    value={config.lineGapSec?.[1] ?? 4}
                    onChange={e => {
                      const n = Number(e.target.value) || 0
                      updateConfig({
                        lineGapSec: [config.lineGapSec?.[0] ?? 0, n],
                      })
                    }}
                  />
                  <span className="text-sm text-muted-foreground">秒</span>
                </div>
                <p className="text-xs text-muted-foreground">
                  每念完一句后随机等待这么久再念下一句。
                </p>
              </div>

              <div className="space-y-1">
                <Label>整本循环间隔（秒）</Label>
                <Input
                  type="number"
                  min={0}
                  placeholder="例如：5"
                  className="w-24"
                  value={config.bookLoopGapSec ?? 5}
                  onChange={e =>
                    updateConfig({ bookLoopGapSec: Number(e.target.value) || 0 })
                  }
                />
                <p className="text-xs text-muted-foreground">整本念完后，再隔这么久重新开始。</p>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="pt-6">
            <div className="space-y-6">
              <div className="space-y-1">
                <Label>手动插播</Label>
                <p className="text-sm text-muted-foreground">
                  读稿中插入一段话（支持变量）。打断后会重念被打断的那条话术。
                </p>
              </div>
              <Textarea
                className="min-h-[80px] text-sm"
                placeholder="输入要插播的一句话…"
                value={insertText}
                onChange={e => setInsertText(e.target.value)}
              />
              <div className="flex flex-wrap items-center gap-3">
                <div className="flex items-center space-x-2">
                  <Checkbox
                    id="live-insert-interrupt"
                    checked={insertInterrupt}
                    onCheckedChange={v => setInsertInterrupt(v === true)}
                  />
                  <Label htmlFor="live-insert-interrupt" className="cursor-pointer">
                    打断当前播放
                  </Label>
                </div>
                <Button
                  size="sm"
                  disabled={!status.running || !insertText.trim()}
                  onClick={() =>
                    void insert(insertText, insertInterrupt).then(ok => {
                      if (ok) setInsertText('')
                    })
                  }
                >
                  立即插播
                </Button>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  )
}
