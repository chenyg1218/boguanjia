import { SELECTORS as DY_SELECTORS } from '../douyin/constant'

export const URLS = {
  LIVE_CONTROL_PAGE: 'https://buyin.jinritemai.com/dashboard/live/control',
  LOGIN_PAGE: 'https://buyin.jinritemai.com/mpa/account/login?log_out=1&type=24',
  /** 百应的电商罗盘主页 */
  COMPASS_INDEX: 'https://compass.jinritemai.com/talent',
  COMPASS_SCREEN_WITH_LIVE_ROOM_ID:
    'https://compass.jinritemai.com/screen/anchor/talent?live_room_id=',
} as const

export const REGEXPS = {
  // 旧链路 douyinec；现网：login / roles-select 等 /mpa/account/ 下页面均视为需登录
  LOGIN_PAGE: /douyinec\.com|buyin\.jinritemai\.com\/mpa\/account\//,
}

export const SELECTORS = {
  ...DY_SELECTORS,
  LOGGED_IN: '[class^="header"]',
  // 与抖店停播检测对齐：class 哈希前缀会变，改用包含匹配 + 商品列表容器
  IN_LIVE_CONTROL: '#live-control-goods-list-container, [class*="goodsPanel"]',
  ACCOUNT_NAME: 'span.btn-item-role-exchange-name__title',
} as const
