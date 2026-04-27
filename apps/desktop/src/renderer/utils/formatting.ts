export function formatTimestamp(value: string) {
  return new Date(value).toLocaleString()
}

export function formatRelativeTimestamp(value: string) {
  const deltaMs = Date.now() - new Date(value).getTime()
  const deltaMinutes = Math.round(deltaMs / 60000)

  if (Math.abs(deltaMinutes) < 1) {
    return 'just now'
  }

  if (Math.abs(deltaMinutes) < 60) {
    return `${deltaMinutes}m ago`
  }

  const deltaHours = Math.round(deltaMinutes / 60)

  if (Math.abs(deltaHours) < 24) {
    return `${deltaHours}h ago`
  }

  const deltaDays = Math.round(deltaHours / 24)
  return `${deltaDays}d ago`
}

export function previewText(value: string, maxLength = 120) {
  const normalized = value.trim().replace(/\s+/g, ' ')

  if (!normalized) {
    return 'No additional detail.'
  }

  return normalized.length > maxLength ? `${normalized.slice(0, maxLength - 3)}...` : normalized
}
