export function getFileName(filePath: string) {
  return filePath.split(/[\\/]/).at(-1) ?? filePath
}
