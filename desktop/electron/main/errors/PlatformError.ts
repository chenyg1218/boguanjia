import { ErrorFactory } from '@praha/error-factory'
import type { UnexpectedError } from './AppError'

export class ElementNotFoundError extends ErrorFactory({
  name: 'ElementNotFoundError',
  message: ({ elementName }) =>
    `找不到「${elementName}」。请确认已开播且中控台页面正常，可刷新后重试`,
  fields: ErrorFactory.fields<{
    elementName: string
    selector?: string
  }>(),
}) {}

export class ElementContentMismatchedError extends ErrorFactory({
  name: 'ElementContentMismatchedError',
  message: ({ current, target }) =>
    `页面按钮状态异常（当前「${current}」，期望「${target}」）。请刷新中控台后重试`,
  fields: ErrorFactory.fields<{
    current: string
    target: string
    selector?: string
  }>(),
}) {}

export class PageNotFoundError extends ErrorFactory({
  name: 'PageNotFoundError',
  message: '找不到中控台页面。请先连接直播控制台，并确认未关闭浏览器窗口',
}) {}

export class MaxTryCountExceededError extends ErrorFactory({
  name: 'MaxTryCountExceededError',
  message: ({ taskName, maxTryCount }) =>
    `「${taskName}」已重试 ${maxTryCount} 次仍失败。请确认已开播、页面未改版，可刷新中控台后重试`,
  fields: ErrorFactory.fields<{
    taskName: string
    maxTryCount: number
  }>(),
}) {}

export class ElementDisabledError extends ErrorFactory({
  name: 'ElementDisabledError',
  message: ({ elementName }) =>
    `「${elementName}」当前不可用。请确认已开播后再试`,
  fields: ErrorFactory.fields<{
    elementName: string
    element: string
  }>(),
}) {}

/** 面板导致商品列表暂时不可用：等待后重试当前讲解，任务不停止 */
export class GoodsListBlockedError extends ErrorFactory({
  name: 'GoodsListBlockedError',
  message:
    '商品列表暂时不可用（可能被福袋、秒杀等面板挡住或替换），等待恢复后继续讲解',
}) {}

/** 面板导致评论区暂时不可用：等待后重试当前发言，任务不停止 */
export class CommentAreaBlockedError extends ErrorFactory({
  name: 'CommentAreaBlockedError',
  message:
    '评论区暂时不可用（可能被福袋、秒杀等面板挡住或替换），等待恢复后继续发言',
}) {}

export type PlatformError =
  | ElementNotFoundError
  | ElementDisabledError
  | MaxTryCountExceededError
  | ElementContentMismatchedError
  | PageNotFoundError
  | GoodsListBlockedError
  | CommentAreaBlockedError
  | UnexpectedError
