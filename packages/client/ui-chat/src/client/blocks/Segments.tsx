/**
 * Render one assistant text block as prose runs plus sealed blocks. Splitting is
 * a pure function of the recorded text and blocks are keyed by source offset, so
 * a streaming append can only extend or split the trailing prose run: every
 * earlier segment keeps its key and every mounted block keeps its instance.
 * @module ui-chat/client/blocks/Segments
 */
import { Fragment, createElement, useSyncExternalStore } from 'react'
import type { ReactNode } from 'react'
import { BlockSurface, UnknownBlock } from './BlockSurface.tsx'
import { splitBlockSegments, type BlockRef } from './directive.ts'
import { useBlockScope, type BlockScope } from './registry.tsx'

/** Box an unclaimed or unsized reference reserves, so a missing type cannot collapse the flow. */
export const DEFAULT_BLOCK_RATIO = 16 / 9

/** Props for one text block rendered with inline blocks. */
export interface BlockSegmentsProps {
  /** The text block exactly as recorded. */
  readonly text: string
  /** Stable assistant-step identity used to isolate choice groups across messages. */
  readonly scopeId?: string | undefined
  /**
   * Render one prose run. The caller owns Markdown parsing, so this module never
   * depends on a particular renderer.
   * @param text - One contiguous prose run with its original spelling.
   * @returns The rendered prose.
   */
  readonly renderText: (text: string) => ReactNode
  /**
   * Turn an authored source into an address the block can open. The container
   * owns the workspace scope, so a renderer never learns which session or
   * surface it is in; absent, `src` is passed through unchanged.
   * @param src - The reference's authored source.
   * @returns The address passed to the block renderer.
   */
  readonly resolveSource?: ((kind: string, src: string) => string | undefined) | undefined
  /**
   * Whether the block is still streaming. A trailing `::view` line that has not
   * sealed yet is not painted while streaming, so the reader never sees the
   * directive being typed; once the message settles, an unsealed line is prose.
   */
  readonly streaming?: boolean | undefined
}

const PENDING_DIRECTIVE = /(^|\n)[ \t]*::view\b[^\n]*$/u
const NO_SUBSCRIPTION = (): (() => void) => () => {}
const NO_REVISION = (): number => 0

/** Hide one trailing under-construction directive while preserving earlier prose. */
function hidePendingDirective(text: string): string {
  const match = PENDING_DIRECTIVE.exec(text)
  return match === null ? text : text.slice(0, match.index + (match[1]?.length ?? 0))
}

/** Props for one resolved block. */
interface BlockSlotProps {
  readonly scope: BlockScope
  readonly blockRef: BlockRef
  readonly blockId: string
  /** Explicit resolution from the surface; overrides the scoped resolver. */
  readonly resolveSource: ((kind: string, src: string) => string | undefined) | undefined
}

/** Draw one sealed directive with the matching reference or inline-data renderer. */
function BlockSlot({ scope, blockRef, blockId, resolveSource }: BlockSlotProps): ReactNode {
  const spec = scope.registry.resolve(blockRef.block)
  if ('data' in blockRef) {
    return (
      <BlockSurface blockId={blockRef.block} blockRef={blockRef}>
        {spec?.content === 'data'
          ? createElement(spec.render, {
            data: blockRef.data,
            blockId,
            resolveMedia: (src: string) => (resolveSource ?? scope.resolveSource)('workspace', src),
            ...(scope.commit === undefined ? {} : { commit: scope.commit }),
          })
          : <UnknownBlock blockRef={blockRef} />}
      </BlockSurface>
    )
  }
  const kind = spec?.content === 'data' ? 'raw' : spec?.source ?? 'raw'
  const address = resolveSource ?? (kind === 'raw' ? undefined : scope.resolveSource)
  const resolved = kind === 'raw' ? blockRef.src : address?.(kind, blockRef.src)
  const source = resolved === undefined ? blockRef : { ...blockRef, src: resolved }
  const unresolved = kind !== 'raw' && resolved === undefined
  const variant = blockRef.size === undefined || spec?.content === 'data'
    ? undefined
    : spec?.variants?.[blockRef.size]
  const ratio = variant ?? (spec?.content === 'data' ? undefined : spec?.size.ratio) ?? DEFAULT_BLOCK_RATIO
  return (
    <BlockSurface blockId={blockRef.block} blockRef={blockRef} ratio={ratio}>
      {spec === undefined || spec.content === 'data' || unresolved
        ? <UnknownBlock blockRef={source} />
        : createElement(spec.render, {
          source,
          ...(scope.commit === undefined ? {} : { commit: scope.commit }),
        })}
    </BlockSurface>
  )
}

/**
 * Render a text block, replacing sealed directives with registered blocks.
 * Without a registry (or with none registered) the whole text is prose, so a
 * build that composes no block plugins renders exactly what it renders today.
 * @param props - The text and the prose renderer.
 * @returns Prose runs and blocks in source order.
 */
export function BlockSegments(props: BlockSegmentsProps): ReactNode {
  const scope = useBlockScope()
  const getRevision = scope?.registry.revision ?? NO_REVISION
  useSyncExternalStore(scope?.registry.subscribe ?? NO_SUBSCRIPTION, getRevision, getRevision)
  if (scope === undefined || scope.registry.count() === 0) return props.renderText(props.text)
  const segments = splitBlockSegments(props.text)
  return (
    <>
      {segments.map((segment, index) => segment.kind === 'block'
        ? <BlockSlot
          key={segment.key}
          scope={scope}
          blockRef={segment.ref}
          blockId={`${props.scopeId ?? 'preview'}:${segment.key}`}
          resolveSource={props.resolveSource}
        />
        : (
          <Fragment key={segment.key}>
            {props.renderText(props.streaming === true && index === segments.length - 1
              ? hidePendingDirective(segment.text)
              : segment.text)}
          </Fragment>
        ))}
    </>
  )
}
