/// <reference types="vite/client" />

import type { DesktopApi } from '../../../../packages/shared/src'

declare global {
  interface Window {
    desktop: DesktopApi
  }
}

export {}
