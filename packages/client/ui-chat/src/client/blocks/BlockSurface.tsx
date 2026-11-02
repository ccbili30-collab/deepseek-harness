/**
 * One block's frame. Referenced blocks reserve their declared ratio before any
 * content exists; message-owned component blocks use intrinsic height because
 * their complete content is already sealed. Activation is focus, not tracked
 * state, and Escape releases the frame without a document-level keyboard owner.
 * @module ui-chat/client/blocks/BlockSurface
 */
import { useCallback } from 'react'
import type { KeyboardEvent, ReactNode } from 'react'
import css from './BlockSurface.module.css'
import type { BlockRef } from './directive.ts'

/** Props for one block frame. */
export interface BlockSurfaceProps {
  /** Registered block id, exposed for styling and diagnostics. */
  readonly blockId: string
  /** The sealed directive this frame renders. */
  readonly blockRef: BlockRef
  /** Referenced-block ratio; omit for intrinsic message-owned content. */
  readonly ratio?: number | undefined
  readonly children: ReactNode
}

/**
 * Draw one focusable block frame.
 * @param props - Block identity, optional ratio, and block body.
 * @returns The framed block.
 */
export function BlockSurface(props: BlockSurfaceProps): ReactNode {
  const release = useCallback((event: KeyboardEvent<HTMLDivElement>) => {
    if (event.key !== 'Escape') return
    event.currentTarget.blur()
    event.stopPropagation()
  }, [])
  const label = props.blockRef.title ?? ('src' in props.blockRef ? props.blockRef.src : props.blockRef.block)
  return (
    <div
      className={`${css.surface}${props.ratio === undefined ? ` ${css.intrinsic}` : ''}`}
      tabIndex={0}
      role="group"
      data-inline-block={props.blockId}
      data-block-content={'data' in props.blockRef ? 'data' : 'reference'}
      data-block-src={'src' in props.blockRef ? props.blockRef.src : undefined}
      aria-label={label}
      style={props.ratio === undefined ? undefined : { aspectRatio: String(props.ratio) }}
      onKeyDown={release}
    >
      <div className={css.body}>{props.children}</div>
    </div>
  )
}

/** Props for the unresolved-block notice. */
export interface UnknownBlockProps {
  /** The directive no registered block type claimed. */
  readonly blockRef: BlockRef
}

/**
 * Report an unclaimed directive without exposing inline component data.
 * @param props - The unclaimed directive.
 * @returns The in-place notice.
 */
export function UnknownBlock(props: UnknownBlockProps): ReactNode {
  return (
    <div className={css.unknown} role="status" data-unknown-block={props.blockRef.block}>
      <code className={css.unknownId}>{props.blockRef.block}</code>
      {'src' in props.blockRef && <code className={css.unknownPath}>{props.blockRef.src}</code>}
    </div>
  )
}
