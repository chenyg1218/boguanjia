import { useMemo } from 'react'
import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import { useAccounts } from './useAccounts'
import { useCurrentAutoMessage } from './useAutoMessage'
import { useCurrentAutoPopUp } from './useAutoPopUp'
import { useAutoReplyStore } from './useAutoReply'
import { useCurrentLiveControl } from './useLiveControl'

export type OnboardingStepId = 'platform' | 'connect' | 'task'

export interface OnboardingStep {
  id: OnboardingStepId
  title: string
  description: string
  done: boolean
  current: boolean
}

interface OnboardingState {
  dismissedQuickStart: boolean
  hasConnectedOnce: boolean
  hasStartedTaskOnce: boolean
  quickStartOpen: boolean
  markConnectedOnce: () => void
  markStartedTaskOnce: () => void
  dismissQuickStart: () => void
  openQuickStart: () => void
  closeQuickStart: () => void
  setQuickStartOpen: (open: boolean) => void
}

export const useOnboardingStore = create<OnboardingState>()(
  persist(
    set => ({
      dismissedQuickStart: false,
      hasConnectedOnce: false,
      hasStartedTaskOnce: false,
      quickStartOpen: false,
      markConnectedOnce: () => set({ hasConnectedOnce: true }),
      markStartedTaskOnce: () => set({ hasStartedTaskOnce: true }),
      dismissQuickStart: () => set({ dismissedQuickStart: true, quickStartOpen: false }),
      // 延迟打开，避免触发按钮的同一次 click 被 Dialog 当成「点外部」立刻关掉
      openQuickStart: () => {
        window.setTimeout(() => set({ quickStartOpen: true }), 0)
      },
      closeQuickStart: () => set({ quickStartOpen: false }),
      setQuickStartOpen: open => set({ quickStartOpen: open }),
    }),
    {
      name: 'onboarding-storage',
      partialize: state => ({
        dismissedQuickStart: state.dismissedQuickStart,
        hasConnectedOnce: state.hasConnectedOnce,
        hasStartedTaskOnce: state.hasStartedTaskOnce,
      }),
    },
  ),
)

export function useOnboardingProgress() {
  const platform = useCurrentLiveControl(s => s.platform)
  const isConnected = useCurrentLiveControl(s => s.isConnected)
  const isAutoMessageRunning = useCurrentAutoMessage(s => s.isRunning)
  const isAutoPopUpRunning = useCurrentAutoPopUp(s => s.isRunning)
  const currentAccountId = useAccounts(s => s.currentAccountId)
  const isAutoReplyRunning = useAutoReplyStore(
    s => s.contexts[currentAccountId]?.isRunning ?? false,
  )
  const hasStartedTaskOnce = useOnboardingStore(s => s.hasStartedTaskOnce)

  return useMemo(() => {
    const platformDone = Boolean(platform)
    // 以当前真实连接状态为准，避免曾连接过却已断开时仍显示「已完成」
    const connectDone = platformDone && isConnected === 'connected'
    // 必须先连上中控台，第三步才算完成；掉线时即使以前开过任务也不显示「已完成」
    const taskDone =
      connectDone &&
      (isAutoMessageRunning || isAutoPopUpRunning || isAutoReplyRunning || hasStartedTaskOnce)

    const doneFlags = [platformDone, connectDone, taskDone]
    const completedCount = doneFlags.filter(Boolean).length
    const currentStepIndex = doneFlags.findIndex(done => !done)
    const allDone = completedCount === 3

    const defs: Omit<OnboardingStep, 'done' | 'current'>[] = [
      {
        id: 'platform',
        title: '选择直播平台',
        description: '在上方选择要开播的平台',
      },
      {
        id: 'connect',
        title: '连接直播中控台',
        description: '点击「连接直播控制台」，扫码登录',
      },
      {
        id: 'task',
        title: '开启第一个任务',
        description: '到左侧开启自动发言、弹窗或回复',
      },
    ]

    const steps: OnboardingStep[] = defs.map((def, index) => ({
      ...def,
      done: doneFlags[index],
      current: !allDone && index === currentStepIndex,
    }))

    return {
      steps,
      completedCount,
      currentStepIndex: allDone ? -1 : currentStepIndex,
      allDone,
      remaining: 3 - completedCount,
    }
  }, [
    platform,
    isConnected,
    isAutoMessageRunning,
    isAutoPopUpRunning,
    isAutoReplyRunning,
    hasStartedTaskOnce,
  ])
}
