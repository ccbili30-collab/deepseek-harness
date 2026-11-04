/**
 * App appearance operations shared by the user HTTP surface and the two
 * model-facing tools. Every write validates project-relative resources here;
 * callers cannot bypass the path fence or the two authorized domains.
 * @module noven-shell/appearance/service
 */
import { randomUUID } from 'node:crypto'
import { mkdir, open, readdir, readFile, realpath, stat, writeFile } from 'node:fs/promises'
import { extname, isAbsolute, join, relative, resolve, sep } from 'node:path'
import type { SessionId } from '@deepseek-ai/dsh-session/types'
import { APP_HOME } from 'noven-ledger'
import type {
  AppearanceAvatar, AppearanceBackground, AppearanceDocument, AppearanceFocus, AppearanceForeground, AppearanceMaterial, AppearanceObjectForeground, AppearanceSoundtrack, AppearanceUnifiedBackground, AppearanceView, AppearanceViewMode, AppearanceVisualState,
} from './model.ts'
import { appearanceUsesSharedBackground } from './model.ts'
import { readAppearance, updateAppearance, updateGlobalAppearance } from './store.ts'

/** A background instruction accepted from a user surface or model tool. */
export interface BackgroundChoice {
  readonly kind: 'default' | 'transparent' | 'image' | 'shared'
  readonly imagePath?: string
  /** Fade toward the theme surface, from 0 to 0.6. */
  readonly dim?: number
  /** Background-only blur in CSS pixels, from 0 to 20. */
  readonly blur?: number
  readonly focus?: AppearanceFocus
  /** How embedded controls are materialized on this background. */
  readonly material?: AppearanceMaterial
  /** Semantic foreground family for embedded content. */
  readonly foreground?: AppearanceForeground
}

/** A workspace or application default, including an explicit built-in white exception. */
export type UnifiedBackgroundChoice = BackgroundChoice | (Omit<BackgroundChoice, 'kind'> & { readonly kind: 'builtin' })

/** The workspace shared-image slot; it always names one image when enabled. */
export interface SharedBackgroundChoice {
  readonly kind: 'default' | 'image'
  readonly imagePath?: string
}

/** An avatar instruction accepted from a user surface or model tool. */
export interface AvatarChoice {
  readonly kind: 'default' | 'image'
  readonly imagePath?: string
}

/** Global visual-state patch shared by every pane. */
export interface VisualAppearanceInput {
  readonly view?: AppearanceViewMode
  readonly surface?: AppearanceMaterial
  readonly foreground?: AppearanceForeground
  readonly backgroundVisibility?: number
  readonly expectedRevision?: number
}

/** Canvas appearance write with an explicit scope. */
export interface CanvasAppearanceInput {
  readonly scope: 'workspace' | 'file'
  readonly filePath?: string
  readonly background: BackgroundChoice
  readonly expectedRevision?: number
}

/** Conversation appearance patch with an explicit scope. */
export interface ConversationAppearanceInput {
  readonly scope: 'workspace' | 'session'
  readonly background?: BackgroundChoice
  readonly avatar?: AvatarChoice
  readonly expectedRevision?: number
}

/** One audio or independent foreground patch for the workspace, one file, or the current Session. */
export interface TrackAppearanceInput {
  readonly scope: 'workspace' | 'file' | 'session'
  readonly filePath?: string
  readonly track?: {
    readonly kind: 'default' | 'audio'
    readonly audioPath?: string
    readonly volume?: number
    readonly loop?: boolean
  }
  readonly foreground?: 'default' | AppearanceObjectForeground
  readonly expectedRevision?: number
}

/** Project audio paths that the track tools may offer, plus whether the list was capped. */
export interface AppearanceAudioListing {
  readonly paths: readonly string[]
  readonly total: number
  readonly truncated: boolean
}

/** A rejected appearance request. */
export class AppearanceInvalidError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'AppearanceInvalidError'
  }
}

const IMAGE_EXTENSIONS = new Set(['.png', '.jpg', '.jpeg', '.webp', '.gif'])
const AUDIO_EXTENSIONS = new Set(['.mp3', '.wav', '.ogg'])
const MAX_ASSET_BYTES = 8 * 1024 * 1024
const MAX_AUDIO_BYTES = 16 * 1024 * 1024
const MAX_LISTED_AUDIO = 200
const AUDIO_LIST_EXCLUDES = new Set(['.git', 'node_modules'])

