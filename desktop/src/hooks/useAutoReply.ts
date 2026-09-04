import { useMemoizedFn } from 'ahooks'
import { useMemo } from 'react'
import { IPC_CHANNELS } from 'shared/ipcChannels'
import { create } from 'zustand'
import { immer } from 'zustand/middleware/immer'
import { AUTO_REPLY } from '@/constants'
import { EVENTS, eventEmitter } from '@/utils/events'
import { useAccounts } from './useAccounts'
import type { ChatMessage } from './useAIChat'
import { type AIProvider, useAIProvider } from './useAIProvider'
import { type AutoReplyConfig, useAutoReplyConfig } from './useAutoReplyConfig'
import { useErrorHandler } from './useErrorHandler'
import { useCurrentLiveControl } from './useLiveControl'

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
type CommentMessage = MessageOf<'comment'>

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

async function sendMessage(
  accountId: string,
  content: string,
  errorHandler: ReturnType<typeof useErrorHandler>['handleError'],
): Promise<boolean> {
  if (!content) return false
  try {
    await window.ipcRenderer.invoke(IPC_CHANNELS.tasks.autoReply.sendReply, accountId, content)
    return true
  } catch (err) {
    errorHandler(err, '自动发送回复失败')
    return false
  }
}

function replaceUsername(content: string, username: string, mask: boolean) {
  if (!content) return ''
  // 把 {用户名} 替换为 username
  const displayedUsername = mask
    ? `${String.fromCodePoint(username.codePointAt(0) ?? 42 /* 42 是星号 */)}***`
    : username
  return content.replace(new RegExp(AUTO_REPLY.USERNAME_PLACEHOLDER, 'g'), displayedUsername)
}

/**
 * 处理关键字回复逻辑
 * @returns boolean - 是否成功匹配并发送了关键字回复
 */
const handleKeywordReply = (
  comment: CommentMessage,
  config: AutoReplyConfig,
  accountId: string,
  errorHandler: ReturnType<typeof useErrorHandler>['handleError'],
): boolean => {
  if (!config.comment.keywordReply.enable || !comment.content) {
    return false
  }

  const rule = config.comment.keywordReply.rules.find(({ keywords }) =>
    keywords.some(kw => comment.content?.includes(kw)),
  )

  if (rule && rule.contents.length > 0) {
    const content = getRandomElement(rule.contents)
    if (content) {
      const message = replaceUsername(content, comment.nick_name, config.hideUsername)
      sendMessage(accountId, message, errorHandler)
      // 注意：关键字回复不通过 addReply 添加到界面，直接发送
      return true // 匹配成功
    }
  }
  return false // 未匹配
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
      (cmt.msg_type === 'comment') &&
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
        const sent = await sendMessage(accountId, replyContent, errorHandler)
        if (sent) {
          useAutoReplyStore.getState().markReplySent(accountId, comment.msg_id)
        }
      }
    }
  } catch (err) {
    errorHandler(err, 'AI 生成回复失败')
  }
}

export function useAutoReply() {
  const store = useAutoReplyStore()
  const { currentAccountId } = useAccounts()
  const accountName = useCurrentLiveControl(ctx => ctx.accountName)
  const aiStore = useAIProvider('autoReply')
  const { config } = useAutoReplyConfig()
  const { handleError } = useErrorHandler()

  const context = useMemo(() => {
    return store.contexts[currentAccountId] || createDefaultContext()
  }, [store.contexts, currentAccountId])

  const { isRunning, isListening, comments, replies } = context

  const handleComment = useMemoizedFn((comment: Message, accountId: string) => {
    // const context = contexts[accountId] || createDefaultContext()
    const currentContext =
      useAutoReplyStore.getState().contexts[accountId] || createDefaultContext()
    const { isRunning, comments: allComments, replies: allReplies } = currentContext

    store.addComment(accountId, comment)
    if (!isRunning) {
      return
    }

    if (
      comment.nick_name === accountName ||
      config.blockList?.includes(comment.nick_name)
    ) {
      return
    }

    if (comment.msg_type !== 'comment') {
      return
    }

    const keywordReplied = handleKeywordReply(comment, config, currentAccountId, handleError)
    if (!keywordReplied && config.comment.aiReply.enable) {
      const { provider, model } = aiStore.config
      const apiKey = aiStore.apiKeys[provider]
      const customBaseURL = aiStore.customBaseURL
      handleAIReply(
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
