import { app, ipcMain } from 'electron'

import {
  appSettingsSchema,
  desktopBridgeChannels,
  desktopContextSchema,
  getConversationInputSchema,
  providerCredentialInputSchema,
  resolveApprovalInputSchema,
  runCreateInputSchema,
  runIdInputSchema,
  saveProviderApiKeyInputSchema,
  startRunResultSchema,
} from '../../../../packages/shared/src'
import { exportData, importData } from './data-transfer'
import type { DesktopRuntime } from './runtime'
import { buildProviderStatus } from './runtime'
import { encryptApiKey } from './secure-credentials'

export function setupIpcHandlers(runtime: DesktopRuntime): void {
  ipcMain.handle(desktopBridgeChannels.getContext, async () => {
    return desktopContextSchema.parse({
      platform: process.platform,
      version: app.getVersion(),
      dataPath: runtime.store.paths.databaseFilePath,
    })
  })

  ipcMain.handle(desktopBridgeChannels.listConversations, async () => {
    return await runtime.store.listConversations()
  })

  ipcMain.handle(desktopBridgeChannels.getProviderStatus, async () => {
    return await buildProviderStatus(runtime, await runtime.store.getSettings())
  })

  ipcMain.handle(desktopBridgeChannels.getProviderCredentialStatus, async (_event, payload) => {
    const input = providerCredentialInputSchema.parse(payload)
    return await runtime.store.getProviderCredentialStatus(input.provider)
  })

  ipcMain.handle(desktopBridgeChannels.saveProviderApiKey, async (_event, payload) => {
    const input = saveProviderApiKeyInputSchema.parse(payload)
    await runtime.store.saveProviderCredential(input.provider, encryptApiKey(input.apiKey.trim()))
  })

  ipcMain.handle(desktopBridgeChannels.clearProviderApiKey, async (_event, payload) => {
    const input = providerCredentialInputSchema.parse(payload)
    await runtime.store.clearProviderCredential(input.provider)
  })

  ipcMain.handle(desktopBridgeChannels.exportData, async () => {
    return await exportData(runtime)
  })

  ipcMain.handle(desktopBridgeChannels.importData, async () => {
    return await importData(runtime)
  })

  ipcMain.handle(desktopBridgeChannels.getSettings, async () => {
    return await runtime.store.getSettings()
  })

  ipcMain.handle(desktopBridgeChannels.saveSettings, async (_event, payload) => {
    const settings = appSettingsSchema.parse(payload)
    await runtime.store.saveSettings(settings)
    return settings
  })

  ipcMain.handle(desktopBridgeChannels.getConversation, async (_event, payload) => {
    const input = getConversationInputSchema.parse(payload)
    return await runtime.store.getConversation(input.conversationId)
  })

  ipcMain.handle(desktopBridgeChannels.startRun, async (_event, payload) => {
    const input = runCreateInputSchema.parse(payload)
    const handle = await runtime.runEngine.startRun(input)
    return startRunResultSchema.parse({
      runId: handle.runId,
    })
  })

  ipcMain.handle(desktopBridgeChannels.resumeRun, async (_event, payload) => {
    const input = runIdInputSchema.parse(payload)
    await runtime.runEngine.resumeRun(input.runId)
  })

  ipcMain.handle(desktopBridgeChannels.cancelRun, async (_event, payload) => {
    const input = runIdInputSchema.parse(payload)
    await runtime.runEngine.cancelRun(input.runId)
  })

  ipcMain.handle(desktopBridgeChannels.resolveApproval, async (_event, payload) => {
    const input = resolveApprovalInputSchema.parse(payload)
    await runtime.runEngine.resolveApproval(input)
  })
}
