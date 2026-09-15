import { useMemoizedFn } from 'ahooks'
import { Plus, Trash, X } from 'lucide-react'
import { useCallback, useEffect, useId, useMemo, useState } from 'react'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Switch } from '@/components/ui/switch'
import { useAutoReplyConfig } from '@/hooks/useAutoReplyConfig'
import { useToast } from '@/hooks/useToast'
import {
  type KeywordRule as Rule,
  normalizeKeywordRule,
  parseKeywordBatchText,
  serializeKeywordRules,
} from '@/utils/keywordRules'

const emptyRule = (): Rule =>
  normalizeKeywordRule({
    keywords: [],
    contents: [],
    channel: 'comment',
    cooldownSec: 8,
  })

export function KeywordReplySetting() {
  const {
    config,
    updateKeywordRules,
    updateKeywordReplyEnabled,
    updateKeywordMatchMode,
  } = useAutoReplyConfig()
  const rules = config.comment.keywordReply.rules
  const matchMode = config.comment.keywordReply.matchMode ?? 'includes'
  const [showEditor, setShowEditor] = useState(false)

  const saveRules = useMemoizedFn((rulesToSave = rules) => {
    updateKeywordRules(rulesToSave.map(normalizeKeywordRule))
  })

  const keywordReplyEnabled = config.comment.keywordReply.enable
  const handleKeywordEnabledChange = (checked: boolean) => {
    updateKeywordReplyEnabled(checked)
  }

  const addRule = () => {
    saveRules([...rules, emptyRule()])
  }

  const keywordReplyId = useId()

  return (
    <div className="space-y-4">
      <div className="flex items-center space-x-2">
        <Switch
          id={keywordReplyId}
          checked={keywordReplyEnabled}
          onCheckedChange={handleKeywordEnabledChange}
        />
        <Label htmlFor={keywordReplyId}>启用关键词回复</Label>
      </div>

      {keywordReplyEnabled && (
        <>
          <div className="flex justify-between items-center">
            <h3 className="text-sm font-medium">关键词回复规则</h3>
            <div className="flex items-center gap-x-2">
              <Button variant={'outline'} size="sm" onClick={() => setShowEditor(prev => !prev)}>
                {showEditor ? '普通模式' : '批量编辑'}
              </Button>
              <Button size="sm" onClick={addRule} className="flex items-center gap-1">
                <Plus className="h-4 w-4" /> 添加规则
              </Button>
            </div>
          </div>

          <div className="space-y-2 max-w-md">
            <Label>匹配模式</Label>
            <Select
              value={matchMode}
              onValueChange={v => updateKeywordMatchMode(v as 'includes' | 'exact')}
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="includes">包含匹配</SelectItem>
                <SelectItem value="exact">全匹配</SelectItem>
              </SelectContent>
            </Select>
            <p className="text-xs text-muted-foreground">
              {matchMode === 'exact'
                ? '只有评论和关键词完全一样才回复。适合「多少钱」「有货吗」这种短评，避免误回。'
                : '评论里只要出现关键词就会回复。例如关键词是「多少钱」，「这个多少钱」也会触发。'}
            </p>
          </div>

          {showEditor ? (
            <KeywordReplyEditor
              rules={rules}
              onSave={next => {
                updateKeywordRules(next)
              }}
            />
          ) : (
            <CommonKeywordManager rules={rules} saveRules={saveRules} />
          )}
        </>
      )}
    </div>
  )
}

