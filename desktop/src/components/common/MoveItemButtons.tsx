import { ArrowMoveIcon } from '@/components/icons/ArrowMoveIcon'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'

/** 列表子项上移 / 下移：默认隐藏，行悬停时显示；无背景图标 + 悬浮提示 */
export function MoveItemButtons({
  onMoveUp,
  onMoveDown,
  canMoveUp,
  canMoveDown,
  disabled,
  className,
}: {
  onMoveUp: () => void
  onMoveDown: () => void
  canMoveUp: boolean
  canMoveDown: boolean
  disabled?: boolean
  className?: string
}) {
  return (
    <div
      className={cn(
        'flex items-center gap-0.5 shrink-0 opacity-0 transition-opacity group-hover:opacity-100 focus-within:opacity-100 group-focus-within:opacity-100',
        className,
      )}
    >
      <Button
        type="button"
        variant="ghost"
        size="sm"
        className="h-7 w-7 px-0 shadow-none"
        title="上移"
        aria-label="上移"
        disabled={disabled || !canMoveUp}
        onClick={onMoveUp}
      >
        <ArrowMoveIcon className="!size-3.5" />
      </Button>
      <Button
        type="button"
        variant="ghost"
        size="sm"
        className="h-7 w-7 px-0 shadow-none"
        title="下移"
        aria-label="下移"
        disabled={disabled || !canMoveDown}
        onClick={onMoveDown}
      >
        <ArrowMoveIcon className="!size-3.5 rotate-180" />
      </Button>
    </div>
  )
}
