import { Check, ChevronDown, ChevronRight, Play } from 'lucide-react'
import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router'
import { CarbonRocket } from '@/components/icons/carbon'
import { Button } from '@/components/ui/button'
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { useOnboardingProgress, useOnboardingStore } from '@/hooks/useOnboarding'
import { cn } from '@/lib/utils'

export function QuickStartDialog() {
  const navigate = useNavigate()
  const open = useOnboardingStore(s => s.quickStartOpen)
  const setQuickStartOpen = useOnboardingStore(s => s.setQuickStartOpen)
  const dismissedQuickStart = useOnboardingStore(s => s.dismissedQuickStart)
  const dismissQuickStart = useOnboardingStore(s => s.dismissQuickStart)
  const openQuickStart = useOnboardingStore(s => s.openQuickStart)
  const { steps, completedCount, currentStepIndex, allDone } = useOnboardingProgress()
  const [tipsOpen, setTipsOpen] = useState(false)
  const [hydrated, setHydrated] = useState(() => useOnboardingStore.persist.hasHydrated())

  useEffect(() => {
    const unsub = useOnboardingStore.persist.onFinishHydration(() => {
      setHydrated(true)
    })
    setHydrated(useOnboardingStore.persist.hasHydrated())
    return unsub
  }, [])

  useEffect(() => {
    if (!hydrated || dismissedQuickStart || allDone || open) return
    openQuickStart()
  }, [hydrated, dismissedQuickStart, allDone, open, openQuickStart])

  const handleOpenChange = (next: boolean) => {
    setQuickStartOpen(next)
    if (!next && !allDone) {
      dismissQuickStart()
    }
  }

  const handlePrimary = () => {
    if (allDone || currentStepIndex === 2) {
      navigate('/auto-message')
    } else {
      navigate('/')
    }
    setQuickStartOpen(false)
    if (!allDone) dismissQuickStart()
  }

  const handleLater = () => {
    dismissQuickStart()
  }

  const primaryLabel = allDone
    ? '去自动发言'
    : currentStepIndex <= 1
      ? '去连接直播控制台'
      : '去开启第一个任务'

  const statusText = allDone
    ? '首次配置已完成，可以开始使用'
    : `下一步：${steps[currentStepIndex]?.title ?? ''}`

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      {open ? (
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <CarbonRocket className="h-5 w-5 text-primary" />
              3分钟快速上手
            </DialogTitle>
            <DialogDescription>3 步完成首次开播配置</DialogDescription>
          </DialogHeader>

          <div className="space-y-4">
            <div className="rounded-lg border bg-muted/40 px-4 py-3">
              <div className="flex items-center justify-between gap-2">
                <p className="text-sm font-medium">{statusText}</p>
                <span className="shrink-0 text-xs text-muted-foreground">{completedCount}/3</span>
              </div>
            </div>

            <div className="space-y-2">
              {steps.map(step => {
                const isLocked = !step.done && !step.current
                return (
                  <div
                    key={step.id}
                    className={cn(
                      'rounded-lg border px-3 py-3 transition-colors',
                      step.done && 'border-emerald-500/50 bg-emerald-500/10',
                      step.current && 'border-destructive/60 bg-destructive/10',
                      isLocked && 'border-muted bg-muted/40 opacity-70',
                    )}
                  >
                    <div className="mb-1 flex items-center justify-between gap-2">
                      <div className="flex items-center gap-2">
                        {step.done ? (
                          <span className="flex h-5 w-5 items-center justify-center rounded-full bg-emerald-500 text-white">
                            <Check className="h-3 w-3" />
                          </span>
                        ) : (
                          <span
                            className={cn(
                              'flex h-5 w-5 items-center justify-center rounded-full border',
                              step.current
                                ? 'border-destructive/60 bg-destructive/15'
                                : 'border-muted-foreground/30 bg-muted',
                            )}
                          />
                        )}
                        <span className="text-sm font-medium">{step.title}</span>
                      </div>
                      <span
                        className={cn(
                          'rounded-full px-2 py-0.5 text-[11px]',
                          step.done && 'bg-emerald-500/15 text-emerald-700 dark:text-emerald-400',
                          step.current && 'bg-destructive/15 text-destructive',
                          isLocked && 'bg-muted text-muted-foreground',
                        )}
                      >
                        {step.done ? '已完成' : step.current ? '进行中' : '待完成'}
                      </span>
                    </div>
                    <p className="pl-7 text-xs leading-5 text-muted-foreground">
                      {step.description}
                    </p>
                  </div>
                )
              })}
            </div>

            <Collapsible open={tipsOpen} onOpenChange={setTipsOpen}>
              <CollapsibleTrigger asChild>
                <button
                  type="button"
                  className="flex w-full items-center justify-between rounded-md px-1 py-1 text-sm text-muted-foreground hover:text-foreground"
                >
                  平台提示
                  <ChevronDown
                    className={cn('h-4 w-4 transition-transform', tipsOpen && 'rotate-180')}
                  />
                </button>
              </CollapsibleTrigger>
              <CollapsibleContent className="space-y-1 px-1 pb-1 text-xs leading-5 text-muted-foreground">
                <p>首次连接请关闭无头模式，在弹出浏览器中扫码登录。</p>
                <p>视频号、淘宝请先开播再连接；淘宝会强制关闭无头模式。</p>
                <p>状态变为「已连接」后，再开启自动发言 / 弹窗 / 回复。</p>
              </CollapsibleContent>
            </Collapsible>
          </div>

          <DialogFooter className="gap-2 sm:justify-stretch">
            <Button variant="outline" className="sm:flex-1" onClick={handleLater}>
              稍后再说
            </Button>
            <Button className="sm:flex-1" onClick={handlePrimary}>
              {allDone ? <Play className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
              {primaryLabel}
            </Button>
          </DialogFooter>
        </DialogContent>
      ) : null}
    </Dialog>
  )
}
