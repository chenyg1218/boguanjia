import { useState } from 'react'
import { MoveItemButtons } from '@/components/common/MoveItemButtons'
import { RemoveCircleIcon } from '@/components/icons/RemoveCircleIcon'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { useAutoReplyConfig } from '@/hooks/useAutoReplyConfig'

export function BlocklistManager() {
  const { updateBlockList, config } = useAutoReplyConfig()
  const blockedUsers = config.blockList
  const [newUser, setNewUser] = useState('')

  const handleAddUser = () => {
    if (!newUser.trim()) {
      return
    }
    const updatedList = [...blockedUsers, newUser.trim()]
    updateBlockList(updatedList)
    setNewUser('')
  }

  const handleRemoveUser = (index: number) => {
    const updatedList = blockedUsers.filter((_, i) => i !== index)
    updateBlockList(updatedList)
  }

  const handleMoveUser = (index: number, direction: -1 | 1) => {
    const target = index + direction
    if (target < 0 || target >= blockedUsers.length) return
    const next = [...blockedUsers]
    ;[next[index], next[target]] = [next[target], next[index]]
    updateBlockList(next)
  }

  return (
    <div className="space-y-4">
      <div>
        <h3 className="text-sm font-medium">用户屏蔽列表</h3>
        <p className="text-sm text-muted-foreground">填用户名后，这些人发的评论不会自动回复</p>
      </div>

      <div className="space-y-2 max-h-[200px] overflow-y-auto border rounded-md p-2">
        {blockedUsers.length === 0 ? (
          <div className="text-sm text-center py-4 text-muted-foreground">暂无屏蔽用户</div>
        ) : (
          blockedUsers.map((user, index) => (
            // biome-ignore lint/suspicious/noArrayIndexKey: 下标无妨
            <div key={index} className="flex items-center gap-2 group">
              <div className="flex-1 text-sm p-2 rounded bg-muted/50">{user}</div>
              <MoveItemButtons
                canMoveUp={index > 0}
                canMoveDown={index < blockedUsers.length - 1}
                onMoveUp={() => handleMoveUser(index, -1)}
                onMoveDown={() => handleMoveUser(index, 1)}
              />
              <Button
                variant="ghost"
                size="sm"
                className="h-7 w-7 px-0 text-muted-foreground hover:text-destructive shadow-none"
                onClick={() => handleRemoveUser(index)}
                title="删除屏蔽用户"
                aria-label="删除屏蔽用户"
              >
                <RemoveCircleIcon className="!size-5" />
              </Button>
            </div>
          ))
        )}
      </div>

      <div className="flex items-center gap-2">
        <Input
          placeholder="输入要屏蔽的用户名"
          value={newUser}
          onChange={e => setNewUser(e.target.value)}
          className="flex-1"
        />
        <Button variant="outline" size="sm" onClick={handleAddUser}>
          添加
        </Button>
      </div>
    </div>
  )
}
