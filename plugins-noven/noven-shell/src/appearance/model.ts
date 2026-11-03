/**
 * Scoped Noven appearance data. A document stores only sparse overrides for one
 * workspace; built-in presentation stays in code and never gets copied into a
 * project.
 * @module noven-shell/appearance/model
 */

/** Where an image is cropped inside its container. */
export type AppearanceFocus = 'center' | 'top' | 'bottom' | 'left' | 'right'

/** How embedded controls sit on a configured background. */
export type AppearanceMaterial = 'auto' | 'frosted' | 'clear'

/** Which semantic foreground family embedded content uses. */
export type AppearanceForeground = 'system' | 'light' | 'dark'

/** Global light or dark application view. */
export type AppearanceViewMode = 'light' | 'dark'

/** Global visual state shared by every pane, independent of background resources. */
export interface AppearanceVisualState {
  readonly view: AppearanceViewMode
  readonly surface: AppearanceMaterial
  readonly foreground: AppearanceForeground
  readonly backgroundVisibility: number
}

/** @returns The default global visual state. */
export function defaultAppearanceVisual(): AppearanceVisualState {
  return { view: 'light', surface: 'auto', foreground: 'system', backgroundVisibility: 0.75 }
}

/** Material and foreground choices attached to one configured background. */
export interface AppearanceSurfaceChoice {
  readonly material?: AppearanceMaterial
  readonly foreground?: AppearanceForeground
}

/** Optional image treatment; omitted fields leave the image untouched. */
export interface AppearanceTreatment {
  /** Fade toward the theme surface, from 0 to 0.6. */
  readonly dim?: number
  /** Background-only blur in CSS pixels, from 0 to 20. */
  readonly blur?: number
  readonly focus?: AppearanceFocus
}

/** A custom project image with independent treatment. */
export interface AppearanceAssetBackground extends AppearanceTreatment, AppearanceSurfaceChoice {
  readonly kind: 'asset'
  readonly path: string
}

/** A reference to the workspace's shared image, with independent treatment. */
export interface AppearanceSharedReference extends AppearanceTreatment, AppearanceSurfaceChoice {
  readonly kind: 'shared'
}

/**
 * A configured container background. An absent field means the built-in or
 * inherited default; transparent explicitly closes the background.
 */
export type AppearanceBackground =
  | ({ readonly kind: 'transparent' } & AppearanceSurfaceChoice)
  | AppearanceAssetBackground
  | AppearanceSharedReference

/** An effective background after shared references have been resolved. */
export type ResolvedAppearanceBackground =
  | ({ readonly kind: 'transparent' } & AppearanceSurfaceChoice)
  | (AppearanceAssetBackground & { readonly source?: 'global' })

/** Explicit built-in white for a workspace that would otherwise inherit the global image. */
export interface AppearanceBuiltinBackground {
  readonly kind: 'builtin'
}

/** A workspace or global default, which may explicitly override inheritance with built-in white. */
export type AppearanceUnifiedBackground = AppearanceBackground | AppearanceBuiltinBackground

/** The one workspace image that canvas, conversation, and shell may share. */
export interface AppearanceSharedBackground {
  readonly path: string
}

/** An assistant avatar references one project image. */
export interface AppearanceAvatar {
  readonly kind: 'asset'
  readonly path: string
}

/** One workspace-wide appearance layer. */
export interface WorkspaceAppearance {
  readonly shared?: AppearanceSharedBackground
  /** Unified default for scopes without their own background; absent means built-in mint and white. */
  readonly unified?: AppearanceUnifiedBackground
  readonly shell?: AppearanceBackground
  readonly canvas?: AppearanceBackground
  readonly conversation?: AppearanceBackground
  readonly assistantAvatar?: AppearanceAvatar
}

/** One file's canvas override. */
export interface FileAppearance {
  readonly canvas?: AppearanceBackground
}

/** One Session's conversation override. */
export interface SessionAppearance {
  readonly conversation?: AppearanceBackground
  readonly assistantAvatar?: AppearanceAvatar
}

/** One named workspace preset, including its shared image resource and visual state. */
export interface AppearancePreset {
  readonly name: string
  readonly visual: AppearanceVisualState
  readonly workspace: WorkspaceAppearance
}

