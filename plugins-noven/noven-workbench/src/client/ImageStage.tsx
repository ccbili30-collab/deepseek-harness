/**
 * One staged image: browse it, annotate it (drag a box, write its note,
 * persisted through the annotation route), and pick colors off it (canvas
 * eyedropper, click to copy). The stage is pure presentation plus the API
 * face; it never touches files itself.
 * @module noven-workbench/client/ImageStage
 */
import { useEffect, useRef, useState } from 'react'
import type { PointerEvent as ReactPointerEvent, MouseEvent as ReactMouseEvent } from 'react'
import type { SessionId } from '@deepseek-ai/dsh-session/types'
import type { AnnotationRecord } from '../annotations.ts'
import type { WorkbenchApi } from './api.ts'
import type { NovenWorkbenchKey } from './locales.ts'

/** One in-progress box while the pointer is down, in image fractions. */
interface DraftBox { x0: number, y0: number, x1: number, y1: number }

/** A picked color, as the swatch row shows it. */
interface PickedColor { hex: string, rgb: string }

/** The translate shape both hosts (sidebar tab, image viewer) hand the stage. */
export type ImageStageTranslate = (key: NovenWorkbenchKey) => string

/** Props the gallery and the image viewer bind for the stage. */
export interface ImageStageProps {
  readonly t: ImageStageTranslate
  readonly sessionId: SessionId
  readonly imageRel: string
  readonly url: string
  readonly api: WorkbenchApi
  /** Exit back to the gallery; absent in the editor-pane viewer, which has no gallery behind it. */
  readonly onClose?: () => void
  /** The mode the stage boots into; the work-mode canvas's annotate action drives it. */
  readonly initialMode?: 'view' | 'annotate' | 'pick'
}

/** Smallest drag that counts as a new box rather than a stray click, in fractions. */
const MIN_BOX = 0.015

/** Stable id for one new annotation. */
function mintAnnotationId(): string {
  return `a-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`
}

/**
 * Render one staged image with its three modes.
 * @param props - locale copy, the session and image addresses, the API face, and the exit.
 * @returns the stage.
 */