function audioMediaFor(bytes: Uint8Array): { readonly ext: string; readonly type: string } | undefined {
  if (bytes.length > 3 && String.fromCharCode(...bytes.slice(0, 3)) === 'ID3') return { ext: '.mp3', type: 'audio/mpeg' }
  if (bytes.length > 2 && bytes[0] === 0xff && (bytes[1] & 0xe0) === 0xe0) return { ext: '.mp3', type: 'audio/mpeg' }
  if (bytes.length >= 12 && String.fromCharCode(...bytes.slice(0, 4)) === 'RIFF' && String.fromCharCode(...bytes.slice(8, 12)) === 'WAVE') return { ext: '.wav', type: 'audio/wav' }
  if (bytes.length >= 4 && String.fromCharCode(...bytes.slice(0, 4)) === 'OggS') return { ext: '.ogg', type: 'audio/ogg' }
  return undefined
}

async function fileHeader(path: string, length: number): Promise<Uint8Array> {
  const handle = await open(path, 'r')
  try {
    const buffer = Buffer.alloc(length)
    const { bytesRead } = await handle.read(buffer, 0, length, 0)
    return buffer.subarray(0, bytesRead)
  } finally {
    await handle.close()
  }
}

function mediaFor(bytes: Uint8Array): { readonly ext: string; readonly type: string } | undefined {
  if (bytes.length > 8 && bytes[0] === 0x89 && bytes[1] === 0x50 && bytes[2] === 0x4e && bytes[3] === 0x47) return { ext: '.png', type: 'image/png' }
  if (bytes.length > 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) return { ext: '.jpg', type: 'image/jpeg' }
  if (bytes.length > 12 && String.fromCharCode(...bytes.slice(0, 4)) === 'RIFF' && String.fromCharCode(...bytes.slice(8, 12)) === 'WEBP') return { ext: '.webp', type: 'image/webp' }
  if (bytes.length > 6 && String.fromCharCode(...bytes.slice(0, 4)) === 'GIF8') return { ext: '.gif', type: 'image/gif' }
  return undefined
}

/**
 * Inspect one Session without activating its Agent.
 * @param inspector - Host Session controller with the public inspect method.
 * @param sessionId - Durable Session identity.
 * @returns The Session's workspace root, or undefined when it has none.
 */
export async function sessionAppearanceRoot(
  inspector: { inspect(sessionId: SessionId): Promise<{ readonly meta: { readonly cwd?: string } }> },
  sessionId: SessionId,
): Promise<string | undefined> {
  try {
    return (await inspector.inspect(sessionId)).meta.cwd
  } catch {
    return undefined
  }
}

async function projectPath(root: string, value: string, media: 'image' | 'audio' | false): Promise<string> {
  if (value === '' || value.includes('\0')) throw new AppearanceInvalidError('path is empty or invalid')
  if (/^[A-Za-z]:[\\/]/u.test(value)) throw new AppearanceInvalidError('absolute drive paths are not allowed')
  const clean = value.replaceAll('\\', '/')
  if (clean === '' || clean.split('/').some(part => part === '..')) throw new AppearanceInvalidError('path must stay inside the workspace')
  const rootReal = await realpath(root).catch(() => undefined)
  if (rootReal === undefined) throw new AppearanceInvalidError('workspace is unavailable')
  const target = await realpath(isAbsolute(clean) ? clean : resolve(rootReal, clean)).catch(() => undefined)
  if (target === undefined) throw new AppearanceInvalidError(`file does not exist: ${clean}`)
  if (target !== rootReal && !target.startsWith(`${rootReal}${sep}`)) throw new AppearanceInvalidError('path escapes the workspace')
  const targetStat = await stat(target)
  if (!targetStat.isFile()) throw new AppearanceInvalidError('path is not a file')
  if (media === 'image') {
    if (!IMAGE_EXTENSIONS.has(extname(target).toLowerCase())) throw new AppearanceInvalidError('background and avatar must be a raster image')
    const sniffed = mediaFor(await readFile(target))
    if (sniffed === undefined) throw new AppearanceInvalidError('file bytes are not a supported image')
  }
  if (media === 'audio') {
    if (!AUDIO_EXTENSIONS.has(extname(target).toLowerCase())) throw new AppearanceInvalidError('soundtrack must be MP3, WAV, or Ogg audio')
    if (targetStat.size === 0 || targetStat.size > MAX_AUDIO_BYTES) throw new AppearanceInvalidError('soundtrack must be between 1 byte and 16 MiB')
    const sniffed = audioMediaFor(await readFile(target))
    if (sniffed === undefined) throw new AppearanceInvalidError('file bytes are not supported audio')
  }
  return relative(rootReal, target).split(sep).join('/')
}

