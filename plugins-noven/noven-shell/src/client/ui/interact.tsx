/**
 * Noven interaction primitives that replace `window.confirm` / `window.prompt`
 * (设计理念 §四 删除口径):
 *
 * - {@link useArmedMenu}: in-menu second confirmation. Selecting a destructive
 *   row arms it (the row turns red and reads the confirm label) and keeps the
 *   menu open; selecting it again runs the action. Closing the menu, picking
 *   another row, or {@link ARM_TIMEOUT_MS} of inactivity disarms it.
 * - {@link askConfirm} / {@link askText}: promise-returning dialogs for places
 *   with no menu to arm (toolbar buttons, custom popovers). They render in one
 *   body-level host with the shared enter/exit motion, Escape/Enter keys, and
 *   focus return.
 * - {@link notifyUndo}: a bottom-center receipt with an optional undo action,
 *   for soft deletes the backend can reverse.
 *
 * The hosts mount lazily on first use into their own React roots, so callers
 * need no provider; copy arrives already localized from the caller.
 * @module noven-shell/client/ui/interact
 */
import { useCallback, useEffect, useRef, useState } from 'react'
import type { KeyboardEvent as ReactKeyboardEvent } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import type { MenuEntry, MenuItem } from '@deepseek-ai/dsh-client-ui-primitives'

/** Idle time after which an armed menu row reverts to its resting label. */
export const ARM_TIMEOUT_MS = 3000

/** One destructive row the menu should guard with a second press. */
export interface ArmSpec {
  /** Menu item id that needs confirmation. */
  readonly id: string
  /** Label shown while armed (e.g. 「确认删除？」). */
  readonly confirmLabel: string
}

/** What {@link useArmedMenu} hands back to the menu owner. */
export interface ArmedMenu {
  /** Rewrite the items so an armed row shows its confirm label in danger style. */
  readonly decorate: (items: readonly MenuEntry[]) => MenuEntry[]
  /**
   * Route one selection. Returns `'armed'` when the press only armed a guarded
   * row (the owner must keep the menu open), otherwise `'run'` — the owner
   * closes the menu and performs the action as before.
   */
  readonly select: (id: string) => 'armed' | 'run'
  /** Drop the armed state (call from the menu's onClose). */
  readonly reset: () => void
}

const isItem = (entry: MenuEntry): entry is MenuItem => !('type' in entry)

/** Two-press state shared by menus and standalone destructive buttons. */
export interface ArmedPress {
  /** Key currently armed, or null. */
  readonly armed: string | null
  /** First press of `key` arms it and returns false; a second press within the window returns true. */
  readonly press: (key: string) => boolean
  /** Drop the armed state. */
  readonly reset: () => void
}

/**
 * Two-press confirmation state: the first press arms a key, the second runs it.
 * The armed key reverts after {@link ARM_TIMEOUT_MS} or on {@link ArmedPress.reset}.
 * @returns the armed key and press/reset handles.
 */
export function useArmedPress(): ArmedPress {
  const [armed, setArmed] = useState<string | null>(null)
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined)
  const clear = useCallback(() => {
    if (timer.current !== undefined) clearTimeout(timer.current)
    timer.current = undefined
  }, [])
  useEffect(() => clear, [clear])
  const reset = useCallback(() => { clear(); setArmed(null) }, [clear])
  const press = useCallback((key: string): boolean => {
    if (armed === key) { reset(); return true }
    clear()
    setArmed(key)
    timer.current = setTimeout(() => { setArmed(null) }, ARM_TIMEOUT_MS)
    return false
  }, [armed, clear, reset])
  return { armed, press, reset }
}

/**
 * In-menu second confirmation for destructive rows.
 * @param guarded - rows that need a second press, with their armed labels.
 * @returns decorate/select/reset handles for one menu instance.
 */
export function useArmedMenu(guarded: readonly ArmSpec[]): ArmedMenu {
  const { armed, press, reset } = useArmedPress()
  const select = useCallback((id: string): 'armed' | 'run' => {
    if (!guarded.some(g => g.id === id)) { reset(); return 'run' }
    return press(id) ? 'run' : 'armed'
  }, [guarded, press, reset])
  const decorate = useCallback((items: readonly MenuEntry[]): MenuEntry[] => items.map(entry => {
    if (!isItem(entry) || entry.id !== armed) return entry
    const spec = guarded.find(g => g.id === entry.id)
    return spec === undefined ? entry : { ...entry, label: <span className="nv-armed">{spec.confirmLabel}</span>, danger: true }
  }), [armed, guarded])
  return { decorate, select, reset }
}

