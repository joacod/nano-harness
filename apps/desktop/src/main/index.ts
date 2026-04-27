import { app, BrowserWindow, Menu } from 'electron'

import { setupIpcHandlers } from './ipc-handlers'
import { buildApplicationMenu } from './menu'
import { createRuntime, recoverInterruptedRuns, setupEventForwarding } from './runtime'
import { createWindow } from './window'

app.setName('Nano Harness')

void app.whenReady().then(async () => {
  Menu.setApplicationMenu(buildApplicationMenu())

  const runtime = await createRuntime()
  setupIpcHandlers(runtime)
  setupEventForwarding(runtime)
  await recoverInterruptedRuns(runtime)
  createWindow()

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow()
    }
  })
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit()
  }
})
