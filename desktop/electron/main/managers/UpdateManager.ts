import { createHash } from 'node:crypto'
import { createReadStream, createWriteStream, existsSync, unlinkSync } from 'node:fs'
import { createRequire } from 'node:module'
import { arch, platform } from 'node:os'
import path from 'node:path'
import { app, net, shell } from 'electron'
import type { AppUpdater, ProgressInfo, UpdateDownloadedEvent, UpdateInfo } from 'electron-updater'
import { marked } from 'marked'
import semver from 'semver'
import { IPC_CHANNELS } from 'shared/ipcChannels'
import * as yaml from 'yaml'
import windowManager from '#/windowManager'
import packageJson from '../../../package.json'
import { createLogger } from '../logger'
import { errorMessage, sleep } from '../utils'

type LatestYml = {
  version: string
  files: Array<{
    url: string
    sha512: string
    size: number
  }>
  path: string
  sha512: string
  releaseDate: string
}

const GITHUB_OWNER = 'chenyg1218'
const GITHUB_REPO = 'boguanjia'
/** 国内默认更新源（需在 Gitee Releases 同步上传安装包与 latest.yml） */
const GITEE_OWNER = 'codercyg'
const GITEE_REPO = 'boguanjia'
const CDN_URL = 'https://fastly.jsdelivr.net/gh/'
/** 与 electron-builder artifactName（${name}_…）一致，便于手动下载 URL */
const PRODUCT_NAME = packageJson.name
const CHANGELOG_PATH = 'desktop/CHANGELOG.md'
const GH_PROXY = 'https://gh-proxy.com/'
const DEFAULT_UPDATE_SOURCE = 'gitee'

function getGiteeReleaseAssetsURL(version: string) {
  return `https://gitee.com/${GITEE_OWNER}/${GITEE_REPO}/releases/download/v${version}/`
}

function getGithubReleaseAssetsURL(version: string) {
  return `https://github.com/${GITHUB_OWNER}/${GITHUB_REPO}/releases/download/v${version}/`
}

const logger = createLogger('update')

// marked 生成的 html 要在新页面打开链接
marked.use({
  renderer: {
    link: ({ href, title, text }) => {
      return `<a href="${href}" target="_blank" rel="noopener noreferrer"${title ? ` title="${title}"` : ''}>${text}</a>`
    },
  },
})

function extractChanges(
  changelogContent: string,
  userVersion: string,
  targetVersion?: string | null,
): string {
  const lines = changelogContent.split('\n')
  const result: string[] = []
  let includeSection = false

  for (const line of lines) {
    const versionMatch = line.match(/^##\s+v?([0-9]+\.[0-9]+\.[0-9]+)/) // 匹配版本 "## vX.Y.Z" 或 "## X.Y.Z"

    if (versionMatch) {
      const versionInLog = versionMatch[1] // X.Y.Z
      // 只展示 (当前版本, 最新版本] 区间，避免误展示更高版本号（如上游残留 changelog）
      if (semver.lte(versionInLog, userVersion)) {
        break
      }
      includeSection = !targetVersion || semver.lte(versionInLog, targetVersion)
    }

    if (includeSection) {
      result.push(line)
    }
  }

  return result.join('\n').trim()
}

async function fetchWithRetry(url: string | URL, retries = 3, delay = 1000) {
  for (let i = 0; i < retries; i++) {
    try {
      const res = (await timeoutFetch(url)) as Response
      if (!res.ok) throw new Error(`HTTP ${res.status}`)
      return res
    } catch (e) {
      if (i === retries - 1) throw e
      await sleep(delay)
    }
  }
}

async function timeoutFetch(url: string | URL, timeout = 5000) {
  const controller = new AbortController()
  const timeoutId = setTimeout(() => controller.abort(), timeout)

  try {
    const response = await net.fetch(url.toString(), {
      signal: controller.signal,
      // 不加上 User-Agent 会访问超时
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)',
      },
    })
    clearTimeout(timeoutId)
    return response
  } catch (err) {
    if ((err as Error).name === 'AbortError') {
      throw new Error('获取更新超时，请检查网络或更换更新源后重试')
    }
    throw err
  }
}

const releaseNotes: Record<string, string> = {}
let latestVersion: string | null = null

function getLatestYmlFileName() {
  return platform() === 'darwin' ? 'latest-mac.yml' : 'latest.yml'
}

