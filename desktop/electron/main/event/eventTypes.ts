export type MainEvents = {
  'page-closed': {
    accountId: string
  }
  'browser-disconnected': {
    accountId: string
  }
  'viewer-page-closed': {
    accountId: string
  }
  'viewer-browser-disconnected': {
    accountId: string
  }
  /** 互动号登录成功：催促中控补解析本场观众端链接 */
  'viewer-logged-in': {
    accountId: string
  }
  'providers-updated': Record<string, ProviderInfo>
}