// ── inline rename ──────────────────────────────────────────────────────────

/**
 * One-line in-place rename input: focuses with the text selected, Enter or
 * blur commits, Escape cancels. Reports exactly once.
 * @param props.value - current name (seed and no-change baseline).
 * @param props.className - row-specific input class.
 * @param props.onDone - receives the trimmed new name, or undefined when
 * cancelled, emptied, or unchanged; the owner leaves edit mode here.
 * @returns the input element.
 */
export function InlineRename({ value, className, onDone }: {
  readonly value: string
  readonly className: string
  readonly onDone: (next: string | undefined) => void
}) {
  const [draft, setDraft] = useState(value)
  const done = useRef(false)
  const finish = (commit: boolean): void => {
    if (done.current) return
    done.current = true
    const next = draft.trim()
    onDone(commit && next !== '' && next !== value ? next : undefined)
  }
  return (
    <input className={className} value={draft} autoFocus
      onFocus={e => e.currentTarget.select()}
      onChange={e => setDraft(e.target.value)}
      onBlur={() => finish(true)}
      onKeyDown={e => {
        if (e.key === 'Enter' && !e.nativeEvent.isComposing) { e.preventDefault(); finish(true) }
        if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); finish(false) }
      }} />
  )
}

// ── dialog host ────────────────────────────────────────────────────────────

/** Copy for a confirmation dialog; every string is already localized. */
export interface ConfirmCopy {
  readonly title: string
  readonly body?: string
  readonly confirm: string
  readonly cancel: string
  /** Paint the confirm button in the danger color (deletions). */
  readonly danger?: boolean
}

/** Copy and seed for a one-line text dialog (renames). */
export interface TextCopy {
  readonly title: string
  readonly initial: string
  readonly confirm: string
  readonly cancel: string
  readonly placeholder?: string
}

type DialogReq =
  | { readonly kind: 'confirm'; readonly copy: ConfirmCopy; readonly done: (ok: boolean) => void }
  | { readonly kind: 'text'; readonly copy: TextCopy; readonly done: (value: string | undefined) => void }

type Listener = (req: DialogReq | null) => void
let dialogListener: Listener | null = null
let dialogRoot: Root | null = null
const dialogQueue: DialogReq[] = []

/** Exit animation length; must match `nv-veil-out` in style.ts. */
const EXIT_MS = 160

function DialogHost() {
  const [req, setReq] = useState<DialogReq | null>(null)
  const [leaving, setLeaving] = useState(false)
  const [text, setText] = useState('')
  const inputRef = useRef<HTMLInputElement>(null)
  const okRef = useRef<HTMLButtonElement>(null)
  const returnFocus = useRef<Element | null>(null)
  useEffect(() => {
    dialogListener = next => {
      returnFocus.current = document.activeElement
      setLeaving(false)
      setReq(next)
      if (next?.kind === 'text') setText(next.copy.initial)
    }
    if (dialogQueue.length > 0) dialogListener(dialogQueue[0] ?? null)
    return () => { dialogListener = null }
  }, [])
  useEffect(() => {
    if (req === null) return
    const frame = requestAnimationFrame(() => {
      if (req.kind === 'text') { inputRef.current?.focus(); inputRef.current?.select() } else okRef.current?.focus()
    })
    return () => { cancelAnimationFrame(frame) }
  }, [req])
  if (req === null) return null
  const finish = (accept: boolean): void => {
    if (leaving) return
    setLeaving(true)
    if (req.kind === 'confirm') req.done(accept)
    else {
      const value = text.trim()
      req.done(accept && value !== '' ? value : undefined)
    }
    setTimeout(() => {
      dialogQueue.shift()
      const target = returnFocus.current
      if (target instanceof HTMLElement && target.isConnected) target.focus()
      const next = dialogQueue[0]
      if (next !== undefined) dialogListener?.(next)
      else setReq(null)
    }, EXIT_MS)
  }
  const onKey = (e: ReactKeyboardEvent): void => {
    if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); finish(false) }
    if (e.key === 'Enter' && !e.nativeEvent.isComposing) { e.preventDefault(); finish(true) }
  }
  const copy = req.copy
  const danger = req.kind === 'confirm' && req.copy.danger === true
  return (
    <div className="nv-veil" data-leaving={leaving || undefined} role="presentation" onKeyDown={onKey}>
      <div className="nv-veil-mask" aria-hidden="true" onClick={() => finish(false)} />
      <div className="nv-veil-card" role="dialog" aria-modal="true" aria-label={copy.title}>
        <div className="nv-veil-title">{copy.title}</div>
        {req.kind === 'confirm' && req.copy.body !== undefined && <div className="nv-veil-body">{req.copy.body}</div>}
        {req.kind === 'text' && (
          <input ref={inputRef} className="nv-veil-input" value={text} placeholder={req.copy.placeholder}
            onChange={e => setText(e.target.value)} />
        )}
        <div className="nv-veil-actions">
          <button type="button" className="nv-veil-btn" onClick={() => finish(false)}>{copy.cancel}</button>
          <button ref={okRef} type="button" className="nv-veil-btn nv-veil-ok" data-danger={danger || undefined}
            disabled={req.kind === 'text' && text.trim() === ''}
            onClick={() => finish(true)}>{copy.confirm}</button>
        </div>
      </div>
    </div>
  )
}

