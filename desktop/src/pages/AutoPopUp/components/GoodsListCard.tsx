import { useMemoizedFn } from 'ahooks'
import { ListPlusIcon, PlusIcon, RefreshCwIcon } from 'lucide-react'
import React, { useState } from 'react'
import { IPC_CHANNELS } from 'shared/ipcChannels'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { useAccounts } from '@/hooks/useAccounts'
import { useAutoPopUpActions, useCurrentAutoPopUp } from '@/hooks/useAutoPopUp'
import { useCurrentLiveControl } from '@/hooks/useLiveControl'
import { useToast } from '@/hooks/useToast'
import { parseGoodsIdBatch } from '@/utils/goodsIds'
import { WizardHighlight } from '@/components/onboarding/WizardTarget'
import { useGoodsCardTab } from '../GoodsCardTabContext'
import GoodsListItem from './GoodsListItem'
import ShortcutConfigTab from './ShortcutConfigTab'

const CommonList = () => {
  const goodsIds = useCurrentAutoPopUp(context => context.config.goodsIds)
  const goodsItems = useCurrentAutoPopUp(context => context.config.goodsItems)
  const { setGoodsIds, setGoodsItems } = useAutoPopUpActions()
  const { toast } = useToast()
  const [batchOpen, setBatchOpen] = useState(false)
  const [batchText, setBatchText] = useState('')
  const [filling, setFilling] = useState(false)
  const isConnected = useCurrentLiveControl(c => c.isConnected)
  const account = useAccounts(s => s.getCurrentAccount())

  // 合并 goodsItems 和 goodsIds：以 goodsItems 为主，goodsIds 作为兼容
  const items = React.useMemo(() => {
    if (goodsItems && goodsItems.length > 0) return goodsItems
    return goodsIds.map(id => ({ id, repeatCount: 1, itemInterval: undefined }))
  }, [goodsItems, goodsIds])

  // 同步更新 goodsIds 和 goodsItems
  const syncUpdate = useMemoizedFn((newItems: typeof items) => {
    setGoodsItems(newItems)
    setGoodsIds(newItems.map(item => item.id))
  })

  const handleGoodsIdChange = useMemoizedFn((index: number, value: string) => {
    const numValue = Number(value)
    if (Number.isNaN(numValue) || numValue < 1) {
      toast.error('请输入有效的商品序号')
      return
    }
    if (items.some((item, i) => item.id === numValue && i !== index)) {
      toast.error('商品序号不能重复！')
      return
    }
    const newItems = items.map((item, i) => (i === index ? { ...item, id: numValue } : item))
    syncUpdate(newItems)
  })

  const handleRepeatCountChange = useMemoizedFn((index: number, value: number) => {
    const count = Math.max(1, Math.min(Math.floor(value), 10000))
    const newItems = items.map((item, i) => (i === index ? { ...item, repeatCount: count } : item))
    syncUpdate(newItems)
  })

  const handleItemIntervalChange = useMemoizedFn((index: number, min: number, max: number) => {
    const minMs = Math.max(0, Math.floor(min)) * 1000
    const maxMs = Math.max(0, Math.floor(max)) * 1000
    const newItems = items.map((item, i) =>
      i === index
        ? {
            ...item,
            itemInterval:
              minMs === 0 && maxMs === 0 ? undefined : ([minMs, maxMs] as [number, number]),
          }
        : item,
    )
    syncUpdate(newItems)
  })

  const addGoodsId = useMemoizedFn(() => {
    let id = 1
    while (items.some(item => item.id === id)) id += 1
    syncUpdate([...items, { id, repeatCount: 1, itemInterval: undefined }])
  })

  const handleFillFromLiveControl = useMemoizedFn(async () => {
    if (!account) {
      toast.error('当前账号无效')
      return
    }
    if (isConnected !== 'connected') {
      toast.error('请先连接直播控制台')
      return
    }
    if (items.length > 0) {
      toast.error('商品列表非空时不会自动覆盖；请先清空或改用批量添加')
      return
    }
    setFilling(true)
    try {
      const result = await window.ipcRenderer.invoke(
        IPC_CHANNELS.tasks.autoPopUp.listGoodsIds,
        account.id,
      )
      if (!result.ok) {
        toast.error(result.error || '读取商品序号失败')
        return
      }
      if (result.goodsIds.length === 0) {
        toast.error('未在中控台读到商品序号，请确认商品列表已加载')
        return
      }
      syncUpdate(result.goodsIds.map(id => ({ id, repeatCount: 1, itemInterval: undefined })))
      toast.success(`已从中控台填充 ${result.goodsIds.length} 个商品序号`)
    } catch (error) {
      toast.error(error instanceof Error ? error.message : '读取商品序号失败')
    } finally {
      setFilling(false)
    }
  })

  const handleBatchAdd = useMemoizedFn(() => {
    const parsed = parseGoodsIdBatch(batchText)
    if (parsed.length === 0) {
      toast.error('请输入有效的商品序号，例如 1-100 或 1,3,5-8')
      return
    }

    const existing = new Set(items.map(item => item.id))
    const toAdd = parsed.filter(id => !existing.has(id))
    if (toAdd.length === 0) {
      toast.error('这些序号都已在列表中')
      return
    }

    syncUpdate([...items, ...toAdd.map(id => ({ id, repeatCount: 1, itemInterval: undefined }))])

    const skipped = parsed.length - toAdd.length
    toast.success(
      skipped > 0
        ? `已添加 ${toAdd.length} 个商品，跳过 ${skipped} 个重复序号`
        : `已添加 ${toAdd.length} 个商品`,
    )
    setBatchText('')
    setBatchOpen(false)
  })

  return (
    <>
      <div className="space-y-1">
        <div className="flex items-center justify-between gap-2">
          <Label>商品列表</Label>
          <div className="flex shrink-0 flex-wrap items-center justify-end gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={handleFillFromLiveControl}
              disabled={filling || isConnected !== 'connected'}
            >
              <RefreshCwIcon className={`mr-0 h-4 w-4 ${filling ? 'animate-spin' : ''}`} />
              {filling ? '读取中…' : '自动填充'}
            </Button>
            <Button variant="outline" size="sm" onClick={() => setBatchOpen(true)}>
              <ListPlusIcon className="mr-0 h-4 w-4" />
              批量添加
            </Button>
            <Button variant="outline" size="sm" onClick={addGoodsId}>
              <PlusIcon className="mr-0 h-4 w-4" />
              添加商品
            </Button>
          </div>
        </div>
        <p className="text-sm text-muted-foreground">
          填中控台商品列表里的序号。循环次数 = 这一轮连续弹几次；时长填 0 就用下面的每品讲解时长。
        </p>
      </div>

      <div className="space-y-3">
        {items.map((item, index) => (
          <GoodsListItem
            // biome-ignore lint/suspicious/noArrayIndexKey: 下标不影响
            key={index}
            item={item}
            index={index}
            onChangeId={handleGoodsIdChange}
            onChangeRepeatCount={handleRepeatCountChange}
            onChangeItemInterval={handleItemIntervalChange}
            onDelete={() => {
              syncUpdate(items.filter((_, i) => i !== index))
            }}
          />
        ))}
      </div>

      <Dialog open={batchOpen} onOpenChange={setBatchOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>批量添加</DialogTitle>
            <DialogDescription>
              支持区间与列表，例如 <code>1-100</code>、<code>1,3,5-8</code>。已存在的序号会跳过。
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-2">
            <Label htmlFor="batch-goods-ids">商品序号</Label>
            <Input
              id="batch-goods-ids"
              value={batchText}
              onChange={e => setBatchText(e.target.value)}
              placeholder="例如 1-100"
              onKeyDown={e => {
                if (e.key === 'Enter') {
                  e.preventDefault()
                  handleBatchAdd()
                }
              }}
            />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setBatchOpen(false)}>
              取消
            </Button>
            <Button onClick={handleBatchAdd}>添加</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  )
}

