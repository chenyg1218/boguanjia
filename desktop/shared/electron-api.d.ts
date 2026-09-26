import type { LogMessage } from 'electron-log'
import type { ProgressInfo, UpdateDownloadedEvent } from 'electron-updater'
import { IPC_CHANNELS } from './ipcChannels'

export interface IpcChannels {
  // LiveControl
  [IPC_CHANNELS.tasks.liveControl.connect]: (params: {
    chromePath?: string
    headless?: boolean
    /** @deprecated 登录态已改由主进程加密存储；仅作旧版 localStorage 一次性迁移 */
    storageState?: string
    platform: LiveControlPlatform
    account: Account
  }) =>
    | { ok: true; needsPlatformBindConfirm?: boolean }
    | { ok: false; error: string }
  [IPC_CHANNELS.tasks.liveControl.disconnect]: (accountId: string) => TaskIpcResult
  [IPC_CHANNELS.tasks.liveControl.disconnectedEvent]: (payload: {
    accountId: string
    reason: import('./session').DisconnectReason
  }) => void
  [IPC_CHANNELS.tasks.liveControl.notifyAccountName]: (
    params:
      | {
          ok: true
          accountId: string
          accountName: string | null
        }
      | { ok: false },
  ) => void
  [IPC_CHANNELS.tasks.liveControl.tasksResumedEvent]: (payload: {
    accountId: string
    tasks: import('./session').ResumableTaskType[]
  }) => void
  [IPC_CHANNELS.tasks.autoMessage.start]: (
    accountId: string,
    config: AutoCommentConfig,
  ) => TaskIpcResult
  [IPC_CHANNELS.tasks.autoMessage.stop]: (accountId: string) => boolean
  [IPC_CHANNELS.tasks.autoMessage.stoppedEvent]: (payload: {
    accountId: string
    reason: string
  }) => void
  [IPC_CHANNELS.tasks.autoMessage.sendBatchMessages]: (
    accountId: string,
    messages: string[],
    count: number,
  ) => TaskIpcResult
  [IPC_CHANNELS.tasks.autoMessage.updateConfig]: (
    accountId: string,
    config: Parital<AutoCommentConfig>,
  ) => void

  // AutoPopup
  [IPC_CHANNELS.tasks.autoPopUp.start]: (
    accountId: string,
    config: AutoPopupConfig,
  ) => TaskIpcResult
  [IPC_CHANNELS.tasks.autoPopUp.stop]: (accountId: string) => boolean
  [IPC_CHANNELS.tasks.autoPopUp.stoppedEvent]: (payload: {
    accountId: string
    reason: string
  }) => void
  [IPC_CHANNELS.tasks.autoPopUp.updateConfig]: (
    accountId: string,
    config: Parital<AutoPopupConfig>,
  ) => void
  [IPC_CHANNELS.tasks.autoPopUp.listGoodsIds]: (accountId: string) =>
    | { ok: true; goodsIds: number[] }
    | { ok: false; error: string }
  [IPC_CHANNELS.tasks.autoPopUp.popupOnce]: (
    accountId: string,
    goodsId: number,
  ) => TaskIpcResult
  [IPC_CHANNELS.tasks.autoPopUp.registerShortcuts]: (
    accountId: string,
    shortcuts: { accelerator: string; goodsIds: number[] }[],
  ) => void
  [IPC_CHANNELS.tasks.autoPopUp.unregisterShortcuts]: () => void

  // AutoReply
  [IPC_CHANNELS.tasks.autoReply.startCommentListener]: (
    accountId: string,
    config: CommentListenerConfig,
  ) => TaskIpcResult
  [IPC_CHANNELS.tasks.autoReply.stopCommentListener]: (accountId: string) => void
  [IPC_CHANNELS.tasks.autoReply.sendReply]: (
    accountId: string,
    replyContent: string,
  ) => TaskIpcResult
  [IPC_CHANNELS.tasks.autoReply.listenerStopped]: (payload: {
    accountId: string
    reason: string
  }) => void
  [IPC_CHANNELS.tasks.autoReply.showComment]: (data: {
    comment: LiveMessage
    accountId: string
  }) => void

