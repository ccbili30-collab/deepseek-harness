/**
 * 消化循环：跟着 `session/event` 走——回合内把 user/assistant 文本攒进
 * 增量袋，`turn/end` 把这轮增量打包成一条"整理任务"消息 followup 进
 * 项目的管理员会话。管理员是一条真会话（noven-sidecar preset）：它自己
 * 判断要不要动实体库、用自己的模型路由跑、回复留在自己的会话日志里。
 * 管理员会话自身的事件不回流进消化袋（preset 判定挡掉，否则自咬尾巴）。
 * @module noven-sidecar/digest
 */
import type { Context } from '@deepseek-ai/cordis'
import type { Session } from '@deepseek-ai/dsh-session'
import { createUserMessage } from '@deepseek-ai/dsh-llm'
import { adminAgent } from './admin.ts'
import { SIDECAR_PRESET_ID } from './preset.ts'
import { SidecarStore } from './store.ts'
import { withEntityStore } from './shared.ts'

declare module '@deepseek-ai/dsh-llm' {
  interface MessageSourceMap {
    /** 消化循环投递的整理任务——管理员会话里区别于真人发言的标记。 */
    'noven-sidecar': { kind: 'noven-sidecar' }
  }
}

/** 一条任务消息携带的增量上限——转述是底稿不是全量备份。 */
const TASK_TRANSCRIPT_LIMIT = 6000

interface PendingEntry { readonly seq: number; readonly role: 'user' | 'assistant'; readonly text: string }

interface Pending {
  entries: PendingEntry[]
  running: boolean
  again: boolean
}

function textOf(content: readonly { type: string; text?: string }[]): string {
  return content.filter(b => b.type === 'text' && b.text !== undefined).map(b => b.text!).join('\n').trim()
}

/** 这条会话是不是管理员自己——preset 会话永远不消化自己或同行。 */
function isAdminSession(ctx: Context, session: Session): boolean {
  return ctx.sessionProjections.stateOf(session, 'agentPreset') === SIDECAR_PRESET_ID
}

/** 增量袋压成任务消息正文：逐行"角色：文本"，超限截尾并如实标注。 */
function taskText(session: Session, entries: readonly PendingEntry[]): string {
  const lines = entries.map(e => `${e.role === 'user' ? '用户' : '助手'}：${e.text}`)
  let body = lines.join('\n\n')
  let truncated = false
  if (body.length > TASK_TRANSCRIPT_LIMIT) {
    body = body.slice(0, TASK_TRANSCRIPT_LIMIT)
    truncated = true
  }
  return `【整理任务】主对话（${session.id}）刚结束一轮，以下是新增的对话内容${truncated ? '（超长，已截尾）' : ''}：
---
${body}
---
判断这一轮里有没有该记进设定实体库的内容；有就用实体工具落库，没有就照常回复一句。`
}

export function registerDigest(ctx: Context): void {
  const pendingBySession = new Map<string, Pending>()
  const pendingFor = (id: string): Pending => {
    let p = pendingBySession.get(id)
    if (p === undefined) pendingBySession.set(id, p = { entries: [], running: false, again: false })
    return p
  }

  ctx.on('session/event', (session, event) => {
    if (isAdminSession(ctx, session)) return
    const p = pendingFor(session.id)
    if (event.type === 'user/message') {
      const text = textOf(event.data.content)
      if (text.length > 0) p.entries.push({ seq: event.seq, role: 'user', text })
      return
    }
    if (event.type === 'assistant/message') {
      const text = textOf(event.data.message.content)
      if (text.length > 0) p.entries.push({ seq: event.seq, role: 'assistant', text })
      return
    }
    if (event.type === 'turn/end') void flush(ctx, session, p)
  })
  ctx.on('session/disposed', session => { pendingBySession.delete(session.id) })
}

async function flush(ctx: Context, session: Session, p: Pending): Promise<void> {
  if (p.running) { p.again = true; return }
  p.running = true
  try {
    do {
      p.again = false
      await flushOnce(ctx, session, p)
    } while (p.again)
  } finally {
    p.running = false
  }
}

async function flushOnce(ctx: Context, session: Session, p: Pending): Promise<void> {
  const cwd = session.header.cwd
  if (cwd === undefined) return
  const store = new SidecarStore(cwd)
  const cursor = store.load().cursors[session.id] ?? 0
  const fresh = p.entries.filter(e => e.seq > cursor)
  if (fresh.length === 0) { p.entries = []; return }
  const lastSeq = Math.max(...fresh.map(e => e.seq))
  // 停了这个 workspace 的自动整理：攒的增量丢掉、游标照走，恢复后不重审旧回合。
  if (store.load().paused === true) {
    p.entries = []
    await withEntityStore(cwd, data => { data.cursors[session.id] = lastSeq })
    return
  }
  try {
    const agent = await adminAgent(ctx, cwd)
    if (agent === undefined) throw new Error('管理员会话正被占用')
    agent.followup(createUserMessage({
      content: [{ type: 'text', text: taskText(session, fresh) }],
      source: { kind: 'noven-sidecar' },
    }))
    store.appendCall({ kind: 'digest', session: session.id, forwarded: fresh.length, admin: agent.id })
  } catch (error) {
    // 派发失败不动游标不丢袋——下一轮整理任务把这袋增量一起背上。
    store.appendCall({ kind: 'digest', session: session.id, error: error instanceof Error ? error.message : 'dispatch failed' })
    return
  }
  await withEntityStore(cwd, data => { data.cursors[session.id] = lastSeq })
  p.entries = p.entries.filter(e => e.seq > lastSeq)
}