function treatment(choice: BackgroundChoice): {
  readonly dim?: number
  readonly blur?: number
  readonly focus?: AppearanceFocus
} {
  const { dim, blur, focus } = choice
  if (dim !== undefined && (typeof dim !== 'number' || !Number.isFinite(dim) || dim < 0 || dim > 0.6)) {
    throw new AppearanceInvalidError('background.dim must be between 0 and 0.6')
  }
  if (blur !== undefined && (typeof blur !== 'number' || !Number.isFinite(blur) || blur < 0 || blur > 20)) {
    throw new AppearanceInvalidError('background.blur must be between 0 and 20')
  }
  if (focus !== undefined && !['center', 'top', 'bottom', 'left', 'right'].includes(focus)) {
    throw new AppearanceInvalidError('background.focus is unsupported')
  }
  return {
    ...(dim === undefined ? {} : { dim }),
    ...(blur === undefined ? {} : { blur }),
    ...(focus === undefined ? {} : { focus }),
  }
}

function hasTreatment(choice: Pick<BackgroundChoice, 'dim' | 'blur' | 'focus'>): boolean {
  return choice.dim !== undefined || choice.blur !== undefined || choice.focus !== undefined
}

function surfaceChoice(choice: BackgroundChoice): { readonly material?: AppearanceMaterial; readonly foreground?: AppearanceForeground } {
  const { material, foreground } = choice
  if (material !== undefined && !['auto', 'frosted', 'clear'].includes(material)) {
    throw new AppearanceInvalidError('background.material is unsupported')
  }
  if (foreground !== undefined && !['system', 'light', 'dark'].includes(foreground)) {
    throw new AppearanceInvalidError('background.foreground is unsupported')
  }
  return {
    ...(material === undefined ? {} : { material }),
    ...(foreground === undefined ? {} : { foreground }),
  }
}

function hasSurface(choice: Pick<BackgroundChoice, 'material' | 'foreground'>): boolean {
  return choice.material !== undefined || choice.foreground !== undefined
}

async function background(root: string, choice: BackgroundChoice): Promise<AppearanceBackground | null> {
  if (choice.kind === 'default') {
    if (choice.imagePath !== undefined || hasTreatment(choice) || hasSurface(choice)) throw new AppearanceInvalidError('default background takes no image, treatment, or surface')
    return null
  }
  if (choice.kind === 'transparent') {
    if (choice.imagePath !== undefined || hasTreatment(choice)) throw new AppearanceInvalidError('transparent background takes no image or treatment')
    return { kind: 'transparent', ...surfaceChoice(choice) }
  }
  if (choice.kind === 'shared') {
    if (choice.imagePath !== undefined) throw new AppearanceInvalidError('shared background takes no image path')
    return { kind: 'shared', ...treatment(choice), ...surfaceChoice(choice) }
  }
  if (choice.imagePath === undefined || choice.imagePath === '') throw new AppearanceInvalidError('image background requires imagePath')
  return { kind: 'asset', path: await projectPath(root, choice.imagePath, 'image'), ...treatment(choice), ...surfaceChoice(choice) }
}

function requireShared(document: AppearanceDocument, value: AppearanceUnifiedBackground | null): void {
  if (value?.kind === 'shared' && document.workspace.shared === undefined) {
    throw new AppearanceInvalidError('set the shared background image first')
  }
}

async function avatar(root: string, choice: AvatarChoice): Promise<AppearanceAvatar | null> {
  if (choice.kind === 'default') {
    if (choice.imagePath !== undefined) throw new AppearanceInvalidError('default avatar takes no image path')
    return null
  }
  if (choice.imagePath === undefined || choice.imagePath === '') throw new AppearanceInvalidError('image avatar requires imagePath')
  return { kind: 'asset', path: await projectPath(root, choice.imagePath, 'image') }
}

function without<T extends object, K extends keyof T>(value: T, key: K): Omit<T, K> {
  const next = { ...value } as Partial<T>
  delete next[key]
  return next as Omit<T, K>
}

/**
 * Set the workspace or one file's canvas background.
 * @param root - Project workspace root.
 * @param sessionId - Session whose returned view resolves.
 * @param input - Scope, background, optional file, and expected revision.
 * @returns The persisted resolved view.
 */
