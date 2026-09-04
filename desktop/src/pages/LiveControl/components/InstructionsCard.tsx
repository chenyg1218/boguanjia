import React from 'react'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'

const instructions = [
  '首次连接请关闭无头模式，点击「连接直播控制台」后在弹出浏览器中扫码登录',
  '登录成功后开启直播，并关闭浏览器中的提示弹窗',
  '状态变为「已连接」后，再开启自动发言 / 弹窗 / 回复',
  '改完发言、弹窗或回复配置后，若任务已在运行，需先停止再开始才会生效',
  '免费版只能用 1 个账号；要同时管多个账号，请到「应用设置 → 收费计划」用卡密开通专业版',
]

const InstructionsCard = React.memo(() => (
  <Card>
    <CardHeader>
      <CardTitle>使用说明</CardTitle>
      <CardDescription>了解如何连接快手中控台并开始跟播</CardDescription>
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
))

export default InstructionsCard
