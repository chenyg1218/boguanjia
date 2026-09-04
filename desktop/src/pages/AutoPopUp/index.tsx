import { useMemoizedFn } from 'ahooks'
import { TaskButton } from '@/components/common/TaskButton'
import { TaskRestartHint } from '@/components/common/TaskRestartHint'
import { Title } from '@/components/common/Title'
import { useAutoPopUpActions, useCurrentAutoPopUp, useShortcutListener } from '@/hooks/useAutoPopUp'
import { useTaskControl } from '@/hooks/useTaskControl'
import GoodsListCard from './components/GoodsListCard'
import InstructionsCard from './components/InstructionsCard'
import PopUpSettingsCard from './components/PopUpSettingsCard'

const useAutoPopUpTaskControl = () => {
  const isRunning = useCurrentAutoPopUp(context => context.isRunning)
  const config = useCurrentAutoPopUp(context => context.config)
  const { setIsRunning } = useAutoPopUpActions()

  return useTaskControl({
    taskType: 'auto-popup',
    getIsRunning: () => isRunning,
    getConfig: () => config,
    setIsRunning,
    startSuccessMessage: '自动弹窗任务已启动',
    startFailureMessage: '自动弹窗启动失败。请确认已连接直播控制台后重试',
  })
}

export default function AutoPopUp() {
  const { isRunning, onStartTask, onStopTask } = useAutoPopUpTaskControl()

  const handleTaskButtonClick = useMemoizedFn(() => {
    if (!isRunning) onStartTask()
    else onStopTask()
  })

  useShortcutListener()

  return (
    <div className="container py-8 space-y-4">
      <div className="flex items-center justify-between">
        <Title title="自动弹窗" description="配置自动弹出商品的规则" />
        <TaskButton isTaskRunning={isRunning} onStartStop={handleTaskButtonClick} />
      </div>

      <TaskRestartHint visible={isRunning} />

      <div className="grid gap-6">
        <GoodsListCard />
        <PopUpSettingsCard />
        <InstructionsCard />
      </div>
    </div>
  )
}
