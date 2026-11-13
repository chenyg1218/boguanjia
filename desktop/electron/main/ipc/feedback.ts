import { IPC_CHANNELS } from 'shared/ipcChannels'
import { feedbackService } from '#/services/FeedbackService'
import { typedIpcMainHandle } from '#/utils'

function setupIpcHandlers() {
  typedIpcMainHandle(IPC_CHANNELS.feedback.submit, async (_, payload) => {
    return feedbackService.submit(payload)
  })

  typedIpcMainHandle(IPC_CHANNELS.feedback.list, async () => {
    return feedbackService.list()
  })
}

export function setupFeedbackIpcHandlers() {
  setupIpcHandlers()
}
