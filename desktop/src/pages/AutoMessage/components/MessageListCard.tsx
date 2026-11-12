import { useMemoizedFn } from 'ahooks'
import { PlusIcon } from 'lucide-react'
import React from 'react'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { Label } from '@/components/ui/label'
import { useAutoMessageActions, useCurrentAutoMessage } from '@/hooks/useAutoMessage'
import MessageEditor from './MessageEditor'

const MessageListCard = React.memo(() => {
  const { messages, unlimitedLength } = useCurrentAutoMessage(context => context.config)
  const { setMessages } = useAutoMessageActions()

  const addMessage = useMemoizedFn(() => {
    setMessages([
      ...messages,
      {
        id: crypto.randomUUID(),
        content: '',
        pinTop: false,
      },
    ])
  })

  return (
    <Card>
      <CardContent className="pt-6">
        <div className="space-y-6">
          <div className="space-y-1">
            <div className="flex items-center justify-between gap-2">
              <Label>消息列表</Label>
              <div className="flex shrink-0 flex-wrap items-center justify-end gap-2">
                <Button size="sm" onClick={addMessage} title="添加消息">
                  <PlusIcon className="mr-0 h-4 w-4" />
                  添加消息
                </Button>
              </div>
            </div>
            <p className="text-sm text-muted-foreground">添加要自动发的话术，一行一句</p>
          </div>
          {/* v1.2 暂缓：AI 改写话术 */}

          <div className="space-y-4">
            <div>
              <p className="text-xs text-muted-foreground">
                提示：可以用 <span className="bg-gray-100 font-bold">{'{候选A/候选B}'}</span>
                ，每次发送会随机挑一个词，避免每句都一样
              </p>
              <p className="text-xs text-muted-foreground">
                如：{'欢迎'}
                <span className="bg-gray-100 font-bold">{'{宝宝/家人/老铁}'}</span>
                {'进入直播间 -> 欢迎家人进入直播间'}
              </p>
            </div>
            <MessageEditor
              messages={messages}
              unlimitedLength={unlimitedLength}
              onChange={messages => setMessages(messages)}
            />
          </div>
        </div>
      </CardContent>
    </Card>
  )
})

export default MessageListCard
