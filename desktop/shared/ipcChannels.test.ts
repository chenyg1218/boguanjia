import { describe, expect, it } from 'vitest'
import { IPC_CHANNELS } from './ipcChannels'

describe('IPC 契约 · 功能通道齐全', () => {
  it('中控台 / 发言 / 弹窗 / 回复 / 收费', () => {
    expect(IPC_CHANNELS.tasks.liveControl.connect).toBeTruthy()
    expect(IPC_CHANNELS.tasks.liveControl.disconnect).toBeTruthy()
    expect(IPC_CHANNELS.tasks.autoMessage.start).toBeTruthy()
    expect(IPC_CHANNELS.tasks.autoMessage.sendBatchMessages).toBeTruthy()
    expect(IPC_CHANNELS.tasks.autoPopUp.start).toBeTruthy()
    expect(IPC_CHANNELS.tasks.autoPopUp.registerShortcuts).toBeTruthy()
    expect(IPC_CHANNELS.tasks.autoReply.startCommentListener).toBeTruthy()
    expect(IPC_CHANNELS.tasks.autoReply.sendReply).toBeTruthy()
    expect(IPC_CHANNELS.license.activate).toBeTruthy()
    expect(IPC_CHANNELS.license.status).toBeTruthy()
    expect(IPC_CHANNELS.license.sync).toBeTruthy()
    expect(IPC_CHANNELS.license.changed).toBeTruthy()
  })

  it('浏览器 / 更新 / AI / 账号切换', () => {
    expect(IPC_CHANNELS.chrome.getPath).toBeTruthy()
    expect(IPC_CHANNELS.chrome.clearState).toBeTruthy()
    expect(IPC_CHANNELS.secure.encrypt).toBeTruthy()
    expect(IPC_CHANNELS.updater.checkUpdate).toBeTruthy()
    expect(IPC_CHANNELS.tasks.aiChat.chat).toBeTruthy()
    expect(IPC_CHANNELS.account.switch).toBeTruthy()
  })
})
