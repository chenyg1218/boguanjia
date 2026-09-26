import { Navigate } from 'react-router'

/** 旧设置页入口：合并进自动回复主页「回复规则」Tab 后保留兼容跳转 */
export default function AutoReplySettings() {
  return <Navigate to="/auto-reply?tab=rules" replace />
}
