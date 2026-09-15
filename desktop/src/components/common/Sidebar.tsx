import { Link, NavLink } from 'react-router'
import { formatMaxAccounts, planDisplayName } from 'shared/licensePlan'
import { Badge } from '@/components/ui/badge'
import { useCurrentAutoMessage } from '@/hooks/useAutoMessage'
import { useCurrentAutoPopUp } from '@/hooks/useAutoPopUp'
import { useAutoReply } from '@/hooks/useAutoReply'
import { useLicense } from '@/hooks/useLicense'
import { useCurrentLiveControl } from '@/hooks/useLiveControl'
import { cn } from '@/lib/utils'
import { openTutorial } from '@/utils/tutorial'
import {
  CarbonBlockStorage,
  CarbonChat,
  CarbonContentDeliveryNetwork,
  CarbonDocument,
  CarbonIbmEventAutomation,
  CarbonIbmWatsonTextToSpeech,
  CarbonSettings,
} from '../icons/carbon'
// v1.2 暂缓：CarbonMicrophoneFilled（语音设置）

interface SidebarTab {
  id: string
  name: string
  isRunning?: boolean
  icon: React.ReactNode
}

export default function Sidebar() {
  const isLiveControlConnected = useCurrentLiveControl(c => c.isConnected === 'connected')
  const isAutoMessageRunning = useCurrentAutoMessage(context => context.isRunning)
  const isAutoPopupRunning = useCurrentAutoPopUp(context => context.isRunning)
  const { isRunning: isAutoReplyRunning } = useAutoReply()
  const { status, ready } = useLicense()

  const tabs: SidebarTab[] = [
    {
      id: '/',
      name: '打开中控台',
      isRunning: isLiveControlConnected,
      icon: <CarbonContentDeliveryNetwork className="w-5 h-5" />,
    },
    {
      id: '/auto-message',
      name: '自动发言',
      isRunning: isAutoMessageRunning,
      icon: <CarbonChat className="w-5 h-5" />,
    },
    {
      id: '/auto-popup',
      name: '自动弹窗',
      isRunning: isAutoPopupRunning,
      icon: <CarbonBlockStorage className="w-5 h-5" />,
    },
    {
      id: '/auto-reply',
      name: '自动回复',
      isRunning: isAutoReplyRunning,
      icon: <CarbonIbmEventAutomation className="w-5 h-5" />,
    },
    // v1.2 暂缓：直播话术 / 语音设置
    // {
    //   id: '/live-script',
    //   name: '直播话术',
    //   isRunning: isVoiceRunning,
    //   icon: <CarbonDocument className="w-5 h-5" />,
    // },
    // {
    //   id: '/voice-broadcast',
    //   name: '语音设置',
    //   icon: <CarbonMicrophoneFilled className="w-5 h-5" />,
    // },
    {
      id: '/ai-chat',
      name: 'AI 助手',
      icon: <CarbonIbmWatsonTextToSpeech className="w-5 h-5" />,
    },
    {
      id: '/settings',
      name: '应用设置',
      icon: <CarbonSettings className="w-5 h-5" />,
    },
  ]
  return (
    <aside className="flex w-64 min-w-[256px] flex-col border-r bg-background">
      <div className="flex-1 overflow-y-auto p-6">
        <div className="mb-1 flex items-center gap-2.5">
          <img
            src={`${import.meta.env.BASE_URL}favicon.png`}
            alt="播管家"
            className="h-8 w-8 rounded-lg"
          />
          <h2 className="text-lg font-semibold">播管家</h2>
        </div>
        <p className="mb-6 text-xs text-muted-foreground">先连中控台，再开下面的功能</p>
        <nav className="space-y-2">
          {tabs.map(tab => (
            <NavLink
              key={tab.id}
              to={tab.id}
              className={({ isActive }) =>
                cn(
                  'relative flex items-center gap-3 rounded-lg px-4 py-3 text-sm font-medium transition-all',
                  isActive
                    ? 'bg-primary/10 text-primary shadow-xs'
                    : 'text-muted-foreground hover:bg-muted hover:text-foreground',
                )
              }
            >
              {tab.icon}
              {tab.name}
              {tab.isRunning && (
                <span className="absolute right-3 h-2 w-2 animate-pulse rounded-full bg-emerald-500" />
              )}
            </NavLink>
          ))}
        </nav>
      </div>

      <div className="border-t p-4 space-y-3">
        <button
          type="button"
          onClick={() => void openTutorial()}
          className="flex w-full items-center gap-2 rounded-lg px-2 py-1.5 text-left text-sm text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
        >
          <CarbonDocument className="h-4 w-4" />
          使用教程
        </button>
        {ready ? (
          <Link to="/settings#license" className="no-underline">
            <Badge variant={status.isPro ? 'default' : 'secondary'} className="cursor-pointer">
              {planDisplayName(status.plan)}
              {status.isPro && status.expiresAt
                ? ` · ${status.expiresAt.slice(0, 10)}`
                : ` · ${formatMaxAccounts(status.maxAccounts)}`}
            </Badge>
          </Link>
        ) : null}
      </div>
    </aside>
  )
}
