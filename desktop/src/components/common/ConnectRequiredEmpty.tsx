import { ArrowLeft, Settings2 } from 'lucide-react'
import { useNavigate } from 'react-router'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { CONNECT_LIVE_CONTROL_FIRST, CONNECT_REQUIRED_HINT } from '@/constants/copy'

interface ConnectRequiredEmptyProps {
  settingsLabel: string
  onViewSettings: () => void
}

export function ConnectRequiredEmpty({ settingsLabel, onViewSettings }: ConnectRequiredEmptyProps) {
  const navigate = useNavigate()

  return (
    <Card>
      <CardContent className="flex flex-col items-start gap-4 py-10">
        <div className="space-y-2">
          <h3 className="text-xl font-semibold tracking-tight">{CONNECT_LIVE_CONTROL_FIRST}</h3>
          <p className="max-w-xl text-sm leading-6 text-muted-foreground">
            {CONNECT_REQUIRED_HINT}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-3">
          <Button onClick={() => navigate('/')}>
            <ArrowLeft className="h-4 w-4" />
            返回打开中控台
          </Button>
          <Button type="button" variant="outline" onClick={onViewSettings}>
            <Settings2 className="h-4 w-4" />
            {settingsLabel}
          </Button>
        </div>
      </CardContent>
    </Card>
  )
}
