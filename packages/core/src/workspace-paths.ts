function isAbsoluteWorkspacePath(value: string): boolean {
  const normalized = value.replace(/\\/g, '/')

  return normalized.startsWith('/') || /^[a-zA-Z]:/.test(normalized)
}

export function toWorkspaceDisplayPath(value: string): string {
  return value.replace(/\\/g, '/')
}

export function normalizeWorkspaceRelativePath(value: string): string {
  const normalized = toWorkspaceDisplayPath(value.trim())
  const segments: string[] = []

  for (const segment of normalized.split('/')) {
    if (!segment || segment === '.') {
      continue
    }

    if (segment === '..') {
      segments.pop()
      continue
    }

    segments.push(segment)
  }

  return segments.length > 0 ? segments.join('/') : '.'
}

export function isWorkspaceRelativePathInsideRoot(value: string): boolean {
  const normalized = toWorkspaceDisplayPath(value.trim())

  if (!normalized || isAbsoluteWorkspacePath(normalized)) {
    return false
  }

  const segments = normalized.split('/').filter((segment) => segment && segment !== '.')
  let depth = 0

  for (const segment of segments) {
    if (segment === '..') {
      depth -= 1
    } else {
      depth += 1
    }

    if (depth < 0) {
      return false
    }
  }

  return true
}