export async function setCanvasAppearance(root: string, sessionId: string, input: CanvasAppearanceInput): Promise<AppearanceView> {
  let filePath: string | undefined
  if (input.scope === 'workspace') {
    if (input.filePath !== undefined) throw new AppearanceInvalidError('workspace scope takes no filePath')
  } else {
    if (input.filePath === undefined) throw new AppearanceInvalidError('file scope requires filePath')
    filePath = await projectPath(root, input.filePath, false)
  }
  const value = await background(root, input.background)
  return updateAppearance(root, input.expectedRevision, (document) => {
    requireShared(document, value)
    if (input.scope === 'workspace') {
      const workspace = value === null
        ? without(document.workspace, 'canvas')
        : { ...document.workspace, canvas: value }
      return { ...document, workspace }
    }
    const files = { ...document.files }
    const current = files[filePath ?? ''] ?? {}
    const entry = value === null ? without(current, 'canvas') : { ...current, canvas: value }
    if (Object.keys(entry).length === 0) delete files[filePath ?? '']
    else files[filePath ?? ''] = entry
    return { ...document, files }
  }, sessionId, filePath)
}

/**
 * Set the workspace or current Session's conversation background and avatar.
 * @param root - Project workspace root.
 * @param sessionId - Current Session; also the only session scope accepted.
 * @param input - Scope and fields to replace, remove, or leave untouched.
 * @returns The persisted resolved view.
 */
export async function setConversationAppearance(root: string, sessionId: string, input: ConversationAppearanceInput): Promise<AppearanceView> {
  if (input.background === undefined && input.avatar === undefined) throw new AppearanceInvalidError('conversation appearance needs a background or avatar')
  const nextBackground = input.background === undefined ? undefined : await background(root, input.background)
  const nextAvatar = input.avatar === undefined ? undefined : await avatar(root, input.avatar)
  return updateAppearance(root, input.expectedRevision, (document) => {
    requireShared(document, nextBackground === undefined ? null : nextBackground)
    if (input.scope === 'workspace') {
      let workspace = { ...document.workspace }
      if (nextBackground !== undefined) {
        workspace = nextBackground === null ? without(workspace, 'conversation') : { ...workspace, conversation: nextBackground }
      }
      if (nextAvatar !== undefined) {
        workspace = nextAvatar === null ? without(workspace, 'assistantAvatar') : { ...workspace, assistantAvatar: nextAvatar }
      }
      return { ...document, workspace }
    }
    const sessions = { ...document.sessions }
    let entry = { ...(sessions[sessionId] ?? {}) }
    if (nextBackground !== undefined) {
      entry = nextBackground === null ? without(entry, 'conversation') : { ...entry, conversation: nextBackground }
    }
    if (nextAvatar !== undefined) {
      entry = nextAvatar === null ? without(entry, 'assistantAvatar') : { ...entry, assistantAvatar: nextAvatar }
    }
    if (Object.keys(entry).length === 0) delete sessions[sessionId]
    else sessions[sessionId] = entry
    return { ...document, sessions }
  }, sessionId)
}

/**
 * Set or clear a workspace, file, or current Session soundtrack and independent foreground.
 * @param root - Project workspace root.
 * @param sessionId - Current Session and the only accepted session scope.
 * @param input - Audio choice, optional foreground, scope, and expected revision.
 * @returns The persisted view with the current file resolved.
 */
export async function setTrackAppearance(root: string, sessionId: string, input: TrackAppearanceInput): Promise<AppearanceView> {
  if (input.track === undefined && input.foreground === undefined) throw new AppearanceInvalidError('track appearance needs a track or foreground')
  if (input.scope === 'workspace' && input.foreground !== undefined) throw new AppearanceInvalidError('workspace track scope has no independent foreground')
  let filePath: string | undefined
  if (input.scope === 'file') {
    if (input.filePath === undefined) throw new AppearanceInvalidError('file track scope requires filePath')
    filePath = await projectPath(root, input.filePath, false)
  } else if (input.filePath !== undefined) {
    throw new AppearanceInvalidError(`${input.scope} track scope takes no filePath`)
  }
  let nextTrack: AppearanceSoundtrack | null | undefined
  if (input.track !== undefined) {
    if (input.track.kind === 'default') {
      if (input.track.audioPath !== undefined || input.track.volume !== undefined || input.track.loop !== undefined) {
        throw new AppearanceInvalidError('default track takes no audio path or playback preferences')
      }
      nextTrack = null
    } else {
      if (input.track.audioPath === undefined || input.track.audioPath === '') throw new AppearanceInvalidError('audio track requires audioPath')
      const volume = input.track.volume
      const loop = input.track.loop
      if (volume !== undefined && (typeof volume !== 'number' || !Number.isFinite(volume) || volume < 0 || volume > 1)) {
        throw new AppearanceInvalidError('track volume must be between 0 and 1')
      }
      if (loop !== undefined && typeof loop !== 'boolean') throw new AppearanceInvalidError('track loop must be boolean')
      nextTrack = {
        kind: 'asset',
        path: await projectPath(root, input.track.audioPath, 'audio'),
        ...(volume === undefined ? {} : { volume }),
        ...(loop === undefined ? {} : { loop }),
      }
    }
  }
  const nextForeground = input.foreground === 'default' ? null : input.foreground
  return updateAppearance(root, input.expectedRevision, (document) => {
    if (input.scope === 'workspace') {
      const workspace = nextTrack === null
        ? without(document.workspace, 'canvasTrack')
        : { ...document.workspace, canvasTrack: nextTrack }
      return { ...document, workspace }
    }
    if (input.scope === 'file') {
      const files = { ...document.files }
      let entry = { ...(files[filePath ?? ''] ?? {}) }
      if (nextTrack !== undefined) entry = nextTrack === null ? without(entry, 'track') : { ...entry, track: nextTrack }
      if (nextForeground !== undefined) entry = nextForeground === null ? without(entry, 'foreground') : { ...entry, foreground: nextForeground }
      if (Object.keys(entry).length === 0) delete files[filePath ?? '']
      else files[filePath ?? ''] = entry
      return { ...document, files }
    }
    const sessions = { ...document.sessions }
    let entry = { ...(sessions[sessionId] ?? {}) }
    if (nextTrack !== undefined) entry = nextTrack === null ? without(entry, 'track') : { ...entry, track: nextTrack }
    if (nextForeground !== undefined) entry = nextForeground === null ? without(entry, 'foreground') : { ...entry, foreground: nextForeground }
    if (Object.keys(entry).length === 0) delete sessions[sessionId]
    else sessions[sessionId] = entry
    return { ...document, sessions }
  }, sessionId, filePath)
}

