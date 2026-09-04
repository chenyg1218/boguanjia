import { IPC_CHANNELS } from 'shared/ipcChannels'
import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import { immer } from 'zustand/middleware/immer'
import { EVENTS, eventEmitter } from '@/utils/events'

interface AccountsStore {
  accounts: Account[]
  currentAccountId: string
  addAccount: (name: string) => void
  removeAccount: (id: string) => void
  switchAccount: (id: string) => void
  getCurrentAccount: () => Account | undefined
  updateAccountName: (id: string, name: string) => void
  setAccountDisabled: (id: string, disabled: boolean) => void
  enableAllAccounts: () => void
}

export const useAccounts = create<AccountsStore>()(
  persist(
    immer((set, get) => ({
      accounts: [{ id: 'default', name: '默认账号' }],
      currentAccountId: 'default',

      addAccount: (name: string) => {
        set(state => {
          const newId = crypto.randomUUID()
          state.accounts.push({
            id: newId,
            name,
          })
          eventEmitter.emit(EVENTS.ACCOUNT_ADDED, newId, name)
        })
      },

      removeAccount: (id: string) => {
        set(state => {
          if (id === 'default') {
            return
          }
          state.accounts = state.accounts.filter(acc => acc.id !== id)
          if (state.currentAccountId === id) {
            state.currentAccountId = 'default'
          }
          eventEmitter.emit(EVENTS.ACCOUNT_REMOVED, id)
        })
        void window.ipcRenderer.invoke(IPC_CHANNELS.chrome.clearState, id).catch(() => {})
      },

      switchAccount: (id: string) => {
        set(state => {
          state.currentAccountId = id
          eventEmitter.emit(EVENTS.ACCOUNT_SWITCHED, id)
        })
      },

      getCurrentAccount: () => {
        return get().accounts.find(acc => acc.id === get().currentAccountId)
      },

      updateAccountName: (id: string, name: string) => {
        set(state => {
          const account = state.accounts.find(acc => acc.id === id)
          if (account) {
            account.name = name
          }
        })
      },

      setAccountDisabled: (id, disabled) => {
        set(state => {
          if (id === 'default') return
          const account = state.accounts.find(acc => acc.id === id)
          if (account) {
            account.disabled = disabled
          }
        })
      },

      enableAllAccounts: () => {
        set(state => {
          for (const account of state.accounts) {
            if (account.disabled) {
              account.disabled = false
            }
          }
        })
      },
    })),
    {
      name: 'accounts-storage',
      version: 1,
      migrate: (persistedState, version) => {
        if (version === 0 || version === undefined) {
          const state = persistedState as { accounts?: Account[]; currentAccountId?: string }
          return {
            accounts: (state.accounts ?? []).map(a => ({
              id: a.id,
              name: a.name,
              disabled: a.disabled,
            })),
            currentAccountId: state.currentAccountId ?? 'default',
          }
        }
        return persistedState as { accounts: Account[]; currentAccountId: string }
      },
    },
  ),
)
