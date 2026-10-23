/**
 * Module-library presets must land configured modules, not empty widget shells:
 * fields, default view, empty profile item, diary layout, and map payload.
 * Run after build: node tests/module-presets.mjs
 */
import { MODULE_PRESETS, collectionPreset, isModulePreset, timelinePreset } from '../lib/module-presets.js'
import { decodeCollection, decodeScene, decodeSurface, decodeTimeline, encodeScene, encodeTimeline, validateSurface } from '../lib/formats.js'
import { COLLECTION_CONTRACTS, contractFor } from '../lib/collection-contracts.js'

let failed = 0
const check = (ok, label) => {
  console.log(`${ok ? 'PASS' : 'FAIL'} ${label}`)
  if (!ok) failed += 1
}

for (const id of Object.keys(MODULE_PRESETS)) check(isModulePreset(id), `preset ${id} registered`)
check(!isModulePreset('nope'), 'unknown preset rejected')
for (const id of ['worldProfile', 'culture', 'rules', 'history', 'abilities', 'equipment', 'diary', 'gallery', 'forms', 'quotes', 'factions', 'places', 'races']) {
  check(!isModulePreset(id), `domain preset ${id} retired`)
}

check(Object.keys(COLLECTION_CONTRACTS).length >= 13, `window contracts registered（${Object.keys(COLLECTION_CONTRACTS).length}）`)
check(COLLECTION_CONTRACTS.abilities.core.includes('代价') === false, 'abilities: cost is optional, not core')
check(COLLECTION_CONTRACTS.culture.core.includes('日历') === false, 'culture: calendar is optional, not core')
check(COLLECTION_CONTRACTS.rules.core.includes('代价') === false, 'rules: cost is optional, not core')
check(COLLECTION_CONTRACTS.geography.links.includes('map'), 'geography: map link declared')
check(COLLECTION_CONTRACTS.abilities.assets.some(asset => asset.export === '112x112'), 'abilities: icon export size declared')
check(contractFor('地理位置') === undefined && contractFor('地理')?.contract === 'geography', 'contract resolves by module name')
const profile = decodeCollection(collectionPreset(MODULE_PRESETS.profile))
check(profile.presentation?.contract === 'profile', 'profile: presentation shipped in data')
check(profile.view === 'profile', 'profile: view = profile')
check(profile.fields.some(field => field.name === '性格关键词' && field.type === 'chips') === true, 'profile: chips field')
check(profile.fields.some(field => field.name === '档案' && field.type === 'longtext') === true, 'profile: archive field')
check(profile.items.length === 1 && profile.items[0].name === '', 'profile: one empty editable item')

check(MODULE_PRESETS.surface?.widget === 'html' && typeof MODULE_PRESETS.surface?.sample === 'string', 'surface: free runtime registered')
const surfaceProject = decodeSurface(MODULE_PRESETS.surface?.sample)
check(surfaceProject?.entry === 'index.html' && Object.keys(surfaceProject.files).length === 3, 'surface: entry + multi-file project')
check(surfaceProject?.manifest.fullscreen === false && (surfaceProject?.manifest.cover ?? '').startsWith('data:image/svg+xml'), 'surface: manifest cover/description/fullscreen')
const free3dProject = decodeSurface(MODULE_PRESETS.free3d?.sample)
check(free3dProject?.entry === 'index.html' && Object.keys(free3dProject.files).length === 3, 'free3d: entry + multi-file project')
check(free3dProject?.files['main.js']?.includes('NOVEN_THREE') === true, 'free3d: local three.js runtime registered')
check(free3dProject?.manifest.fullscreen === false && free3dProject.manifest.chrome === 'game' && (free3dProject?.manifest.cover ?? '').length > 20, 'free3d: inline by default + game chrome + cover')
check(MODULE_PRESETS.free3d?.sample?.includes('WebGLRenderer') === true, 'free3d: uses WebGLRenderer')
check(!/玄天大陆|北境|东海|南疆|沈青梧/.test(MODULE_PRESETS.scene.sample ?? '' + JSON.stringify(MODULE_PRESETS.scene.scene)), 'scene: no test world names')
for (const id of ['surface.dashboard', 'surface.gallery', 'free3d.viewer']) check(isModulePreset(id), `template ${id} registered`)
const viewer = decodeSurface(MODULE_PRESETS['free3d.viewer'].sample)
check(viewer?.files['main.js']?.includes('OrbitControls') === true && viewer.manifest.chrome === 'game', 'viewer template uses OrbitControls + game chrome')
const editor = decodeSurface(MODULE_PRESETS['free3d.editor'].sample)
check(editor?.entry === 'index.html' && Object.keys(editor.files).length === 3, 'editor template: entry + multi-file project')
check(editor?.files['main.js']?.includes("import('NOVEN_THREE')") === true, 'editor template: shared three runtime')
check(editor?.files['main.js']?.includes('TransformControls') === true, 'editor template: transform gizmo from the runtime')
check(editor?.files['main.js']?.includes('surface_set_state') === true, 'editor template: saves scene state to the card')
check(editor?.manifest.fullscreen === true && editor.manifest.chrome === 'none', 'editor template: fullscreen, no game chrome')
check(editor === undefined ? false : validateSurface(editor).ok, 'editor template: surface validates')
check(MODULE_PRESETS.html?.widget === 'html' && typeof MODULE_PRESETS.html?.sample === 'string', 'html: runtime sample registered')
check(MODULE_PRESETS.scene?.widget === 'scene' && (MODULE_PRESETS.scene?.scene?.objects.length ?? 0) > 0, 'scene: sample scene registered')
const sceneRound = decodeScene(encodeScene(MODULE_PRESETS.scene.scene))
check(sceneRound.objects.length === MODULE_PRESETS.scene.scene.objects.length && sceneRound.camera.zoom > 0, 'scene: round-trips')
const graph = decodeCollection(collectionPreset(MODULE_PRESETS.graph))
check(graph.view === 'graph', 'graph: view = graph')
check(['从', '到', '关系'].every(name => graph.fields.some(field => field.name === name)), 'graph: directed fields')

const timeline = decodeTimeline(timelinePreset(MODULE_PRESETS.timeline))
check(timeline.view !== 'diary' && timeline.calendar.unit === '年', 'timeline: horizontal history in 年')

check(MODULE_PRESETS.map?.widget === 'map', 'map: FMG map module registered')

const placedEvent = timeline.events[0]
const withPlace = { ...timeline, events: [{ ...placedEvent, place: { mapModuleId: 'map-1', markerId: 'mark-1', label: '北境' } }, ...timeline.events.slice(1)] }
const placed = decodeTimeline(encodeTimeline(withPlace))
check(placed.events[0]?.place?.markerId === 'mark-1' && placed.events[0]?.place?.label === '北境', 'timeline: event place round-trips')

const ranged = decodeTimeline(encodeTimeline({ ...timeline, window: { from: -120, to: 0 } }))
check(ranged.window?.from === -120 && ranged.window?.to === 0, 'timeline: window round-trips')

console.log(failed === 0 ? 'ALL PASS' : `${failed} FAILURES`)
process.exit(failed === 0 ? 0 : 1)
