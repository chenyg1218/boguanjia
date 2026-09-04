import { afterEach, describe, expect, it, vi } from 'vitest'
import { insertRandomSpaces, replaceVariant } from './common'

describe('自动发言 · 变量 {A/B} 与随机空格', () => {
  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('无变量原样返回', () => {
    expect(replaceVariant('欢迎进入直播间')).toBe('欢迎进入直播间')
  })

  it('单变量按随机下标替换', () => {
    vi.spyOn(Math, 'random').mockReturnValue(0) // randomInt → 0
    expect(replaceVariant('欢迎{宝宝/家人/老铁}进入')).toBe('欢迎宝宝进入')
    vi.spyOn(Math, 'random').mockReturnValue(0.99) // → last
    expect(replaceVariant('欢迎{宝宝/家人/老铁}进入')).toBe('欢迎老铁进入')
  })

  it('多个变量各自替换', () => {
    vi.spyOn(Math, 'random').mockReturnValue(0)
    expect(replaceVariant('{你好/您好}，{宝宝/家人}')).toBe('你好，宝宝')
  })

  it('概率为 0 或空串不插空格', () => {
    expect(insertRandomSpaces('', 0.2)).toBe('')
    expect(insertRandomSpaces('短文案', 0)).toBe('短文案')
  })

  it('长度≥50 不插空格', () => {
    const long = '啊'.repeat(50)
    expect(insertRandomSpaces(long, 0.5)).toBe(long)
  })

  it('强制至少插入一处空格（概率触发失败时兜底）', () => {
    vi.spyOn(Math, 'random').mockReturnValue(0.99) // 不触发概率插入；randomInt 取靠后
    const src = '欢迎宝宝'
    const out = insertRandomSpaces(src, 0.01)
    expect(out.length).toBeGreaterThan(src.length)
    expect(out.replace(/ /g, '')).toBe(src)
  })
})
