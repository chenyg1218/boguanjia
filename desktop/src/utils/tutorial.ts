import { IPC_CHANNELS } from 'shared/ipcChannels'

/** 飞书知识库：播管家使用教程 */
export const TUTORIAL_URL =
  'https://my.feishu.cn/wiki/IFIswo28fi6pcykOsYhcwNpunXd?from=from_copylink'

export function openTutorial() {
  return window.ipcRenderer.invoke(IPC_CHANNELS.app.openExternal, TUTORIAL_URL)
}
