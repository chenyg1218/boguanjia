import { describe, expect, it } from 'vitest'
import {
  matchKeywordRule,
  parseKeywordBatchText,
  serializeKeywordRules,
} from './keywordRules'

describe('自动回复 · 关键词批量规则', () => {
  it('解析教程格式：音响/音箱|回复A|回复B', () => {
    const rules = parseKeywordBatchText('音响/音箱|回复A|回复B')
    expect(rules).toEqual([{ keywords: ['音响', '音箱'], contents: ['回复A', '回复B'] }])
  })

  it('多行与序列化往返', () => {
    const text = '怎么买|点小黄车\n发货/快递|现货现发|今日发'
    const rules = parseKeywordBatchText(text)
    expect(rules).toHaveLength(2)
    expect(serializeKeywordRules(rules)).toBe('怎么买|点小黄车\n发货/快递|现货现发|今日发')
  })

  it('忽略空行；非法行抛错', () => {
    expect(parseKeywordBatchText('\n\n包邮|全场包邮\n')).toEqual([
      { keywords: ['包邮'], contents: ['全场包邮'] },
    ])
    expect(() => parseKeywordBatchText('只有关键词')).toThrow(/至少提供/)
    expect(() => parseKeywordBatchText('a//b|回复')).toThrow(/关键词是空的/)
    expect(() => parseKeywordBatchText('a|回复||再')).toThrow(/回复内容是空的/)
  })

  it('评论 includes 匹配首条规则', () => {
    const rules = parseKeywordBatchText('音响/音箱|好的\n价格|便宜')
    expect(matchKeywordRule('这个音箱多少钱', rules)?.keywords).toContain('音箱')
    expect(matchKeywordRule('问问价格', rules)?.keywords).toEqual(['价格'])
    expect(matchKeywordRule('无关内容', rules)).toBeNull()
    expect(matchKeywordRule('', rules)).toBeNull()
  })
})
