import { createHashRouter } from 'react-router'
import AIChat from '@/pages/AIChat'
import AutoMessage from '@/pages/AutoMessage'
import AutoPopUp from '@/pages/AutoPopUp'
import AutoReply from '@/pages/AutoReply'
import AutoReplySettings from '@/pages/AutoReply/AutoReplySettings'
import LiveControl from '@/pages/LiveControl'
// v1.2 功能暂缓（1.1.3 不发布）：直播话术 / 语音设置
// import LiveScript from '@/pages/LiveScript'
// import VoiceBroadcast from '@/pages/VoiceBroadcast'
import Settings from '@/pages/SettingsPage'
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
        path: '/auto-popup',
        element: <AutoPopUp />,
      },
      // {
      //   path: '/live-script',
      //   element: <LiveScript />,
      // },
      // {
      //   path: '/voice-broadcast',
      //   element: <VoiceBroadcast />,
      // },
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
