import { AlertCircle } from 'lucide-react'
import { Alert, AlertDescription } from '@/components/ui/alert'

/** 任务运行中修改配置时的提示（对齐 oba：需停止后再开始才生效） */
export function TaskRestartHint({ visible }: { visible: boolean }) {
  if (!visible) return null
  return (
    <Alert>
      <AlertCircle className="h-4 w-4" />
      <AlertDescription>
        任务运行中。若刚改过列表或间隔等配置，请先<strong>停止</strong>再<strong>开始</strong>，新配置才会生效。
      </AlertDescription>
    </Alert>
  )
}
