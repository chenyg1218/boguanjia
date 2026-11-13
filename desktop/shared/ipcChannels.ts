export const IPC_CHANNELS = {
  tasks: {
    liveControl: {
      connect: 'tasks:liveControl:connect',
      notifyAccountName: 'tasks:liveControl:notifyAccountName',
      disconnect: 'tasks:liveControl:disconnect',
      disconnectedEvent: 'tasks:liveControl:disconnectedEvent',
      /** 重连后已按意图自动恢复的任务类型列表 */
      tasksResumedEvent: 'tasks:liveControl:tasksResumedEvent',
      /** 查询主进程当前仍保持中控会话的账号（渲染进程对齐连接态） */
      listConnected: 'tasks:liveControl:listConnected',
    },
    autoMessage: {
      start: 'tasks:autoMessage:start',
      stop: 'tasks:autoMessage:stop',
      stoppedEvent: 'tasks:autoMessage:stoppedEvent',
      updateConfig: 'tasks:autoMessage:updateConfig',
      sendBatchMessages: 'tasks:autoMessage:sendBatchMessages',
    },
    /** 真人小号：观众端登录 / 进房 */
    viewerControl: {
      connect: 'tasks:viewerControl:connect',
      disconnect: 'tasks:viewerControl:disconnect',
      disconnectedEvent: 'tasks:viewerControl:disconnectedEvent',
      notifyAccountName: 'tasks:viewerControl:notifyAccountName',
      /** 连接过程进度（等待扫码 / 等待进房） */
      progressEvent: 'tasks:viewerControl:progressEvent',
      /** 从已连接中控台解析本场观众端直播间链接 */
      resolveRoomUrl: 'tasks:viewerControl:resolveRoomUrl',
      /** 读取主进程已缓存的本场链接（优先于渲染进程本地状态） */
      getCachedRoom: 'tasks:viewerControl:getCachedRoom',
      /** 中控检测到开播并已自动缓存本场直播间 */
      roomReadyEvent: 'tasks:viewerControl:roomReadyEvent',
      /** 停播或中控断开后清除缓存的直播间 */
      roomClearedEvent: 'tasks:viewerControl:roomClearedEvent',
      /**
       * 启动时后台恢复已保存登录态的互动号（无需打开小号互动页）。
       * 无登录态或需重新扫码的号会跳过，不弹窗。
       */
      autoReconnect: 'tasks:viewerControl:autoReconnect',
      /** 当前主进程已连接的互动号 */
      listConnected: 'tasks:viewerControl:listConnected',
    },
    /** 真人小号：定时弹幕 */
    viewerDanmaku: {
      start: 'tasks:viewerDanmaku:start',
      stop: 'tasks:viewerDanmaku:stop',
      stoppedEvent: 'tasks:viewerDanmaku:stoppedEvent',
      updateConfig: 'tasks:viewerDanmaku:updateConfig',
      stopAll: 'tasks:viewerDanmaku:stopAll',
    },
    autoPopUp: {
      start: 'tasks:autoPopUp:start',
      stop: 'tasks:autoPopUp:stop',
      updateConfig: 'tasks:autoPopUp:updateConfig',
      stoppedEvent: 'tasks:autoPopUp:stoppedEvent',
      /** 从已连接中控台扫描商品序号 */
      listGoodsIds: 'tasks:autoPopUp:listGoodsIds',
      popupOnce: 'tasks:autoPopUp:popupOnce',
      registerShortcuts: 'tasks:autoPopup:registerShortcut',
      unregisterShortcuts: 'tasks:autoPopup:unregisterShortcut',
    },
    aiChat: {
      chat: 'tasks:aiChat:chat',
      stream: 'tasks:aiChat:stream',
      error: 'tasks:aiChat:error',
      normalChat: 'tasks:aiChat:normalChat',
      testApiKey: 'tasks:aiChat:testApiKey',
    },
    autoReply: {
      startCommentListener: 'tasks:autoReply:startCommentListener',
      stopCommentListener: 'tasks:autoReply:stopCommentListener',
      listenerStopped: 'tasks:autoReply:listenerStopped',
      showComment: 'tasks:autoReply:showComment',
      startAutoReply: 'tasks:autoReply:startAutoReply',
      stopAutoReply: 'tasks:autoReply:stopAutoReply',
      replyGenerated: 'tasks:autoReply:replyGenerated',
      sendReply: 'tasks:autoReply:sendReply',
    },
    voiceBroadcast: {
      start: 'tasks:voiceBroadcast:start',
      stop: 'tasks:voiceBroadcast:stop',
      pause: 'tasks:voiceBroadcast:pause',
      resume: 'tasks:voiceBroadcast:resume',
      updateConfig: 'tasks:voiceBroadcast:updateConfig',
      getStatus: 'tasks:voiceBroadcast:getStatus',
      getAllStatuses: 'tasks:voiceBroadcast:getAllStatuses',
      listVoices: 'tasks:voiceBroadcast:listVoices',
      insert: 'tasks:voiceBroadcast:insert',
      speakOnce: 'tasks:voiceBroadcast:speakOnce',
      playAudio: 'tasks:voiceBroadcast:playAudio',
      playDone: 'tasks:voiceBroadcast:playDone',
      status: 'tasks:voiceBroadcast:status',
      stoppedEvent: 'tasks:voiceBroadcast:stoppedEvent',
    },
  },
  config: {
    save: 'config:save',
    load: 'config:load',
  },
  chrome: {
    getPath: 'chrome:getPath',
    setPath: 'chrome:setPath',
    selectPath: 'chrome:selectPath',
    saveState: 'chrome:saveState',
    clearState: 'chrome:clearState',
  },
  secure: {
    encrypt: 'secure:encrypt',
    decrypt: 'secure:decrypt',
  },
  updater: {
    checkUpdate: 'updater:checkUpdate',
    updateAvailable: 'updater:updateAvailable',
    startDownload: 'updater:startDownload',
    downloadProgress: 'updater:downloadProgress',
    updateError: 'updater:updateError',
    updateDownloaded: 'updater:updateDownloaded',
    quitAndInstall: 'updater:quitAndInstall',
  },
  account: {
    switch: 'account:switch',
  },
  license: {
    status: 'license:status',
    activate: 'license:activate',
    sync: 'license:sync',
    /** 渲染进程同步账号 ID 列表，供主进程按档位上限强制 */
    syncAccounts: 'license:syncAccounts',
    /** 首次连接成功后确认绑定平台 */
    confirmPlatformBind: 'license:confirmPlatformBind',
    /** 老用户：有历史登录态时自动继承平台绑定 */
    migrateLegacyPlatform: 'license:migrateLegacyPlatform',
    /** 主进程运行中复检后推送（到期 / 心跳） */
    changed: 'license:changed',
  },
  feedback: {
    /** 提交问题反馈（文字 + 可选压缩截图） */
    submit: 'feedback:submit',
    /** 拉取本机历史反馈 */
    list: 'feedback:list',
  },
  log: 'log',
  app: {
    openLogFolder: 'app:openLogFolder',
    notifyUpdate: 'app:notifyUpdate',
    openExternal: 'app:openExternal',
    getProviders: 'app:getProviders',
    providersUpdated: 'app:providersUpdated',
  },
} as const
