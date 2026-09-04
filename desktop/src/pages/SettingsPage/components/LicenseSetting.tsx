import { useMemoizedFn } from 'ahooks'
import { useState } from 'react'
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
      toast.error(err instanceof Error ? err.message : '激活失败')
    } finally {
      setBusy(false)
    }
  })

  return (
    <Card id="license">
      <CardHeader>
        <CardTitle>收费计划</CardTitle>
        <CardDescription>
          免费版和专业版功能相同（自动发言、弹窗、回复都能用），区别只在能用几个账号。
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="grid gap-3 sm:grid-cols-2 text-sm">
          <div className="rounded-lg border p-3 space-y-1.5">
            <div className="font-medium">免费版</div>
            <p className="text-muted-foreground leading-relaxed">
              永久免费，可登录 <span className="text-foreground font-medium">1 个</span> 账号，适合单店试用。
            </p>
          </div>
          <div className="rounded-lg border border-primary/30 bg-primary/5 p-3 space-y-1.5">
            <div className="font-medium">专业版</div>
            <p className="text-muted-foreground leading-relaxed">
              购买卡密开通后，可同时管理 <span className="text-foreground font-medium">多个</span> 账号，每个账号独立配置、独立跑任务。
            </p>
          </div>
        </div>

        <div className="rounded-lg border p-4 space-y-2 text-sm">
          <div className="flex justify-between gap-4">
            <span className="text-muted-foreground">当前版本</span>
            <span className="font-medium">{status.isPro ? '专业版' : '免费版'}</span>
          </div>
          <div className="flex justify-between gap-4">
            <span className="text-muted-foreground">到期时间</span>
            <span className="font-medium">
              {status.isPro ? status.expiresAt || '—' : '无需到期（免费）'}
            </span>
          </div>
          <div className="flex justify-between gap-4">
            <span className="text-muted-foreground">可用账号数</span>
            <span className="font-medium">
              {status.isPro ? '不限' : '仅 1 个'}
            </span>
          </div>
          {warning ? <p className="text-amber-600 text-xs pt-1">{warning}</p> : null}
        </div>

        {status.announcement ? <AnnouncementBlock text={status.announcement} /> : null}

        <div className="space-y-2">
          <p className="text-sm text-muted-foreground">
            已有卡密？粘贴到下方即可激活或续期（未到期续充会把剩余天数叠加上去）。
          </p>
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
