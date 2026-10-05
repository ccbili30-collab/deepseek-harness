/**
 * Client side of `/api/noven-bindings`: the current Session's mounted card
 * context (回答身份 / 背景 / 管理对象) plus the ops that mutate it.
 * @module noven-shell/client/bindings-api
 */
import type { SessionId } from '@deepseek-ai/dsh-session/types'

/** How far the managed subject lets the AI go without asking — 只读/批准/自由. */
export type ManagePermission = 'read' | 'approve' | 'free'

/** A card living in another workspace, mounted as a read-only reference. */
export interface CardRef {
  readonly root: string
  readonly cardId: string
}

/** One Session's mounted card context as stored in `~/.noven/bindings/<sessionId>.json`. */
export interface SessionBinding {
  readonly identityCardId?: string
  readonly backgroundCardIds: readonly string[]
  readonly managed?: { readonly cardId: string; readonly permission: ManagePermission }
  /** Cross-project mounts: cards that stay in their home workspace while this session reads them. */
  readonly refs?: readonly CardRef[]
}

/** GET payload: the binding plus display rows for every card id it references. */
export interface BindingState {
  readonly binding: SessionBinding | null
  readonly cards: Readonly<Record<string, { readonly name: string; readonly kind: string }>>
  /** Display rows for cross-project mounts, resolved against each ref's own workspace. */
  readonly refCards: readonly { readonly root: string; readonly cardId: string; readonly name: string; readonly kind: string; readonly missing: boolean }[]
}

const api = (sessionId: SessionId): string => `/api/noven-bindings?session=${encodeURIComponent(sessionId)}`

/** Fetch one Session's binding; undefined on missing route. */
export async function fetchBinding(sessionId: SessionId): Promise<BindingState | undefined> {
  const response = await fetch(api(sessionId)).catch(() => undefined)
  if (response === undefined || !response.ok) return undefined
  return (await response.json()) as BindingState
}

export interface BindingOp {
  readonly op: 'set-identity' | 'add-background' | 'remove-background' | 'set-managed' | 'add-ref' | 'remove-ref'
  readonly cardId?: string | null
  /** Workspace root for cross-project ops (`add-ref`/`remove-ref`). */
  readonly root?: string
  readonly permission?: ManagePermission
}

/** Apply one binding op; throws on rejection. */
export async function bindingOp(sessionId: SessionId, op: BindingOp): Promise<BindingState['binding']> {
  const response = await fetch(api(sessionId), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(op),
  })
  const text = await response.text()
  if (!response.ok) throw new Error(text || `binding op failed (${response.status})`)
  return (JSON.parse(text) as { binding: BindingState['binding'] }).binding
}
