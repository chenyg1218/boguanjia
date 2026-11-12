import { Trash } from 'lucide-react'
import AIModelInfo from '@/components/ai-chat/AIModelInfo'
import { APIKeyDialog } from '@/components/ai-chat/APIKeyDialog'
import { Title } from '@/components/common/Title'
import { Button } from '@/components/ui/button'
import { useAIChatStore } from '@/hooks/useAIChat'
import ChatBox from './components/ChatBox'

export default function AIChat() {
  const { messages, clearMessages } = useAIChatStore()

  return (
    <div className="container py-8 space-y-4">
      <div className="flex items-center justify-between gap-4">
        <div className="min-w-0 flex-1">
          <Title
            title="AI 助手"
            description="问话术、回复怎么写都可以。这里不会发到直播间。"
          />
        </div>
        <div className="flex shrink-0 items-center gap-2">
          <APIKeyDialog />
          <Button
            variant="ghost"
            size="sm"
            className="h-7 text-muted-foreground hover:text-destructive shadow-none"
            onClick={clearMessages}
            disabled={messages.length === 0}
            title="清空对话"
            aria-label="清空对话"
          >
            <Trash className="mr-2 h-4 w-4" />
            清空对话
          </Button>
        </div>
      </div>

      <AIModelInfo />

      <ChatBox />
    </div>
  )
}
