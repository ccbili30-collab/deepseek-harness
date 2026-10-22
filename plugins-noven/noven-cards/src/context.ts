/**
 * 挂载卡上下文注入 — 会话挂载（回答身份/背景/管理对象/跨项目引用）原本只存在
 * 绑定表里，模型看不见；这里在每个回合第一步把它作为一条带源的 user 消息
 * 注入：签名（挂载集合 + 修订号）没变就不重复，挂载清空时给一行说明。
 * @module noven-cards/context
 */
import { join } from 'node:path'
import type { Context } from '@deepseek-ai/cordis'
import type { SessionId } from '@deepseek-ai/dsh-session/types'
import type { PreStepDecision } from '@deepseek-ai/dsh-agent'
import { createUserMessage, type ContextFormed } from '@deepseek-ai/dsh-llm'
import type {} from '@deepseek-ai/dsh-session'
import type {} from '@deepseek-ai/dsh-session-projection'
import { z } from 'zod'
import { BindingStore } from './bindings.ts'
import { CardStore, cardsRoot } from './store.ts'

declare module '@deepseek-ai/dsh-llm' {
  interface MessageSourceMap {
    'noven-cards': { kind: 'noven-cards'; signature: string } & ContextFormed
  }
}

declare module '@deepseek-ai/dsh-session-projection/types' {
  interface SessionProjectionStateMap {
    /** Latest mounted-card signature already in the log. */
    novenCards: NovenCardsProjection
  }
}

interface NovenCardsProjection {
  readonly lastSignature: string | null
  /** The workspace-layout note has been delivered this session. */
  readonly layoutSeen: boolean
}

const stateSchema = z.object({ lastSignature: z.string().nullable(), layoutSeen: z.boolean() })

/** File-layout orientation the model needs once per session — what lives where and what a delete means. The help pointer assumes noven-docs ships in the same product profile. */
const LAYOUT_NOTE = `这个工作区的文件约定：
- 卡/ 是用户的卡本体——每张卡一个以卡名命名的目录（card.json + contents/）。它是 Finder 里看得见的内容，不是内部状态；改卡走制卡工具，别直接改文件。
- .noven/project.json 只是项目身份标记。作品清单、卡绑定、工作台注册表都在应用侧账本，不在这个目录里——找不到不等于丢了。
- 卡/、.noven/、整个项目目录都属于用户数据：除非用户明确要求删除，否则先说明影响再确认。
- 要做可看、可交互的东西——界面、游戏、3D、图表、小工具、可视化——默认建卡 + 自由界面（surface）或自由 3D（free3d）模块，在画布里直接渲染和操作；不要先在项目里写 .html 文件。自由界面是工程而不是一段源码：surface_read → surface_write_file 按文件改 → surface_validate → surface_diagnostics 自检。
- 只有沙箱做不了时才落文件：需要项目二进制资产、外网、未内置的库或必须被其他工具消费。落文件后用 module_embed_file 把它挂回卡里，保证用户在卡里也能看到。
- 软件功能与用法查内置手册：help 工具（不带参数回目录）。自由模块的桥与限制查 help({topic:"surfaces"})。用户问"怎么用"时先查再答，别凭印象。`

/** Per-card excerpt bound — enough for the model to work with, bounded so a fat card cannot flood the turn. */
const EXCERPT_CHARS = 3000

/** One mounted card resolved for injection. */
interface MountedCard {
  readonly role: string
  readonly id: string
  readonly name: string
  readonly kind: string
  readonly revision: number
  /** Owning project root — present only for cross-project refs. */
  readonly root?: string
  /** Absolute card directory — spares the model a filesystem hunt. */
  readonly dir?: string
  readonly excerpt: string
  readonly truncated: boolean
}

/** Flatten a module tree's text payloads into one excerpt string. */
async function cardExcerpt(store: CardStore, cardId: string, modules: readonly { blocks: readonly { kind: string; content?: string }[]; children: readonly unknown[] }[]): Promise<{ text: string; truncated: boolean }> {
  const parts: string[] = []
  let truncated = false
  const walk = async (mods: readonly { blocks: readonly { kind: string; content?: string }[]; children: readonly unknown[] }[]): Promise<void> => {
    for (const m of mods) {
      for (const b of m.blocks) {
        if (b.kind !== 'text' || b.content === undefined || truncated) continue
        const text = new TextDecoder().decode(await store.readPayload(cardId, b.content).catch(() => new Uint8Array()))
        if (text.trim().length === 0) continue
        parts.push(text)
        if (parts.join('\n').length > EXCERPT_CHARS) { truncated = true; return }
      }
      if (!truncated) await walk(m.children as typeof mods)
    }
  }
  await walk(modules)
  const joined = parts.join('\n')
  return { text: joined.slice(0, EXCERPT_CHARS), truncated: truncated || joined.length > EXCERPT_CHARS }
}

