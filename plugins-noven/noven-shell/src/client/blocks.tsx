/**
 * Conversation inline blocks. `code` renders validated message-owned component
 * data without files or iframes; `module` addresses an existing card module and
 * reuses its display-only ModuleSurface. Source resolution happens in the
 * container, so neither renderer reads the current Session or surrounding surface.
 * @module noven-shell/client/blocks
 */
import { useCallback, useMemo } from 'react'
import type { Context as ClientContext } from '@deepseek-ai/cordis'
import type { SessionId } from '@deepseek-ai/dsh-session/types'
import type { CardAddr, CardDocView, CardModuleDoc, CardState } from './card-api.ts'
import { cardContentUrl, cardOp, fetchCard } from './card-api.ts'
import type { WidgetSend } from './widgets.tsx'
import { findModule } from './pages/card-tree.ts'
import type { ShellT } from './pages/Home.tsx'
import { ModuleSurface } from './module-surface.tsx'
import { mapResultChannel } from './map-result-channel.ts'
import { readModuleSource, resolveModuleSource } from './module-source.ts'
import { InlineCodeBlock } from './code/CodeBlock.tsx'
import { registerCodeChoiceCodec } from './code/choice-codec.ts'
import { useRetainedCard } from './ui/retain.ts'

/** Host services needed to read module content; no navigation or write services. */
export interface InlineBlockDependencies {
  readonly t: ShellT
  readonly readFile: (sessionId: SessionId, path: string) => Promise<string | undefined>
  readonly resolveProjectAsset: (sessionId: SessionId, path: string, base?: string) => Promise<Blob | null>
}

type ModuleOwner = CardDocView | CardDocView['characters'][number]

/** Find a module in the card root or one of its internal character documents. */
function findOwnedModule(document: CardDocView, moduleId: string): { readonly owner: ModuleOwner, readonly module: CardModuleDoc } | undefined {
  const root = findModule(document.modules, moduleId)
  if (root !== undefined) return { owner: document, module: root }
  for (const owner of document.characters) {
    const module = findModule(owner.modules, moduleId)
    if (module !== undefined) return { owner, module }
  }
  return undefined
}

/**
 * Create the only write channel available to an inline map: results for its own
 * consumed generation request. Calls are serialized so terrain summaries and
 * documents advance one card version without exposing other editor commands.
 * @param addr - Session or workspace containing the card.
 * @param state - Loaded card revision used to start the write chain.
 * @param targetId - Root card or nested character document that owns the module.
 * @param moduleId - The only module this channel may modify.
 * @returns A narrow command sender; unauthorized or failed writes return false.
 */
export function createInlineMapSender(addr: CardAddr, state: CardState, targetId: string, moduleId: string): WidgetSend {
  let version = state.version
  let pending = Promise.resolve()
  return mapResultChannel(moduleId, async command => {
    const write = pending.then(async () => {
      try {
        const result = await cardOp(addr, { op: 'apply', cardId: state.cardId, targetId, version, command })
        if (result.version !== undefined) version = result.version
        return result.ok !== false
      } catch {
        return false
      }
    })
    pending = write.then(() => undefined)
    return write
  })
}

