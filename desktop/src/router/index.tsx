import { createHashRouter } from 'react-router'
import AIChat from '@/pages/AIChat'
import AutoMessage from '@/pages/AutoMessage'
import AutoPopUp from '@/pages/AutoPopUp'
import AutoReply from '@/pages/AutoReply'
import AutoReplySettings from '@/pages/AutoReply/AutoReplySettings'
import LiveControl from '@/pages/LiveControl'
// 暂隐：直播话术 / 语音设置
// import LiveScript from '@/pages/LiveScript'
// import VoiceBroadcast from '@/pages/VoiceBroadcast'
import Membership from '@/pages/Membership'
import Settings from '@/pages/SettingsPage'
import ViewerDanmaku from '@/pages/ViewerDanmaku'
import App from '../App'

export const router = createHashRouter([
  {
    path: '/',
    element: <App />,
    children: [
      {
        path: '/',
        element: <LiveControl />,
      },
      {
        path: '/auto-message',
        element: <AutoMessage />,
      },
      {
        path: '/viewer-danmaku',
        element: <ViewerDanmaku />,
      },
      {
        path: '/auto-popup',
        element: <AutoPopUp />,
      },
      // 暂隐：直播话术 / 语音设置
      // {
      //   path: '/live-script',
      //   element: <LiveScript />,
      // },
      // {
      //   path: '/voice-broadcast',
      //   element: <VoiceBroadcast />,
      // },
      {
        path: '/membership',
        element: <Membership />,
      },
      {
        path: '/settings',
        element: <Settings />,
      },
      {
        path: '/ai-chat',
        element: <AIChat />,
      },
      {
        path: 'auto-reply',
        element: <AutoReply />,
      },
      {
        path: '/auto-reply/settings',
        element: <AutoReplySettings />,
      },
    ],
  },
])
