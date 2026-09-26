import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
} from 'react'
import { createPortal } from 'react-dom'
import { cn } from '@/lib/utils'

interface WizardHighlightContextValue {
  open: boolean
  currentTargetId: string | null
}

type SpotlightFn = (targetId: string | null, durationMs?: number) => void

const WizardHighlightContext = createContext<WizardHighlightContextValue | null>(null)
const WizardSpotlightContext = createContext<SpotlightFn | null>(null)

export function WizardHighlightProvider({
  open,
  currentTargetId,
  children,
  wizardId: _wizardId,
}: WizardHighlightContextValue & {
  children: React.ReactNode
  /** 保留兼容，高亮逻辑不依赖该字段 */
  wizardId?: string
}) {
  void _wizardId
  const [tempTargetId, setTempTargetId] = useState<string | null>(null)
  const clearTimerRef = useRef<number | null>(null)

  const highlight = useCallback<SpotlightFn>((next, durationMs = 3000) => {
    if (clearTimerRef.current) {
      window.clearTimeout(clearTimerRef.current)
      clearTimerRef.current = null
    }
    setTempTargetId(next)
    if (next) {
      clearTimerRef.current = window.setTimeout(() => setTempTargetId(null), durationMs)
    }
  }, [])

  useEffect(() => {
    return () => {
      if (clearTimerRef.current) window.clearTimeout(clearTimerRef.current)
    }
  }, [])

  const effectiveOpen = Boolean(tempTargetId) || open
  const effectiveTargetId = tempTargetId ?? currentTargetId

  return (
    <WizardSpotlightContext.Provider value={highlight}>
      <WizardHighlightContext.Provider
        value={{ open: effectiveOpen, currentTargetId: effectiveTargetId }}
      >
        {children}
      </WizardHighlightContext.Provider>
    </WizardSpotlightContext.Provider>
  )
}

export function useWizardHighlight() {
  return useContext(WizardHighlightContext)
}

/** 临时高亮某一功能区（如使用说明「去设置」），默认约 3 秒后自动收起 */
export function useWizardSpotlight() {
  return useContext(WizardSpotlightContext)
}

function scrollTargetIntoView(el: HTMLElement) {
  const scrollParent = el.closest('.overflow-y-auto, .overflow-auto') as HTMLElement | null
  if (scrollParent) {
    const parentRect = scrollParent.getBoundingClientRect()
    const elRect = el.getBoundingClientRect()
    const offset =
      elRect.top -
      parentRect.top -
      (parentRect.height / 2 - elRect.height / 2) +
      scrollParent.scrollTop
    scrollParent.scrollTo({ top: Math.max(0, offset), behavior: 'smooth' })
    return
  }
  el.scrollIntoView({ behavior: 'smooth', block: 'nearest', inline: 'nearest' })
}

interface SpotlightRect {
  top: number
  left: number
  width: number
  height: number
}

/** fixed 聚光灯：阴影不参与文档流，不会撑开滚动高度导致「多页重复」 */
function SpotlightOverlay({ target }: { target: HTMLElement }) {
  const [rect, setRect] = useState<SpotlightRect | null>(null)

  useLayoutEffect(() => {
    const update = () => {
      const r = target.getBoundingClientRect()
      // 外扩，让橙色描边与内部文字/控件留出间距
      const pad = 10
      setRect({
        top: r.top - pad,
        left: r.left - pad,
        width: r.width + pad * 2,
        height: r.height + pad * 2,
      })
    }
    update()
    window.addEventListener('resize', update)
    // 跟随内部滚动容器
    const scrollParents: Element[] = []
    let node: Element | null = target.parentElement
    while (node) {
      const style = getComputedStyle(node)
      if (/(auto|scroll|overlay)/.test(style.overflowY) || /(auto|scroll|overlay)/.test(style.overflow)) {
        scrollParents.push(node)
        node.addEventListener('scroll', update, { passive: true })
      }
      node = node.parentElement
    }
    return () => {
      window.removeEventListener('resize', update)
      for (const p of scrollParents) p.removeEventListener('scroll', update)
    }
  }, [target])

  if (!rect) return null

  return createPortal(
    <div
      aria-hidden
      className="pointer-events-none fixed z-30 rounded-xl"
      style={{
        top: rect.top,
        left: rect.left,
        width: rect.width,
        height: rect.height,
        // 洞内保持原白底；仅橙色描边 + 外侧暗色遮罩（fixed 阴影不撑开滚动）
        backgroundColor: 'transparent',
        border: '2px solid #f97316',
        boxShadow: '0 0 0 9999px rgba(15, 23, 42, 0.45)',
        // 描边画在盒外，避免被同尺寸内容完全盖住
        boxSizing: 'border-box',
      }}
    />,
    document.body,
  )
}

/** 功能区包装：当前步骤时橙色描边 + 暗色遮罩，并滚动到可视区域 */
export function WizardHighlight({
  targetId,
  children,
  className,
}: {
  targetId: string
  children: React.ReactNode
  className?: string
}) {
  const ctx = useWizardHighlight()
  const ref = useRef<HTMLDivElement>(null)
  const [activeEl, setActiveEl] = useState<HTMLElement | null>(null)
  const isActive = Boolean(ctx?.open && ctx.currentTargetId === targetId)

  useLayoutEffect(() => {
    setActiveEl(isActive && ref.current ? ref.current : null)
  }, [isActive, ctx?.currentTargetId])

  useEffect(() => {
    if (!isActive || !ref.current) return
    // 跨路由切换时等多一拍，等目标节点布局完成
    const timer = window.setTimeout(() => {
      if (ref.current) scrollTargetIntoView(ref.current)
    }, 120)
    return () => window.clearTimeout(timer)
  }, [isActive, ctx?.currentTargetId])

  return (
    <>
      {activeEl ? <SpotlightOverlay target={activeEl} /> : null}
      <div
        ref={ref}
        data-wizard-target={targetId}
        data-wizard-active={isActive ? 'true' : undefined}
        className={cn(
          'rounded-xl transition-all duration-300',
          // 不抬高内容 z-index，否则会盖住 fixed 聚光灯的橙色描边
          className,
        )}
      >
        {children}
      </div>
    </>
  )
}
