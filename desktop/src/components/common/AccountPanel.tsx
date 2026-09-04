import { useMemoizedFn } from 'ahooks'
import { ChevronLeft, ChevronRight, Pencil, Plus, Trash2 } from 'lucide-react'
import { useEffect, useState } from 'react'
import { IPC_CHANNELS } from 'shared/ipcChannels'
import { useAccounts } from '@/hooks/useAccounts'
import { useAutoMessageStore } from '@/hooks/useAutoMessage'
import { useAutoPopUpStore } from '@/hooks/useAutoPopUp'
import { useAutoReplyStore } from '@/hooks/useAutoReply'
import { useLicense } from '@/hooks/useLicense'
import { useCurrentLiveControl, useLiveControlStore } from '@/hooks/useLiveControl'
import { useToast } from '@/hooks/useToast'
import { cn } from '@/lib/utils'
import { Button } from '../ui/button'
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '../ui/dialog'
import { Input } from '../ui/input'
import { Label } from '../ui/label'
import { ScrollArea } from '../ui/scroll-area'
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '../ui/tooltip'

const COLLAPSE_KEY = 'account-panel-collapsed'

type DotTone = 'muted' | 'ok' | 'busy' | 'warn'

function statusHint(label: string, tone: DotTone) {
  if (label === '中控') {
    return tone === 'ok' ? '中控已连接' : tone === 'busy' ? '中控连接中' : '中控未连接'
  }
  if (label === '回复') {
    return tone === 'ok'
      ? '回复/监听中'
      : tone === 'busy'
        ? '等待监听'
        : tone === 'warn'
          ? '监听异常'
          : '回复未启动'
  }
  return tone === 'ok' ? `${label}运行中` : `${label}未运行`
}

function StatusDot({ label, tone }: { label: string; tone: DotTone }) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <span className="inline-flex items-center gap-1 text-[10px] text-muted-foreground">
          <span
            className={cn(
              'h-1.5 w-1.5 rounded-full',
              tone === 'ok' && 'bg-emerald-500',
              tone === 'busy' && 'bg-sky-500 animate-pulse',
              tone === 'warn' && 'bg-amber-500',
              tone === 'muted' && 'bg-gray-300',
            )}
          />
          {label}
        </span>
      </TooltipTrigger>
      <TooltipContent side="left">{statusHint(label, tone)}</TooltipContent>
    </Tooltip>
  )
}

