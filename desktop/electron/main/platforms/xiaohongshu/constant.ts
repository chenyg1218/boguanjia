// export const login: LoginConstants = {
//   liveControlUrl: 'https://ark.xiaohongshu.com/live_center_control',
//   loginUrl:
//     'https://customer.xiaohongshu.com/login?service=https%3A%2F%2Fark.xiaohongshu.com%2Flive_center_control',
//   loginUrlRegex: /.*customer\.xiaohongshu\.com\/login.*/,

//   isLoggedInSelector: '.user-info-wrapper',
//   // isInLiveControlSelector: '.comment-container',
//   isInLiveControlSelector: '.app-root-topbar-wrapper',
//   hoverSelector: '.user-info-wrapper',
//   accountNameSelector: '.sellerId-name',
// }

export const URLS = {
  /** 登录后落到工作台首页，避免直接进中控触发反爬白屏 */
  LOGIN_PAGE:
    'https://customer.xiaohongshu.com/login?service=https%3A%2F%2Fark.xiaohongshu.com%2Fapp-system%2Fhome',
  LIVE_CONTROL_PAGE: 'https://ark.xiaohongshu.com/live_center_control',
  /** 千帆工作台首页（侧栏可点「直播中控」） */
  ARK_HOME: 'https://ark.xiaohongshu.com/app-system/home',
} as const

export const REGEXPS = {
  LOGIN_PAGE: /.*customer\.xiaohongshu\.com\/login.*/,
  /** 招商/入驻中间页（含 seller-v2/shop-type），登录 SSO 后常见 */
  ZHAOSHANG: /zhaoshang\.xiaohongshu\.com/,
  ARK: /ark\.xiaohongshu\.com/,
  LIVE_CONTROL: /ark\.xiaohongshu\.com\/live_center_control/,
}

export const SELECTORS = {
  LOGGED_IN: '.user-info-wrapper',
  /** 千帆顶栏：只能说明壳子已出，不能说明中控业务区已加载 */
  ARK_SHELL: '.app-root-topbar-wrapper',
  /**
   * 直播中控真正可用：评论区或商品列表出现。
   * 勿用顶栏判定——直接打开 live_center_control 时常顶栏已出、内容一直转圈。
   */
  LIVE_CONTROL_READY: '.comment-input, .goods-list',
  /** @deprecated 兼容旧名，等同 ARK_SHELL */
  IN_LIVE_CONTROL: '.app-root-topbar-wrapper',

  ACCOUNT_NAME_HOVER: '.user-info-wrapper',
  // ACCOUNT_NAME: '.sellerId-name',
  ACCOUNT_NAME: '.user-info-wrapper .store-name',

  /** 新版卡片列表（蒲公英 / 近期千帆中控） */
  GOODS_ITEM: '.goods-card-list > .goods-card, .goods-list .goods-card',
  GOODS_ITEMS_WRAPPER: '.goods-list .goods-card-list, .goods-card-list',
  /** 旧版 table 列表（兼容） */
  GOODS_ITEM_LEGACY: '.goods-list .table-wrap > div > div > table tbody tr',
  GOODS_ITEMS_WRAPPER_LEGACY: '.goods-list .table-wrap > div > div',

  COMMENT_INPUT: {
    TEXTAREA: '.comment-input textarea',
    SUBMIT_BUTTON: '.comment-input button',
    SUBMIT_BUTTON_DISABLED: 'disabled',
  },

  GOODS_ITEM_INNER: {
    /** 序号容器（内含只读数字或可编辑 input） */
    ID_WRAP: '.goods-card__index',
    /** 卡片序号（只读） */
    ID_NUM: '.goods-card__index-num',
    /** 卡片序号（可编辑，Delight Input 根 class） */
    ID_INPUT: '.goods-card__index-input',
    /** 旧版 table 序号 */
    ID: 'td:first-child input',
    ACTION_ROW: '.goods-card__action-row',
    ACTION_BTN: '.goods-card__action-btn, .goods-card__action-inner',
    OPERATION_PANNEL: '.more-operation',
    OPERATION_ITEM: '.operation-item',
    POPUP_BUTTON_DISABLED: 'disabled-btn',
    ACTION_DISABLED: 'goods-card__action-btn--disabled',
  },
} as const

export const TEXTS = {
  /** 新版真正弹商品卡 */
  POPUP_CARD: '弹卡',
  POPUP_CARD_BUSY: '弹卡中',
  /** 旧版 / 讲解按钮 */
  POPUP_BUTTON: '讲解',
  POPUP_BUTTON_CANCLE: '结束讲解',
  LIVE_CONTROL_NAV: '直播中控',
} as const

/** 观众侧商品卡展示上限（平台约 15s），讲解时长内按此间隔续点「弹卡」 */
export const POPUP_CARD_VISIBLE_MS = 15_000
