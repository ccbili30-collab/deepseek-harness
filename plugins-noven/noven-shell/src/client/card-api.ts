/**
 * Card-editor client side of `/api/noven-cards`: the hydrated document view
 * (draft-aware), and the apply/commit/discard/create ops used by the editor.
 * @module noven-shell/client/card-api
 */
import type { SessionId } from '@deepseek-ai/dsh-session/types'

export interface CardBlockView {
  readonly kind: 'text' | 'image'
  readonly id: string
  /** Text payload for text blocks. */
  readonly text?: string
  /** Resource id and decoded caption for image blocks. */
  readonly resourceId?: string
  readonly caption?: string
}

export interface CardModuleDoc {
  readonly id: string
  readonly name: string
  readonly blocks: readonly CardBlockView[]
  readonly children: readonly CardModuleDoc[]
  /** Characters placed inside this module, in placement order. */
  readonly characterIds: readonly string[]
  readonly layout: string
  /** Special-module renderer: 'html' renders block text inside a sandboxed iframe. */
  readonly widget?: { readonly type: string; readonly height?: number }
}

export interface CardDocView {
  readonly id: string
  readonly kind: string
  readonly name: string
  readonly modules: readonly CardModuleDoc[]
  readonly avatarResourceId: string | null
  readonly coverResourceId: string | null
  /** Card-level reading layout: PAGED renders top-level modules as horizontal pages, CONTINUOUS stacks them. */
  readonly readingLayout: string
  /** World-internal character documents, each editable via targetId. */
  readonly characters: readonly Omit<CardDocView, 'characters'>[]
}

export interface CardResourceView { readonly id: string; readonly ref: string; readonly mediaType: string }

/** `GET /api/noven-cards` payload: effective document + the version edits must carry. */
export interface CardState {
  readonly cardId: string
  /** The card's visible directory name under `卡/` — media URLs join it. */
  readonly dir: string
  readonly revision: number
  readonly version: string
  readonly hasDraft: boolean
  readonly draftSource: 'HUMAN' | 'AI' | 'IMPORT' | null
  readonly document: CardDocView
  readonly resources: readonly CardResourceView[]
  readonly coverResourceId: string | null
  readonly canUndo?: boolean
  readonly canRedo?: boolean
}

/** A card's home: the session whose workspace holds it, or the workspace root itself. */
export interface CardAddr {
  readonly sessionId?: SessionId
  readonly root?: string
}

const api = (addr: CardAddr): string => addr.sessionId !== undefined
  ? `/api/noven-cards?session=${encodeURIComponent(addr.sessionId)}`
  : `/api/noven-cards?root=${encodeURIComponent(addr.root ?? '')}`

/** Fetch one card's editable state; undefined on missing card/route. */
export async function fetchCard(addr: CardAddr, cardId: string): Promise<CardState | undefined> {
  const response = await fetch(`${api(addr)}&card=${encodeURIComponent(cardId)}`).catch(() => undefined)
  if (response === undefined || !response.ok) return undefined
  return (await response.json()) as CardState
}

/** One card's catalog row as `/api/noven-cards` lists it (root-relative fields only). */
export interface CardListRow {
  readonly cardId: string
  /** The card's visible directory name under `卡/` — media URLs join it. */
  readonly dir: string
  readonly name: string
  readonly kind: string | undefined
  readonly modules: number
  readonly revision: number
  readonly coverRef: string | undefined
  readonly hasDraft: boolean
  readonly excerpt: { readonly module: string; readonly text: string } | undefined
}

/** List every live card in one project root — works by session or by bare root. */
export async function fetchCardList(addr: CardAddr): Promise<readonly CardListRow[]> {
  const response = await fetch(api(addr)).catch(() => undefined)
  if (response === undefined || !response.ok) return []
  return ((await response.json()) as { cards: readonly CardListRow[] }).cards
}

/** EditorCommand JSON the route accepts; mirrors noven-cards' EditorCommand minus byte payloads. */
export interface CardCommand { readonly kind: string; readonly [key: string]: unknown }

export interface CardOp {
  readonly op: 'create' | 'apply' | 'commit' | 'discard' | 'import' | 'delete' | 'undo' | 'redo' | 'move'
  readonly cardId?: string
  readonly targetId?: string
  readonly version?: string
  readonly command?: CardCommand
  readonly kind?: 'WORLD' | 'CHARACTER'
  readonly name?: string
  /** Import op: the uploaded package's base64 bytes; `name` carries the file name. */
  readonly file?: string
  /** Move op: the session whose workspace receives the card, or `targetRoot` for session-less targets. */
  readonly targetSession?: SessionId
  readonly targetRoot?: string
}

export class CardConflict extends Error {
  constructor(readonly currentVersion: string) { super('conflict'); this.name = 'CardConflict' }
}

/** Fields the route may echo back per op; callers read the ones their op returns. */
export interface CardOpResult {
  readonly ok?: boolean
  readonly cardId?: string
  readonly revision?: number
  /** Fresh version after an apply/commit — chain it into the next op. */
  readonly version?: string
  /** Import op echoes the landed card's name. */
  readonly name?: string
}

/** Apply one card op; throws CardConflict on a stale version so callers can refetch. */
export async function cardOp(addr: CardAddr, op: CardOp): Promise<CardOpResult> {
  const response = await fetch(api(addr), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(op),
  })
  const text = await response.text()
  if (response.status === 409) {
    const parsed = JSON.parse(text) as { version?: string }
    throw new CardConflict(parsed.version ?? '')
  }
  if (!response.ok) throw new Error(text || `card op failed (${response.status})`)
  return JSON.parse(text) as CardOpResult
}

/** Download the card's `.novex.zip` exchange package through the route's export op. */
export async function exportCardPackage(addr: CardAddr, cardId: string, name: string): Promise<void> {
  const response = await fetch(api(addr), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ op: 'export', cardId }),
  })
  if (!response.ok) throw new Error((await response.text()) || `export failed (${response.status})`)
  const url = URL.createObjectURL(await response.blob())
  const a = document.createElement('a')
  a.href = url
  a.download = `${name}.novex.zip`
  a.click()
  setTimeout(() => URL.revokeObjectURL(url), 10_000)
}

/** `/api/file` URL for one card content payload (`c5` style refs) under the visible `卡/<dir>/` tree. */
export function cardContentUrl(workspaceRoot: string, dir: string, ref: string): string {
  return `/api/file?path=${encodeURIComponent(`${workspaceRoot}/卡/${dir}/contents/${ref}`)}`
}
