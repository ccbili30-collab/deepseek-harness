import { execFileSync } from 'node:child_process'
import {
  chmodSync, existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, symlinkSync, unlinkSync, writeFileSync,
} from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { execa } from 'execa'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const repoRoot = fileURLToPath(new URL('../../../', import.meta.url))
const dshSourceBin = 'apps/cli/src/bin.ts'

interface Fixture {
  root: string
  source: string
  home: string
  store: string
}

function git(source: string, ...args: string[]): void {
  execFileSync('git', ['-C', source, ...args], { stdio: 'ignore' })
}

function createFixture(): Fixture {
  const root = mkdtempSync(join(tmpdir(), 'dsh-recovery-e2e-'))
  const source = join(root, 'source')
  const home = join(root, 'home')
  const store = join(root, 'recovery-store')
  const profile = join(home, 'profiles', 'web')
  mkdirSync(source, { recursive: true })
  mkdirSync(profile, { recursive: true })
  writeFileSync(join(source, 'app.ts'), 'export const state = "known-good"\n')
  writeFileSync(join(source, 'deleted.ts'), 'export const restored = true\n')
  writeFileSync(join(source, '.credentials.yaml'), 'source-secret: original\n')
  symlinkSync('app.ts', join(source, 'app-link.ts'))
  git(source, 'init')
  git(source, 'config', 'user.email', 'recovery@example.invalid')
  git(source, 'config', 'user.name', 'Recovery Test')
  git(source, 'add', '--all')
  git(source, 'commit', '-m', 'fixture')
  writeFileSync(join(home, 'settings.yaml'), 'theme: system\n')
  writeFileSync(join(home, '.credentials.yaml'), 'api-key: original\n')
  mkdirSync(join(home, 'sessions'), { recursive: true })
  writeFileSync(join(home, 'sessions', 'history.jsonl'), '{"message":"original"}\n')
  mkdirSync(join(home, 'workspaces', 'primary'), { recursive: true })
  writeFileSync(join(home, 'workspaces', 'primary', 'note.md'), 'original workspace\n')
  writeFileSync(join(profile, 'package.json'), '{"dependencies":{"good-plugin":"1.0.0"}}\n')
  writeFileSync(join(profile, 'cordis.patch.yml'), '[]\n')
  return { root, source, home, store }
}

async function runRecovery(args: readonly string[]) {
  return execa(process.execPath, ['--import', 'tsx/esm', dshSourceBin, 'recovery', ...args], {
    cwd: repoRoot,
    reject: false,
    timeout: 30_000,
  })
}

