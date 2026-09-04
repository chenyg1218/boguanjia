import { IPC_CHANNELS } from 'shared/ipcChannels'

const ENC_PREFIX = 'enc:v1:'

export async function encryptSecret(plain: string): Promise<string> {
  if (!plain) return ''
  if (plain.startsWith(ENC_PREFIX)) return plain
  try {
    const cipher = await window.ipcRenderer.invoke(IPC_CHANNELS.secure.encrypt, plain)
    if (cipher == null) return plain
    return `${ENC_PREFIX}${cipher}`
  } catch {
    return plain
  }
}

export async function decryptSecret(value: string): Promise<string> {
  if (!value) return ''
  if (!value.startsWith(ENC_PREFIX)) return value
  try {
    const plain = await window.ipcRenderer.invoke(
      IPC_CHANNELS.secure.decrypt,
      value.slice(ENC_PREFIX.length),
    )
    return plain ?? ''
  } catch {
    return ''
  }
}

type ApiKeysBag = Record<string, string>

async function mapApiKeys(
  keys: ApiKeysBag | undefined,
  mapper: (v: string) => Promise<string>,
): Promise<void> {
  if (!keys) return
  for (const provider of Object.keys(keys)) {
    keys[provider] = await mapper(keys[provider] ?? '')
  }
}

/** 在写入 localStorage 前加密；读出后解密到内存明文供业务使用 */
export async function transformAiStoragePayload(
  raw: string,
  mode: 'encrypt' | 'decrypt',
): Promise<string> {
  try {
    const parsed = JSON.parse(raw) as {
      state?: {
        chat?: { apiKeys?: ApiKeysBag }
        autoReply?: { apiKeys?: ApiKeysBag }
      }
    }
    const state = parsed.state
    if (!state) return raw

    const mapper = mode === 'encrypt' ? encryptSecret : decryptSecret
    await mapApiKeys(state.chat?.apiKeys, mapper)
    await mapApiKeys(state.autoReply?.apiKeys, mapper)
    return JSON.stringify(parsed)
  } catch {
    return raw
  }
}

export function createEncryptedJsonStorage(storageKeyHint?: string) {
  return {
    getItem: async (name: string): Promise<string | null> => {
      const raw = localStorage.getItem(name)
      if (raw == null) return null
      if (storageKeyHint && name !== storageKeyHint && !name.includes('ai')) {
        return raw
      }
      return transformAiStoragePayload(raw, 'decrypt')
    },
    setItem: async (name: string, value: string): Promise<void> => {
      const next = await transformAiStoragePayload(value, 'encrypt')
      localStorage.setItem(name, next)
    },
    removeItem: async (name: string): Promise<void> => {
      localStorage.removeItem(name)
    },
  }
}
