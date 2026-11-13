import { setupAIChatIpcHandlers } from './aichat'
import { setupAppIpcHandlers } from './app'
import { setupAutoMessageIpcHandlers } from './autoMessage'
import { setupAutoPopUpIpcHandlers } from './autoPopUp'
import { setupBrowserIpcHandlers } from './browser'
import { setupAutoReplyIpcHandlers } from './commentListener'
import { setupLiveControlIpcHandlers } from './connection'
import { setupFeedbackIpcHandlers } from './feedback'
import { setupLicenseIpcHandlers } from './license'
import { setupSecureIpcHandlers } from './secure'
import { setupUpdateIpcHandlers } from './update'
import { setupViewerControlIpcHandlers } from './viewerControl'
import { setupViewerDanmakuIpcHandlers } from './viewerDanmaku'
import { setupVoiceBroadcastIpcHandlers } from './voiceBroadcast'

setupLiveControlIpcHandlers()
setupAIChatIpcHandlers()
setupAutoPopUpIpcHandlers()
setupAutoReplyIpcHandlers()
setupAutoMessageIpcHandlers()
setupViewerControlIpcHandlers()
setupViewerDanmakuIpcHandlers()
setupVoiceBroadcastIpcHandlers()
setupBrowserIpcHandlers()
setupAppIpcHandlers()
setupUpdateIpcHandlers()
setupLicenseIpcHandlers()
setupFeedbackIpcHandlers()
setupSecureIpcHandlers()