function mountHost(className: string, node: JSX.Element): Root {
  const el = document.createElement('div')
  el.className = className
  document.body.appendChild(el)
  const root = createRoot(el)
  root.render(node)
  return root
}

function enqueue(req: DialogReq): void {
  dialogQueue.push(req)
  if (dialogRoot === null) { dialogRoot = mountHost('nv-veil-host', <DialogHost />); return }
  if (dialogQueue.length === 1) dialogListener?.(req)
}

/**
 * Ask a yes/no question in the shared dialog.
 * @param copy - localized title, optional body, and button labels.
 * @returns whether the user confirmed.
 */
export function askConfirm(copy: ConfirmCopy): Promise<boolean> {
  return new Promise(resolve => { enqueue({ kind: 'confirm', copy, done: resolve }) })
}

/**
 * Ask for one line of text (rename) in the shared dialog.
 * @param copy - localized title, seed value, and button labels.
 * @returns the trimmed non-empty value, or undefined when cancelled or emptied.
 */
export function askText(copy: TextCopy): Promise<string | undefined> {
  return new Promise(resolve => { enqueue({ kind: 'text', copy, done: resolve }) })
}

// ── undo receipt ───────────────────────────────────────────────────────────

/** One receipt: localized text plus an optional reversal. */
export interface UndoNotice {
  readonly text: string
  /** Localized label for the undo action; omit with `undo` for a plain receipt. */
  readonly undoLabel?: string
  readonly undo?: () => void
  /** Full-visibility hold before the receipt fades (default 5s). */
  readonly holdMs?: number
}

let toastListener: ((n: UndoNotice & { readonly seq: number }) => void) | null = null
let toastRoot: Root | null = null
let toastPending: (UndoNotice & { readonly seq: number }) | null = null
let toastSeq = 0

function ToastHost() {
  const [notice, setNotice] = useState<(UndoNotice & { readonly seq: number }) | null>(null)
  const [leaving, setLeaving] = useState(false)
  useEffect(() => {
    toastListener = n => { setLeaving(false); setNotice(n) }
    if (toastPending !== null) { setNotice(toastPending); toastPending = null }
    return () => { toastListener = null }
  }, [])
  useEffect(() => {
    if (notice === null) return
    const fade = setTimeout(() => setLeaving(true), notice.holdMs ?? 5000)
    const drop = setTimeout(() => setNotice(cur => cur?.seq === notice.seq ? null : cur), (notice.holdMs ?? 5000) + EXIT_MS)
    return () => { clearTimeout(fade); clearTimeout(drop) }
  }, [notice])
  if (notice === null) return null
  return (
    <div key={notice.seq} className="nv-undo" role="status" data-leaving={leaving || undefined}>
      <span className="nv-undo-text">{notice.text}</span>
      {notice.undo !== undefined && notice.undoLabel !== undefined && (
        <button type="button" className="nv-undo-undo"
          onClick={() => { notice.undo?.(); setLeaving(true); setTimeout(() => setNotice(null), EXIT_MS) }}>
          {notice.undoLabel}
        </button>
      )}
    </div>
  )
}

/**
 * Show a receipt after a deletion, optionally with an undo action. A newer
 * receipt replaces the one on screen.
 * @param notice - localized text, optional undo label and handler, optional hold.
 */
export function notifyUndo(notice: UndoNotice): void {
  toastSeq += 1
  const next = { ...notice, seq: toastSeq }
  if (toastRoot === null) { toastPending = next; toastRoot = mountHost('nv-undo-host', <ToastHost />); return }
  toastListener?.(next)
}
