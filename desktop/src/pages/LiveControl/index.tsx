import { Title } from '@/components/common/Title'
import InstructionsCard from './components/InstructionsCard'
import StatusCard from './components/StatusCard'
import { LiveControlSpotlightProvider } from './LiveControlSpotlight'

export default function BrowserControl() {
  return (
    <LiveControlSpotlightProvider>
      <div className="container space-y-6 pt-4">
        <div>
          <Title title="直播控制台" description="连接直播后台后，才能使用自动发言、弹窗、回复。" />
        </div>

        <div className="space-y-6">
          <StatusCard />
          <InstructionsCard />
        </div>
      </div>
    </LiveControlSpotlightProvider>
  )
}
