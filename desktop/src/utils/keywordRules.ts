/** 关键词规则：回评 */

/** @deprecated 读稿通道已隐藏，仅保留类型兼容旧配置 */
export type KeywordReplyChannel = 'comment' | 'voice' | 'both'

export interface KeywordRule {
  keywords: string[]
  contents: string[]
  /** @deprecated 读稿已隐藏，运行时固定公屏 */
  channel?: KeywordReplyChannel
  /** @deprecated 弹窗商品序号已隐藏 */
  goodsId?: number
  /** 同规则冷却秒数，默认 8 */
  cooldownSec?: number
}

export type KeywordMatchMode = 'includes' | 'exact'

export function normalizeKeywordRule(rule: KeywordRule): KeywordRule {
  return {
    keywords: rule.keywords ?? [],
    contents: rule.contents ?? [],
    channel: 'comment',
    goodsId: undefined,
    cooldownSec:
      typeof rule.cooldownSec === 'number' && rule.cooldownSec >= 0 ? rule.cooldownSec : 8,
  }
}

export function serializeKeywordRules(rules: KeywordRule[]): string {
  return rules
    .map(rule => {
      // 空规则显示为空行，便于编辑区展示填写提示，而不是无意义的 `|`
      if (rule.keywords.length === 0 && rule.contents.length === 0) {
        return ''
      }
      const base = `${rule.keywords.join('/')}|${rule.contents.join('|')}`
      const extras: string[] = []
      if (typeof rule.cooldownSec === 'number' && rule.cooldownSec !== 8) {
        extras.push(`#cd:${rule.cooldownSec}`)
      }
      return extras.length ? `${base}|${extras.join('|')}` : base
    })
    .join('\n')
}

/**
 * 解析批量编辑文本。空行忽略。
 * 可选尾部：`#cd:10`（旧版 `#goods:` / `#channel:*` 会被忽略）
 * @throws Error 行格式非法时抛出中文错误
 */
export function parseKeywordBatchText(text: string): KeywordRule[] {
  const lines = text.split('\n').filter(line => line.trim().length > 0)
  return lines.map((line, index) => {
    const items = line.split('|').map(s => s.trim())
    if (items.length < 2) {
      throw new Error(`第 ${index + 1} 行错误：请至少提供一个关键词和一条回复内容`)
    }
    const keywords = items[0].split('/').map(s => s.trim())
    const emptyKeywordIndex = keywords.findIndex(kw => kw.length === 0)
    if (emptyKeywordIndex >= 0) {
      throw new Error(`第 ${index + 1} 行错误：第 ${emptyKeywordIndex + 1} 个关键词是空的`)
    }

    let cooldownSec: number | undefined
    const contents: string[] = []

    for (const item of items.slice(1)) {
      if (!item) {
        throw new Error(`第 ${index + 1} 行错误：存在空的回复内容`)
      }
      // 兼容旧批量文本：忽略弹窗 / 读稿标记
      if (/^#goods:(\d+)$/i.test(item) || /^#channel:(comment|voice|both)$/i.test(item)) {
        continue
      }
      const cdMatch = /^#cd:(\d+)$/i.exec(item)
      if (cdMatch) {
        cooldownSec = Number(cdMatch[1])
        continue
      }
      contents.push(item)
    }

    if (contents.length === 0) {
      throw new Error(`第 ${index + 1} 行错误：请至少提供一条回复内容`)
    }

    return normalizeKeywordRule({ keywords, contents, cooldownSec })
  })
}

function matchesKeyword(content: string, keyword: string, mode: KeywordMatchMode): boolean {
  const kw = keyword.trim()
  if (!kw) return false
  if (mode === 'exact') {
    return content.trim() === kw
  }
  return content.includes(kw)
}

/** 按匹配模式取第一条规则；未命中返回 null。 */
export function matchKeywordRule(
  content: string | undefined | null,
  rules: KeywordRule[],
  mode: KeywordMatchMode = 'includes',
): KeywordRule | null {
  const hit = matchKeywordRuleWithIndex(content, rules, mode)
  return hit?.rule ?? null
}

export function matchKeywordRuleWithIndex(
  content: string | undefined | null,
  rules: KeywordRule[],
  mode: KeywordMatchMode = 'includes',
): { rule: KeywordRule; index: number } | null {
  if (!content) return null
  const index = rules.findIndex(({ keywords }) =>
    keywords.some(kw => matchesKeyword(content, kw, mode)),
  )
  if (index < 0) return null
  return { rule: normalizeKeywordRule(rules[index]), index }
}
