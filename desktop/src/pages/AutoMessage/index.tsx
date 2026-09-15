import { useMemoizedFn } from 'ahooks'
import { TaskButton } from '@/components/common/TaskButton'
import { TaskRestartHint } from '@/components/common/TaskRestartHint'
import { Title } from '@/components/common/Title'
import { useAutoMessageActions, useCurrentAutoMessage } from '@/hooks/useAutoMessage'
import { useTaskControl } from '@/hooks/useTaskControl'
import MessageListCard from './components/MessageListCard'
import MessageSettingsCard from './components/MessageSettingsCard'
import { MessageOneKey } from './components/MessagesOneKey'

const useAutoMessageTaskControl = () => {
  const isRunning = useCurrentAutoMessage(context => context.isRunning)
  const config = useCurrentAutoMessage(context => context.config)
  const { setIsRunning } = useAutoMessageActions()

  return useTaskControl({
    taskType: 'auto-comment',
    getIsRunning: () => isRunning,
    getConfig: () => config,
    setIsRunning,
    startSuccessMessage: '自动发言任务已启动',
    startFailureMessage: '自动发言启动失败。请确认已连接直播控制台后重试',
  })
}

export default function AutoMessage() {
  const { isRunning, onStartTask, onStopTask } = useAutoMessageTaskControl()

  const handleTaskButtonClick = useMemoizedFn(() => {
    if (!isRunning) onStartTask()
    else onStopTask()
  })

  return (
    <div className="container py-8 space-y-4">
      <div className="flex items-center justify-between">
        <Title title="自动发言" description="按间隔自动在公屏发话术。先写好内容，再点右上角「开始任务」。" />
        <TaskButton isTaskRunning={isRunning} onStartStop={handleTaskButtonClick} />
      </div>

      <TaskRestartHint visible={isRunning} />

      <div className="grid gap-6">
        <MessageListCard />
        <MessageSettingsCard />
        <MessageOneKey />
      </div>
    </div>
  )
}
