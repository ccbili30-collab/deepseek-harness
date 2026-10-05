/**
 * CardPick — the two floating trading-card chooser that opens from a
 * creation slot. The cards levitate slightly tilted over a dimmed page; a
 * hover straightens and lights one, a click holds it upright while the other
 * recedes. "新建" turns into a naming step on the card's caption bar; "导入"
 * opens a file picker. Esc or a backdrop press closes without a choice.
 * @module noven-shell/client/pages/CardPick
 */
import { useEffect, useRef, useState } from 'react'
import type { ReactNode } from 'react'
import type { ShellT } from './Home.tsx'
import type { NovenShellLocaleKey } from '../locales.ts'
import { asset } from '../data.ts'
import { glyph } from '../icons.tsx'

export type CardKind = 'world' | 'character'

interface Props {
  readonly t: ShellT
  readonly kind: CardKind
  readonly onClose: () => void
  /** Prefilled name for the naming step, e.g. "新建世界 1". */
  readonly defaultName: string
  /** Naming step finished — the caller creates the card and opens the editor. */
  readonly onCreate: (name: string) => void
  /** A package file was picked — the caller imports it and opens the editor. */
  readonly onImport: (file: File) => void
}

/** Milliseconds the chosen card's settle animation runs before the next step. */
const CHOOSE_MS = 420

/** The floating chooser: two tilted cards — create or import. */
export function CardPick({ t, kind, onClose, defaultName, onCreate, onImport }: Props) {
  const [chosen, setChosen] = useState<'new' | 'import' | null>(null)
  const [naming, setNaming] = useState(false)
  const [name, setName] = useState('')
  const [leaving, setLeaving] = useState(false)
  const fileRef = useRef<HTMLInputElement>(null)
  const inputRef = useRef<HTMLInputElement>(null)
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null)
  // True while the system file dialog is open. The chooser stays mounted on
  // purpose: cancelling the dialog returns to the two cards, so Esc and the
  // backdrop must not tear the layer down while a dialog owns the window.
  const awaitingFile = useRef(false)

  useEffect(() => () => { if (timer.current !== null) clearTimeout(timer.current) }, [])

  useEffect(() => {
    const input = fileRef.current
    const reset = (): void => { awaitingFile.current = false; setChosen(null); setNaming(false) }
    input?.addEventListener('cancel', reset)
    // The input's `cancel` event is not delivered everywhere; when the window
    // regains focus and no file arrived, treat the dialog as dismissed.
    const focus = (): void => {
      setTimeout(() => {
        if (awaitingFile.current && (fileRef.current?.files?.length ?? 0) === 0) reset()
      }, 300)
    }
    window.addEventListener('focus', focus)
    return () => { input?.removeEventListener('cancel', reset); window.removeEventListener('focus', focus) }
  }, [])

  // Closing plays the retract animation first; the caller unmounts after it.
  const requestClose = (): void => {
    if (leaving || awaitingFile.current) return
    setLeaving(true)
    timer.current = setTimeout(onClose, 380)
  }

  useEffect(() => {
    const onKey = (event: KeyboardEvent): void => {
      if (event.key === 'Escape') requestClose()
    }
    window.addEventListener('keydown', onKey)
    return () => { window.removeEventListener('keydown', onKey) }
  })

  const pick = (side: 'new' | 'import'): void => {
    if (chosen === side) return
    if (timer.current !== null) clearTimeout(timer.current)
    setChosen(side)
    setNaming(false)
    timer.current = setTimeout(() => {
      if (side === 'new') setNaming(true)
      else { awaitingFile.current = true; fileRef.current?.click() }
    }, CHOOSE_MS)
  }

  // The gray default name stays visible until the pointer reaches the field;
  // Enter is handled on the window so it also works before the first hover.
  useEffect(() => {
    if (!naming) return
    const onKey = (event: KeyboardEvent): void => {
      if (event.key === 'Enter' && !awaitingFile.current) submit()
    }
    window.addEventListener('keydown', onKey)
    return () => { window.removeEventListener('keydown', onKey) }
  }, [naming, name])

  const submit = (): void => {
    const v = name.trim()
    onCreate(v.length > 0 ? v : defaultName)
  }

  const title: NovenShellLocaleKey = kind === 'world' ? 'create.pick.title.world' : 'create.pick.title.character'
  const sub = (base: 'new' | 'import'): NovenShellLocaleKey =>
    kind === 'world' ? `create.pick.${base}.sub.world` : `create.pick.${base}.sub.character`

  const card = (side: 'new' | 'import', face: string): ReactNode => (
    // Four layers, one motion each: the holder is the static hit area; the
    // enter layer flies the card in once; the float layer bobs forever; the
    // card's own transform only ever transitions tilt — no keyframe can steal
    // it mid-hover, which is what made the first touch jolt.
    <div className="nv-pick-holder" data-side={side}>
      <div className="nv-pick-enter">
        <div className="nv-pick-float">
      <button type="button" className="nv-pick-card" data-side={side}
        data-chosen={chosen === side || undefined} data-dim={chosen !== null && chosen !== side || undefined}
        onClick={e => { e.stopPropagation(); pick(side) }} aria-label={t(`create.pick.${side}`)}>
        <img className="nv-pick-art" src={asset(face)} alt="" draggable={false} />
        <span className="nv-pick-cap">
          <strong>{t(`create.pick.${side}`)}</strong>
          <small>{t(sub(side))}</small>
        </span>
      </button>
        </div>
      </div>
    </div>
  )

  return (
    <div className="nv-pick" data-naming={naming || undefined} data-leaving={leaving || undefined}
      onClick={requestClose}>
      <div className="nv-pick-title" onClick={e => e.stopPropagation()}>
        <span className="nv-pick-title-star" aria-hidden="true">{glyph.sparkle(15)}</span>
        {t(title)}
      </div>
      <div className="nv-pick-stage">
        {card('new', 'pick-create.webp')}
        {card('import', 'pick-import.webp')}
      </div>
      {naming && (
        <div className="nv-pick-namer" onClick={e => e.stopPropagation()}>
          <input id="nv-pick-name-input" ref={inputRef} className="nv-pick-namer-input"
            value={name} placeholder={defaultName}
            onChange={e => setName(e.target.value)}
            onKeyDown={e => {
              e.stopPropagation()
              if (e.key === 'Enter') submit()
              if (e.key === 'Escape') { e.preventDefault(); requestClose() }
            }} />
          <span className="nv-pick-namer-ray" aria-hidden="true" />
          <button type="button" className="nv-pick-namer-go" onClick={submit}>
            {t('create.pick.name.hint')}
          </button>
          <button type="button" className="nv-pick-namer-cancel" onClick={requestClose}>
            {t('create.pick.name.cancel')}
          </button>
        </div>
      )}
      <input ref={fileRef} type="file" accept=".zip,.novex.zip,.png,.txt" hidden
        onChange={e => {
          const file = e.target.files?.[0]
          e.target.value = ''
          awaitingFile.current = false
          if (file !== undefined) onImport(file)
        }} />
    </div>
  )
}
