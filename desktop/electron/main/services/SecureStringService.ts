import { safeStorage } from 'electron'
import { createLogger } from '#/logger'

const logger = createLogger('SecureString')

/**
 * 字符串加解密（API Key 等）。不可用时回传原文，由调用方决定是否继续。
 */
export function encryptString(plain: string): string | null {
  if (!plain) return ''
  if (!safeStorage.isEncryptionAvailable()) {
    logger.warn('系统加密不可用，无法保护敏感信息。请确认 Windows 凭据保护正常')
    return null
  }
  try {
    return safeStorage.encryptString(plain).toString('base64')
  } catch (error) {
    logger.error('加密失败：', error)
    return null
  }
}

export function decryptString(cipherBase64: string): string | null {
  if (!cipherBase64) return ''
  if (!safeStorage.isEncryptionAvailable()) {
    logger.warn('系统加密不可用，无法读取敏感信息。请确认 Windows 凭据保护正常')
    return null
  }
  try {
    return safeStorage.decryptString(Buffer.from(cipherBase64, 'base64'))
  } catch (error) {
    logger.error('解密失败：', error)
    return null
  }
}
