import { contextBridge, ipcRenderer } from 'electron'

import {
  appSettingsSchema,
  clearProviderAuthInputSchema,
  conversationListSchema,
  conversationSnapshotSchema,
  desktopBridgeChannels,
  desktopContextSchema,
  exportDataResultSchema,
  getConversationInputSchema,
  importDataResultSchema,
  providerCredentialInputSchema,
  providerCredentialStatusSchema,
  providerStatusSchema,
  openExternalUrlInputSchema,
  resolveApprovalInputSchema,
  runCreateInputSchema,
  runEventSchema,
  runIdInputSchema,
  saveProviderApiKeyInputSchema,
  startProviderOauthInputSchema,
  startProviderOauthResultSchema,
  startRunResultSchema,
  type DesktopApi,
} from '../../../../packages/shared/src'

const desktopApi: DesktopApi = {
  async getContext() {
    return desktopContextSchema.parse(await ipcRenderer.invoke(desktopBridgeChannels.getContext))
  },
  async listConversations() {
    return conversationListSchema.parse(await ipcRenderer.invoke(desktopBridgeChannels.listConversations))
  },
  async getProviderStatus() {
    return providerStatusSchema.nullable().parse(await ipcRenderer.invoke(desktopBridgeChannels.getProviderStatus))
  },
  async getProviderCredentialStatus(input) {
    const payload = providerCredentialInputSchema.parse(input)
    return providerCredentialStatusSchema.parse(
      await ipcRenderer.invoke(desktopBridgeChannels.getProviderCredentialStatus, payload),
    )
  },
  async saveProviderApiKey(input) {
    const payload = saveProviderApiKeyInputSchema.parse(input)
    await ipcRenderer.invoke(desktopBridgeChannels.saveProviderApiKey, payload)
  },
  async clearProviderApiKey(input) {
    const payload = providerCredentialInputSchema.parse(input)
    await ipcRenderer.invoke(desktopBridgeChannels.clearProviderApiKey, payload)
  },
  async startProviderOauth(input) {
    const payload = startProviderOauthInputSchema.parse(input)
    return startProviderOauthResultSchema.parse(
      await ipcRenderer.invoke(desktopBridgeChannels.startProviderOauth, payload),
    )
  },
  async clearProviderAuth(input) {
    const payload = clearProviderAuthInputSchema.parse(input)
    await ipcRenderer.invoke(desktopBridgeChannels.clearProviderAuth, payload)
  },
  async exportData() {
    return exportDataResultSchema.parse(await ipcRenderer.invoke(desktopBridgeChannels.exportData))
  },
  async importData() {
    return importDataResultSchema.parse(await ipcRenderer.invoke(desktopBridgeChannels.importData))
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
  async resolveApproval(input) {
    await ipcRenderer.invoke(desktopBridgeChannels.resolveApproval, resolveApprovalInputSchema.parse(input))
  },
  async openExternalUrl(input) {
    await ipcRenderer.invoke(desktopBridgeChannels.openExternalUrl, openExternalUrlInputSchema.parse(input))
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
