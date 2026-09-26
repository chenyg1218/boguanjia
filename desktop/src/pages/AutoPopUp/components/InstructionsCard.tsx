import { ChevronDown, Compass, MousePointerClick } from 'lucide-react'
import React, { useState } from 'react'
import { useWizardSpotlight } from '@/components/onboarding/WizardTarget'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible'
import { cn } from '@/lib/utils'
import { type GoodsCardTab, useGoodsCardTab } from '../GoodsCardTabContext'

type ScenarioId = 'sequential' | 'random' | 'single' | 'mix' | 'shortcut'

interface Scenario {
  id: ScenarioId
  title: string
  blurb: string
  tips: string[]
  detail: string
  targetId: string
  actionLabel: string
  tab?: GoodsCardTab
}

/** 展示顺序：从左到右、从上到下 */
const SCENARIOS: Scenario[] = [
  {
    id: 'single',
    title: '深讲单品',
    blurb: '整场反复弹同一个品',
    tips: ['商品列表只保留要推的那个序号', '可单独设该品讲解时长（0 表示用全局）', '不会因「循环次数」用完而停'],
    detail:
      '列表只留一个序号即可整场反复弹。「循环次数」主要用于多品混推；单品即使设成 1 也会持续弹，直到你手动停任务。',
    targetId: 'auto-popup-goods',
    actionLabel: '去改商品列表',
    tab: 'goods-list',
  },
  {
    id: 'sequential',
    title: '常规讲解',
    blurb: '按列表从上到下依次弹',
    tips: ['关掉「随机弹窗」', '按讲解顺序填好商品序号', '讲解时长填最小～最大秒数'],
    detail:
      '适合按固定讲解顺序推品。关掉随机后，任务会按商品列表从上到下依次弹出；讲解时长每次会在范围内略有变化，节奏更自然。',
    targetId: 'auto-popup-settings',
    actionLabel: '去设置讲解时长',
    tab: 'goods-list',
  },
  {
    id: 'random',
    title: '活跃氛围',
    blurb: '每次随机抽一个品弹出',
    tips: ['打开「随机弹窗」', '列表里放好要轮换的商品', '适合多品同时在推、不想固定顺序'],
    detail: '打开随机后，每次从列表里随便抽一个弹出，适合几个品一起推、不想按固定顺序讲解的场次。',
    targetId: 'auto-popup-random',
    actionLabel: '去开随机弹窗',
    tab: 'goods-list',
  },
  {
    id: 'mix',
    title: '混推加重',
    blurb: '多品轮播时加重某一品',
    tips: ['列表放多个商品', '把重点品的「循环次数」调高', '例如 A×3、B×1 → 顺序为 A→A→A→B'],
    detail:
      '多品混推时，用「循环次数」控制某一品在一轮里连续弹几次。顺序模式下按加权顺序一轮轮循环，不会弹完一轮就停。',
    targetId: 'auto-popup-goods',
    actionLabel: '去调循环次数',
    tab: 'goods-list',
  },
  {
    id: 'shortcut',
    title: '快捷切换',
    blurb: '直播中一键换弹窗列表',
    tips: ['在「快捷键配置」绑定不同商品组合', '直播中按对应键即可切换', '需要后台也能切时打开「全局快捷键」'],
    detail:
      '可为开场品 / 福利品 / 返场品等组合各绑一组快捷键。任务运行中改配置后，需先停止再开始才会生效。',
    targetId: 'auto-popup-shortcuts',
    actionLabel: '去配快捷键',
    tab: 'shortcuts',
  },
]

const InstructionsCard = React.memo(() => {
  const [selectedId, setSelectedId] = useState<ScenarioId>('single')
  const [detailOpen, setDetailOpen] = useState(false)
  const spotlight = useWizardSpotlight()
  const tabCtx = useGoodsCardTab()

  const selected = SCENARIOS.find(s => s.id === selectedId) ?? SCENARIOS[0]

  const handleSelect = (scenario: Scenario) => {
    setSelectedId(scenario.id)
    setDetailOpen(false)
  }

  const handleFocus = () => {
    if (selected.tab) tabCtx?.setTab(selected.tab)
    // 等 Tab 状态提交并完成布局后再高亮，保证会滚到商品卡片并画出遮罩
    requestAnimationFrame(() => {
      window.setTimeout(() => {
        spotlight?.(selected.targetId)
      }, 50)
    })
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Compass className="h-4 w-4 text-muted-foreground" />
          使用说明
        </CardTitle>
        <CardDescription>按直播场景选一种配置方式，点「去设置」会定位到对应控件</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
          {SCENARIOS.map(scenario => {
            const active = scenario.id === selectedId
            return (
              <button
                key={scenario.id}
                type="button"
                onClick={() => handleSelect(scenario)}
                className={cn(
                  'rounded-lg border px-3 py-3 text-left transition-all',
                  'hover:bg-muted/40 active:scale-[0.99]',
                  'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
                  active && 'border-orange-500/60 bg-orange-500/5 ring-1 ring-orange-500/30',
                )}
              >
                <p className="text-sm font-medium">{scenario.title}</p>
                <p className="mt-1 text-xs leading-5 text-muted-foreground">{scenario.blurb}</p>
              </button>
            )
          })}
        </div>

        <div className="rounded-lg border bg-muted/20 px-4 py-3 space-y-3">
          <div>
            <p className="text-sm font-medium">{selected.title}</p>
            <ul className="mt-2 space-y-1.5">
              {selected.tips.map(tip => (
                <li key={tip} className="flex gap-2 text-sm leading-5 text-muted-foreground">
                  <span className="mt-2 h-1 w-1 shrink-0 rounded-full bg-orange-500" />
                  <span>{tip}</span>
                </li>
              ))}
            </ul>
          </div>

          <Button
            type="button"
            size="sm"
            className="bg-orange-500 hover:bg-orange-600"
            onClick={handleFocus}
          >
            <MousePointerClick className="h-3.5 w-3.5" />
            {selected.actionLabel}
          </Button>

          <Collapsible open={detailOpen} onOpenChange={setDetailOpen}>
            <CollapsibleTrigger asChild>
              <Button type="button" variant="ghost" size="sm" className="h-8 px-2 text-muted-foreground">
                <ChevronDown
                  className={cn('h-3.5 w-3.5 transition-transform', detailOpen && 'rotate-180')}
                />
                {detailOpen ? '收起说明' : '更多说明'}
              </Button>
            </CollapsibleTrigger>
            <CollapsibleContent>
              <p className="pt-1 text-sm leading-6 text-muted-foreground">{selected.detail}</p>
            </CollapsibleContent>
          </Collapsible>
        </div>

        <p className="text-xs leading-5 text-muted-foreground">
          任务运行中修改商品列表、讲解时长或快捷键后，需先停止再开始，新配置才会生效。
        </p>
      </CardContent>
    </Card>
  )
})

export default InstructionsCard