  // VoiceBroadcast（按账号多路；输出设备请分卡以免混音）
  [IPC_CHANNELS.tasks.voiceBroadcast.start]: (
    accountId: string,
    config: {
      script: string
      voice: string
      rate: number
      volume: number
      outputDeviceId: string
      loop: boolean
      loopMode?: 'sequential' | 'random'
      lineGapSec?: [number, number]
      bookLoopGapSec?: number
      timeAnnounce: {
        enable: boolean
        mode: 'fixed' | 'random'
        intervalSec: [number, number]
        includeElapsed: boolean
      }
    },
  ) => { ok: true; warning?: string } | { ok: false; error: string }
  [IPC_CHANNELS.tasks.voiceBroadcast.stop]: (accountId: string) => boolean
  [IPC_CHANNELS.tasks.voiceBroadcast.pause]: (accountId: string) => boolean
  [IPC_CHANNELS.tasks.voiceBroadcast.resume]: (accountId: string) => boolean
  [IPC_CHANNELS.tasks.voiceBroadcast.updateConfig]: (
    accountId: string,
    config: Partial<{
      script: string
      voice: string
      rate: number
      volume: number
      outputDeviceId: string
      loop: boolean
      loopMode: 'sequential' | 'random'
      lineGapSec: [number, number]
      bookLoopGapSec: number
      timeAnnounce: {
        enable: boolean
        mode: 'fixed' | 'random'
        intervalSec: [number, number]
        includeElapsed: boolean
      }
    }>,
  ) => void
  [IPC_CHANNELS.tasks.voiceBroadcast.getStatus]: (accountId: string) => {
    running: boolean
    paused: boolean
    accountId: string | null
    currentLine: string
    startedAt: number | null
  }
  [IPC_CHANNELS.tasks.voiceBroadcast.getAllStatuses]: () => {
    running: boolean
    paused: boolean
    accountId: string | null
    currentLine: string
    startedAt: number | null
  }[]
  [IPC_CHANNELS.tasks.voiceBroadcast.listVoices]: () => { id: string; label: string }[]
  [IPC_CHANNELS.tasks.voiceBroadcast.insert]: (
    accountId: string,
    text: string,
    interrupt?: boolean,
  ) => { ok: true } | { ok: false; error: string }
  [IPC_CHANNELS.tasks.voiceBroadcast.speakOnce]: (
    accountId: string,
    text: string,
    options?: {
      interrupt?: boolean
      config?: Partial<{
        voice: string
        rate: number
        volume: number
        outputDeviceId: string
      }>
    },
  ) => { ok: true } | { ok: false; error: string }
  [IPC_CHANNELS.tasks.voiceBroadcast.playAudio]: (payload: {
    playId: string
    accountId: string
    mime: string
    base64: string
    volume: number
    outputDeviceId: string
  }) => void
  [IPC_CHANNELS.tasks.voiceBroadcast.playDone]: (playId: string, error?: string) => void
  [IPC_CHANNELS.tasks.voiceBroadcast.status]: (status: {
    running: boolean
    paused: boolean
    accountId: string | null
    currentLine: string
    startedAt: number | null
  }) => void
  [IPC_CHANNELS.tasks.voiceBroadcast.stoppedEvent]: (payload: {
    accountId: string
    reason: string
  }) => void

  // AIChat
  [IPC_CHANNELS.tasks.aiChat.normalChat]: (params: {
    messages: AIChatMessage[]
    provider: string
    model: string
    apiKey: string
    customBaseURL?: string
  }) => string | null
  [IPC_CHANNELS.tasks.aiChat.testApiKey]: (params: {
    apiKey: string
    provider: string
    customBaseURL?: string
  }) => { success: boolean; models?: string[]; error?: string }
  [IPC_CHANNELS.tasks.aiChat.chat]: (params: {
    messages: AIChatMessage[]
    provider: string
    model: string
    apiKey: string
    customBaseURL?: string
  }) => void
  [IPC_CHANNELS.tasks.aiChat.stream]: (
    data:
      | {
          chunk: string
          type: 'content' | 'reasoning'
        }
      | { done: boolean },
  ) => void
  [IPC_CHANNELS.tasks.aiChat.error]: (data: { error: string }) => void

  // Updater
  [IPC_CHANNELS.updater.checkUpdate]: () => Promise<
    { latestVersion: string; currentVersion: string; releaseNote?: string } | undefined
  >
  [IPC_CHANNELS.updater.startDownload]: (source: string) => void
  [IPC_CHANNELS.updater.quitAndInstall]: () => void
  [IPC_CHANNELS.updater.updateAvailable]: (info: VersionInfo) => void
  [IPC_CHANNELS.updater.updateError]: (error: ErrorType) => void
  [IPC_CHANNELS.updater.downloadProgress]: (progress: ProgressInfo) => void
  [IPC_CHANNELS.updater.updateDownloaded]: (event?: UpdateDownloadedEvent) => void

