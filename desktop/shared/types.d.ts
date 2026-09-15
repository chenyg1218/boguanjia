declare type Account = {
  readonly id: string
  name: string
  /** 基础版降级时禁用多余账号，配置保留；续费后自动恢复 */
  disabled?: boolean
}

/** IPC 任务类调用统一结果 */
declare type TaskIpcResult = { ok: true } | { ok: false; error: string }

declare interface ProviderInfo {
  name: string
  baseURL: string
  apiUrl: string
  models: string[]
}

declare type LiveControlPlatform =
  | 'douyin'
  | 'buyin'
  | 'eos'
  | 'xiaohongshu'
  | 'pgy'
  | 'wxchannel'
  | 'kuaishou'
  | 'taobao'

declare type GoodsItem = {
  id: number
  /** 单品循环弹窗次数，默认 1 */
  repeatCount?: number
  /** 单品弹窗间隔 [min, max] 毫秒，不设则用全局间隔 */
  itemInterval?: [number, number]
}

declare type AutoPopupConfig = {
  scheduler: {
    interval: [number, number]
  }
  goodsIds: number[]
  goodsItems?: GoodsItem[]
  random?: boolean
}

declare type AutoPopupTask = {
  type: 'auto-popup'
  config: AutoPopupConfig
}

declare type AutoCommentConfig = {
  scheduler: {
    interval: [number, number]
  }
  messages: {
    content: string
    pinTop: boolean
  }[]
  random?: boolean
  extraSpaces?: boolean
  unlimitedLength?: boolean
}

declare type AutoCommentTask = {
  type: 'auto-comment'
  config: AutoCommentConfig
}

declare type SendBatchMessagesConfig = {
  messages: string[]
  count: number
  noSpace?: boolean
}

declare type SendBatchMessagesTask = {
  type: 'send-batch-messages'
  config: SendBatchMessagesConfig
}

declare interface CommentListenerConfig {
  source: 'compass' | 'control' | 'wechat-channel' | 'xiaohongshu' | 'taobao' | 'kuaishou'
  ws?: {
    port: number
  }
}

declare type CommentListenerTask = {
  type: 'comment-listener'
  config: CommentListenerConfig
}

declare type LiveControlTask = AutoPopupTask | AutoCommentTask | SendBatchMessagesTask | CommentListenerTask

declare type DouyinLiveMessage = {
  time: number
} & (
  | CommentMessage
  | RoomEnterMessage
  | RoomLikeMessage
  | LiveOrderMessage
  | SubscribeMerchantBrandVipMessage
  | RoomFollowMessage
  | EcomFansclubParticipateMessage
)

interface CommentMessage {
  msg_type: 'comment'
  msg_id: string
  nick_name: string
  content: string
  /** 主播自己的评论（平台可识别时由监听器填充） */
  is_host?: boolean
}

interface RoomEnterMessage {
  msg_type: 'room_enter'
  msg_id: string
  nick_name: string
  user_id: string
}

interface RoomLikeMessage {
  msg_type: 'room_like'
  msg_id: string
  nick_name: string
  user_id: string
}

interface SubscribeMerchantBrandVipMessage {
  msg_type: 'subscribe_merchant_brand_vip'
  msg_id: string
  nick_name: string
  user_id: string
  content: string
}

interface RoomFollowMessage {
  msg_type: 'room_follow'
  msg_id: string
  nick_name: string
  user_id: string
}

interface EcomFansclubParticipateMessage {
  msg_type: 'ecom_fansclub_participate'
  msg_id: string
  nick_name: string
  user_id: string
  content: string
}

interface LiveOrderMessage {
  msg_type: 'live_order'
  nick_name: string
  msg_id: string
  order_status: '已下单' | '已付款' | '未知状态'
  order_ts: number
  product_id: string
  product_title: string
}

declare type WechatChannelLiveMessage = {
  msg_type: 'wechat_channel_live_msg'
  msg_id: string
  nick_name: string
  user_id: string
  content: string
  time: number
  is_host?: boolean
}

declare type XiaohongshuCommentLiveMessage = {
  msg_type: 'xiaohongshu_comment'
  msg_id: string
  nick_name: string
  user_id: string
  content: string
  time: number
  is_host?: boolean
}

declare type TaobaoCommentLiveMessage = {
  msg_type: 'taobao_comment'
  msg_id: string
  nick_name: string
  user_id: string
  content: string
  time: number
  is_host?: boolean
}

declare type LiveMessage =
  | WechatChannelLiveMessage
  | DouyinLiveMessage
  | XiaohongshuCommentLiveMessage
  | TaobaoCommentLiveMessage
  | ({ time: number } & CommentMessage)