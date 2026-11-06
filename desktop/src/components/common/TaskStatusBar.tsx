import { Link } from 'react-router'
import { PLATFORM_NAMES } from '@/constants/platforms'
import { useCurrentAutoMessage } from '@/hooks/useAutoMessage'
import { useAutoReply } from '@/hooks/useAutoReply'
import { useCurrentAutoPopUp } from '@/hooks/useAutoPopUp'
import { useCurrentLiveControl } from '@/hooks/useLiveControl'
import { useViewerAccountsStore } from '@/hooks/useViewerAccounts'
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

/** 当前账号：连接 / 发言 / 弹窗 / 回复 / 小号互动 状态一览。评论监听属于自动回复，不单独占一格。 */
export function TaskStatusBar() {
  const connection = useCurrentLiveControl(c => c.isConnected)

  const messageRunning = useCurrentAutoMessage(c => c.isRunning)
  const popupRunning = useCurrentAutoPopUp(c => c.isRunning)
  const { isRunning: replyRunning, isListening } = useAutoReply()
  const viewerDanmakuRunning = useViewerAccountsStore(s =>
    Object.values(s.runtime).some(r => r.isRunning),
  )

  const platform = useCurrentLiveControl(c => c.platform)
  const platformLabel = PLATFORM_NAMES[platform] ?? platform
  const connectionChip =
    connection === 'connected'
      ? { value: `已连接 · ${platformLabel}`, tone: 'ok' as Tone }
      : connection === 'connecting'
        ? { value: '连接中…', tone: 'busy' as Tone }
        : { value: '未连接', tone: 'muted' as Tone }

  const replyChip =
    isListening === 'error'
      ? { value: '监听异常', tone: 'warn' as Tone }
      : isListening === 'waiting'
        ? { value: '启动中', tone: 'busy' as Tone }
        : replyRunning
          ? { value: '运行中', tone: 'ok' as Tone }
          : { value: '未运行', tone: 'muted' as Tone }

  return (
    <div className="border-b bg-muted/30 px-8 py-2">
      <div className="container flex flex-wrap items-center gap-2">
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
        <StatusChip label="自动回复" {...replyChip} to="/auto-reply" />
        <StatusChip
          label="小号互动"
          value={viewerDanmakuRunning ? '运行中' : '未运行'}
          tone={viewerDanmakuRunning ? 'ok' : 'muted'}
          to="/viewer-danmaku"
        />
        {/* v1.2 暂缓：直播话术状态 */}
      </div>
    </div>
  )
}
