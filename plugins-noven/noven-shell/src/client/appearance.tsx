/**
 * Client appearance snapshot, per-file canvas surfaces, and the global
 * conversation/shell/avatar variables. One Host document is the only source;
 * UI state here is a View, never a second persistence layer.
 * @module noven-shell/client/appearance
 */
import { useEffect, useRef, useSyncExternalStore } from 'react'
import type { CSSProperties, ReactNode } from 'react'
import type { SessionId } from '@deepseek-ai/dsh-session/types'
import type { ObservableSnapshot } from '@deepseek-ai/dsh-client-store'
import type { ThemeRuntime, ThemeTokenOverrides } from '@deepseek-ai/dsh-client-ui-theme/client'
import type {
  AppearanceAssetBackground, AppearanceFocus, AppearanceView, AppearanceVisualState, ResolvedAppearanceBackground,
} from '../appearance/model.ts'
import { defaultAppearanceVisual } from '../appearance/model.ts'

interface AppearanceSnapshot {
  readonly loading: boolean
  readonly view?: AppearanceView
  readonly error?: string
}

interface ActiveFile {
  readonly sessionId: SessionId
  readonly path?: string
}

const POLL_MS = 5000
const snapshots = new Map<string, AppearanceSnapshot>()
const listeners = new Map<string, Set<() => void>>()
const inflight = new Map<string, Promise<void>>()
const fileListeners = new Set<() => void>()
const visualSnapshots = new Map<SessionId, { readonly revision: number; readonly value: AppearanceVisualState }>()
const visualListeners = new Map<SessionId, Set<() => void>>()
let activeFile: ActiveFile | undefined

const LOADING: AppearanceSnapshot = { loading: true }
const IDLE: AppearanceSnapshot = { loading: false }
const DEFAULT_VISUAL = defaultAppearanceVisual()

const keyOf = (sessionId: SessionId, filePath?: string): string => `${sessionId}\u0000${filePath ?? ''}`
const prefixOf = (sessionId: SessionId): string => `${sessionId}\u0000`

function publish(key: string, snapshot: AppearanceSnapshot): void {
  const current = snapshots.get(key)
  if (current?.loading === snapshot.loading
    && current.view?.revision === snapshot.view?.revision
    && current.view?.globalRevision === snapshot.view?.globalRevision
    && current.error === snapshot.error) return
  snapshots.set(key, snapshot)
  for (const listener of listeners.get(key) ?? []) listener()
}

function subscribe(key: string, listener: () => void): () => void {
  const entries = listeners.get(key) ?? new Set<() => void>()
  entries.add(listener)
  listeners.set(key, entries)
  return () => {
    entries.delete(listener)
    if (entries.size === 0) listeners.delete(key)
  }
}

function publishVisual(sessionId: SessionId, view: AppearanceView): void {
  const current = visualSnapshots.get(sessionId)
  if (current !== undefined && current.revision > view.revision) return
  const value = view.visual ?? DEFAULT_VISUAL
  if (current?.revision === view.revision
    && current.value.view === value.view
    && current.value.surface === value.surface
    && current.value.foreground === value.foreground
    && current.value.backgroundVisibility === value.backgroundVisibility) return
  visualSnapshots.set(sessionId, { revision: view.revision, value })
  for (const listener of visualListeners.get(sessionId) ?? []) listener()
}

function subscribeVisual(sessionId: SessionId, listener: () => void): () => void {
  const entries = visualListeners.get(sessionId) ?? new Set<() => void>()
  entries.add(listener)
  visualListeners.set(sessionId, entries)
  return () => {
    entries.delete(listener)
    if (entries.size === 0) visualListeners.delete(sessionId)
  }
}

async function fetchView(sessionId: SessionId, filePath?: string): Promise<AppearanceView | undefined> {
  const query = new URLSearchParams({ session: sessionId })
  if (filePath !== undefined) query.set('file', filePath)
  const response = await fetch(new URL(`api/noven-appearance?${query.toString()}`, document.baseURI), {
    headers: { accept: 'application/json' },
  }).catch(() => undefined)
  if (response === undefined || !response.ok) return undefined
  return await response.json().catch(() => undefined) as AppearanceView | undefined
}

