import React from 'react'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { useCurrentLiveControl } from '@/hooks/useLiveControl'

const PLAN_HINT =
  '基础版只能用 1 个账号；专业版 3 个、旗舰版无上限，请到「应用设置 → 收费计划」用卡密开通'

const DEFAULT_INSTRUCTIONS = [
  '首次连接请关闭无头模式，点击「连接直播控制台」后在弹出浏览器中扫码登录',
  '登录成功后开启直播，并关闭浏览器中的提示弹窗',
  '状态变为「已连接」后，再开启自动发言 / 弹窗 / 回复',
  '改完发言、弹窗或回复配置后，若任务已在运行，需先停止再开始才会生效',
  PLAN_HINT,
]

const WXCHANNEL_INSTRUCTIONS = [
  '请先确认已开播，再点击「连接直播控制台」（视频号需开播后连接）',
  '首次连接请关闭无头模式，在弹出浏览器中扫码登录视频号助手',
  '视频号助手无法一号多登，在别处登录会中断连接',
  '状态变为「已连接」后，再开启自动发言 / 弹窗 / 回复',
  '改完发言、弹窗或回复配置后，若任务已在运行，需先停止再开始才会生效',
  PLAN_HINT,
]

const TAOBAO_INSTRUCTIONS = [
  '请先确认已开播，再连接中控台（进入淘宝中控台需要直播间 ID）',
  '淘宝会触发人机验证，将强制关闭无头模式；除登录和验证外请尽量不要操作浏览器',
  '点击「连接直播控制台」后在弹出浏览器中完成登录与验证',
  '状态变为「已连接」后，再开启自动发言 / 弹窗 / 回复',
  '改完发言、弹窗或回复配置后，若任务已在运行，需先停止再开始才会生效',
  PLAN_HINT,
]

function getInstructions(platform: LiveControlPlatform): string[] {
  if (platform === 'wxchannel') return WXCHANNEL_INSTRUCTIONS
  if (platform === 'taobao') return TAOBAO_INSTRUCTIONS
  return DEFAULT_INSTRUCTIONS
}

const InstructionsCard = React.memo(() => {
  const platform = useCurrentLiveControl(state => state.platform)
  const instructions = getInstructions(platform)

  return (
    <Card>
      <CardHeader>
        <CardTitle>使用说明</CardTitle>
        <CardDescription>了解如何连接直播中控台并开始跟播</CardDescription>
      </CardHeader>
      <CardContent>
        <div className="space-y-4">
          {instructions.map((instruction, index) => (
            // biome-ignore lint/suspicious/noArrayIndexKey: 下标无妨
            <div className="flex gap-3" key={index}>
              <div className="w-6 h-6 rounded-full bg-primary/10 flex items-center justify-center shrink-0">
                <span className="text-sm font-medium text-primary">{index + 1}</span>
              </div>
              <p className="text-sm text-muted-foreground leading-6">{instruction}</p>
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  )
})

export default InstructionsCard
