import { AlertCircle } from 'lucide-react'
import { Alert, AlertDescription } from '@/components/ui/alert'

/** 任务运行中修改配置时的提示（对齐 oba：需停止后再开始才生效） */
export function TaskRestartHint({ visible }: { visible: boolean }) {
  if (!visible) return null
  return (
    <Alert>
      <AlertCircle className="h-4 w-4" />
      <AlertDescription>
        正在运行。如果刚改过内容或间隔，请先点「停止任务」再点「开始任务」，新设置才会生效。
      </AlertDescription>
    </Alert>
  )
}