/**
 * Read resolved soundtrack bindings for the current Session and an optional file.
 * @param root - Project workspace root.
 * @param sessionId - Current Session whose conversation binding resolves.
 * @param filePath - Existing workspace-relative file whose canvas binding resolves.
 * @returns The current view with raw overrides and inherited values.
 */
export async function readTrackAppearance(root: string, sessionId: string, filePath?: string): Promise<AppearanceView> {
  const canonical = filePath === undefined ? undefined : await projectPath(root, filePath, false)
  return readAppearance(root, sessionId, canonical)
}

/**
 * List project audio paths that the track tools may bind.
 * @param root - Project workspace root.
 * @returns Supported-extension audio paths, capped for a bounded tool result.
 */
export async function listAppearanceAudio(root: string): Promise<AppearanceAudioListing> {
  const rootReal = await realpath(root).catch(() => undefined)
  if (rootReal === undefined) throw new AppearanceInvalidError('workspace is unavailable')
  const entries = await readdir(rootReal, { recursive: true, withFileTypes: true })
  const candidates: string[] = []
  for (const entry of entries) {
    if (!entry.isFile() || !AUDIO_EXTENSIONS.has(extname(entry.name).toLowerCase())) continue
    const path = relative(rootReal, join(entry.parentPath ?? rootReal, entry.name)).split(sep).join('/')
    if (path.split('/').some(part => AUDIO_LIST_EXCLUDES.has(part))) continue
    candidates.push(path)
  }
  candidates.sort((left, right) => left < right ? -1 : left > right ? 1 : 0)
  const paths: string[] = []
  for (const path of candidates) {
    const target = join(rootReal, path)
    const info = await stat(target).catch(() => undefined)
    if (info?.isFile() !== true || info.size === 0 || info.size > MAX_AUDIO_BYTES) continue
    const header = await fileHeader(target, 16).catch(() => undefined)
    if (header !== undefined && audioMediaFor(header) !== undefined) paths.push(path)
  }
  return { paths: paths.slice(0, MAX_LISTED_AUDIO), total: paths.length, truncated: paths.length > MAX_LISTED_AUDIO }
}

/**
 * Set the user-only workspace shell background.
 * @param root - Project workspace root.
 * @param sessionId - Session whose returned view resolves.
 * @param choice - Background to set, clear, or make transparent.
 * @param expectedRevision - Optional optimistic revision.
 * @returns The persisted resolved view.
 */
export async function setShellAppearance(root: string, sessionId: string, choice: BackgroundChoice, expectedRevision?: number): Promise<AppearanceView> {
  const value = await background(root, choice)
  return updateAppearance(root, expectedRevision, (document) => {
    requireShared(document, value)
    return {
      ...document,
      workspace: value === null ? without(document.workspace, 'shell') : { ...document.workspace, shell: value },
    }
  }, sessionId)
}

/**
 * Set or clear the workspace image that scopes may explicitly share.
 * @param root - Project workspace root.
 * @param sessionId - Session whose returned view resolves.
 * @param choice - Image to store, or default to clear an unreferenced slot.
 * @param expectedRevision - Optional optimistic revision.
 * @returns The persisted resolved view.
 */
