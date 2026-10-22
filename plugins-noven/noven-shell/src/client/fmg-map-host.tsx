/**
 * Card-side host for the vendored Fantasy-Map-Generator editor.
 *
 * The editor is a complete upstream application served by the Host under
 * `/api/noven-map-editor/`. The map module's first text block is the canonical
 * `.map` document; the editor bridge loads it and posts a save back to this
 * host, which writes the document through the normal card command path.
 *
 * @module noven-shell/client/fmg-map-host
 */
import { useEffect, useRef, useState } from 'react'
import type { CardAddr, CardModuleDoc } from './card-api.ts'
import type { ShellT } from './pages/Home.tsx'
import type { WidgetSend } from './widgets.tsx'

/** Same-origin FMG document; the shell is mounted inside it, so there is no second host page. */
const EDITOR_URL = '/api/noven-map-editor/index.html?noven=blank&v=15'

/** A real FMG document starts with its version, e.g. `1.154.2|...`. */
const FMG_DOCUMENT = /^\d+\.\d+\.\d+\|/

interface NovenHostWindow extends Window {
  novenHostReady?: boolean
}

/** One queue item written by the map tool. */
interface MapOperation {
  readonly op: string
  readonly args: readonly unknown[]
}

interface MapTerrainOperation {
  readonly op: string
  readonly args: Record<string, unknown>
}

interface MapGenerationRequest {
  readonly kind?: 'edit' | 'compose' | 'paint' | 'human'
  readonly operations?: readonly MapOperation[]
  readonly terrain?: readonly MapTerrainOperation[]
  readonly spec?: Record<string, unknown>
  readonly template?: string
  readonly seed?: string
  readonly width?: number
  readonly height?: number
  readonly points?: number
  readonly empty?: boolean
}

function isMapOperation(value: unknown): value is MapOperation {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) return false
  const record = value as Record<string, unknown>
  return typeof record.op === 'string' && Array.isArray(record.args)
}

function isTerrainOperation(value: unknown): value is MapTerrainOperation {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) return false
  const record = value as Record<string, unknown>
  return typeof record.op === 'string' && record.args !== null && typeof record.args === 'object' && !Array.isArray(record.args)
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
}

/** Parse a stored generation request without trusting its shape. */
function mapRequestFromRaw(raw: unknown): MapGenerationRequest | undefined {
  if (raw === null || typeof raw !== 'object' || Array.isArray(raw)) return undefined
  const record = raw as Record<string, unknown>
  const operations = Array.isArray(record.operations) ? record.operations.filter(isMapOperation) : undefined
  const terrain = Array.isArray(record.operations) ? record.operations.filter(isTerrainOperation) : undefined
  return {
    ...(record.kind === 'edit' && operations !== undefined && operations.length > 0 ? { kind: 'edit' as const, operations } : {}),
    ...(record.kind === 'compose' && isRecord(record.spec) ? { kind: 'compose' as const, spec: record.spec } : {}),
    ...(record.kind === 'paint' && terrain !== undefined && terrain.length > 0 ? { kind: 'paint' as const, terrain } : {}),
    ...(record.kind === 'human' ? { kind: 'human' as const } : {}),
    ...(typeof record.template === 'string' && record.template !== '' ? { template: record.template } : {}),
    ...(typeof record.seed === 'string' && record.seed !== '' ? { seed: record.seed } : {}),
    ...(typeof record.width === 'number' && Number.isFinite(record.width) ? { width: record.width } : {}),
    ...(typeof record.height === 'number' && Number.isFinite(record.height) ? { height: record.height } : {}),
    ...(typeof record.points === 'number' && Number.isFinite(record.points) ? { points: record.points } : {}),
    ...(record.empty === true ? { empty: true } : {}),
  }
}

const mapRequestOf = (module: CardModuleDoc): MapGenerationRequest | undefined => mapRequestFromRaw(module.widget?.request)

/** The map module's stored document, if any. */
function mapDocumentOf(module: CardModuleDoc): string {
  return module.blocks.find(block => block.kind === 'text')?.text ?? ''
}

/**
 * Mount the complete FMG editor for one map module.
 * @param props - map module, shell translator, and the card command sender.
 * @returns a full-bleed iframe host with a legacy-data notice when needed.
 */
