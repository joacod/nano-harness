import { contextBridge, ipcRenderer } from 'electron'

import {
  appSettingsSchema,
  conversationSnapshotSchema,
  desktopBridgeChannels,
  desktopContextSchema,
  getConversationInputSchema,
  runCreateInputSchema,
  runEventSchema,
  runIdInputSchema,
  startRunResultSchema,
  type DesktopApi,
} from '../../../../packages/shared/src'

const desktopApi: DesktopApi = {
  async getContext() {
    return desktopContextSchema.parse(await ipcRenderer.invoke(desktopBridgeChannels.getContext))
  },
  async getSettings() {
    return appSettingsSchema.nullable().parse(await ipcRenderer.invoke(desktopBridgeChannels.getSettings))
  },
  async saveSettings(settings) {
    const payload = appSettingsSchema.parse(settings)
    return appSettingsSchema.parse(await ipcRenderer.invoke(desktopBridgeChannels.saveSettings, payload))
  },
  async getConversation(input) {
    const payload = getConversationInputSchema.parse(input)
    return conversationSnapshotSchema.parse(await ipcRenderer.invoke(desktopBridgeChannels.getConversation, payload))
  },
  async startRun(input) {
    const payload = runCreateInputSchema.parse(input)
    return startRunResultSchema.parse(await ipcRenderer.invoke(desktopBridgeChannels.startRun, payload))
  },
  async resumeRun(input) {
    await ipcRenderer.invoke(desktopBridgeChannels.resumeRun, runIdInputSchema.parse(input))
  },
  async cancelRun(input) {
    await ipcRenderer.invoke(desktopBridgeChannels.cancelRun, runIdInputSchema.parse(input))
  },
  onRunEvent(listener) {
    const wrappedListener = (_event: Electron.IpcRendererEvent, payload: unknown) => {
      listener(runEventSchema.parse(payload))
    }

    ipcRenderer.on(desktopBridgeChannels.runEvent, wrappedListener)

    return () => {
      ipcRenderer.off(desktopBridgeChannels.runEvent, wrappedListener)
    }
  },
}

contextBridge.exposeInMainWorld('desktop', desktopApi)
