import { execFileSync } from 'node:child_process'
import { mkdirSync, mkdtempSync, readdirSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { execa } from 'execa'
import { describe, expect, it } from 'vitest'

const repoRoot = fileURLToPath(new URL('../../../', import.meta.url))
const checkpointPattern = /\d{8}T\d{6}\.\d{3}Z-[a-f0-9]{8}/g
const timestampPattern = /\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z/g

function git(source: string, ...args: string[]): void {
  execFileSync('git', ['-C', source, ...args], { stdio: 'ignore' })
}

async function run(args: readonly string[]): Promise<string> {
  const result = await execa(process.execPath, ['--import', 'tsx/esm', 'apps/cli/src/bin.ts', 'recovery', ...args], {
    cwd: repoRoot,
    reject: false,
    timeout: 30_000,
  })
  expect(result.exitCode).toBe(0)
  expect(result.stderr).toBe('')
  return result.stdout
    .replace(checkpointPattern, '{{checkpoint}}')
    .replace(timestampPattern, '{{any-timestamp}}')
}

describe('dsh recovery assembled CLI snapshot', () => {
  it('presents the complete manual checkpoint and restore path', async () => {
    const root = mkdtempSync(join(tmpdir(), 'dsh-recovery-snapshot-'))
    const source = join(root, 'source')
    const home = join(root, 'home')
    const store = join(root, 'store')
    const profile = join(home, 'profiles', 'web')
    try {
      mkdirSync(source, { recursive: true })
      mkdirSync(profile, { recursive: true })
      writeFileSync(join(source, 'app.ts'), 'known good\n')
      git(source, 'init')
      git(source, 'config', 'user.email', 'snapshot@example.invalid')
      git(source, 'config', 'user.name', 'Recovery Snapshot')
      git(source, 'add', '--all')
      git(source, 'commit', '-m', 'known good')
      writeFileSync(join(home, 'settings.yaml'), 'theme: system\n')
      writeFileSync(join(profile, 'package.json'), '{"dependencies":{}}\n')

      const create = await run([
        'create', '--source', source, '--dsh-home', home, '--store', store, '--label', 'Before plugin install',
      ])
      const id = readdirSync(store).find(entry => checkpointPattern.test(entry))
      if (id === undefined) throw new Error('recovery checkpoint was not published')
      checkpointPattern.lastIndex = 0
      const list = await run(['list', '--store', store])
      const verify = await run(['verify', id, '--store', store])
      writeFileSync(join(source, 'app.ts'), 'broken edit\n')
      const restore = await run([
        'restore', id,
        '--source', source,
        '--dsh-home', home,
        '--store', store,
        '--confirm', id,
        '--offline',
      ])

      expect({ create, list, verify, restore }).toMatchInlineSnapshot(`
        {
          "create": "Created recovery checkpoint {{checkpoint}}
        Source files: 1
        DSH control files: 2
        Payload bytes: 45",
          "list": "{{checkpoint}}  {{any-timestamp}}  Before plugin install",
          "restore": "Restored recovery checkpoint {{checkpoint}}.
        Rescue checkpoint: {{checkpoint}}
        Restored files: 3
        Profile dependency reconciliation: required",
          "verify": "Verified recovery checkpoint {{checkpoint}}: 3 files, 45 bytes.",
        }
      `)
    } finally {
      rmSync(root, { recursive: true, force: true })
    }
  }, 60_000)
})
