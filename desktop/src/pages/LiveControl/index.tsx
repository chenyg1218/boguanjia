import { Title } from '@/components/common/Title'
import InstructionsCard from './components/InstructionsCard'
import StatusCard from './components/StatusCard'

export default function BrowserControl() {
  return (
    <div className="container py-8 space-y-4">
      <div>
        <Title title="直播控制台" description="先连上平台后台，后面的自动发言、弹窗、回复才能用。" />
      </div>

      <div className="space-y-8">
        <StatusCard />
        <InstructionsCard />
      </div>
    </div>
  )
}
