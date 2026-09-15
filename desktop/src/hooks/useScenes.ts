import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import { immer } from 'zustand/middleware/immer'
import { useAutoMessageStore } from '@/hooks/useAutoMessage'
import { useAutoPopUpStore } from '@/hooks/useAutoPopUp'
import { useAutoReplyConfigStore } from '@/hooks/useAutoReplyConfig'
import { useVoiceBroadcastStore } from '@/hooks/useVoiceBroadcast'
import { useAccounts } from '@/hooks/useAccounts'

export type SceneSnapshot = {
  id: string
  name: string
  createdAt: string
  autoMessage?: unknown
  autoPopUp?: unknown
  autoReply?: unknown
  voiceBroadcast?: unknown
}

interface SceneStore {
  scenes: SceneSnapshot[]
  saveScene: (name: string, accountId: string) => SceneSnapshot | null
  applyScene: (sceneId: string, accountId: string) => boolean
  removeScene: (sceneId: string) => void
  renameScene: (sceneId: string, name: string) => void
}

function deepClone<T>(v: T): T {
  return structuredClone(v)
}

export const useSceneStore = create<SceneStore>()(
  persist(
    immer(set => ({
      scenes: [],
      saveScene: (name, accountId) => {
        const trimmed = name.trim()
        if (!trimmed) return null
        const autoMessage = useAutoMessageStore.getState().contexts[accountId]?.config
        const autoPopUp = useAutoPopUpStore.getState().contexts[accountId]
        const autoReply = useAutoReplyConfigStore.getState().contexts[accountId]?.config
        const voiceBroadcast = useVoiceBroadcastStore.getState().contexts[accountId]?.config
        const scene: SceneSnapshot = {
          id: crypto.randomUUID(),
          name: trimmed,
          createdAt: new Date().toISOString(),
          autoMessage: autoMessage ? deepClone(autoMessage) : undefined,
          autoPopUp: autoPopUp
            ? deepClone({
                config: autoPopUp.config,
                shortcuts: autoPopUp.shortcuts,
                isGlobalShortcut: autoPopUp.isGlobalShortcut,
              })
            : undefined,
          autoReply: autoReply ? deepClone(autoReply) : undefined,
          voiceBroadcast: voiceBroadcast ? deepClone(voiceBroadcast) : undefined,
        }
        set(state => {
          state.scenes.unshift(scene)
        })
        return scene
      },
      applyScene: (sceneId, accountId) => {
        const scene = useSceneStore.getState().scenes.find(s => s.id === sceneId)
        if (!scene) return false
        if (scene.autoMessage) {
          useAutoMessageStore.getState().setConfig(accountId, deepClone(scene.autoMessage) as never)
        }
        if (scene.autoPopUp) {
          const pop = scene.autoPopUp as {
            config: never
            shortcuts?: never
            isGlobalShortcut?: boolean
          }
          useAutoPopUpStore.getState().setConfig(accountId, deepClone(pop.config))
          if (pop.shortcuts) {
            useAutoPopUpStore.getState().setShortcuts(accountId, deepClone(pop.shortcuts))
          }
          if (typeof pop.isGlobalShortcut === 'boolean') {
            useAutoPopUpStore.getState().setGlobalShortcut(accountId, pop.isGlobalShortcut)
          }
        }
        if (scene.autoReply) {
          useAutoReplyConfigStore.getState().updateConfig(accountId, deepClone(scene.autoReply) as never)
        }
        if (scene.voiceBroadcast) {
          useVoiceBroadcastStore.getState().setConfig(accountId, deepClone(scene.voiceBroadcast) as never)
        }
        return true
      },
      removeScene: sceneId =>
        set(state => {
          state.scenes = state.scenes.filter(s => s.id !== sceneId)
        }),
      renameScene: (sceneId, name) =>
        set(state => {
          const s = state.scenes.find(x => x.id === sceneId)
          if (s) s.name = name.trim() || s.name
        }),
    })),
    { name: 'boguanjia-scenes', version: 1 },
  ),
)

export function useScenes() {
  const scenes = useSceneStore(s => s.scenes)
  const accountId = useAccounts(s => s.currentAccountId)
  return {
    scenes,
    saveScene: (name: string) => useSceneStore.getState().saveScene(name, accountId),
    applyScene: (id: string) => useSceneStore.getState().applyScene(id, accountId),
    removeScene: (id: string) => useSceneStore.getState().removeScene(id),
  }
}
