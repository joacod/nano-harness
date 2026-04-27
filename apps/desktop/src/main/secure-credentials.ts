import { safeStorage } from 'electron'
import { Buffer } from 'node:buffer'

const SAFE_STORAGE_PREFIX = 'safe-storage:v1:'

export function encryptApiKey(apiKey: string): string {
  if (!safeStorage.isEncryptionAvailable()) {
    throw new Error('Secure API key storage is not available on this system.')
  }

  return `${SAFE_STORAGE_PREFIX}${safeStorage.encryptString(apiKey).toString('base64')}`
}

export function decryptApiKey(encryptedApiKey: string): string {
  if (!encryptedApiKey.startsWith(SAFE_STORAGE_PREFIX)) {
    throw new Error('Stored API key uses an unsupported secure storage format.')
  }

  return safeStorage.decryptString(Buffer.from(encryptedApiKey.slice(SAFE_STORAGE_PREFIX.length), 'base64'))
}
