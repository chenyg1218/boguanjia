import { AUTO_REPLY } from '@/constants'

/**
 * 将回复模板中的 `{用户名}` 替换为昵称；mask 时脱敏为首字+***。
 */
export function replaceUsername(content: string, username: string, mask: boolean): string {
  if (!content) return ''
  const displayedUsername = mask
    ? `${String.fromCodePoint(username.codePointAt(0) ?? 42)}***`
    : username
  return content.replace(new RegExp(AUTO_REPLY.USERNAME_PLACEHOLDER, 'g'), displayedUsername)
}
