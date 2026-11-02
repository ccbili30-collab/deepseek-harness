/**
 * The block registry: referenced objects and message-owned component data share
 * one lookup surface, but their render inputs stay distinct. A reference block
 * declares a ratio; an inline data block owns its intrinsic height. Registrations
 * are plugin lifetime effects, while commit is scoped to the viewed Session.
 * @module ui-chat/client/blocks/registry
 */
import { createContext, useContext, useMemo } from 'react'
import type { ReactNode } from 'react'
import type {} from '@deepseek-ai/cordis'
import type { ReferenceInsert } from '@deepseek-ai/dsh-client-ui-conversation/client'
import type { BlockRef, JsonObject } from './directive.ts'

/** What a reference names, and therefore who can address it. */
export type BlockSourceKind = 'raw' | 'workspace' | 'frame' | 'card'

/**
 * Address one reference for a block type that declares this source kind.
 * The resolver receives the viewed Session because addresses are workspace-scoped.
 */
export type BlockSourceResolver = (src: string, sessionId: string, workspaceRoot: string | undefined) => string | undefined

/** One structured choice to append or replace in the Session's composer. */
export interface BlockCommitRequest {
  /** Stable serialized-reference prefix shared by every value in one choice group. */
  readonly refPrefix: string
  /** Chip presentation and plain-text projection for the selected value. */
  readonly insert: ReferenceInsert
}

/** Commit one block choice without exposing the composer DOM to the renderer. */
export type BlockCommitter = (request: BlockCommitRequest) => boolean

/** Intrinsic size a referenced block declares before any content exists. */
export interface BlockSize {
  /** Width divided by height, applied as CSS `aspect-ratio`. */
  readonly ratio: number
}

interface BlockSpecBase {
  /** Directive `block` value that selects this type. */
  readonly id: string
}

/** One renderable block that addresses an existing object. */
export interface ReferenceBlockSpec extends BlockSpecBase {
  /** Reference content is the default block kind. */
  readonly content?: 'reference'
  /** Declared intrinsic size; loading, ready, and failed states share it. */
  readonly size: BlockSize
  /** What `src` names and which container resolver should address it. */
  readonly source?: BlockSourceKind
  /** Named alternative ratios a directive may select with `"size":"…"`. */
  readonly variants?: Readonly<Record<string, number>>
  /** Render the referenced object. Hooks are allowed; the container is not known. */
  readonly render: (props: { readonly source: Extract<BlockRef, { readonly src: string }>; readonly commit?: BlockCommitter }) => ReactNode
}

/** One renderable block whose lightweight content belongs to the message. */
export interface DataBlockSpec extends BlockSpecBase {
  /** Selects inline component data rather than a source reference. */
  readonly content: 'data'
  /** Render validated JSON supplied by the assistant message. */
  readonly render: (props: {
    readonly data: JsonObject
    readonly blockId: string
    readonly commit?: BlockCommitter
    readonly resolveMedia: (src: string) => string | undefined
  }) => ReactNode
}

/** One renderable block type. */
export type BlockSpec = ReferenceBlockSpec | DataBlockSpec

/** Lookup surface shared by every surface that renders inline blocks. */
export interface BlockRegistry {
  /**
   * Register one block type.
   * @param spec - Type id, content kind, and renderer.
   * @returns The disposer that removes this registration.
   */
  readonly register: (spec: BlockSpec) => () => void
  /**
   * Resolve one block type.
   * @param id - Directive `block` value.
   * @returns The registered spec, or undefined when no plugin claims the id.
   */
  readonly resolve: (id: string) => BlockSpec | undefined
  /** @returns How many block types are registered. */
  readonly count: () => number
  /**
   * Subscribe to block-type and source-resolver changes.
   * @param listener - Called after a registration or disposal changes resolution.
   * @returns The subscription disposer.
   */
  readonly subscribe: (listener: () => void) => () => void
  /** @returns The monotonically increasing registry revision used by React snapshots. */
  readonly revision: () => number
  /**
   * Register the address builder for one source kind.
   * @param kind - Source kind a block type declares.
   * @param resolver - Builds the address for one reference and Session.
   * @returns The disposer that removes this resolver.
   */
  readonly registerSource: (kind: BlockSourceKind, resolver: BlockSourceResolver) => () => void
  /**
   * Address one reference.
   * @param kind - Source kind declared by the block type.
   * @param src - The reference's authored source.
   * @param sessionId - Viewed Session the address is scoped to.
   * @param workspaceRoot - Viewed workspace path, when the Session has one.
   * @returns The address, or undefined when nothing addresses this kind.
   */
  readonly resolveSource: (kind: BlockSourceKind, src: string, sessionId: string, workspaceRoot?: string) => string | undefined
}