/** The appearance document for one workspace. */
export interface AppearanceDocument {
  readonly version: 1
  readonly revision: number
  readonly view?: AppearanceViewMode
  readonly surface?: AppearanceMaterial
  readonly foreground?: AppearanceForeground
  readonly backgroundVisibility?: number
  readonly workspace: WorkspaceAppearance
  readonly presets?: Readonly<Record<string, AppearancePreset>>
  readonly files: Readonly<Record<string, FileAppearance>>
  readonly sessions: Readonly<Record<string, SessionAppearance>>
}

/** One application-wide default with independent persistence and revision. */
export interface GlobalAppearanceDocument {
  readonly version: 1
  readonly revision: number
  readonly unified?: AppearanceUnifiedBackground
}

/** Raw overrides at each scope, plus the resolved values a view consumes. */
export interface AppearanceView {
  readonly version: 1
  readonly revision: number
  readonly globalRevision: number
  readonly global: {
    readonly unified?: AppearanceUnifiedBackground
  }
  readonly workspace: WorkspaceAppearance
  readonly filePath?: string
  readonly file?: FileAppearance
  readonly session: SessionAppearance
  readonly visual?: AppearanceVisualState
  readonly presets?: Readonly<Record<string, AppearancePreset>>
  readonly resolved: {
    readonly shell: ResolvedAppearanceBackground | null
    readonly canvas: ResolvedAppearanceBackground | null
    readonly conversation: ResolvedAppearanceBackground | null
    readonly assistantAvatar: AppearanceAvatar | null
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
}

function onlyKeys(value: Record<string, unknown>, keys: readonly string[]): boolean {
  return Object.keys(value).every(key => keys.includes(key))
}

const TREATMENT_KEYS = ['dim', 'blur', 'focus', 'surface', 'surfaceOpacity'] as const
const SURFACE_KEYS = ['material', 'foreground'] as const
const FOCI: readonly AppearanceFocus[] = ['center', 'top', 'bottom', 'left', 'right']
const MATERIALS: readonly AppearanceMaterial[] = ['auto', 'frosted', 'clear']
const FOREGROUNDS: readonly AppearanceForeground[] = ['system', 'light', 'dark']

function parseSurfaceChoice(value: Record<string, unknown>): AppearanceSurfaceChoice | null {
  const material = value['material']
  const foreground = value['foreground']
  if (material !== undefined && (typeof material !== 'string' || !MATERIALS.includes(material as AppearanceMaterial))) return null
  if (foreground !== undefined && (typeof foreground !== 'string' || !FOREGROUNDS.includes(foreground as AppearanceForeground))) return null
  return {
    ...(material === undefined ? {} : { material: material as AppearanceMaterial }),
    ...(foreground === undefined ? {} : { foreground: foreground as AppearanceForeground }),
  }
}

function parseTreatment(value: Record<string, unknown>): AppearanceTreatment | null {
  const dim = value['dim']
  const blur = value['blur']
  const focus = value['focus']
  const legacySurface = value['surface']
  const legacyOpacity = value['surfaceOpacity']
  if (dim !== undefined && (typeof dim !== 'number' || !Number.isFinite(dim) || dim < 0 || dim > 0.6)) return null
  if (blur !== undefined && (typeof blur !== 'number' || !Number.isFinite(blur) || blur < 0 || blur > 20)) return null
  if (focus !== undefined && (typeof focus !== 'string' || !FOCI.includes(focus as AppearanceFocus))) return null
  // surface/surfaceOpacity were the removed default-paper model. Accept valid
  // legacy values but drop them so an old document never restores a mask.
  if (legacySurface !== undefined && legacySurface !== 'none' && legacySurface !== 'text' && legacySurface !== 'panel') return null
  if (legacyOpacity !== undefined && (typeof legacyOpacity !== 'number' || !Number.isFinite(legacyOpacity) || legacyOpacity < 0.7 || legacyOpacity > 1)) return null
  return {
    ...(dim === undefined ? {} : { dim }),
    ...(blur === undefined ? {} : { blur }),
    ...(focus === undefined ? {} : { focus: focus as AppearanceFocus }),
  }
}

function parseBackground(value: unknown): AppearanceBackground | undefined | null {
  if (value === undefined) return undefined
  if (!isRecord(value)) return null
  if (value['kind'] === 'transparent') {
    if (!onlyKeys(value, ['kind', ...SURFACE_KEYS])) return null
    const surface = parseSurfaceChoice(value)
    return surface === null ? null : { kind: 'transparent', ...surface }
  }
  if (value['kind'] === 'shared') {
    if (!onlyKeys(value, ['kind', ...TREATMENT_KEYS, ...SURFACE_KEYS])) return null
    const treatment = parseTreatment(value)
    const surface = parseSurfaceChoice(value)
    return treatment === null || surface === null ? null : { kind: 'shared', ...treatment, ...surface }
  }
  if (value['kind'] === 'asset' && typeof value['path'] === 'string' && value['path'] !== '') {
    if (!onlyKeys(value, ['kind', 'path', ...TREATMENT_KEYS, ...SURFACE_KEYS])) return null
    const treatment = parseTreatment(value)
    const surface = parseSurfaceChoice(value)
    if (treatment === null || surface === null) return null
    return { kind: 'asset', path: value['path'], ...treatment, ...surface }
  }
  return null
}

function parseUnifiedBackground(value: unknown): AppearanceUnifiedBackground | undefined | null {
  if (isRecord(value) && value['kind'] === 'builtin') return Object.keys(value).length === 1 ? { kind: 'builtin' } : null
  return parseBackground(value)
}

function parseShared(value: unknown): AppearanceSharedBackground | undefined | null {
  if (value === undefined) return undefined
  if (!isRecord(value) || typeof value['path'] !== 'string' || value['path'] === '') return null
  return Object.keys(value).length === 1 ? { path: value['path'] } : null
}

function parseAvatar(value: unknown): AppearanceAvatar | undefined | null {
  if (value === undefined) return undefined
  if (!isRecord(value) || value['kind'] !== 'asset' || typeof value['path'] !== 'string' || value['path'] === '') return null
  return Object.keys(value).length === 2 ? { kind: 'asset', path: value['path'] } : null
}

function parseWorkspace(value: unknown): WorkspaceAppearance | undefined {
  if (!isRecord(value) || !onlyKeys(value, ['shared', 'unified', 'shell', 'canvas', 'conversation', 'assistantAvatar'])) return undefined
  const shared = parseShared(value['shared'])
  const unified = parseUnifiedBackground(value['unified'])
  const shell = parseBackground(value['shell'])
  const canvas = parseBackground(value['canvas'])
  const conversation = parseBackground(value['conversation'])
  const assistantAvatar = parseAvatar(value['assistantAvatar'])
  if (shared === null || unified === null || shell === null || canvas === null || conversation === null || assistantAvatar === null) return undefined
  return {
    ...(shared === undefined ? {} : { shared }),
    ...(unified === undefined ? {} : { unified }),
    ...(shell === undefined ? {} : { shell }),
    ...(canvas === undefined ? {} : { canvas }),
    ...(conversation === undefined ? {} : { conversation }),
    ...(assistantAvatar === undefined ? {} : { assistantAvatar }),
  }
}

function parseFile(value: unknown): FileAppearance | undefined {
  if (!isRecord(value) || !onlyKeys(value, ['canvas'])) return undefined
  const canvas = parseBackground(value['canvas'])
  return canvas === null || canvas === undefined ? undefined : { canvas }
}

function parseSession(value: unknown): SessionAppearance | undefined {
  if (!isRecord(value) || !onlyKeys(value, ['conversation', 'assistantAvatar'])) return undefined
  const conversation = parseBackground(value['conversation'])
  const assistantAvatar = parseAvatar(value['assistantAvatar'])
  if (conversation === null || assistantAvatar === null) return undefined
  return {
    ...(conversation === undefined ? {} : { conversation }),
    ...(assistantAvatar === undefined ? {} : { assistantAvatar }),
  }
}

function parseVisual(value: unknown): AppearanceVisualState | undefined {
  if (!isRecord(value) || !onlyKeys(value, ['view', 'surface', 'foreground', 'backgroundVisibility'])) return undefined
  const view = value['view']
  const surface = value['surface']
  const foreground = value['foreground']
  const backgroundVisibility = value['backgroundVisibility']
  if (view !== 'light' && view !== 'dark') return undefined
  if (surface !== 'auto' && surface !== 'frosted' && surface !== 'clear') return undefined
  if (foreground !== 'system' && foreground !== 'light' && foreground !== 'dark') return undefined
  if (typeof backgroundVisibility !== 'number' || !Number.isFinite(backgroundVisibility) || backgroundVisibility < 0 || backgroundVisibility > 1) return undefined
  return { view, surface, foreground, backgroundVisibility }
}

function parsePreset(value: unknown): AppearancePreset | undefined {
  if (!isRecord(value) || !onlyKeys(value, ['name', 'visual', 'workspace'])) return undefined
  const name = value['name']
  if (typeof name !== 'string' || name.trim() === '' || name.length > 80) return undefined
  const visual = parseVisual(value['visual'])
  const workspace = parseWorkspace(value['workspace'])
  return visual === undefined || workspace === undefined ? undefined : { name, visual, workspace }
}

function sparseRecord<T>(value: unknown, parse: (entry: unknown) => T | undefined): Record<string, T> | undefined {
  if (!isRecord(value)) return undefined
  const result: Record<string, T> = {}
  for (const [key, entry] of Object.entries(value)) {
    const parsed = parse(entry)
    if (parsed === undefined) return undefined
    result[key] = parsed
  }
  return result
}

function usesShared(background: AppearanceUnifiedBackground | undefined): boolean {
  return background?.kind === 'shared'
}

/**
 * Check whether any scope references the workspace's shared image.
 * @param document - Stored appearance document.
 * @returns True when at least one background is a shared reference.
 */
export function appearanceUsesSharedBackground(document: AppearanceDocument): boolean {
  return usesShared(document.workspace.unified) || usesShared(document.workspace.shell)
    || usesShared(document.workspace.canvas) || usesShared(document.workspace.conversation)
    || Object.values(document.files).some(file => usesShared(file.canvas))
    || Object.values(document.sessions).some(session => usesShared(session.conversation))
    || Object.values(document.presets ?? {}).some(preset => usesShared(preset.workspace.unified)
      || usesShared(preset.workspace.shell) || usesShared(preset.workspace.canvas) || usesShared(preset.workspace.conversation))
}

/**
 * Parse one stored appearance document.
 * @param value - Parsed JSON from the workspace ledger.
 * @returns The current document, or undefined when any field is unsupported.
 */
export function parseAppearanceDocument(value: unknown): AppearanceDocument | undefined {
  if (!isRecord(value) || !onlyKeys(value, ['version', 'revision', 'view', 'surface', 'foreground', 'backgroundVisibility', 'workspace', 'presets', 'files', 'sessions'])) return undefined
  if (value['version'] !== 1 || !Number.isSafeInteger(value['revision']) || (value['revision'] as number) < 0) return undefined
  const view = value['view']
  const surface = value['surface']
  const foreground = value['foreground']
  const backgroundVisibility = value['backgroundVisibility']
  if (view !== undefined && view !== 'light' && view !== 'dark') return undefined
  if (surface !== undefined && surface !== 'auto' && surface !== 'frosted' && surface !== 'clear') return undefined
  if (foreground !== undefined && foreground !== 'system' && foreground !== 'light' && foreground !== 'dark') return undefined
  if (backgroundVisibility !== undefined && (typeof backgroundVisibility !== 'number' || !Number.isFinite(backgroundVisibility) || backgroundVisibility < 0 || backgroundVisibility > 1)) return undefined
  const workspace = parseWorkspace(value['workspace'])
  const presets = sparseRecord(value['presets'] ?? {}, parsePreset)
  const files = sparseRecord(value['files'], parseFile)
  const sessions = sparseRecord(value['sessions'], parseSession)
  if (workspace === undefined || presets === undefined || files === undefined || sessions === undefined) return undefined
  const document: AppearanceDocument = {
    version: 1,
    revision: value['revision'] as number,
    ...(view === undefined ? {} : { view }),
    ...(surface === undefined ? {} : { surface }),
    ...(foreground === undefined ? {} : { foreground }),
    ...(backgroundVisibility === undefined ? {} : { backgroundVisibility }),
    workspace,
    presets,
    files,
    sessions,
  }
  if (appearanceUsesSharedBackground(document) && workspace.shared === undefined) return undefined
  return document
}

/** @returns An empty document at revision zero. */
export function emptyAppearanceDocument(): AppearanceDocument {
  return { version: 1, revision: 0, workspace: {}, files: {}, sessions: {} }
}

/**
 * Parse the application-wide default without accepting project-local shared references.
 * @param value - Parsed global JSON value.
 * @returns The validated global document, or undefined for unsupported fields.
 */
export function parseGlobalAppearanceDocument(value: unknown): GlobalAppearanceDocument | undefined {
  if (!isRecord(value) || !onlyKeys(value, ['version', 'revision', 'unified'])) return undefined
  if (value['version'] !== 1 || !Number.isSafeInteger(value['revision']) || (value['revision'] as number) < 0) return undefined
  const unified = parseUnifiedBackground(value['unified'])
  if (unified === null || unified?.kind === 'shared') return undefined
  return { version: 1, revision: value['revision'] as number, ...(unified === undefined ? {} : { unified }) }
}

/** @returns An empty global default at revision zero. */
export function emptyGlobalAppearanceDocument(): GlobalAppearanceDocument {
  return { version: 1, revision: 0 }
}

function resolveBackground(
  value: AppearanceUnifiedBackground | undefined,
  shared: AppearanceSharedBackground | undefined,
  globalSource = false,
): ResolvedAppearanceBackground | null {
  if (value === undefined || value.kind === 'builtin') return null
  if (value.kind !== 'shared') return globalSource && value.kind === 'asset' ? { ...value, source: 'global' } : value
  if (shared === undefined) return null
  const { dim, blur, focus, material, foreground } = value
  return {
    kind: 'asset',
    path: shared.path,
    ...(dim === undefined ? {} : { dim }),
    ...(blur === undefined ? {} : { blur }),
    ...(focus === undefined ? {} : { focus }),
    ...(material === undefined ? {} : { material }),
    ...(foreground === undefined ? {} : { foreground }),
  }
}

/**
 * Resolve built-in → global → workspace → file/session without mutating either document.
 * @param document - Stored sparse overrides.
 * @param sessionId - Session whose conversation and avatar resolve.
 * @param filePath - Canonical workspace-relative file path, when a file is shown.
 * @param global - Application-wide default inherited when the workspace has none.
 * @returns The raw scopes and resolved values for one view.
 */
export function resolveAppearance(
  document: AppearanceDocument,
  sessionId: string,
  filePath?: string,
  global: GlobalAppearanceDocument = emptyGlobalAppearanceDocument(),
): AppearanceView {
  const file = filePath === undefined ? undefined : document.files[filePath]
  const session = document.sessions[sessionId] ?? {}
  const shared = document.workspace.shared
  const inherited = document.workspace.unified ?? global.unified
  const globalSource = document.workspace.unified === undefined && global.unified !== undefined
  return {
    version: 1,
    revision: document.revision,
    globalRevision: global.revision,
    global: { ...(global.unified === undefined ? {} : { unified: global.unified }) },
    workspace: document.workspace,
    ...(filePath === undefined ? {} : { filePath }),
    ...(file === undefined ? {} : { file }),
    session,
    visual: {
      view: document.view ?? 'light',
      surface: document.surface ?? 'auto',
      foreground: document.foreground ?? 'system',
      backgroundVisibility: document.backgroundVisibility ?? 0.75,
    },
    ...(document.presets === undefined ? {} : { presets: document.presets }),
    resolved: {
      shell: resolveBackground(document.workspace.shell ?? inherited, shared, document.workspace.shell === undefined && globalSource),
      canvas: resolveBackground(file?.canvas ?? document.workspace.canvas ?? inherited, shared, file?.canvas === undefined && document.workspace.canvas === undefined && globalSource),
      conversation: resolveBackground(session.conversation ?? document.workspace.conversation ?? inherited, shared, session.conversation === undefined && document.workspace.conversation === undefined && globalSource),
      assistantAvatar: session.assistantAvatar ?? document.workspace.assistantAvatar ?? null,
    },
  }
}