function CommonKeywordManager({
  rules,
  saveRules,
}: {
  rules: Rule[]
  saveRules: (rules: Rule[]) => void
}) {
  const updateRule = useMemoizedFn((ruleIndex: number, patch: Partial<Rule>) => {
    saveRules(
      rules.map((rule, index) =>
        index === ruleIndex ? normalizeKeywordRule({ ...rule, ...patch }) : rule,
      ),
    )
  })

  const updateRuleNestedArray = useMemoizedFn(
    (
      ruleIndex: number,
      key: 'keywords' | 'contents',
      updateFn: (currentArray: string[]) => string[],
    ) => {
      const newRules = rules.map((rule, index) => {
        if (index === ruleIndex) {
          return normalizeKeywordRule({
            ...rule,
            [key]: updateFn(rule[key]),
          })
        }
        return rule
      })
      saveRules(newRules)
    },
  )

  const removeRule = useCallback(
    (index: number) => {
      saveRules(rules.filter((_, i) => i !== index))
    },
    [rules, saveRules],
  )

  const addKeyword = useCallback(
    (ruleIndex: number, keyword: string) => {
      const trimmedKeyword = keyword.trim()
      if (!trimmedKeyword) return
      updateRuleNestedArray(ruleIndex, 'keywords', currentKeywords => [
        ...currentKeywords,
        trimmedKeyword,
      ])
    },
    [updateRuleNestedArray],
  )

  const removeKeyword = useCallback(
    (ruleIndex: number, keywordIndex: number) => {
      updateRuleNestedArray(ruleIndex, 'keywords', currentKeywords =>
        currentKeywords.filter((_, kIdx) => kIdx !== keywordIndex),
      )
    },
    [updateRuleNestedArray],
  )

  const addContent = useCallback(
    (ruleIndex: number, content: string) => {
      const trimmedContent = content.trim()
      if (!trimmedContent) return
      updateRuleNestedArray(ruleIndex, 'contents', currentContents => [
        ...currentContents,
        trimmedContent,
      ])
    },
    [updateRuleNestedArray],
  )

  const removeContent = useCallback(
    (ruleIndex: number, contentIndex: number) => {
      updateRuleNestedArray(ruleIndex, 'contents', currentContents =>
        currentContents.filter((_, cIdx) => cIdx !== contentIndex),
      )
    },
    [updateRuleNestedArray],
  )

  return rules.length === 0 ? (
    <div className="text-center py-8 border rounded-md bg-muted/30">
      <p className="text-muted-foreground">还没有规则，点右上角「添加规则」</p>
    </div>
  ) : (
    <div className="space-y-4">
      {rules.map((rule, ruleIndex) => (
        // biome-ignore lint/suspicious/noArrayIndexKey: 下标无妨
        <Card key={ruleIndex} className="border-dashed">
          <CardHeader className="pb-2 flex flex-row items-center justify-between">
            <CardTitle className="text-base">规则 {ruleIndex + 1}</CardTitle>
            <Button variant="ghost" size="icon" onClick={() => removeRule(ruleIndex)}>
              <Trash className="h-4 w-4 text-destructive" />
            </Button>
          </CardHeader>

          <CardContent className="space-y-4">
            <div>
              <h4 className="text-sm font-medium mb-2">关键词</h4>
              <div className="flex flex-wrap gap-2 mb-2">
                {rule.keywords.map((keyword, keywordIndex) => (
                  <div
                    // biome-ignore lint/suspicious/noArrayIndexKey: 下标无妨
                    key={keywordIndex}
                    className="bg-secondary text-secondary-foreground px-2 py-1 rounded-md text-sm flex items-center"
                  >
                    {keyword}
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-5 w-5 ml-1"
                      onClick={() => removeKeyword(ruleIndex, keywordIndex)}
                    >
                      <X className="h-3 w-3" />
                    </Button>
                  </div>
                ))}
              </div>

              <div className="flex gap-2">
                <Input
                  placeholder="例如：多少钱"
                  className="flex-1"
                  onKeyDown={e => {
                    if (e.key === 'Enter') {
                      addKeyword(ruleIndex, e.currentTarget.value)
                      e.currentTarget.value = ''
                    }
                  }}
                />
                <Button
                  variant="outline"
                  onClick={e => {
                    const input = e.currentTarget.previousSibling as HTMLInputElement
                    addKeyword(ruleIndex, input.value)
                    input.value = ''
                  }}
                >
                  添加
                </Button>
              </div>
            </div>

            <div>
              <h4 className="text-sm font-medium mb-1">
                回复内容（可用 {'{用户名}'}）
              </h4>
              <p className="text-xs text-muted-foreground mb-2">
                可以写好几句，每次随机发一句到公屏，看起来不那么机械。
              </p>
              <div className="space-y-2 mb-2">
                {rule.contents.map((content, contentIndex) => (
                  <div
                    // biome-ignore lint/suspicious/noArrayIndexKey: 下标无妨
                    key={contentIndex}
                    className="bg-muted p-2 rounded-md text-sm flex items-start justify-between gap-2"
                  >
                    <div className="flex-1 min-w-0 break-words">{content}</div>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-6 w-6 shrink-0"
                      onClick={() => removeContent(ruleIndex, contentIndex)}
                    >
                      <X className="h-3 w-3" />
                    </Button>
                  </div>
                ))}
              </div>

              <div className="flex gap-2">
                <Input
                  placeholder="例如：亲看2号链接~"
                  className="flex-1"
                  onKeyDown={e => {
                    if (e.key === 'Enter') {
                      addContent(ruleIndex, e.currentTarget.value)
                      e.currentTarget.value = ''
                    }
                  }}
                />
                <Button
                  variant="outline"
                  onClick={e => {
                    const input = e.currentTarget.previousSibling as HTMLInputElement
                    addContent(ruleIndex, input.value)
                    input.value = ''
                  }}
                >
                  添加
                </Button>
              </div>
            </div>

            <div className="space-y-2 max-w-[200px]">
              <Label>触发间隔（秒）</Label>
              <Input
                type="number"
                min={0}
                value={rule.cooldownSec ?? 8}
                onChange={e => {
                  const n = Number(e.target.value)
                  updateRule(ruleIndex, {
                    cooldownSec: Number.isFinite(n) && n >= 0 ? n : 8,
                  })
                }}
              />
              <p className="text-xs text-muted-foreground">
                防止同一句话回得太勤。例如填 8，就是至少隔 8 秒才再回一次。
              </p>
            </div>
            {/* v1.2 暂缓：本规则通道 / 弹窗商品序号 */}
          </CardContent>
        </Card>
      ))}
    </div>
  )
}

