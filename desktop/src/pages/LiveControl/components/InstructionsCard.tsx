import { Check, CircleHelp } from 'lucide-react'
import React from 'react'
import { useNavigate } from 'react-router'
import { platformDisplayName } from 'shared/platforms'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { useCurrentLiveControl } from '@/hooks/useLiveControl'
import { type OnboardingStepId, useOnboardingProgress } from '@/hooks/useOnboarding'
import { useToast } from '@/hooks/useToast'
import { cn } from '@/lib/utils'
import { useLiveControlSpotlight } from '../LiveControlSpotlight'

const CURRENT_ACTION: Record<OnboardingStepId, string> = {
  platform: '请在上方选择要开播的平台',
  connect: '请点击上方「连接直播控制台」，在弹出浏览器中扫码登录',
  task: '请到左侧开启自动发言、自动弹窗或自动回复',
}

const STEP_SPOTLIGHT: Record<OnboardingStepId, string | null> = {
  platform: 'live-platform',
  connect: 'live-connect',
  task: null,
}

const InstructionsCard = React.memo(() => {
  const platform = useCurrentLiveControl(state => state.platform)
  const { steps, completedCount, currentStepIndex, allDone } = useOnboardingProgress()
  const { toast } = useToast()
  const navigate = useNavigate()
  const spotlight = useLiveControlSpotlight()
  const platformName = platformDisplayName(platform)
  const currentStep = currentStepIndex >= 0 ? steps[currentStepIndex] : null

  const handleStepClick = (stepId: OnboardingStepId, done: boolean, current: boolean) => {
    const targetId = STEP_SPOTLIGHT[stepId]
    if (targetId) {
      spotlight?.(targetId)
    }

    if (stepId === 'platform' && done) {
      toast.success(`已选择「${platformName}」，可进行下一步`)
      return
    }
    if (done) {
      toast.success(stepId === 'connect' ? '已连接到直播控制台' : '已开启过自动任务')
      return
    }
    if (current) {
      toast.info(CURRENT_ACTION[stepId])
      if (stepId === 'task') navigate('/auto-message')
      return
    }
    toast.info('请先完成前一步骤')
  }

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center gap-2">
          <CircleHelp className="h-4 w-4 text-muted-foreground" />
          使用说明
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        <div
          className={cn(
            'rounded-lg border px-4 py-2.5',
            allDone
              ? 'border-emerald-500/40 bg-emerald-500/10'
              : 'border-destructive/40 bg-destructive/10',
          )}
        >
          <div className="mb-1 flex items-center justify-between gap-3">
            <p className="text-sm font-semibold">
              {allDone
                ? '首次配置已完成，可以开始使用'
                : `当前第 ${currentStepIndex + 1} 步：${currentStep?.title ?? ''}`}
            </p>
            <span className="shrink-0 text-xs font-medium tabular-nums text-muted-foreground">
              {completedCount}/3
            </span>
          </div>
          <p className="text-sm leading-5 text-muted-foreground">
            {allDone
              ? '掉线后重新连接直播控制台即可继续。'
              : CURRENT_ACTION[currentStep?.id ?? 'connect']}
          </p>
        </div>

        <div className="grid gap-2 md:grid-cols-[1fr_auto_1fr_auto_1fr] md:items-stretch">
          {steps.map((step, index) => {
            const isLocked = !step.done && !step.current
            const description =
              step.id === 'platform' && step.done ? `已选择「${platformName}」` : step.description

            return (
              <React.Fragment key={step.id}>
                {index > 0 && (
                  <div
                    className={cn(
                      'hidden items-center justify-center md:flex',
                      step.done || steps[index - 1]?.done
                        ? 'text-emerald-600'
                        : 'text-muted-foreground',
                    )}
                  >
                    ›
                  </div>
                )}
                <button
                  type="button"
                  onClick={() => handleStepClick(step.id, step.done, step.current)}
                  className={cn(
                    'rounded-lg border px-3 py-2.5 text-left transition-all',
                    'hover:shadow-sm active:scale-[0.98] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
                    step.done && 'border-emerald-500/50 bg-emerald-500/10',
                    step.current &&
                      'border-destructive/60 bg-destructive/10 ring-2 ring-destructive/30',
                    isLocked && 'border-muted bg-muted/40 opacity-70',
                  )}
                >
                  <div className="mb-1.5 flex items-center justify-between gap-2">
                    <div className="flex min-w-0 items-center gap-2">
                      {step.done ? (
                        <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-md bg-emerald-500 text-white">
                          <Check className="h-3.5 w-3.5" />
                        </span>
                      ) : (
                        <span
                          className={cn(
                            'flex h-6 w-6 shrink-0 items-center justify-center rounded-md text-sm font-medium',
                            step.current
                              ? 'bg-destructive text-destructive-foreground'
                              : 'bg-muted-foreground/20 text-muted-foreground',
                          )}
                        >
                          {index + 1}
                        </span>
                      )}
                      <span className="truncate text-sm font-medium">{step.title}</span>
                    </div>
                    <span
                      className={cn(
                        'shrink-0 rounded-full px-2 py-0.5 text-[11px]',
                        step.done && 'bg-emerald-500/15 text-emerald-700',
                        step.current && 'bg-destructive/15 text-destructive',
                        isLocked && 'bg-muted text-muted-foreground',
                      )}
                    >
                      {step.done ? '已完成' : step.current ? '进行中' : '待完成'}
                    </span>
                  </div>
                  <p className="text-xs leading-5 text-muted-foreground">{description}</p>
                </button>
              </React.Fragment>
            )
          })}
        </div>
      </CardContent>
    </Card>
  )
})

export default InstructionsCard