export function ImageStage(props: ImageStageProps) {
  const { t } = props
  const [mode, setMode] = useState<'view' | 'annotate' | 'pick'>(props.initialMode ?? 'view')
  const [annotations, setAnnotations] = useState<readonly AnnotationRecord[] | undefined>(undefined)
  const [loadFailed, setLoadFailed] = useState(false)
  const [draft, setDraft] = useState<DraftBox | null>(null)
  const [editing, setEditing] = useState<{ x: number, y: number, w: number, h: number } | null>(null)
  const [editorText, setEditorText] = useState('')
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [saveError, setSaveError] = useState(false)
  const [picked, setPicked] = useState<PickedColor | null>(null)
  const [recent, setRecent] = useState<readonly string[]>([])
  const [copied, setCopied] = useState(false)
  const imgRef = useRef<HTMLImageElement>(null)
  const canvasRef = useRef<HTMLCanvasElement>(null)

  useEffect(() => {
    const controller = new AbortController()
    void props.api.loadAnnotations(props.sessionId, props.imageRel).then(result => {
      if (controller.signal.aborted) return
      if (result.ok) setAnnotations(result.value)
      else setLoadFailed(true)
    })
    return () => { controller.abort() }
  }, [props.api, props.sessionId, props.imageRel])

  /** Draw the loaded image once, so the eyedropper can read any pixel. */
  const onImageLoad = (): void => {
    const image = imgRef.current
    const canvas = canvasRef.current
    if (image === null || canvas === null || image.naturalWidth === 0) return
    canvas.width = image.naturalWidth
    canvas.height = image.naturalHeight
    canvas.getContext('2d')?.drawImage(image, 0, 0)
  }

  /** Pointer position as image fractions, from whichever element holds it. */
  const fractionsOf = (event: ReactPointerEvent<HTMLElement>): { x: number, y: number } => {
    const rect = event.currentTarget.getBoundingClientRect()
    return {
      x: Math.min(1, Math.max(0, (event.clientX - rect.left) / rect.width)),
      y: Math.min(1, Math.max(0, (event.clientY - rect.top) / rect.height)),
    }
  }

  const onDraftStart = (event: ReactPointerEvent<HTMLDivElement>): void => {
    if (mode !== 'annotate' || editing !== null) return
    const start = fractionsOf(event)
    event.currentTarget.setPointerCapture(event.pointerId)
    setDraft({ x0: start.x, y0: start.y, x1: start.x, y1: start.y })
  }

  const onDraftMove = (event: ReactPointerEvent<HTMLDivElement>): void => {
    if (draft === null) return
    const point = fractionsOf(event)
    setDraft({ ...draft, x1: point.x, y1: point.y })
  }

  const onDraftEnd = (): void => {
    if (draft === null) return
    const box = {
      x: Math.min(draft.x0, draft.x1),
      y: Math.min(draft.y0, draft.y1),
      w: Math.abs(draft.x1 - draft.x0),
      h: Math.abs(draft.y1 - draft.y0),
    }
    setDraft(null)
    if (box.w < MIN_BOX || box.h < MIN_BOX) return
    setSelectedId(null)
    setEditorText('')
    setSaveError(false)
    setEditing(box)
  }

  /** Persist the full list; the stage keeps the local copy authoritative on success. */
  const persist = async (next: readonly AnnotationRecord[]): Promise<boolean> => {
    const result = await props.api.saveAnnotations(props.sessionId, props.imageRel, next)
    if (result.ok) {
      setAnnotations(next)
      return true
    }
    setSaveError(true)
    return false
  }

  const saveEditing = (): void => {
    if (editing === null) return
    const text = editorText.trim()
    if (text.length === 0) { setEditing(null); return }
    const record: AnnotationRecord = { ...editing, id: mintAnnotationId(), text, created: Date.now() }
    const next = [...(annotations ?? []), record]
    setEditing(null)
    void persist(next)
  }

  const removeAnnotation = (id: string): void => {
    if (annotations === undefined) return
    void persist(annotations.filter(item => item.id !== id))
    if (selectedId === id) setSelectedId(null)
  }

  const onPick = (event: ReactMouseEvent<HTMLDivElement>): void => {
    if (mode !== 'pick') return
    const image = imgRef.current
    const canvas = canvasRef.current
    if (image === null || canvas === null || image.naturalWidth === 0) return
    const rect = image.getBoundingClientRect()
    const x = Math.floor(((event.clientX - rect.left) / rect.width) * image.naturalWidth)
    const y = Math.floor(((event.clientY - rect.top) / rect.height) * image.naturalHeight)
    if (x < 0 || y < 0 || x >= image.naturalWidth || y >= image.naturalHeight) return
    const context = canvas.getContext('2d')
    if (context === null) return
    const [r, g, b] = context.getImageData(x, y, 1, 1).data
    const hex = `#${[r, g, b].map(v => v.toString(16).padStart(2, '0')).join('')}`
    setPicked({ hex, rgb: `rgb(${String(r)}, ${String(g)}, ${String(b)})` })
    setRecent(current => [hex, ...current.filter(item => item !== hex)].slice(0, 8))
  }

  const copyText = (text: string): void => {
    void navigator.clipboard?.writeText(text).then(() => {
      setCopied(true)
      setTimeout(() => { setCopied(false) }, 1500)
    }).catch(() => { /* the hex stays on screen for manual copy */ })
  }

  const boxStyle = (box: { x: number, y: number, w: number, h: number }): Record<string, string> => ({
    left: `${(box.x * 100).toFixed(3)}%`,
    top: `${(box.y * 100).toFixed(3)}%`,
    width: `${(box.w * 100).toFixed(3)}%`,
    height: `${(box.h * 100).toFixed(3)}%`,
  })

  const draftBox = draft === null ? null
    : { x: Math.min(draft.x0, draft.x1), y: Math.min(draft.y0, draft.y1), w: Math.abs(draft.x1 - draft.x0), h: Math.abs(draft.y1 - draft.y0) }

  return (
    <div className="noven-wb-stage">
      <div className="noven-wb-toolbar">
        {props.onClose !== undefined && <button type="button" className="noven-wb-btn" onClick={props.onClose}>← {t('back')}</button>}
        <button type="button" className="noven-wb-btn" data-active={mode === 'view'} onClick={() => { setMode('view'); setEditing(null) }}>{t('mode.view')}</button>
        <button type="button" className="noven-wb-btn" data-active={mode === 'annotate'} onClick={() => { setMode('annotate'); setEditing(null) }}>{t('mode.annotate')}</button>
        <button type="button" className="noven-wb-btn" data-active={mode === 'pick'} onClick={() => { setMode('pick'); setEditing(null) }}>{t('mode.pick')}</button>
        {mode === 'annotate' && editing === null && <span className="noven-wb-note">{t('annotate.hint')}</span>}
        {mode === 'pick' && <span className="noven-wb-note">{imgRef.current?.naturalWidth === 0 ? t('pick.unavailable') : t('pick.hint')}</span>}
      </div>

      <div className="noven-wb-figure" onClick={onPick}>
        <img ref={imgRef} src={props.url} alt={props.imageRel} onLoad={onImageLoad} draggable={false} />
        <canvas ref={canvasRef} style={{ display: 'none' }} />
        <div
          className="noven-wb-overlay"
          data-mode={mode}
          onPointerDown={onDraftStart}
          onPointerMove={onDraftMove}
          onPointerUp={onDraftEnd}
        >
          {(annotations ?? []).map(item => (
            <div
              key={item.id}
              className="noven-wb-anno"
              data-selected={selectedId === item.id}
              style={boxStyle(item)}
              onClick={event => { event.stopPropagation(); setSelectedId(current => current === item.id ? null : item.id) }}
            >
              {selectedId === item.id && item.text.length > 0 && <span className="noven-wb-anno-label">{item.text}</span>}
            </div>
          ))}
          {draftBox !== null && <div className="noven-wb-anno" style={boxStyle(draftBox)} />}
        </div>
        {editing !== null && (
          <div className="noven-wb-editor" style={{ left: `${(editing.x * 100).toFixed(3)}%`, top: `${((editing.y + editing.h) * 100).toFixed(3)}%` }}>
            <textarea
              autoFocus
              placeholder={t('annotate.editor')}
              value={editorText}
              onChange={event => { setEditorText(event.target.value) }}
              onKeyDown={event => { if (event.key === 'Escape') setEditing(null) }}
            />
            <div className="noven-wb-editor-row">
              <button type="button" className="noven-wb-btn" onClick={() => { setEditing(null) }}>{t('annotate.cancel')}</button>
              <button type="button" className="noven-wb-btn" onClick={saveEditing}>{t('annotate.save')}</button>
            </div>
          </div>
        )}
      </div>

      {mode === 'pick' && (
        <div className="noven-wb-swatch-row">
          {picked === null
            ? <span className="noven-wb-note">{t('pick.hint')}</span>
            : (
              <>
                <div className="noven-wb-swatch" style={{ background: picked.hex }} />
                <code>{picked.hex}</code>
                <span className="noven-wb-note">{picked.rgb}</span>
                <button type="button" className="noven-wb-btn" onClick={() => { copyText(picked.hex) }}>{copied ? t('pick.copied') : t('pick.copy')}</button>
              </>
            )}
          {recent.length > 0 && (
            <span className="noven-wb-recent" aria-label={t('pick.recent')}>
              {recent.map(hex => (
                <button
                  key={hex}
                  type="button"
                  title={hex}
                  className="noven-wb-recent-dot"
                  style={{ background: hex }}
                  onClick={() => { copyText(hex) }}
                />
              ))}
            </span>
          )}
        </div>
      )}

      {mode === 'annotate' && (
        <div className="noven-wb-anno-list">
          {loadFailed && <span className="noven-wb-error">{t('annotate.saveFailed')}</span>}
          {saveError && <span className="noven-wb-error">{t('annotate.saveFailed')}</span>}
          {annotations !== undefined && annotations.length === 0 && <span className="noven-wb-note">{t('annotate.empty')}</span>}
          {(annotations ?? []).map(item => (
            <div key={item.id} className="noven-wb-anno-item" data-selected={selectedId === item.id} onClick={() => { setSelectedId(current => current === item.id ? null : item.id) }}>
              <span>{item.text}</span>
              <button type="button" className="noven-wb-btn" onClick={event => { event.stopPropagation(); removeAnnotation(item.id) }}>{t('annotate.delete')}</button>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
