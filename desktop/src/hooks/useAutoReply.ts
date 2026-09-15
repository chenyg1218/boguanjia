import { useMemoizedFn } from 'ahooks'
import { useMemo } from 'react'
import { IPC_CHANNELS } from 'shared/ipcChannels'
import { create } from 'zustand'
import { immer } from 'zustand/middleware/immer'
import { AUTO_REPLY } from '@/constants'
import { replaceUsername } from '@/utils/autoReplyText'
import { EVENTS, eventEmitter } from '@/utils/events'
import { matchKeywordRuleWithIndex, type KeywordReplyChannel } from '@/utils/keywordRules'
import { mergeWithoutArray } from '@/utils/misc'
import { useAccounts } from './useAccounts'
import type { ChatMessage } from './useAIChat'
import { type AIProvider, useAIProvider } from './useAIProvider'
import {
  type AutoReplyConfig,
  createDefaultConfig,
  useAutoReplyConfig,
  useAutoReplyConfigStore,
} from './useAutoReplyConfig'
import { useErrorHandler } from './useErrorHandler'
import { useCurrentLiveControl, useLiveControlStore } from './useLiveControl'
// v1.2 暂缓：语音读稿
// import { useVoiceBroadcastStore } from './useVoiceBroadcast'

interface ReplyPreview {
  id: string
  commentId: string
  replyContent: string
  replyFor: string
  time: string
  isSent?: boolean
}

export type Message = LiveMessage
export type MessageType = Message['msg_type']
export type MessageOf<T extends MessageType> = Extract<Message, { msg_type: T }>
type CommentMessage = MessageOf<
  'comment' | 'wechat_channel_live_msg' | 'xiaohongshu_comment' | 'taobao_comment'
>

type ListeningStatus = 'waiting' | 'listening' | 'stopped' | 'error'

interface AutoReplyContext {
  isRunning: boolean
  isListening: ListeningStatus
  replies: ReplyPreview[]
  comments: Message[]
}

interface AutoReplyState {
  contexts: Record<string, AutoReplyContext>
}
interface AutoReplyAction {
  setIsRunning: (accountId: string, isRunning: boolean) => void
  setIsListening: (accountId: string, isListening: ListeningStatus) => void
  addComment: (accountId: string, comment: Message) => void
  addReply: (accountId: string, commentId: string, nickname: string, content: string) => void
  markReplySent: (accountId: string, commentId: string) => void
  removeReply: (accountId: string, commentId: string) => void
}

const createDefaultContext = (): AutoReplyContext => ({
  isRunning: false,
  isListening: 'stopped',
  replies: [],
  comments: [],
})

function getConfigForAccount(accountId: string): AutoReplyConfig {
  return mergeWithoutArray(
    createDefaultConfig(),
    useAutoReplyConfigStore.getState().contexts[accountId]?.config ?? {},
  )
}

function getHostName(accountId: string): string {
  return useLiveControlStore.getState().contexts[accountId]?.accountName?.trim() ?? ''
}

function shouldSkipHostComment(comment: Message, accountId: string, config: AutoReplyConfig) {
  if ('is_host' in comment && comment.is_host) {
    return true
  }
  const nick = comment.nick_name?.trim() ?? ''
  const hostName = getHostName(accountId)
  if (hostName && nick === hostName) {
    return true
  }
  if (nick && config.blockList?.includes(nick)) {
    return true
  }
  return false
}