function load(sessionId: SessionId, filePath?: string): Promise<void> {
  const key = keyOf(sessionId, filePath)
  const existing = inflight.get(key)
  if (existing !== undefined) return existing
  const request = fetchView(sessionId, filePath).then((view) => {
    const previous = snapshots.get(key)
    if (view === undefined) {
      publish(key, {
        loading: false,
        error: 'appearance unavailable',
        ...(previous?.view === undefined ? {} : { view: previous.view }),
      })
      return
    }
    if (previous?.view !== undefined && (previous.view.revision > view.revision || previous.view.globalRevision > view.globalRevision)) return
    publishVisual(sessionId, view)
    publish(key, { loading: false, view })
  }).finally(() => { inflight.delete(key) })
  inflight.set(key, request)
  return request
}

/**
 * Submit one user appearance action.
 * @param sessionId - Session authorizing workspace access.
 * @param action - Action body accepted by the appearance route.
 * @returns The updated view, or undefined on failure.
 */
export async function updateAppearance(sessionId: SessionId, action: Record<string, unknown>): Promise<AppearanceView | undefined> {
  const query = new URLSearchParams({ session: sessionId })
  const response = await fetch(new URL(`api/noven-appearance?${query.toString()}`, document.baseURI), {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(action),
  }).catch(() => undefined)
  if (response === undefined || !response.ok) return undefined
  const view = await response.json().catch(() => undefined) as AppearanceView | undefined
  if (view !== undefined) {
    publishVisual(sessionId, view)
    if (action['action'] === 'global_unified') invalidateAllAppearances()
    else invalidateAppearance(sessionId)
  }
  return view
}

/**
 * Upload one image into the project's appearance asset directory.
 * @param sessionId - Session authorizing workspace access.
 * @param file - Browser image file.
 * @returns The workspace-relative image path, or undefined on failure.
 */
export async function uploadAppearanceImage(sessionId: SessionId, file: File): Promise<string | undefined> {
  const query = new URLSearchParams({ session: sessionId })
  const response = await fetch(new URL(`api/noven-appearance/asset?${query.toString()}`, document.baseURI), {
    method: 'POST',
    headers: { 'content-type': file.type || 'application/octet-stream' },
    body: await file.arrayBuffer(),
  }).catch(() => undefined)
  if (response === undefined || !response.ok) return undefined
  const payload = await response.json().catch(() => undefined) as { readonly path?: string } | undefined
  return payload?.path
}

/**
 * Upload one image into the application-wide asset library.
 * @param sessionId - Session authorizing the user request.
 * @param file - Browser image file.
 * @returns The generated global asset ID, or undefined on failure.
 */
export async function uploadGlobalAppearanceImage(sessionId: SessionId, file: File): Promise<string | undefined> {
  const query = new URLSearchParams({ session: sessionId })
  const response = await fetch(new URL(`api/noven-appearance/global-asset?${query.toString()}`, document.baseURI), {
    method: 'POST',
    headers: { 'content-type': file.type || 'application/octet-stream' },
    body: await file.arrayBuffer(),
  }).catch(() => undefined)
  if (response === undefined || !response.ok) return undefined
  const payload = await response.json().catch(() => undefined) as { readonly path?: string } | undefined
  return payload?.path
}

/**
 * Subscribe to one Session/file appearance view.
 * @param sessionId - Viewed Session.
 * @param filePath - File shown by the calling canvas leaf, when file-backed.
 * @returns The latest view while it loads or after failure.
 */
export function useAppearance(sessionId: SessionId | undefined, filePath?: string): AppearanceView | undefined {
  const key = sessionId === undefined ? undefined : keyOf(sessionId, filePath)
  const snapshot = useSyncExternalStore(
    key === undefined ? NO_SUBSCRIBE : listener => subscribe(key, listener),
    () => key === undefined ? IDLE : snapshots.get(key) ?? LOADING,
    () => key === undefined ? IDLE : snapshots.get(key) ?? LOADING,
  )
  useEffect(() => {
    if (sessionId === undefined) return
    let live = true
    const refresh = (): void => {
      if (!live || document.visibilityState === 'hidden') return
      void load(sessionId, filePath)
    }
    refresh()
    const timer = window.setInterval(refresh, POLL_MS)
    return () => {
      live = false
      window.clearInterval(timer)
    }
  }, [sessionId, filePath])
  return snapshot.view
}

