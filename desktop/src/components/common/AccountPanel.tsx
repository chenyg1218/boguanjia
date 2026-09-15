import { useMemoizedFn } from 'ahooks'
import { ChevronLeft, ChevronRight, Copy, Pencil, Plus, Trash2 } from 'lucide-react'
import { useEffect, useMemo, useState } from 'react'
import { IPC_CHANNELS } from 'shared/ipcChannels'
import { useAccounts } from '@/hooks/useAccounts'
import { useAutoMessageStore } from '@/hooks/useAutoMessage'
import { useAutoPopUpStore } from '@/hooks/useAutoPopUp'
import { useAutoReplyStore } from '@/hooks/useAutoReply'
import { useLicense } from '@/hooks/useLicense'
import { useCurrentLiveControl, useLiveControlStore } from '@/hooks/useLiveControl'
import { useToast } from '@/hooks/useToast'
import { DISABLED_ACCOUNT_HINT } from '@/constants/copy'
import { cn } from '@/lib/utils'
import {
  COPY_ACCOUNT_MODULE_LABELS,
  type CopyAccountConfigModule,
  copyAccountConfig,
} from '@/utils/copyAccountConfig'
import { Button } from '../ui/button'
import { Checkbox } from '../ui/checkbox'
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '../ui/dialog'
import { Input } from '../ui/input'
import { Label } from '../ui/label'
import { ScrollArea } from '../ui/scroll-area'
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '../ui/tooltip'

const DEFAULT_COPY_MODULES: CopyAccountConfigModule[] = [
  'autoMessage',
  'autoPopUp',
  'autoReply',
  // v1.2 暂缓：'voiceBroadcast',
]

const OPTIONAL_COPY_MODULES: CopyAccountConfigModule[] = ['chrome']

const COLLAPSE_KEY = 'account-panel-collapsed'

