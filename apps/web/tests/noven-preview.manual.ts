/** Manual-only assembled Noven preview; run through `test:web:manual`. */
import { copyFile, mkdtemp, mkdir, readFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { afterAll, beforeAll, describe, it } from 'vitest'
import { createScaffoldWorkspace, launchWebScaffold, seedSession, type WebScaffold } from './scaffold.ts'

const root = await mkdtemp(join(tmpdir(), 'noven-reform-preview-'))
const PLUGIN_ROOT = fileURLToPath(new URL('../../../plugins-noven', import.meta.url))
const PRODUCT_OVERLAY = fileURLToPath(new URL('../../desktop/noven/profile/cordis.patch.yml', import.meta.url))
const PREVIEW_OVERLAY = fileURLToPath(new URL('./noven-preview.overlay.yml', import.meta.url))
const SEED = fileURLToPath(new URL('../../../snapshots/web/navigation-panes/session.v3.jsonl', import.meta.url))
const ASSETS = fileURLToPath(new URL('../../../plugins-noven/noven-shell/assets', import.meta.url))
const SESSION_ID = 'noven-reform-preview'
const bundles = [
  'noven-study', 'noven-brand', 'noven-shell', 'noven-dock', 'noven-image',
  'noven-workbench', 'noven-draw-comic', 'noven-docs', 'noven-cards', 'noven-library', 'noven-skills', 'noven-explore',
]
let scaffold: WebScaffold
const ISOLATED_ENV = ['NOVEN_HOME', 'NOVEN_PROJECTS_ROOT', 'NOVEN_CHANNEL'] as const
const originalEnvironment = Object.fromEntries(ISOLATED_ENV.map(key => [key, process.env[key]]))
let closing: Promise<void> | undefined
const onSignal = (): void => { void close().then(() => { process.exit(0) }) }
async function close(): Promise<void> {
  closing ??= (async () => {
    process.off('SIGINT', onSignal)
    process.off('SIGTERM', onSignal)
    const failures: unknown[] = []
    await scaffold?.close().catch((error: unknown) => failures.push(error))
    await rm(root, { recursive: true, force: true }).catch((error: unknown) => failures.push(error))
    for (const key of ISOLATED_ENV) {
      const previous = originalEnvironment[key]
      if (previous === undefined) Reflect.deleteProperty(process.env, key)
      else process.env[key] = previous
    }
    if (failures.length === 1) throw failures[0]
    if (failures.length > 1) throw new AggregateError(failures, 'Noven preview cleanup failed')
  })()
  return closing
}
process.on('SIGINT', onSignal)
process.on('SIGTERM', onSignal)

beforeAll(async () => {
  process.env.NOVEN_HOME = join(root, 'library')
  process.env.NOVEN_PROJECTS_ROOT = join(root, 'projects')
  process.env.NOVEN_CHANNEL = 'test'
  await mkdir(process.env.NOVEN_HOME, { recursive: true })
  await mkdir(process.env.NOVEN_PROJECTS_ROOT, { recursive: true })
  scaffold = await launchWebScaffold({
    harnessHome: join(root, 'harness'),
    profile: { packages: bundles.map(name => ({ dir: join(PLUGIN_ROOT, name), enabled: true })) },
    agentPresets: { default: 'create' },
    extraInstallAnchors: ['noven-fmg', 'noven-ledger'].map(name => join(PLUGIN_ROOT, name, 'package.json')),
    extraOverlayPath: [PRODUCT_OVERLAY, PREVIEW_OVERLAY],
  })
  const fixture = await readFile(SEED, 'utf8')
  await seedSession(scaffold, fixture, SESSION_ID, undefined, { createdAt: Date.UTC(2026, 0, 1) })
  await createScaffoldWorkspace(scaffold, 'Noven验收工作区')
  const appearanceDir = join(scaffold.workspaceCwd, '外观')
  await mkdir(appearanceDir, { recursive: true })
  for (const [source, target] of [
    ['cover-haibian.webp', 'shell.webp'], ['cover-mori.webp', 'canvas.webp'],
    ['cover-yueban.webp', 'conversation.webp'], ['avatar-yunhe.webp', 'avatar.webp'],
  ] as const) await copyFile(join(ASSETS, source), join(appearanceDir, target))
  const appearance = async (body: Record<string, unknown>): Promise<void> => {
    const response = await scaffold.hostFetch(`/api/noven-appearance?session=${encodeURIComponent(SESSION_ID)}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    })
    if (!response.ok) throw new Error(`preview appearance failed: ${await response.text()}`)
  }
  await appearance({ action: 'visual', view: 'dark', surface: 'frosted', foreground: 'system', backgroundVisibility: 0.75 })
  await appearance({ action: 'shell', background: { kind: 'image', imagePath: '外观/shell.webp' } })
  await appearance({ action: 'shared', background: { kind: 'image', imagePath: '外观/conversation.webp' } })
  await appearance({ action: 'canvas', scope: 'workspace', background: { kind: 'shared' } })
  await appearance({
    action: 'conversation', scope: 'workspace',
    background: { kind: 'shared' },
    avatar: { kind: 'image', imagePath: '外观/avatar.webp' },
  })
  console.log(`NOVEN_PREVIEW_URL=${scaffold.authenticatedUrl}`)
  console.log(`NOVEN_PREVIEW_ROOT=${root}`)
}, 180_000)

afterAll(async () => { await close() })

describe('Noven isolated acceptance preview', () => {
  it('keeps the assembled Web instance available', async () => {
    await new Promise(() => {})
  }, 86_400_000)
})
