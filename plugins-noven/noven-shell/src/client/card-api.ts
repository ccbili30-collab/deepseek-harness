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
  /** Text block's content ref — echo it as `expectedContent` so a write only conflicts if this block changed meanwhile. */
  readonly ref?: string
  /** Resource id and decoded caption for image blocks. */
  readonly resourceId?: string
  readonly caption?: string
  /** 图片展示宽度（百分比 10–100）；由 markdown 图片行的 "w=…%" title 携带。 */
  readonly width?: number
}

export interface CardModuleDoc {
  readonly id: string
  readonly name: string
  readonly blocks: readonly CardBlockView[]
  readonly children: readonly CardModuleDoc[]
  /** Characters placed inside this module, in placement order. */
  readonly characterIds: readonly string[]
  readonly layout: string
  /** Special-module renderer: 'html' renders block text inside a sandboxed iframe.
      path 是项目内文件活引用（html 模块实时读这份文件渲染）；
      data 是首个文字块 JSON 按 type 解码后的结构（timeline/collection/map/relation）。 */
  readonly widget?: {
    readonly type: string
    readonly height?: number
    readonly path?: string
    readonly data?: unknown
    readonly source?: { readonly cardId: string, readonly moduleId: string }
    readonly view?: string
    readonly filter?: { readonly characters?: readonly string[] }
    readonly overrides?: Record<string, unknown>
    readonly snapshot?: {
      readonly cardName: string
      readonly moduleName: string
      readonly widget: { readonly type: string, readonly data?: unknown }
      readonly resources?: Record<string, { readonly base64: string, readonly mediaType: string }>
    }
  }
  /** `module_options` 的回填字段：命令整体覆盖，改一项要带齐现状。 */
  readonly tags: readonly string[]
  readonly use?: { readonly kind: string; readonly words?: readonly string[]; readonly caseSensitive?: boolean; readonly requireAll?: boolean }
  readonly routing?: string
  readonly temporality?: string
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

/** One row of a pending AI proposal's change list (`GET` `proposal.changes`). */
export interface ProposalChangeView {
  readonly targetId: string
  readonly moduleId: string
  readonly name: string
  readonly kind: 'added' | 'removed' | 'changed' | 'moved'
  /** Human edited the same module while the proposal hung — accepting overwrites it. */
  readonly stale: boolean
}

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
  /** Pending AI proposal summary; `preview=1` fetches merge the proposal into `document`. */
  readonly hasProposal?: boolean
  readonly proposal?: { readonly pending: boolean; readonly baseRevision: number; readonly changes: readonly ProposalChangeView[] } | null
}

/** A card's home: the session whose workspace holds it, or the workspace root itself. */
export interface CardAddr {
  readonly sessionId?: SessionId
  readonly root?: string
}

const api = (addr: CardAddr): string => addr.sessionId !== undefined
  ? `/api/noven-cards?session=${encodeURIComponent(addr.sessionId)}`
  : `/api/noven-cards?root=${encodeURIComponent(addr.root ?? '')}`

/** Fetch one card's editable state; `preview` merges the pending AI proposal into the document. */
export async function fetchCard(addr: CardAddr, cardId: string, preview = false): Promise<CardState | undefined> {
  const response = await fetch(`${api(addr)}&card=${encodeURIComponent(cardId)}${preview ? '&preview=1' : ''}`).catch(() => undefined)
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
  readonly op: 'create' | 'apply' | 'commit' | 'discard' | 'import' | 'delete' | 'restore' | 'undo' | 'redo' | 'move' | 'accept' | 'reject'
  readonly cardId?: string
  readonly targetId?: string
  readonly version?: string
  readonly command?: CardCommand
  readonly kind?: 'WORLD' | 'CHARACTER'
  readonly name?: string
  /** Create op: how the new card starts ('blank' | 'interview' | 'template:*'). */
  readonly starter?: string
  /** Import op: the uploaded package's base64 bytes; `name` carries the file name. */
  readonly file?: string
  /** Move op: the session whose workspace receives the card, or `targetRoot` for session-less targets. */
  readonly targetSession?: SessionId
  readonly targetRoot?: string
  /** Accept/reject ops: limit the settlement to these module ids; absent = whole proposal. */
  readonly moduleIds?: readonly string[]
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
  /** Create op with starter 'interview': the client should send the preset prompt. */
  readonly interview?: boolean
  /** 单模块模板（时间线/地图/集合）：落卡后直接打开这个模块页。 */
  readonly focusModuleId?: string
  /** apply 新建的模块/块：调用方据此直接打开新页，而不是停在总览。 */
  readonly createdModuleIds?: readonly string[]
  readonly createdBlockIds?: readonly string[]
}

/**
 * Apply one card op; throws CardConflict on a stale version so callers can refetch.
 * A 409 may also carry a plain-text refusal (e.g. the delete guard); that is an
 * ordinary Error whose message is the route's explanation, not a conflict.
 */
export async function cardOp(addr: CardAddr, op: CardOp): Promise<CardOpResult> {
  const response = await fetch(api(addr), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(op),
  })
  const text = await response.text()
  if (response.status === 409) {
    let body: unknown = undefined
    try {
      body = JSON.parse(text)
    } catch {
      // SyntaxError: plain-text refusals are not version-conflict JSON.
    }
    if (typeof body === 'object' && body !== null) {
      throw new CardConflict('version' in body && typeof body.version === 'string' ? body.version : '')
    }
    throw new Error(text || 'card op failed (409)')
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

/** One declarative module saved in the project's user module library. */
export interface UserModuleDefinition {
  readonly id: string
  readonly name: string
  readonly shape: 'collection' | 'timeline' | 'map' | 'doc'
  readonly summary?: string
  readonly fields?: readonly { readonly name: string, readonly type: string }[]
  readonly view?: string
  readonly cardAspect?: 'portrait' | 'landscape' | 'square'
  readonly labels?: { readonly primary?: string, readonly add?: string, readonly empty?: string }
  readonly unit?: string
  readonly timelineView?: 'diary' | 'horizontal'
  readonly sample?: string
  readonly createdAt: string
}

/** List the current project's declarative user modules. */
export async function fetchUserModules(addr: CardAddr): Promise<UserModuleDefinition[]> {
  const response = await fetch(`${api(addr)}&modules=1`).catch(() => undefined)
  if (response === undefined || !response.ok) return []
  const payload = await response.json().catch(() => undefined) as { modules?: UserModuleDefinition[] } | undefined
  return Array.isArray(payload?.modules) ? payload.modules : []
}

/** Delete one user module definition. */
export async function deleteUserModule(addr: CardAddr, id: string): Promise<boolean> {
  const response = await fetch(api(addr), {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ op: 'delete_user_module', id }),
  }).catch(() => undefined)
  return response?.ok === true
}
