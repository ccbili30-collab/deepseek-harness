/**
 * The model's complete appearance authority: canvas background, conversation
 * background/avatar, and Session/File soundtracks with independent foregrounds.
 * The tools bind themselves to the executing Session and provide no Agent,
 * navigation, file-content, or settings writes.
 * @module noven-shell/appearance/tools
 */
import type { Context } from '@deepseek-ai/cordis'
import { defineTool, type ToolDefinition } from '@deepseek-ai/dsh-tools'
import type {} from '@deepseek-ai/dsh-session'
import type { SessionId } from '@deepseek-ai/dsh-session/types'
import type {
  AppearanceForeground, AppearanceMaterial, AppearanceObjectForeground, AppearanceSoundtrack, AppearanceView,
} from './model.ts'
import type { BackgroundChoice, AvatarChoice } from './service.ts'
import {
  listAppearanceAudio, readTrackAppearance, setCanvasAppearance, setConversationAppearance, setTrackAppearance,
} from './service.ts'

type JsonValue = null | boolean | number | string | JsonValue[] | { [key: string]: JsonValue }

const RESULT_SCHEMA = { type: 'object' as const, additionalProperties: true as const }

function render(_args: unknown, value: Record<string, unknown>): { type: 'text'; text: string }[] {
  return [{ type: 'text', text: JSON.stringify(value) }]
}

function sessionOf(exec: { readonly agent?: { readonly session: { readonly id: SessionId; readonly header: { readonly cwd?: string } } } }): { readonly id: SessionId; readonly root: string } {
  const session = exec.agent?.session
  if (session === undefined || session.header.cwd === undefined) throw new Error('appearance tools require a Session with a workspace')
  return { id: session.id, root: session.header.cwd }
}

function revision(value: unknown): number | undefined {
  if (value === undefined || value === '') return undefined
  if (typeof value !== 'number' || !Number.isSafeInteger(value) || value < 0) throw new Error('expected_revision must be a non-negative integer')
  return value
}

function choice(
  kind: unknown,
  path: unknown,
  field: string,
  material: unknown,
  foreground: unknown,
): BackgroundChoice | undefined {
  if (kind === undefined) {
    if (path !== undefined) throw new Error(`${field} requires ${field}_kind`)
    if (material !== undefined || foreground !== undefined) throw new Error(`${field}_material and ${field}_foreground require ${field}_kind`)
    return undefined
  }
  if (kind !== 'default' && kind !== 'transparent' && kind !== 'image') throw new Error(`${field}_kind must be default, transparent, or image`)
  if (path !== undefined && typeof path !== 'string') throw new Error(`${field}_path must be a string`)
  if (material !== undefined && material !== 'auto' && material !== 'frosted' && material !== 'clear') {
    throw new Error(`${field}_material must be auto, frosted, or clear`)
  }
  if (foreground !== undefined && foreground !== 'system' && foreground !== 'light' && foreground !== 'dark') {
    throw new Error(`${field}_foreground must be system, light, or dark`)
  }
  return {
    kind,
    ...(path === undefined ? {} : { imagePath: path }),
    ...(material === undefined ? {} : { material: material as AppearanceMaterial }),
    ...(foreground === undefined ? {} : { foreground: foreground as AppearanceForeground }),
  }
}

function trackValue(track: AppearanceSoundtrack | null | undefined): Record<string, JsonValue> | null {
  if (track === null || track === undefined) return null
  return { path: track.path, volume: track.volume ?? null, loop: track.loop ?? null }
}

function appearanceSummary(view: AppearanceView): Record<string, JsonValue> {
  return {
    revision: view.revision,
    global_revision: view.globalRevision,
    workspace_canvas_track: trackValue(view.workspace.canvasTrack),
    session_track: trackValue(view.session.track),
    session_foreground: view.session.foreground ?? null,
    file_path: view.filePath ?? null,
    file_track: trackValue(view.file?.track),
    file_foreground: view.file?.foreground ?? null,
    resolved_canvas_track: trackValue(view.resolved.canvasTrack),
    resolved_conversation_track: trackValue(view.resolved.conversationTrack),
    resolved_canvas_foreground: view.resolved.canvasForeground,
    resolved_conversation_foreground: view.resolved.conversationForeground,
  }
}

