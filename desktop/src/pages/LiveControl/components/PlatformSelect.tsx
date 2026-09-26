import React from 'react'
import { abilities } from '@/abilities'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { PLATFORM_NAMES } from '@/constants/platforms'
import { useAutoReplyConfig } from '@/hooks/useAutoReplyConfig'
import { useCurrentLiveControl, useCurrentLiveControlActions } from '@/hooks/useLiveControl'

const PlatformSelect = React.memo(() => {
  const platform = useCurrentLiveControl(context => context.platform)
  const isConnected = useCurrentLiveControl(context => context.isConnected)
  const { setPlatform } = useCurrentLiveControlActions()
  const { updateGeneralSettings } = useAutoReplyConfig()

  const handlePlatformChange = (value: LiveControlPlatform) => {
    setPlatform(value)
    const sources = abilities[value].autoReply?.source
    if (sources?.length) {
      updateGeneralSettings({ entry: sources[0] })
    }
  }

  return (
    <Select
      value={platform}
      onValueChange={v => handlePlatformChange(v as LiveControlPlatform)}
      disabled={isConnected !== 'disconnected'}
    >
      <SelectTrigger className="h-12 w-[148px] data-[size=default]:h-12 text-sm text-muted-foreground">
        <SelectValue placeholder="选择平台" />
      </SelectTrigger>
      <SelectContent>
        {Object.entries(PLATFORM_NAMES).map(([key, name]) => (
          <SelectItem key={key} value={key}>
            {name}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  )
})

export default PlatformSelect
