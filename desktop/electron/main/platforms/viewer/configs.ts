export type ViewerPlatformConfig = {
  displayName: string
  /** 校验并规范化直播间 URL；失败抛 Error */
  normalizeRoomUrl: (raw: string) => string
  loginHintRegex: RegExp
  /** 登录态 cookie 名（有则优先于「登录按钮是否消失」判断，避免顶栏收起误判） */
  authCookieRegex?: RegExp
  selectors: {
    loggedIn: string
    /** 昵称文案节点（与 loggedIn 分离；loggedIn 常命中无文字的头像 img） */
    accountName?: string
    loginEntry: string
    /** 扫码弹层/二维码提示（可选，用于确认登录入口已打开） */
    loginQr?: string
    commentInput: string
    commentSubmit: string
  }
  /** 登录超时前可回跳的首页（可选） */
  homeUrl?: string
}

function mustUrl(raw: string): URL {
  const trimmed = raw.trim()
  if (!trimmed) throw new Error('请填写直播间链接')
  try {
    return new URL(trimmed.startsWith('http') ? trimmed : `https://${trimmed}`)
  } catch {
    throw new Error('直播间链接格式不正确')
  }
}

function keepOriginPath(url: URL, pathKeep = 1): string {
  const parts = url.pathname.replace(/^\//, '').split('/').filter(Boolean)
  const path = parts.slice(0, pathKeep).join('/')
  return `${url.origin}/${path}`
}

const douyinLike: ViewerPlatformConfig = {
  displayName: '抖音观众号',
  normalizeRoomUrl: raw => {
    const url = mustUrl(raw)
    if (!/^https?:\/\/live\.douyin\.com\/[\w-]+/i.test(url.href)) {
      throw new Error('请使用抖音直播间链接（https://live.douyin.com/房间号）')
    }
    const rid = url.pathname.replace(/^\//, '').split('/')[0]
    // 19 位左右为内部 room_id，直接打开会一直「直播加载中」；观众端要用较短的 web_rid
    if (/^\d{17,}$/.test(rid)) {
      throw new Error(
        '直播间链接无效：疑似内部房间号。请使用观众端房间号（如 live.douyin.com/762192982932）',
      )
    }
    // 统一成主站进房形态（卖货直播对 page_type=live_main_page + anchor_id 更稳）
    // web_share_link 分享链在部分电商场会一直「直播加载中」
    const qs = new URLSearchParams()
    qs.set('activity_name', url.searchParams.get('activity_name') ?? '')
    const anchorId = url.searchParams.get('anchor_id')
    if (anchorId) qs.set('anchor_id', anchorId)
    qs.set('banner_type', url.searchParams.get('banner_type') || 'recommend')
    qs.set('category_name', url.searchParams.get('category_name') || 'all')
    qs.set('page_type', url.searchParams.get('page_type') || 'live_main_page')
    const userId = url.searchParams.get('user_id')
    if (userId) qs.set('user_id', userId)
    return `https://live.douyin.com/${rid}?${qs.toString()}`
  },
  loginHintRegex: /passport|login|sso/i,
  authCookieRegex: /^(sessionid|sessionid_ss|sid_tt|uid_tt|uid_tt_ss)$/i,
  // 直播站比 www 首页更轻，自动化打开时更不易被关页/崩溃
  homeUrl: 'https://live.douyin.com/',
  selectors: {
    // 勿用宽泛 avatar：直播卡片头像会误判已登录
    loggedIn: '[data-e2e="user-info"], [class*="header"] [class*="avatar"] img, [class*="navbar"] [class*="avatar"] img',
    accountName: [
      '[data-e2e="user-info"]',
      '[class*="header"] [class*="nickname"]',
      '[class*="header"] [class*="userName"]',
      '[class*="header"] [class*="user-name"]',
      '[class*="navbar"] [class*="nickname"]',
      '[class*="navbar"] [class*="userName"]',
      '[class*="header"] [class*="avatar"] img',
      '[class*="navbar"] [class*="avatar"] img',
    ].join(', '),
    loginEntry: 'button:has-text("登录"), [role="button"]:has-text("登录"), a:has-text("登录")',
    loginQr: [
      'text=扫码登录',
      'text=打开抖音扫一扫',
      'text=抖音扫码',
      '[class*="qrcode"]',
      '[class*="qr-code"]',
      '[class*="QRCode"]',
    ].join(', '),
    // 2025 起网页端评论框多为 contenteditable，不再是 textarea
    commentInput: [
      '#chatInput [data-e2e="live-chatting"] [contenteditable="true"]',
      '#chatInput [contenteditable="true"]',
      '[data-e2e="live-chatting"] [contenteditable="true"]',
      '[data-e2e="live-chat-input"]',
      '[data-e2e="chat-input"]',
      '[data-e2e="live-chatting"]',
      'textarea[class*="webcast-chatroom"]',
      'div[class*="webcast-chatroom"] textarea',
      '[class*="chatroom"] textarea',
      '[class*="ChatRoom"] textarea',
      'textarea[placeholder*="说点什么"]',
      'textarea[placeholder*="互动"]',
      'textarea[placeholder*="跟主播聊"]',
      'div[contenteditable="true"][class*="chat"]',
      'div[contenteditable="true"][class*="Chat"]',
      'div[contenteditable="true"][placeholder*="说点什么"]',
      'div[contenteditable="true"][data-placeholder*="说点什么"]',
      '[class*="chat"] [contenteditable="true"]',
      '[class*="Chat"] [contenteditable="true"]',
    ].join(', '),
    // 新版多为圆形上箭头图标，不一定有「发送」文字
    commentSubmit: [
      '#chatInput button:not([disabled])',
      '#chatInput [role="button"]',
      '[data-e2e="live-send-button"]',
      '[data-e2e="live-chatting"] >> xpath=following::button[1]',
      'button:has-text("发送")',
      'div[class*="webcast-chatroom"] button:has-text("发送")',
      '[class*="chatroom"] button:has-text("发送")',
      '[class*="chat-input"] button',
      '[class*="ChatInput"] button',
      '[class*="send"] button',
      'button[class*="send"]',
    ].join(', '),
  },
}

const kuaishou: ViewerPlatformConfig = {
  displayName: '快手观众号',
  normalizeRoomUrl: raw => {
    const url = mustUrl(raw)
    // live.kuaishou.com / v.kuaishou.com 等
    if (!/kuaishou\.com/i.test(url.hostname)) {
      throw new Error('请使用快手直播间链接（含 kuaishou.com）')
    }
    return keepOriginPath(url, 2)
  },
  loginHintRegex: /login|passport|sso/i,
  homeUrl: 'https://www.kuaishou.com/',
  selectors: {
    loggedIn: '[class*="avatar"] img, [class*="user-info"], [class*="Avatar"]',
    accountName: [
      '[class*="nickname"]',
      '[class*="user-name"]',
      '[class*="userName"]',
      '[class*="user-info"]',
      '[class*="avatar"] img',
    ].join(', '),
    loginEntry: 'text=登录',
    commentInput: [
      'textarea[placeholder*="说点什么"]',
      'textarea[placeholder*="聊聊"]',
      '[class*="comment"] textarea',
      '[class*="chat"] textarea',
      'div[contenteditable="true"]',
    ].join(', '),
    commentSubmit: 'button:has-text("发送"), [class*="send"] button',
  },
}

const xiaohongshu: ViewerPlatformConfig = {
  displayName: '小红书观众号',
  normalizeRoomUrl: raw => {
    const url = mustUrl(raw)
    if (!/xiaohongshu\.com|xhslink\.com/i.test(url.hostname)) {
      throw new Error('请使用小红书直播间链接（含 xiaohongshu.com）')
    }
    return `${url.origin}${url.pathname}`
  },
  loginHintRegex: /login|passport|sso/i,
  homeUrl: 'https://www.xiaohongshu.com/',
  selectors: {
    loggedIn: '[class*="avatar"] img, [class*="user"] img',
    accountName: [
      '[class*="nickname"]',
      '[class*="user-name"]',
      '[class*="userName"]',
      '[class*="avatar"] img',
      '[class*="user"] img',
    ].join(', '),
    loginEntry: 'text=登录',
    commentInput: [
      'textarea[placeholder*="说点什么"]',
      'textarea[placeholder*="互动"]',
      '[class*="comment"] textarea',
      '[class*="chat"] textarea',
      'div[contenteditable="true"]',
    ].join(', '),
    commentSubmit: 'button:has-text("发送")',
  },
}

const wxchannel: ViewerPlatformConfig = {
  displayName: '视频号观众号',
  normalizeRoomUrl: raw => {
    const url = mustUrl(raw)
    if (!/weixin\.qq\.com|channels\.weixin/i.test(url.hostname + url.pathname)) {
      throw new Error('请使用视频号直播间链接（微信相关域名）')
    }
    return url.href.split('#')[0]
  },
  loginHintRegex: /login|passport/i,
  selectors: {
    loggedIn: '[class*="avatar"] img, [class*="user"]',
    accountName: [
      '[class*="nickname"]',
      '[class*="user-name"]',
      '[class*="finder"]',
      '[class*="avatar"] img',
      '[class*="user"]',
    ].join(', '),
    loginEntry: 'text=登录',
    commentInput: [
      'textarea',
      'div[contenteditable="true"]',
      'input[placeholder*="说点什么"]',
    ].join(', '),
    commentSubmit: 'button:has-text("发送")',
  },
}

const taobao: ViewerPlatformConfig = {
  displayName: '淘宝观众号',
  normalizeRoomUrl: raw => {
    const url = mustUrl(raw)
    if (!/taobao\.com|tmall\.com|tb\.cn/i.test(url.hostname)) {
      throw new Error('请使用淘宝/天猫直播间链接')
    }
    return url.href.split('#')[0]
  },
  loginHintRegex: /login|passport|sso/i,
  homeUrl: 'https://www.taobao.com/',
  selectors: {
    loggedIn: '[class*="avatar"] img, [class*="user-name"]',
    accountName: [
      '[class*="user-name"]',
      '[class*="username"]',
      '[class*="nickname"]',
      '[class*="avatar"] img',
    ].join(', '),
    loginEntry: 'text=登录',
    commentInput: [
      'textarea[placeholder*="说点什么"]',
      'textarea[placeholder*="聊天"]',
      '[class*="comment"] textarea',
      'div[contenteditable="true"]',
    ].join(', '),
    commentSubmit: 'button:has-text("发送")',
  },
}

/** 与中控平台 key 对齐；百应/团购/蒲公英走对应观众站 */
export const VIEWER_PLATFORM_CONFIGS: Record<LiveControlPlatform, ViewerPlatformConfig> = {
  douyin: douyinLike,
  buyin: { ...douyinLike, displayName: '百应观众号' },
  eos: { ...douyinLike, displayName: '团购观众号' },
  kuaishou,
  xiaohongshu,
  pgy: { ...xiaohongshu, displayName: '蒲公英观众号' },
  wxchannel,
  taobao,
}