/**
 * Subscribe to the Session's shared visual state without waiting for each file's background response.
 * @param sessionId - Current Session whose global view, material, and foreground are projected.
 * @returns The latest published visual state, or the built-in default before the first response.
 */
export function useAppearanceVisual(sessionId: SessionId | undefined): AppearanceVisualState {
  return useSyncExternalStore(
    sessionId === undefined ? NO_SUBSCRIBE : listener => subscribeVisual(sessionId, listener),
    () => sessionId === undefined ? DEFAULT_VISUAL : visualSnapshots.get(sessionId)?.value ?? DEFAULT_VISUAL,
    () => sessionId === undefined ? DEFAULT_VISUAL : visualSnapshots.get(sessionId)?.value ?? DEFAULT_VISUAL,
  )
}

const NO_SUBSCRIBE = (): (() => void) => () => {}

function notifyFile(): void {
  for (const listener of fileListeners) listener()
}

/**
 * Report the file shown by the focused canvas leaf for settings targeting.
 * @param sessionId - Canvas owner Session.
 * @param path - Active file path, or undefined for a non-file tab.
 */
export function setFocusedCanvasFile(sessionId: SessionId, path: string | undefined): void {
  if (activeFile?.sessionId === sessionId && activeFile.path === path) return
  activeFile = { sessionId, path }
  notifyFile()
}

/**
 * Subscribe to the focused canvas file.
 * @returns The current owner Session and file path, if any.
 */
export function useFocusedCanvasFile(): ActiveFile | undefined {
  return useSyncExternalStore(
    listener => { fileListeners.add(listener); return () => { fileListeners.delete(listener) } },
    () => activeFile,
    () => activeFile,
  )
}

/**
 * Build a browser URL for one project or application-wide image.
 * @param sessionId - Session authorizing the user request.
 * @param path - Workspace-relative path or generated global asset ID.
 * @param revision - Owning document revision used as a cache-busting token.
 * @param source - Global selects the restricted application asset endpoint.
 * @returns The authenticated asset URL.
 */
export function appearanceAssetUrl(sessionId: SessionId, path: string, revision: number, source?: 'global'): string {
  const query = new URLSearchParams(source === 'global'
    ? { session: sessionId, id: path, revision: String(revision) }
    : { session: sessionId, path, revision: String(revision) })
  return `api/noven-appearance/${source === 'global' ? 'global-asset' : 'asset'}?${query.toString()}`
}

const FOCUS_POSITION: Record<AppearanceFocus, string> = {
  center: 'center', top: 'center top', bottom: 'center bottom', left: 'left center', right: 'right center',
}

/** @returns The background image layers, with optional user-requested fade. */
function imageLayers(
  sessionId: SessionId,
  background: AppearanceAssetBackground & { readonly source?: 'global' },
  revision: number,
  globalRevision = revision,
): string {
  const layers: string[] = []
  const dim = background.dim ?? 0
  if (dim > 0) {
    const paper = `color-mix(in srgb, var(--dsw-alias-bg-base) ${String(Math.round(dim * 100))}%, transparent)`
    layers.push(`linear-gradient(${paper}, ${paper})`)
  }
  layers.push(`url(${JSON.stringify(appearanceAssetUrl(
    sessionId,
    background.path,
    background.source === 'global' ? globalRevision : revision,
    background.source,
  ))})`)
  return layers.join(', ')
}

const SKIN_VARIABLES = {
  surface: '--nv-surface',
  pane: '--nv-pane',
  canvas: '--nv-canvas',
  hover: '--nv-hover',
  divider: '--nv-divider',
  primary: '--nv-primary-text',
  secondary: '--nv-secondary-text',
  select: '--nv-select',
  accent: '--nv-accent',
  accentDeep: '--nv-accent-deep',
  accentSoft: '--nv-accent-soft',
  labelPrimary: '--dsw-alias-label-primary',
  labelSecondary: '--dsw-alias-label-secondary',
  labelCaption: '--dsw-alias-label-caption',
  labelTertiary: '--dsw-alias-label-tertiary',
  menuIcon: '--dsw-alias-menu-icon',
  interactiveHover: '--dsw-alias-interactive-bg-hover',
  border: '--dsw-alias-border-l3',
  focus: '--dsw-focus-ring-color',
  business: '--dsw-alias-state-business-primary',
  bgLayer1: '--dsw-alias-bg-layer-1',
  bgLayer2: '--dsw-alias-bg-layer-2',
  floating: '--dsw-alias-button-floating-fill',
  codeBlock: '--dsw-alias-markdown-code-block',
  codeBlockAlt: '--dsl-code-block-background',
  island: '--noven-skin-island',
  islandBorder: '--noven-skin-island-border',
  islandShadow: '--noven-skin-island-shadow',
} as const