export const useAutoReplyStore = create<AutoReplyState & AutoReplyAction>()(
  immer(set => {
    eventEmitter.on(EVENTS.ACCOUNT_REMOVED, (accountId: string) => {
      set(state => {
        delete state.contexts[accountId]
      })
    })

    const ensureContext = (state: AutoReplyState, accountId: string) => {
      if (!state.contexts[accountId]) {
        state.contexts[accountId] = createDefaultContext()
      }
      return state.contexts[accountId]
    }

    return {
      contexts: {},
      setIsRunning: (accountId, isRunning) =>
        set(state => {
          const context = ensureContext(state, accountId)
          context.isRunning = isRunning
        }),
      setIsListening: (accountId, isListening) =>
        set(state => {
          const context = ensureContext(state, accountId)
          context.isListening = isListening
        }),

      addComment: (accountId, comment) =>
        set(state => {
          const context = ensureContext(state, accountId)
          // 限制评论数量，防止内存无限增长
          context.comments = [{ ...comment }, ...context.comments].slice(0, AUTO_REPLY.MAX_COMMENTS)
        }),
      addReply: (accountId, commentId, nickname, content) =>
        set(state => {
          const context = ensureContext(state, accountId)
          context.replies = [
            {
              id: crypto.randomUUID(),
              commentId,
              replyContent: content,
              replyFor: nickname,
              time: new Date().toISOString(),
              isSent: false,
            },
            ...context.replies,
          ].slice(0, AUTO_REPLY.MAX_REPLIES)
        }),
      markReplySent: (accountId, commentId) =>
        set(state => {
          const context = ensureContext(state, accountId)
          const reply = context.replies.find(r => r.commentId === commentId)
          if (reply) reply.isSent = true
        }),
      removeReply: (accountId, commentId) =>
        set(state => {
          const context = ensureContext(state, accountId)
          context.replies = context.replies.filter(reply => reply.commentId !== commentId)
        }),
    }
  }),
)

function generateAIMessages(
  comments: CommentMessage[],
  replies: ReplyPreview[],
): Omit<ChatMessage, 'id' | 'timestamp'>[] {
  // 1. 按时间排序混合评论和回复
  const sortedItems = [
    ...comments.map(c => ({ type: 'comment' as const, time: c.time, data: c })),
    ...replies.map(r => ({ type: 'reply' as const, time: r.time, data: r })),
  ].sort((a, b) => new Date(a.time).getTime() - new Date(b.time).getTime())

  // 2. 转换为 AI 消息格式
  const rawMessages: Omit<ChatMessage, 'id' | 'timestamp'>[] = sortedItems.map(item => {
    if (item.type === 'comment') {
      return {
        role: 'user',
        // 发送给 AI 的格式，包含昵称和内容
        content: JSON.stringify({
          nickname: item.data.nick_name,
          content: item.data.content ?? '', // 确保 content 是字符串
        }),
      }
    }
    // item.type === 'reply'
    return {
      role: 'assistant',
      content: item.data.replyContent,
    }
  })

  // 3. 合并连续的同角色消息
  if (rawMessages.length === 0) {
    return []
  }

  const mergedMessages: Omit<ChatMessage, 'id' | 'timestamp'>[] = []
  let currentMessage = { ...rawMessages[0], content: [rawMessages[0].content] } // 初始化第一个消息

  for (let i = 1; i < rawMessages.length; i++) {
    if (rawMessages[i].role === currentMessage.role) {
      currentMessage.content.push(rawMessages[i].content) // 追加内容
    } else {
      // 角色变化，保存之前的消息，开始新消息
      mergedMessages.push({
        role: currentMessage.role,
        content: currentMessage.content.join('\n'), // 用换行符合并内容
      })
      currentMessage = { ...rawMessages[i], content: [rawMessages[i].content] }
    }
  }

  // 添加最后一条消息
  mergedMessages.push({
    role: currentMessage.role,
    content: currentMessage.content.join('\n'),
  })

  return mergedMessages
}

function getRandomElement<T>(arr: T[]): T | undefined {
  if (arr.length === 0) return undefined
  const randomIndex = Math.floor(Math.random() * arr.length)
  return arr[randomIndex]
}

/** 按账号串行发送回复，避免连发互相覆盖评论框 */
const replySendQueues = new Map<string, Promise<unknown>>()

function enqueueReplySend<T>(accountId: string, job: () => Promise<T>): Promise<T> {
  const prev = replySendQueues.get(accountId) ?? Promise.resolve()
  const next = prev.then(job, job)
  replySendQueues.set(
    accountId,
    next.then(
      () => undefined,
      () => undefined,
    ),
  )
  return next
}