function KeywordReplyEditor({ rules, onSave }: { rules: Rule[]; onSave: (rules: Rule[]) => void }) {
  const toLocalText = useCallback((rules: Rule[]): string => serializeKeywordRules(rules), [])

  const { toast } = useToast()
  const [localText, setLocalText] = useState(toLocalText(rules))
  const [savedText, setSavedText] = useState(localText)

  const lines = useMemo(() => localText.split('\n'), [localText])
  const hasChanges = localText !== savedText

  const handleSaveBtnClick = () => {
    try {
      const next = parseKeywordBatchText(localText)
      onSave(next)
      setSavedText(localText)
      toast.success('保存成功')
    } catch (e) {
      if (e instanceof Error) {
        toast.error(e.message)
      } else {
        toast.error(String(e))
      }
    }
  }

  useEffect(() => {
    setLocalText(toLocalText(rules))
  }, [rules, toLocalText])

  return (
    <div>
      <div className="flex justify-between">
        <div>
          <div className="text-sm">批量编辑</div>
          <div className="text-muted-foreground text-xs mt-1 space-y-1">
            <p>
              一行一条规则。先写关键词（多个用 / 分开），再用 | 接要回的话（多句也用 | 分开）。
            </p>
            <p>
              末尾可加 <kbd>#cd:8</kbd> 表示至少隔 8 秒再回一次。
            </p>
            <p>例：多少钱/啥价|{'{用户名}'} 看2号链接|稍等亲|#cd:8</p>
          </div>
        </div>
        <Button className="self-end" onClick={handleSaveBtnClick} disabled={!hasChanges}>
          保存
        </Button>
      </div>

      <div className="flex mt-4">
        <div className="bg-gray-100 text-right px-1 py-1 font-mono text-gray-500 select-none">
          {lines.map((_, i) => (
            <div
              // biome-ignore lint/suspicious/noArrayIndexKey: 用下标无所谓的
              key={i}
              className="h-8 px-1 leading-8 flex items-center justify-between group"
            >
              <span className="ml-2">{i + 1}</span>
            </div>
          ))}
        </div>
        <style>
          {`.no-scrollbar::-webkit-scrollbar {
                display: none;
            }`}
        </style>
        <textarea
          className="leading-8 bg-white flex-1 outline-none resize-none px-2 py-1 text-sm whitespace-pre border rounded no-scrollbar"
          value={localText}
          spellCheck="false"
          onChange={e => setLocalText(e.target.value)}
          rows={lines.length || 1}
        />
      </div>
    </div>
  )
}
