import React from 'react'
import { MoveItemButtons } from '@/components/common/MoveItemButtons'
import { RemoveCircleIcon } from '@/components/icons/RemoveCircleIcon'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'

interface GoodsItemData {
  id: number
  repeatCount?: number
  itemInterval?: [number, number]
}

// 商品列表项组件
const GoodsListItem = React.memo(function GoodsListItem({
  item,
  index,
  onChangeId,
  onChangeRepeatCount,
  onChangeItemInterval,
  onDelete,
  onMoveUp,
  onMoveDown,
  deletable = true,
  canMoveUp = false,
  canMoveDown = false,
}: {
  item: GoodsItemData
  index: number
  onChangeId: (index: number, value: string) => void
  onChangeRepeatCount: (index: number, value: number) => void
  onChangeItemInterval: (index: number, min: number, max: number) => void
  onDelete: () => void
  onMoveUp: () => void
  onMoveDown: () => void
  deletable?: boolean
  canMoveUp?: boolean
  canMoveDown?: boolean
}) {
  const repeatCount = item.repeatCount ?? 1
  const intervalMin = item.itemInterval ? item.itemInterval[0] / 1000 : 0
  const intervalMax = item.itemInterval ? item.itemInterval[1] / 1000 : 0

  return (
    <div className="flex gap-2 items-center group">
      <Input
        type="number"
        value={item.id}
        onChange={e => onChangeId(index, e.target.value)}
        className="w-20"
        min="1"
        placeholder="请输入序号"
        title="中控台商品列表中的序号"
      />
      <span className="text-xs text-muted-foreground whitespace-nowrap w-3 text-center">×</span>
      <Input
        type="number"
        value={repeatCount}
        onChange={e => onChangeRepeatCount(index, Number(e.target.value) || 1)}
        className="w-20"
        min="1"
        max="10000"
        placeholder="请输入次数"
        title="一轮里连续弹几次该商品"
      />
      <span className="text-xs text-muted-foreground whitespace-nowrap w-4 text-center">次</span>
      <Input
        type="number"
        value={intervalMin}
        onChange={e => onChangeItemInterval(index, Number(e.target.value) || 0, intervalMax)}
        className="w-20"
        min="0"
        max="20000"
        placeholder="最小"
        title="该品讲解时长最小值（秒），0 表示用下方每品讲解时长"
      />
      <span className="text-xs text-muted-foreground">~</span>
      <Input
        type="number"
        value={intervalMax}
        onChange={e => onChangeItemInterval(index, intervalMin, Number(e.target.value) || 0)}
        className="w-20"
        min="0"
        max="20000"
        placeholder="最大"
        title="该品讲解时长最大值（秒），0 表示用下方每品讲解时长"
      />
      <MoveItemButtons
        canMoveUp={canMoveUp}
        canMoveDown={canMoveDown}
        onMoveUp={onMoveUp}
        onMoveDown={onMoveDown}
      />
      {deletable ? (
        <Button
          variant="ghost"
          size="sm"
          onClick={onDelete}
          className="h-7 w-7 shrink-0 px-0 text-muted-foreground hover:text-destructive shadow-none"
          title="删除商品"
          aria-label="删除商品"
        >
          <RemoveCircleIcon className="!size-5" />
        </Button>
      ) : (
        <div className="h-7 w-7 shrink-0" />
      )}
    </div>
  )
})

export default GoodsListItem
