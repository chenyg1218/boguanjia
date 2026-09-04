import { beforeEach, describe, expect, it } from 'vitest'
import {
  STORAGE_KEYS,
  clearAccountStorage,
  cleanupOrphanedAccountData,
  getAccountData,
  removeAccountData,
} from './storage'

function seedContext(storageKey: string, accountId: string, payload: unknown) {
  const raw = localStorage.getItem(storageKey)
  const parsed = raw ? JSON.parse(raw) : { state: { contexts: {} } }
  parsed.state = parsed.state || { contexts: {} }
  parsed.state.contexts = parsed.state.contexts || {}
  parsed.state.contexts[accountId] = payload
  localStorage.setItem(storageKey, JSON.stringify(parsed))
}

describe('多账号 · localStorage 按账号隔离与清理', () => {
  beforeEach(() => {
    localStorage.clear()
  })

  it('读写账号上下文', () => {
    seedContext(STORAGE_KEYS.AUTO_MESSAGE, 'acc-2', { messages: ['hi'] })
    expect(getAccountData<{ messages: string[] }>(STORAGE_KEYS.AUTO_MESSAGE, 'acc-2')).toEqual({
      messages: ['hi'],
    })
    expect(getAccountData(STORAGE_KEYS.AUTO_MESSAGE, 'missing')).toBeUndefined()
  })

  it('clearAccountStorage 不清理 default，清理其它账号各模块', () => {
    for (const key of [
      STORAGE_KEYS.AUTO_MESSAGE,
      STORAGE_KEYS.AUTO_REPLY,
      STORAGE_KEYS.AUTO_POPUP,
      STORAGE_KEYS.LIVE_CONTROL,
      STORAGE_KEYS.CHROME_CONFIG,
    ]) {
      seedContext(key, 'default', { keep: true })
      seedContext(key, 'acc-2', { drop: true })
    }
    clearAccountStorage('default')
    expect(getAccountData(STORAGE_KEYS.AUTO_MESSAGE, 'default')).toEqual({ keep: true })

    clearAccountStorage('acc-2')
    expect(getAccountData(STORAGE_KEYS.AUTO_MESSAGE, 'acc-2')).toBeUndefined()
    expect(getAccountData(STORAGE_KEYS.AUTO_POPUP, 'acc-2')).toBeUndefined()
    expect(getAccountData(STORAGE_KEYS.AUTO_MESSAGE, 'default')).toEqual({ keep: true })
  })

  it('cleanupOrphanedAccountData 删除已不在账号列表中的上下文', () => {
    localStorage.setItem(
      STORAGE_KEYS.ACCOUNTS,
      JSON.stringify({ state: { accounts: [{ id: 'default' }] } }),
    )
    seedContext(STORAGE_KEYS.AUTO_MESSAGE, 'default', { ok: 1 })
    seedContext(STORAGE_KEYS.AUTO_MESSAGE, 'ghost', { ok: 0 })
    const n = cleanupOrphanedAccountData()
    expect(n).toBeGreaterThanOrEqual(1)
    expect(getAccountData(STORAGE_KEYS.AUTO_MESSAGE, 'ghost')).toBeUndefined()
    expect(getAccountData(STORAGE_KEYS.AUTO_MESSAGE, 'default')).toEqual({ ok: 1 })
  })

  it('removeAccountData 单项删除', () => {
    seedContext(STORAGE_KEYS.AUTO_POPUP, 'acc-2', { goodsIds: [1] })
    removeAccountData(STORAGE_KEYS.AUTO_POPUP, 'acc-2')
    expect(getAccountData(STORAGE_KEYS.AUTO_POPUP, 'acc-2')).toBeUndefined()
  })
})
