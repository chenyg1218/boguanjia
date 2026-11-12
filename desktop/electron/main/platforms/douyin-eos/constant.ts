export const URLS = {
  LIVE_CONTROL: 'https://eos.douyin.com/livesite/live/current',
  LOGIN_PAGE: 'https://eos.douyin.com/livesite/login',
} as const

export const REGEXPS = {
  LOGIN_PAGE: /.*eos\.douyin\.com\/livesite\/login.*/,
}

export const SELECTORS = {
  LOGGED_IN: `[class^="head-container"]`,
  IN_LIVE_CONTROL: `[class^="layout-container"]`,
  ACCOUNT_NAME: `[class^="profile-container"]`,

  GOODS_ITEM: '#live-card-list div[class^="render-item"]',
  GOODS_ITEMS_WRAPPER: '#live-card-list > div > div',
  /** 商品列表根节点（检测福袋等面板是否遮挡） */
  GOODS_LIST_ROOT: '#live-card-list',
  commentInput: {
    TEXTAREA: 'textarea[class^="input"]',
    SUBMIT_BUTTON: 'div[class^="comment-wrap"] div[class^="button"]',
    /** 评论区根节点（检测面板是否遮挡） */
    ROOT: 'div[class^="comment-wrap"], textarea[class^="input"]',
  },
  goodsItem: {
    POPUP_BUTTON: '[class^="talking-btn"]',
    ID: 'input',
  },
} as const

export const TEXTS = {
  POPUP_BUTTON: '讲解',
  POPUP_BUTTON_CANCLE: '取消讲解',
} as const