/** Resolve one mounted card id to its injection row; missing cards surface as such. */
async function mount(store: CardStore, cardRoot: string, cardId: string, role: string, refRoot?: string): Promise<MountedCard> {
  const head = await store.open(cardId).catch(() => undefined)
  if (head === undefined) {
    return { role, id: cardId, name: '（卡不存在）', kind: '?', revision: 0, ...(refRoot !== undefined ? { root: refRoot } : {}), excerpt: '', truncated: false }
  }
  const dirName = await store.dirName(cardId).catch(() => undefined)
  const { text, truncated } = await cardExcerpt(store, cardId, head.document.modules)
  return {
    role, id: cardId, name: head.document.name, kind: head.document.kind, revision: head.revision,
    ...(refRoot !== undefined ? { root: refRoot } : {}),
    ...(dirName !== undefined ? { dir: join(cardsRoot(cardRoot), dirName) } : {}),
    excerpt: text, truncated,
  }
}

/** Collect every mounted card for one session's binding. */
async function mountedCards(cwd: string, sessionId: SessionId): Promise<MountedCard[]> {
  const bindings = new BindingStore(cwd)
  await bindings.pruneDeadLocalMounts(sessionId)
  const binding = (await bindings.all())[sessionId]
  if (binding === undefined) return []
  const store = new CardStore(cwd)
  const rows: MountedCard[] = []
  if (binding.identityCardId !== undefined) rows.push(await mount(store, cwd, binding.identityCardId, '回答身份'))
  for (const id of binding.backgroundCardIds) rows.push(await mount(store, cwd, id, '背景'))
  if (binding.managed !== undefined) rows.push(await mount(store, cwd, binding.managed.cardId, `管理对象（权限 ${binding.managed.permission}）`))
  for (const ref of binding.refs ?? []) rows.push(await mount(new CardStore(ref.root), ref.root, ref.cardId, '引用', ref.root))
  return rows
}

/** Signature of the mounted set — re-inject only when mounting or card revisions move. */
function signatureOf(rows: readonly MountedCard[]): string {
  return JSON.stringify(rows.map(r => [r.role, r.id, r.revision]))
}

/** Render the mounted set as one model-facing section. */
function renderMounted(rows: readonly MountedCard[]): string {
  const lines = ['本会话挂载的卡（用户在创作面板设置）：']
  for (const r of rows) {
    const where = r.root !== undefined ? `，来自 ${r.root}` : ''
    const dir = r.dir !== undefined ? `，目录 ${r.dir}` : ''
    lines.push(`【${r.role}】${r.name}（${r.kind}${where}，编号 ${r.id}${dir}）`)
    if (r.excerpt.length > 0) {
      lines.push(r.excerpt)
      if (r.truncated) lines.push('（已截断；完整结构与分页正文用 read_card / read_text_block 读）')
    }
  }
  lines.push('注意：list_cards 只列本会话项目卡库，不含挂载卡——判断"有没有挂载"以这条消息为准；挂载卡与本项目卡同样可用制卡工具读写（等于直接改来源项目），其他项目用 list_projects + project 参数。')
  return lines.join('\n')
}

/** Register the projection and the per-turn injection listener. */
export function registerCardContext(ctx: Context): void {
  ctx.sessionProjections.register({
    key: 'novenCards',
    stateVersion: 1,
    stateSchema,
    init: () => ({ lastSignature: null, layoutSeen: false }),
    apply: (state, event) => {
      if (event.type !== 'user/message' || event.data.source.kind !== 'noven-cards') return state
      const signature = event.data.source.signature
      return state.lastSignature === signature && state.layoutSeen
        ? state
        : { lastSignature: signature, layoutSeen: true }
    },
  })

  ctx.on('agent/pre-step', async ({ agent, step, signal }, next): Promise<PreStepDecision> => {
    const decision = await next()
    if (decision.kind === 'reject' || signal.aborted || step !== 1) return decision
    const cwd = agent.session.header.cwd
    if (cwd === undefined || cwd.length === 0) return decision
    const rows = await mountedCards(cwd, agent.session.id)
    const signature = signatureOf(rows)
    const state = ctx.sessionProjections.stateOf(agent.session, 'novenCards') as NovenCardsProjection
    const layoutPending = !state.layoutSeen
    if (signature === state.lastSignature && !layoutPending) return decision
    if (rows.length === 0 && state.lastSignature === null && !layoutPending) return decision
    const mounted = rows.length === 0
      ? (state.lastSignature === null ? '' : '本会话的挂载卡已全部移除。')
      : renderMounted(rows)
    const text = layoutPending && mounted.length > 0 ? `${LAYOUT_NOTE}\n\n${mounted}` : (mounted.length > 0 ? mounted : LAYOUT_NOTE)
    return {
      ...decision,
      messages: [
        ...decision.messages,
        createUserMessage({
          content: [{ type: 'text', text }],
          source: {
            kind: 'noven-cards',
            signature,
            form: 'snapshot',
            sections: [{ name: 'noven-cards', text }],
          },
        }),
      ],
    }
  })
}
