import { useRequest } from 'ahooks'
import { useEffect, useId, useState } from 'react'
import { Title } from '@/components/common/Title'
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
import {
  useCurrentVoiceBroadcast,
  useVoiceBroadcastActions,
} from '@/hooks/useVoiceBroadcast'
import { IPC_CHANNELS } from 'shared/ipcChannels'

type AudioOut = { deviceId: string; label: string }

const DEFAULT_VOICES = [
  { id: 'zh-CN-XiaoxiaoNeural', label: '晓晓（女）' },
  { id: 'zh-CN-YunxiNeural', label: '云希（男）' },
  { id: 'zh-CN-XiaoyiNeural', label: '晓伊（女）' },
  { id: 'zh-CN-YunjianNeural', label: '云健（男）' },
]

/** 语音设置：音色 / 输出设备 / 报时。读稿内容与启停在「直播话术」。 */
export default function VoiceBroadcastPage() {
  const config = useCurrentVoiceBroadcast(c => c.config)
  const { updateConfig } = useVoiceBroadcastActions()
  const [devices, setDevices] = useState<AudioOut[]>([])
  const announceId = useId()
  const elapsedId = useId()

  const { data: voices = DEFAULT_VOICES } = useRequest(async () => {
    try {
      return await window.ipcRenderer.invoke(IPC_CHANNELS.tasks.voiceBroadcast.listVoices)
    } catch {
      return DEFAULT_VOICES
    }
  })

  useEffect(() => {
    const load = async () => {
      try {
        await navigator.mediaDevices.getUserMedia({ audio: true }).catch(() => null)
        const list = await navigator.mediaDevices.enumerateDevices()
        const outs = list
          .filter(d => d.kind === 'audiooutput')
          .map(d => ({
            deviceId: d.deviceId,
            label: d.label || `输出设备 ${d.deviceId.slice(0, 6)}`,
          }))
        setDevices(outs)
      } catch {
        setDevices([])
      }
    }
    void load()
  }, [])

  return (
    <div className="container py-8 space-y-4">
      <Title
        title="语音设置"
        description="音色、输出设备与报时。读稿请到「直播话术」；关键词读稿也使用此处音色与设备。多账号请分虚拟声卡。"
      />

      <div className="grid gap-6 md:grid-cols-2">
        <Card>
          <CardContent className="pt-6">
            <div className="space-y-6">
              <div className="space-y-1">
                <Label>音色与输出</Label>
                <p className="text-sm text-muted-foreground">
                  多账号可同时读稿。请为每个账号选择不同虚拟声卡，再在对应直播伴侣里选该设备为麦克风；同一输出会混音。
                </p>
              </div>

              <div className="space-y-1">
                <Label>音色</Label>
                <Select value={config.voice} onValueChange={v => updateConfig({ voice: v })}>
                  <SelectTrigger>
                    <SelectValue placeholder="选择音色" />
                  </SelectTrigger>
                  <SelectContent>
                    {voices.map(v => (
                      <SelectItem key={v.id} value={v.id}>
                        {v.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-1">
                <Label>输出设备</Label>
                <Select
                  value={config.outputDeviceId || '__default__'}
                  onValueChange={v =>
                    updateConfig({ outputDeviceId: v === '__default__' ? '' : v })
                  }
                >
                  <SelectTrigger>
                    <SelectValue placeholder="系统默认" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="__default__">系统默认</SelectItem>
                    {devices.map(d => (
                      <SelectItem key={d.deviceId} value={d.deviceId}>
                        {d.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1">
                  <Label>语速（50–150）</Label>
                  <Input
                    type="number"
                    min={50}
                    max={150}
                    placeholder="例如：100"
                    value={config.rate}
                    onChange={e => updateConfig({ rate: Number(e.target.value) || 100 })}
                  />
                </div>
                <div className="space-y-1">
                  <Label>音量（0–100）</Label>
                  <Input
                    type="number"
                    min={0}
                    max={100}
                    placeholder="例如：100"
                    value={config.volume}
                    onChange={e => updateConfig({ volume: Number(e.target.value) || 0 })}
                  />
                </div>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="pt-6">
            <div className="space-y-6">
              <div className="flex items-center justify-between">
                <div className="space-y-1">
                  <Label>语音报时</Label>
                  <p className="text-sm text-muted-foreground">
                    在直播话术读稿过程中按间隔插入当前时间。
                  </p>
                </div>
                <div className="flex items-center space-x-2">
                  <Switch
                    id={announceId}
                    checked={config.timeAnnounce.enable}
                    onCheckedChange={checked =>
                      updateConfig({ timeAnnounce: { ...config.timeAnnounce, enable: checked } })
                    }
                  />
                  <Label htmlFor={announceId} className="cursor-pointer">
                    启用报时
                  </Label>
                </div>
              </div>

              <div className="space-y-1">
                <Label>间隔模式</Label>
                <Select
                  value={config.timeAnnounce.mode}
                  onValueChange={v =>
                    updateConfig({
                      timeAnnounce: {
                        ...config.timeAnnounce,
                        mode: v as 'fixed' | 'random',
                      },
                    })
                  }
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="fixed">固定间隔</SelectItem>
                    <SelectItem value="random">随机区间</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-1">
                <Label>报时间隔（秒）</Label>
                <div className="flex items-center space-x-2">
                  <Input
                    type="number"
                    min={10}
                    placeholder="最小"
                    className="w-24"
                    value={config.timeAnnounce.intervalSec[0]}
                    onChange={e => {
                      const n = Number(e.target.value) || 10
                      updateConfig({
                        timeAnnounce: {
                          ...config.timeAnnounce,
                          intervalSec: [n, config.timeAnnounce.intervalSec[1]],
                        },
                      })
                    }}
                  />
                  <span className="text-sm text-muted-foreground">至</span>
                  <Input
                    type="number"
                    min={10}
                    placeholder="最大"
                    className="w-24"
                    value={config.timeAnnounce.intervalSec[1]}
                    onChange={e => {
                      const n = Number(e.target.value) || 10
                      updateConfig({
                        timeAnnounce: {
                          ...config.timeAnnounce,
                          intervalSec: [config.timeAnnounce.intervalSec[0], n],
                        },
                      })
                    }}
                  />
                  <span className="text-sm text-muted-foreground">秒</span>
                </div>
              </div>

              <div className="flex items-center space-x-2">
                <Checkbox
                  id={elapsedId}
                  checked={config.timeAnnounce.includeElapsed}
                  onCheckedChange={checked =>
                    updateConfig({
                      timeAnnounce: {
                        ...config.timeAnnounce,
                        includeElapsed: checked === true,
                      },
                    })
                  }
                />
                <Label htmlFor={elapsedId} className="cursor-pointer">
                  同时播报已播时长
                </Label>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  )
}
