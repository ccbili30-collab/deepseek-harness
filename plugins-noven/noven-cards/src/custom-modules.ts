/**
 * Declarative user module library: AI (or a human) writes a schema/view/label
 * definition once, then the module library adds it to any card without new
 * renderer code. Stored per project under `.noven/modules/`.
 * @module noven-cards/custom-modules
 */
import { mkdir, readFile, readdir, unlink, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { mintId } from './model.ts'
import {
  encodeCollection, encodeMap, encodeSurface, encodeTimeline, normalizeSurfacePath,
  type CollectionData, type CollectionFieldType, type CollectionPresentation, type CollectionView, type SurfaceData, type TimelineData,
} from './formats.ts'

export type CustomModuleShape = 'collection' | 'timeline' | 'map' | 'doc' | 'surface'

export interface CustomModuleField {
  readonly name: string
  readonly type: CollectionFieldType
}

/** One saved user module definition. `labels` are literal text (AI can choose the user-facing words). */
export interface CustomModuleDefinition {
  readonly id: string
  readonly name: string
  readonly shape: CustomModuleShape
  readonly summary?: string
  readonly fields?: readonly CustomModuleField[]
  readonly view?: CollectionView
  readonly cardAspect?: 'portrait' | 'landscape' | 'square'
  readonly labels?: { readonly primary?: string, readonly add?: string, readonly empty?: string }
  readonly unit?: string
  readonly timelineView?: 'diary' | 'horizontal'
  readonly sample?: string
  /** Free surface project (shape 'surface'): reusable HTML/CSS/JS or three.js work. */
  readonly surface?: SurfaceData
  /** Optional window contract; generated from fields when AI omits it. */
  readonly presentation?: CollectionPresentation
  readonly createdAt: string
}

const FIELD_TYPES = new Set<CollectionFieldType>(['text', 'longtext', 'chips', 'date', 'person', 'image', 'place', 'link', 'number', 'time'])
const VIEWS = new Set<CollectionView>(['list', 'cards', 'form', 'timeline', 'map', 'profile', 'graph'])
const SHAPES = new Set<CustomModuleShape>(['collection', 'timeline', 'map', 'doc', 'surface'])

const modulesDir = (root: string): string => join(root, '.noven', 'modules')

/** Validate a reusable free surface: safe paths, an existing entry, a manifest. */
function normalizeSurface(raw: unknown): SurfaceData | undefined {
  if (typeof raw !== 'object' || raw === null) return undefined
  const source = raw as Record<string, unknown>
  if (typeof source.entry !== 'string' || typeof source.files !== 'object' || source.files === null) return undefined
  const files: Record<string, string> = {}
  for (const [path, content] of Object.entries(source.files as Record<string, unknown>)) {
    if (typeof content !== 'string') continue
    const normalized = normalizeSurfacePath(path)
    if (typeof normalized === 'string') files[normalized] = content
  }
  if (Object.keys(files).length === 0) return undefined
  const entry = normalizeSurfacePath(source.entry)
  if (typeof entry !== 'string' || files[entry] === undefined) return undefined
  const manifest = typeof source.manifest === 'object' && source.manifest !== null ? source.manifest as Record<string, unknown> : {}
  return {
    version: 1,
    entry,
    files,
    manifest: {
      name: typeof manifest.name === 'string' && manifest.name !== '' ? manifest.name : 'Free surface',
      description: typeof manifest.description === 'string' ? manifest.description : '',
      ...(typeof manifest.cover === 'string' && manifest.cover !== '' ? { cover: manifest.cover } : {}),
      fullscreen: manifest.fullscreen === true,
      ...(manifest.chrome === 'none' || manifest.chrome === 'game' ? { chrome: manifest.chrome } : {}),
    },
  }
}

/** Validate and normalize an incoming definition; returns a human-readable error when invalid. */
export function normalizeCustomModule(raw: unknown, existingId?: string): CustomModuleDefinition | string {
  if (typeof raw !== 'object' || raw === null) return 'definition must be an object'
  const source = raw as Record<string, unknown>
  const name = typeof source.name === 'string' ? source.name.trim() : ''
  if (name === '') return 'name is required'
  const shape = typeof source.shape === 'string' && SHAPES.has(source.shape as CustomModuleShape)
    ? source.shape as CustomModuleShape : 'collection'
  const fields = Array.isArray(source.fields) ? source.fields.flatMap((item): CustomModuleField[] => {
    if (typeof item !== 'object' || item === null) return []
    const field = item as Record<string, unknown>
    const fieldName = typeof field.name === 'string' ? field.name.trim() : ''
    const type = typeof field.type === 'string' && FIELD_TYPES.has(field.type as CollectionFieldType)
      ? field.type as CollectionFieldType : 'text'
    return fieldName === '' ? [] : [{ name: fieldName, type }]
  }) : undefined
  if (shape === 'collection' && (fields === undefined || fields.length === 0)) return 'collection modules need at least one field'
  const view = typeof source.view === 'string' && VIEWS.has(source.view as CollectionView)
    ? source.view as CollectionView : undefined
  const cardAspect = source.cardAspect === 'portrait' || source.cardAspect === 'landscape' || source.cardAspect === 'square'
    ? source.cardAspect : undefined
  const rawLabels = typeof source.labels === 'object' && source.labels !== null ? source.labels as Record<string, unknown> : undefined
  const label = (key: string): string | undefined => typeof rawLabels?.[key] === 'string' && rawLabels[key] !== '' ? rawLabels[key] as string : undefined
  const labels = rawLabels === undefined ? undefined : {
    ...(label('primary') === undefined ? {} : { primary: label('primary') }),
    ...(label('add') === undefined ? {} : { add: label('add') }),
    ...(label('empty') === undefined ? {} : { empty: label('empty') }),
  }
  const rawPresentation = typeof source.presentation === 'object' && source.presentation !== null ? source.presentation as Record<string, unknown> : undefined
  const rawDetail = rawPresentation !== undefined && Array.isArray(rawPresentation.detail) ? rawPresentation.detail : []
  const rawEditor = rawPresentation !== undefined && typeof rawPresentation.editor === 'object' && rawPresentation.editor !== null ? rawPresentation.editor as Record<string, unknown> : {}
  const rawAssets = rawPresentation !== undefined && Array.isArray(rawPresentation.assets) ? rawPresentation.assets : []
  const stringList = (value: unknown): string[] => Array.isArray(value) ? value.filter((item): item is string => typeof item === 'string') : []
  const fieldNames = (fields ?? []).map(field => field.name)
  const presentation: CollectionPresentation | undefined = shape === 'collection' && fields !== undefined ? {
    contract: typeof rawPresentation?.contract === 'string' && rawPresentation.contract !== '' ? rawPresentation.contract : `user:${name}`,
    layout: typeof rawPresentation?.layout === 'string' && rawPresentation.layout !== ''
      ? rawPresentation.layout
      : view === 'profile' ? 'profile' : view === 'graph' ? 'graph' : view === 'cards' ? 'gallery' : 'list',
    core: stringList(rawPresentation?.core).length > 0 ? stringList(rawPresentation?.core) : fieldNames,
    optional: stringList(rawPresentation?.optional),
    detail: rawDetail.length > 0 ? rawDetail.flatMap(section => {
      if (typeof section !== 'object' || section === null) return []
      const value = section as Record<string, unknown>
      const title = typeof value.title === 'string' ? value.title : ''
      const names = stringList(value.fields).filter(field => fieldNames.includes(field))
      return title === '' || names.length === 0 ? [] : [{ title, fields: names }]
    }) : (fieldNames.length === 0 ? [] : [{ title: '说明', fields: fieldNames }]),
    editor: {
      create: stringList(rawEditor.create).length > 0 ? stringList(rawEditor.create) : fieldNames.slice(0, 3),
      detail: stringList(rawEditor.detail).length > 0 ? stringList(rawEditor.detail) : fieldNames,
    },
    assets: rawAssets.flatMap(asset => {
      if (typeof asset !== 'object' || asset === null) return []
      const value = asset as Record<string, unknown>
      return typeof value.id === 'string' && typeof value.role === 'string' && typeof value.ratio === 'string' && typeof value.render === 'string' && typeof value.export === 'string'
        ? [{ id: value.id, role: value.role, ratio: value.ratio, render: value.render, export: value.export }]
        : []
    }),
    links: stringList(rawPresentation?.links),
  } : undefined
  const unit = typeof source.unit === 'string' && source.unit.trim() !== '' ? source.unit.trim() : undefined
  const timelineView = source.timelineView === 'diary' || source.timelineView === 'horizontal' ? source.timelineView : undefined
  const surface = shape === 'surface' ? normalizeSurface(source.surface) : undefined
  if (shape === 'surface' && surface === undefined) return 'surface modules need a valid entry + files'
  return {
    id: existingId ?? (typeof source.id === 'string' && source.id !== '' ? source.id : `user-${Date.now().toString(36)}-${mintId().slice(0, 6)}`),
    name, shape,
    ...(typeof source.summary === 'string' && source.summary.trim() !== '' ? { summary: source.summary.trim() } : {}),
    ...(fields === undefined ? {} : { fields }),
    ...(view === undefined ? {} : { view }),
    ...(cardAspect === undefined ? {} : { cardAspect }),
    ...(labels === undefined || Object.keys(labels).length === 0 ? {} : { labels }),
    ...(unit === undefined ? {} : { unit }),
    ...(timelineView === undefined ? {} : { timelineView }),
    ...(typeof source.sample === 'string' && source.sample.trim() !== '' ? { sample: source.sample.trim() } : {}),
    ...(surface === undefined ? {} : { surface }),
    ...(presentation === undefined ? {} : { presentation }),
    createdAt: typeof source.createdAt === 'string' && source.createdAt !== '' ? source.createdAt : new Date().toISOString(),
  }
}

/** List saved user modules, newest first; malformed files are skipped. */
export async function listCustomModules(root: string): Promise<CustomModuleDefinition[]> {
  let names: string[]
  try {
    names = await readdir(modulesDir(root))
  } catch {
    return []
  }
  const out: CustomModuleDefinition[] = []
  for (const name of names) {
    if (!name.endsWith('.json')) continue
    try {
      const raw = JSON.parse(await readFile(join(modulesDir(root), name), 'utf8')) as unknown
      const normalized = normalizeCustomModule(raw, name.slice(0, -'.json'.length))
      if (typeof normalized !== 'string') out.push(normalized)
    } catch {
      // Ignore one malformed user file; the rest of the library remains usable.
    }
  }
  return out.sort((a, b) => b.createdAt.localeCompare(a.createdAt))
}

/** Save one definition under its id. */
export async function saveCustomModule(root: string, raw: unknown): Promise<CustomModuleDefinition | string> {
  const normalized = normalizeCustomModule(raw)
  if (typeof normalized === 'string') return normalized
  await mkdir(modulesDir(root), { recursive: true })
  await writeFile(join(modulesDir(root), `${normalized.id}.json`), `${JSON.stringify(normalized, null, 2)}\n`, 'utf8')
  return normalized
}

/** Delete one saved definition. */
export async function deleteCustomModule(root: string, id: string): Promise<void> {
  await unlink(join(modulesDir(root), `${id}.json`)).catch(() => undefined)
}

/** Build the collection payload for one custom definition. */
export function customCollection(def: CustomModuleDefinition): string {
  const fields = (def.fields ?? []).map(field => ({ id: mintId(), name: field.name, type: field.type }))
  const data: CollectionData = {
    version: 2, fields, items: [], values: {},
    view: def.view ?? 'list', artStyle: '',
    ...(def.cardAspect === undefined ? {} : { cardAspect: def.cardAspect }),
    ...(def.labels === undefined ? {} : { form: { labels: def.labels } }),
    ...(def.presentation === undefined ? {} : { presentation: def.presentation }),
  }
  return encodeCollection(data)
}

/** Build the timeline payload for one custom definition. */
export function customTimeline(def: CustomModuleDefinition): string {
  const unit = def.unit ?? '年'
  const data: TimelineData = {
    version: 2, calendar: {
      name: '', units: [{ name: unit, per: 1 }], cycles: [], epoch: 0, step: 1,
      format: '{n}', formatBefore: `前 {n}`, unit,
    },
    views: [], eras: [], events: [], marks: [],
    ...(def.timelineView === 'diary' ? { view: 'diary' as const } : {}),
  }
  return encodeTimeline(data)
}

/** Build an empty editable map payload. */
export function customMap(): string {
  return encodeMap({ version: 1, description: '', markers: [], objects: [], draft: [], palette: [] })
}

/** Build a reusable free surface payload. */
export function customSurface(def: CustomModuleDefinition): string {
  if (def.surface === undefined) throw new Error('surface definition is missing')
  return encodeSurface(def.surface)
}
