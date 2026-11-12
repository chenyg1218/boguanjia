import React from 'react'
import { MoveItemButtons } from '@/components/common/MoveItemButtons'
import { RemoveCircleIcon } from '@/components/icons/RemoveCircleIcon'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import type { Message } from '@/hooks/useAutoMessage'

const MessageComp = React.memo(
  ({
    message,
    onChange,
    onDelete,
    onMoveUp,
    onMoveDown,
    canMoveUp = false,
    canMoveDown = false,
    canDelete = true,
  }: {
    message: Message
    onChange: (message: Message) => void
    onDelete: (id: string) => void
    onMoveUp?: (id: string) => void
    onMoveDown?: (id: string) => void
    canMoveUp?: boolean
    canMoveDown?: boolean
    canDelete?: boolean
  }) => {
    return (
      <div className="flex gap-3 items-center group">
        <div className="flex-1 space-y-1">
          <Input
            value={message.content}
            onChange={e => {
              if (e.target.value.length > 50) {
                return
              }
              onChange({ ...message, content: e.target.value })
            }}
            className={message.content.length > 50 ? 'border-destructive' : ''}
            placeholder="请输入发言内容"
          />
          <div className="flex justify-end px-1">
            <span
              className={`text-xs ${
                message.content.length > 50 ? 'text-destructive' : 'text-muted-foreground'
              }`}
            >
              {message.content.length}
              /50
            </span>
          </div>
        </div>
        <div className="flex items-center gap-1 shrink-0">
          <MoveItemButtons
            canMoveUp={canMoveUp}
            canMoveDown={canMoveDown}
            onMoveUp={() => onMoveUp?.(message.id)}
            onMoveDown={() => onMoveDown?.(message.id)}
          />
          {canDelete ? (
            <Button
              variant="ghost"
              size="sm"
              className="h-7 w-7 px-0 text-muted-foreground hover:text-destructive shadow-none"
              onClick={() => onDelete(message.id)}
              title="删除消息"
              aria-label="删除消息"
            >
              <RemoveCircleIcon className="!size-5" />
            </Button>
          ) : null}
        </div>
      </div>
    )
  },
)

export default MessageComp
