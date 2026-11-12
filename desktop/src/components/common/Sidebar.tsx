import { NavLink } from 'react-router'
import { useCurrentAutoMessage } from '@/hooks/useAutoMessage'
import { useCurrentAutoPopUp } from '@/hooks/useAutoPopUp'
import { useAutoReply } from '@/hooks/useAutoReply'
import { useCurrentLiveControl } from '@/hooks/useLiveControl'
// 暂隐：直播话术 / 语音设置
// import { useCurrentVoiceBroadcast } from '@/hooks/useVoiceBroadcast'
import { useViewerAccountsStore } from '@/hooks/useViewerAccounts'
import { cn } from '@/lib/utils'
import { openTutorial } from '@/utils/tutorial'
import {
  CarbonBlockStorage,
  CarbonChat,
  CarbonContentDeliveryNetwork,
  CarbonDocument,
  CarbonGift,
  CarbonIbmEventAutomation,
  CarbonIbmWatsonTextToSpeech,
  // CarbonMicrophoneFilled, // 暂隐：语音设置
  CarbonSettings,
  CarbonUsersChat,
} from '../icons/carbon'

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
  // 暂隐：直播话术
  // const isVoiceRunning = useCurrentVoiceBroadcast(c => c.status.running)
  const isViewerDanmakuRunning = useViewerAccountsStore(s =>
    Object.values(s.runtime).some(r => r.isRunning),
  )

  const iconClass = 'h-5 w-5 shrink-0'

  const tabs: SidebarTab[] = [
    {
      id: '/',
      name: '打开中控台',
      isRunning: isLiveControlConnected,
      icon: <CarbonContentDeliveryNetwork className={iconClass} />,
    },
    {
      id: '/auto-message',
      name: '自动发言',
      isRunning: isAutoMessageRunning,
      icon: <CarbonChat className={iconClass} />,
    },
    {
      id: '/auto-popup',
      name: '自动弹窗',
      isRunning: isAutoPopupRunning,
      icon: <CarbonBlockStorage className={iconClass} />,
    },
    {
      id: '/auto-reply',
      name: '自动回复',
      isRunning: isAutoReplyRunning,
      icon: <CarbonIbmEventAutomation className={iconClass} />,
    },
    // 暂隐：直播话术 / 语音设置
    // {
    //   id: '/live-script',
    //   name: '直播话术',
    //   isRunning: isVoiceRunning,
    //   icon: <CarbonDocument className={iconClass} />,
    // },
    // {
    //   id: '/voice-broadcast',
    //   name: '语音设置',
    //   icon: <CarbonMicrophoneFilled className={iconClass} />,
    // },
    {
      id: '/ai-chat',
      name: 'AI 助手',
      icon: <CarbonIbmWatsonTextToSpeech className={iconClass} />,
    },
    {
      id: '/viewer-danmaku',
      name: '小号互动',
      isRunning: isViewerDanmakuRunning,
      icon: <CarbonUsersChat className={iconClass} />,
    },
  ]
  return (
    <aside className="flex w-64 min-w-[256px] flex-col border-r bg-background">
      <div className="flex-1 overflow-y-auto p-6">
        <div className="mb-6 flex items-center gap-2.5">
          <img
            src={`${import.meta.env.BASE_URL}favicon.png`}
            alt="播管家"
            className="h-8 w-8 rounded-lg"
          />
          <h2 className="text-lg font-semibold">播管家</h2>
        </div>
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

      <div className="space-y-1 border-t px-6 py-4">
        <NavLink
          to="/membership"
          className={({ isActive }) =>
            cn(
              'flex w-full items-center gap-3 rounded-lg px-4 py-1.5 text-sm transition-colors no-underline',
              isActive
                ? 'bg-primary/10 text-primary'
                : 'text-muted-foreground hover:bg-muted hover:text-foreground',
            )
          }
        >
          <CarbonGift className={iconClass} />
          会员权益
        </NavLink>
        <button
          type="button"
          onClick={() => void openTutorial()}
          className="flex w-full items-center gap-3 rounded-lg px-4 py-1.5 text-left text-sm text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
        >
          <CarbonDocument className={iconClass} />
          使用教程
        </button>
        <NavLink
          to="/settings"
          className={({ isActive }) =>
            cn(
              'flex w-full items-center gap-3 rounded-lg px-4 py-1.5 text-sm transition-colors no-underline',
              isActive
                ? 'bg-primary/10 text-primary'
                : 'text-muted-foreground hover:bg-muted hover:text-foreground',
            )
          }
        >
          <CarbonSettings className={iconClass} />
          应用设置
        </NavLink>
      </div>
    </aside>
  )
}
