import { safeStorage } from 'electron'
import { Buffer } from 'node:buffer'

const SAFE_STORAGE_JSON_PREFIX = 'safe-storage-json:v1:'

export function encryptCredentialPayload(payload: unknown): string {
  if (!safeStorage.isEncryptionAvailable()) {
    throw new Error('Secure credential storage is not available on this system.')
  }

  return `${SAFE_STORAGE_JSON_PREFIX}${safeStorage.encryptString(JSON.stringify(payload)).toString('base64')}`
}

export function decryptCredentialPayload(encryptedPayload: string): unknown {
  if (!encryptedPayload.startsWith(SAFE_STORAGE_JSON_PREFIX)) {
    throw new Error('Stored credential uses an unsupported secure storage format.')
  }

  return JSON.parse(safeStorage.decryptString(Buffer.from(encryptedPayload.slice(SAFE_STORAGE_JSON_PREFIX.length), 'base64')))
}
