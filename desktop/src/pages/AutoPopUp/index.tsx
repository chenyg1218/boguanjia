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
import { useAutoPopUpActions, useCurrentAutoPopUp, useShortcutListener } from '@/hooks/useAutoPopUp'
import { useCurrentLiveControl } from '@/hooks/useLiveControl'
import { useTaskControl } from '@/hooks/useTaskControl'
import GoodsListCard from './components/GoodsListCard'
import InstructionsCard from './components/InstructionsCard'
import PopUpSettingsCard from './components/PopUpSettingsCard'
import { GoodsCardTabProvider } from './GoodsCardTabContext'
import { AUTO_POPUP_WIZARD_STEPS } from './wizardSteps'

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
  const isConnected = useCurrentLiveControl(s => s.isConnected)
  const [showSettingsPreview, setShowSettingsPreview] = useState(false)

  const handleTaskButtonClick = useMemoizedFn(() => {
    if (!isRunning) onStartTask()
    else onStopTask()
  })

  useShortcutListener()

  const showContent = isConnected === 'connected' || showSettingsPreview

  return (
    <FeatureSetupWizard
      wizardId="auto-popup"
      title="自动弹窗设置向导"
      steps={AUTO_POPUP_WIZARD_STEPS}
      autoOpen={showContent}
    >
      <GoodsCardTabProvider>
        <div className="container py-8 space-y-4">
          <div className="flex items-center justify-between gap-4">
            <div className="min-w-0 flex-1 space-y-3">
              <Title
                title="自动弹窗"
                description="按设定间隔自动弹出商品。先填商品序号，再点击「开始任务」。"
              />
              {showContent ? (
                <FeatureWizardTrigger
                  wizardId="auto-popup"
                  stepCount={AUTO_POPUP_WIZARD_STEPS.length}
                />
              ) : null}
            </div>
            <WizardHighlight targetId="auto-popup-start" className="shrink-0">
              <TaskButton isTaskRunning={isRunning} onStartStop={handleTaskButtonClick} />
            </WizardHighlight>
          </div>

          {!showContent ? (
            <ConnectRequiredEmpty
              settingsLabel="查看自动弹窗设置"
              onViewSettings={() => setShowSettingsPreview(true)}
            />
          ) : (
            <>
              <TaskRestartHint visible={isRunning} />
              <div className="grid gap-6">
                <WizardHighlight targetId="auto-popup-goods">
                  <GoodsListCard />
                </WizardHighlight>
                <WizardHighlight targetId="auto-popup-settings">
                  <PopUpSettingsCard />
                </WizardHighlight>
                <InstructionsCard />
              </div>
            </>
          )}
        </div>
      </GoodsCardTabProvider>
    </FeatureSetupWizard>
  )
}
