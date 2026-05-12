import { readdirSync, readFileSync } from 'node:fs'
import process from 'node:process'
import { fileURLToPath, URL } from 'node:url'
import { join } from 'node:path'

const componentStylesDir = fileURLToPath(new URL('../src/renderer/styles/components/', import.meta.url))

const checks = [
  {
    name: 'raw color values',
    test: (line) => /#[0-9a-fA-F]{3,8}\b|\b(?:oklch|rgb|rgba|hsl|hsla)\(/.test(line),
  },
  {
    name: 'raw border/radius values',
    test: (line) => /(?:border(?:-(?:top|right|bottom|left))?:\s*)1px\b|border-radius:\s*(?:999px|\d+(?:\.\d+)?(?:px|rem))\b|outline:\s*2px\b/.test(line),
  },
  {
    name: 'raw spacing values',
    test: (line) => /(?:gap|padding(?:-[a-z-]+)?|margin(?:-[a-z-]+)?|top|right|bottom|left|scroll-padding-block):\s*[^;]*\b\d+(?:\.\d+)?px\b/.test(line),
  },
  {
    name: 'raw typography values',
    test: (line) => /(?:font-size|font-weight|line-height|letter-spacing):/.test(line) && !line.includes('var('),
  },
  {
    name: 'raw shadow/motion values',
    test: (line) => {
      const trimmed = line.trim()

      return (
        /^(?:box-shadow|transition|animation|transform):/.test(trimmed) &&
        !trimmed.includes('var(') &&
        trimmed !== 'transition:' &&
        trimmed !== 'transform: none;' &&
        trimmed !== 'box-shadow: none;'
      )
    },
  },
]

function listCssFiles(directory) {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const path = join(directory, entry.name)

    if (entry.isDirectory()) {
      return listCssFiles(path)
    }

    return entry.isFile() && entry.name.endsWith('.css') ? [path] : []
  })
}

const failures = []

for (const filePath of listCssFiles(componentStylesDir)) {
  const lines = readFileSync(filePath, 'utf8').split('\n')

  lines.forEach((line, index) => {
    checks.forEach((check) => {
      if (check.test(line)) {
        failures.push(`${filePath}:${index + 1} ${check.name}: ${line.trim()}`)
      }
    })
  })
}

if (failures.length) {
  process.stderr.write('Component CSS token audit failed:\n')
  failures.forEach((failure) => process.stderr.write(`- ${failure}\n`))
  process.exit(1)
}

process.stdout.write('Component CSS token audit passed.\n')
