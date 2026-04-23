import { contextBridge } from 'electron'

const desktopApi = {
  platform: process.platform,
  version: '0.0.0'
} as const

contextBridge.exposeInMainWorld('desktop', desktopApi)
