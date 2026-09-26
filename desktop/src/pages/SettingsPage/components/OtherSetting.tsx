import { BookOpenIcon, CopyIcon, FileTextIcon, Trash2Icon } from 'lucide-react'
import { IPC_CHANNELS } from 'shared/ipcChannels'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { useToast } from '@/hooks/useToast'
import { performFullCleanup } from '@/utils/storage'
import { openTutorial } from '@/utils/tutorial'

const AUTHOR_WECHAT_ID = 'xiaogangSR'

export function OtherSetting() {
  const { toast } = useToast()

  const handleOpenLogFolder = async () => {
    await window.ipcRenderer.invoke(IPC_CHANNELS.app.openLogFolder)
  }

  const handleCopyWechat = async () => {
    try {
      await navigator.clipboard.writeText(AUTHOR_WECHAT_ID)
      toast.success(`已复制微信号：${AUTHOR_WECHAT_ID}，请到微信中添加`)
    } catch {
      toast.error(`复制失败，请手动添加微信：${AUTHOR_WECHAT_ID}`)
    }
  }

  const handleCleanupStorage = () => {
    try {
      const cleanedCount = performFullCleanup()
      if (cleanedCount === 0) {
        toast.success('没有发现无效数据')
      } else {
        toast.success(`清理完成，共清理了 ${cleanedCount} 条无效数据`)
      }
    } catch (error) {
      console.error('Storage cleanup failed:', error)
      toast.error('清理失败，请重试；若仍失败可重启应用后再试')
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>其他设置</CardTitle>
        <CardDescription>教程、联系作者、日志</CardDescription>
      </CardHeader>
      <CardContent>
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <div className="space-y-1">
              <h4 className="text-sm font-medium leading-none">使用教程</h4>
              <p className="text-sm text-muted-foreground">
                安装、连接中控台、自动发言 / 弹窗 / 回复等完整说明
              </p>
            </div>
            <Button
              variant="outline"
              size="sm"
              className="gap-2"
              onClick={() => void openTutorial()}
            >
              <BookOpenIcon className="h-4 w-4" />
              查看教程
            </Button>
          </div>

          <div className="flex items-center justify-between">
            <div className="space-y-1">
              <h4 className="text-sm font-medium leading-none">关于播管家</h4>
              <p className="text-sm text-muted-foreground">
                多平台直播跟播辅助 · 基础版 单平台 · 1个账号 / 专业版月卡 单平台 · 3个账号 / 旗舰版月卡无上限
              </p>
            </div>
          </div>

          <div className="flex items-center justify-between">
            <div className="space-y-1">
              <h4 className="text-sm font-medium leading-none">联系作者</h4>
              <p className="text-sm text-muted-foreground">
                问题反馈、功能建议 · 微信 {AUTHOR_WECHAT_ID}
              </p>
            </div>
            <Button variant="outline" size="sm" className="gap-2" onClick={handleCopyWechat}>
              <CopyIcon className="h-4 w-4" />
              复制微信号
            </Button>
          </div>

          <div className="flex items-center justify-between">
            <div className="space-y-1">
              <h4 className="text-sm font-medium leading-none">运行日志</h4>
              <p className="text-sm text-muted-foreground">
                查看本机运行日志（文件名 main.log）
              </p>
            </div>
            <Button variant="outline" size="sm" className="gap-2" onClick={handleOpenLogFolder}>
              <FileTextIcon className="h-4 w-4" />
              打开日志文件夹
            </Button>
          </div>

          <div className="flex items-center justify-between">
            <div className="space-y-1">
              <h4 className="text-sm font-medium leading-none">清理无效数据</h4>
              <p className="text-sm text-muted-foreground">清理废弃的存储数据和孤立的账号数据</p>
            </div>
            <Button variant="outline" size="sm" className="gap-2" onClick={handleCleanupStorage}>
              <Trash2Icon className="h-4 w-4" />
              清理无效数据
            </Button>
          </div>
        </div>
      </CardContent>
    </Card>
  )
}