async function getLatestVersionFromGiteeApi() {
  const apiUrl = `https://gitee.com/api/v5/repos/${GITEE_OWNER}/${GITEE_REPO}/releases/latest`
  const res = await fetchWithRetry(apiUrl)
  const data = (await res?.json()) as { tag_name?: string } | undefined
  const tag = data?.tag_name?.trim()
  if (!tag) return null
  return tag.replace(/^v/i, '')
}

function getLatestYmlCandidateUrls(version?: string | null) {
  const fileName = getLatestYmlFileName()
  const urls: string[] = []
  if (version) {
    urls.push(`${getGiteeReleaseAssetsURL(version)}${fileName}`)
  }
  const githubUrl = `https://github.com/${GITHUB_OWNER}/${GITHUB_REPO}/releases/latest/download/${fileName}`
  urls.push(githubUrl, `${GH_PROXY}${githubUrl}`)
  return urls
}

async function getLatestVersion() {
  try {
    // 国内优先：Gitee Releases API
    try {
      const giteeVersion = await getLatestVersionFromGiteeApi()
      if (giteeVersion) {
        latestVersion = giteeVersion
        logger.debug(`从 Gitee API 获取到的版本为 ${giteeVersion}`)
        return giteeVersion
      }
    } catch {
      // 回退到 latest.yml
    }

    for (const url of getLatestYmlCandidateUrls(latestVersion)) {
      try {
        const text = await fetchWithRetry(url).then(res => res?.text())
        if (!text) continue
        const parsed = yaml.parse(text) as LatestYml
        if (parsed?.version) {
          latestVersion = parsed.version
          logger.debug(`从 ${getLatestYmlFileName()} 获取到的版本为 ${parsed.version}`)
          return parsed.version
        }
      } catch {
        // 尝试下一个候选源
      }
    }
    logger.error('获取最新版本失败：所有更新源均不可用')
    return null
  } catch (error) {
    logger.error('获取最新版本失败', error)
    return null
  }
}

function getChangelogCandidateUrls() {
  const rawGitee = `https://gitee.com/${GITEE_OWNER}/${GITEE_REPO}/raw/main/${CHANGELOG_PATH}`
  const rawGithub = `https://raw.githubusercontent.com/${GITHUB_OWNER}/${GITHUB_REPO}/main/${CHANGELOG_PATH}`
  const jsdelivr = new URL(
    `${GITHUB_OWNER}/${GITHUB_REPO}@main/${CHANGELOG_PATH}`,
    CDN_URL,
  ).toString()
  return [rawGitee, rawGithub, `${GH_PROXY}${rawGithub}`, jsdelivr]
}

async function fetchReleaseBody(version: string) {
  const apiUrl = `https://api.github.com/repos/${GITHUB_OWNER}/${GITHUB_REPO}/releases/tags/v${version}`
  for (const url of [apiUrl, `${GH_PROXY}${apiUrl}`]) {
    try {
      const res = await fetchWithRetry(url)
      const data = (await res?.json()) as { body?: string } | undefined
      if (data?.body?.trim()) {
        return data.body.trim()
      }
    } catch {
      // 尝试下一个候选源
    }
  }
  return undefined
}

async function fetchChangelog() {
  if (latestVersion && releaseNotes[latestVersion]) {
    return releaseNotes[latestVersion]
  }
  try {
    const currentVersion = app.getVersion()
    let updateLog = ''

    for (const url of getChangelogCandidateUrls()) {
      try {
        const changelogContent = await fetchWithRetry(url).then(res => res?.text())
        if (!changelogContent) continue
        updateLog = extractChanges(changelogContent, currentVersion, latestVersion)
        if (updateLog) break
      } catch {
        // 尝试下一个候选源
      }
    }

    // CHANGELOG 不可用或被错误内容污染时，回退到 GitHub Release 正文
    if (!updateLog && latestVersion) {
      updateLog = (await fetchReleaseBody(latestVersion)) || ''
    }

    if (!updateLog) {
      return undefined
    }

    const releaseNote = await marked.parse(updateLog)
    if (latestVersion) {
      releaseNotes[latestVersion] = releaseNote
    }
    return releaseNote
  } catch {
    return undefined
  }
}

function getAssetsURL(source = DEFAULT_UPDATE_SOURCE) {
  if (!latestVersion) {
    throw new Error('尚未获取到最新版本号')
  }
  if (source === 'gitee') {
    return getGiteeReleaseAssetsURL(latestVersion)
  }
  return getGithubReleaseAssetsURL(latestVersion)
}

