/**
 * 选区引用：正文里标蓝一段文字，弹「引用到对话」浮钮；点中把选文落成当前会话
 * 草稿末尾的一枚引用 chip（noven-quote 源只挂 codec——不出候选、发送时经
 * serialize 把 chip 换回引用块文本，模型看到的是完整原文，草稿里只占一格）。
 */
import type { Context as ClientContext } from '@deepseek-ai/cordis'
import type { ObservableSnapshot } from '@deepseek-ai/dsh-client-store'
import type { InjectFace, PropsLocale, PropsRuntime } from '@deepseek-ai/dsh-client-ui-slots'
import type { SessionId } from '@deepseek-ai/dsh-session/types'

/** Locale namespace（与 index.tsx 的 NS 同一字典）。 */
const NS = 'novenShell' as const

/**
 * `ctx.inputTriggers` 的最小面：发布的 ui-input-trigger 与本地 ui-slots 版本线
 * 不同步（0.0.1 vs 0.1.7），直接引它的类型会把第二份 SlotMap 拉进编译面，
 * 这里只按 InputTriggerSource 的鸭子形状声明 codec-only 源需要的字段。
 */
interface QuoteTriggerService {
  registerSource(src: {
    trigger: '/' | '@'
    name: string
    showGroupTitle?: boolean
    candidates(): Promise<readonly never[]>
    onPick(): 'handled'
    codec: {
      clipboardText(ref: string): string
      serialize(ref: string, signal: AbortSignal): Promise<string>
    }
  }): () => void
}

/** 引用 chip 的 source 名；serializeReference 按它找 codec。 */
const QUOTE_SOURCE = 'noven-quote'
/** 单条引用原文上限，超出截断。 */
const QUOTE_LIMIT = 4000
/** chip 标签预览长度。 */
const LABEL_LIMIT = 24

/** 模型形态：整段按 markdown 引用块交给主线，正文里不混排版。 */
function quoteModelForm(text: string): string {
  return text.split('\n').map(line => `> ${line}`).join('\n')
}

/** 最小可观察容器：浮钮的 {x,y,text} 状态。 */
interface QuotePop {
  readonly x: number
  readonly y: number
  readonly text: string
}

function signal<T>(initial: T): ObservableSnapshot<T> & { readonly set: (next: T) => void } {
  let snapshot = initial
  const listeners = new Set<() => void>()
  return {
    getSnapshot: () => snapshot,
    set: next => {
      if (Object.is(next, snapshot)) return
      snapshot = next
      for (const listener of listeners) listener()
    },
    subscribe: listener => {
      listeners.add(listener)
      return () => { listeners.delete(listener) }
    },
  }
}

/** 不落进可编辑区（输入框、composer、代码编辑器、挂窗输入）的选区才算引用对象。 */
function editableAncestor(node: Node | null): boolean {
  const el = node instanceof Element ? node : node?.parentElement
  return el?.closest('input, textarea, [contenteditable="true"], .cm-editor, .nv-dock-input') !== null
}

/**
 * 把一段选文插成当前会话草稿末尾的引用 chip。chip 的 clipboard/detect 坐标差
 * 由 occurrences 修正：每个既有 chip 在剪贴板投影占 length 字符、在 detect 投影占 1 字符。
 * @returns whether a composer accepted the chip.
 */
function quoteInto(ctx: ClientContext, text: string, label: string): boolean {
  const id = ctx.uiSession.adapter.current.getSnapshot().key as SessionId | undefined
  const scope = id === undefined ? undefined : ctx.sessions.scope(id)
  const input = scope?.get('conversation')?.input.for(scope)
  if (input === undefined) return false
  const st = input.state.getSnapshot()
  const detectEnd = st.draft.length - st.occurrences.reduce((n, o) => n + o.length, 0) + st.occurrences.length
  const ok = input.insertReference(
    { source: QUOTE_SOURCE, ref: text, label, clipboardText: text },
    { start: detectEnd, end: detectEnd, draftRev: st.draftRev },
  )
  if (ok) input.focus()
  return ok
}

/** shell.overlay 条目的注入面：浮钮状态 + 点中行为。 */
export interface QuoteInjected {
  readonly hooks: { readonly pop: ObservableSnapshot<QuotePop | undefined> }
  /** 接受当前浮钮所指的选文并收起浮钮。 */
  readonly accept: () => void
}

type PopProps = PropsRuntime<'shell.overlay'> & PropsLocale<typeof NS> & InjectFace<QuoteInjected>

/** 选区末尾上方的「引用到对话」浮钮；mousedown 拦默认行为保住选区。 */
function QuotePopButton({ usePop, accept, t }: PopProps) {
  const pop = usePop((s: QuotePop | undefined) => s)
  if (pop === undefined) return null
  return (
    <button
      type="button"
      className="nv-quote-pop"
      style={{ left: pop.x, top: pop.y }}
      onMouseDown={ev => ev.preventDefault()}
      onClick={accept}
    >{t('quote.send')}</button>
  )
}

/**
 * 挂上浮钮所需的三件套：codec-only 引用源、选区监听、shell.overlay 条目。
 * @param ctx - client root context.
 */
export function applyQuote(ctx: ClientContext): void {
  const inputTriggers = ctx.get('inputTriggers') as QuoteTriggerService | undefined
  if (inputTriggers !== undefined) {
    const source: Parameters<QuoteTriggerService['registerSource']>[0] = {
      trigger: '@',
      name: QUOTE_SOURCE,
      showGroupTitle: false,
      candidates: async () => [],
      onPick: () => 'handled',
      codec: {
        clipboardText: (ref: string) => ref,
        serialize: async (ref: string) => quoteModelForm(ref),
      },
    }
    ctx.effect(() => inputTriggers.registerSource(source), 'noven-shell: 引用 codec')
  }

  const pop = signal<QuotePop | undefined>(undefined)
  ctx.effect(() => {
    const onUp = (): void => {
      const sel = window.getSelection()
      const text = sel === null || sel.isCollapsed ? '' : (sel.toString().trim())
      if (sel === null || text.length < 2 || sel.rangeCount === 0 || editableAncestor(sel.anchorNode) || editableAncestor(sel.focusNode)) {
        pop.set(undefined)
        return
      }
      const rect = sel.getRangeAt(0).getBoundingClientRect()
      pop.set({ x: rect.left + rect.width / 2, y: rect.top, text: text.slice(0, QUOTE_LIMIT) })
    }
    const onChange = (): void => {
      const sel = window.getSelection()
      if (sel === null || sel.isCollapsed) pop.set(undefined)
    }
    document.addEventListener('mouseup', onUp)
    document.addEventListener('selectionchange', onChange)
    return () => {
      document.removeEventListener('mouseup', onUp)
      document.removeEventListener('selectionchange', onChange)
    }
  }, 'noven-shell: 选区监听')

  ctx.effect(() => ctx.slots.inject('shell.overlay', () => ctx.slots.register({
    name: 'shell.overlay', id: 'noven-quote', locale: NS,
    inject: (): QuoteInjected => ({
      hooks: { pop },
      accept: () => {
        const current = pop.getSnapshot()
        pop.set(undefined)
        if (current === undefined) return
        window.getSelection()?.removeAllRanges()
        const preview = current.text.length > LABEL_LIMIT ? `${current.text.slice(0, LABEL_LIMIT)}…` : current.text
        if (!quoteInto(ctx, current.text, `“${preview}”`)) console.warn('noven-shell: quote chip rejected by composer')
      },
    }),
  }, QuotePopButton)), 'noven-shell: 引用浮钮')
}
