import { IPC_CHANNELS } from 'shared/ipcChannels'
import type { AIProvider } from '@/hooks/useAIProvider'
import { useAIProviderStore } from '@/hooks/useAIProvider'

const REWRITE_SYSTEM = `你是直播话术改写助手。请在保持原意、适合直播口播的前提下改写用户给出的文本。
要求：
1. 不要改变核心卖点与事实信息
2. 语气自然口语化，可适当变换句式减少复读感
3. 不要添加 Markdown、引号包裹或解释说明
4. 只输出改写后的正文`

/**
 * 调用现有 AI Provider 改写文本；失败抛出 Error。
 */
export async function rewriteTextWithAI(text: string): Promise<string> {
  const trimmed = text.trim()
  if (!trimmed) throw new Error('没有可改写的文本')

  const store = useAIProviderStore.getState()
  // 优先用自动回复的 Key，其次聊天
  const pick = (type: 'autoReply' | 'chat') => {
    const cfg = store[type]
    const provider = cfg.config.provider as AIProvider
    const apiKey = cfg.apiKeys[provider]
    const model = cfg.config.model
    const customBaseURL = cfg.customBaseURL
    return { provider, apiKey, model, customBaseURL }
  }

  let creds = pick('autoReply')
  if (!creds.apiKey) creds = pick('chat')
  if (!creds.apiKey) {
    throw new Error('请先在「自动回复」或「AI 助手」中配置 API Key')
  }

  const result = await window.ipcRenderer.invoke(IPC_CHANNELS.tasks.aiChat.normalChat, {
    messages: [
      { role: 'system', content: REWRITE_SYSTEM },
      { role: 'user', content: trimmed },
    ],
    provider: creds.provider,
    model: creds.model,
    apiKey: creds.apiKey,
    customBaseURL: creds.customBaseURL || undefined,
  })

  if (!result || typeof result !== 'string') {
    throw new Error('AI 改写失败，请检查网络与模型配置')
  }
  return result.trim()
}
