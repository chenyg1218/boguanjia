import { Link } from 'react-router'
import { PLATFORM_NAMES } from '@/constants/platforms'
import { useCurrentAutoMessage } from '@/hooks/useAutoMessage'
import { useAutoReply } from '@/hooks/useAutoReply'
import { useCurrentAutoPopUp } from '@/hooks/useAutoPopUp'
import { useCurrentLiveControl } from '@/hooks/useLiveControl'
import { cn } from '@/lib/utils'

type Tone = 'muted' | 'ok' | 'warn' | 'busy'

function StatusChip({
  label,
  value,
  tone,
  to,
}: {
  label: string
  value: string
  tone: Tone
  to?: string
}) {
  const body = (
    <div
      className={cn(
        'flex items-center gap-2 rounded-md border px-2.5 py-1 text-xs bg-white',
        tone === 'ok' && 'border-emerald-200 text-emerald-700',
        tone === 'warn' && 'border-amber-200 text-amber-700',
        tone === 'busy' && 'border-sky-200 text-sky-700',
        tone === 'muted' && 'border-border text-muted-foreground',
      )}
    >
      <span
        className={cn(
          'h-1.5 w-1.5 rounded-full',
          tone === 'ok' && 'bg-emerald-500',
          tone === 'warn' && 'bg-amber-500',
          tone === 'busy' && 'bg-sky-500 animate-pulse',
          tone === 'muted' && 'bg-gray-300',
        )}
      />
      <span className="text-muted-foreground">{label}</span>
      <span className="font-medium">{value}</span>
    </div>
  )
  if (to) {
    return (
      <Link to={to} className="no-underline hover:opacity-90">
        {body}
      </Link>
    )
  }
  return body
}

/** 当前账号：连接 / 监听 / 发言 / 弹窗 / 回复 状态一览 */
export function TaskStatusBar() {
  const connection = useCurrentLiveControl(c => c.isConnected)

  const messageRunning = useCurrentAutoMessage(c => c.isRunning)
  const popupRunning = useCurrentAutoPopUp(c => c.isRunning)
  const { isRunning: replyRunning, isListening } = useAutoReply()

  const platform = useCurrentLiveControl(c => c.platform)
  const platformLabel = PLATFORM_NAMES[platform] ?? platform
  const connectionChip =
    connection === 'connected'
      ? { value: `已连接 · ${platformLabel}`, tone: 'ok' as Tone }
      : connection === 'connecting'
        ? { value: '连接中…', tone: 'busy' as Tone }
        : { value: '未连接', tone: 'muted' as Tone }

  const listenChip =
    isListening === 'listening'
      ? { value: '监听中', tone: 'ok' as Tone }
      : isListening === 'waiting'
        ? { value: '等待中', tone: 'busy' as Tone }
        : isListening === 'error'
          ? { value: '监听异常', tone: 'warn' as Tone }
          : { value: '未监听', tone: 'muted' as Tone }

  return (
    <div className="flex flex-wrap items-center gap-2 border-b bg-muted/30 px-6 py-2">
      <StatusChip label="中控台" {...connectionChip} to="/" />
      <StatusChip
        label="自动发言"
        value={messageRunning ? '运行中' : '未运行'}
        tone={messageRunning ? 'ok' : 'muted'}
        to="/auto-message"
      />
      <StatusChip
        label="自动弹窗"
        value={popupRunning ? '运行中' : '未运行'}
        tone={popupRunning ? 'ok' : 'muted'}
        to="/auto-popup"
      />
      <StatusChip label="评论监听" {...listenChip} to="/auto-reply" />
      <StatusChip
        label="自动回复"
        value={replyRunning ? '运行中' : '未运行'}
        tone={replyRunning ? 'ok' : 'muted'}
        to="/auto-reply"
      />
      {/* v1.2 暂缓：直播话术状态 */}
    </div>
  )
}
