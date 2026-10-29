import { chmodSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, expect, it } from 'vitest'
import { shouldReuseElectron } from '../scripts/prepare-runtime.ts'

const roots: string[] = []
function fakeElectron(version: string): string {
  const root = mkdtempSync(join(tmpdir(), 'electron-reuse-'))
  roots.push(root)
  const executable = join(root, 'electron')
  writeFileSync(executable, `#!/bin/sh\nif [ "$1" = "-p" ] && [ "$2" = "process.versions.electron" ]; then printf '${version}' ; fi\n`, { mode: 0o755 })
  chmodSync(executable, 0o755)
  return executable
}

afterEach(() => {
  for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true })
})

it.skipIf(process.platform === 'win32')('reuses only an exact Electron version match', () => {
  const executable = fakeElectron('44.0.0')
  expect(shouldReuseElectron(executable, '44.0.0')).toBe(true)
  expect(shouldReuseElectron(executable, '43.0.0')).toBe(false)
  expect(shouldReuseElectron(join(executable, 'missing'), '44.0.0')).toBe(false)
})
