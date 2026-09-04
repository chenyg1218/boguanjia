import * as path from 'node:path'
import { app } from 'electron'
import electronLog, { type FormatParams, type LogFunctions } from 'electron-log'
import { IPC_CHANNELS } from 'shared/ipcChannels'
import windowManager from './windowManager'

const appRoot = path.join(app.getAppPath(), path.sep)
const cleanPathRegex = new RegExp(appRoot.replace(/\\/g, '\\\\').replace(/\//g, '[\\\\/]'), 'gi')

function cleanStack(stack?: string) {
  if (!stack) return stack
  return stack.replace(cleanPathRegex, `APP:${path.sep}`)
}

/** 文件日志：保留完整堆栈，便于排查 */
function formatFileLogData(data: FormatParams['data']) {
  return data
    .map(item => {
      if (item instanceof Error) {
        return `${item.message}\n${cleanStack(item.stack)}${item.cause ? `\nCaused by: ${item.cause}` : ''}`
      }
      return item
    })
    .join(' ')
}

/** 运行日志（给用户看）：只保留首行中文摘要，不带堆栈 */
function formatUserLogData(data: FormatParams['data']) {
  return data
    .map(item => {
      if (item instanceof Error) {
        return item.message.split('\n')[0]
      }
      return String(item).split('\n')[0]
    })
    .join(' ')
}

// [2025-02-11 07:30:03.037] [中控台] » INFO         启动中……
electronLog.transports.console.format = ({ data, level, message }) => {
  const userText = formatUserLogData(data)
  // 推给前端运行日志：不含堆栈
  if (level !== 'verbose' && level !== 'debug') {
    windowManager.send(IPC_CHANNELS.log, { ...message, data: [userText] })
  }
  return [
    `[${message.date.toLocaleString()}]`,
    message.scope ? `[${message.scope}]` : '',
    '»',
    `${level.toUpperCase()}`,
    `\t${userText}`,
  ]
}
electronLog.transports.file.format = ({ data, level, message }) => {
  const text = formatFileLogData(data)
  return [
    `[${message.date.toISOString().replace('T', ' ').slice(0, -1)}]`,
    `[${level.toUpperCase()}]`,
    message.scope ? `[${message.scope}]` : '',
    `\t${text}`,
  ]
}
electronLog.scope.labelPadding = false
electronLog.addLevel('success', 3)

export interface ScopedLogger extends LogFunctions {
  scope(name: string): ScopedLogger
}

export function createLogger(name: string): ScopedLogger {
  const logger = electronLog.scope(name)
  return {
    scope(scopeName: string) {
      const newScopeName = `${name} -> ${scopeName}`
      return createLogger(newScopeName)
    },
    ...logger,
  }
}

export default electronLog
