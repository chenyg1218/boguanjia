import { useRef, useState } from 'react'
import { Download, Upload } from 'lucide-react'
import { RemoveCircleIcon } from '@/components/icons/RemoveCircleIcon'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { useAccounts } from '@/hooks/useAccounts'
import { useScenes } from '@/hooks/useScenes'
import { useToast } from '@/hooks/useToast'
import {
  applyAccountImport,
  buildAccountExport,
  downloadJson,
  type ExportAccountBundle,
  readJsonFile,
} from '@/utils/configTransfer'

export function SceneAndTransferSetting() {
  const { toast } = useToast()
  const accountId = useAccounts(s => s.currentAccountId)
  const { scenes, saveScene, applyScene, removeScene } = useScenes()
  const [sceneName, setSceneName] = useState('')
  const fileRef = useRef<HTMLInputElement>(null)

  return (
    <Card id="scenes">
      <CardContent className="pt-6">
        <div className="space-y-6">
          <div className="space-y-1">
            <Label>场景与配置迁移</Label>
            <p className="text-sm text-muted-foreground">
              保存当前账号的发言/弹窗/回评/读稿为场景一键切换；支持导出/导入 JSON（不含登录态与 AI
              Key）。
            </p>
          </div>

          <div className="space-y-3">
            <div className="flex flex-wrap gap-2">
              <Input
                className="max-w-xs"
                placeholder="场景名称，如：上新场"
                value={sceneName}
                onChange={e => setSceneName(e.target.value)}
              />
              <Button
                size="sm"
                onClick={() => {
                  const s = saveScene(sceneName)
                  if (!s) {
                    toast.error('请填写场景名称')
                    return
                  }
                  setSceneName('')
                  toast.success(`已保存场景「${s.name}」`)
                }}
              >
                保存当前为场景
              </Button>
            </div>
            {scenes.length === 0 ? (
              <p className="rounded-md border border-dashed px-3 py-8 text-center text-sm text-muted-foreground">
                暂无场景
              </p>
            ) : (
              <ul className="space-y-2">
                {scenes.map(s => (
                  <li
                    key={s.id}
                    className="group flex flex-wrap items-center justify-between gap-2 rounded-md border px-3 py-2"
                  >
                    <div>
                      <div className="text-sm font-medium">{s.name}</div>
                      <div className="text-xs text-muted-foreground">
                        {new Date(s.createdAt).toLocaleString()}
                      </div>
                    </div>
                    <div className="flex items-center gap-1">
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => {
                          if (applyScene(s.id)) toast.success(`已应用「${s.name}」`)
                          else toast.error('应用失败')
                        }}
                      >
                        应用
                      </Button>
                      <Button
                        variant="ghost"
                        size="sm"
                        className="h-7 w-7 shrink-0 px-0 text-muted-foreground hover:text-destructive shadow-none"
                        onClick={() => {
                          removeScene(s.id)
                          toast.info('已删除场景')
                        }}
                        title="删除场景"
                        aria-label="删除场景"
                      >
                        <RemoveCircleIcon className="!size-5" />
                      </Button>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </div>

          <div className="flex flex-wrap gap-2 border-t pt-4">
            <Button
              variant="outline"
              size="sm"
              onClick={() => {
                const data = buildAccountExport(accountId)
                downloadJson(`播管家配置-${accountId}-${Date.now()}.json`, data)
                toast.success('已导出配置文件')
              }}
            >
              <Download className="mr-0 h-4 w-4" />
              导出当前账号配置
            </Button>
            <Button variant="outline" size="sm" onClick={() => fileRef.current?.click()}>
              <Upload className="mr-0 h-4 w-4" />
              导入配置到当前账号
            </Button>
            <input
              ref={fileRef}
              type="file"
              accept="application/json,.json"
              className="hidden"
              onChange={async e => {
                const file = e.target.files?.[0]
                e.target.value = ''
                if (!file) return
                try {
                  const raw = (await readJsonFile(file)) as ExportAccountBundle
                  if (!raw || raw.version !== 1 || !raw.modules) {
                    toast.error('不是有效的播管家配置文件')
                    return
                  }
                  applyAccountImport(accountId, raw)
                  toast.success('已导入配置（请按需重启各任务）')
                } catch {
                  toast.error('导入失败，请检查文件格式')
                }
              }}
            />
          </div>
        </div>
      </CardContent>
    </Card>
  )
}
