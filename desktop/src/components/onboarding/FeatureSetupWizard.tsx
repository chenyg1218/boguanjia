import { ChevronLeft, Compass, X } from 'lucide-react'
import { useEffect, useState } from 'react'
import { useLocation, useNavigate } from 'react-router'
import { Button } from '@/components/ui/button'
import type {
  FeatureWizardId,
  FeatureWizardStepDef,
  WizardStepStatus,
} from '@/hooks/useFeatureWizard'
import { useFeatureWizardStore } from '@/hooks/useFeatureWizard'
import { useToast } from '@/hooks/useToast'
import { cn } from '@/lib/utils'
import { WizardHighlightProvider } from './WizardTarget'

interface FeatureSetupWizardProps {
  wizardId: FeatureWizardId
  title: string
  steps: FeatureWizardStepDef[]
  /** 是否自动弹出（首次进入且未 dismiss） */
  autoOpen?: boolean
  children: React.ReactNode
}

function ProgressSegments({
  statuses,
  currentIndex,
}: {
  statuses: WizardStepStatus[]
  currentIndex: number
}) {
  return (
    <div className="flex gap-1.5" aria-hidden>
      {statuses.map((status, index) => {
        const isCurrent = index === currentIndex
        return (
          <div
            key={index}
            className={cn(
              'h-1.5 flex-1 rounded-full transition-colors',
              isCurrent && 'bg-orange-500',
              !isCurrent && status === 'done' && 'bg-emerald-500',
              !isCurrent && status === 'skipped' && 'bg-teal-700/80',
              !isCurrent && status === 'pending' && 'bg-muted-foreground/25',
            )}
          />
        )
      })}
    </div>
  )
}

export function FeatureSetupWizard({
  wizardId,
  title,
  steps,
  autoOpen = true,
  children,
}: FeatureSetupWizardProps) {
  const dismissed = useFeatureWizardStore(s => s.dismissed[wizardId])
  const runtime = useFeatureWizardStore(s => s.runtimes[wizardId])
  const openWizard = useFeatureWizardStore(s => s.openWizard)
  const dismissWizard = useFeatureWizardStore(s => s.dismissWizard)
  const setCurrentIndex = useFeatureWizardStore(s => s.setCurrentIndex)
  const markStep = useFeatureWizardStore(s => s.markStep)
  const navigate = useNavigate()
  const location = useLocation()
  const { toast } = useToast()

  const [hydrated, setHydrated] = useState(() => useFeatureWizardStore.persist.hasHydrated())

  useEffect(() => {
    const unsub = useFeatureWizardStore.persist.onFinishHydration(() => setHydrated(true))
    setHydrated(useFeatureWizardStore.persist.hasHydrated())
    return unsub
  }, [])

  useEffect(() => {
    if (!hydrated || !autoOpen || dismissed || runtime?.open) return
    openWizard(wizardId, steps.length)
  }, [hydrated, autoOpen, dismissed, runtime?.open, openWizard, wizardId, steps.length])

  const open = runtime?.open ?? false
  const currentIndex = runtime?.currentIndex ?? 0
  const statuses = runtime?.statuses ?? steps.map(() => 'pending' as WizardStepStatus)
  const step = steps[currentIndex]
  const isLast = currentIndex >= steps.length - 1
  const canFinish = statuses.every(s => s === 'done' || s === 'skipped')

  useEffect(() => {
    if (!open || !step?.route) return
    if (location.pathname !== step.route) {
      navigate(step.route)
    }
  }, [open, currentIndex, step?.route, location.pathname, navigate])

  const advanceAfter = (status: WizardStepStatus) => {
    markStep(wizardId, currentIndex, status)
    if (!isLast) {
      setCurrentIndex(wizardId, currentIndex + 1)
    }
  }

  const handleConfirm = () => {
    if (isLast && statuses[currentIndex] !== 'pending') {
      dismissWizard(wizardId)
      return
    }
    advanceAfter('done')
  }

  const handleSkip = () => {
    if (isLast && statuses[currentIndex] !== 'pending') {
      dismissWizard(wizardId)
      return
    }
    advanceAfter('skipped')
  }

  const handlePrev = () => {
    if (currentIndex <= 0) return
    setCurrentIndex(wizardId, currentIndex - 1)
  }

  const handleFinish = () => {
    if (statuses[currentIndex] === 'pending') {
      markStep(wizardId, currentIndex, 'done')
    }
    dismissWizard(wizardId)
  }

  const handleClose = () => {
    dismissWizard(wizardId)
    toast.info('不会配置时可点上方「打开向导」继续引导')
  }

  const currentTargetId = open && step ? step.targetId : null

  return (
    <WizardHighlightProvider wizardId={wizardId} open={open} currentTargetId={currentTargetId}>
      {children}

      {open && step ? (
        <div className="pointer-events-none fixed inset-x-0 bottom-0 z-40 flex justify-end p-4 sm:p-6">
          <div
            className="pointer-events-auto w-full max-w-sm overflow-hidden rounded-xl border bg-card text-card-foreground shadow-2xl"
            role="dialog"
            aria-labelledby={`feature-wizard-title-${wizardId}`}
          >
            <div className="space-y-3 border-b px-4 pb-3 pt-4">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    <Compass className="h-4 w-4 shrink-0 text-orange-500" />
                    <h2
                      id={`feature-wizard-title-${wizardId}`}
                      className="truncate text-sm font-semibold"
                    >
                      {title}
                    </h2>
                  </div>
                  <p className="mt-1 text-xs text-muted-foreground">
                    第 {currentIndex + 1} 步 / {steps.length}
                  </p>
                </div>
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  className="h-7 w-7 shrink-0"
                  onClick={handleClose}
                  aria-label="关闭向导"
                >
                  <X className="h-4 w-4" />
                </Button>
              </div>
              <ProgressSegments statuses={statuses} currentIndex={currentIndex} />
              <div className="flex items-center gap-3 text-[10px] text-muted-foreground">
                <span className="inline-flex items-center gap-1">
                  <span className="h-1.5 w-3 rounded-full bg-emerald-500" />
                  已完成
                </span>
                <span className="inline-flex items-center gap-1">
                  <span className="h-1.5 w-3 rounded-full bg-orange-500" />
                  当前
                </span>
                <span className="inline-flex items-center gap-1">
                  <span className="h-1.5 w-3 rounded-full bg-teal-700/80" />
                  已跳过
                </span>
              </div>
            </div>

            <div className="space-y-3 px-4 py-4">
              <div>
                <h3 className="text-sm font-medium">{step.title}</h3>
                <p className="mt-1.5 text-xs leading-5 text-muted-foreground">{step.description}</p>
              </div>
              <Button className="w-full bg-orange-500 hover:bg-orange-600" onClick={handleConfirm}>
                {step.confirmLabel}
              </Button>
            </div>

            <div className="flex items-center gap-2 border-t px-4 py-3">
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="flex-1"
                disabled={currentIndex === 0}
                onClick={handlePrev}
              >
                <ChevronLeft className="h-3.5 w-3.5" />
                上一步
              </Button>
              <Button
                type="button"
                size="sm"
                className="flex-1 bg-orange-500 hover:bg-orange-600"
                onClick={handleSkip}
              >
                跳过本步
              </Button>
              <Button
                type="button"
                variant="secondary"
                size="sm"
                className="flex-1"
                disabled={!canFinish}
                onClick={handleFinish}
              >
                完成
              </Button>
            </div>
          </div>
        </div>
      ) : null}
    </WizardHighlightProvider>
  )
}

