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
  CarbonEmail,
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
  /** 底栏项选中样式与「应用设置」NavLink 保持一致 */
  const footerItemClass = (active: boolean) =>
    cn(
      'flex w-full items-center gap-3 rounded-lg px-4 py-2.5 text-sm transition-colors',
      active
        ? 'bg-primary/10 text-primary'
        : 'bg-transparent text-muted-foreground hover:bg-muted hover:text-foreground',
    )

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

      {/* 高度与中间栏日志区一致，保证分隔线水平对齐 */}
      <div className="flex h-[180px] shrink-0 flex-col justify-center gap-1 border-t px-6">
        <NavLink
          to="/membership"
          className={({ isActive }) => cn(footerItemClass(isActive), 'no-underline')}
        >
          <CarbonGift className={iconClass} />
          会员权益
        </NavLink>
        <button
          type="button"
          onClick={() => void openTutorial()}
          className={cn(footerItemClass(false), 'border-0 text-left')}
        >
          <CarbonDocument className={iconClass} />
          使用教程
        </button>
        <NavLink
          to="/feedback"
          className={({ isActive }) => cn(footerItemClass(isActive), 'no-underline')}
        >
          <CarbonEmail className={iconClass} />
          问题反馈
        </NavLink>
        <NavLink
          to="/settings"
          className={({ isActive }) => cn(footerItemClass(isActive), 'no-underline')}
        >
          <CarbonSettings className={iconClass} />
          应用设置
        </NavLink>
      </div>
    </aside>
  )
}
