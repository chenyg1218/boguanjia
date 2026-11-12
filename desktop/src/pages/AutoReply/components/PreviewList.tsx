import { CheckIcon } from 'lucide-react'
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
      const result = await window.ipcRenderer.invoke(
        IPC_CHANNELS.tasks.autoReply.sendReply,
        currentAccountId,
        replyContent,
      )
      if (result && typeof result === 'object' && 'ok' in result && !result.ok) {
        console.error('发送回复失败:', result.error)
        return
      }
      markReplySent(commentId)
    } catch (error) {
      console.error('发送回复失败:', error)
    }
  }

  return (
    <Card className="shadow-sm">
      <CardHeader className="pb-3">
        <CardTitle>回复预览</CardTitle>
        <CardDescription>
          关键词回复会自动发到直播间。AI 回复默认要你点「发送」才会发出去。
        </CardDescription>
      </CardHeader>
      <Separator />
      <CardContent>
        <ScrollArea className="py-2 h-[400px]">
          <div className="space-y-1">
            {replies.length === 0 ? (
              <div className="text-center text-muted-foreground py-8">
                还没有回复。先设好关键词并开始任务，命中后会显示在这里。
              </div>
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
                            variant="outline"
                            size="sm"
                            className="h-7 shrink-0 px-2"
                            title="发送这条回复"
                            onClick={() => handleSendReply(reply.replyContent, reply.commentId)}
                          >
                            发送
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
