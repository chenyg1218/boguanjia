import { useId } from 'react'
import { Label } from '@/components/ui/label'
import { Switch } from '@/components/ui/switch'
import { useAutoReplyConfig } from '@/hooks/useAutoReplyConfig'

export function HideUsernameSetting() {
  const { config, updateGeneralSettings } = useAutoReplyConfig()
  const hideUserNameId = useId()

  return (
    <div className="space-y-2">
      <div className="flex items-center space-x-2">
        <Switch
          id={hideUserNameId}
          checked={config.hideUsername}
          onCheckedChange={checked => updateGeneralSettings({ hideUsername: checked })}
        />
        <Label htmlFor={hideUserNameId}>隐藏用户名</Label>
      </div>
      <p className="text-xs text-muted-foreground">
        回复里写
        <span className="font-bold mx-1 bg-muted px-1 rounded-md">{'{用户名}'}</span>
        会自动换成对方的名字。打开后只显示第一个字，例如「张三」变成「张***」。
      </p>
    </div>
  )
}