interface Updater {
  checkForUpdates(source: string): Promise<void>
  downloadUpdate(): void
  quitAndInstall(): void
}

class UpdateManager {
  constructor(private updater: Updater) {}

  public async checkForUpdates(source = DEFAULT_UPDATE_SOURCE) {
    await this.updater.checkForUpdates(source)
  }

  public async checkUpdateVersion() {
    const latestVersion = await getLatestVersion()
    if (!latestVersion) {
      return
    }
    const currentVersion = app.getVersion()
    if (semver.lt(currentVersion, latestVersion)) {
      logger.info(`检查到可用更新：${currentVersion} -> ${latestVersion}`)
      const releaseNote = await fetchChangelog()

      return {
        currentVersion,
        latestVersion,
        releaseNote,
      }
    }
  }

  public async silentCheckForUpdate() {
    try {
      const result = await this.checkUpdateVersion()
      if (result) {
        windowManager.send(IPC_CHANNELS.app.notifyUpdate, { ...result })
      }
    } catch (err) {
      logger.debug(`静默检查更新失败：${err}`)
    }
  }

  public startDownload() {
    logger.info('开始下载更新……')
    this.updater.downloadUpdate()
  }

  public async quitAndInstall() {
    logger.info('准备退出并安装更新')
    this.updater.quitAndInstall()
  }
}

class WindowsUpdater implements Updater {
  private autoUpdater: AppUpdater
  constructor() {
    const { autoUpdater }: { autoUpdater: AppUpdater } = createRequire(import.meta.url)(
      'electron-updater',
    )
    this.autoUpdater = autoUpdater
    this.configureUpdater()
    this.registerEventListener()
  }

  private configureUpdater() {
    this.autoUpdater.forceDevUpdateConfig = true
    this.autoUpdater.disableWebInstaller = false
    this.autoUpdater.allowDowngrade = false
    // 由调用方决定何时 check；发现更新后自动下载，退出时安装
    this.autoUpdater.autoDownload = true
    this.autoUpdater.autoInstallOnAppQuit = true
  }

  private registerEventListener() {
    this.autoUpdater.on('checking-for-update', () => {
      logger.debug('检查更新流程已启动...')
    })

    this.autoUpdater.on('update-available', async (info: UpdateInfo) => {
      logger.info(`有可用更新！当前版本：${app.getVersion()}，新版本：${info.version}`)

      const releaseNote = await fetchChangelog()
      windowManager.send(IPC_CHANNELS.updater.updateAvailable, {
        update: true,
        version: app.getVersion(),
        newVersion: info.version,
        releaseNote,
      })
    })

    this.autoUpdater.on('update-not-available', (info: UpdateInfo) => {
      logger.info(`无可用更新。当前版本：${app.getVersion()}，新版本：${info.version}`)
      windowManager.send(IPC_CHANNELS.updater.updateAvailable, {
        update: false,
        version: app.getVersion(),
        newVersion: info.version,
      })
    })

    this.autoUpdater.on('download-progress', (progressInfo: ProgressInfo) => {
      windowManager.send(IPC_CHANNELS.updater.downloadProgress, progressInfo)
    })

    this.autoUpdater.on('update-downloaded', (event: UpdateDownloadedEvent) => {
      logger.info(`${event.version} 更新下载完成!`)
      windowManager.send(IPC_CHANNELS.updater.updateDownloaded, event)
    })

    this.autoUpdater.on('error', (error: Error) => {
      const message = /timeout|超时|ETIMEDOUT|Fetch timeout/i.test(error.message)
        ? '检查更新超时，请检查网络或更换更新源后重试'
        : /ENOTFOUND|ECONNREFUSED|net::/i.test(error.message)
          ? '无法连接更新服务器，请检查网络后重试'
          : `更新失败：${error.message.split('\n')[0]}。请稍后重试或更换更新源`
      logger.error('更新出错：', error)
      windowManager.send(IPC_CHANNELS.updater.updateError, {
        message,
        error,
      })
    })
  }

  private async ensureLatestVersion() {
    if (latestVersion) return latestVersion
    const version = await getLatestVersion()
    if (!version) {
      throw new Error('无法获取最新版本信息，请检查网络或更换更新源')
    }
    return version
  }