/**
 * Create the four authorized appearance tool definitions.
 * @returns The canvas, conversation, soundtrack-list, and soundtrack-write tools.
 */
export function createAppearanceTools(): readonly ToolDefinition[] {
  return [defineTool({
    name: 'set_canvas_appearance',
    description: 'Set the canvas background for the current workspace default or one existing project file. Only presentation changes: file text, editor state, messages, Agents, tools, and navigation are untouched. Use generate_image first when a new background is needed, then pass the returned project path (absolute inside the workspace or relative).',
    parameters: {
      scope: { type: 'string', required: true, enum: ['workspace', 'file'], description: 'workspace default, or one file override' },
      path: { type: 'string', description: 'Existing project-relative file path; required for file scope and omitted for workspace scope' },
      background_kind: { type: 'string', required: true, enum: ['default', 'transparent', 'image'], description: 'default removes the override; transparent or image sets one' },
      image_path: { type: 'string', description: 'Project-relative raster image for background_kind=image' },
      material: { type: 'string', enum: ['auto', 'frosted', 'clear'], description: 'Embedded control material; auto keeps native controls and frosts them when a background is set' },
      foreground: { type: 'string', enum: ['system', 'light', 'dark'], description: 'Semantic text/icon color family; choose light on dark imagery, never infer from pixels' },
      expected_revision: { type: 'integer', description: 'Optional appearance revision the model last read; stale writes are rejected' },
    },
    output: { schema: RESULT_SCHEMA, render },
    async execute(args, exec) {
      const session = sessionOf(exec)
      const scope = String(args.scope)
      if (scope !== 'workspace' && scope !== 'file') throw new Error('scope must be workspace or file')
      const filePath = typeof args.path === 'string' && args.path !== '' ? args.path : undefined
      if (scope === 'file' && filePath === undefined) throw new Error('file scope requires path')
      if (scope === 'workspace' && filePath !== undefined) throw new Error('workspace scope does not take path')
      const input = choice(
        args.background_kind,
        typeof args.image_path === 'string' ? args.image_path : undefined,
        'background',
        args.material,
        args.foreground,
      )
      if (input === undefined) throw new Error('background_kind is required')
      const expected = revision(args.expected_revision)
      const view = await setCanvasAppearance(session.root, session.id, {
        scope,
        ...(filePath === undefined ? {} : { filePath }),
        background: input,
        ...(expected === undefined ? {} : { expectedRevision: expected }),
      })
      return {
        revision: view.revision,
        scope,
        ...(scope === 'file' ? { file_path: view.filePath } : {}),
        background_kind: view.resolved.canvas?.kind ?? 'default',
        image_path: view.resolved.canvas?.kind === 'asset' && view.resolved.canvas.source !== 'global' ? view.resolved.canvas.path : null,
        image_source: view.resolved.canvas?.kind === 'asset' ? view.resolved.canvas.source ?? 'workspace' : null,
        material: view.resolved.canvas?.material ?? 'auto',
        foreground: view.resolved.canvas?.foreground ?? 'system',
      }
    },
  }), defineTool({
    name: 'set_conversation_appearance',
    description: 'Set the conversation background and/or AI avatar for the workspace default or the current Session. This changes only presentation; it never creates an Agent and never changes model, prompt, tools, identity, messages, or navigation. Use generate_image first when a new image is needed, then pass the returned project path (absolute inside the workspace or relative).',
    parameters: {
      scope: { type: 'string', required: true, enum: ['workspace', 'session'], description: 'workspace default, or the current Session override' },
      background_kind: { type: 'string', enum: ['default', 'transparent', 'image'], description: 'Omit to leave the background unchanged; default removes the override' },
      image_path: { type: 'string', description: 'Project-relative raster image for background_kind=image' },
      material: { type: 'string', enum: ['auto', 'frosted', 'clear'], description: 'Embedded control material; auto keeps native controls and frosts them when a background is set' },
      foreground: { type: 'string', enum: ['system', 'light', 'dark'], description: 'Semantic text/icon color family; choose light on dark imagery, never infer from pixels' },
      avatar_kind: { type: 'string', enum: ['default', 'image'], description: 'Omit to leave the avatar unchanged; default removes the override' },
      avatar_path: { type: 'string', description: 'Project-relative raster image for avatar_kind=image' },
      expected_revision: { type: 'integer', description: 'Optional appearance revision the model last read; stale writes are rejected' },
    },
    output: { schema: RESULT_SCHEMA, render },
    async execute(args, exec) {
      const session = sessionOf(exec)
      const scope = String(args.scope)
      if (scope !== 'workspace' && scope !== 'session') throw new Error('scope must be workspace or session')
      const background = choice(
        args.background_kind,
        typeof args.image_path === 'string' ? args.image_path : undefined,
        'background',
        args.material,
        args.foreground,
      )
      const rawAvatar = args.avatar_kind
      if (rawAvatar !== undefined && rawAvatar !== 'default' && rawAvatar !== 'image') throw new Error('avatar_kind must be default or image')
      if (rawAvatar === undefined && args.avatar_path !== undefined) throw new Error('avatar_path requires avatar_kind')
      const avatar: AvatarChoice | undefined = rawAvatar === undefined
        ? undefined
        : { kind: rawAvatar, ...(typeof args.avatar_path === 'string' ? { imagePath: args.avatar_path } : {}) }
      if (background === undefined && avatar === undefined) throw new Error('provide a background or avatar change')
      const expected = revision(args.expected_revision)
      const view = await setConversationAppearance(session.root, session.id, {
        scope,
        ...(background === undefined ? {} : { background }),
        ...(avatar === undefined ? {} : { avatar }),
        ...(expected === undefined ? {} : { expectedRevision: expected }),
      })
      return {
        revision: view.revision,
        scope,
        conversation_kind: view.resolved.conversation?.kind ?? 'default',
        conversation_image: view.resolved.conversation?.kind === 'asset' && view.resolved.conversation.source !== 'global' ? view.resolved.conversation.path : null,
        conversation_source: view.resolved.conversation?.kind === 'asset' ? view.resolved.conversation.source ?? 'workspace' : null,
        material: view.resolved.conversation?.material ?? 'auto',
        foreground: view.resolved.conversation?.foreground ?? 'system',
        avatar_path: view.resolved.assistantAvatar?.path ?? null,
      }
    },
  }), defineTool({
    name: 'list_soundtracks',
    description: 'Read the workspace canvas default, current Session soundtrack and independent foreground, plus an optional existing file override and the values each one currently resolves to. Returns project audio files that set_soundtrack may reference. Use this before changing soundtracks so inheritance and the current revision are explicit.',
    parameters: {
      path: { type: 'string', description: 'Optional existing project-relative file whose canvas soundtrack and foreground should also be reported' },
    },
    output: { schema: RESULT_SCHEMA, render },
    async execute(args, exec) {
      const session = sessionOf(exec)
      const filePath = typeof args.path === 'string' && args.path !== '' ? args.path : undefined
      const [view, audio] = await Promise.all([
        readTrackAppearance(session.root, session.id, filePath),
        listAppearanceAudio(session.root),
      ])
      return {
        ...appearanceSummary(view),
        audio_files: [...audio.paths],
        audio_files_total: audio.total,
        audio_files_truncated: audio.truncated,
      }
    },
  }), defineTool({
    name: 'set_soundtrack',
    description: 'Set or clear a project soundtrack for the workspace canvas default, one existing file, or the current Session, and optionally set that object\'s independent text foreground. This changes appearance only; it never starts playback, creates a Session, changes messages, or uploads or generates audio. Bind only an existing project MP3, WAV, or Ogg path returned by list_soundtracks or otherwise verified; choose light/dark/invert only for text, and omit foreground to leave it unchanged.',
    parameters: {
      scope: { type: 'string', required: true, enum: ['workspace', 'file', 'session'], description: 'workspace canvas default, one existing file, or the current Session' },
      path: { type: 'string', description: 'Existing project-relative file for scope=file; omit for workspace and session' },
      track_kind: { type: 'string', enum: ['default', 'audio'], description: 'Omit to leave the soundtrack unchanged; default removes this scope\'s track so it inherits, audio binds audio_path' },
      audio_path: { type: 'string', description: 'Existing project-relative MP3, WAV, or Ogg path for track_kind=audio' },
      volume: { type: 'number', description: 'Playback volume from 0 to 1; only with track_kind=audio' },
      loop: { type: 'boolean', description: 'Whether the soundtrack loops; only with track_kind=audio' },
      foreground: { type: 'string', enum: ['default', 'light', 'dark', 'invert'], description: 'Independent text/icon foreground for the file or current Session; default removes the override and inherits, omit to leave unchanged. Workspace has no independent foreground' },
      expected_revision: { type: 'integer', description: 'Optional appearance revision the model last read; stale writes are rejected' },
    },
    output: { schema: RESULT_SCHEMA, render },
    async execute(args, exec) {
      const session = sessionOf(exec)
      const scope = String(args.scope)
      if (scope !== 'workspace' && scope !== 'file' && scope !== 'session') throw new Error('scope must be workspace, file, or session')
      const filePath = typeof args.path === 'string' && args.path !== '' ? args.path : undefined
      if (scope === 'file' && filePath === undefined) throw new Error('file scope requires path')
      if (scope !== 'file' && args.path !== undefined) throw new Error(`${scope} scope does not take path`)
      const rawKind = args.track_kind
      if (rawKind !== undefined && rawKind !== 'default' && rawKind !== 'audio') throw new Error('track_kind must be default or audio')
      const audioPath = args.audio_path
      if (audioPath !== undefined && typeof audioPath !== 'string') throw new Error('audio_path must be a string')
      const volume = args.volume
      const loop = args.loop
      if (volume !== undefined && (typeof volume !== 'number' || !Number.isFinite(volume) || volume < 0 || volume > 1)) {
        throw new Error('volume must be between 0 and 1')
      }
      if (loop !== undefined && typeof loop !== 'boolean') throw new Error('loop must be boolean')
      if (rawKind !== 'audio' && (audioPath !== undefined || volume !== undefined || loop !== undefined)) {
        throw new Error('audio_path, volume, and loop require track_kind=audio')
      }
      if (rawKind === 'audio' && (audioPath === undefined || audioPath === '')) throw new Error('track_kind=audio requires audio_path')
      const rawForeground = args.foreground
      if (rawForeground !== undefined && rawForeground !== 'default' && rawForeground !== 'light'
        && rawForeground !== 'dark' && rawForeground !== 'invert') {
        throw new Error('foreground must be default, light, dark, or invert')
      }
      if (scope === 'workspace' && rawForeground !== undefined) throw new Error('workspace scope has no independent foreground')
      if (rawKind === undefined && rawForeground === undefined) throw new Error('provide a soundtrack or foreground change')
      const track = rawKind === undefined
        ? undefined
        : rawKind === 'default'
          ? { kind: 'default' as const }
          : {
              kind: 'audio' as const,
              audioPath,
              ...(volume === undefined ? {} : { volume }),
              ...(loop === undefined ? {} : { loop }),
            }
      const foreground = rawForeground as 'default' | AppearanceObjectForeground | undefined
      const expected = revision(args.expected_revision)
      const view = await setTrackAppearance(session.root, session.id, {
        scope,
        ...(filePath === undefined ? {} : { filePath }),
        ...(track === undefined ? {} : { track }),
        ...(foreground === undefined ? {} : { foreground }),
        ...(expected === undefined ? {} : { expectedRevision: expected }),
      })
      return { scope, ...appearanceSummary(view) }
    },
  })]
}

/**
 * Register the four authorized appearance tools.
 * @param ctx - Host context carrying the tool registry.
 */
export function registerAppearanceTools(ctx: Context): void {
  for (const tool of createAppearanceTools()) {
    ctx.effect(() => ctx.tools.register(tool), `noven-shell: ${tool.name}`)
  }
}
