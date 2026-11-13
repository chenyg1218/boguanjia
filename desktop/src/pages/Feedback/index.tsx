import { XIcon } from 'lucide-react'
import { useCallback, useEffect, useId, useRef, useState } from 'react'
import { IPC_CHANNELS } from 'shared/ipcChannels'
import { Title } from '@/components/common/Title'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { useToast } from '@/hooks/useToast'
import { cn } from '@/lib/utils'

const MAX_IMAGES = 3
const MAX_EDGE = 1280
const MAX_DATA_URL_CHARS = 620_000

type FeedbackCategory = 'bug' | 'feature' | 'other'

type PreviewImage = {
  id: string
  name: string
  dataUrl: string
}

type FeedbackItem = {
  id: number
  category: string
  title: string
  body: string
  contact: string
  status: string
  image_count: number
  created_at: string
  updated_at: string
}

const FEEDBACK_COPY: Record<
  FeedbackCategory,
  {
    titlePlaceholder: string
    bodyPlaceholder: string
    imageHint: string
  }
> = {
  bug: {
    titlePlaceholder: '一句话概括异常，例如：自动弹窗点击开始后没有反应',
    bodyPlaceholder:
      '请写明：\n1. 使用的平台（如抖音小店）\n2. 具体操作步骤\n3. 实际出现的情况（报错文字、卡住位置等）\n4. 你期望出现的结果',
    imageHint: '附上报错提示或异常界面截图，更便于排查',
  },
  feature: {
    titlePlaceholder: '一句话概括需求，例如：希望支持按整点自动发言',
    bodyPlaceholder:
      '请写明：\n1. 你现在怎么做、哪里不方便\n2. 希望软件增加或改进什么\n3. 主要用在哪个平台或场景\n4. 有的话，也可举例期望的使用方式',
    imageHint: '如有参考界面或示意，可附截图说明期望效果',
  },
  other: {
    titlePlaceholder: '一句话概括事由，例如：想了解如何成为代理商赚钱',
    bodyPlaceholder:
      '请写明：\n1. 具体想咨询或说明的事情\n2. 你的身份或合作意向（如主播、团队、渠道代理等）\n3. 希望我们如何回复或协助',
    imageHint: '如需对照说明，可附相关截图',
  },
}

const CATEGORY_NAMES: Record<string, string> = {
  bug: '功能异常',
  feature: '功能建议',
  other: '其他',
}

const STATUS_META: Record<string, { label: string; className: string }> = {
  open: { label: '待处理', className: 'bg-red-50 text-red-600' },
  read: { label: '处理中', className: 'bg-blue-50 text-blue-600' },
  done: { label: '已处理', className: 'bg-emerald-50 text-emerald-600' },
  ignored: { label: '已忽略', className: 'bg-muted text-muted-foreground' },
}

async function compressImageFile(file: File): Promise<string> {
  const bitmap = await createImageBitmap(file)
  try {
    const scale = Math.min(1, MAX_EDGE / Math.max(bitmap.width, bitmap.height))
    const width = Math.max(1, Math.round(bitmap.width * scale))
    const height = Math.max(1, Math.round(bitmap.height * scale))
    const canvas = document.createElement('canvas')
    canvas.width = width
    canvas.height = height
    const ctx = canvas.getContext('2d')
    if (!ctx) throw new Error('无法处理图片')
    ctx.drawImage(bitmap, 0, 0, width, height)

    let quality = 0.72
    let dataUrl = canvas.toDataURL('image/jpeg', quality)
    while (dataUrl.length > MAX_DATA_URL_CHARS && quality > 0.4) {
      quality -= 0.08
      dataUrl = canvas.toDataURL('image/jpeg', quality)
    }
    if (dataUrl.length > MAX_DATA_URL_CHARS) {
      throw new Error('图片过大，请换一张更小的截图')
    }
    return dataUrl
  } finally {
    bitmap.close()
  }
}

function formatTime(iso: string) {
  const raw = String(iso || '').replace('T', ' ').replace('Z', '')
  return raw.slice(0, 19) || '-'
}