export async function setSharedAppearance(root: string, sessionId: string, choice: SharedBackgroundChoice, expectedRevision?: number): Promise<AppearanceView> {
  if (choice.kind === 'default') {
    if (choice.imagePath !== undefined) throw new AppearanceInvalidError('default shared background takes no image path')
    return updateAppearance(root, expectedRevision, (document) => {
      if (appearanceUsesSharedBackground(document)) throw new AppearanceInvalidError('shared background is still used by a scope')
      return { ...document, workspace: without(document.workspace, 'shared') }
    }, sessionId)
  }
  if (choice.imagePath === undefined || choice.imagePath === '') throw new AppearanceInvalidError('shared background requires imagePath')
  const path = await projectPath(root, choice.imagePath, 'image')
  return updateAppearance(root, expectedRevision, (document) => ({
    ...document,
    workspace: { ...document.workspace, shared: { path } },
  }), sessionId)
}

/**
 * Set the workspace's unified background without replacing scope-specific overrides.
 * @param root - Project workspace root.
 * @param sessionId - Session whose returned view resolves.
 * @param choice - Unified background to set, clear to built-in, or make transparent.
 * @param expectedRevision - Optional optimistic revision.
 * @returns The persisted resolved view with scope overrides preserved.
 */
export async function setUnifiedAppearance(root: string, sessionId: string, choice: UnifiedBackgroundChoice, expectedRevision?: number): Promise<AppearanceView> {
  let value: AppearanceUnifiedBackground | null
  if (choice.kind === 'builtin') {
    if (choice.imagePath !== undefined || hasTreatment(choice) || hasSurface(choice)) throw new AppearanceInvalidError('built-in background takes no image, treatment, or surface')
    value = { kind: 'builtin' }
  } else {
    value = await background(root, choice)
  }
  return updateAppearance(root, expectedRevision, (document) => {
    requireShared(document, value)
    return {
      ...document,
      workspace: value === null ? without(document.workspace, 'unified') : { ...document.workspace, unified: value },
    }
  }, sessionId)
}

/**
 * Set the application-wide default without changing any workspace document.
 * @param root - Workspace whose resolved view is returned.
 * @param sessionId - Session whose returned view resolves.
 * @param choice - Global default to set, clear to built-in, or make transparent.
 * @param expectedGlobalRevision - Optional optimistic global revision.
 * @returns The current workspace view with the new global default.
 */
export async function setGlobalUnifiedAppearance(
  root: string,
  sessionId: string,
  choice: UnifiedBackgroundChoice,
  expectedGlobalRevision?: number,
): Promise<AppearanceView> {
  const value = await globalBackground(choice)
  return updateGlobalAppearance(root, sessionId, expectedGlobalRevision, document => value === null
    ? without(document, 'unified')
    : { ...document, unified: value })
}

/**
 * Patch the one global visual state shared by every pane.
 * @param root - Project workspace root.
 * @param sessionId - Session whose returned view resolves.
 * @param input - Global view, surface, foreground, visibility, and revision.
 * @returns The persisted resolved view.
 */
export async function setVisualAppearance(root: string, sessionId: string, input: VisualAppearanceInput): Promise<AppearanceView> {
  const { view, surface, foreground, backgroundVisibility } = input
  if (view === undefined && surface === undefined && foreground === undefined && backgroundVisibility === undefined) {
    throw new AppearanceInvalidError('visual appearance needs at least one field')
  }
  if (view !== undefined && view !== 'light' && view !== 'dark') throw new AppearanceInvalidError('view must be light or dark')
  if (surface !== undefined && surface !== 'auto' && surface !== 'frosted' && surface !== 'clear') {
    throw new AppearanceInvalidError('surface is unsupported')
  }
  if (foreground !== undefined && foreground !== 'system' && foreground !== 'light' && foreground !== 'dark') {
    throw new AppearanceInvalidError('foreground is unsupported')
  }
  if (backgroundVisibility !== undefined && (typeof backgroundVisibility !== 'number' || !Number.isFinite(backgroundVisibility) || backgroundVisibility < 0 || backgroundVisibility > 1)) {
    throw new AppearanceInvalidError('backgroundVisibility must be between 0 and 1')
  }
  return updateAppearance(root, input.expectedRevision, (document) => ({
    ...document,
    ...(view === undefined ? {} : { view }),
    ...(surface === undefined ? {} : { surface }),
    ...(foreground === undefined ? {} : { foreground }),
    ...(backgroundVisibility === undefined ? {} : { backgroundVisibility }),
  }), sessionId)
}

