import { useRef, useState } from 'react'
import { Download, Trash2, Upload } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
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
      <CardHeader>
        <CardTitle>场景与配置迁移</CardTitle>
        <CardDescription>
          保存当前账号的发言/弹窗/回评/读稿为场景一键切换；支持导出/导入 JSON（不含登录态与 AI
          Key）。
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        <div className="space-y-3">
          <div className="flex flex-wrap gap-2">
            <Input
              className="max-w-xs"
              placeholder="场景名称，如：上新场"
              value={sceneName}
              onChange={e => setSceneName(e.target.value)}
            />
            <Button
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
            <p className="text-sm text-muted-foreground">暂无场景</p>
          ) : (
            <ul className="space-y-2">
              {scenes.map(s => (
                <li
                  key={s.id}
                  className="flex flex-wrap items-center justify-between gap-2 rounded-md border px-3 py-2"
                >
                  <div>
                    <div className="text-sm font-medium">{s.name}</div>
                    <div className="text-xs text-muted-foreground">
                      {new Date(s.createdAt).toLocaleString()}
                    </div>
                  </div>
                  <div className="flex gap-2">
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => {
                        if (applyScene(s.id)) toast.success(`已应用「${s.name}」`)
                        else toast.error('应用失败')
                      }}
                    >
                      应用
                    </Button>
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={() => {
                        removeScene(s.id)
                        toast.info('已删除场景')
                      }}
                    >
                      <Trash2 className="h-4 w-4" />
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
            onClick={() => {
              const data = buildAccountExport(accountId)
              downloadJson(`播管家配置-${accountId}-${Date.now()}.json`, data)
              toast.success('已导出配置文件')
            }}
          >
            <Download className="mr-2 h-4 w-4" />
            导出当前账号配置
          </Button>
          <Button variant="outline" onClick={() => fileRef.current?.click()}>
            <Upload className="mr-2 h-4 w-4" />
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
      </CardContent>
    </Card>
  )
}
