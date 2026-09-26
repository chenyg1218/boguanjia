import { useMemoizedFn } from 'ahooks'
import { Check } from 'lucide-react'
import { useState } from 'react'
import { formatMaxAccounts, planDisplayName } from 'shared/licensePlan'
import { platformDisplayName } from 'shared/platforms'
import { PRICING_PLANS, SHARED_FEATURES } from '@/constants/pricing'
import { useLicense } from '@/hooks/useLicense'
import { useToast } from '@/hooks/useToast'
import { Button } from '../../../components/ui/button'
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '../../../components/ui/card'
import { Input } from '../../../components/ui/input'

export function LicenseSetting() {
  const { status, warning, activate, refresh } = useLicense()
  const [card, setCard] = useState('')
  const [busy, setBusy] = useState(false)
  const { toast } = useToast()

  const handleActivate = useMemoizedFn(async () => {
    if (!card.trim()) {
      toast.error('请输入卡密')
      return
    }
    setBusy(true)
    try {
      const result = await activate(card.trim())
      if (result.ok) {
        toast.success(result.message)
        setCard('')
      } else {
        toast.error(result.message)
      }
    } catch (err) {
      toast.error(err instanceof Error ? err.message : '激活失败，请检查卡密与网络后重试')
    } finally {
      setBusy(false)
    }
  })

  return (
    <Card id="license">
      <CardHeader>
        <CardTitle>档位说明</CardTitle>
        <CardDescription>
          三档核心功能一样；差别在账号数、能不能跨平台，以及多账号管理。
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="rounded-lg border p-4 space-y-2 text-sm">
          <div className="flex justify-between gap-4">
            <span className="text-muted-foreground">当前版本</span>
            <span className="font-medium">{planDisplayName(status.plan)}</span>
          </div>
          <div className="flex justify-between gap-4">
            <span className="text-muted-foreground">到期时间</span>
            <span className="font-medium">
              {status.isPro ? status.expiresAt || '—' : '长期有效'}
            </span>
          </div>
          <div className="flex justify-between gap-4">
            <span className="text-muted-foreground">可用账号数</span>
            <span className="font-medium">{formatMaxAccounts(status.maxAccounts)}</span>
          </div>
          <div className="flex justify-between gap-4">
            <span className="text-muted-foreground">平台绑定</span>
            <span className="font-medium">
              {!status.platformLocked
                ? '不限平台'
                : status.boundPlatform
                  ? platformDisplayName(status.boundPlatform)
                  : '未绑定（首次连上直播间后自动锁定）'}
            </span>
          </div>
          {warning ? <p className="text-amber-600 text-xs pt-1">{warning}</p> : null}
        </div>

        <div className="grid gap-3 sm:grid-cols-3 items-start">
          {PRICING_PLANS.map(plan => {
            const active = status.plan === plan.id
            return (
              <div
                key={plan.id}
                className={`rounded-lg border p-4 space-y-3 h-full ${
                  active ? 'border-primary/40 bg-primary/5' : ''
                }`}
              >
                <div className="space-y-1">
                  <div className="flex items-center justify-between gap-2">
                    <div className="font-semibold text-base">{plan.name}</div>
                    {active ? (
                      <span className="text-[11px] text-primary font-medium shrink-0">
                        当前
                      </span>
                    ) : null}
                  </div>
                  <p className="text-xs text-muted-foreground leading-relaxed">
                    {plan.subtitle}
                  </p>
                </div>

                <p className="text-xl font-semibold tracking-tight">{plan.price}</p>

                <div className="text-sm">
                  <span className="text-muted-foreground">直播账号数量：</span>
                  <span className="font-semibold text-orange-500">{plan.accountLimit}</span>
                </div>

                <ul className="space-y-2.5">
                  {SHARED_FEATURES.map(feature => (
                    <li key={feature.title} className="flex gap-2">
                      <Check
                        className="size-4 shrink-0 mt-0.5 text-green-500"
                        strokeWidth={2.5}
                        aria-hidden
                      />
                      <div className="min-w-0 space-y-0.5 opacity-70">
                        <p className="text-sm font-medium leading-snug">
                          {feature.title}
                        </p>
                        <p className="text-xs text-muted-foreground leading-relaxed">
                          {feature.description}
                        </p>
                      </div>
                    </li>
                  ))}
                  {plan.diffs.map(feature => (
                    <li key={feature.title} className="flex gap-2">
                      <Check
                        className="size-4 shrink-0 mt-0.5 text-green-500"
                        strokeWidth={2.5}
                        aria-hidden
                      />
                      <div className="min-w-0 space-y-0.5">
                        <p className="text-sm font-semibold leading-snug text-orange-500">
                          {feature.title}
                        </p>
                        <p className="text-xs text-muted-foreground leading-relaxed">
                          {feature.description}
                        </p>
                      </div>
                    </li>
                  ))}
                </ul>
              </div>
            )
          })}
        </div>

        <div className="space-y-2">
          <div className="text-sm text-muted-foreground space-y-1.5 leading-relaxed">
            <p>已有卡密？粘贴到下方点「激活」即可开通或续期。</p>
            <ul className="list-disc list-inside space-y-0.5 pl-0.5">
              <li>同档续充：天数直接累加</li>
              <li>充更高档：立刻升级，天数也累加</li>
              <li>充更低档：等当前档到期后才能用（卡密不会作废）</li>
              <li>基础版、专业版只能用一个平台；要跨平台请升旗舰版</li>
            </ul>
          </div>
          <div className="flex gap-2">
            <Input
              placeholder="粘贴卡密"
              value={card}
              onChange={e => setCard(e.target.value)}
              onKeyDown={e => {
                if (e.key === 'Enter') void handleActivate()
              }}
            />
            <Button disabled={busy} onClick={() => void handleActivate()}>
              {busy ? '处理中…' : '激活'}
            </Button>
            <Button variant="outline" disabled={busy} onClick={() => void refresh()}>
              刷新
            </Button>
          </div>
        </div>
      </CardContent>
    </Card>
  )
}