type SkinKey = keyof typeof SKIN_VARIABLES
type SkinValues = Partial<Record<SkinKey, string>>

function isDefaultVisual(visual: AppearanceVisualState): boolean {
  return visual.view === 'light' && visual.surface === 'auto' && visual.foreground === 'system' && visual.backgroundVisibility === 0.75
}

/** @returns The effective material for this pane, using global state unless a scope overrides it. */
export function appearanceMaterial(
  background: ResolvedAppearanceBackground | null,
  visual: AppearanceVisualState = defaultAppearanceVisual(),
): 'frosted' | 'clear' | undefined {
  const override = background?.material
  if (override === 'clear') return 'clear'
  if (override === 'frosted') return 'frosted'
  if (visual.surface === 'clear') return 'clear'
  if (visual.surface === 'frosted') return 'frosted'
  return background === null ? undefined : 'frosted'
}

function foregroundOf(background: ResolvedAppearanceBackground | null, visual: AppearanceVisualState): 'light' | 'dark' {
  const override = background?.foreground
  if (override === 'light' || override === 'dark') return override
  if (visual.foreground === 'light' || visual.foreground === 'dark') return visual.foreground
  return visual.view === 'dark' ? 'light' : 'dark'
}

function skinValues(background: ResolvedAppearanceBackground | null, visual: AppearanceVisualState): SkinValues {
  if (background === null && isDefaultVisual(visual)) return {}
  const material = appearanceMaterial(background, visual)
  const foreground = foregroundOf(background, visual)
  const visibility = visual.backgroundVisibility
  const surfaceOpacity = Math.max(0.08, 0.68 - 0.5 * visibility)
  const islandOpacity = Math.max(0.06, 0.46 - 0.34 * visibility)
  const values: SkinValues = {}
  if (background === null && visual.view === 'dark' && visual.surface !== 'clear') {
    const base = visual.surface === 'frosted'
      ? `color-mix(in srgb, #0B0F0E ${String(Math.round(surfaceOpacity * 100))}%, transparent)`
      : '#101412'
    values.surface = base
    values.pane = base
    values.canvas = base
    values.bgLayer1 = base
    values.bgLayer2 = base
    values.floating = base
    values.codeBlock = base
    values.codeBlockAlt = base
    if (visual.surface === 'frosted') {
      values.island = `rgba(14, 19, 17, ${String(islandOpacity.toFixed(2))})`
      values.islandBorder = 'rgba(255, 255, 255, 0.14)'
      values.islandShadow = '0 16px 40px rgba(0, 0, 0, 0.16)'
    }
  } else if (material !== undefined) {
    if (material === 'clear') {
      values.surface = 'transparent'
      values.pane = 'transparent'
      values.canvas = 'transparent'
      values.island = 'transparent'
      values.islandBorder = 'transparent'
      values.islandShadow = 'none'
    } else if (foreground === 'light') {
      values.surface = `color-mix(in srgb, #0B0F0E ${String(Math.round(surfaceOpacity * 100))}%, transparent)`
      values.pane = values.surface
      values.canvas = values.surface
      values.island = `rgba(14, 19, 17, ${String(islandOpacity.toFixed(2))})`
      values.islandBorder = 'rgba(255, 255, 255, 0.14)'
      values.islandShadow = '0 16px 40px rgba(0, 0, 0, 0.16)'
    } else {
      values.surface = `color-mix(in srgb, #FFFFFF ${String(Math.round(surfaceOpacity * 100))}%, transparent)`
      values.pane = values.surface
      values.canvas = values.surface
      values.island = `rgba(255, 255, 255, ${String(islandOpacity.toFixed(2))})`
      values.islandBorder = 'rgba(22, 24, 26, 0.12)'
      values.islandShadow = '0 16px 40px rgba(16, 20, 18, 0.12)'
    }
    values.bgLayer1 = values.surface
    values.bgLayer2 = values.surface
    values.floating = values.surface
    values.codeBlock = values.surface
    values.codeBlockAlt = values.surface
  }
  if (foreground === 'light') {
    Object.assign(values, {
      hover: 'rgba(255, 255, 255, 0.12)',
      divider: 'rgba(255, 255, 255, 0.18)',
      primary: '#F4F7F5',
      secondary: 'rgba(244, 247, 245, 0.72)',
      select: '#6EE7B7',
      accent: '#34D399',
      accentDeep: '#6EE7B7',
      accentSoft: 'rgba(52, 211, 153, 0.18)',
      labelPrimary: '#F4F7F5',
      labelSecondary: 'rgba(244, 247, 245, 0.72)',
      labelCaption: 'rgba(244, 247, 245, 0.60)',
      labelTertiary: 'rgba(244, 247, 245, 0.68)',
      menuIcon: '#F4F7F5',
      interactiveHover: 'rgba(255, 255, 255, 0.12)',
      border: 'rgba(255, 255, 255, 0.18)',
      focus: '#6EE7B7',
      business: '#6EE7B7',
    })
  } else {
    Object.assign(values, {
      hover: 'rgba(22, 24, 26, 0.07)',
      divider: 'rgba(22, 24, 26, 0.14)',
      primary: '#16181A',
      secondary: '#5F666B',
      select: '#0E9F6E',
      accent: '#34D399',
      accentDeep: '#0E9F6E',
      accentSoft: 'rgba(52, 211, 153, 0.12)',
      labelPrimary: '#16181A',
      labelSecondary: '#5F666B',
      labelCaption: '#8A8F94',
      labelTertiary: '#5F666B',
      menuIcon: '#16181A',
      interactiveHover: 'rgba(22, 24, 26, 0.07)',
      border: 'rgba(22, 24, 26, 0.14)',
      focus: '#0E9F6E',
      business: '#0E9F6E',
    })
  }
  return values
}

