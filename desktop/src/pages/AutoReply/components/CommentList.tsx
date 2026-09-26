import { RefreshCcw } from 'lucide-react'
import { memo, useId, useMemo, useState } from 'react'
import { WizardHighlight } from '@/components/onboarding/WizardTarget'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Label } from '@/components/ui/label'
import { ScrollArea } from '@/components/ui/scroll-area'
import { Separator } from '@/components/ui/separator'
import { Switch } from '@/components/ui/switch'
import { type Message, useAutoReply } from '@/hooks/useAutoReply'
import { useCurrentLiveControl } from '@/hooks/useLiveControl'
import { cn } from '@/lib/utils'

const getMessageColor = (type: Message['msg_type']) => {
  switch (type) {
    case 'room_enter':
      return 'text-blue-500'
    case 'room_like':
      return 'text-pink-500'
    case 'room_follow':
      return 'text-purple-500'
    case 'subscribe_merchant_brand_vip':
      return 'text-amber-500'
    case 'live_order':
      return 'text-green-500'
    case 'ecom_fansclub_participate':
      return 'text-purple-500'
    default:
      return 'text-foreground'
  }
}

const getMessageText = (message: Message) => {
  switch (message.msg_type) {
    case 'room_enter':
      return '进入直播间'
    case 'room_like':
      return '点赞了直播间'
    case 'room_follow':
      return '关注了直播间'
    case 'subscribe_merchant_brand_vip':
      return '加入了品牌会员'
    case 'live_order':
      return message.product_title
    case 'ecom_fansclub_participate':
      return '加入了粉丝团'
    default:
      return message.content
  }
}

const MessageItem = memo(
  ({ message, isHighlighted }: { message: Message; isHighlighted: boolean }) => {
    const displayName = message.nick_name

    return (
      <div
        className={cn(
          'flex items-start gap-3 py-2 px-3 rounded-lg hover:bg-muted/50 transition-colors',
          isHighlighted ? 'bg-blue-50 hover:bg-blue-100' : 'hover:bg-muted/50',
        )}
      >
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <span className="truncate text-sm text-muted-foreground">{displayName}</span>
            <span className="text-xs text-muted-foreground ml-auto">
              {new Date(message.time).toLocaleTimeString()}
            </span>
          </div>

          <div className="mt-0.5 text-sm">
            <p className={cn(getMessageColor(message.msg_type))}>{getMessageText(message)}</p>
          </div>
        </div>
      </div>
    )
  },
  (prevProps, nextProps) => {
    return (
      prevProps.message.msg_id === nextProps.message.msg_id &&
      prevProps.isHighlighted === nextProps.isHighlighted
    )
  },
)

function listenStatusText(isListening: ReturnType<typeof useAutoReply>['isListening']) {
  switch (isListening) {
    case 'listening':
      return '监听中'
    case 'waiting':
      return '连接监听中…'
    case 'error':
      return '监听异常'
    default:
      return '未监听'
  }
}

export default function CommentList({
  highlight: highlightedCommentId,
}: {
  highlight: string | null
}) {
  const { comments, isListening, setIsRunning, setIsListening } = useAutoReply()
  const isConnected = useCurrentLiveControl(context => context.isConnected)
  const accountName = useCurrentLiveControl(ctx => ctx.accountName)
  const [hideHost, setHideHost] = useState(false)
  const userCommentOnlyId = useId()

  const filteredComments = useMemo(
    () =>
      hideHost
        ? comments.filter(comment => {
            if ('is_host' in comment && comment.is_host) return false
            return comment.nick_name?.trim() !== accountName?.trim()
          })
        : comments,
    [comments, hideHost, accountName],
  )

  const handleRetry = () => {
    if (isConnected !== 'connected') return
    setIsListening('stopped')
    setIsRunning(true)
  }

  const emptyHint =
    isListening === 'listening'
      ? '暂无评论数据'
      : isListening === 'error'
        ? '评论监听异常，自动回复已停止。可点右上角重试'
        : isListening === 'waiting'
          ? '正在连接评论监听…'
          : '开始任务后显示直播间评论'

  return (
    <Card className="shadow-sm">
      <CardHeader className="pb-3 relative">
        <CardTitle>评论列表</CardTitle>
        <CardDescription>
          开始自动回复任务后监听，并在这里实时显示直播间评论
        </CardDescription>
        <div className="flex items-center space-x-2 absolute right-4 top-4">
          <span
            className={cn(
              'text-xs',
              isListening === 'listening' && 'text-emerald-600',
              isListening === 'waiting' && 'text-sky-600',
              isListening === 'error' && 'text-amber-600',
              isListening === 'stopped' && 'text-muted-foreground',
            )}
          >
            {listenStatusText(isListening)}
          </span>

          {isListening === 'error' && (
            <Button
              variant="ghost"
              size="icon"
              onClick={handleRetry}
              disabled={isConnected !== 'connected'}
              title="重新开始监听"
            >
              <RefreshCcw className="h-4 w-4" />
            </Button>
          )}

          {isConnected === 'connected' && isListening === 'listening' && (
            <div className="flex items-center gap-2 ml-2">
              <Switch id={userCommentOnlyId} checked={hideHost} onCheckedChange={setHideHost} />
              <Label htmlFor={userCommentOnlyId}>仅用户评论</Label>
            </div>
          )}
        </div>
      </CardHeader>
      <Separator />
      <CardContent className="p-0">
        <WizardHighlight targetId="auto-reply-comments" className="block">
          <ScrollArea className="h-[400px]">
            <div className="py-2 space-y-0.5">
              {filteredComments.length === 0 ? (
                <div className="flex items-center justify-center h-20 text-muted-foreground">
                  {emptyHint}
                </div>
              ) : (
                filteredComments.map(comment => (
                  <MessageItem
                    key={comment.msg_id}
                    message={comment}
                    isHighlighted={highlightedCommentId === comment.msg_id}
                  />
                ))
              )}
            </div>
          </ScrollArea>
        </WizardHighlight>
      </CardContent>
    </Card>
  )
}
