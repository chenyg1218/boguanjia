/** 关键词批量规则：`关键词A/B|回复1|回复2` */

export interface KeywordRule {
  keywords: string[]
  contents: string[]
}

export function serializeKeywordRules(rules: KeywordRule[]): string {
  return rules
    .map(rule => `${rule.keywords.join('/')}|${rule.contents.join('|')}`)
    .join('\n')
}

/**
 * 解析批量编辑文本。空行忽略。
 * @throws Error 行格式非法时抛出中文错误（与 UI toast 文案一致）
 */
export function parseKeywordBatchText(text: string): KeywordRule[] {
  const lines = text.split('\n').filter(line => line.trim().length > 0)
  return lines.map((line, index) => {
    const items = line.split('|')
    if (items.length < 2) {
      throw new Error(`第 ${index + 1} 行错误：请至少提供一个关键词和一条回复内容`)
    }
    const keywords = items[0].split('/').map(s => s.trim())
    const emptyKeywordIndex = keywords.findIndex(kw => kw.length === 0)
    if (emptyKeywordIndex >= 0) {
      throw new Error(`第 ${index + 1} 行错误：第 ${emptyKeywordIndex + 1} 个关键词是空的`)
    }
    const contents = items.slice(1).map(s => s.trim())
    const emptyContentIndex = contents.findIndex(con => con.length === 0)
    if (emptyContentIndex >= 0) {
      throw new Error(`第 ${index + 1} 行错误：第 ${emptyContentIndex + 1} 条回复内容是空的`)
    }
    return { keywords, contents }
  })
}

/** 按 includes 匹配第一条规则；未命中返回 null */
export function matchKeywordRule(
  content: string | undefined | null,
  rules: KeywordRule[],
): KeywordRule | null {
  if (!content) return null
  return (
    rules.find(({ keywords }) => keywords.some(kw => content.includes(kw))) ?? null
  )
}
