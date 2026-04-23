/// <reference types="vite/client" />

declare global {
  interface Window {
    desktop: {
      platform: NodeJS.Platform
      version: string
    }
  }
}

export {}
