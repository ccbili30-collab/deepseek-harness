/**
 * In-place conversation rewind for the Noven shell.
 *
 * The Session log is append-only, so an edit or regeneration cannot delete the
 * old answer. Instead the new prompt is appended as a surface replacement that
 * shadows the old prompt and everything after it. The model-visible surface and
 * the transcript both stop at the edited prompt; the old events stay in the log
 * for audit but are no longer part of the conversation.
 *
 * The replacement must be appended inside the new Turn, after `turn/start` and
 * before the model request. A sentinel user message wakes the loop; the
 * `agent/pre-step` hook replaces it with the real surface replacement and asks
 * the loop to run from the surface (`surfacePrompt`) instead of appending a
 * second copy of the prompt.
 * @module noven-shell/rewind
 */
import type { Context } from '@deepseek-ai/cordis'
import type { PreStepDecision } from '@deepseek-ai/dsh-agent'
import type {} from '@deepseek-ai/dsh-agent'
import type {} from '@deepseek-ai/dsh-api-session-controller'
import { createUserMessage, type MessageId } from '@deepseek-ai/dsh-llm'
import { SessionSeq, type Session, type SessionId } from '@deepseek-ai/dsh-session'

/** One rewind waiting for its sentinel to reach the next pre-step. */
interface RewindIntent {
  readonly sentinelId: MessageId
  readonly startSeq: number
  readonly text: string
}

/** Validated request body. */
interface RewindRequest {
  readonly sessionId: SessionId
  readonly startSeq: number
  readonly text: string
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
}

function parseRequest(raw: unknown): RewindRequest | undefined {
  if (!isRecord(raw)) return undefined
  const sessionId = raw['sessionId']
  const startSeq = raw['startSeq']
  const text = raw['text']
  if (typeof sessionId !== 'string' || sessionId === ''
    || typeof startSeq !== 'number' || !Number.isSafeInteger(startSeq) || startSeq < 0
    || typeof text !== 'string' || text.trim() === '') return undefined
  return { sessionId: sessionId as SessionId, startSeq, text }
}

/**
 * Append the visible replacement for one rewind. `startSeq` must still be a
 * current surface node; the replacement shadows it through the surface tail.
 * @param session - live Session receiving the new prompt.
 * @param intent - shadow start and prompt text.
 * @returns whether the replacement landed.
 */
function replaceSurface(session: Session, intent: RewindIntent): boolean {
  const nodes = session.surface.nodes
  const start = SessionSeq(intent.startSeq)
  const startIdx = nodes.indexOf(start)
  if (startIdx < 0) return false
  const end = nodes.at(-1)
  if (end === undefined) return false
  const lastSeq = session.seq - 1
  if (lastSeq < intent.startSeq) return false
  // The model only needs the surface range, but the transcript also hides the
  // old Turn's process and tail nodes, whose anchors are boundary events.
  // Cite every event from the containing turn start through the old tail.
  const events = session.snapshotEvents()
  const turnStart = events.findLast(event =>
    event.type === 'turn/start' && event.seq <= intent.startSeq)
  const sourceStart = turnStart === undefined ? intent.startSeq : turnStart.seq
  const sources = events
    .filter(event => event.seq >= sourceStart && event.seq <= lastSeq)
    .map(event => event.seq)
  if (sources.length === 0) return false
  const message = createUserMessage({
    source: { kind: 'user' },
    content: [{ type: 'text', text: intent.text }],
  })
  session.append('user/message', message, {
    surfaceOp: { op: 'replace', startSeq: start, endSeq: end },
    sourceEventSeqs: sources,
  })
  return true
}

/**
 * Register the pre-step rewriter and its HTTP route.
 * @param ctx - Host context carrying the Session controller and connection.
 */
export function registerRewind(ctx: Context): void {
  const pending = new Map<SessionId, RewindIntent>()

  ctx.on('agent/pre-step', async (payload, next): Promise<PreStepDecision> => {
    const decision = await next()
    if (decision.kind === 'reject') return decision
    const session = payload.agent.session
    const intent = pending.get(session.id)
    if (intent === undefined) return decision
    if (!payload.messages.some(message => message.id === intent.sentinelId)) return decision
    pending.delete(session.id)
    try {
      if (!replaceSurface(session, intent)) return decision
    } catch (error: unknown) {
      console.warn('noven-shell: rewind replacement failed:', error)
      return decision
    }
    const rewritten = {
      ...decision,
      messages: decision.messages.filter(message => message.id !== intent.sentinelId),
      surfacePrompt: true as const,
    }
    // The published rc surface decision predates `surfacePrompt`; the loop
    // source reads the field, so only the plugin's structural type needs the cast.
    return rewritten as PreStepDecision
  })

  ctx.effect(() => ctx.connection.fetch.register({
    path: '/api/noven-rewind',
    methods: ['POST'],
    requestBody: 'buffered',
    fetch: async (request) => {
      const raw: unknown = await request.json().catch(() => undefined)
      const parsed = parseRequest(raw)
      if (parsed === undefined) return Response.json({ error: 'invalid rewind request' }, { status: 400 })
      let resolved: Awaited<ReturnType<typeof ctx.sessionController.resolveAgent>>
      try {
        resolved = await ctx.sessionController.resolveAgent(parsed.sessionId)
      } catch (error: unknown) {
        console.warn('noven-shell: rewind resolve failed:', error)
        return Response.json({ error: 'session unavailable' }, { status: 404 })
      }
      if (!('agent' in resolved)) return Response.json({ error: 'session unavailable' }, { status: 404 })
      const agent = resolved.agent
      if (agent.status === 'running'
        || agent.inbox.nextTurn.length > 0 || agent.inbox.nextStep.length > 0) {
        return Response.json({ error: 'session is busy' }, { status: 409 })
      }
      const sentinel = createUserMessage({
        source: { kind: 'user' },
        content: [{ type: 'text', text: parsed.text }],
      })
      pending.set(parsed.sessionId, {
        sentinelId: sentinel.id,
        startSeq: parsed.startSeq,
        text: parsed.text,
      })
      try {
        agent.followup(sentinel)
      } catch (error: unknown) {
        pending.delete(parsed.sessionId)
        console.warn('noven-shell: rewind wake failed:', error)
        return Response.json({ error: 'session unavailable' }, { status: 500 })
      }
      return Response.json({ ok: true })
    },
  }), 'noven-shell: /api/noven-rewind')
}
