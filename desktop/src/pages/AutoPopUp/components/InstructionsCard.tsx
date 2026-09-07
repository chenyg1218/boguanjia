import React from 'react'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'

const instructions = [
  {
    title: '使用前准备',
    detail:
      '先在「打开中控台」连接并登录对应平台，确保直播间商品列表已展开可见，再启动自动弹窗任务。',
  },
  {
    title: '顺序轮播（常规讲解）',
    detail:
      '关闭「随机弹窗」，按商品列表从上到下依次弹窗。适合按讲解脚本推进的品。弹窗间隔填最小～最大秒数，系统会在区间内随机取间隔。',
  },
  {
    title: '随机弹窗（活跃氛围）',
    detail:
      '开启「随机弹窗」后，每次从列表中随机选一个商品弹出，适合多品同时在推、不想固定顺序的场景。',
  },
  {
    title: '单品循环（深讲某一品）',
    detail:
      '商品列表只保留要推的那个序号即可。任务会按弹窗间隔一直反复弹这一个品，不会因「循环次数」用完而停（设成 1 也会整场直播持续弹）。「循环次数」主要用于多品混推时，控制某一品在一轮里连续弹几次；单品弹窗间隔可单独设（0 表示沿用全局间隔）。',
  },
  {
    title: '多品混推时加重某一品',
    detail:
      '列表里有多个商品时，把重点品的「循环次数」调高。例如 A×3、B×1，顺序模式下会按 A→A→A→B 一轮轮循环，不会弹完一轮就停。',
  },

  {
    title: '多场景快捷切换',
    detail:
      '在「快捷键配置」里为不同商品组合绑定快捷键（如开场品 / 福利品 / 返场品）。直播中按对应键即可切换当前弹窗列表；需要后台也能切时，打开「全局快捷键」。',
  },
  {
    title: '改配置后记得重启任务',
    detail: '任务运行中修改商品列表、间隔或快捷键后，需先停止再开始，新配置才会生效。',
  },
]

const InstructionsCard = React.memo(() => (
  <Card>
    <CardHeader>
      <CardTitle>使用说明</CardTitle>
      <CardDescription>如何按直播场景配置自动弹窗</CardDescription>
    </CardHeader>
    <CardContent>
      <div className="space-y-4">
        {instructions.map((item, index) => (
          // biome-ignore lint/suspicious/noArrayIndexKey: 下标无妨
          <div className="flex gap-3" key={index}>
            <div className="w-6 h-6 rounded-full bg-primary/10 flex items-center justify-center shrink-0 mt-0.5">
              <span className="text-sm font-medium text-primary">{index + 1}</span>
            </div>
            <div className="space-y-0.5">
              <p className="text-sm font-medium leading-6">{item.title}</p>
              <p className="text-sm text-muted-foreground leading-6">{item.detail}</p>
            </div>
          </div>
        ))}
      </div>
    </CardContent>
  </Card>
))

export default InstructionsCard