/**
 * Save the current global visual state and workspace resources as one named preset.
 * @param root - Project workspace root.
 * @param sessionId - Session whose view resolves after the write.
 * @param name - User-visible preset name.
 * @param expectedRevision - Optional optimistic revision.
 * @returns The view including the new preset.
 */
export async function saveAppearancePreset(root: string, sessionId: string, name: string, expectedRevision?: number): Promise<AppearanceView> {
  const normalized = name.trim()
  if (normalized === '' || normalized.length > 80) throw new AppearanceInvalidError('preset name must contain 1 to 80 characters')
  return updateAppearance(root, expectedRevision, (document) => {
    const visual: AppearanceVisualState = {
      view: document.view ?? 'light',
      surface: document.surface ?? 'auto',
      foreground: document.foreground ?? 'system',
      backgroundVisibility: document.backgroundVisibility ?? 0.75,
    }
    return {
      ...document,
      presets: {
        ...document.presets,
        [randomUUID()]: { name: normalized, visual, workspace: { ...document.workspace } },
      },
    }
  }, sessionId)
}

/**
 * Apply one stored workspace preset and clear object-specific overrides so the
 * visible result exactly matches the preset.
 * @param root - Project workspace root.
 * @param sessionId - Session whose view resolves after the write.
 * @param presetId - Stored preset identity.
 * @param expectedRevision - Optional optimistic revision.
 * @returns The applied appearance view.
 */
export async function applyAppearancePreset(root: string, sessionId: string, presetId: string, expectedRevision?: number): Promise<AppearanceView> {
  if (presetId === '') throw new AppearanceInvalidError('preset id is required')
  return updateAppearance(root, expectedRevision, (document) => {
    const preset = document.presets?.[presetId]
    if (preset === undefined) throw new AppearanceInvalidError('preset does not exist')
    return {
      ...document,
      view: preset.visual.view,
      surface: preset.visual.surface,
      foreground: preset.visual.foreground,
      backgroundVisibility: preset.visual.backgroundVisibility,
      workspace: { ...preset.workspace },
      files: {},
      sessions: {},
    }
  }, sessionId)
}

/**
 * Restore built-in appearance while retaining shared image resources and presets.
 * @param root - Project workspace root.
 * @param sessionId - Session whose view resolves after the write.
 * @param expectedRevision - Optional optimistic revision.
 * @returns The built-in appearance view.
 */
export async function resetAppearance(root: string, sessionId: string, expectedRevision?: number): Promise<AppearanceView> {
  return updateAppearance(root, expectedRevision, (document) => {
    const reset = without(without(without(without(document, 'view'), 'surface'), 'foreground'), 'backgroundVisibility')
    return {
      ...reset,
      workspace: {
        ...(document.workspace.shared === undefined ? {} : { shared: document.workspace.shared }),
        unified: { kind: 'builtin' },
      },
      files: {},
      sessions: {},
    }
  }, sessionId)
}

/**
 * Read one validated appearance image for browser display.
 * @param root - Project workspace root.
 * @param path - Stored workspace-relative image path.
 * @returns Image bytes and their sniffed media type.
 */
export async function readAppearanceAsset(root: string, path: string): Promise<{ readonly bytes: Buffer; readonly type: string }> {
  const relativePath = await projectPath(root, path, 'image')
  const bytes = await readFile(resolve(root, relativePath))
  const media = mediaFor(bytes)
  if (media === undefined) throw new AppearanceInvalidError('asset bytes changed to an unsupported image')
  return { bytes, type: media.type }
}

/**
 * Save one uploaded project image for appearance use.
 * @param root - Project workspace root.
 * @param bytes - Uploaded image bytes.
 * @returns The workspace-relative stored image path.
 */
export async function saveAppearanceAsset(root: string, bytes: Uint8Array): Promise<string> {
  if (bytes.length === 0 || bytes.length > MAX_ASSET_BYTES) throw new AppearanceInvalidError('asset must be between 1 byte and 8 MiB')
  const media = mediaFor(bytes)
  if (media === undefined) throw new AppearanceInvalidError('asset is not a supported raster image')
  const rootReal = await realpath(root)
  const dir = join(rootReal, '.noven', 'appearance')
  await mkdir(dir, { recursive: true })
  const name = `${randomUUID()}${media.ext}`
  await writeFile(join(dir, name), bytes, { flag: 'wx' })
  return `.noven/appearance/${name}`
}

/**
 * Read one validated audio asset for browser playback.
 * @param root - Project workspace root.
 * @param path - Stored workspace-relative audio path.
 * @returns Audio bytes and their sniffed media type.
 */
