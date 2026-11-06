import type { Result } from '@praha/byethrow'
import type { Page } from 'playwright'
import type { PlatformError } from '#/errors/PlatformError'
import type { BrowserSession } from '#/managers/BrowserSessionManager'

export interface ICommentListener {
  _isCommentListener: true
  startCommentListener(
    onComment: (comment: LiveMessage) => void,
    source: CommentListenerConfig['source'],
    /** 平台检测到停播等不可恢复情况时回调，由任务侧停止监听 */
    onEnded?: (reason: string) => void,
  ): void | Promise<void>
  stopCommentListener(): void
  getCommentListenerPage(): Page
}

export function isCommentListener(platform: IPlatform): platform is IPlatform & ICommentListener {
  return '_isCommentListener' in platform && platform._isCommentListener === true
}

export interface IPerformPopup {
  _isPerformPopup: true
  /** 弹窗指定商品序号 */
  performPopup(id: number, signal?: AbortSignal): Result.ResultAsync<void, Error>
  /** 获取弹窗任务所需的页面 */
  getPopupPage(): Page | null
  /** 从中控台商品列表扫描全部序号（可选；虚拟列表会滚动采集） */
  listGoodsIds?(): Result.ResultAsync<number[], Error>
  /**
   * 观众侧商品卡最长展示时长（毫秒）。
   * 有值时，自动弹窗任务会在「每品讲解时长」内按此间隔续点弹卡。
   */
  getPopupCardVisibleMs?(): number | null
  /** 在仍讲解该品时再次弹出商品卡（不切换讲解） */
  refreshPopupCard?(id: number, signal?: AbortSignal): Result.ResultAsync<void, Error>
}

export function isPerformPopup(platform: IPlatform): platform is IPlatform & IPerformPopup {
  return '_isPerformPopup' in platform && platform._isPerformPopup === true
}

export interface IPerformComment {
  _isPerformComment: true
  /** 在互动评论区域发送评论，返回结果表示是否成功置顶 */
  performComment(message: string, pinTop?: boolean): Result.ResultAsync<boolean, PlatformError>
  /** 获取评论任务所需的页面 */
  getCommentPage(): Page | null
}

export function isPerformComment(platform: IPlatform): platform is IPlatform & IPerformComment {
  return '_isPerformComment' in platform && platform._isPerformComment === true
}

/**
 * 独立于评论监听的停播检测。
 * 有实现时由 AccountSession 在跟播任务运行期间启动，
 * 这样仅开自动发言 / 自动弹窗也能在停播后停止。
 */
export interface ILiveEndedWatch {
  _isLiveEndedWatch: true
  startLiveEndedWatch(onEnded: (reason: string) => void): void
  stopLiveEndedWatch(): void
}

export function isLiveEndedWatch(platform: IPlatform): platform is IPlatform & ILiveEndedWatch {
  return '_isLiveEndedWatch' in platform && platform._isLiveEndedWatch === true
}

export interface IPinComment {
  _isPinComment: true
  /** 置顶评论 */
  pinComment(comment: string, signal?: AbortSignal): Result.ResultAsync<void, PlatformError>
  /** 获取置顶评论任务所需的页面 */
  getPinCommentPage(): Page | null
}

export function isPinComment(platform: IPlatform): platform is IPlatform & IPinComment {
  return '_isPinComment' in platform && platform._isPinComment === true
}

export interface ISendRedPacket {
  _isSendRedPacket: true
  /** 一键发红包：点击发红包按钮，选择店铺红包，投放已有红包，选择限时领取时长 */
  sendRedPacket(duration: string, signal?: AbortSignal): Result.ResultAsync<void, PlatformError>
  getRedPacketPage(): Page | null
}

export function isSendRedPacket(platform: IPlatform): platform is IPlatform & ISendRedPacket {
  return '_isSendRedPacket' in platform && platform._isSendRedPacket === true
}

export type ResolvedAudienceRoomUrl = {
  roomUrl: string
  roomId?: string
  secUid?: string
}

/** 从中控台解析观众端本场直播间链接（供小号互动自动进房） */
export interface IAudienceRoomUrl {
  _isAudienceRoomUrl: true
  /**
   * @param viewerPage 已登录互动号页面；用其通过 reflow 拿到真实 live.douyin.com 链接
   * @param known L1 已检测到的 room_id；传入后跳过中控二次采集
   */
  resolveAudienceRoomUrl(
    viewerPage?: Page | null,
    known?: { roomId?: string; secUid?: string },
  ): Promise<ResolvedAudienceRoomUrl>
}

export function isAudienceRoomUrl(platform: IPlatform): platform is IPlatform & IAudienceRoomUrl {
  return '_isAudienceRoomUrl' in platform && platform._isAudienceRoomUrl === true
}

export interface IPlatform {
  get platformName(): string
  /** 连接到中控台，最终停留在中控台页面 */
  connect(browserSession: BrowserSession): Promise<boolean>
  /** 登录 */
  login(browserSession: BrowserSession): Promise<void>
  /** 在中控台页面获取用户名 */
  getAccountName(session: BrowserSession): Promise<string>

  disconnect(): Promise<void>
}
