/**
 * App appearance operations shared by the user HTTP surface and the two
 * model-facing tools. Every write validates project-relative resources here;
 * callers cannot bypass the path fence or the two authorized domains.
 * @module noven-shell/appearance/service
 */
import { randomUUID } from 'node:crypto'
import { mkdir, readFile, realpath, stat, writeFile } from 'node:fs/promises'
import { extname, isAbsolute, join, relative, resolve, sep } from 'node:path'
import type { SessionId } from '@deepseek-ai/dsh-session/types'
import type {
  AppearanceAvatar, AppearanceBackground, AppearanceDocument, AppearanceFocus, AppearanceForeground, AppearanceMaterial, AppearanceView, AppearanceViewMode, AppearanceVisualState,
} from './model.ts'
import { appearanceUsesSharedBackground } from './model.ts'
import { updateAppearance } from './store.ts'

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

/** A rejected appearance request. */
export class AppearanceInvalidError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'AppearanceInvalidError'
  }
}

const IMAGE_EXTENSIONS = new Set(['.png', '.jpg', '.jpeg', '.webp', '.gif'])
const MAX_ASSET_BYTES = 8 * 1024 * 1024

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

async function projectPath(root: string, value: string, image: boolean): Promise<string> {
  if (value === '' || value.includes('\0')) throw new AppearanceInvalidError('path is empty or invalid')
  if (/^[A-Za-z]:[\\/]/u.test(value)) throw new AppearanceInvalidError('absolute drive paths are not allowed')
  const clean = value.replaceAll('\\', '/')
  if (clean === '' || clean.split('/').some(part => part === '..')) throw new AppearanceInvalidError('path must stay inside the workspace')
  const rootReal = await realpath(root).catch(() => undefined)
  if (rootReal === undefined) throw new AppearanceInvalidError('workspace is unavailable')
  const target = await realpath(isAbsolute(clean) ? clean : resolve(rootReal, clean)).catch(() => undefined)
  if (target === undefined) throw new AppearanceInvalidError(`file does not exist: ${clean}`)
  if (target !== rootReal && !target.startsWith(`${rootReal}${sep}`)) throw new AppearanceInvalidError('path escapes the workspace')
  if (!(await stat(target)).isFile()) throw new AppearanceInvalidError('path is not a file')
  if (image) {
    if (!IMAGE_EXTENSIONS.has(extname(target).toLowerCase())) throw new AppearanceInvalidError('background and avatar must be a raster image')
    const sniffed = mediaFor(await readFile(target))
    if (sniffed === undefined) throw new AppearanceInvalidError('file bytes are not a supported image')
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

function hasTreatment(choice: BackgroundChoice): boolean {
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

function hasSurface(choice: BackgroundChoice): boolean {
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
  return { kind: 'asset', path: await projectPath(root, choice.imagePath, true), ...treatment(choice), ...surfaceChoice(choice) }
}

function requireShared(document: AppearanceDocument, value: AppearanceBackground | null): void {
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
  return { kind: 'asset', path: await projectPath(root, choice.imagePath, true) }
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
  const path = await projectPath(root, choice.imagePath, true)
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
export async function setUnifiedAppearance(root: string, sessionId: string, choice: BackgroundChoice, expectedRevision?: number): Promise<AppearanceView> {
  const value = await background(root, choice)
  return updateAppearance(root, expectedRevision, (document) => {
    requireShared(document, value)
    return {
      ...document,
      workspace: value === null ? without(document.workspace, 'unified') : { ...document.workspace, unified: value },
    }
  }, sessionId)
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
      workspace: document.workspace.shared === undefined ? {} : { shared: document.workspace.shared },
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
  const relativePath = await projectPath(root, path, true)
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