async function sendMessage(
  accountId: string,
  content: string,
  errorHandler: ReturnType<typeof useErrorHandler>['handleError'],
): Promise<boolean> {
  if (!content) return false
  return enqueueReplySend(accountId, async () => {
    try {
      const result = await window.ipcRenderer.invoke(
        IPC_CHANNELS.tasks.autoReply.sendReply,
        accountId,
        content,
      )
      if (result && typeof result === 'object' && 'ok' in result && !result.ok) {
        errorHandler(new Error(result.error), '自动发送回复失败，请检查中控台连接与评论框')
        return false
      }
      return true
    } catch (err) {
      errorHandler(err, '自动发送回复失败，请检查中控台连接与评论框')
      return false
    }
  })
}

/** 规则冷却：accountId:ruleIndex → 到期时间戳 */
const keywordCooldownUntil = new Map<string, number>()

function isRuleCooling(accountId: string, ruleIndex: number): boolean {
  const key = `${accountId}:${ruleIndex}`
  const until = keywordCooldownUntil.get(key) ?? 0
  return Date.now() < until
}

function markRuleCooldown(accountId: string, ruleIndex: number, cooldownSec: number) {
  const sec = Math.max(0, cooldownSec)
  if (sec <= 0) return
  keywordCooldownUntil.set(`${accountId}:${ruleIndex}`, Date.now() + sec * 1000)
}

async function dispatchOutput(
  accountId: string,
  text: string,
  _channel: KeywordReplyChannel,
  errorHandler: ReturnType<typeof useErrorHandler>['handleError'],
): Promise<boolean> {
  // v1.1.3：仅公屏文字；语音通道暂缓
  if (!text) return false
  return sendMessage(accountId, text, errorHandler)
  // if ((channel === 'voice' || channel === 'both') && text) { speakOnce... }
}

/**
 * 关键词回复：匹配模式 + 多回复随机（冷却保留；读稿/弹窗三联暂缓）
 * @returns 是否已处理完毕（冷却中 / 发送成功）。发送失败返回 false，交给 AI 兜底。
 */
const handleKeywordTriple = async (
  comment: CommentMessage,
  config: AutoReplyConfig,
  accountId: string,
  errorHandler: ReturnType<typeof useErrorHandler>['handleError'],
): Promise<boolean> => {
  if (!config.comment.keywordReply.enable || !comment.content) {
    return false
  }

  const hit = matchKeywordRuleWithIndex(
    comment.content,
    config.comment.keywordReply.rules,
    config.comment.keywordReply.matchMode ?? 'includes',
  )
  if (!hit) return false

  const { rule, index } = hit
  // 没有可发文案时不拦截，让 AI 兜底有机会接手
  if (!rule.contents.length) return false

  const cooldownSec = rule.cooldownSec ?? 8
  if (isRuleCooling(accountId, index)) {
    return true
  }

  // v1.2 暂缓：关键词弹指定商品
  // if (rule.goodsId && rule.goodsId > 0) {
  //   void window.ipcRenderer.invoke(IPC_CHANNELS.tasks.autoPopUp.popupOnce, accountId, rule.goodsId)
  // }

  const channel: KeywordReplyChannel = 'comment'
  const raw = getRandomElement(rule.contents)
  const message = raw
    ? replaceUsername(raw, comment.nick_name, config.hideUsername)
    : ''

  if (!message) return false

  useAutoReplyStore.getState().addReply(accountId, comment.msg_id, comment.nick_name, message)
  const sent = await dispatchOutput(accountId, message, channel, errorHandler)
  if (sent) {
    useAutoReplyStore.getState().markReplySent(accountId, comment.msg_id)
    markRuleCooldown(accountId, index, cooldownSec)
    return true
  }
  // 公屏未真正发出：不占冷却，交由 AI 接管（若已开启）
  return false
}

/**
 * 处理 AI 回复逻辑
 */
