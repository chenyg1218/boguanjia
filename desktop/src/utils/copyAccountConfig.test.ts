import { beforeEach, describe, expect, it } from 'vitest'
import { useAutoMessageStore } from '@/hooks/useAutoMessage'
import { useAutoPopUpStore } from '@/hooks/useAutoPopUp'
import { useAutoReplyConfigStore } from '@/hooks/useAutoReplyConfig'
import { useChromeConfigStore } from '@/hooks/useChromeConfig'
import { copyAccountConfig } from './copyAccountConfig'

describe('copyAccountConfig', () => {
  beforeEach(() => {
    useAutoMessageStore.setState({
      contexts: {
        default: {
          isRunning: false,
          config: {
            scheduler: { interval: [1000, 2000] },
            messages: [],
            random: false,
            extraSpaces: false,
            unlimitedLength: false,
          },
        },
        src: {
          isRunning: true,
          batchCount: 3,
          config: {
            scheduler: { interval: [5000, 8000] },
            messages: [{ id: 'm1', content: '你好', pinTop: true }],
            random: true,
            extraSpaces: true,
            unlimitedLength: true,
          },
        },
        dst: {
          isRunning: false,
          config: {
            scheduler: { interval: [30000, 60000] },
            messages: [{ id: 'old', content: '旧话术', pinTop: false }],
            random: false,
            extraSpaces: false,
            unlimitedLength: false,
          },
        },
      },
    })

    useAutoPopUpStore.setState({
      contexts: {
        src: {
          isRunning: true,
          config: {
            scheduler: { interval: [10000, 20000] },
            goodsIds: [11, 22],
            goodsItems: [{ id: 11, repeatCount: 2 }],
            random: true,
          },
          shortcuts: [
            {
              id: 's1',
              key: 'F1',
              goodsIds: [11],
            },
          ],
          isGlobalShortcut: true,
        },
        dst: {
          isRunning: false,
          config: {
            scheduler: { interval: [30000, 45000] },
            goodsIds: [],
            random: false,
          },
          shortcuts: [],
          isGlobalShortcut: false,
        },
      },
    })

    useAutoReplyConfigStore.setState({
      contexts: {
        src: {
          config: {
            entry: 'kuaishou',
            hideUsername: true,
            comment: {
              keywordReply: {
                enable: true,
                rules: [{ keywords: ['价'], contents: ['详见详情'] }],
              },
              aiReply: {
                enable: true,
                prompt: '简短回复',
                autoSend: true,
              },
            },
            blockList: ['spam'],
            ws: { enable: true, port: 9999 },
          },
        },
        dst: {
          config: {
            entry: 'kuaishou',
            hideUsername: false,
            comment: {
              keywordReply: { enable: false, rules: [] },
              aiReply: { enable: false, prompt: '旧', autoSend: false },
            },
            blockList: [],
            ws: { enable: false, port: 12354 },
          },
        },
      },
    })

    useChromeConfigStore.setState({
      contexts: {
        src: {
          path: 'C:\\Chrome\\chrome.exe',
          headless: true,
          storageState: 'SHOULD_NOT_COPY',
        },
        dst: {
          path: '',
          headless: false,
          storageState: 'keep-login-placeholder',
        },
      },
    })
  })

  it('复制自动发言配置，不带动运行态', () => {
    copyAccountConfig({
      fromAccountId: 'src',
      toAccountIds: ['dst'],
      modules: ['autoMessage'],
    })

    const dst = useAutoMessageStore.getState().contexts.dst
    expect(dst.isRunning).toBe(false)
    expect(dst.batchCount).toBe(3)
    expect(dst.config.messages).toEqual([{ id: 'm1', content: '你好', pinTop: true }])
    expect(dst.config.random).toBe(true)
    expect(dst.config.scheduler.interval).toEqual([5000, 8000])
    // 源运行态未被改写
    expect(useAutoMessageStore.getState().contexts.src.isRunning).toBe(true)
  })

  it('复制自动弹窗含快捷键', () => {
    copyAccountConfig({
      fromAccountId: 'src',
      toAccountIds: ['dst'],
      modules: ['autoPopUp'],
    })

    const dst = useAutoPopUpStore.getState().contexts.dst
    expect(dst.isRunning).toBe(false)
    expect(dst.config.goodsIds).toEqual([11, 22])
    expect(dst.shortcuts).toEqual([{ id: 's1', key: 'F1', goodsIds: [11] }])
    expect(dst.isGlobalShortcut).toBe(true)
  })

  it('复制自动回复配置', () => {
    copyAccountConfig({
      fromAccountId: 'src',
      toAccountIds: ['dst'],
      modules: ['autoReply'],
    })

    const dst = useAutoReplyConfigStore.getState().contexts.dst.config
    expect(dst.hideUsername).toBe(true)
    expect(dst.comment.keywordReply.rules).toEqual([
      { keywords: ['价'], contents: ['详见详情'] },
    ])
    expect(dst.comment.aiReply.prompt).toBe('简短回复')
    expect(dst.ws?.port).toBe(9999)
  })

  it('浏览器只复制 path/headless，不复制登录态', () => {
    copyAccountConfig({
      fromAccountId: 'src',
      toAccountIds: ['dst'],
      modules: ['chrome'],
    })

    const dst = useChromeConfigStore.getState().contexts.dst
    expect(dst.path).toBe('C:\\Chrome\\chrome.exe')
    expect(dst.headless).toBe(true)
    expect(dst.storageState).toBe('keep-login-placeholder')
  })

  it('支持多目标，忽略自身与空模块', () => {
    const result = copyAccountConfig({
      fromAccountId: 'src',
      toAccountIds: ['src', 'dst', 'dst'],
      modules: ['autoMessage', 'autoReply'],
    })
    expect(result.targetCount).toBe(1)
    expect(result.copiedModules).toEqual(['autoMessage', 'autoReply'])
    expect(useAutoMessageStore.getState().contexts.dst.config.messages[0]?.content).toBe('你好')
  })

  it('深拷贝：改目标不影响源', () => {
    copyAccountConfig({
      fromAccountId: 'src',
      toAccountIds: ['dst'],
      modules: ['autoMessage'],
    })
    useAutoMessageStore.getState().setConfig('dst', {
      messages: [{ id: 'x', content: '改过了', pinTop: false }],
    })
    expect(useAutoMessageStore.getState().contexts.src.config.messages[0]?.content).toBe('你好')
  })
})
