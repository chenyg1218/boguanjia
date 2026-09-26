import { Title } from '@/components/common/Title'
import { LicenseSetting } from '@/pages/SettingsPage/components/LicenseSetting'

export default function Membership() {
  return (
    <div className="container py-8">
      <div className="mb-6">
        <Title title="会员权益" description="看档位差异，用卡密开通或续期" />
      </div>
      <LicenseSetting />
    </div>
  )
}