  // Chrome
  [IPC_CHANNELS.chrome.selectPath]: () => string | null
  [IPC_CHANNELS.chrome.getPath]: (edge?: boolean) => string | null
  [IPC_CHANNELS.chrome.setPath]: (path: string) => void
  /** 登录成功通知；正文已加密保存在主进程，不再下发明文 */
  [IPC_CHANNELS.chrome.saveState]: (accountId: string) => void
  [IPC_CHANNELS.chrome.clearState]: (accountId: string) => void

  // Secure (safeStorage)
  [IPC_CHANNELS.secure.encrypt]: (plain: string) => string | null
  [IPC_CHANNELS.secure.decrypt]: (cipherBase64: string) => string | null

  // App
  [IPC_CHANNELS.app.openLogFolder]: () => void
  [IPC_CHANNELS.app.openExternal]: (url: string) => void
  [IPC_CHANNELS.app.notifyUpdate]: (arg: {
    currentVersion: string
    latestVersion: string
    releaseNote?: string
  }) => void
  [IPC_CHANNELS.app.getProviders]: () => Record<string, ProviderInfo>
  [IPC_CHANNELS.app.providersUpdated]: (providers: Record<string, ProviderInfo>) => void

  [IPC_CHANNELS.account.switch]: (params: { account: Account }) => void

  // License / 会员权益
  [IPC_CHANNELS.license.status]: () => {
    isPro: boolean
    plan: 'free' | 'pro' | 'flagship'
    expiresAt: string
    announcement: string
    machineId: string
    maxAccounts: number
    boundPlatform: string
    platformEverBound: boolean
    platformLocked: boolean
    needsPlatformBindConfirm: boolean
  }
  [IPC_CHANNELS.license.activate]: (card: string) => {
    ok: boolean
    message: string
    status: {
      isPro: boolean
      plan: 'free' | 'pro' | 'flagship'
      expiresAt: string
      announcement: string
      machineId: string
      maxAccounts: number
      boundPlatform: string
      platformEverBound: boolean
      platformLocked: boolean
      needsPlatformBindConfirm: boolean
    }
  }
  [IPC_CHANNELS.license.sync]: () => {
    status: {
      isPro: boolean
      plan: 'free' | 'pro' | 'flagship'
      expiresAt: string
      announcement: string
      machineId: string
      maxAccounts: number
      boundPlatform: string
      platformEverBound: boolean
      platformLocked: boolean
      needsPlatformBindConfirm: boolean
    }
    warning?: string
  }
  [IPC_CHANNELS.license.syncAccounts]: (accountIds: string[]) => string[]
  [IPC_CHANNELS.license.confirmPlatformBind]: (platform: LiveControlPlatform) => {
    ok: boolean
    message: string
    status: {
      isPro: boolean
      plan: 'free' | 'pro' | 'flagship'
      expiresAt: string
      announcement: string
      machineId: string
      maxAccounts: number
      boundPlatform: string
      platformEverBound: boolean
      platformLocked: boolean
      needsPlatformBindConfirm: boolean
    }
  }
  [IPC_CHANNELS.license.migrateLegacyPlatform]: (
    accountId: string,
    platform: LiveControlPlatform,
  ) => {
    ok: boolean
    message: string
    status: {
      isPro: boolean
      plan: 'free' | 'pro' | 'flagship'
      expiresAt: string
      announcement: string
      machineId: string
      maxAccounts: number
      boundPlatform: string
      platformEverBound: boolean
      platformLocked: boolean
      needsPlatformBindConfirm: boolean
    }
  }
  [IPC_CHANNELS.license.changed]: (payload: {
    status: {
      isPro: boolean
      plan: 'free' | 'pro' | 'flagship'
      expiresAt: string
      announcement: string
      machineId: string
      maxAccounts: number
      boundPlatform: string
      platformEverBound: boolean
      platformLocked: boolean
      needsPlatformBindConfirm: boolean
    }
    warning?: string
  }) => void

  // Log
  [IPC_CHANNELS.log]: (message: LogMessage) => void
}

export interface ElectronAPI {
  ipcRenderer: {
    invoke: <Channel extends keyof IpcChannels>(
      channel: Channel,
      ...args: Parameters<IpcChannels[Channel]>
    ) => ReturnType<IpcChannels[Channel]> extends Promise<infer _U>
      ? ReturnType<IpcChannels[Channel]>
      : Promise<ReturnType<IpcChannels[Channel]>>

    send: <Channel extends keyof IpcChannels>(
      channel: Channel,
      ...args: Parameters<IpcChannels[Channel]>
    ) => void

    on: <Channel extends keyof IpcChannels>(
      channel: Channel,
      listener: (...args: Parameters<IpcChannels[Channel]>) => void,
    ) => () => void
  }
}
