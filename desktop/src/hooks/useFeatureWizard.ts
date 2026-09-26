import { create } from 'zustand'
import { persist } from 'zustand/middleware'

export type FeatureWizardId = 'auto-message' | 'auto-popup' | 'auto-reply'

export type WizardStepStatus = 'pending' | 'done' | 'skipped'

export interface FeatureWizardStepDef {
  id: string
  title: string
  description: string
  /** 主内容区确认按钮文案 */
  confirmLabel: string
  /** 对应页面上的高亮目标 id，与 WizardHighlight 的 targetId 一致 */
  targetId: string
  /** 可选：该步骤需要所在的路由，向导切换到此步时会自动跳转 */
  route?: string
}

interface WizardRuntime {
  open: boolean
  currentIndex: number
  statuses: WizardStepStatus[]
}

interface FeatureWizardState {
  dismissed: Record<FeatureWizardId, boolean>
  runtimes: Partial<Record<FeatureWizardId, WizardRuntime>>
  openWizard: (id: FeatureWizardId, stepCount: number) => void
  closeWizard: (id: FeatureWizardId) => void
  dismissWizard: (id: FeatureWizardId) => void
  setCurrentIndex: (id: FeatureWizardId, index: number) => void
  markStep: (id: FeatureWizardId, index: number, status: WizardStepStatus) => void
  resetWizard: (id: FeatureWizardId, stepCount: number) => void
}

function createRuntime(stepCount: number, open = true): WizardRuntime {
  return {
    open,
    currentIndex: 0,
    statuses: Array.from({ length: stepCount }, () => 'pending'),
  }
}

export const useFeatureWizardStore = create<FeatureWizardState>()(
  persist(
    (set, get) => ({
      dismissed: {
        'auto-message': false,
        'auto-popup': false,
        'auto-reply': false,
      },
      runtimes: {},
      openWizard: (id, stepCount) => {
        const existing = get().runtimes[id]
        if (!existing || existing.statuses.length !== stepCount) {
          set({
            runtimes: {
              ...get().runtimes,
              [id]: createRuntime(stepCount, true),
            },
          })
          return
        }
        set({
          runtimes: {
            ...get().runtimes,
            [id]: { ...existing, open: true },
          },
        })
      },
      closeWizard: id => {
        const existing = get().runtimes[id]
        if (!existing) return
        set({
          runtimes: {
            ...get().runtimes,
            [id]: { ...existing, open: false },
          },
        })
      },
      dismissWizard: id => {
        const existing = get().runtimes[id]
        set({
          dismissed: { ...get().dismissed, [id]: true },
          runtimes: {
            ...get().runtimes,
            [id]: existing ? { ...existing, open: false } : existing,
          },
        })
      },
      setCurrentIndex: (id, index) => {
        const existing = get().runtimes[id]
        if (!existing) return
        set({
          runtimes: {
            ...get().runtimes,
            [id]: { ...existing, currentIndex: index },
          },
        })
      },
      markStep: (id, index, status) => {
        const existing = get().runtimes[id]
        if (!existing) return
        const statuses = [...existing.statuses]
        statuses[index] = status
        set({
          runtimes: {
            ...get().runtimes,
            [id]: { ...existing, statuses },
          },
        })
      },
      resetWizard: (id, stepCount) => {
        set({
          dismissed: { ...get().dismissed, [id]: false },
          runtimes: {
            ...get().runtimes,
            [id]: createRuntime(stepCount, true),
          },
        })
      },
    }),
    {
      name: 'feature-wizard-storage',
      partialize: state => ({
        dismissed: state.dismissed,
      }),
    },
  ),
)