/** 重新打开某功能设置向导的入口；关闭后展示更醒目的「不会配置」引导 */
export function FeatureWizardTrigger({
  wizardId,
  stepCount,
  label = '设置向导',
  className,
}: {
  wizardId: FeatureWizardId
  stepCount: number
  label?: string
  className?: string
}) {
  const resetWizard = useFeatureWizardStore(s => s.resetWizard)
  const open = useFeatureWizardStore(s => s.runtimes[wizardId]?.open ?? false)
  const dismissed = useFeatureWizardStore(s => s.dismissed[wizardId])

  const handleOpen = () => resetWizard(wizardId, stepCount)

  // 用户关掉向导后：用条幅提示，避免只剩一个不起眼的小按钮
  if (dismissed && !open) {
    return (
      <div
        className={cn(
          'flex w-full max-w-lg flex-wrap items-center justify-between gap-3 rounded-lg border border-orange-500/35 bg-orange-500/10 px-3 py-2.5',
          className,
        )}
      >
        <div className="min-w-0">
          <p className="text-sm font-medium">不会配置？用设置向导一步步来</p>
          <p className="mt-0.5 text-xs text-muted-foreground">
            会高亮本页对应区域，跟着点就行
          </p>
        </div>
        <Button
          type="button"
          size="sm"
          className="shrink-0 bg-orange-500 hover:bg-orange-600"
          onClick={handleOpen}
        >
          <Compass className="h-3.5 w-3.5" />
          打开向导
        </Button>
      </div>
    )
  }

  return (
    <Button
      type="button"
      variant="outline"
      size="sm"
      className={className}
      disabled={open}
      onClick={handleOpen}
    >
      <Compass className="h-3.5 w-3.5" />
      {label}
    </Button>
  )
}
