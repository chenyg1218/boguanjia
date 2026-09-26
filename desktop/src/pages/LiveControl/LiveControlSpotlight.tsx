import { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react'
import { WizardHighlightProvider } from '@/components/onboarding/WizardTarget'

type SpotlightSetter = (targetId: string | null) => void

const LiveControlSpotlightContext = createContext<SpotlightSetter | null>(null)

export function useLiveControlSpotlight() {
  return useContext(LiveControlSpotlightContext)
}

/** 直播控制台：点击使用说明步骤时，高亮对应功能区 */
export function LiveControlSpotlightProvider({ children }: { children: React.ReactNode }) {
  const [targetId, setTargetId] = useState<string | null>(null)
  const clearTimerRef = useRef<number | null>(null)

  const highlight = useCallback((next: string | null) => {
    if (clearTimerRef.current) {
      window.clearTimeout(clearTimerRef.current)
      clearTimerRef.current = null
    }
    setTargetId(next)
    if (next) {
      // 高亮一段时间后自动收起，避免遮罩一直挡操作
      clearTimerRef.current = window.setTimeout(() => setTargetId(null), 3000)
    }
  }, [])

  useEffect(() => {
    return () => {
      if (clearTimerRef.current) window.clearTimeout(clearTimerRef.current)
    }
  }, [])

  return (
    <LiveControlSpotlightContext.Provider value={highlight}>
      <WizardHighlightProvider open={Boolean(targetId)} currentTargetId={targetId}>
        {children}
      </WizardHighlightProvider>
    </LiveControlSpotlightContext.Provider>
  )
}
