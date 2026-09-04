import { contextBridge, type IpcRendererEvent, ipcRenderer } from 'electron'
import type { ElectronAPI, IpcChannels } from 'shared/electron-api'

type IpcRendererInvokeReturnType<Channel extends keyof IpcChannels> =
  ReturnType<IpcChannels[Channel]> extends Promise<infer _U>
    ? ReturnType<IpcChannels[Channel]>
    : Promise<ReturnType<IpcChannels[Channel]>>

const ipcRendererApi: ElectronAPI['ipcRenderer'] = {
  on<Channel extends keyof IpcChannels>(
    channel: Channel,
    listener: (...args: Parameters<IpcChannels[Channel]>) => void,
  ): () => void {
    const subscription = (_event: IpcRendererEvent, ...args: Parameters<IpcChannels[Channel]>) =>
      listener(...args)

    ipcRenderer.on(channel as string, subscription)
    return () => {
      ipcRenderer.off(channel as string, subscription)
    }
  },

  send: <Channel extends keyof IpcChannels>(
    channel: Channel,
    ...args: Parameters<IpcChannels[Channel]>
  ): void => {
    ipcRenderer.send(channel as string, ...args) // <--- 也在这里加上断言
  },

  invoke: <Channel extends keyof IpcChannels>(
    channel: Channel,
    ...args: Parameters<IpcChannels[Channel]>
  ): IpcRendererInvokeReturnType<Channel> => {
    return ipcRenderer.invoke(channel as string, ...args) as IpcRendererInvokeReturnType<Channel>
  },
}

// --------- Expose some API to the Renderer process ---------
contextBridge.exposeInMainWorld('ipcRenderer', ipcRendererApi)

// --------- Preload scripts loading ---------
function domReady(condition: DocumentReadyState[] = ['complete', 'interactive']) {
  return new Promise(resolve => {
    if (condition.includes(document.readyState)) {
      resolve(true)
    } else {
      document.addEventListener('readystatechange', () => {
        if (condition.includes(document.readyState)) {
          resolve(true)
        }
      })
    }
  })
}

const safeDOM = {
  append(parent: HTMLElement, child: HTMLElement) {
    if (!Array.from(parent.children).find(e => e === child)) {
      return parent.appendChild(child)
    }
  },
  remove(parent: HTMLElement, child: HTMLElement) {
    if (Array.from(parent.children).find(e => e === child)) {
      return parent.removeChild(child)
    }
  },
}

/** 播管家品牌启动动画：霓虹 C + 播放键呼吸光晕 */
function useLoading() {
  const styleContent = `
@keyframes brand-breathe {
  0%, 100% {
    transform: scale(1);
    filter:
      drop-shadow(0 0 10px rgba(92, 240, 255, 0.4))
      drop-shadow(0 0 28px rgba(123, 108, 255, 0.35))
      drop-shadow(0 0 48px rgba(196, 77, 255, 0.25));
  }
  50% {
    transform: scale(1.05);
    filter:
      drop-shadow(0 0 18px rgba(92, 240, 255, 0.75))
      drop-shadow(0 0 42px rgba(123, 108, 255, 0.55))
      drop-shadow(0 0 72px rgba(196, 77, 255, 0.45));
  }
}
@keyframes brand-enter {
  from { opacity: 0; transform: scale(0.88); }
  to { opacity: 1; transform: scale(1); }
}
@keyframes brand-title {
  from { opacity: 0; transform: translateY(6px); }
  to { opacity: 0.88; transform: translateY(0); }
}
.app-loading-wrap {
  position: fixed;
  inset: 0;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 18px;
  background: #0a0a0a;
  z-index: 9;
}
.app-loading-logo {
  width: 96px;
  height: 96px;
  border-radius: 22%;
  animation:
    brand-enter 0.45s ease-out both,
    brand-breathe 2.4s ease-in-out 0.45s infinite;
}
.app-loading-logo svg {
  display: block;
  width: 100%;
  height: 100%;
}
.app-loading-title {
  margin: 0;
  color: #f2f2f2;
  font-size: 15px;
  font-weight: 500;
  letter-spacing: 0.2em;
  font-family: "Segoe UI", "PingFang SC", "Microsoft YaHei", sans-serif;
  animation: brand-title 0.5s ease-out 0.2s both;
}
@media (prefers-reduced-motion: reduce) {
  .app-loading-logo {
    animation: brand-enter 0.3s ease-out both;
  }
  .app-loading-title {
    animation: none;
    opacity: 0.88;
  }
}
    `
  const brandSvg = `
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512" aria-hidden="true">
  <defs>
    <linearGradient id="neon" x1="12%" y1="8%" x2="88%" y2="92%">
      <stop offset="0%" stop-color="#5CF0FF"/>
      <stop offset="45%" stop-color="#7B6CFF"/>
      <stop offset="100%" stop-color="#C44DFF"/>
    </linearGradient>
    <filter id="glow" x="-40%" y="-40%" width="180%" height="180%">
      <feGaussianBlur in="SourceGraphic" stdDeviation="14" result="blur"/>
      <feMerge>
        <feMergeNode in="blur"/>
        <feMergeNode in="blur"/>
        <feMergeNode in="SourceGraphic"/>
      </feMerge>
    </filter>
    <filter id="softGlow" x="-50%" y="-50%" width="200%" height="200%">
      <feGaussianBlur in="SourceGraphic" stdDeviation="22"/>
    </filter>
    <clipPath id="app">
      <rect width="512" height="512" rx="112" ry="112"/>
    </clipPath>
    <path id="cRing" d="M256 72C358 72 440 154 440 256C440 358 358 440 256 440C188 440 128 404 94 348L148 314C170 350 210 376 256 376C322 376 376 322 376 256C376 190 322 136 256 136C214 136 178 156 158 188L100 146C132 96 190 72 256 72Z"/>
    <path id="play" d="M214 178L348 256L214 334Z"/>
  </defs>
  <g clip-path="url(#app)">
    <rect width="512" height="512" fill="#000"/>
    <use href="#cRing" fill="url(#neon)" filter="url(#softGlow)" opacity="0.85"/>
    <use href="#play" fill="url(#neon)" filter="url(#softGlow)" opacity="0.55"/>
    <use href="#cRing" fill="url(#neon)" filter="url(#glow)" opacity="0.95"/>
    <use href="#play" fill="url(#neon)" filter="url(#glow)" opacity="0.7"/>
    <use href="#cRing" fill="#FFF"/>
    <use href="#play" fill="#FFF"/>
  </g>
</svg>`

  const oStyle = document.createElement('style')
  const oDiv = document.createElement('div')

  oStyle.id = 'app-loading-style'
  oStyle.innerHTML = styleContent
  oDiv.className = 'app-loading-wrap'
  oDiv.innerHTML = `<div class="app-loading-logo">${brandSvg}</div><p class="app-loading-title">播管家</p>`

  return {
    appendLoading() {
      safeDOM.append(document.head, oStyle)
      safeDOM.append(document.body, oDiv)
    },
    removeLoading() {
      safeDOM.remove(document.head, oStyle)
      safeDOM.remove(document.body, oDiv)
    },
  }
}

// ----------------------------------------------------------------------

// biome-ignore lint/correctness/useHookAtTopLevel: 这不是 hook
const { appendLoading, removeLoading } = useLoading()
domReady().then(appendLoading)

window.onmessage = ev => {
  ev.data.payload === 'removeLoading' && removeLoading()
}

setTimeout(removeLoading, 4999)