declare module '@deepseek-ai/cordis' {
  interface Context {
    /** Inline block types shared by every surface that renders assistant content. */
    chatBlocks: BlockRegistry
  }
}

/**
 * Create an empty registry.
 * @returns A registry whose registrations are effects of the calling plugin.
 */
export function createBlockRegistry(): BlockRegistry {
  const specs = new Map<string, BlockSpec>()
  const sources = new Map<BlockSourceKind, BlockSourceResolver>()
  const listeners = new Set<() => void>()
  let revision = 0
  const changed = (): void => {
    revision += 1
    for (const listener of listeners) {
      try { listener() }
      catch (error) { console.error('chat blocks: registry listener failed', error) }
    }
  }
  return {
    register(spec) {
      if (spec.id === '') throw new Error('chat blocks: block id must not be empty')
      if (spec.content !== 'data' && !(spec.size.ratio > 0)) {
        throw new Error(`chat blocks: "${spec.id}" must declare a positive size ratio`)
      }
      if (specs.has(spec.id)) throw new Error(`chat blocks: "${spec.id}" is already registered`)
      specs.set(spec.id, spec)
      changed()
      return () => {
        if (specs.get(spec.id) !== spec) return
        specs.delete(spec.id)
        changed()
      }
    },
    resolve: id => specs.get(id),
    count: () => specs.size,
    subscribe(listener) {
      listeners.add(listener)
      return () => { listeners.delete(listener) }
    },
    revision: () => revision,
    registerSource(kind, resolver) {
      if (sources.has(kind)) throw new Error(`chat blocks: source "${kind}" is already registered`)
      sources.set(kind, resolver)
      changed()
      return () => {
        if (sources.get(kind) !== resolver) return
        sources.delete(kind)
        changed()
      }
    },
    resolveSource: (kind, src, sessionId, workspaceRoot) => sources.get(kind)?.(src, sessionId, workspaceRoot),
  }
}

/** What a block surface needs from its container. */
export interface BlockScope {
  /** Registered block types. */
  readonly registry: BlockRegistry
  /** Address one reference in the viewed Session and workspace. */
  readonly resolveSource: (kind: BlockSourceKind, src: string) => string | undefined
  /** Optional Session-owned choice insertion; absent in read-only containers. */
  readonly commit?: BlockCommitter
}

const BlockScopeContext = createContext<BlockScope | undefined>(undefined)

/** Props for the registry scope. */
export interface BlockRegistryProviderProps {
  /** Registry supplied by the owning plugin. */
  readonly registry: BlockRegistry
  /** Addressing for block types whose declared source kind needs one. */
  readonly resolveSource?: ((kind: BlockSourceKind, src: string) => string | undefined) | undefined
  /** Session-scoped structured choice insertion. */
  readonly commit?: BlockCommitter | undefined
  readonly children: ReactNode
}

/**
 * Scope block rendering to one registry and Session.
 * @param props - Registry, source addressing, optional choice commit, and subtree.
 * @returns The scoped subtree.
 */
export function BlockRegistryProvider(props: BlockRegistryProviderProps): ReactNode {
  const scope = useMemo<BlockScope>(() => ({
    registry: props.registry,
    resolveSource: props.resolveSource ?? ((kind, src) => (kind === 'raw' ? src : undefined)),
    ...(props.commit === undefined ? {} : { commit: props.commit }),
  }), [props.registry, props.resolveSource, props.commit])
  return <BlockScopeContext.Provider value={scope}>{props.children}</BlockScopeContext.Provider>
}

/** @returns The nearest registry, or undefined outside a provider. */
export function useBlockRegistry(): BlockRegistry | undefined {
  return useContext(BlockScopeContext)?.registry
}

/** @returns The nearest block scope, or undefined outside a provider. */
export function useBlockScope(): BlockScope | undefined {
  return useContext(BlockScopeContext)
}
