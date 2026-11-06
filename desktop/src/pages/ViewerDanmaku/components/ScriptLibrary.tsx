import { Pencil, Plus, Trash2 } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import type { ViewerMessage } from '@/hooks/useViewerDanmaku'
import { cn } from '@/lib/utils'

export default function ScriptLibrary({
  messages,
  onAdd,
  onUpdate,
  onRemove,
  disabled,
}: {
  messages: ViewerMessage[]
  onAdd: (content?: string) => string | null | undefined
  onUpdate: (id: string, content: string) => void
  onRemove: (id: string) => void
  disabled?: boolean
}) {
  const [editingId, setEditingId] = useState<string | null>(null)
  const [draft, setDraft] = useState('')
  const inputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    if (editingId) inputRef.current?.focus()
  }, [editingId])

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

  return (
    <div className="space-y-2">
      {messages.length === 0 ? (
        <p className="rounded-md border border-dashed px-3 py-6 text-center text-sm text-muted-foreground">
          还没有话术，点击下方「添加话术」
        </p>
      ) : (
        <ul className="divide-y rounded-md border">
          {messages.map((m, index) => {
            const isEditing = editingId === m.id
            return (
              <li key={m.id} className="flex items-center gap-2 px-2 py-1.5 text-sm">
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
                    placeholder="输入话术，回车保存"
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
                    {m.content || '（空内容，点击编辑）'}
                  </button>
                )}
                <Button
                  type="button"
                  size="icon"
                  variant="ghost"
                  className="h-8 w-8 shrink-0"
                  disabled={disabled || isEditing}
                  onClick={() => startEdit(m)}
                  aria-label="编辑"
                >
                  <Pencil className="h-3.5 w-3.5" />
                </Button>
                <Button
                  type="button"
                  size="icon"
                  variant="ghost"
                  className="h-8 w-8 shrink-0 text-muted-foreground hover:text-destructive"
                  disabled={disabled}
                  onClick={() => {
                    if (editingId === m.id) cancelEdit()
                    onRemove(m.id)
                  }}
                  aria-label="删除"
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </Button>
              </li>
            )
          })}
        </ul>
      )}
      <Button type="button" size="sm" variant="outline" disabled={disabled} onClick={handleAdd}>
        <Plus className="mr-1 h-4 w-4" />
        添加话术
      </Button>
    </div>
  )
}