interface CanvasBackgroundStyle extends CSSProperties {
  [key: `--${string}`]: string | undefined
}

/**
 * Build one canvas leaf's actual background, never an overlay element.
 * @param sessionId - Canvas owner Session.
 * @param background - Resolved canvas background.
 * @param revision - Appearance revision for asset caching.
 * @param visual - Global material and foreground state.
 * @param globalRevision - Global document revision for application-wide assets.
 * @returns Inline background style for the resolved leaf.
 */
export function canvasBackgroundStyle(
  sessionId: SessionId,
  background: ResolvedAppearanceBackground | null,
  revision: number,
  visual: AppearanceVisualState = defaultAppearanceVisual(),
  globalRevision = revision,
): CanvasBackgroundStyle {
  if (background === null && isDefaultVisual(visual)) {
    return { backgroundColor: 'var(--nv-surface)', backgroundImage: 'none' }
  }
  const skin: Record<string, string> = {}
  const values = skinValues(background, visual)
  for (const [key, property] of Object.entries(SKIN_VARIABLES)) {
    const value = values[key as SkinKey]
    if (value !== undefined) skin[property] = value
  }
  skin['--noven-canvas-skin-backdrop'] = appearanceMaterial(background, visual) === 'frosted'
    ? 'blur(18px) saturate(1.15)'
    : 'none'
  if (background === null) {
    return {
      ...skin,
      backgroundColor: visual.surface === 'clear' ? 'transparent' : visual.view === 'dark' ? '#101412' : 'var(--nv-surface)',
      backgroundImage: 'none',
    }
  }
  if (background.kind === 'transparent') {
    return { ...skin, backgroundColor: 'transparent', backgroundImage: 'none' }
  }
  const layers = imageLayers(sessionId, background, revision, globalRevision)
  const position = FOCUS_POSITION[background.focus ?? 'center']
  const blur = background.blur ?? 0
  if (blur > 0) {
    return {
      ...skin,
      backgroundColor: 'transparent',
      backgroundImage: 'none',
      '--noven-canvas-background-layer': layers,
      '--noven-canvas-background-position': position,
      '--noven-canvas-background-blur': `${String(blur)}px`,
    }
  }
  return {
    ...skin,
    backgroundColor: 'transparent',
    backgroundImage: layers,
    backgroundSize: 'cover',
    backgroundPosition: position,
    backgroundClip: 'border-box',
  }
}