  private async checkUpdateForGithub() {
    // github 不需要关闭 noCache，requestHeaders 默认就是 null
    this.autoUpdater.requestHeaders = null
    this.autoUpdater.setFeedURL({
      provider: 'github',
      owner: GITHUB_OWNER,
      repo: GITHUB_REPO,
    })
    return this.autoUpdater.checkForUpdates()
  }

  private async checkUpdateForGitee() {
    await this.ensureLatestVersion()
    const assetsURL = getAssetsURL('gitee')
    this.autoUpdater.setFeedURL({
      provider: 'generic',
      url: assetsURL,
    })
    try {
      return await this.autoUpdater.checkForUpdates()
    } catch (error) {
      const message = `网络错误: ${errorMessage(error).split('\n')[0]}`
      const downloadURL = `${assetsURL}${PRODUCT_NAME}_${latestVersion}_windows_x64.exe`
      windowManager.send(IPC_CHANNELS.updater.updateError, { message, downloadURL })
    }
  }

  private async checkUpdateForGhProxy(source: string) {
    let sourceURL: URL
    try {
      sourceURL = new URL(source)
    } catch {
      const msg = `更新源设置错误，你的更新源为 ${source}`
      throw new Error(msg)
    }
    await this.ensureLatestVersion()
    const assetsURL = getAssetsURL('github')
    // 自定义更新源（多为 GitHub 代理前缀）
    this.autoUpdater.setFeedURL({
      provider: 'generic',
      url: `${sourceURL}${assetsURL}`,
    })
    try {
      return await this.autoUpdater.checkForUpdates()
    } catch (error) {
      const message = `网络错误: ${errorMessage(error).split('\n')[0]}`
      const downloadURL = `${sourceURL}${assetsURL}${PRODUCT_NAME}_${latestVersion}_windows_x64.exe`
      windowManager.send(IPC_CHANNELS.updater.updateError, { message, downloadURL })
    }
  }

  public async checkForUpdates(source: string) {
    // 默认情况会在请求的资源 URL 后面添加查询参数 noCache
    // 但是很多 proxy 站点并没有针对 query 优化，就会导致 404
    // 本身通过 proxy 访问的 URL 就带有版本号，所以 noCache 完全没作用
    // 通过下面的 hack 可以不附带 noCache 查询
    // https://github.com/electron-userland/electron-builder/issues/3415#issuecomment-433082387
    this.autoUpdater.requestHeaders = { authorization: '' }
    try {
      if (!app.isPackaged) {
        if (!this.autoUpdater.forceDevUpdateConfig) {
          const message = '更新功能仅在应用打包后可用。'
          windowManager.send(IPC_CHANNELS.updater.updateError, { message })
          return
        }
        // 开发环境下的更新调试入口（已禁用）
        // await this.autoUpdater.checkForUpdates()
        // return
      }
      logger.debug(`检查更新中…… (更新源: ${source})`)

      if (source === 'gitee') {
        await this.checkUpdateForGitee()
      } else if (source === 'github') {
        await this.checkUpdateForGithub()
      } else {
        await this.checkUpdateForGhProxy(source)
      }
    } catch (error) {
      const message = `检查更新时发生错误: ${errorMessage(error)}`
      logger.error(message)
      windowManager.send(IPC_CHANNELS.updater.updateError, { message })
    }
  }

  public async downloadUpdate() {
    this.autoUpdater.downloadUpdate()
  }

  public async quitAndInstall() {
    this.autoUpdater.quitAndInstall(false, true)
  }
}

class MacOSUpdater implements Updater {
  private versionInfo: LatestYml | null = null
  private assetsURL: string | null = null
  private savePath: string | null = null
  private safeSource = ''
  /**
   * MacOS 如果使用 autoUpdater 需要提供 zip 文件，但是下载了 zip 之后又不能安装，因为没有签名
   * 所以干脆就手动下载 dmg 文件，下载完毕后退出应用，手动安装
   */
  public async checkForUpdates(source: string) {
    // 先从 latest-mac.yml 中获取目标文件
    try {
      if (!latestVersion) {
        await getLatestVersion()
      }
      const assetsURL = source === 'gitee' ? getAssetsURL('gitee') : getAssetsURL('github')
      this.safeSource =
        source === 'github' || source === 'gitee' ? '' : new URL(source).href
      this.assetsURL = assetsURL
      const latestYmlURL = `${this.safeSource}${new URL('latest-mac.yml', this.assetsURL)}`
      const ymlContent = (await net.fetch(latestYmlURL).then(res => res.text())) as string
      const latestYml = yaml.parse(ymlContent) as LatestYml

      if (!latestYml) {
        const message = '获取文件更新信息失败'
        throw new Error(message)
      }
      this.versionInfo = latestYml
      if (!semver.lt(app.getVersion(), latestYml.version)) {
        logger.info(`${app.getVersion()} 已经是最新版本，无需更新`)
        return
      }
    } catch (err) {
      const message = errorMessage(err)
      logger.error(message)
      windowManager.send(IPC_CHANNELS.updater.updateError, { message: message })
      return
    }
    this.downloadUpdate()
  }

