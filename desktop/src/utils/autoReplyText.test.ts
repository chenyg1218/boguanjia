import { describe, expect, it } from 'vitest'
import { replaceUsername } from './autoReplyText'

describe('自动回复 · {用户名} 占位与脱敏', () => {
  it('替换全部占位符', () => {
    expect(replaceUsername('@{用户名} 你好，{用户名}', '张三', false)).toBe('@张三 你好，张三')
  })

  it('隐藏用户名时脱敏为首字+***', () => {
    expect(replaceUsername('@{用户名} 谢谢', '张三丰', true)).toBe('@张*** 谢谢')
  })

  it('空内容返回空串；无占位符原样返回', () => {
    expect(replaceUsername('', '张三', false)).toBe('')
    expect(replaceUsername('欢迎光临', '张三', false)).toBe('欢迎光临')
  })

  it('支持 emoji 首码点脱敏', () => {
    const name = '😀用户'
    expect(replaceUsername('{用户名}', name, true)).toBe('😀***')
  })
})