function AccountCard({
  account,
  selected,
  disabled,
  onSelect,
  onEdit,
  onDelete,
}: {
  account: Account
  selected: boolean
  disabled: boolean
  onSelect: () => void
  onEdit: () => void
  onDelete: () => void
}) {
  const live = useLiveControlStore(s => s.contexts[account.id])
  const messageRunning = useAutoMessageStore(s => s.contexts[account.id]?.isRunning)
  const popupRunning = useAutoPopUpStore(s => s.contexts[account.id]?.isRunning)
  const replyCtx = useAutoReplyStore(s => s.contexts[account.id])
  const canDelete = account.id !== 'default'

  const liveTone: DotTone =
    live?.isConnected === 'connected'
      ? 'ok'
      : live?.isConnected === 'connecting'
        ? 'busy'
        : 'muted'

  const listenTone: DotTone =
    replyCtx?.isListening === 'listening'
      ? 'ok'
      : replyCtx?.isListening === 'waiting'
        ? 'busy'
        : replyCtx?.isListening === 'error'
          ? 'warn'
          : replyCtx?.isRunning
            ? 'ok'
            : 'muted'

  return (
    <div
      role="button"
      tabIndex={disabled ? -1 : 0}
      onClick={() => {
        if (!disabled && !selected) onSelect()
      }}
      onKeyDown={e => {
        if (disabled || selected) return
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault()
          onSelect()
        }
      }}
      className={cn(
        'group relative w-full rounded-lg border px-3 py-2.5 text-left transition-colors',
        selected
          ? 'border-primary/40 bg-primary/5 shadow-xs'
          : 'border-border bg-white hover:border-primary/25 hover:bg-muted/40',
        disabled && 'pointer-events-none opacity-60',
      )}
    >
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-medium leading-tight" title={account.name}>
            {account.name}
          </p>
          {live?.accountName ? (
            <p className="mt-0.5 truncate text-[11px] text-muted-foreground" title={live.accountName}>
              {live.accountName}
            </p>
          ) : (
            <p className="mt-0.5 text-[11px] text-muted-foreground/70">未登录中控</p>
          )}
        </div>
        <div className="flex shrink-0 items-center gap-0.5 opacity-0 group-hover:opacity-100 focus-within:opacity-100">
          <Button
            variant="ghost"
            size="icon"
            className="h-6 w-6"
            onClick={e => {
              e.stopPropagation()
              onEdit()
            }}
            title="修改名称"
          >
            <Pencil className="h-3.5 w-3.5" />
          </Button>
          {canDelete ? (
            <Button
              variant="ghost"
              size="icon"
              className="h-6 w-6 text-destructive hover:text-destructive"
              onClick={e => {
                e.stopPropagation()
                onDelete()
              }}
              title="删除账号"
            >
              <Trash2 className="h-3.5 w-3.5" />
            </Button>
          ) : null}
        </div>
      </div>

      <div className="mt-2 flex flex-wrap gap-x-2.5 gap-y-1">
        <StatusDot label="中控" tone={liveTone} />
        <StatusDot label="发言" tone={messageRunning ? 'ok' : 'muted'} />
        <StatusDot label="弹窗" tone={popupRunning ? 'ok' : 'muted'} />
        <StatusDot label="回复" tone={listenTone} />
      </div>
    </div>
  )
}

