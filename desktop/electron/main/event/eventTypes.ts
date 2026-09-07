export type MainEvents = {
  'page-closed': {
    accountId: string
  }
  'browser-disconnected': {
    accountId: string
  }
  'providers-updated': Record<string, ProviderInfo>
}