describe('dsh recovery real-process boundary', () => {
  let fixture: Fixture

  beforeEach(() => { fixture = createFixture() })
  afterEach(() => { rmSync(fixture.root, { recursive: true, force: true }) })

  it('creates, lists, and verifies an external checkpoint with policy exclusions', async () => {
    const created = await runRecovery([
      'create',
      '--source', fixture.source,
      '--dsh-home', fixture.home,
      '--store', fixture.store,
      '--label', 'known good',
      '--json',
    ])
    expect(created.exitCode).toBe(0)
    expect(created.stderr).toBe('')
    const result = JSON.parse(created.stdout) as {
      manifest: { id: string; source: { files: Array<{ path: string }> }; dshHome: { files: Array<{ path: string }> } }
    }
    const sourcePaths = result.manifest.source.files.map(file => file.path)
    const homePaths = result.manifest.dshHome.files.map(file => file.path)
    expect(sourcePaths).toEqual(['app-link.ts', 'app.ts', 'deleted.ts'])
    expect(homePaths).toEqual([
      'profiles/web/cordis.patch.yml',
      'profiles/web/package.json',
      'settings.yaml',
    ])
    expect(readFileSync(join(fixture.home, '.credentials.yaml'), 'utf8')).toContain('original')

    const listed = await runRecovery(['list', '--store', fixture.store, '--json'])
    expect(listed.exitCode).toBe(0)
    expect(JSON.parse(listed.stdout)).toMatchObject({ snapshots: [{ id: result.manifest.id, status: 'published' }] })

    const verified = await runRecovery(['verify', result.manifest.id, '--store', fixture.store, '--json'])
    expect(verified.exitCode).toBe(0)
    expect(JSON.parse(verified.stdout)).toMatchObject({ id: result.manifest.id, valid: true, files: 6 })

    writeFileSync(join(fixture.store, result.manifest.id, 'payload', 'source', 'app.ts'), 'tampered payload\n')
    const corrupted = await runRecovery(['verify', result.manifest.id, '--store', fixture.store])
    expect(corrupted.exitCode).toBe(1)
    expect(corrupted.stderr).toContain('payload hash mismatch')
  }, 40_000)

  it('restores source and profile control files while preserving user data and secrets', async () => {
    const created = await runRecovery([
      'create', '--source', fixture.source, '--dsh-home', fixture.home, '--store', fixture.store, '--json',
    ])
    const snapshot = (JSON.parse(created.stdout) as { manifest: { id: string } }).manifest.id
    writeFileSync(join(fixture.source, 'app.ts'), 'export const state = "broken"\n')
    unlinkSync(join(fixture.source, 'deleted.ts'))
    writeFileSync(join(fixture.home, 'profiles', 'web', 'package.json'), '{"dependencies":{"bad-plugin":"9.9.9"}}\n')
    writeFileSync(join(fixture.home, '.credentials.yaml'), 'api-key: newly-rotated\n')
    writeFileSync(join(fixture.home, 'sessions', 'history.jsonl'), '{"message":"new conversation"}\n')
    writeFileSync(join(fixture.home, 'workspaces', 'primary', 'note.md'), 'new workspace content\n')

    const unconfirmed = await runRecovery([
      'restore', snapshot, '--source', fixture.source, '--dsh-home', fixture.home, '--store', fixture.store, '--offline',
    ])
    expect(unconfirmed.exitCode).toBe(1)
    expect(unconfirmed.stderr).toContain(`--confirm ${snapshot}`)
    expect(readFileSync(join(fixture.source, 'app.ts'), 'utf8')).toContain('broken')

    const wrongHome = join(fixture.root, 'wrong-home')
    mkdirSync(wrongHome)
    const mismatched = await runRecovery([
      'restore', snapshot,
      '--source', fixture.source,
      '--dsh-home', wrongHome,
      '--store', fixture.store,
      '--confirm', snapshot,
      '--offline',
    ])
    expect(mismatched.exitCode).toBe(1)
    expect(mismatched.stderr).toContain('DSH_HOME mismatch')
    expect(readFileSync(join(fixture.source, 'app.ts'), 'utf8')).toContain('broken')

    const restored = await runRecovery([
      'restore', snapshot,
      '--source', fixture.source,
      '--dsh-home', fixture.home,
      '--store', fixture.store,
      '--confirm', snapshot,
      '--offline',
      '--json',
    ])
    expect(restored.exitCode).toBe(0)
    expect(restored.stderr).toBe('')
    const report = JSON.parse(restored.stdout) as {
      rescueSnapshot: string
      restoredFiles: number
      dependencyReconciliation: string
    }
    expect(report.restoredFiles).toBe(6)
    expect(report.dependencyReconciliation).toBe('required')
    expect(report.rescueSnapshot).not.toBe(snapshot)
    expect(readFileSync(join(fixture.source, 'app.ts'), 'utf8')).toContain('known-good')
    expect(readFileSync(join(fixture.source, 'deleted.ts'), 'utf8')).toContain('restored = true')
    expect(readFileSync(join(fixture.home, 'profiles', 'web', 'package.json'), 'utf8')).toContain('good-plugin')
    expect(readFileSync(join(fixture.home, '.credentials.yaml'), 'utf8')).toContain('newly-rotated')
    expect(readFileSync(join(fixture.home, 'sessions', 'history.jsonl'), 'utf8')).toContain('new conversation')
    expect(readFileSync(join(fixture.home, 'workspaces', 'primary', 'note.md'), 'utf8')).toContain('new workspace content')

    const rescueVerified = await runRecovery(['verify', report.rescueSnapshot, '--store', fixture.store, '--json'])
    expect(rescueVerified.exitCode).toBe(0)
  }, 40_000)

  it('runs restore outside the Host process and restarts the original invocation', async () => {
    const created = await runRecovery([
      'create', '--source', fixture.source, '--dsh-home', fixture.home, '--store', fixture.store, '--json',
    ])
    const snapshot = (JSON.parse(created.stdout) as { manifest: { id: string } }).manifest.id
    writeFileSync(join(fixture.source, 'app.ts'), 'export const state = "broken"\n')
    const marker = join(fixture.root, 'restarted.txt')
    const restartSpec = Buffer.from(JSON.stringify({
      executable: process.execPath,
      execArgv: ['-e', `require('node:fs').writeFileSync(${JSON.stringify(marker)}, 'restarted')`],
      argv: ['recovery-restart-marker'],
      cwd: fixture.root,
    })).toString('base64url')

    const guarded = await runRecovery([
      'guardian-restore',
      '--snapshot', snapshot,
      '--parent-pid', '2147483647',
      '--restart-spec', restartSpec,
      '--source', fixture.source,
      '--dsh-home', fixture.home,
      '--store', fixture.store,
    ])
    expect(guarded.exitCode).toBe(0)
    expect(guarded.stdout).toContain('Restarting DSH')
    expect(readFileSync(join(fixture.source, 'app.ts'), 'utf8')).toContain('known-good')
    await vi.waitFor(() => { expect(existsSync(marker)).toBe(true) }, { timeout: 5_000 })
    expect(readFileSync(marker, 'utf8')).toBe('restarted')
  }, 40_000)

  it('rejects path traversal and a recovery store nested in a mutable root', async () => {
    const created = await runRecovery([
      'create', '--source', fixture.source, '--dsh-home', fixture.home, '--store', fixture.store, '--json',
    ])
    const snapshot = (JSON.parse(created.stdout) as { manifest: { id: string } }).manifest.id
    const manifestPath = join(fixture.store, snapshot, 'manifest.json')
    const manifest = JSON.parse(readFileSync(manifestPath, 'utf8')) as {
      source: { files: Array<{ path: string }> }
    }
    manifest.source.files[0]!.path = '../outside'
    writeFileSync(manifestPath, `${JSON.stringify(manifest)}\n`)
    const traversing = await runRecovery(['verify', snapshot, '--store', fixture.store])
    expect(traversing.exitCode).toBe(1)
    expect(traversing.stderr).toContain('invalid manifest path')

    const nestedStore = await runRecovery([
      'create', '--source', fixture.source, '--dsh-home', fixture.home, '--store', join(fixture.source, '.recovery'),
    ])
    expect(nestedStore.exitCode).toBe(1)
    expect(nestedStore.stderr).toContain('must be separate directories')
  })

  it.skipIf(process.platform === 'win32')('does not publish a checkpoint when capture fails', async () => {
    const unreadable = join(fixture.source, 'app.ts')
    chmodSync(unreadable, 0o000)
    try {
      const failed = await runRecovery([
        'create', '--source', fixture.source, '--dsh-home', fixture.home, '--store', fixture.store,
      ])
      expect(failed.exitCode).toBe(1)
      expect(readdirSync(fixture.store).filter(entry => !entry.startsWith('.'))).toEqual([])
      expect(readdirSync(fixture.store).filter(entry => entry.startsWith('.tmp-'))).toEqual([])
    } finally {
      chmodSync(unreadable, 0o600)
    }
  })
})