/** A display-only existing module loaded through its container-resolved address. */
export function ModuleBlock({ src, title, dependencies }: {
  readonly src: string
  readonly title: string | undefined
  readonly dependencies: InlineBlockDependencies
}) {
  const source = useMemo(() => readModuleSource(src), [src])
  const addr = useMemo<CardAddr>(() => ({
    sessionId: source?.sessionId as SessionId,
    ...(source?.workspaceRoot === '' ? {} : { root: source?.workspaceRoot }),
  }), [source])
  const retained = useRetainedCard(source === undefined ? null : addr, source?.cardId, fetchCard)
  const loaded = useMemo(() => {
    if (source === undefined) return null
    if (retained.state === 'loading') return undefined
    if (retained.state === undefined) return null
    const found = findOwnedModule(retained.state.document, source.moduleId)
    return found === undefined ? null : { state: retained.state, ...found }
  }, [retained.state, source])
  const mapSend = useMemo(() => loaded === undefined || loaded === null
    ? undefined
    : createInlineMapSender(addr, loaded.state, loaded.owner.id, loaded.module.id), [addr, loaded])
  const imageUrl = useCallback((resourceId: string): string => {
    if (source === undefined || loaded === undefined || loaded === null) return ''
    const ref = loaded.state.resources.find(resource => resource.id === resourceId)?.ref
    return ref === undefined ? '' : cardContentUrl(source.workspaceRoot, loaded.state.dir, ref)
  }, [loaded, source])
  const readFile = useCallback((path: string): Promise<string | undefined> => source === undefined
    ? Promise.resolve(undefined)
    : dependencies.readFile(source.sessionId as SessionId, path), [dependencies, source])
  const resolveProjectAsset = useCallback((path: string, base?: string): Promise<Blob | null> => source === undefined
    ? Promise.resolve(null)
    : dependencies.resolveProjectAsset(source.sessionId as SessionId, path, base), [dependencies, source])
  if (retained.error !== undefined && loaded === null) {
    return (
      <div className="nv-module-block-status" role="alert">
        <span>{retained.error.message}</span>
        <code>{title ?? src}</code>
      </div>
    )
  }
  if (loaded === null) {
    return (
      <div className="nv-module-block-status" role="status">
        <span>{dependencies.t('cardpage.module.missing')}</span>
        <code>{title ?? src}</code>
      </div>
    )
  }
  if (loaded === undefined || source === undefined) {
    return <div className="nv-module-block-status" role="status">{dependencies.t('canvas.files.loading')}</div>
  }
  return (
    <ModuleSurface
      module={loaded.module}
      t={dependencies.t}
      card={{ id: loaded.state.cardId, name: loaded.owner.name, kind: loaded.owner.kind }}
      addr={addr}
      loadCard={fetchCard}
      imageUrl={imageUrl}
      imageResources={loaded.state.resources.filter(resource => resource.mediaType.startsWith('image/')).map(resource => ({ id: resource.id, mediaType: resource.mediaType }))}
      siblings={loaded.owner.modules}
      readFile={readFile}
      resolveProjectAsset={resolveProjectAsset}
      mapSend={mapSend}
    />
  )
}

/**
 * Register conversation inline blocks and their container-owned source resolvers.
 * Chat and input-trigger services are injected independently rather than read
 * once at startup: client plugins apply in no fixed order, and a shell that ran
 * before Chat would otherwise leave the registry empty forever and paint sealed
 * directives as raw JSON. Block rendering must not wait on the optional choice
 * codec's input surface.
 * @param ctx - Client root context; without Chat the registration stays off.
 * @param dependencies - Read-only module resource services and shell translations.
 */
export function registerInlineBlocks(ctx: ClientContext, dependencies: InlineBlockDependencies): void {
  ctx.inject(['chatBlocks'], (scope: ClientContext) => {
    const blocks = scope.get('chatBlocks')
    if (blocks === undefined) return
    scope.effect(() => blocks.registerSource('card', resolveModuleSource), 'noven-shell: block card source')
    scope.effect(() => blocks.register({
      id: 'code',
      content: 'data',
      render: ({ data, blockId, resolveMedia, commit }) => (
        <InlineCodeBlock
          data={data}
          blockId={blockId}
          resolveMedia={resolveMedia}
          t={dependencies.t}
          {...(commit === undefined ? {} : { commit })}
        />
      ),
    }), 'noven-shell: code block')
    scope.effect(() => blocks.register({
      id: 'module',
      source: 'card',
      size: { ratio: 16 / 10 },
      variants: { wide: 16 / 9, square: 1, tall: 4 / 5 },
      render: ({ source }) => <ModuleBlock src={source.src} title={source.title} dependencies={dependencies} />,
    }), 'noven-shell: module block')
    for (const id of ['code', 'module'] as const) {
      if (blocks.resolve(id) === undefined) throw new Error(`noven-shell: inline block "${id}" was not registered`)
    }
  })
  ctx.inject(['inputTriggers'], (scope: ClientContext) => {
    registerCodeChoiceCodec(scope)
  })
}
