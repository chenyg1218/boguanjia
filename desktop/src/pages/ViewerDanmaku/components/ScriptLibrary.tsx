import { Plus } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import { MoveItemButtons } from '@/components/common/MoveItemButtons'
import { RemoveCircleIcon } from '@/components/icons/RemoveCircleIcon'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import type { ViewerMessage } from '@/hooks/useViewerDanmaku'
import { cn } from '@/lib/utils'

const EMPTY_LINE_HINT = '请输入发言内容'

export default function ScriptLibrary({
  messages,
  onAdd,
  onUpdate,
  onRemove,
  onReorder,
  disabled,
}: {
  messages: ViewerMessage[]
  onAdd: (content?: string) => string | null | undefined
  onUpdate: (id: string, content: string) => void
  onRemove: (id: string) => void
  onReorder: (messages: ViewerMessage[]) => void
  disabled?: boolean
}) {
  const [editingId, setEditingId] = useState<string | null>(null)
  const [draft, setDraft] = useState('')
  const inputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    if (editingId) inputRef.current?.focus()
  }, [editingId])

  // 默认至少保留第一行话术
  useEffect(() => {
    if (messages.length === 0 && !disabled) {
      onAdd('')
    }
    // 仅在列表为空时补一行，避免 onAdd 引用变化导致重复添加
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [messages.length, disabled])

  const startEdit = (m: ViewerMessage) => {
    if (disabled) return
    setEditingId(m.id)
    setDraft(m.content)
  }

  const commitEdit = () => {
    if (!editingId) return
    onUpdate(editingId, draft.trim())
    setEditingId(null)
    setDraft('')
  }

  const cancelEdit = () => {
    setEditingId(null)
    setDraft('')
  }

  const handleAdd = () => {
    if (disabled) return
    const id = onAdd('')
    if (id) {
      setEditingId(id)
      setDraft('')
    }
  }

  const handleMove = (index: number, direction: -1 | 1) => {
    const target = index + direction
    if (target < 0 || target >= messages.length) return
    const next = [...messages]
    ;[next[index], next[target]] = [next[target], next[index]]
    onReorder(next)
  }

  return (
    <div className="space-y-4">
      <div className="flex justify-end">
        <Button type="button" size="sm" disabled={disabled} onClick={handleAdd} title="添加话术">
          <Plus className="mr-0 h-4 w-4" />
          添加话术
        </Button>
      </div>

      {messages.length === 0 ? (
        <p className="rounded-md border border-dashed px-3 py-8 text-center text-sm text-muted-foreground">
          还没有话术，点击上方「添加话术」
        </p>
      ) : (
        <ul className="divide-y rounded-md border">
          {messages.map((m, index) => {
            const isEditing = editingId === m.id
            const deletable = index > 0
            return (
              <li key={m.id} className="group flex items-center gap-2 px-2 py-1.5 text-sm">
                <span className="w-6 shrink-0 text-center text-xs text-muted-foreground tabular-nums">
                  {index + 1}
                </span>
                {isEditing ? (
                  <Input
                    ref={inputRef}
                    className="h-8 flex-1"
                    value={draft}
                    onChange={e => setDraft(e.target.value)}
                    onBlur={commitEdit}
                    onKeyDown={e => {
                      if (e.key === 'Enter') {
                        e.preventDefault()
                        commitEdit()
                      }
                      if (e.key === 'Escape') {
                        e.preventDefault()
                        cancelEdit()
                      }
                    }}
                    placeholder={EMPTY_LINE_HINT}
                  />
                ) : (
                  <button
                    type="button"
                    className={cn(
                      'min-w-0 flex-1 truncate rounded px-2 py-1 text-left hover:bg-muted/60',
                      !m.content && 'text-muted-foreground',
                    )}
                    onClick={() => startEdit(m)}
                    disabled={disabled}
                  >
                    {m.content || EMPTY_LINE_HINT}
                  </button>
                )}
                <MoveItemButtons
                  disabled={disabled}
                  canMoveUp={index > 0}
                  canMoveDown={index < messages.length - 1}
                  onMoveUp={() => handleMove(index, -1)}
                  onMoveDown={() => handleMove(index, 1)}
                />
                {deletable ? (
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    className="h-7 w-7 shrink-0 px-0 text-muted-foreground hover:text-destructive shadow-none"
                    disabled={disabled}
                    onClick={() => {
                      if (editingId === m.id) cancelEdit()
                      onRemove(m.id)
                    }}
                    title="删除话术"
                    aria-label="删除话术"
                  >
                    <RemoveCircleIcon className="!size-5" />
                  </Button>
                ) : (
                  <div className="h-7 w-7 shrink-0" />
                )}
              </li>
            )
          })}
        </ul>
      )}
    </div>
  )
}
