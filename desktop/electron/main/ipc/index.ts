import { setupAIChatIpcHandlers } from './aichat'
import { setupAppIpcHandlers } from './app'
import { setupAutoMessageIpcHandlers } from './autoMessage'
import { setupAutoPopUpIpcHandlers } from './autoPopUp'
import { setupBrowserIpcHandlers } from './browser'
import { setupAutoReplyIpcHandlers } from './commentListener'
import { setupLiveControlIpcHandlers } from './connection'
import { setupLicenseIpcHandlers } from './license'
import { setupSecureIpcHandlers } from './secure'
import { setupUpdateIpcHandlers } from './update'
import { setupVoiceBroadcastIpcHandlers } from './voiceBroadcast'

setupLiveControlIpcHandlers()
setupAIChatIpcHandlers()
setupAutoPopUpIpcHandlers()
setupAutoReplyIpcHandlers()
setupAutoMessageIpcHandlers()
setupVoiceBroadcastIpcHandlers()
setupBrowserIpcHandlers()
setupAppIpcHandlers()
setupUpdateIpcHandlers()
setupLicenseIpcHandlers()
setupSecureIpcHandlers()