export function FmgMapHost({ module, t, send, addr, cardId }: {
  readonly module: CardModuleDoc
  readonly t: ShellT
  readonly send: WidgetSend
  readonly addr: CardAddr
  readonly cardId: string
}) {
  const frameRef = useRef<HTMLIFrameElement | null>(null)
  const [ready, setReady] = useState(false)
  const [legacy, setLegacy] = useState(false)
  const [error, setError] = useState(false)
  const [expanded, setExpanded] = useState(false)
  const [draft, setDraft] = useState(false)
  const [terrain, setTerrain] = useState(false)
  const documentRef = useRef(mapDocumentOf(module))
  documentRef.current = mapDocumentOf(module)
  const requestRef = useRef(mapRequestOf(module))
  requestRef.current = mapRequestOf(module)
  /** Last generation request this host handed to the editor. */
  const requestSentRef = useRef('')
  /** Terrain request waiting for the blank sheet to finish booting. */
  const pendingTerrainRef = useRef<MapGenerationRequest | undefined>(undefined)
  /** Applied-AI history is scoped to this card module, so a reload can still undo. */
  const undoKey = `noven-map-ai-undo:${cardId}:${module.id}`

  // Wait for the host page to report that the upstream bridge is live, then
  // either load the stored .map, ask for a blank world, or leave a legacy
  // payload untouched (the editor's default world is shown with a notice).
  useEffect(() => {
    const frame = frameRef.current
    if (frame === null) return
    let live = true
    let applied = false
    const fallback = window.setTimeout(() => { if (live) setReady(true) }, 12000)
    const apply = (win: NovenHostWindow): void => {
      if (applied) return
      applied = true
      const request = requestRef.current
      const stored = documentRef.current
      const hasDocument = FMG_DOCUMENT.test(stored)
      const blankOptions = {
        seed: `noven-blank-${module.id}`,
        width: 1280,
        height: 800,
        points: 10000,
        draftKey: `noven-map-draft:${cardId}:${module.id}`,
        undoKey,
      }
      if (request !== undefined) {
        requestSentRef.current = JSON.stringify(request)
        setDraft(false)
        setTerrain(false)
        if (request.kind === 'compose' || request.kind === 'paint') {
          if (!hasDocument && stored.trim() === '') {
            pendingTerrainRef.current = request
            setDraft(true)
            win.postMessage({ type: 'noven-map-blank', options: request.kind === 'compose' ? { ...blankOptions, fresh: true } : blankOptions }, '*')
          } else {
            setReady(true)
          }
          return
        }
        if (request.kind === 'human') {
          if (hasDocument) win.postMessage({ type: 'noven-map-load', data: stored, undoKey, afterHuman: true }, '*')
          return
        }
        if (request.kind === 'edit' && request.operations !== undefined) {
          // The editor boots with its default map. A queued edit must wait for
          // the card's document, otherwise it renames entities in that default.
          // With no document, keep the request queued and open the blank sheet.
          if (hasDocument) {
            win.postMessage({ type: 'noven-map-load', data: stored, undoKey, afterEdit: request.operations }, '*')
            return
          }
          if (stored.trim() !== '') {
            setLegacy(true)
            setReady(true)
            return
          }
        } else {
          win.postMessage({ type: 'noven-map-generate', options: { ...request, undoKey } }, '*')
          return
        }
      }
      const isLegacy = stored.trim() !== '' && !hasDocument
      setLegacy(isLegacy)
      if (isLegacy) {
        setDraft(false)
        setTerrain(false)
        setReady(true)
        return
      }
      if (hasDocument) {
        const stage = module.widget?.mapStage
        setDraft(false)
        setTerrain(stage === 'terrain')
        win.postMessage({ type: 'noven-map-load', data: stored, undoKey }, '*')
        if (stage === 'terrain') win.postMessage({ type: 'noven-map-stage', stage: 'terrain' }, '*')
        return
      }
      setDraft(true)
      setTerrain(false)
      win.postMessage({ type: 'noven-map-blank', options: blankOptions }, '*')
    }
    const timer = window.setInterval(() => {
      const win = frame.contentWindow as NovenHostWindow | null
      if (win?.novenHostReady !== true) return
      window.clearInterval(timer)
      apply(win)
    }, 80)
    return () => {
      live = false
      window.clearTimeout(fallback)
      window.clearInterval(timer)
    }
  }, [module.id, cardId])

  // The AI tool writes a one-shot request into the card; this lightweight
  // poll picks it up even when no AI edit event reaches the card page.
  useEffect(() => {
    const base = addr.sessionId !== undefined
      ? `api/noven-cards?session=${encodeURIComponent(addr.sessionId)}`
      : `api/noven-cards?root=${encodeURIComponent(addr.root ?? '')}`
    let live = true
    const check = async (): Promise<void> => {
      const url = `${base}&card=${encodeURIComponent(cardId)}&mapRequest=${encodeURIComponent(module.id)}`
      const response = await fetch(new URL(url, document.baseURI)).catch(() => undefined)
      if (!live || response === undefined || !response.ok) return
      const payload = await response.json() as { readonly request?: unknown }
      const request = mapRequestFromRaw(payload.request)
      if (request === undefined) {
        requestSentRef.current = ''
        return
      }
      const key = JSON.stringify(request)
      if (key === requestSentRef.current) return
      const win = frameRef.current?.contentWindow as NovenHostWindow | null
      if (win?.novenHostReady !== true) return
      if (request.kind === 'edit' && request.operations !== undefined) {
        requestSentRef.current = key
        setDraft(false)
        setTerrain(false)
        win.postMessage({ type: 'noven-map-edit', operations: request.operations, undoKey }, '*')
        return
      }
      if (request.kind === 'compose' && request.spec !== undefined) {
        requestSentRef.current = key
        setDraft(true)
        setTerrain(false)
        win.postMessage({ type: 'noven-map-compose', spec: request.spec }, '*')
        return
      }
      if (request.kind === 'paint' && request.terrain !== undefined) {
        requestSentRef.current = key
        setDraft(true)
        setTerrain(false)
        win.postMessage({ type: 'noven-map-paint', operations: request.terrain }, '*')
        return
      }
      if (request.kind === 'human') {
        requestSentRef.current = key
        win.postMessage({ type: 'noven-map-human' }, '*')
        return
      }
      requestSentRef.current = key
      win.postMessage({ type: 'noven-map-generate', options: request }, '*')
    }
    const timer = window.setInterval(() => { void check() }, 1500)
    void check()
    return () => {
      live = false
      window.clearInterval(timer)
    }
  }, [addr, cardId, module.id])

  // Save requests come from the host page (same-origin iframe). The card
  // command owns persistence; the host page gets an ack for its status pill.
  useEffect(() => {
    const onMessage = (event: MessageEvent): void => {
      const frame = frameRef.current
      if (frame === null || event.source !== frame.contentWindow) return
      const data = event.data
      if (data === null || typeof data !== 'object') return
      if (data.type === 'noven-map-fullscreen-toggle') {
        setExpanded(value => !value)
        return
      }
      if (data.type === 'noven-map-save' && typeof data.data === 'string') {
        const stage = data.stage === 'terrain' || data.stage === 'world' ? data.stage : undefined
        const summary = data.summary !== null && typeof data.summary === 'object' && !Array.isArray(data.summary) ? data.summary : undefined
        void send({
          kind: 'write_map_document',
          moduleId: module.id,
          text: data.data,
          ...(stage === undefined ? {} : { stage }),
          ...(summary === undefined ? {} : { summary }),
        })
          .then(ok => {
            frame.contentWindow?.postMessage({
              type: ok ? 'noven-map-saved' : 'noven-map-save-failed',
              ...(ok ? {} : { message: t('canvas.map.saveFailed') }),
            }, '*')
          })
          .catch((reason: unknown) => {
            console.warn('noven-shell: map save failed:', reason)
            frame.contentWindow?.postMessage({ type: 'noven-map-save-failed', message: t('canvas.map.saveFailed') }, '*')
          })
        return
      }
      if (data.type === 'noven-map-blank-started') {
        setError(false)
        setDraft(true)
        setTerrain(false)
        setReady(true)
        const pending = pendingTerrainRef.current
        pendingTerrainRef.current = undefined
        if (pending?.kind === 'compose' && pending.spec !== undefined) {
          frame.contentWindow?.postMessage({ type: 'noven-map-compose', spec: pending.spec }, '*')
        } else if (pending?.kind === 'paint' && pending.terrain !== undefined) {
          frame.contentWindow?.postMessage({ type: 'noven-map-paint', operations: pending.terrain }, '*')
        }
        return
      }
      if (data.type === 'noven-map-terrain-summary' && data.summary !== null && typeof data.summary === 'object' && !Array.isArray(data.summary)) {
        void send({ kind: 'record_map_terrain', moduleId: module.id, summary: data.summary })
        return
      }
      if (data.type === 'noven-map-terrain-finalized') {
        setDraft(false)
        setTerrain(true)
        setReady(true)
        return
      }
      if (data.type === 'noven-map-human-generated') {
        setDraft(false)
        setTerrain(false)
        setReady(true)
        return
      }
      if (data.type === 'noven-map-edited') {
        setError(false)
        setReady(true)
        return
      }
      if (data.type === 'noven-map-edit-failed') {
        setError(true)
        setReady(true)
        return
      }
      if (data.type === 'noven-map-loaded' || data.type === 'noven-map-generated') {
        setError(false)
        setDraft(false)
        if (data.type === 'noven-map-generated') setTerrain(false)
        setReady(true)
        return
      }
      if (data.type === 'noven-map-load-failed') {
        setError(true)
        setDraft(false)
        setReady(true)
      }
    }
    window.addEventListener('message', onMessage)
    return () => { window.removeEventListener('message', onMessage) }
  }, [module.id, send, t])

  useEffect(() => {
    frameRef.current?.contentWindow?.postMessage({ type: 'noven-map-fullscreen', expanded }, '*')
  }, [expanded])

  return (
    <div className={`nv-fmg-host${expanded ? ' nv-fmg-host-full' : ''}`} data-ready={ready ? '' : undefined}
      data-draft={draft ? '' : undefined} data-terrain={terrain ? '' : undefined}>
      <iframe ref={frameRef} className="nv-fmg-frame" src={EDITOR_URL} title={module.name} />
      {!ready && <div className="nv-fmg-loading">{t('canvas.map.loading')}</div>}
      {legacy && <div className="nv-fmg-notice">{t('canvas.map.legacy')}</div>}
      {error && <div className="nv-fmg-notice nv-fmg-error">{t('canvas.map.saveFailed')}</div>}
    </div>
  )
}
