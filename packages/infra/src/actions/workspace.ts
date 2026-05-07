import path from 'node:path'

import { isWorkspaceRelativePathInsideRoot, normalizeWorkspaceRelativePath, toWorkspaceDisplayPath } from '@nano-harness/core'

export function resolveWorkspacePath(rootPath: string, targetPath: string): string {
  if (!isWorkspaceRelativePathInsideRoot(targetPath)) {
    throw new Error(`Path ${targetPath} is outside the configured workspace root`)
  }

  const absoluteRoot = path.resolve(rootPath)
  const workspacePath = normalizeWorkspaceRelativePath(targetPath)
  const absoluteTarget = path.resolve(absoluteRoot, workspacePath)
  const relativeTarget = path.relative(absoluteRoot, absoluteTarget)

  if (relativeTarget === '..' || relativeTarget.startsWith(`..${path.sep}`) || path.isAbsolute(relativeTarget)) {
    throw new Error(`Path ${targetPath} is outside the configured workspace root`)
  }

  return absoluteTarget
}

export function toPosixPath(value: string): string {
  return toWorkspaceDisplayPath(value.split(path.sep).join('/'))
}
