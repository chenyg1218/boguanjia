import fs from 'node:fs'
import path from 'node:path'
import { app, safeStorage } from 'electron'
import { createLogger } from '#/logger'

const logger = createLogger('SessionStateStore')

/**
 * 用 Electron safeStorage（Windows DPAPI）加密保存各账号 Playwright storageState。
 * 避免登录态明文落在 renderer localStorage。
 */
class SessionStateStore {
  private dir(): string {
    const d = path.join(app.getPath('userData'), 'secure-sessions')
    fs.mkdirSync(d, { recursive: true })
    return d
  }

  private filePath(accountId: string): string {
    const safe = accountId.replace(/[^a-zA-Z0-9_-]/g, '_')
    return path.join(this.dir(), `${safe}.bin`)
  }

  save(accountId: string, json: string): void {
    const useCrypto = safeStorage.isEncryptionAvailable()
    const payload = useCrypto ? safeStorage.encryptString(json) : Buffer.from(json, 'utf8')
    const marker = Buffer.from([useCrypto ? 1 : 0])
    const target = this.filePath(accountId)
    const tmp = `${target}.${process.pid}.tmp`
    fs.writeFileSync(tmp, Buffer.concat([marker, payload]))
    fs.renameSync(tmp, target)
    if (!useCrypto) {
      logger.warn(
        '系统加密不可用，登录状态将以明文保存（安全性降低）。请使用正常 Windows 桌面会话运行本软件',
      )
    }
  }

  load(accountId: string): string | null {
    const file = this.filePath(accountId)
    if (!fs.existsSync(file)) return null
    try {
      const data = fs.readFileSync(file)
      if (data.length < 2) return null
      const encrypted = data[0] === 1
      const payload = data.subarray(1)
      if (encrypted) {
        if (!safeStorage.isEncryptionAvailable()) {
          logger.error(
            '无法读取已保存的登录状态：系统加密不可用。请重新扫码登录，或确认 Windows 凭据保护正常',
          )
          return null
        }
        return safeStorage.decryptString(payload)
      }
      return payload.toString('utf8')
    } catch (error) {
      logger.error('读取会话状态失败：', error)
      return null
    }
  }

  remove(accountId: string): void {
    const file = this.filePath(accountId)
    try {
      if (fs.existsSync(file)) fs.unlinkSync(file)
    } catch (error) {
      logger.error('删除会话状态失败：', error)
    }
  }

  /** 是否曾成功保存过登录态（用于老用户平台绑定迁移） */
  exists(accountId: string): boolean {
    try {
      return fs.existsSync(this.filePath(accountId))
    } catch {
      return false
    }
  }
}

export const sessionStateStore = new SessionStateStore()
