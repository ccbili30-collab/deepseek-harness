/**
 * Free surface project commands: per-file writes replace the whole-envelope
 * rewrite, legacy raw HTML migrates on first write, and diagnostics survive
 * as a project-local ring.
 * Run: node tests/surface.mjs
 * @module noven-cards/tests/surface
 */
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { CardStore, EditConflict } from '../lib/store.js'
import { applyAndCommit } from '../lib/editor.js'
import { decodeSurface, encodeSurface, validateSurface, SURFACE_STATE_LIMIT } from '../lib/formats.js'
import { appendDiagnostics, readDiagnostics, DIAGNOSTICS_CAP } from '../lib/diagnostics.js'
import { customSurface, normalizeCustomModule, saveCustomModule } from '../lib/custom-modules.js'
import { emptyCardDocument } from '../lib/model.js'

let failures = 0
const check = (ok, what) => {
  console.log(`${ok ? 'PASS' : 'FAIL'} ${what}`)
  if (!ok) failures += 1
}

const root = mkdtempSync(join(tmpdir(), 'noven-cards-surface-'))
const CARD = 'card-surface'
const MODULE = 'module-surface'

const sample = encodeSurface({
  version: 1,
  entry: 'index.html',
  files: { 'index.html': '<h1>old</h1>' },
  manifest: { name: 'Demo', description: '', fullscreen: false },
})

