import { app, ipcMain, shell } from 'electron'

import {
  appSettingsSchema,
  desktopBridgeChannels,
  desktopContextSchema,
  getConversationInputSchema,
  getProviderDefinition,
  openExternalUrlInputSchema,
  providerCredentialInputSchema,
  resolveApprovalInputSchema,
  runCreateInputSchema,
  runIdInputSchema,
  saveProviderAuthInputSchema,
  clearProviderAuthInputSchema,
  startProviderOauthInputSchema,
  startProviderOauthResultSchema,
  startRunResultSchema,
  type ProviderAuthMethod,
} from '../../../../packages/shared/src'
import { exportData, importData } from './data-transfer'
import { startOpenAIChatGptOAuth } from './openai-chatgpt-auth'
import type { DesktopRuntime } from './runtime'
import { buildProviderStatus } from './runtime'
import { encryptCredentialPayload } from './secure-credentials'

type IpcRuntime = {
  store: {
    paths: {
      dataDir: string
      databaseFilePath: string
    }
    listConversations: DesktopRuntime['store']['listConversations']
    listRuns: DesktopRuntime['store']['listRuns']
    getProviderCredentialStatus: DesktopRuntime['store']['getProviderCredentialStatus']
    getEncryptedProviderCredentialPayload: DesktopRuntime['store']['getEncryptedProviderCredentialPayload']
    saveProviderCredentialPayload: DesktopRuntime['store']['saveProviderCredentialPayload']
    clearProviderCredential: DesktopRuntime['store']['clearProviderCredential']
    getSettings: DesktopRuntime['store']['getSettings']
    saveSettings: DesktopRuntime['store']['saveSettings']
    getConversation: DesktopRuntime['store']['getConversation']
    backupToFile: DesktopRuntime['store']['backupToFile']
    sanitizeDatabaseFile: DesktopRuntime['store']['sanitizeDatabaseFile']
    validateDatabaseFile: DesktopRuntime['store']['validateDatabaseFile']
    createStagedImportCopy: DesktopRuntime['store']['createStagedImportCopy']
    close: DesktopRuntime['store']['close']
  }
  runEngine: {
    startRun: DesktopRuntime['runEngine']['startRun']
    resumeRun: DesktopRuntime['runEngine']['resumeRun']
    cancelRun: DesktopRuntime['runEngine']['cancelRun']
    resolveApproval: DesktopRuntime['runEngine']['resolveApproval']
  }
}

function parseExternalUrl(payload: unknown): string {
  const { url } = openExternalUrlInputSchema.parse(payload)
  const parsedUrl = new URL(url)

  if (parsedUrl.protocol !== 'http:' && parsedUrl.protocol !== 'https:') {
    throw new Error('Only http and https links can be opened externally.')
  }

  return parsedUrl.toString()
}

export function setupIpcHandlers(runtime: IpcRuntime): void {
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

  ipcMain.handle(desktopBridgeChannels.saveProviderAuth, async (_event, payload) => {
    const input = saveProviderAuthInputSchema.parse(payload)
    await runtime.store.saveProviderCredentialPayload(
      input.provider,
      input.authMethod,
      encryptCredentialPayload({ authMethod: 'api-key', apiKey: input.apiKey.trim() }),
    )
  })

  ipcMain.handle(desktopBridgeChannels.startProviderOauth, async (_event, payload) => {
    const input = startProviderOauthInputSchema.parse(payload)
    const provider = getProviderDefinition(input.provider)

    if (!(provider.authMethods as readonly ProviderAuthMethod[]).includes('oauth')) {
      throw new Error(`${provider.label} does not support OAuth sign-in.`)
    }

    const credential = await startOpenAIChatGptOAuth({ openExternal: (url) => shell.openExternal(url) })

    await runtime.store.saveProviderCredentialPayload(
      input.provider,
      'oauth',
      encryptCredentialPayload(credential),
    )

    return startProviderOauthResultSchema.parse({
      provider: input.provider,
      accountId: credential.accountId,
    })
  })

  ipcMain.handle(desktopBridgeChannels.clearProviderAuth, async (_event, payload) => {
    const input = clearProviderAuthInputSchema.parse(payload)
    const provider = getProviderDefinition(input.provider)
    const authMethod = input.authMethod ?? provider.defaultAuthMethod

    if (!(provider.authMethods as readonly ProviderAuthMethod[]).includes(authMethod)) {
      throw new Error(`${provider.label} does not support ${authMethod} auth.`)
    }

    if (authMethod !== 'none') {
      await runtime.store.clearProviderCredential(input.provider, authMethod)
    }
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

  ipcMain.handle(desktopBridgeChannels.openExternalUrl, async (_event, payload) => {
    await shell.openExternal(parseExternalUrl(payload))
  })
}