function AccountManageIcon({ className }: { className?: string }) {
  return (
    <svg
      className={className}
      viewBox="0 0 1024 1024"
      xmlns="http://www.w3.org/2000/svg"
      aria-hidden
    >
      <path
        fill="currentColor"
        d="M451.8 66c-126.3 0-228.9 101.8-228.9 226.8 0 69.8 32.1 134.8 87.9 178.3l14.3 11.1-16.9 6.7C159.6 547.8 63.4 688.1 63.4 846.3v79.1c0.1 16.2 13.3 29.3 29.5 29.2h454c16.1 0 29.2-13.1 29.2-29.2s-13.1-29.2-29.2-29.2H122.3v-49.8c0-169.7 131.1-309.4 298.1-325.1h0.4c10.2-1 20.6-1.5 31.1-1.5l4.7 0.1c36.9-2.9 92.8-11.5 122-37.6l14.3-11.1c55.4-42.5 87.8-108.4 87.9-178.2 0-125.3-102.7-227-229-227z m1.1 392.3c-94 0-170.3-75-170.2-167.3 0-92.3 76.3-167.4 170.2-167.4 93.8 0 170.2 75.1 170.2 167.4 0 92.2-76.3 167.3-170.2 167.3z"
      />
      <path
        fill="currentColor"
        d="M727 618.7c11.5-11.5 11.5-30.2 0-41.6-36.7-36.4-81.2-65.8-131.7-85.9l-16.9-6.7 0.6-0.5H324.1l0.8 0.6c28.8 25.7 83.6 34.5 120.5 37.5 1 0.1 2 0.1 3 0.1l3.2-0.1c10.5 0 20.9 0.5 31.1 1.5h0.4c78.8 7.4 149.5 42.4 202.3 95.1 11.5 11.5 30.1 11.5 41.6 0zM927.4 831.9H670.6c-17.6 0-32-14.4-32-32s14.4-32 32-32h256.8c17.6 0 32 14.4 32 32-0.1 17.6-14.4 32-32 32z"
      />
      <path
        fill="currentColor"
        d="M830.9 671.6v256.8c0 17.6-14.4 32-32 32s-32-14.4-32-32V671.6c0-17.6 14.4-32 32-32 17.7 0 32 14.4 32 32z"
      />
    </svg>
  )
}

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
  showCopy,
  onSelect,
  onEdit,
  onCopy,
  onDelete,
}: {
  account: Account
  selected: boolean
  disabled: boolean
  showCopy: boolean
  onSelect: () => void
  onEdit: () => void
  onCopy: () => void
  onDelete: () => void
}) {
  const live = useLiveControlStore(s => s.contexts[account.id])
  const messageRunning = useAutoMessageStore(s => s.contexts[account.id]?.isRunning)
  const popupRunning = useAutoPopUpStore(s => s.contexts[account.id]?.isRunning)
  const replyCtx = useAutoReplyStore(s => s.contexts[account.id])
  const canDelete = account.id !== 'default'
  const accountDisabled = Boolean(account.disabled)

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
      tabIndex={disabled || accountDisabled ? -1 : 0}
      onClick={() => {
        if (!disabled && !accountDisabled && !selected) onSelect()
      }}
      onKeyDown={e => {
        if (disabled || accountDisabled || selected) return
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
        (disabled || accountDisabled) && 'opacity-60',
        disabled && 'pointer-events-none',
      )}
    >
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-1.5">
            <p className="truncate text-sm font-medium leading-tight" title={account.name}>
              {account.name}
            </p>
            {accountDisabled ? (
              <span className="shrink-0 rounded bg-amber-100 px-1 py-px text-[10px] text-amber-800">
                已禁用
              </span>
            ) : null}
          </div>
          {accountDisabled ? (
            <p className="mt-0.5 text-[11px] text-amber-700/80">开通专业版/旗舰版后自动恢复</p>
          ) : live?.accountName ? (
            <p className="mt-0.5 truncate text-[11px] text-muted-foreground" title={live.accountName}>
              {live.accountName}
            </p>
          ) : (
            <p className="mt-0.5 text-[11px] text-muted-foreground/70">未登录中控</p>
          )}
        </div>
        <div className="flex shrink-0 items-center gap-0.5 opacity-0 group-hover:opacity-100 focus-within:opacity-100 group-focus-within:opacity-100">
          {!accountDisabled ? (
            <>
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
              {showCopy ? (
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-6 w-6"
                  onClick={e => {
                    e.stopPropagation()
                    onCopy()
                  }}
                  title="复制配置到其他账号"
                >
                  <Copy className="h-3.5 w-3.5" />
                </Button>
              ) : null}
            </>
          ) : null}
          {canDelete ? (
            <Button
              variant="ghost"
              size="icon"
              className="h-6 w-6 text-destructive hover:text-destructive opacity-100"
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

      {!accountDisabled ? (
        <div className="mt-2 flex flex-wrap gap-x-2.5 gap-y-1">
          <StatusDot label="中控" tone={liveTone} />
          <StatusDot label="发言" tone={messageRunning ? 'ok' : 'muted'} />
          <StatusDot label="弹窗" tone={popupRunning ? 'ok' : 'muted'} />
          <StatusDot label="回复" tone={listenTone} />
        </div>
      ) : null}
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
  const [isCopyDialogOpen, setIsCopyDialogOpen] = useState(false)
  const [newAccountName, setNewAccountName] = useState('')
  const [editingAccount, setEditingAccount] = useState<Account | null>(null)
  const [deletingAccount, setDeletingAccount] = useState<Account | null>(null)
  const [copySourceAccount, setCopySourceAccount] = useState<Account | null>(null)
  const [copyTargetIds, setCopyTargetIds] = useState<string[]>([])
  const [copyModules, setCopyModules] = useState<CopyAccountConfigModule[]>([...DEFAULT_COPY_MODULES])
  const [deleteConfirmName, setDeleteConfirmName] = useState('')
  const [isDeleting, setIsDeleting] = useState(false)

  const enabledAccounts = useMemo(
    () => accounts.filter(account => !account.disabled),
    [accounts],
  )
  const canCopyConfig = status.isPro && enabledAccounts.length >= 2

  const copyTargets = useMemo(
    () => enabledAccounts.filter(account => account.id !== copySourceAccount?.id),
    [enabledAccounts, copySourceAccount?.id],
  )

  useEffect(() => {
    try {
      localStorage.setItem(COLLAPSE_KEY, collapsed ? '1' : '0')
    } catch {
      /* ignore */
    }
  }, [collapsed])

  const handleAccountSwitch = useMemoizedFn((accountId: string) => {
    const target = accounts.find(a => a.id === accountId)
    if (target?.disabled) {
      toast.error(DISABLED_ACCOUNT_HINT)
      return
    }
    switchAccount(accountId)
    toast.success('切换账号成功')
  })

  const openAddDialog = useMemoizedFn(() => {
    const max = status.maxAccounts
    if (max >= 0 && accounts.length >= max) {
      toast.error(
        max <= 1
          ? '基础版只能用 1 个账号，请到「应用设置 → 收费计划」开通专业版或旗舰版'
          : `专业版最多 ${max} 个账号，升级旗舰版可无上限`,
      )
      return
    }
    setIsAddDialogOpen(true)
  })

  const handleAddAccount = useMemoizedFn(() => {
    const max = status.maxAccounts
    if (max >= 0 && accounts.length >= max) {
      toast.error(
        max <= 1
          ? '基础版只能用 1 个账号，请先开通专业版或旗舰版'
          : `专业版最多 ${max} 个账号，请升级旗舰版`,
      )
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

  const openCopyDialog = useMemoizedFn((account: Account) => {
    if (!status.isPro) {
      toast.error('开通专业版或旗舰版后，可在多个账号间复制配置。请到「应用设置 → 收费计划」激活卡密')
      return
    }
    const targets = accounts.filter(a => !a.disabled && a.id !== account.id)
    if (targets.length === 0) {
      toast.error('请先添加其他账号，再复制配置')
      return
    }
    setCopySourceAccount(account)
    setCopyTargetIds(targets.length === 1 ? [targets[0].id] : [])
    setCopyModules([...DEFAULT_COPY_MODULES])
    setIsCopyDialogOpen(true)
  })

  const handleCopyDialogOpenChange = useMemoizedFn((open: boolean) => {
    setIsCopyDialogOpen(open)
    if (!open) {
      setCopySourceAccount(null)
      setCopyTargetIds([])
      setCopyModules([...DEFAULT_COPY_MODULES])
    }
  })

  const toggleCopyTarget = useMemoizedFn((accountId: string, checked: boolean) => {
    setCopyTargetIds(prev =>
      checked ? [...new Set([...prev, accountId])] : prev.filter(id => id !== accountId),
    )
  })

  const toggleCopyModule = useMemoizedFn((module: CopyAccountConfigModule, checked: boolean) => {
    setCopyModules(prev =>
      checked ? [...new Set([...prev, module])] : prev.filter(m => m !== module),
    )
  })

  const handleCopyConfig = useMemoizedFn(() => {
    if (!copySourceAccount) return
    if (copyTargetIds.length === 0) {
      toast.error('请至少选择一个目标账号')
      return
    }
    if (copyModules.length === 0) {
      toast.error('请至少勾选一项要复制的内容')
      return
    }

    const result = copyAccountConfig({
      fromAccountId: copySourceAccount.id,
      toAccountIds: copyTargetIds,
      modules: copyModules,
    })

    if (result.targetCount === 0 || result.copiedModules.length === 0) {
      toast.error('复制失败，请刷新后重试')
      return
    }

    const targetNames = accounts
      .filter(a => copyTargetIds.includes(a.id))
      .map(a => a.name)
      .join('、')
    const moduleNames = result.copiedModules.map(m => COPY_ACCOUNT_MODULE_LABELS[m]).join('、')
    handleCopyDialogOpenChange(false)
    toast.success(`已将「${copySourceAccount.name}」的${moduleNames}复制到「${targetNames}」`)
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
      toast.error('删除失败，请确认相关任务已停止后重试')
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
        <div className="flex items-center gap-2 border-b px-3 py-2.5">
          <div className="flex min-w-0 flex-1 items-center gap-2">
            <AccountManageIcon className="h-5 w-5 shrink-0 text-muted-foreground" />
            <div className="min-w-0 leading-tight">
              <p className="text-sm font-medium text-foreground">账号管理</p>
              <p className="mt-0.5 text-[11px] text-muted-foreground">
                {accounts.length} 个账号
              </p>
            </div>
          </div>
          <Button
            variant="ghost"
            size="icon"
            className="h-7 w-7 shrink-0 text-muted-foreground"
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
                showCopy={canCopyConfig && !account.disabled}
                onSelect={() => handleAccountSwitch(account.id)}
                onEdit={() => openEditDialog(account)}
                onCopy={() => openCopyDialog(account)}
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
            title="添加账号（专业版最多 3 个，旗舰版无上限）"
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
                将清除本地配置与登录态，不会删除平台店铺账号。请先确认相关任务已停止。
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

        <Dialog open={isCopyDialogOpen} onOpenChange={handleCopyDialogOpenChange}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>复制配置到其他账号</DialogTitle>
              <DialogDescription>
                来源：{copySourceAccount?.name ?? '—'}。将覆盖目标账号已有配置，不会复制登录态。
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-4">
              <div className="space-y-2">
                <Label>目标账号</Label>
                <div className="max-h-36 space-y-2 overflow-y-auto rounded-md border p-2">
                  {copyTargets.map(account => (
                    <label
                      key={account.id}
                      className="flex cursor-pointer items-center gap-2 rounded-sm px-1 py-1 hover:bg-muted/50"
                    >
                      <Checkbox
                        checked={copyTargetIds.includes(account.id)}
                        onCheckedChange={checked =>
                          toggleCopyTarget(account.id, checked === true)
                        }
                      />
                      <span className="truncate text-sm">{account.name}</span>
                    </label>
                  ))}
                </div>
              </div>

              <div className="space-y-2">
                <Label>复制内容</Label>
                <div className="space-y-2 rounded-md border p-2">
                  {DEFAULT_COPY_MODULES.map(module => (
                    <label
                      key={module}
                      className="flex cursor-pointer items-center gap-2 rounded-sm px-1 py-1 hover:bg-muted/50"
                    >
                      <Checkbox
                        checked={copyModules.includes(module)}
                        onCheckedChange={checked => toggleCopyModule(module, checked === true)}
                      />
                      <span className="text-sm">{COPY_ACCOUNT_MODULE_LABELS[module]}</span>
                    </label>
                  ))}
                  {OPTIONAL_COPY_MODULES.map(module => (
                    <label
                      key={module}
                      className="flex cursor-pointer items-center gap-2 rounded-sm px-1 py-1 hover:bg-muted/50"
                    >
                      <Checkbox
                        checked={copyModules.includes(module)}
                        onCheckedChange={checked => toggleCopyModule(module, checked === true)}
                      />
                      <span className="text-sm text-muted-foreground">
                        {COPY_ACCOUNT_MODULE_LABELS[module]}（路径/无头）
                      </span>
                    </label>
                  ))}
                </div>
              </div>

              <p className="text-xs text-amber-700">将覆盖目标账号已有配置，登录态不会被复制。</p>

              <div className="flex justify-end gap-2">
                <Button variant="outline" onClick={() => handleCopyDialogOpenChange(false)}>
                  取消
                </Button>
                <Button
                  disabled={copyTargetIds.length === 0 || copyModules.length === 0}
                  onClick={handleCopyConfig}
                >
                  确认复制
                </Button>
              </div>
            </div>
          </DialogContent>
        </Dialog>
      </aside>
    </TooltipProvider>
  )
}