const handleAIReply = async (
  accountId: string,
  comment: CommentMessage,
  allComments: Message[],
  allReplies: ReplyPreview[],
  config: AutoReplyConfig,
  {
    provider,
    model,
    apiKey,
    customBaseURL,
  }: {
    provider: AIProvider
    model: string
    apiKey: string
    customBaseURL: string
  },
  onReply: (content: string) => void,
  errorHandler: ReturnType<typeof useErrorHandler>['handleError'],
) => {
  if (!config.comment.aiReply.enable) return

  const { prompt, autoSend } = config.comment.aiReply

  // 筛选与该用户相关的评论和回复
  const userComments = [comment, ...allComments].filter(
    cmt =>
      (cmt.msg_type === 'comment' ||
        cmt.msg_type === 'wechat_channel_live_msg' ||
        cmt.msg_type === 'xiaohongshu_comment' ||
        cmt.msg_type === 'taobao_comment') &&
      cmt.nick_name === comment.nick_name,
  ) as CommentMessage[]
  const userReplies = allReplies.filter(reply => reply.replyFor === comment.nick_name)

  // 生成 AI 请求的消息体
  const plainMessages = generateAIMessages(userComments, userReplies)

  // 构造系统提示
  const systemPrompt = `你将接收到一个或多个 JSON 字符串，每个字符串代表用户的评论，格式为 {"nickname": "用户昵称", "content": "评论内容"}。请分析所有评论，并根据以下要求生成一个回复：\n${prompt}`

  const messages = [
    { role: 'system', content: systemPrompt }, // id 和 timestamp 对请求不重要
    ...plainMessages,
  ]

  try {
    const replyContent = await window.ipcRenderer.invoke(IPC_CHANNELS.tasks.aiChat.normalChat, {
      messages,
      provider,
      model,
      apiKey,
      customBaseURL,
    })

    if (replyContent && typeof replyContent === 'string') {
      onReply(replyContent)
      // 自动发送
      if (autoSend) {
        const channel: KeywordReplyChannel = 'comment'
        const sent = await dispatchOutput(accountId, replyContent, channel, errorHandler)
        if (sent) {
          useAutoReplyStore.getState().markReplySent(accountId, comment.msg_id)
        }
      }
    }
  } catch (err) {
    errorHandler(err, 'AI 生成回复失败，请检查 API 密钥与网络')
  }
}

export function useAutoReply() {
  const store = useAutoReplyStore()
  const { currentAccountId } = useAccounts()
  const aiStore = useAIProvider('autoReply')
  // 保留 hook 订阅，确保配置变更时当前页能刷新；handleComment 内按 accountId 另取
  useAutoReplyConfig()
  useCurrentLiveControl(ctx => ctx.accountName)
  const { handleError } = useErrorHandler()

  const context = useMemo(() => {
    return store.contexts[currentAccountId] || createDefaultContext()
  }, [store.contexts, currentAccountId])

  const { isRunning, isListening, comments, replies } = context

  const handleComment = useMemoizedFn(async (comment: Message, accountId: string) => {
    const currentContext =
      useAutoReplyStore.getState().contexts[accountId] || createDefaultContext()
    const { isRunning, comments: allComments, replies: allReplies } = currentContext
    const config = getConfigForAccount(accountId)

    store.addComment(accountId, comment)
    if (!isRunning) {
      return
    }

    if (shouldSkipHostComment(comment, accountId, config)) {
      return
    }

    if (
      comment.msg_type !== 'comment' &&
      comment.msg_type !== 'wechat_channel_live_msg' &&
      comment.msg_type !== 'xiaohongshu_comment' &&
      comment.msg_type !== 'taobao_comment'
    ) {
      return
    }

    const keywordHandled = await handleKeywordTriple(comment, config, accountId, handleError)
    if (!keywordHandled && config.comment.aiReply.enable) {
      const { provider, model } = aiStore.config
      const apiKey = aiStore.apiKeys[provider]
      const customBaseURL = aiStore.customBaseURL
      await handleAIReply(
        accountId,
        comment,
        allComments,
        allReplies,
        config,
        {
          provider,
          model,
          apiKey,
          customBaseURL,
        },
        (replyContent: string) => {
          store.addReply(accountId, comment.msg_id, comment.nick_name, replyContent)
        },
        handleError,
      )
    }
  })

  return {
    // 当前账户的状态
    isRunning,
    isListening,
    comments, // 当前账户的评论
    replies, // 当前账户的回复

    // Actions (绑定到当前账户)
    handleComment,
    setIsRunning: (running: boolean) => store.setIsRunning(currentAccountId, running),
    setIsListening: (listening: ListeningStatus) =>
      store.setIsListening(currentAccountId, listening),
    removeReply: (commentId: string) => store.removeReply(currentAccountId, commentId),
    markReplySent: (commentId: string) => store.markReplySent(currentAccountId, commentId),
  }
}
