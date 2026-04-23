import { defineConfig, externalizeDepsPlugin } from 'electron-vite'
import react from '@vitejs/plugin-react'
import { resolve } from 'node:path'

export default defineConfig({
  main: {
    plugins: [externalizeDepsPlugin()],
    resolve: {
      alias: {
        '@shared': resolve(__dirname, '../../packages/shared/src'),
        '@core': resolve(__dirname, '../../packages/core/src'),
        '@infra': resolve(__dirname, '../../packages/infra/src')
      }
    }
  },
  preload: {
    plugins: [externalizeDepsPlugin()],
    resolve: {
      alias: {
        '@shared': resolve(__dirname, '../../packages/shared/src')
      }
    }
  },
  renderer: {
    plugins: [react()],
    resolve: {
      alias: {
        '@shared': resolve(__dirname, '../../packages/shared/src'),
        '@core': resolve(__dirname, '../../packages/core/src'),
        '@infra': resolve(__dirname, '../../packages/infra/src')
      }
    }
  }
})
