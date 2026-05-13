import { contextBridge, ipcRenderer } from 'electron'

import {
  appSettingsSchema,
  clearProviderAuthInputSchema,
  conversationListSchema,
  conversationSnapshotSchema,
  desktopBridgeChannels,
  desktopContextSchema,
  exportDataResultSchema,
  exportRunEvidenceInputSchema,
  exportRunEvidenceResultSchema,
  getConversationInputSchema,
  importDataResultSchema,
  providerCredentialInputSchema,
  providerCredentialStatusSchema,
  providerStatusSchema,
  skillInventorySchema,
  openExternalUrlInputSchema,
  mcpInventorySchema,
  memoryProposalListSchema,
  memoryRecordListSchema,
  resolveApprovalInputSchema,
  resolveMemoryProposalInputSchema,
  runCreateInputSchema,
  runEventSchema,
  runIdInputSchema,
  sessionExportResultSchema,
  sessionInputSchema,
  sessionListSchema,
  sessionMutationResultSchema,
  saveProviderAuthInputSchema,
  showItemInFolderInputSchema,
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
  async listSessions() {
    return sessionListSchema.parse(await ipcRenderer.invoke(desktopBridgeChannels.listSessions))
  },
  async getProviderStatus() {
    return providerStatusSchema.nullable().parse(await ipcRenderer.invoke(desktopBridgeChannels.getProviderStatus))
  },
  async listSkills() {
    return skillInventorySchema.parse(await ipcRenderer.invoke(desktopBridgeChannels.listSkills))
  },
  async listMcpInventory() {
    return mcpInventorySchema.parse(await ipcRenderer.invoke(desktopBridgeChannels.listMcpInventory))
  },
  async listMemoryRecords() {
    return memoryRecordListSchema.parse(await ipcRenderer.invoke(desktopBridgeChannels.listMemoryRecords))
  },
  async listMemoryProposals() {
    return memoryProposalListSchema.parse(await ipcRenderer.invoke(desktopBridgeChannels.listMemoryProposals))
  },
  async resolveMemoryProposal(input) {
    const payload = resolveMemoryProposalInputSchema.parse(input)
    await ipcRenderer.invoke(desktopBridgeChannels.resolveMemoryProposal, payload)
  },
  async getProviderCredentialStatus(input) {
    const payload = providerCredentialInputSchema.parse(input)
    return providerCredentialStatusSchema.parse(
      await ipcRenderer.invoke(desktopBridgeChannels.getProviderCredentialStatus, payload),
    )
  },
  async saveProviderAuth(input) {
    const payload = saveProviderAuthInputSchema.parse(input)
    await ipcRenderer.invoke(desktopBridgeChannels.saveProviderAuth, payload)
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
  async exportRunEvidence(input) {
    const payload = exportRunEvidenceInputSchema.parse(input)
    return exportRunEvidenceResultSchema.parse(await ipcRenderer.invoke(desktopBridgeChannels.exportRunEvidence, payload))
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
  async forkSession(input) {
    const payload = sessionInputSchema.parse(input)
    return sessionMutationResultSchema.parse(await ipcRenderer.invoke(desktopBridgeChannels.forkSession, payload))
  },
  async cloneSession(input) {
    const payload = sessionInputSchema.parse(input)
    return sessionMutationResultSchema.parse(await ipcRenderer.invoke(desktopBridgeChannels.cloneSession, payload))
  },
  async exportSession(input) {
    const payload = sessionInputSchema.parse(input)
    return sessionExportResultSchema.parse(await ipcRenderer.invoke(desktopBridgeChannels.exportSession, payload))
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
  async showItemInFolder(input) {
    await ipcRenderer.invoke(desktopBridgeChannels.showItemInFolder, showItemInFolderInputSchema.parse(input))
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