export function AccountPanel() {
  const { accounts, currentAccountId, addAccount, removeAccount, switchAccount, updateAccountName } =
    useAccounts()
  const { status } = useLicense()
  const isConnecting = useCurrentLiveControl(c => c.isConnected === 'connecting')
  const setMessageRunning = useAutoMessageStore(s => s.setIsRunning)
  const setPopupRunning = useAutoPopUpStore(s => s.setIsRunning)
  const setReplyRunning = useAutoReplyStore(s => s.setIsRunning)
  const setListening = useAutoReplyStore(s => s.setIsListening)
  const setConnected = useLiveControlStore(s => s.setIsConnected)
  const { toast } = useToast()

  const [collapsed, setCollapsed] = useState(() => {
    try {
      return localStorage.getItem(COLLAPSE_KEY) === '1'
    } catch {
      return false
    }
  })
  const [isAddDialogOpen, setIsAddDialogOpen] = useState(false)
  const [isEditDialogOpen, setIsEditDialogOpen] = useState(false)
  const [isDeleteDialogOpen, setIsDeleteDialogOpen] = useState(false)
  const [newAccountName, setNewAccountName] = useState('')
  const [editingAccount, setEditingAccount] = useState<Account | null>(null)
  const [deletingAccount, setDeletingAccount] = useState<Account | null>(null)
  const [deleteConfirmName, setDeleteConfirmName] = useState('')
  const [isDeleting, setIsDeleting] = useState(false)

  useEffect(() => {
    try {
      localStorage.setItem(COLLAPSE_KEY, collapsed ? '1' : '0')
    } catch {
      /* ignore */
    }
  }, [collapsed])

  const handleAccountSwitch = useMemoizedFn((accountId: string) => {
    switchAccount(accountId)
    toast.success('切换账号成功')
  })

  const openAddDialog = useMemoizedFn(() => {
    if (!status.isPro && accounts.length >= 1) {
      toast.error('免费版只能用 1 个账号，请到「应用设置 → 收费计划」开通专业版')
      return
    }
    setIsAddDialogOpen(true)
  })

  const handleAddAccount = useMemoizedFn(() => {
    if (!status.isPro && accounts.length >= 1) {
      toast.error('免费版只能用 1 个账号，请先开通专业版')
      return
    }
    if (!newAccountName.trim()) {
      toast.error('请输入账号名称')
      return
    }
    if (accounts.some(account => account.name === newAccountName)) {
      toast.error('账号名称已存在')
      return
    }
    addAccount(newAccountName)
    setIsAddDialogOpen(false)
    setNewAccountName('')
    toast.success('添加账号成功')
  })

  const handleEditAccount = useMemoizedFn(() => {
    if (!editingAccount) return
    if (!editingAccount.name.trim()) {
      toast.error('请输入账号名称')
      return
    }
    if (
      accounts.some(
        account => account.name === editingAccount.name && account.id !== editingAccount.id,
      )
    ) {
      toast.error('账号名称已存在')
      return
    }
    updateAccountName(editingAccount.id, editingAccount.name)
    setIsEditDialogOpen(false)
    setEditingAccount(null)
    toast.success('修改账号名称成功')
  })

  const openEditDialog = useMemoizedFn((account: Account) => {
    setEditingAccount(account)
    setIsEditDialogOpen(true)
  })

  const openDeleteDialog = useMemoizedFn((account: Account) => {
    if (account.id === 'default') {
      toast.error('无法删除默认账号')
      return
    }
    setDeletingAccount(account)
    setDeleteConfirmName('')
    setIsDeleteDialogOpen(true)
  })

  const handleDeleteDialogOpenChange = useMemoizedFn((open: boolean) => {
    setIsDeleteDialogOpen(open)
    if (!open) {
      setDeletingAccount(null)
      setDeleteConfirmName('')
      setIsDeleting(false)
    }
  })

  const nameMatched = Boolean(
    deletingAccount && deleteConfirmName.trim() === deletingAccount.name,
  )

  const handleDeleteAccount = useMemoizedFn(async () => {
    if (!deletingAccount || deletingAccount.id === 'default') return
    if (deleteConfirmName.trim() !== deletingAccount.name) {
      toast.error('请输入正确的账号名称以确认删除')
      return
    }

    const accountId = deletingAccount.id
    setIsDeleting(true)
    try {
      try {
        await window.ipcRenderer.invoke(IPC_CHANNELS.tasks.autoMessage.stop, accountId)
      } catch {
        /* ignore */
      }
      try {
        await window.ipcRenderer.invoke(IPC_CHANNELS.tasks.autoPopUp.stop, accountId)
      } catch {
        /* ignore */
      }
      try {
        await window.ipcRenderer.invoke(IPC_CHANNELS.tasks.autoReply.stopCommentListener, accountId)
      } catch {
        /* ignore */
      }
      try {
        await window.ipcRenderer.invoke(IPC_CHANNELS.tasks.liveControl.disconnect, accountId)
      } catch {
        /* ignore */
      }

      setMessageRunning(accountId, false)
      setPopupRunning(accountId, false)
      setReplyRunning(accountId, false)
      setListening(accountId, 'stopped')
      setConnected(accountId, 'disconnected')
      removeAccount(accountId)

      handleDeleteDialogOpenChange(false)
      toast.success('删除账号成功')
    } catch {
      toast.error('删除账号失败，请重试')
      setIsDeleting(false)
    }
  })

  const currentName = accounts.find(a => a.id === currentAccountId)?.name ?? '账号'

  if (collapsed) {
    return (
      <aside className="flex w-10 shrink-0 flex-col items-center border-l bg-background py-3">
        <Button
          variant="ghost"
          size="icon"
          className="h-8 w-8"
          onClick={() => setCollapsed(false)}
          title="展开账号管理"
        >
          <ChevronLeft className="h-4 w-4" />
        </Button>
        <div
          className="mt-3 max-h-40 truncate text-[11px] text-muted-foreground"
          style={{ writingMode: 'vertical-rl' }}
          title={currentName}
        >
          {currentName}
        </div>
      </aside>
    )
  }

  return (
    <TooltipProvider delayDuration={200}>
      <aside className="flex w-[220px] shrink-0 flex-col border-l bg-background">
        <div className="flex h-12 items-center justify-between border-b px-3">
          <div className="min-w-0">
            <p className="text-sm font-medium">账号管理</p>
            <p className="text-[11px] text-muted-foreground">{accounts.length} 个账号</p>
          </div>
          <Button
            variant="ghost"
            size="icon"
            className="h-7 w-7 shrink-0"
            onClick={() => setCollapsed(true)}
            title="收起"
          >
            <ChevronRight className="h-4 w-4" />
          </Button>
        </div>

        <ScrollArea className="min-h-0 flex-1">
          <div className="space-y-2 p-3">
            {accounts.map(account => (
              <AccountCard
                key={account.id}
                account={account}
                selected={account.id === currentAccountId}
                disabled={isConnecting}
                onSelect={() => handleAccountSwitch(account.id)}
                onEdit={() => openEditDialog(account)}
                onDelete={() => openDeleteDialog(account)}
              />
            ))}
          </div>
        </ScrollArea>

        <div className="border-t p-3">
          <Button
            variant="outline"
            size="sm"
            className="w-full"
            onClick={openAddDialog}
            title="添加账号（专业版可同时使用多个账号）"
          >
            <Plus className="mr-1.5 h-4 w-4" />
            添加账号
          </Button>
        </div>

        <Dialog open={isAddDialogOpen} onOpenChange={setIsAddDialogOpen}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>添加新账号</DialogTitle>
            </DialogHeader>
            <div className="space-y-4">
              <Input
                placeholder="账号名称"
                value={newAccountName}
                onChange={e => setNewAccountName(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && handleAddAccount()}
              />
              <Button onClick={handleAddAccount}>确定</Button>
            </div>
          </DialogContent>
        </Dialog>

        <Dialog open={isEditDialogOpen} onOpenChange={setIsEditDialogOpen}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>修改账号名称</DialogTitle>
              <DialogDescription>账号名称不能重复</DialogDescription>
            </DialogHeader>
            <div className="space-y-4">
              <Input
                placeholder="账号名称"
                value={editingAccount?.name ?? ''}
                onChange={e =>
                  setEditingAccount(prev => (prev ? { ...prev, name: e.target.value } : null))
                }
                onKeyDown={e => e.key === 'Enter' && handleEditAccount()}
              />
              <Button onClick={handleEditAccount}>确定</Button>
            </div>
          </DialogContent>
        </Dialog>

        <Dialog open={isDeleteDialogOpen} onOpenChange={handleDeleteDialogOpenChange}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>删除账号</DialogTitle>
              <DialogDescription>
                将清除本地配置与登录态，不会删除快手店铺账号。请先确认相关任务已停止。
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-4">
              <p className="text-sm text-muted-foreground">
                请输入账号名称{' '}
                <span className="font-medium text-foreground">{deletingAccount?.name}</span>{' '}
                以确认删除
              </p>
              <div className="space-y-2">
                <Label htmlFor="delete-account-name">账号名称</Label>
                <Input
                  id="delete-account-name"
                  placeholder={deletingAccount?.name}
                  value={deleteConfirmName}
                  autoFocus
                  disabled={isDeleting}
                  onChange={e => setDeleteConfirmName(e.target.value)}
                  onKeyDown={e => {
                    if (e.key === 'Enter' && nameMatched && !isDeleting) {
                      void handleDeleteAccount()
                    }
                  }}
                />
              </div>
              <div className="flex justify-end gap-2">
                <Button
                  variant="outline"
                  disabled={isDeleting}
                  onClick={() => handleDeleteDialogOpenChange(false)}
                >
                  取消
                </Button>
                <Button
                  variant="destructive"
                  disabled={!nameMatched || isDeleting}
                  onClick={() => void handleDeleteAccount()}
                >
                  {isDeleting ? '删除中…' : '确认删除'}
                </Button>
              </div>
            </div>
          </DialogContent>
        </Dialog>
      </aside>
    </TooltipProvider>
  )
}
