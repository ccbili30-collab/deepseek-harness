/**
 * Module-library presets must land configured modules, not empty widget shells:
 * fields, default view, empty profile item, diary layout, and map payload.
 * Run after build: node tests/module-presets.mjs
 */
import { MODULE_PRESETS, collectionPreset, isModulePreset, mapPreset, timelinePreset } from '../lib/module-presets.js'
import { decodeCollection, decodeMap, decodeScene, decodeSurface, decodeTimeline, encodeScene, encodeTimeline, validateSurface } from '../lib/formats.js'
import { COLLECTION_CONTRACTS, contractFor } from '../lib/collection-contracts.js'

let failed = 0
const check = (ok, label) => {
  console.log(`${ok ? 'PASS' : 'FAIL'} ${label}`)
  if (!ok) failed += 1
}

for (const id of Object.keys(MODULE_PRESETS)) check(isModulePreset(id), `preset ${id} registered`)
check(!isModulePreset('nope'), 'unknown preset rejected')

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

check(MODULE_PRESETS.worldProfile?.widget === 'collection' && MODULE_PRESETS.worldProfile.view === 'profile', 'worldProfile: profile module registered')
const worldProfile = decodeCollection(collectionPreset(MODULE_PRESETS.worldProfile))
check(worldProfile.fields.some(field => field.name === '世界类型'), 'worldProfile: world type field')
check(!worldProfile.fields.some(field => ['年龄', '阵营', '出身', '性格关键词'].includes(field.name)), 'worldProfile: no character-only fields')
check(worldProfile.items.length === 1 && worldProfile.items[0].name === '', 'worldProfile: one empty editable item')
for (const [id, field, view] of [['culture', '场合', 'cards'], ['abilities', '效果', 'list'], ['equipment', '效果', 'cards']]) {
  const data = decodeCollection(collectionPreset(MODULE_PRESETS[id]))
  check(data.fields.some(f => f.name === field) && data.view === view, `${id}: configured fields/view`)
}
check(MODULE_PRESETS.history?.widget === 'timeline' && MODULE_PRESETS.history.unit === '年', 'history: yearly timeline')
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
const forms = decodeCollection(collectionPreset(MODULE_PRESETS.forms))
check(forms.presentation?.contract === 'multiForm', 'forms: multiForm presentation')
check(forms.form?.labels?.primary === 'i18n:coll.primary', 'forms: primary label configured')
check(forms.form?.labels?.add === 'i18n:coll.gallery.add', 'forms: add label configured')
check(['身份', '年龄', '阵营', '出身'].every(name => forms.fields.some(field => field.name === name)), 'forms: override fields registered')
const graph = decodeCollection(collectionPreset(MODULE_PRESETS.graph))
check(graph.view === 'graph', 'graph: view = graph')
check(['从', '到', '关系'].every(name => graph.fields.some(field => field.name === name)), 'graph: directed fields')

const gallery = decodeCollection(collectionPreset(MODULE_PRESETS.gallery))
check(gallery.view === 'cards' && gallery.cardAspect === 'portrait', 'gallery: cards, portrait')
check(gallery.fields.some(field => field.type === 'image') === true, 'gallery: image field')

const factions = decodeCollection(collectionPreset(MODULE_PRESETS.factions))
check(factions.view === 'cards' && factions.cardAspect === 'square', 'factions: cards, square')
check(factions.fields.some(field => field.type === 'place') === true, 'factions: place field')
const places = decodeCollection(collectionPreset(MODULE_PRESETS.places))
check(places.view === 'cards' && places.cardAspect === 'landscape', 'places: cards, landscape')
const races = decodeCollection(collectionPreset(MODULE_PRESETS.races))
check(races.view === 'cards' && races.cardAspect === 'portrait', 'races: cards, portrait')

const quotes = decodeCollection(collectionPreset(MODULE_PRESETS.quotes))
check(quotes.view === 'cards' && quotes.items.length === 0, 'quotes: empty list, name is the quote')

check(MODULE_PRESETS.rules?.widget === undefined && typeof MODULE_PRESETS.rules?.sample === 'string', 'rules: document module')

const diary = decodeTimeline(timelinePreset(MODULE_PRESETS.diary))
check(diary.view === 'diary' && diary.calendar.unit === '岁', 'diary: vertical diary in 岁')

const history = decodeTimeline(timelinePreset(MODULE_PRESETS.timeline))
check(history.view !== 'diary' && history.calendar.unit === '年', 'timeline: horizontal history in 年')

const map = decodeMap(mapPreset())
check(map.version === 1 && map.markers.length === 0 && map.objects.length === 0, 'map: empty editable payload')

const placedEvent = history.events[0]
const withPlace = { ...history, events: [{ ...placedEvent, place: { mapModuleId: 'map-1', markerId: 'mark-1', label: '北境' } }, ...history.events.slice(1)] }
const placed = decodeTimeline(encodeTimeline(withPlace))
check(placed.events[0]?.place?.markerId === 'mark-1' && placed.events[0]?.place?.label === '北境', 'timeline: event place round-trips')

const ranged = decodeTimeline(encodeTimeline({ ...history, window: { from: -120, to: 0 } }))
check(ranged.window?.from === -120 && ranged.window?.to === 0, 'timeline: window round-trips')

console.log(failed === 0 ? 'ALL PASS' : `${failed} FAILURES`)
process.exit(failed === 0 ? 0 : 1)
