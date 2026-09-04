import { useEffect } from 'react'
import { useLocation } from 'react-router'
import { Title } from '@/components/common/Title'
import { BrowserSetting } from '@/pages/SettingsPage/components/BrowserSetting'
import { LicenseSetting } from '@/pages/SettingsPage/components/LicenseSetting'
import { OtherSetting } from '@/pages/SettingsPage/components/OtherSetting'
import { UpdateSetting } from '@/pages/SettingsPage/components/UpdateSetting'

export default function Settings() {
  const location = useLocation()

  // 处理锚点定位（因为是路由是 Hash 模式，无法自动处理锚点定位）
  useEffect(() => {
    const hash = location.hash
    if (hash) {
      const el = document.querySelector(hash)
      if (el) {
        el.scrollIntoView({ behavior: 'smooth' })
      }
    }
  })
  return (
    <div className="container py-8">
      <div className="mb-6">
        <Title title="设置" description="浏览器、收费计划、软件更新等" />
      </div>

      <div className="space-y-8">
        <LicenseSetting />
        <BrowserSetting />
        <UpdateSetting />
        <OtherSetting />
      </div>
    </div>
  )
}
