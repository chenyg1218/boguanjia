import { useId } from 'react'
import AIModelInfo from '@/components/ai-chat/AIModelInfo'
import { APIKeyDialog } from '@/components/ai-chat/APIKeyDialog'
import { Label } from '@/components/ui/label'
import { Switch } from '@/components/ui/switch'
import { Textarea } from '@/components/ui/textarea'
import { useAutoReplyConfig } from '@/hooks/useAutoReplyConfig'

export function AIReplySetting() {
  const { config, updateAIReplySettings } = useAutoReplyConfig()
  const aiReplyEnabled = config.comment.aiReply.enable
  const autoSend = config.comment.aiReply.autoSend

  const handleAiReplyChange = (checked: boolean) => {
    updateAIReplySettings({ enable: checked })
  }

  const handleAutoSendChange = (checked: boolean) => {
    updateAIReplySettings({ autoSend: checked })
  }

  const aiReplyId = useId()
  const autoSendId = useId()

  return (
    <>
      <div className="flex flex-col space-y-4">
        <div className="flex items-center space-x-2">
          <Switch id={aiReplyId} checked={aiReplyEnabled} onCheckedChange={handleAiReplyChange} />
          <Label htmlFor={aiReplyId}>启用AI自动回复</Label>
        </div>
        <p className="text-xs text-muted-foreground pl-0.5">
          关键词对不上时，让 AI 帮忙写回复。默认不会直接发出去，方便你先看一眼。
        </p>
        {aiReplyEnabled && (
          <div>
            <div className="flex items-center space-x-2">
              <Switch id={autoSendId} checked={autoSend} onCheckedChange={handleAutoSendChange} />
              <Label htmlFor={autoSendId}>自动发送</Label>
            </div>
            <div className="text-xs text-muted-foreground mt-2 pl-2">
              <p>
                打开后，AI 写的每一句都会直接发到直播间，可能出现：
              </p>
              <ul className="list-disc pl-6 mt-1">
                <li>
                  回复<strong>不合适或答非所问</strong>
                </li>
                <li>
                  内容可能<strong>不符合平台规则</strong>
                </li>
                <li>观众会感觉像在跟机器人说话</li>
              </ul>
              <p className="font-medium mt-1">※ 建议先关掉这项，看回复质量再决定要不要自动发。</p>
            </div>
          </div>
        )}
      </div>
      {aiReplyEnabled && (
        <div className="space-y-4">
          <div className="flex items-center space-x-2">提示词配置</div>
          <Textarea
            placeholder="例如：语气亲切，不要承诺发货时间，引导看商品链接……"
            value={config.comment.aiReply.prompt}
            onChange={e => updateAIReplySettings({ prompt: e.target.value })}
            className="min-h-[120px]"
          />
          <p className="text-xs text-muted-foreground">
            写给 AI 的要求，比如语气、能不能谈价格、要不要引导下单。
          </p>
          <div className="flex justify-between items-center space-x-2">
            <APIKeyDialog type="autoReply" />
            <AIModelInfo type="autoReply" />
          </div>
        </div>
      )}
    </>
  )
}
