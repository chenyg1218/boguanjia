import { useMemoizedFn } from 'ahooks'
import { useState } from 'react'
import { ConnectRequiredEmpty } from '@/components/common/ConnectRequiredEmpty'
import { TaskButton } from '@/components/common/TaskButton'
import { TaskRestartHint } from '@/components/common/TaskRestartHint'
import { Title } from '@/components/common/Title'
import {
  FeatureSetupWizard,
  FeatureWizardTrigger,
} from '@/components/onboarding/FeatureSetupWizard'
import { WizardHighlight } from '@/components/onboarding/WizardTarget'
import { useAutoMessageActions, useCurrentAutoMessage } from '@/hooks/useAutoMessage'
import { useCurrentLiveControl } from '@/hooks/useLiveControl'
import { useTaskControl } from '@/hooks/useTaskControl'
import MessageListCard from './components/MessageListCard'
import MessageSettingsCard from './components/MessageSettingsCard'
import { MessageOneKey } from './components/MessagesOneKey'
import { AUTO_MESSAGE_WIZARD_STEPS } from './wizardSteps'

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
  const isConnected = useCurrentLiveControl(s => s.isConnected)
  const [showSettingsPreview, setShowSettingsPreview] = useState(false)

  const handleTaskButtonClick = useMemoizedFn(() => {
    if (!isRunning) onStartTask()
    else onStopTask()
  })

  const showContent = isConnected === 'connected' || showSettingsPreview

  return (
    <FeatureSetupWizard
      wizardId="auto-message"
      title="自动发言设置向导"
      steps={AUTO_MESSAGE_WIZARD_STEPS}
      autoOpen={showContent}
    >
      <div className="container py-8 space-y-4">
        <div className="flex items-center justify-between gap-4">
          <div className="min-w-0 flex-1 space-y-3">
            <Title
              title="自动发言"
              description="按设定间隔在公屏发送话术。先写好内容，再点击「开始任务」。"
            />
            {showContent ? (
              <FeatureWizardTrigger
                wizardId="auto-message"
                stepCount={AUTO_MESSAGE_WIZARD_STEPS.length}
              />
            ) : null}
          </div>
          <WizardHighlight targetId="auto-message-start" className="shrink-0">
            <TaskButton isTaskRunning={isRunning} onStartStop={handleTaskButtonClick} />
          </WizardHighlight>
        </div>

        {!showContent ? (
          <ConnectRequiredEmpty
            settingsLabel="查看自动发言设置"
            onViewSettings={() => setShowSettingsPreview(true)}
          />
        ) : (
          <>
            <TaskRestartHint visible={isRunning} />
            <div className="grid gap-6">
              <WizardHighlight targetId="auto-message-messages">
                <MessageListCard />
              </WizardHighlight>
              <WizardHighlight targetId="auto-message-settings">
                <MessageSettingsCard />
              </WizardHighlight>
              <WizardHighlight targetId="auto-message-onekey">
                <MessageOneKey />
              </WizardHighlight>
            </div>
          </>
        )}
      </div>
    </FeatureSetupWizard>
  )
}