/**
 * Refresh all views for one Session after a user mutation.
 * @param sessionId - Session whose cached views changed.
 */
export function invalidateAppearance(sessionId: SessionId): void {
  const prefix = prefixOf(sessionId)
  for (const key of snapshots.keys()) {
    if (!key.startsWith(prefix)) continue
    const filePath = key.slice(prefix.length)
    void load(sessionId, filePath === '' ? undefined : filePath)
  }
}

/** Refresh every workspace after an application-wide default changes. */
function invalidateAllAppearances(): void {
  for (const key of snapshots.keys()) {
    const separator = key.indexOf('\u0000')
    if (separator < 0) continue
    const sessionId = key.slice(0, separator) as SessionId
    const filePath = key.slice(separator + 1)
    void load(sessionId, filePath === '' ? undefined : filePath)
  }
}

/** Host-provided current Session and theme observables for the root visual overlay. */
export interface AppearanceEffectsInjected {
  readonly current: ObservableSnapshot<SessionId | undefined>
  readonly scheme: ObservableSnapshot<'light' | 'dark'>
  readonly theme: Pick<ThemeRuntime, 'getTheme' | 'overrideTokens' | 'setTheme'>
}

function setVariable(name: string, value: string | undefined): void {
  // Theme tokens are declared on `body`; a custom property holding one of those
  // tokens must also live there or substitution would see an invalid value.
  if (value === undefined) document.body.style.removeProperty(name)
  else document.body.style.setProperty(name, value)
}

function setSkinVariables(prefix: 'shell' | 'conversation', background: ResolvedAppearanceBackground | null, visual: AppearanceVisualState): void {
  const values = skinValues(background, visual)
  for (const key of Object.keys(SKIN_VARIABLES) as SkinKey[]) {
    setVariable(`--noven-${prefix}-skin-${key}`, values[key])
  }
  setVariable(`--noven-${prefix}-skin-backdrop`, appearanceMaterial(background, visual) === 'frosted'
    ? 'blur(18px) saturate(1.15)'
    : undefined)
}

const GLOBAL_SKIN_KEYS = [
  'primary', 'secondary', 'labelPrimary', 'labelSecondary', 'labelCaption', 'labelTertiary', 'menuIcon', 'interactiveHover', 'border',
] as const satisfies readonly SkinKey[]

function clearAppearance(): void {
  document.documentElement.removeAttribute('data-noven-shell-appearance')
  document.documentElement.removeAttribute('data-noven-shell-blur')
  document.documentElement.removeAttribute('data-noven-shell-skin')
  document.documentElement.removeAttribute('data-noven-shell-foreground')
  document.documentElement.removeAttribute('data-noven-conversation-appearance')
  document.documentElement.removeAttribute('data-noven-conversation-image')
  document.documentElement.removeAttribute('data-noven-conversation-blur')
  document.documentElement.removeAttribute('data-noven-conversation-skin')
  document.documentElement.removeAttribute('data-noven-conversation-foreground')
  document.documentElement.removeAttribute('data-noven-assistant-avatar')
  for (const prefix of ['shell', 'conversation'] as const) {
    for (const key of Object.keys(SKIN_VARIABLES)) setVariable(`--noven-${prefix}-skin-${key}`, undefined)
    setVariable(`--noven-${prefix}-skin-backdrop`, undefined)
  }
  for (const key of ['hover', 'divider', 'primary', 'secondary', 'select', 'accent', 'accentDeep', 'accentSoft', 'labelPrimary', 'labelSecondary', 'labelCaption', 'labelTertiary', 'menuIcon', 'interactiveHover', 'border', 'focus', 'business']) {
    setVariable(`--noven-system-${key}`, undefined)
  }
  for (const name of [
    '--noven-shell-background-image', '--noven-shell-background-color', '--noven-shell-background-position',
    '--noven-shell-background-layer', '--noven-shell-background-blur', '--noven-sidebar-background',
    '--noven-shell-child-background', '--noven-conversation-background-image', '--noven-conversation-background-color',
    '--noven-conversation-background-position', '--noven-conversation-background-layer', '--noven-conversation-background-blur',
    '--noven-conversation-composer-background', '--noven-conversation-reading-surface',
    '--noven-conversation-reading-padding', '--noven-conversation-chrome-background',
    '--noven-inline-block-background', '--noven-assistant-avatar-image',
  ]) setVariable(name, undefined)
}

