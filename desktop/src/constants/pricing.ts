/** 三档共用的核心功能（功能点不额外收费） */
export const SHARED_FEATURES = [
  { title: '自动回复', description: '智能自动回复评论' },
  { title: '自动发言', description: '定时自动发言' },
  { title: '自动弹窗', description: '自动弹出商品卡片' },
  { title: '小号互动', description: '观众号进房发评论暖场' },
  { title: 'AI 助手', description: 'AI 智能辅助' },
] as const

/** 对外展示的收费档位（文案与会员权益页共用） */
export const PRICING_PLANS = [
  {
    id: 'free',
    name: '基础版',
    subtitle: '适合一个人跟一个店',
    price: '0 元',
    accountLimit: '1 个',
    viewerLimit: '1 个',
    /** 相对其它档的实际差异（账号数 / 平台 / 多账号能力） */
    diffs: [
      { title: '1 个直播账号', description: '仅默认账号' },
      { title: '1 个互动号', description: '小号评论暖场' },
      { title: '单平台', description: '首次连上后绑定，不可换平台' },
    ],
  },
  {
    id: 'pro',
    name: '专业版',
    subtitle: '适合同平台管多个店',
    price: '29 元 / 月',
    accountLimit: '3 个',
    viewerLimit: '10 个',
    diffs: [
      { title: '3 个直播账号', description: '可同时在线 3 个' },
      { title: '10 个互动号', description: '小号评论暖场' },
      { title: '单平台', description: '首次连上后绑定，不可换平台' },
      { title: '多账号管理', description: '账号间可复制配置' },
    ],
  },
  {
    id: 'flagship',
    name: '旗舰版',
    subtitle: '适合多平台一起用',
    price: '39 元 / 月',
    accountLimit: '无限',
    viewerLimit: '30 个',
    diffs: [
      { title: '无限直播账号', description: '账号数量无上限' },
      { title: '30 个互动号', description: '小号评论暖场' },
      { title: '不限平台', description: '可跨平台，不绑定单一平台' },
      { title: '多账号管理', description: '账号间可复制配置' },
    ],
  },
] as const
