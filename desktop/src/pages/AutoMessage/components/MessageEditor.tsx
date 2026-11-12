import { useDebounceEffect, useUpdateEffect } from 'ahooks'
import type React from 'react'
import { useState } from 'react'
import { MoveItemButtons } from '@/components/common/MoveItemButtons'
import { RemoveCircleIcon } from '@/components/icons/RemoveCircleIcon'
import { Button } from '@/components/ui/button'
import type { Message } from '@/hooks/useAutoMessage'
import { cn } from '@/lib/utils'

const MAX_LENGTH = 50
/** 统一行高（与删除按钮同高，保证每行一致） */
const ROW_PX = 32
const ROW_CLASS = 'h-8 min-h-8 max-h-8 box-border shrink-0'
const ROW_LINE_STYLE = { lineHeight: `${ROW_PX}px` } as const

const EMPTY_LINE_HINT = '请输入发言内容'

const createEmptyMessage = (): Message => ({
  id: crypto.randomUUID(),
  content: '',
  pinTop: false,
})

export default function MessageEditor({
  messages,
  unlimitedLength,
  onChange,
}: {
  messages: Message[]
  unlimitedLength: boolean
  onChange: (messages: Message[]) => void
}) {
  const [localMessages, setLocalMessages] = useState<Message[]>(() =>
    messages.length > 0 ? messages : [createEmptyMessage()],
  )
  const [text, setText] = useState(() =>
    (messages.length > 0 ? messages : [createEmptyMessage()]).map(msg => msg.content).join('\n'),
  )

  useUpdateEffect(() => {
    const next = messages.length > 0 ? messages : [createEmptyMessage()]
    setLocalMessages(next)
    setText(next.map(msg => msg.content).join('\n'))
  }, [messages])

  useDebounceEffect(
    () => {
      onChange(localMessages)
    },
    [localMessages],
    { wait: 100 },
  )

  const syncFromMessages = (next: Message[]) => {
    const normalized = next.length > 0 ? next : [createEmptyMessage()]
    setLocalMessages(normalized)
    setText(normalized.map(msg => msg.content).join('\n'))
  }

  const handleChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    const nextText = e.target.value
    setText(nextText)
    setLocalMessages(prev =>
      nextText.split('\n').map((content, i) =>
        prev[i]
          ? {
              ...prev[i],
              content,
            }
          : {
              content,
              id: crypto.randomUUID(),
              pinTop: false,
            },
      ),
    )
  }

  const handleMove = (index: number, direction: -1 | 1) => {
    const target = index + direction
    if (target < 0 || target >= localMessages.length) return
    const next = [...localMessages]
    ;[next[index], next[target]] = [next[target], next[index]]
    syncFromMessages(next)
  }

  const handleDelete = (index: number) => {
    if (index === 0) return
    syncFromMessages(localMessages.filter((_, i) => i !== index))
  }

  const getOverLimitLines = () => {
    if (unlimitedLength) return []
    return localMessages
      .map((msg, index) => ({
        index: index + 1,
        length: msg.content.length,
      }))
      .filter(item => item.length > MAX_LENGTH)
  }

  const rowCount = localMessages.length || 1

  return (
    <div>
      <div className="border rounded flex relative items-start">
        <div className="bg-gray-100 text-right px-2 font-mono text-gray-500 select-none">
          {localMessages.map((msg, i) => (
            <div
              key={msg.id}
              className={cn(ROW_CLASS, 'tabular-nums text-sm flex items-center justify-end')}
            >
              {i + 1}
            </div>
          ))}
        </div>

        <style>
          {`.no-scrollbar::-webkit-scrollbar {
                display: none;
            }`}
        </style>

        <div className="relative flex-1 border-l min-w-0">
          <div className="pointer-events-none absolute inset-0 px-2 text-sm" aria-hidden>
            {localMessages.map(msg => (
              <div
                key={msg.id}
                className={cn(ROW_CLASS, 'truncate text-muted-foreground flex items-center')}
              >
                {msg.content ? null : EMPTY_LINE_HINT}
              </div>
            ))}
          </div>
          <textarea
            value={text}
            spellCheck={false}
            onChange={handleChange}
            rows={rowCount}
            className="relative z-10 block bg-transparent w-full outline-none resize-none px-2 text-sm whitespace-pre no-scrollbar overflow-hidden"
            style={{
              ...ROW_LINE_STYLE,
              height: rowCount * ROW_PX,
              paddingTop: 0,
              paddingBottom: 0,
            }}
          />
        </div>

        <div className="px-1 bg-white flex flex-col">
          {localMessages.map((msg, i) => (
            <div
              key={msg.id}
              className={cn('group flex items-center gap-1', ROW_CLASS)}
            >
              <MoveItemButtons
                canMoveUp={i > 0}
                canMoveDown={i < localMessages.length - 1}
                onMoveUp={() => handleMove(i, -1)}
                onMoveDown={() => handleMove(i, 1)}
              />
              {/* 每行同尺寸幽灵图标删除，首行隐藏以保持行高一致 */}
              <Button
                type="button"
                variant="ghost"
                size="sm"
                className={cn(
                  'h-7 w-7 shrink-0 px-0 text-muted-foreground hover:text-destructive shadow-none',
                  i === 0 && 'invisible pointer-events-none',
                )}
                title="删除消息"
                aria-label="删除消息"
                tabIndex={i === 0 ? -1 : undefined}
                onClick={() => handleDelete(i)}
              >
                <RemoveCircleIcon className="!size-5" />
              </Button>
            </div>
          ))}
        </div>

        {localMessages.length > 1 ? (
          <div className="pointer-events-none absolute inset-0" aria-hidden>
            {localMessages.slice(0, -1).map((msg, i) => (
              <div
                key={msg.id}
                className="absolute inset-x-0 border-b border-border"
                style={{ top: (i + 1) * ROW_PX }}
              />
            ))}
          </div>
        ) : null}
      </div>
      {!unlimitedLength && (
        <div className="mt-1 space-y-1">
          <p className="text-xs text-muted-foreground">
            每行最多 {MAX_LENGTH} 个字符；需要更长请在下方「发送设置」打开「解除字数限制」
          </p>
          {getOverLimitLines().length > 0 && (
            <p className="text-xs text-destructive">
              第{' '}
              {getOverLimitLines()
                .map(item => item.index)
                .join('、')}{' '}
              行超出字数限制
            </p>
          )}
        </div>
      )}
    </div>
  )
}
