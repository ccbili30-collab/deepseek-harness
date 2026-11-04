/** Run card regressions with one private application home per test process. */
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { spawnSync } from 'node:child_process'

const packageRoot = fileURLToPath(new URL('..', import.meta.url))
const tests = [
  'round-trip', 'proposals', 'selection', 'routes', 'map', 'presets',
  'module-presets', 'image-width', 'ai-interface', 'surface', 'resource-closure', 'markdown-save',
]
const requested = process.argv.slice(2)
for (const name of requested) {
  if (!tests.includes(name)) throw new Error(`Unknown card test: ${name}`)
}
const selected = requested.length === 0 ? tests : requested
const root = await mkdtemp(join(tmpdir(), 'noven-cards-tests-'))
try {
  for (const name of selected) {
    const home = join(root, name)
    const result = spawnSync(process.execPath, [`tests/${name}.mjs`], {
      cwd: packageRoot, stdio: 'inherit',
      env: { ...process.env, NOVEN_HOME: home, NOVEN_PROJECTS_ROOT: join(home, 'projects') },
    })
    if (result.error !== undefined) throw result.error
    if (result.status !== 0) {
      process.exitCode = result.status ?? 1
      break
    }
  }
} finally {
  await rm(root, { recursive: true, force: true })
}
