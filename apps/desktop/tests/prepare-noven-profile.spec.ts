import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { packNovenPackages, verifyNovenBuildScripts } from '../scripts/prepare-noven-profile.ts'
import { NOVEN_PLUGIN_PACKAGES } from '../scripts/noven-profile.ts'
import type { runConcurrent } from '../../../scripts/release/process.ts'

const roots: string[] = []
function temporaryRoot(): string {
  const root = mkdtempSync(join(tmpdir(), 'noven-build-gate-'))
  roots.push(root)
  return root
}

afterEach(() => {
  for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true })
})

describe('Noven build-before-pack gate', () => {
  it('builds the complete workspace before issuing any pack command', async () => {
    const root = temporaryRoot()
    const calls: { command: string; args: readonly string[] }[] = []
    const run: typeof runConcurrent = async (command, args) => { calls.push({ command, args }) }

    await packNovenPackages(join(root, 'packed'), run)

    expect(calls).toHaveLength(NOVEN_PLUGIN_PACKAGES.length + 1)
    expect(calls[0]?.args).toEqual(expect.arrayContaining(['-r', '--if-present', 'run', 'build']))
    for (const call of calls.slice(1)) expect(call.args).toContain('pack')
  })

  it('rejects a selected package without a build script before packing', () => {
    const root = temporaryRoot()
    const packageRoot = join(root, 'plugins-noven', NOVEN_PLUGIN_PACKAGES[0]!)
    mkdirSync(packageRoot, { recursive: true })
    writeFileSync(join(packageRoot, 'package.json'), '{"scripts":{}}\n')

    expect(() => verifyNovenBuildScripts(root)).toThrow('refusing to pack stale lib output')
  })
})
