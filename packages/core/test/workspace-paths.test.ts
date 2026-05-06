import { describe, expect, it } from 'vitest'

import { isWorkspaceRelativePathInsideRoot, normalizeWorkspaceRelativePath, toWorkspaceDisplayPath } from '../src/workspace-paths'

describe('workspace path helpers', () => {
  it('keeps tool paths relative and slash-normalized across operating systems', () => {
    expect(isWorkspaceRelativePathInsideRoot('src/main.ts')).toBe(true)
    expect(isWorkspaceRelativePathInsideRoot('src\\main.ts')).toBe(true)
    expect(normalizeWorkspaceRelativePath('.\\src\\..\\README.md')).toBe('README.md')
    expect(toWorkspaceDisplayPath('src\\main.ts')).toBe('src/main.ts')
  })

  it('rejects traversal and OS-absolute path forms', () => {
    expect(isWorkspaceRelativePathInsideRoot('../secret.txt')).toBe(false)
    expect(isWorkspaceRelativePathInsideRoot('src/../../secret.txt')).toBe(false)
    expect(isWorkspaceRelativePathInsideRoot('/workspace/secret.txt')).toBe(false)
    expect(isWorkspaceRelativePathInsideRoot('C:\\workspace\\secret.txt')).toBe(false)
    expect(isWorkspaceRelativePathInsideRoot('C:/workspace/secret.txt')).toBe(false)
    expect(isWorkspaceRelativePathInsideRoot('C:workspace\\secret.txt')).toBe(false)
    expect(isWorkspaceRelativePathInsideRoot('\\\\server\\share\\secret.txt')).toBe(false)
  })
})
