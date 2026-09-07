import { CheckIcon, SendHorizontalIcon } from 'lucide-react'
import { IPC_CHANNELS } from 'shared/ipcChannels'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { ScrollArea } from '@/components/ui/scroll-area'
import { Separator } from '@/components/ui/separator'
import { useAccounts } from '@/hooks/useAccounts'
import { useAutoReply } from '@/hooks/useAutoReply'
import { cn } from '@/lib/utils'

export default function PreviewList({
  setHighLight,
}: {
  setHighLight: (commentId: string | null) => void
}) {
  const { replies, comments, markReplySent } = useAutoReply()
  const { currentAccountId } = useAccounts()
  const handleSendReply = async (replyContent: string, commentId: string) => {
    try {
      await window.ipcRenderer.invoke(
        IPC_CHANNELS.tasks.autoReply.sendReply,
        currentAccountId,
        replyContent,
      )
      markReplySent(commentId)
    } catch (error) {
      console.error('发送回复失败:', error)
    }
  }

  return (
    <Card className="shadow-sm">
      <CardHeader className="pb-3">
        <CardTitle>回复预览</CardTitle>
        <CardDescription>AI 生成的回复内容</CardDescription>
      </CardHeader>
      <Separator />
      <CardContent>
        <ScrollArea className="py-2 h-[400px]">
          <div className="space-y-1">
            {replies.length === 0 ? (
              <div className="text-center text-muted-foreground py-8">暂无回复数据</div>
            ) : (
              replies.map(reply => {
                const relatedComment = comments.find(c => c.msg_id === reply.commentId)
                const relatedContent =
                  relatedComment && 'content' in relatedComment ? relatedComment.content : ''
                return (
                  // biome-ignore lint/a11y/noStaticElementInteractions: 不用管 a11y
                  <div
                    key={reply.commentId}
                    className="group px-3 py-1.5 text-sm hover:bg-muted/50 rounded-lg transition-colors"
                    onMouseEnter={() => setHighLight(reply.commentId)}
                    onMouseLeave={() => setHighLight(null)}
                  >
                    <div className="flex flex-col gap-1">
                      {relatedComment && (
                        <div className="text-xs text-muted-foreground">
                          回复：
                          {relatedComment.nick_name} - {relatedContent}
                        </div>
                      )}
                      <div className="flex items-center justify-between gap-2">
                        <span
                          className={cn(
                            'flex-1',
                            reply.isSent ? 'text-muted-foreground' : 'text-gray-700',
                          )}
                        >
                          {reply.replyContent}
                        </span>
                        {reply.isSent ? (
                          <span
                            className="inline-flex items-center gap-1 shrink-0 text-xs text-emerald-600"
                            title="已发送"
                          >
                            <CheckIcon className="h-4 w-4" />
                            已发送
                          </span>
                        ) : (
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-6 w-6 shrink-0"
                            title="发送"
                            onClick={() => handleSendReply(reply.replyContent, reply.commentId)}
                          >
                            <SendHorizontalIcon className="h-4 w-4" />
                          </Button>
                        )}
                      </div>
                    </div>
                  </div>
                )
              })
            )}
          </div>
        </ScrollArea>
      </CardContent>
    </Card>
  )
}