function backgroundVariables(
  prefix: 'shell' | 'conversation',
  sessionId: SessionId,
  background: ResolvedAppearanceBackground | null,
  revision: number,
  visual: AppearanceVisualState,
  globalRevision = revision,
): void {
  if (background === null) {
    setVariable(`--noven-${prefix}-background-image`, undefined)
    setVariable(`--noven-${prefix}-background-color`, visual.surface === 'clear'
      ? 'transparent'
      : visual.view === 'dark' ? '#101412' : prefix === 'conversation' ? 'var(--nv-surface)' : undefined)
    setVariable(`--noven-${prefix}-background-position`, undefined)
    setVariable(`--noven-${prefix}-background-layer`, undefined)
    setVariable(`--noven-${prefix}-background-blur`, undefined)
    return
  }
  setVariable(`--noven-${prefix}-background-color`, 'transparent')
  const blur = background.kind === 'asset' ? background.blur ?? 0 : 0
  setVariable(`--noven-${prefix}-background-image`, background.kind === 'transparent' || blur > 0
    ? 'none'
    : imageLayers(sessionId, background, revision, globalRevision))
  setVariable(`--noven-${prefix}-background-position`, background.kind === 'transparent'
    ? undefined
    : FOCUS_POSITION[background.focus ?? 'center'])
  setVariable(`--noven-${prefix}-background-layer`, background.kind === 'transparent' || blur === 0
    ? undefined
    : imageLayers(sessionId, background, revision, globalRevision))
  setVariable(`--noven-${prefix}-background-blur`, blur === 0 ? undefined : `${String(blur)}px`)
}

/**
 * Apply the workspace shell, conversation, avatar, and inline transparency
 * variables for the current Session without touching layout or component keys.
 * @param props - Current Session observable and the theme runtime that owns global overlay tokens.
 * @returns No DOM; the root variables carry the presentation.
 */
