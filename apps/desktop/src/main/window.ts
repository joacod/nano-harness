import { app, BrowserWindow } from 'electron'
import { join } from 'node:path'

function getAppIconPath(): string {
  return join(app.getAppPath(), 'resources', 'icon.png')
}

export function createWindow(): void {
  const window = new BrowserWindow({
    width: 1200,
    height: 800,
    minWidth: 900,
    minHeight: 640,
    title: 'Nano Harness',
    icon: getAppIconPath(),
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      contextIsolation: true,
      nodeIntegration: false,
    },
  })

  window.maximize()
  void window.loadURL(process.env['ELECTRON_RENDERER_URL'] ?? `file://${join(__dirname, '../renderer/index.html')}`)
}
