import { useMemoizedFn } from 'ahooks'
import type { LogMessage } from 'electron-log'
import { useCallback, useEffect, useId, useRef, useState } from 'react'
import { IPC_CHANNELS } from 'shared/ipcChannels'
import { Button } from '@/components/ui/button'
import { ScrollArea } from '@/components/ui/scroll-area'
import { Switch } from '@/components/ui/switch'
import { useIpcListener } from '@/hooks/useIpc'
import { cn } from '@/lib/utils'

interface ParsedLog {
  id: string
  timestamp: string
  module: string
  level: string
  message: string
}

const MAX_LOG_MESSAGES = 200 // 仅展示最近的 200 条日志

/** 日志级别英文 → 中文（给普通用户看） */
const LEVEL_LABEL: Record<string, string> = {
  ERROR: '错误',
  FATAL: '致命',
  WARN: '警告',
  WARNING: '警告',
  INFO: '信息',
  SUCCESS: '成功',
  DEBUG: '调试',
  NOTE: '备注',
  VERBOSE: '详细',
}

function levelLabel(level: string): string {
  const key = level.toUpperCase()
  return LEVEL_LABEL[key] ?? level
}

export default function LogDisplayer() {
  const [logMessages, setLogMessages] = useState<ParsedLog[]>([])
  const [autoScroll, setAutoScroll] = useState(true)
  const scrollAreaRef = useRef<HTMLDivElement>(null)
  const viewportRef = useRef<HTMLDivElement>(null)

  const scrollToBottom = useCallback(() => {
    if (viewportRef.current && autoScroll) {
      const scrollContainer = viewportRef.current
      requestAnimationFrame(() => {
        scrollContainer.scrollTop = scrollContainer.scrollHeight
      })
    }
  }, [autoScroll])

  const parseLogMessage = (log: LogMessage): ParsedLog | null => {
    if (!log.data || log.data.length === 0) {
      return null
    }
    const rawLevel = typeof log.level === 'string' ? log.level.toUpperCase() : 'INFO'
    return {
      id: crypto.randomUUID(),
      timestamp: log.date.toLocaleString(),
      module: log.scope ?? '应用',
      level: rawLevel,
      // 只保留换行符之前的内容（堆栈已在主进程剥离）
      message: log.data.map(String).join(' ').split('\n')[0],
    }
  }

  useEffect(() => {
    // 监听 ScrollArea 的 viewport 元素
    if (scrollAreaRef.current) {
      const viewport = scrollAreaRef.current.querySelector<HTMLDivElement>(
        '[data-radix-scroll-area-viewport]',
      )
      if (viewport) {
        // 使用 MutableRefObject 来避免只读属性错误
        viewportRef.current = viewport
      }
    }
  }, [])

  // biome-ignore lint/correctness/useExhaustiveDependencies: parseLogMessage 不影响
  const handleLogMessage = useCallback(
    (message: LogMessage) => {
      const parsed = parseLogMessage(message)
      if (parsed) {
        setLogMessages(prev => [...prev.slice(-MAX_LOG_MESSAGES + 1), parsed])
        if (autoScroll) {
          scrollToBottom()
        }
      }
    },
    [autoScroll, scrollToBottom],
  )

  useIpcListener(IPC_CHANNELS.log, handleLogMessage)

  const autoScrollId = useId()

  return (
    <div className="h-full flex flex-col bg-background">
      {/* 日志头部 */}
      <div className="flex items-center justify-between px-4 py-2 border-b">
        <div className="flex items-center gap-2">
          <h3 className="font-medium">运行日志</h3>
          <span className="text-xs text-muted-foreground">{logMessages.length} 条记录</span>
        </div>
        <div className="flex items-center gap-4">
          {/* 自动滚动开关 */}
          <div className="flex items-center gap-2">
            <Switch id={autoScrollId} checked={autoScroll} onCheckedChange={setAutoScroll} />
            <label
              htmlFor={autoScrollId}
              className="text-xs text-muted-foreground cursor-pointer select-none"
            >
              自动滚动
            </label>
          </div>
          <Button
            variant="ghost"
            size="sm"
            onClick={() => {
              setLogMessages([])
              scrollToBottom()
            }}
            className="text-xs h-7 px-2 text-muted-foreground hover:text-destructive"
          >
            清空
          </Button>
        </div>
      </div>

      {/* 日志内容 */}
      <ScrollArea ref={scrollAreaRef} className="flex-1">
        <div className="p-4 font-mono text-sm">
          {logMessages.map((log, index) => (
            <LogItem key={log.id} log={log} index={index} />
          ))}
        </div>
      </ScrollArea>
    </div>
  )
}

function LogItem({ log, index }: { log: ParsedLog; index: number }) {
  const getLevelColor = useMemoizedFn((level: string): string => {
    switch (level.toUpperCase()) {
      case 'ERROR':
        return 'text-destructive font-medium'
      case 'FATAL':
        return 'text-destructive font-bold'
      case 'WARN':
      case 'WARNING':
        return 'text-warning font-medium'
      case 'DEBUG':
        return 'text-blue-600'
      case 'INFO':
        return 'text-muted-foreground'
      case 'SUCCESS':
        return 'text-emerald-600'
      case 'NOTE':
        return 'text-purple-600'
      default:
        return 'text-muted-foreground'
    }
  })
  return (
    <div
      key={log.id}
      className={cn(
        'flex gap-2 items-start py-1 whitespace-nowrap',
        index % 2 === 0 ? 'bg-muted/40' : 'bg-background',
      )}
    >
      <span className="text-muted-foreground shrink-0">[{log.timestamp}]</span>
      <span className="text-foreground/70 shrink-0">[{log.module}]</span>
      <span className={cn('shrink-0', getLevelColor(log.level))}>{levelLabel(log.level)}</span>
      <span className="text-foreground truncate">{log.message}</span>
    </div>
  )
}