export function AppearanceEffects({ current, scheme, theme }: AppearanceEffectsInjected): ReactNode {
  const sessionId = useSyncExternalStore(current.subscribe, current.getSnapshot, current.getSnapshot)
  const view = useAppearance(sessionId)
  const viewRef = useRef(view)
  viewRef.current = view
  const applyingView = useRef(false)
  useEffect(() => clearAppearance, [])
  useEffect(() => {
    if (sessionId === undefined || view === undefined) {
      clearAppearance()
      return
    }
    const system = {
      hover: 'var(--nv-hover)',
      divider: 'var(--nv-divider)',
      primary: 'var(--nv-primary-text)',
      secondary: 'var(--nv-secondary-text)',
      select: 'var(--nv-select)',
      accent: 'var(--nv-accent)',
      accentDeep: 'var(--nv-accent-deep)',
      accentSoft: 'var(--nv-accent-soft)',
      labelPrimary: 'var(--dsw-alias-label-primary)',
      labelSecondary: 'var(--dsw-alias-label-secondary)',
      labelCaption: 'var(--dsw-alias-label-caption)',
      labelTertiary: 'var(--dsw-alias-label-tertiary)',
      menuIcon: 'var(--dsw-alias-menu-icon)',
      interactiveHover: 'var(--dsw-alias-interactive-bg-hover)',
      border: 'var(--dsw-alias-border-l3)',
      focus: 'var(--dsw-focus-ring-color, var(--dsw-alias-state-business-primary))',
      business: 'var(--dsw-alias-state-business-primary)',
    } as const
    for (const [key, value] of Object.entries(system)) setVariable(`--noven-system-${key}`, value)
    const visual = view.visual ?? defaultAppearanceVisual()
    if (theme.getTheme().active.colorScheme !== visual.view) {
      applyingView.current = true
      try { theme.setTheme(visual.view) } finally { applyingView.current = false }
    }
    const globalSkin = skinValues(null, visual)
    const overrides: ThemeTokenOverrides = {}
    for (const key of GLOBAL_SKIN_KEYS) {
      const value = globalSkin[key]
      if (value !== undefined) overrides[SKIN_VARIABLES[key]] = { light: value, dark: value }
    }
    const menu = globalSkin.island ?? globalSkin.surface
    if (menu !== undefined) {
      overrides['--dsw-menu-surface-fill'] = { light: menu, dark: menu }
      overrides['--dsw-specific-menu'] = { light: menu, dark: menu }
    }
    const disposeTheme = theme.overrideTokens('noven-appearance', overrides)
    document.documentElement.toggleAttribute('data-noven-shell-appearance', view.resolved.shell !== null)
    backgroundVariables('shell', sessionId, view.resolved.shell, view.revision, visual, view.globalRevision)
    setSkinVariables('shell', view.resolved.shell, visual)
    document.documentElement.toggleAttribute('data-noven-shell-blur', view.resolved.shell?.kind === 'asset' && (view.resolved.shell.blur ?? 0) > 0)
    const shellMaterial = appearanceMaterial(view.resolved.shell, visual)
    if (shellMaterial === undefined) document.documentElement.removeAttribute('data-noven-shell-skin')
    else document.documentElement.setAttribute('data-noven-shell-skin', shellMaterial)
    if (view.resolved.shell === null && isDefaultVisual(visual)) document.documentElement.removeAttribute('data-noven-shell-foreground')
    else document.documentElement.setAttribute('data-noven-shell-foreground', foregroundOf(view.resolved.shell, visual))
    setVariable('--noven-sidebar-background', view.resolved.shell === null ? undefined : 'transparent')
    setVariable('--noven-shell-child-background', view.resolved.shell === null ? undefined : 'transparent')
    backgroundVariables('conversation', sessionId, view.resolved.conversation, view.revision, visual, view.globalRevision)
    setSkinVariables('conversation', view.resolved.conversation, visual)
    const conversation = view.resolved.conversation
    document.documentElement.toggleAttribute('data-noven-conversation-appearance', conversation !== null)
    document.documentElement.toggleAttribute('data-noven-conversation-image', conversation?.kind === 'asset')
    document.documentElement.toggleAttribute('data-noven-conversation-blur', conversation?.kind === 'asset' && (conversation.blur ?? 0) > 0)
    const conversationMaterial = appearanceMaterial(conversation, visual)
    if (conversationMaterial === undefined) document.documentElement.removeAttribute('data-noven-conversation-skin')
    else document.documentElement.setAttribute('data-noven-conversation-skin', conversationMaterial)
    if (conversation === null && isDefaultVisual(visual)) document.documentElement.removeAttribute('data-noven-conversation-foreground')
    else document.documentElement.setAttribute('data-noven-conversation-foreground', foregroundOf(conversation, visual))
    setVariable('--noven-conversation-composer-background', conversation === null ? undefined : 'transparent')
    setVariable('--noven-conversation-reading-surface', conversation === null ? undefined : 'transparent')
    setVariable('--noven-conversation-reading-padding', conversation === null ? undefined : '12px 18px')
    setVariable('--noven-conversation-chrome-background', conversation === null ? undefined : 'transparent')
    setVariable('--noven-inline-block-background', conversation === null ? undefined : 'transparent')
    const avatar = view.resolved.assistantAvatar
    document.documentElement.toggleAttribute('data-noven-assistant-avatar', avatar !== null)
    setVariable('--noven-assistant-avatar-image', avatar === null ? undefined : `url(${JSON.stringify(appearanceAssetUrl(sessionId, avatar.path, view.revision))})`)
    return disposeTheme
  }, [sessionId, theme, view])
  useEffect(() => {
    if (sessionId === undefined) return
    // Appearance owns the persisted view. Late theme snapshots must not turn
    // into a second write source: reassert the document's view instead.
    return scheme.subscribe(() => {
      const currentView = viewRef.current
      if (currentView === undefined || applyingView.current) return
      const visual = currentView.visual ?? defaultAppearanceVisual()
      if (scheme.getSnapshot() === visual.view) return
      applyingView.current = true
      try { theme.setTheme(visual.view) } finally { applyingView.current = false }
    })
  }, [sessionId, scheme, theme])
  return null
}
