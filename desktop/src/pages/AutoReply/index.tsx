import { useLayoutEffect, useState } from 'react'
import { useSearchParams } from 'react-router'
import { ConnectRequiredEmpty } from '@/components/common/ConnectRequiredEmpty'
import { TaskButton } from '@/components/common/TaskButton'
import { Title } from '@/components/common/Title'
import {
  FeatureSetupWizard,
  FeatureWizardTrigger,
} from '@/components/onboarding/FeatureSetupWizard'
import { WizardHighlight } from '@/components/onboarding/WizardTarget'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { useAutoReply } from '@/hooks/useAutoReply'
import { useAutoReplyConfig } from '@/hooks/useAutoReplyConfig'
import { useFeatureWizardStore } from '@/hooks/useFeatureWizard'
import { useCurrentLiveControl } from '@/hooks/useLiveControl'
import { AutoReplySettingsPanel } from '@/pages/AutoReply/components/AutoReplySettingsPanel'
import CommentList from '@/pages/AutoReply/components/CommentList'
import PreviewList from '@/pages/AutoReply/components/PreviewList'
import { AUTO_REPLY_WIZARD_STEPS } from './wizardSteps'

type AutoReplyTab = 'rules' | 'monitor'

const RULES_TARGETS = new Set(['auto-reply-listening', 'auto-reply-keyword'])
const MONITOR_TARGETS = new Set([
  'auto-reply-comments',
  'auto-reply-preview',
  'auto-reply-start',
])

function hasConfiguredReplyRules(config: ReturnType<typeof useAutoReplyConfig>['config']) {
  const { keywordReply, aiReply } = config.comment
  return (keywordReply.enable && keywordReply.rules.length > 0) || aiReply.enable
}

function parseTabParam(value: string | null): AutoReplyTab | null {
  if (value === 'rules' || value === 'monitor') return value
  return null
}

export default function AutoReply() {
  const { isRunning, isListening, setIsRunning, setIsListening } = useAutoReply()
  const { config } = useAutoReplyConfig()
  const isConnected = useCurrentLiveControl(s => s.isConnected)
  const [searchParams, setSearchParams] = useSearchParams()
  const [highlightedCommentId, setHighlightedCommentId] = useState<string | null>(null)
  const [showSettingsPreview, setShowSettingsPreview] = useState(false)
  const [tab, setTab] = useState<AutoReplyTab>(
    () =>
      parseTabParam(searchParams.get('tab')) ??
      (hasConfiguredReplyRules(config) ? 'monitor' : 'rules'),
  )

  const selectTab = (next: AutoReplyTab) => {
    setTab(next)
    setSearchParams(next === 'rules' ? { tab: 'rules' } : { tab: 'monitor' }, { replace: true })
  }

  const wizardOpen = useFeatureWizardStore(s => s.runtimes['auto-reply']?.open ?? false)
  const wizardIndex = useFeatureWizardStore(s => s.runtimes['auto-reply']?.currentIndex ?? 0)
  const currentTargetId = wizardOpen
    ? (AUTO_REPLY_WIZARD_STEPS[wizardIndex]?.targetId ?? null)
    : null
  const wizardNeedsTargets = Boolean(
    currentTargetId &&
      (RULES_TARGETS.has(currentTargetId) || MONITOR_TARGETS.has(currentTargetId)),
  )

  const showContent =
    isConnected === 'connected' || showSettingsPreview || wizardNeedsTargets

  // 未连接时只预览规则；运行监控仍需连接
  const showMonitorContent = isConnected === 'connected' || wizardNeedsTargets

  useLayoutEffect(() => {
    if (!currentTargetId) return
    if (RULES_TARGETS.has(currentTargetId)) {
      setTab('rules')
      setSearchParams({ tab: 'rules' }, { replace: true })
    } else if (MONITOR_TARGETS.has(currentTargetId)) {
      setTab('monitor')
      setSearchParams({ tab: 'monitor' }, { replace: true })
    }
  }, [currentTargetId, setSearchParams])

  const handleAutoReplyToggle = () => {
    if (isRunning) {
      setIsRunning(false)
      return
    }
    // 上次监听失败停在 error，先清掉，任务钩子才会重新启动监听
    if (isListening === 'error') {
      setIsListening('stopped')
    }
    setIsRunning(true)
  }

  return (
    <FeatureSetupWizard
      wizardId="auto-reply"
      title="自动回复设置向导"
      steps={AUTO_REPLY_WIZARD_STEPS}
      autoOpen={showContent && isConnected === 'connected'}
    >
      <div className="container py-8 space-y-4">
        <div className="flex items-center justify-between gap-4">
          <div className="min-w-0 flex-1 space-y-3">
            <Title
              title="自动回复"
              description="根据关键词或 AI 自动回复公屏评论。先配置回复规则，再点击「开始任务」。"
            />
            {showContent ? (
              <FeatureWizardTrigger
                wizardId="auto-reply"
                stepCount={AUTO_REPLY_WIZARD_STEPS.length}
              />
            ) : null}
          </div>
          {showContent ? (
            <WizardHighlight targetId="auto-reply-start" className="inline-flex shrink-0 p-1">
              <TaskButton isTaskRunning={isRunning} onStartStop={handleAutoReplyToggle} />
            </WizardHighlight>
          ) : null}
        </div>

        {!showContent ? (
          <ConnectRequiredEmpty
            settingsLabel="查看自动回复设置"
            onViewSettings={() => {
              setShowSettingsPreview(true)
              selectTab('rules')
            }}
          />
        ) : (
          <Tabs
            value={tab}
            onValueChange={value => selectTab(value as AutoReplyTab)}
            className="gap-4"
          >
            <TabsList>
              <TabsTrigger value="rules">回复规则</TabsTrigger>
              <TabsTrigger value="monitor">运行监控</TabsTrigger>
            </TabsList>

            <TabsContent
              value="rules"
              forceMount
              className="data-[state=inactive]:hidden"
            >
              <AutoReplySettingsPanel />
            </TabsContent>

            <TabsContent
              value="monitor"
              forceMount
              className="data-[state=inactive]:hidden"
            >
              {!showMonitorContent ? (
                <ConnectRequiredEmpty
                  settingsLabel="先配置回复规则"
                  onViewSettings={() => selectTab('rules')}
                />
              ) : (
                <div className="grid grid-cols-2 gap-4">
                  <CommentList highlight={highlightedCommentId} />
                  <WizardHighlight targetId="auto-reply-preview" className="min-h-[240px]">
                    <PreviewList setHighLight={setHighlightedCommentId} />
                  </WizardHighlight>
                </div>
              )}
            </TabsContent>
          </Tabs>
        )}
      </div>
    </FeatureSetupWizard>
  )
}