export default function FeedbackPage() {
  const { toast } = useToast()
  const fileInputRef = useRef<HTMLInputElement>(null)
  const titleId = useId()
  const bodyId = useId()
  const contactId = useId()

  const [category, setCategory] = useState<FeedbackCategory>('bug')
  const [title, setTitle] = useState('')
  const [body, setBody] = useState('')
  const [contact, setContact] = useState('')
  const [images, setImages] = useState<PreviewImage[]>([])
  const [submitting, setSubmitting] = useState(false)
  const [compressing, setCompressing] = useState(false)
  const [items, setItems] = useState<FeedbackItem[]>([])
  const [loadingList, setLoadingList] = useState(true)
  const [listError, setListError] = useState('')
  const [expandedId, setExpandedId] = useState<number | null>(null)

  const copy = FEEDBACK_COPY[category]

  const loadList = useCallback(async () => {
    setLoadingList(true)
    setListError('')
    try {
      const result = await window.ipcRenderer.invoke(IPC_CHANNELS.feedback.list)
      if (!result.ok) {
        setListError(result.message || '加载失败')
        setItems([])
        return
      }
      setItems(result.items || [])
    } catch (error) {
      console.error('Load feedback list failed:', error)
      setListError('加载失败，请稍后重试')
      setItems([])
    } finally {
      setLoadingList(false)
    }
  }, [])

  useEffect(() => {
    void loadList()
  }, [loadList])

  const resetForm = () => {
    setCategory('bug')
    setTitle('')
    setBody('')
    setContact('')
    setImages([])
  }

  const handlePickImages = async (files: FileList | null) => {
    if (!files?.length) return
    const remain = MAX_IMAGES - images.length
    if (remain <= 0) {
      toast.error(`最多上传 ${MAX_IMAGES} 张截图`)
      return
    }
    const picked = Array.from(files).slice(0, remain)
    setCompressing(true)
    try {
      const next: PreviewImage[] = []
      for (const file of picked) {
        if (!file.type.startsWith('image/')) {
          toast.error(`跳过非图片文件：${file.name}`)
          continue
        }
        try {
          const dataUrl = await compressImageFile(file)
          next.push({
            id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
            name: file.name,
            dataUrl,
          })
        } catch (err) {
          toast.error(err instanceof Error ? err.message : `处理失败：${file.name}`)
        }
      }
      if (next.length) setImages(prev => [...prev, ...next].slice(0, MAX_IMAGES))
    } finally {
      setCompressing(false)
      if (fileInputRef.current) fileInputRef.current.value = ''
    }
  }

  const handleSubmit = async () => {
    const trimmedTitle = title.replace(/\s+/g, ' ').trim()
    const trimmedBody = body.trim()
    if (!trimmedTitle) {
      toast.error('请填写标题')
      return
    }
    if (!trimmedBody) {
      toast.error('请填写描述')
      return
    }
    setSubmitting(true)
    try {
      const result = await window.ipcRenderer.invoke(IPC_CHANNELS.feedback.submit, {
        category,
        title: trimmedTitle,
        body: trimmedBody,
        contact: contact.trim() || undefined,
        images: images.map(img => img.dataUrl),
      })
      if (!result.ok) {
        toast.error(result.message || '提交失败')
        return
      }
      toast.success(result.message || '已提交')
      resetForm()
      await loadList()
    } catch (error) {
      console.error('Feedback submit failed:', error)
      toast.error('提交失败，请稍后重试或通过微信联系')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div className="container space-y-6 py-8">
      <Title
        title="问题反馈"
        description="反馈功能异常或提出改进建议，并可查看提交记录"
      />

      <div className="grid gap-6 xl:grid-cols-[minmax(0,1.1fr)_minmax(0,0.9fr)]">
        <Card>
          <CardContent className="space-y-4 pt-6">
            <div className="space-y-2">
              <Label htmlFor={`${titleId}-category`}>反馈类型</Label>
              <select
                id={`${titleId}-category`}
                className="border-input bg-transparent flex h-9 w-full rounded-md border px-3 py-1 text-sm shadow-xs outline-none"
                value={category}
                onChange={e => setCategory(e.target.value as FeedbackCategory)}
                disabled={submitting}
              >
                <option value="bug">功能异常</option>
                <option value="feature">功能建议</option>
                <option value="other">其他</option>
              </select>
            </div>

            <div className="space-y-2">
              <Label htmlFor={titleId}>标题</Label>
              <Input
                id={titleId}
                value={title}
                maxLength={80}
                placeholder={copy.titlePlaceholder}
                disabled={submitting}
                onChange={e => setTitle(e.target.value)}
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor={bodyId}>详细说明</Label>
              <Textarea
                id={bodyId}
                value={body}
                maxLength={2000}
                placeholder={copy.bodyPlaceholder}
                className="min-h-36"
                disabled={submitting}
                onChange={e => setBody(e.target.value)}
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor={contactId}>联系方式（选填）</Label>
              <Input
                id={contactId}
                value={contact}
                maxLength={64}
                placeholder="微信或手机号，便于必要时联系你"
                disabled={submitting}
                onChange={e => setContact(e.target.value)}
              />
            </div>

            <div className="space-y-2">
              <div className="flex items-center justify-between gap-2">
                <Label>截图（选填，最多 {MAX_IMAGES} 张）</Label>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  disabled={submitting || compressing || images.length >= MAX_IMAGES}
                  onClick={() => fileInputRef.current?.click()}
                >
                  {compressing ? '处理中…' : '添加截图'}
                </Button>
              </div>
              <input
                ref={fileInputRef}
                type="file"
                accept="image/*"
                multiple
                className="hidden"
                onChange={e => void handlePickImages(e.target.files)}
              />
              {images.length > 0 ? (
                <div className="flex flex-wrap gap-2">
                  {images.map(img => (
                    <div
                      key={img.id}
                      className="relative h-20 w-28 overflow-hidden rounded-md border bg-muted"
                    >
                      <img src={img.dataUrl} alt={img.name} className="h-full w-full object-cover" />
                      <button
                        type="button"
                        className="absolute top-1 right-1 rounded-full bg-black/60 p-0.5 text-white"
                        disabled={submitting}
                        onClick={() => setImages(prev => prev.filter(x => x.id !== img.id))}
                        aria-label="移除图片"
                      >
                        <XIcon className="h-3.5 w-3.5" />
                      </button>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="text-xs text-muted-foreground">{copy.imageHint}</p>
              )}
            </div>

            <div className="flex justify-end gap-2 pt-2">
              <Button
                type="button"
                variant="outline"
                disabled={submitting}
                onClick={resetForm}
              >
                清空
              </Button>
              <Button disabled={submitting || compressing} onClick={() => void handleSubmit()}>
                {submitting ? '提交中…' : '提交反馈'}
              </Button>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="pt-6">
            <div className="mb-4 flex items-center justify-between gap-3">
              <div>
                <Label>我的提交记录</Label>
                <p className="text-sm text-muted-foreground">可查看处理进度</p>
              </div>
              <Button
                type="button"
                variant="outline"
                size="sm"
                disabled={loadingList}
                onClick={() => void loadList()}
              >
                {loadingList ? '刷新中…' : '刷新'}
              </Button>
            </div>

            {listError ? (
              <p className="text-sm text-destructive">{listError}</p>
            ) : loadingList && items.length === 0 ? (
              <p className="text-sm text-muted-foreground">加载中…</p>
            ) : items.length === 0 ? (
              <p className="text-sm text-muted-foreground">暂无提交记录</p>
            ) : (
              <div className="space-y-2">
                {items.map(item => {
                  const status = STATUS_META[item.status] || {
                    label: item.status || '-',
                    className: 'bg-muted text-muted-foreground',
                  }
                  const open = expandedId === item.id
                  return (
                    <div key={item.id} className="rounded-lg border">
                      <button
                        type="button"
                        className="flex w-full items-start gap-3 px-3 py-3 text-left"
                        onClick={() => setExpandedId(open ? null : item.id)}
                      >
                        <div className="min-w-0 flex-1 space-y-1">
                          <div className="flex flex-wrap items-center gap-2">
                            <span className="text-sm font-medium">{item.title}</span>
                            <span
                              className={cn(
                                'rounded px-1.5 py-0.5 text-xs',
                                status.className,
                              )}
                            >
                              {status.label}
                            </span>
                          </div>
                          <div className="text-xs text-muted-foreground">
                            {CATEGORY_NAMES[item.category] || item.category} ·{' '}
                            {formatTime(item.created_at)}
                            {item.image_count > 0 ? ` · ${item.image_count} 张截图` : ''}
                          </div>
                        </div>
                      </button>
                      {open ? (
                        <div className="space-y-2 border-t px-3 py-3 text-sm">
                          <p className="whitespace-pre-wrap break-words text-foreground/90">
                            {item.body}
                          </p>
                          {item.contact ? (
                            <p className="text-xs text-muted-foreground">联系方式：{item.contact}</p>
                          ) : null}
                          <p className="text-xs text-muted-foreground">
                            状态：
                            <span className={cn('ml-1', status.className, 'rounded px-1.5 py-0.5')}>
                              {status.label}
                            </span>
                            {item.updated_at && item.updated_at !== item.created_at
                              ? ` · 更新于 ${formatTime(item.updated_at)}`
                              : ''}
                          </p>
                        </div>
                      ) : null}
                    </div>
                  )
                })}
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  )
}