// 商品列表卡片组件
const GoodsListCard = React.memo(() => {
  const tabCtx = useGoodsCardTab()
  const [localTab, setLocalTab] = useState<'goods-list' | 'shortcuts'>('goods-list')
  const tab = tabCtx?.tab ?? localTab
  const setTab = tabCtx?.setTab ?? setLocalTab

  return (
    <Card>
      <CardContent className="pt-6">
        {/* 高亮挂在 Tabs 根上：快捷键 Tab 未激活时目标也始终存在，避免「去配快捷键」无反应 */}
        <WizardHighlight targetId="auto-popup-shortcuts">
          <Tabs
            value={tab}
            onValueChange={value => setTab(value as 'goods-list' | 'shortcuts')}
            className="w-full"
          >
            <TabsList className="grid w-full grid-cols-2">
              <TabsTrigger value="goods-list">商品列表</TabsTrigger>
              <TabsTrigger value="shortcuts">快捷键配置</TabsTrigger>
            </TabsList>

            <TabsContent value="goods-list" className="space-y-6 mt-4">
              <CommonList />
            </TabsContent>

            <TabsContent value="shortcuts" className="mt-4">
              <ShortcutConfigTab />
            </TabsContent>
          </Tabs>
        </WizardHighlight>
      </CardContent>
    </Card>
  )
})

export default GoodsListCard
