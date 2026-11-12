import { useEffect, useMemo } from 'react'
import { abilities, listeningSources } from '@/abilities'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { PLATFORM_NAMES } from '@/constants/platforms'
import { type AutoReplyConfig, useAutoReplyConfig } from '@/hooks/useAutoReplyConfig'
import { useCurrentLiveControl } from '@/hooks/useLiveControl'
import { useToast } from '@/hooks/useToast'

type ListeningSource = AutoReplyConfig['entry']
const platformListeningSources: Partial<Record<LiveControlPlatform, ListeningSource[]>> =
  Object.fromEntries(
    Object.entries(abilities)
      .filter(([_, s]) => s.autoReply?.source?.length)
      .map(([p, s]) => [p, s.autoReply?.source]),
  )
const listeningSourceNameMap = Object.fromEntries(
  Object.entries(listeningSources).map(([k, v]) => [k, v.name]),
) as Record<ListeningSource, string>

export function ListeningSourceSetting() {
  const { updateGeneralSettings, config } = useAutoReplyConfig()
  const { toast } = useToast()
  const platform = useCurrentLiveControl(context => context.platform)
  const { entry: listeningSource } = config

  const availableSources = platformListeningSources[platform] ?? []
  const platformLabel = PLATFORM_NAMES[platform] ?? platform
  const selectedInList = availableSources.includes(listeningSource)

  // 换平台后可能残留旧来源；对齐到当前平台可用项，避免下拉空白
  useEffect(() => {
    if (!availableSources.length) return
    if (availableSources.includes(listeningSource)) return
    updateGeneralSettings({ entry: availableSources[0] })
  }, [availableSources, listeningSource, updateGeneralSettings])

  const listeningSourceTips = useMemo(() => {
    if (!availableSources.length) {
      return `「${platformLabel}」暂时还不能自动听评论。请到「打开中控台」换成抖音小店、巨量百应、快手、视频号、小红书或淘宝后再试。`
    }
    const source = selectedInList ? listeningSource : availableSources[0]
    return listeningSources[source]?.tips ?? ''
  }, [availableSources, listeningSource, platformLabel, selectedInList])

  const handleSourceChange = (value: ListeningSource) => {
    updateGeneralSettings({ entry: value })
    toast.success(`已改为从「${listeningSourceNameMap[value]}」看评论`)
  }

  const selectValue = selectedInList
    ? listeningSource
    : availableSources[0]
      ? availableSources[0]
      : undefined

  return (
    <div className="space-y-2">
      <h3 className="text-sm font-medium">监听来源</h3>
      {availableSources.length ? (
        <Select
          value={selectValue}
          onValueChange={value => handleSourceChange(value as ListeningSource)}
        >
          <SelectTrigger>
            <SelectValue placeholder="请选择" />
          </SelectTrigger>
          <SelectContent>
            {availableSources.map(source => (
              <SelectItem key={source} value={source}>
                {listeningSourceNameMap[source]}监听
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      ) : (
        <div className="rounded-md border border-dashed px-3 py-2 text-sm text-muted-foreground">
          当前平台无可用来源
        </div>
      )}
      <p className="text-xs text-muted-foreground">{listeningSourceTips}</p>
    </div>
  )
}