try {
  const store = new CardStore(root)
  let ref = ''
  await store.create('测试界面', 'AI', async receive => {
    ref = await receive(new TextEncoder().encode(sample))
    return {
      id: CARD, kind: 'CHARACTER', name: '测试界面',
      modules: [{
        id: MODULE, name: '界面', tags: [], children: [], layout: 'VERTICAL', characterIds: [],
        blocks: [{ kind: 'text', id: 'block-1', content: ref }], widget: { type: 'html' },
      }],
      resources: [], internalCharacters: [], extensions: {},
      appearance: { readingLayout: 'PAGED' },
    }
  })

  const apply = command => applyAndCommit(store, CARD, CARD, command, 'AI')

  const readSurface = async () => {
    const saved = await store.open(CARD)
    const module = saved.document.modules.find(candidate => candidate.id === MODULE)
    const block = module.blocks.find(candidate => candidate.kind === 'text')
    const raw = new TextDecoder().decode(await store.readPayload(CARD, block.content))
    return { surface: decodeSurface(raw), ref: block.content }
  }

  // Per-file write: only the named file changes; the entry stays.
  await apply({ kind: 'surface_write_file', moduleId: MODULE, path: 'style.css', text: 'body{color:red}' })
  let state = await readSurface()
  check(state.surface.files['style.css'] === 'body{color:red}' && state.surface.files['index.html'] === '<h1>old</h1>', 'write adds one file without touching others')
  check(state.ref !== ref, 'write advances the content ref')

  // Concurrency: a stale ref is refused, not silently overwritten.
  let conflicted = false
  try {
    await apply({ kind: 'surface_write_file', moduleId: MODULE, path: 'main.js', text: 'x', expected: ref })
  } catch (error) {
    conflicted = error instanceof EditConflict
  }
  check(conflicted, 'stale content_ref is an EditConflict')

  // Path safety.
  let traversal = false
  try {
    await apply({ kind: 'surface_write_file', moduleId: MODULE, path: '../escape.js', text: 'x' })
  } catch {
    traversal = true
  }
  check(traversal, 'parent traversal is refused')

  // Entry follows deletion and rename.
  await apply({ kind: 'surface_delete_file', moduleId: MODULE, path: 'index.html' })
  state = await readSurface()
  check(state.surface.entry === 'style.css' && state.surface.files['index.html'] === undefined, 'deleting the entry falls back to the first remaining file')
  await apply({ kind: 'surface_rename_file', moduleId: MODULE, from: 'style.css', to: 'theme.css' })
  state = await readSurface()
  check(state.surface.entry === 'theme.css' && state.surface.files['theme.css'] === 'body{color:red}', 'renaming the entry moves the entry')

  let lastFile = false
  try {
    await apply({ kind: 'surface_delete_file', moduleId: MODULE, path: 'theme.css' })
  } catch {
    lastFile = true
  }
  check(lastFile, 'the last file cannot be deleted')

  // Manifest patches keep unspecified fields.
  await apply({ kind: 'surface_set_manifest', moduleId: MODULE, manifest: { chrome: 'game', name: '新名字' } })
  state = await readSurface()
  check(state.surface.manifest.name === '新名字' && state.surface.manifest.chrome === 'game' && state.surface.manifest.fullscreen === false, 'manifest patch keeps untouched fields')

  // Durable runtime state is versioned and preserved across source edits.
  const sceneState = {
    version: 1, kind: 'scene3d',
    scene: { objects: [{ id: 'cube-1', kind: 'box' }], lights: [], background: '#ffffff', grid: true },
  }
  await apply({ kind: 'surface_set_state', moduleId: MODULE, state: sceneState, expectedVersion: 0 })
  state = await readSurface()
  check(state.surface.state?.kind === 'scene3d' && state.surface.stateVersion === 1, 'state is saved with its next revision')
  check(validateSurface(state.surface).state_bytes > 0, 'state bytes are reported by validation')
  await apply({ kind: 'surface_write_file', moduleId: MODULE, path: 'theme.css', text: 'body{color:blue}' })
  state = await readSurface()
  check(state.surface.stateVersion === 1 && state.surface.state?.kind === 'scene3d', 'source edits preserve the state')
  let staleState = false
  try {
    await apply({ kind: 'surface_set_state', moduleId: MODULE, state: sceneState, expectedVersion: 0 })
  } catch (error) {
    staleState = error instanceof EditConflict
  }
  check(staleState, 'stale state revision is an EditConflict')
  let oversizedState = false
  try {
    await apply({ kind: 'surface_set_state', moduleId: MODULE, state: 'x'.repeat(SURFACE_STATE_LIMIT + 1), expectedVersion: 1 })
  } catch {
    oversizedState = true
  }
  check(oversizedState, 'oversized state is refused')

  // Legacy raw HTML becomes a project on the first file write.
  const legacyDoc = await store.create('旧界面', 'AI', async receive => {
    const legacyRef = await receive(new TextEncoder().encode('<p>legacy</p>'))
    return {
      id: 'card-legacy', kind: 'CHARACTER', name: '旧界面',
      modules: [{
        id: 'module-legacy', name: '旧界面', tags: [], children: [], layout: 'VERTICAL', characterIds: [],
        blocks: [{ kind: 'text', id: 'block-legacy', content: legacyRef }], widget: { type: 'html' },
      }],
      resources: [], internalCharacters: [], extensions: {},
      appearance: { readingLayout: 'PAGED' },
    }
  })
  check(legacyDoc.revision === 1, 'legacy card created')
  await applyAndCommit(store, 'card-legacy', 'card-legacy', { kind: 'surface_write_file', moduleId: 'module-legacy', path: 'index.html', text: '<p>new</p>' }, 'AI')
  const legacySaved = await store.open('card-legacy')
  const legacyModule = legacySaved.document.modules.find(candidate => candidate.id === 'module-legacy')
  const legacyBlock = legacyModule.blocks.find(candidate => candidate.kind === 'text')
  const legacyRaw = new TextDecoder().decode(await store.readPayload('card-legacy', legacyBlock.content))
  const legacySurface = decodeSurface(legacyRaw)
  check(legacySurface?.entry === 'index.html' && legacySurface.files['index.html'] === '<p>new</p>', 'raw HTML migrates into a surface project')

  // Static validation.
  const bad = validateSurface({
    version: 1, entry: 'missing.html',
    files: { 'index.html': "import './gone.js'", 'a/../../b.js': 'x' },
    manifest: { name: 'Bad', description: '', fullscreen: false },
  })
  check(bad.ok === false && bad.errors.some(error => error.includes('entry')), 'validation reports a missing entry')
  check(bad.errors.some(error => error.includes('..')), 'validation rejects traversal paths')
  const unresolved = validateSurface({
    version: 1, entry: 'index.html',
    files: { 'index.html': '<script src="./main.js"></script>', 'main.js': "import './gone.js'" },
    manifest: { name: 'Imp', description: '', fullscreen: false },
  })
  check(unresolved.ok === true && unresolved.unresolved.length === 1, 'unresolved imports are warnings, not hard errors')

  // Diagnostics ring.
  await appendDiagnostics(root, CARD, MODULE, [{ level: 'error', text: 'boom', at: 1 }])
  await appendDiagnostics(root, CARD, MODULE, [{ level: 'log', text: 'ok' }])
  const report = await readDiagnostics(root, CARD, MODULE)
  check(report?.entries.length === 2 && report.entries[0].level === 'error', 'diagnostics merge and keep order')
  const many = Array.from({ length: DIAGNOSTICS_CAP + 20 }, (_, index) => ({ level: 'log', text: `line ${String(index)}` }))
  await appendDiagnostics(root, CARD, MODULE, many)
  const capped = await readDiagnostics(root, CARD, MODULE)
  check(capped?.entries.length === DIAGNOSTICS_CAP && capped.dropped >= 20, 'diagnostics ring caps old entries')

  // A reusable user module can be a whole surface project.
  const surfaceDef = normalizeCustomModule({
    name: '界面模板', shape: 'surface',
    surface: { entry: 'index.html', files: { 'index.html': '<p>tpl</p>' }, manifest: { name: 'T' } },
  })
  check(typeof surfaceDef !== 'string' && surfaceDef.surface?.entry === 'index.html', 'surface user module definition accepted')
  if (typeof surfaceDef !== 'string') {
    check(decodeSurface(customSurface(surfaceDef))?.files['index.html'] === '<p>tpl</p>', 'surface user module encodes to a payload')
  }
  check(typeof normalizeCustomModule({ name: '坏模板', shape: 'surface' }) === 'string', 'surface user module without files is refused')

  // A8: save the surface definition, then instantiate it on a different card.
  const savedDefinition = typeof surfaceDef === 'string' ? surfaceDef : await saveCustomModule(root, surfaceDef)
  check(typeof savedDefinition !== 'string', 'surface definition saved to the user module library')
  if (typeof savedDefinition !== 'string') {
    const second = await store.create('实例卡', 'AI', async () => emptyCardDocument('CHARACTER', '实例卡'))
    await applyAndCommit(store, second.cardId, second.cardId, {
      kind: 'add_module_custom', name: '界面模板', definition: savedDefinition,
    }, 'AI')
    const after = await store.open(second.cardId)
    const module = after?.document.modules.find(candidate => candidate.name === '界面模板')
    const block = module?.blocks.find(candidate => candidate.kind === 'text')
    const raw = block === undefined ? '' : new TextDecoder().decode(await store.readPayload(second.cardId, block.content))
    const instanced = decodeSurface(raw)
    check(module?.widget?.type === 'html' && instanced?.files['index.html'] === '<p>tpl</p>', 'surface user module instantiates on a second card')
  }
} finally {
  rmSync(root, { recursive: true, force: true })
}

console.log(failures === 0 ? 'ALL PASS' : `${failures} FAILURES`)
process.exit(failures === 0 ? 0 : 1)
