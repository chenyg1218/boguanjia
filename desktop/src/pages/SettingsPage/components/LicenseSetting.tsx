import { useMemoizedFn } from 'ahooks'
import { useState } from 'react'
import { formatMaxAccounts, planDisplayName } from 'shared/licensePlan'
import { PRICING_PLANS } from '@/constants/pricing'
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

const URL_RE = /(https?:\/\/[^\s]+)/g

function AnnouncementBlock({ text }: { text: string }) {
  const parts = text.split(URL_RE)
  return (
    <div className="rounded-lg border p-3 text-sm leading-relaxed whitespace-pre-wrap">
      {parts.map((part, i) =>
        /^https?:\/\//.test(part) ? (
          <a
            key={`${part}-${i}`}
            href={part}
            target="_blank"
            rel="noreferrer"
            className="text-blue-600 hover:text-blue-700 hover:underline break-all"
          >
            {part}
          </a>
        ) : (
          <span key={`${part}-${i}`}>{part}</span>
        ),
      )}
    </div>
  )
}

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
        <CardTitle>收费计划</CardTitle>
        <CardDescription>
          各档功能相同（自动发言、弹窗、回复都能用），区别只在直播账号数量与价格。
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="grid gap-3 sm:grid-cols-3 text-sm">
          {PRICING_PLANS.map(plan => {
            const active = status.plan === plan.id
            return (
              <div
                key={plan.id}
                className={`rounded-lg border p-3 space-y-1.5 ${
                  active ? 'border-primary/30 bg-primary/5' : ''
                }`}
              >
                <div className="flex items-center justify-between gap-2">
                  <div className="font-medium">{plan.name}</div>
                  {active ? (
                    <span className="text-[11px] text-primary font-medium">当前</span>
                  ) : null}
                </div>
                <p className="text-base font-semibold tracking-tight">{plan.price}</p>
                <p className="text-orange-600 dark:text-orange-400 font-medium">
                  {plan.accountLimitHighlight}
                </p>
                <p className="text-muted-foreground leading-relaxed text-xs">{plan.subtitle}</p>
              </div>
            )
          })}
        </div>

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
          {warning ? <p className="text-amber-600 text-xs pt-1">{warning}</p> : null}
        </div>

        {status.announcement ? <AnnouncementBlock text={status.announcement} /> : null}

        <div className="space-y-2">
          <div className="text-sm text-muted-foreground space-y-1.5 leading-relaxed">
            <p>已有卡密？粘贴到下方点「激活」即可开通或续期。</p>
            <ul className="list-disc list-inside space-y-0.5 pl-0.5">
              <li>没到期再充：剩余天数会自动加上去</li>
              <li>同档卡密：延长使用时间</li>
              <li>更高档卡密：升级版本，并延长时间</li>
              <li>更低档卡密：需等当前版本到期后再用（卡不会被扣掉）</li>
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
