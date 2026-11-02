/**
 * The model's complete appearance authority: canvas background and
 * conversation background/avatar. The tools bind themselves to the executing
 * Session and provide no Agent, navigation, file-content, or settings writes.
 * @module noven-shell/appearance/tools
 */
import type { Context } from '@deepseek-ai/cordis'
import { defineTool, type ToolDefinition } from '@deepseek-ai/dsh-tools'
import type {} from '@deepseek-ai/dsh-session'
import type { SessionId } from '@deepseek-ai/dsh-session/types'
import type { AppearanceForeground, AppearanceMaterial } from './model.ts'
import type { BackgroundChoice, AvatarChoice } from './service.ts'
import { setCanvasAppearance, setConversationAppearance } from './service.ts'

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

/**
 * Create the two authorized appearance tool definitions.
 * @returns The canvas and conversation appearance tools.
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
        image_path: view.resolved.canvas?.kind === 'asset' ? view.resolved.canvas.path : null,
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
        conversation_image: view.resolved.conversation?.kind === 'asset' ? view.resolved.conversation.path : null,
        material: view.resolved.conversation?.material ?? 'auto',
        foreground: view.resolved.conversation?.foreground ?? 'system',
        avatar_path: view.resolved.assistantAvatar?.path ?? null,
      }
    },
  })]
}

/**
 * Register the two authorized appearance tools.
 * @param ctx - Host context carrying the tool registry.
 */
export function registerAppearanceTools(ctx: Context): void {
  for (const tool of createAppearanceTools()) {
    ctx.effect(() => ctx.tools.register(tool), `noven-shell: ${tool.name}`)
  }
}