export async function readAppearanceAudioAsset(root: string, path: string): Promise<{ readonly bytes: Buffer; readonly type: string }> {
  const relativePath = await projectPath(root, path, 'audio')
  const bytes = await readFile(resolve(root, relativePath))
  const media = audioMediaFor(bytes)
  if (media === undefined) throw new AppearanceInvalidError('audio bytes changed to an unsupported format')
  return { bytes, type: media.type }
}

/**
 * Save one uploaded project audio asset for appearance playback.
 * @param root - Project workspace root.
 * @param bytes - Uploaded audio bytes.
 * @returns The workspace-relative stored audio path.
 */
export async function saveAppearanceAudioAsset(root: string, bytes: Uint8Array): Promise<string> {
  if (bytes.length === 0 || bytes.length > MAX_AUDIO_BYTES) throw new AppearanceInvalidError('audio must be between 1 byte and 16 MiB')
  const media = audioMediaFor(bytes)
  if (media === undefined) throw new AppearanceInvalidError('audio is not MP3, WAV, or Ogg')
  const rootReal = await realpath(root)
  const dir = join(rootReal, '.noven', 'appearance')
  await mkdir(dir, { recursive: true })
  const name = `${randomUUID()}${media.ext}`
  await writeFile(join(dir, name), bytes, { flag: 'wx' })
  return `.noven/appearance/${name}`
}

const GLOBAL_ASSET_ID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}\.(?:png|jpe?g|webp|gif)$/u

async function globalAssetPath(value: string): Promise<string> {
  if (!GLOBAL_ASSET_ID.test(value)) throw new AppearanceInvalidError('global asset id is invalid')
  const root = join(APP_HOME, 'appearance', 'assets')
  const rootReal = await realpath(root).catch(() => undefined)
  if (rootReal === undefined) throw new AppearanceInvalidError('global asset library is unavailable')
  const target = await realpath(join(rootReal, value)).catch(() => undefined)
  if (target === undefined || !target.startsWith(`${rootReal}${sep}`)) throw new AppearanceInvalidError('global asset is unavailable')
  if (!(await stat(target)).isFile()) throw new AppearanceInvalidError('global asset is not a file')
  const media = mediaFor(await readFile(target))
  if (media === undefined) throw new AppearanceInvalidError('global asset bytes are not a supported image')
  return target
}

async function globalBackground(choice: UnifiedBackgroundChoice): Promise<AppearanceUnifiedBackground | null> {
  if (choice.kind === 'default' || choice.kind === 'builtin') {
    if (choice.imagePath !== undefined || hasTreatment(choice) || hasSurface(choice)) throw new AppearanceInvalidError('default background takes no image, treatment, or surface')
    return null
  }
  if (choice.kind === 'shared') throw new AppearanceInvalidError('global background cannot use a workspace shared image')
  if (choice.kind === 'transparent') {
    if (choice.imagePath !== undefined || hasTreatment(choice)) throw new AppearanceInvalidError('transparent background takes no image or treatment')
    return { kind: 'transparent', ...surfaceChoice(choice) }
  }
  if (choice.imagePath === undefined) throw new AppearanceInvalidError('global image background requires imagePath')
  await globalAssetPath(choice.imagePath)
  return { kind: 'asset', path: choice.imagePath, ...treatment(choice), ...surfaceChoice(choice) }
}

/**
 * Read one image from the application-wide asset library.
 * @param assetId - Generated asset ID, never a project or filesystem path.
 * @returns Image bytes and their sniffed media type.
 */
export async function readGlobalAppearanceAsset(assetId: string): Promise<{ readonly bytes: Buffer; readonly type: string }> {
  const path = await globalAssetPath(assetId)
  const bytes = await readFile(path)
  const media = mediaFor(bytes)
  if (media === undefined) throw new AppearanceInvalidError('global asset bytes changed to an unsupported image')
  return { bytes, type: media.type }
}

/**
 * Save one uploaded image in the application-wide asset library.
 * @param bytes - Uploaded image bytes.
 * @returns The generated global asset ID.
 */
export async function saveGlobalAppearanceAsset(bytes: Uint8Array): Promise<string> {
  if (bytes.length === 0 || bytes.length > MAX_ASSET_BYTES) throw new AppearanceInvalidError('asset must be between 1 byte and 8 MiB')
  const media = mediaFor(bytes)
  if (media === undefined) throw new AppearanceInvalidError('asset is not a supported raster image')
  const dir = join(APP_HOME, 'appearance', 'assets')
  await mkdir(dir, { recursive: true })
  const name = `${randomUUID()}${media.ext}`
  await writeFile(join(dir, name), bytes, { flag: 'wx' })
  return name
}
