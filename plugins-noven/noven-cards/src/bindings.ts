/**
 * 会话↔卡绑定 — one durable binding record per Session, kept app-side in
 * `~/.noven/bindings/<sessionId>.json`. Mirrors the mobile model: a
 * conversation mounts cards as context (回答身份 / 背景 / 管理对象) without
 * splitting into conversation kinds; mounting is a relationship, and the
 * managed subject carries the edit permission the AI tools should honor.
 * @module noven-cards/bindings
 */
import { mkdir, readFile, readdir, rename, rm, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import type { Context } from '@deepseek-ai/cordis'
import type {} from '@deepseek-ai/dsh-session-persistence'
import type { SessionId } from '@deepseek-ai/dsh-session/types'
import { bindingsDir } from 'noven-ledger'
import { CardStore } from './store.ts'

/** How far the managed subject lets the AI go without asking — mobile's 只读/批准/自由. */
export type ManagePermission = 'read' | 'approve' | 'free'

/** A card living in another workspace, mounted as a read-only reference. */
export interface CardRef {
  readonly root: string
  readonly cardId: string
}

/** One Session's mounted card context. */
export interface SessionBinding {
  /** Character card answering as persona; absent means the Nova default. */
  readonly identityCardId?: string
  /** Read-only background cards feeding context. */
  readonly backgroundCardIds: readonly string[]
  /** Card the session may edit, with its permission tier. */
  readonly managed?: { readonly cardId: string; readonly permission: ManagePermission }
  /** Cross-project mounts: cards that stay in their home workspace while this session reads them. */
  readonly refs?: readonly CardRef[]
}

interface BindingsFile {
  readonly version: 1
  readonly sessions: Record<string, SessionBinding>
}

interface SessionBindingFile {
  readonly version: 1
  readonly binding?: SessionBinding
}

const FILE = 'session-bindings.json'

/**
 * Read/write session bindings — app-side at `~/.noven/bindings/<sessionId>.json`
 * so a wiped or moved project folder never takes the mounts with it. A legacy
 * per-root `.noven/session-bindings.json` is lifted once on first access.
 */
export class BindingStore {
  /** @param root - workspace root; only used to lift the legacy per-root file. */
  constructor(private readonly root: string) {}

  private path(sessionId: string): string { return join(bindingsDir(), `${sessionId}.json`) }

  /** Lift the legacy per-root file into per-session files, then drop it. Idempotent. */
  private async liftLegacy(): Promise<void> {
    const legacy = join(this.root, '.noven', FILE)
    try {
      const parsed = JSON.parse(await readFile(legacy, 'utf8')) as BindingsFile
      if (typeof parsed !== 'object' || parsed === null || typeof parsed.sessions !== 'object') return
      await mkdir(bindingsDir(), { recursive: true })
      for (const [sessionId, binding] of Object.entries(parsed.sessions)) {
        const target = this.path(sessionId)
        try {
          await readFile(target, 'utf8') // target already won — keep it
        } catch {
          const tmp = `${target}.tmp-${process.pid}`
          await writeFile(tmp, `${JSON.stringify({ version: 1, binding } satisfies SessionBindingFile, null, 2)}\n`, 'utf8')
          await rename(tmp, target)
        }
      }
      await rm(legacy, { force: true })
    } catch {
      /* no legacy file (or unreadable) — nothing to lift */
    }
  }

  /**
   * 摘掉本会话已死的本项目挂载：身份/背景/管理对象只指向本项目卡，卡被删
   * 就是永久死挂载（编号不会复活），直接清——删卡不走软件，自愈只能在做
   * 绑定时做。跨项目引用不动：来源目录暂离/搬家看起来也是 missing，但会
   * 回来，留给 UI 的 missing 标记表达。
   * @returns 是否有挂载被摘。
   */
  async pruneDeadLocalMounts(sessionId: SessionId): Promise<boolean> {
    const binding = (await this.all())[sessionId]
    if (binding === undefined) return false
    const store = new CardStore(this.root)
    const alive = async (id: string): Promise<boolean> => await store.open(id) !== undefined
    let next = binding
    let changed = false
    if (binding.identityCardId !== undefined && !(await alive(binding.identityCardId))) {
      const { identityCardId: _dropped, ...rest } = next
      next = rest
      changed = true
    }
    const aliveBackground: string[] = []
    for (const id of binding.backgroundCardIds) {
      if (await alive(id)) aliveBackground.push(id)
      else changed = true
    }
    if (changed) next = { ...next, backgroundCardIds: aliveBackground }
    if (binding.managed !== undefined && !(await alive(binding.managed.cardId))) {
      const { managed: _dropped, ...rest } = next
      next = rest
      changed = true
    }
    if (!changed) return false
    const empty = next.identityCardId === undefined
      && next.backgroundCardIds.length === 0 && next.managed === undefined && (next.refs === undefined || next.refs.length === 0)
    await this.set(sessionId, empty ? undefined : next)
    return true
  }

  async all(): Promise<Record<string, SessionBinding>> {
    await this.liftLegacy()
    const out: Record<string, SessionBinding> = {}
    try {
      for (const name of await readdir(bindingsDir())) {
        if (!name.endsWith('.json')) continue
        try {
          const parsed = JSON.parse(await readFile(join(bindingsDir(), name), 'utf8')) as SessionBindingFile
          if (parsed?.binding !== undefined) out[name.slice(0, -5)] = parsed.binding
        } catch { /* a corrupt one-file binding never hides the rest */ }
      }
    } catch { /* no bindings dir yet */ }
    return out
  }

  /**
   * Replace one Session's binding; a null binding removes the entry.
   * @param sessionId - owning Session.
   * @param binding - new binding, or undefined to unbind.
   */
  async set(sessionId: SessionId, binding: SessionBinding | undefined): Promise<void> {
    await this.liftLegacy()
    const target = this.path(sessionId)
    if (binding === undefined) {
      await rm(target, { force: true })
      return
    }
    await mkdir(bindingsDir(), { recursive: true })
    const file: SessionBindingFile = { version: 1, binding }
    const tmp = `${target}.tmp-${process.pid}`
    await writeFile(tmp, `${JSON.stringify(file, null, 2)}\n`, 'utf8')
    await rename(tmp, target)
  }
}

const JSON_HEADERS = {
  'Content-Type': 'application/json; charset=utf-8',
  'Cache-Control': 'private, no-store',
}

/** Session cwd — live headers first, persisted headers for dormant sessions. */
async function rootFor(request: Request, ctx: Context): Promise<{ root: string } | Response> {
  const session = new URL(request.url).searchParams.get('session') as SessionId | null
  const live = session === null ? undefined : ctx.sessions.get(session)?.header
  const stored = live === undefined && session !== null
    ? await ctx.get('sessionPersistence')?.stat(session)
    : undefined
  const root = (live ?? stored?.header)?.cwd
  if (root === undefined) {
    return new Response('unknown session', { status: 404, headers: JSON_HEADERS })
  }
  return { root }
}

/** Resolve bound card ids to display rows through the workspace card store. */
async function cardNames(store: CardStore, ids: readonly string[]): Promise<Record<string, { name: string; kind: string }>> {
  const names: Record<string, { name: string; kind: string }> = {}
  await Promise.all([...new Set(ids)].map(async id => {
    const head = await store.open(id).catch(() => undefined)
    if (head !== undefined) names[id] = { name: head.document.name, kind: head.document.kind }
  }))
  return names
}

async function serve(request: Request, ctx: Context): Promise<Response> {
  const resolved = await rootFor(request, ctx)
  if (resolved instanceof Response) return resolved
  const url = new URL(request.url)
  const sessionId = url.searchParams.get('session') as SessionId
  const bindings = new BindingStore(resolved.root)
  const cards = new CardStore(resolved.root)

  if (request.method === 'GET' || request.method === 'HEAD') {
    await bindings.pruneDeadLocalMounts(sessionId)
    const all = await bindings.all()
    const binding = all[sessionId]
    const ids = binding === undefined ? [] : [
      ...(binding.identityCardId === undefined ? [] : [binding.identityCardId]),
      ...binding.backgroundCardIds,
      ...(binding.managed === undefined ? [] : [binding.managed.cardId]),
    ]
    const refCards = await Promise.all((binding?.refs ?? []).map(async ref => {
      const head = await new CardStore(ref.root).open(ref.cardId).catch(() => undefined)
      return { root: ref.root, cardId: ref.cardId, name: head?.document.name ?? ref.cardId, kind: head?.document.kind ?? 'WORLD', missing: head === undefined }
    }))
    const payload = { binding: binding ?? null, cards: await cardNames(cards, ids), refCards }
    return new Response(request.method === 'HEAD' ? null : JSON.stringify(payload), { headers: JSON_HEADERS })
  }

  let body: Record<string, unknown>
  try {
    body = JSON.parse(await request.text()) as Record<string, unknown>
  } catch {
    return new Response('body is not valid JSON', { status: 400, headers: JSON_HEADERS })
  }
  const bad = (text: string) => new Response(text, { status: 400, headers: JSON_HEADERS })
  const current = (await bindings.all())[sessionId] ?? { backgroundCardIds: [] }
  const cardId = body.cardId === null ? undefined : String(body.cardId ?? '')
  const known = async (id: string | undefined): Promise<Response | undefined> => {
    if (id === undefined) return undefined
    const head = await cards.open(id).catch(() => undefined)
    return head === undefined ? bad(`unknown card: ${id}`) : undefined
  }

  let next: SessionBinding | undefined
  switch (String(body.op ?? '')) {
    case 'set-identity': {
      const failed = await known(cardId)
      if (failed !== undefined) return failed
      next = { ...current, identityCardId: cardId }
      break
    }
    case 'add-background': {
      const failed = await known(cardId)
      if (failed !== undefined) return failed
      if (cardId === undefined) return bad('missing cardId')
      next = current.backgroundCardIds.includes(cardId) ? current
        : { ...current, backgroundCardIds: [...current.backgroundCardIds, cardId] }
      break
    }
    case 'remove-background': {
      next = { ...current, backgroundCardIds: current.backgroundCardIds.filter(id => id !== cardId) }
      break
    }
    case 'add-ref': {
      const root = String(body.root ?? '')
      if (root.length === 0 || cardId === undefined) return bad('missing ref')
      if (root === resolved.root) return bad('card lives in this workspace — use add-background')
      const head = await new CardStore(root).open(cardId).catch(() => undefined)
      if (head === undefined) return bad(`unknown card: ${cardId}`)
      const refs = current.refs ?? []
      next = refs.some(r => r.root === root && r.cardId === cardId) ? current
        : { ...current, refs: [...refs, { root, cardId }] }
      break
    }
    case 'remove-ref': {
      const root = String(body.root ?? '')
      next = { ...current, refs: (current.refs ?? []).filter(r => !(r.root === root && r.cardId === cardId)) }
      break
    }
    case 'set-managed': {
      const failed = await known(cardId)
      if (failed !== undefined) return failed
      const permission = String(body.permission ?? 'free')
      if (permission !== 'read' && permission !== 'approve' && permission !== 'free') return bad('invalid permission')
      next = cardId === undefined ? { ...current, managed: undefined }
        : { ...current, managed: { cardId, permission } }
      break
    }
    default:
      return bad(`unknown op: ${String(body.op ?? '')}`)
  }
  const empty = next.identityCardId === undefined
    && next.backgroundCardIds.length === 0 && next.managed === undefined && (next.refs === undefined || next.refs.length === 0)
  const tidy: SessionBinding | undefined = empty ? undefined
    : next.refs !== undefined && next.refs.length === 0 ? { ...next, refs: undefined } : next
  await bindings.set(sessionId, tidy)
  return new Response(JSON.stringify({ ok: true, binding: tidy ?? null }), { headers: JSON_HEADERS })
}

/** Register the binding HTTP route against the connection's fetch registry. */
export function registerBindingRoutes(ctx: Context): void {
  ctx.effect(() => ctx.connection.fetch.register({
    path: '/api/noven-bindings',
    methods: ['GET', 'HEAD', 'POST'],
    requestBody: 'buffered',
    fetch: request => serve(request, ctx),
  }), 'noven-cards: /api/noven-bindings')
}