  public async downloadUpdate() {
    let fileUrl: string | undefined
    try {
      const setupFile = this.versionInfo?.files.find(file => file.url.endsWith(`${arch()}.dmg`))
      if (!setupFile) {
        const message = '找不到 dmg 文件'
        throw new Error(message)
      }
      // 先检查本地是否已经有了这个文件（计算 Sha512）
      this.savePath = path.join(app.getPath('downloads'), 'boguanjia-update-setup.dmg')
      if (existsSync(this.savePath)) {
        const localFileSha512 = await this.calculateFileHash(this.savePath)
        logger.debug(`检测到本地文件，计算 Sha512 哈希值为 ${localFileSha512}`)
        if (localFileSha512 === setupFile.sha512) {
          logger.debug('本地已存在安装包，无需重复下载')
          windowManager.send(IPC_CHANNELS.updater.updateDownloaded)
          return
        }
      }
      // biome-ignore lint/style/noNonNullAssertion: 确保 assetsURL 不为 null
      fileUrl = `${this.safeSource}${new URL(setupFile.url, this.assetsURL!)}`
      const resp = await net.fetch(fileUrl)
      if (!resp.ok) {
        const message = `网络错误: ${resp.statusText}`
        throw new Error(message)
      }

      const totalBytes = Number.parseInt(resp.headers.get('Content-Length') ?? '0', 10)
      logger.debug(`开始下载文件 ${fileUrl}，文件大小 ${totalBytes / 1024 / 1024} MB`)
      let downloadBytes = 0

      const reader = resp.body?.getReader()
      if (!reader) {
        const message = '获取文件流失败'
        throw new Error(message)
      }
      // 删除已存在的文件
      if (existsSync(this.savePath)) {
        unlinkSync(this.savePath)
      }
      const fileWriter = createWriteStream(this.savePath)

      while (true) {
        const { done, value } = await reader.read()
        if (done) {
          break
        }
        downloadBytes += value.length
        fileWriter.write(value)

        if (totalBytes > 0) {
          const progress = (downloadBytes / totalBytes) * 100
          windowManager.send(IPC_CHANNELS.updater.downloadProgress, {
            delta: totalBytes - downloadBytes,
            percent: progress,
            bytesPerSecond: 0,
            transferred: downloadBytes,
            total: totalBytes,
          })
        }
      }
      fileWriter.end()
      logger.debug(`文件 ${fileUrl} 下载完成，保存到 ${this.savePath}`)
      windowManager.send(IPC_CHANNELS.updater.updateDownloaded)
    } catch (err) {
      const message = `下载文件失败: ${errorMessage(err)}`
      logger.error(message)
      windowManager.send(IPC_CHANNELS.updater.updateError, { message, downloadURL: fileUrl })
    }
  }

  public async quitAndInstall() {
    // 找到下载文件的路径
    if (!this.savePath) {
      const message = '未指定下载文件路径'
      throw new Error(message)
    }
    if (existsSync(this.savePath)) {
      // 打开文件
      await shell.openPath(this.savePath)
      // 等待一会后退出应用
      await sleep(3000)
      app.quit()
    } else {
      logger.error(`下载文件 ${this.savePath} 不存在`)
    }
    return
  }

  private calculateFileHash(filePath: string) {
    return new Promise<string>((resolve, reject) => {
      const hash = createHash('sha512')
      const stream = createReadStream(filePath)

      stream.on('data', chunk => hash.update(chunk))
      stream.on('end', () => resolve(hash.digest('base64')))
      stream.on('error', reject)
    })
  }
}

export const updateManager = new UpdateManager(
  platform() === 'darwin' ? new MacOSUpdater() : new WindowsUpdater(),
)
