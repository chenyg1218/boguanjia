import { describe, expect, it } from 'vitest'
import { abilities, autoReplyPlatforms, listeningSources } from './abilities'

describe('平台能力 · 仅快手', () => {
  it('快手支持自动回复监听源', () => {
    expect(abilities.kuaishou.autoReply?.source).toEqual(['kuaishou'])
    expect(listeningSources.kuaishou.name).toContain('快手')
  })

  it('autoReplyPlatforms 仅含已声明平台', () => {
    expect(autoReplyPlatforms).toContain('kuaishou')
    expect(autoReplyPlatforms.every(p => Boolean(abilities[p]?.autoReply))).toBe(true)
  })
})
