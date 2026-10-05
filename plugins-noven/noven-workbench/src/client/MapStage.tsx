/**
 * Interactive-map canvas renderer. A noven-draw-map work folder carries
 * `map-manifest.json` (base image, invisible ID mask, region table); this
 * stage redraws the contract in place — click a pixel, the same-color mask
 * region selects, its card floats near the point, and the region tints over
 * the base. Reselecting, the close button, or Esc dismisses the card.
 * @module noven-workbench/client/MapStage
 */
import { useEffect, useMemo, useRef, useState } from 'react'
import type { MouseEvent as ReactMouseEvent } from 'react'
import type { SessionId } from '@deepseek-ai/dsh-session/types'
import type { WorkbenchApi } from './api.ts'
import type { NovenWorkbenchKey } from './locales.ts'

/** One selectable territory row from map-manifest.json. */
interface MapRegion {
  readonly id: string
  readonly name: string
  readonly kind: string
  readonly maskColor: string
  readonly summary?: string
  readonly details?: readonly { readonly label: string; readonly value: string }[]
  readonly sourcePaths?: readonly string[]
}

/** The manifest contract the draw-map skill writes (schemaVersion 1). */
interface MapManifest {
  readonly title?: string
  readonly canvas: { readonly width: number; readonly height: number }
  readonly base: string
  readonly mask: string
  readonly regions: readonly MapRegion[]
}

/** Props the stage binds for the map renderer. */
export interface MapStageProps {
  readonly t: (key: NovenWorkbenchKey) => string
  readonly sessionId: SessionId
  /** Workspace-relative directory holding manifest, base, and mask. */
  readonly dir: string
  /** `/api/file` URL builder for a workspace-relative path. */
  readonly mediaUrl: (rel: string) => string
  readonly api: WorkbenchApi
}

/** Whether parsed JSON is a manifest worth rendering. */
function asManifest(value: unknown): MapManifest | undefined {
  const candidate = value as MapManifest | undefined
  if (candidate === undefined || !Array.isArray(candidate.regions)) return undefined
  if (typeof candidate.base !== 'string' || typeof candidate.mask !== 'string') return undefined
  return candidate
}

/** Pixel rgb → the manifest's `#rrggbb` mask color. */
function pixelHex(data: Uint8ClampedArray, index: number): string {
  const hex = (v: number) => v.toString(16).padStart(2, '0')
  return `#${hex(data[index])}${hex(data[index + 1])}${hex(data[index + 2])}`
}

/**
 * Render the selectable map: base image, mask hit-testing, selection tint,
 * and the floating region card.
 * @param props - locale copy, session address, work folder, URL builder, API.
 * @returns the map surface.
 */
export function MapStage(props: MapStageProps) {
  const { t, dir, mediaUrl } = props
  const [manifest, setManifest] = useState<MapManifest | undefined | 'failed'>(undefined)
  const [maskData, setMaskData] = useState<ImageData | undefined>(undefined)
  const [region, setRegion] = useState<MapRegion | undefined>(undefined)
  const [point, setPoint] = useState<{ x: number, y: number } | undefined>(undefined)
  const imgRef = useRef<HTMLImageElement>(null)
  const overlayRef = useRef<HTMLCanvasElement>(null)

  useEffect(() => {
    const controller = new AbortController()
    void props.api.readText(props.sessionId, `${dir}/map-manifest.json`, controller.signal).then(result => {
      if (controller.signal.aborted) return
      const parsed = result.ok && result.value !== undefined
        ? asManifest(JSON.parse(result.value) as unknown)
        : undefined
      setManifest(parsed ?? 'failed')
    }, () => {
      if (!controller.signal.aborted) setManifest('failed')
    })
    return () => { controller.abort() }
  }, [props.api, props.sessionId, dir])

  // Decode the ID mask once per manifest; it only ever feeds hit-testing and tinting.
  useEffect(() => {
    if (manifest === undefined || manifest === 'failed') return
    const image = new Image()
    let cancelled = false
    image.onload = () => {
      if (cancelled) return
      const canvas = document.createElement('canvas')
      canvas.width = image.naturalWidth
      canvas.height = image.naturalHeight
      const ctx = canvas.getContext('2d', { willReadFrequently: true })
      if (ctx === null) return
      ctx.drawImage(image, 0, 0)
      setMaskData(ctx.getImageData(0, 0, canvas.width, canvas.height))
    }
    image.src = mediaUrl(`${dir}/${manifest.mask}`)
    return () => { cancelled = true }
  }, [manifest, dir, mediaUrl])

  const regionsByColor = useMemo(() => {
    const map = new Map<string, MapRegion>()
    if (manifest !== undefined && manifest !== 'failed') {
      for (const r of manifest.regions) map.set(r.maskColor.toLowerCase(), r)
    }
    return map
  }, [manifest])

  /** Tint the selected region's mask pixels on the overlay canvas. */
  useEffect(() => {
    const overlay = overlayRef.current
    if (overlay === null || maskData === undefined) return
    overlay.width = maskData.width
    overlay.height = maskData.height
    const ctx = overlay.getContext('2d')
    if (ctx === null) return
    ctx.clearRect(0, 0, overlay.width, overlay.height)
    if (region === undefined) return
    const tint = ctx.createImageData(maskData.width, maskData.height)
    const target = region.maskColor.toLowerCase()
    for (let i = 0; i < maskData.data.length; i += 4) {
      if (maskData.data[i + 3] === 0) continue
      if (pixelHex(maskData.data, i) !== target) continue
      tint.data[i] = 64
      tint.data[i + 1] = 178
      tint.data[i + 2] = 166
      tint.data[i + 3] = 110
    }
    ctx.putImageData(tint, 0, 0)
  }, [region, maskData])

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') { setRegion(undefined); setPoint(undefined) }
    }
    document.addEventListener('keydown', onKey)
    return () => { document.removeEventListener('keydown', onKey) }
  }, [])

  if (manifest === 'failed') {
    return <div className="noven-wb-stage-empty"><h1>{t('stage.unsupported')}</h1><p>{t('stage.unsupportedHint')}</p></div>
  }

  const pick = (event: ReactMouseEvent<HTMLElement>): void => {
    const img = imgRef.current
    if (img === null || maskData === undefined) return
    const rect = img.getBoundingClientRect()
    const fx = (event.clientX - rect.left) / rect.width
    const fy = (event.clientY - rect.top) / rect.height
    const x = Math.floor(fx * maskData.width)
    const y = Math.floor(fy * maskData.height)
    if (x < 0 || y < 0 || x >= maskData.width || y >= maskData.height) return
    const found = regionsByColor.get(pixelHex(maskData.data, (y * maskData.width + x) * 4))
    if (found !== undefined && found.id === region?.id) {
      setRegion(undefined)
      setPoint(undefined)
      return
    }
    setRegion(found)
    setPoint(found === undefined ? undefined : { x: fx, y: fy })
  }

  if (manifest === undefined) {
    return <div className="noven-wb-stage-empty"><h1>{t('map.loading')}</h1></div>
  }

  const kindLabel = (kind: string): string =>
    kind === 'land' ? t('map.kind.land') : kind === 'water' ? t('map.kind.water') : t('map.kind.other')

  return (
    <div className="noven-wb-map" onClick={pick} role="presentation">
      <div className="noven-wb-map-body">
        <img ref={imgRef} src={mediaUrl(`${dir}/${manifest.base}`)} alt={manifest.title ?? dir} draggable={false} />
        <canvas ref={overlayRef} className="noven-wb-map-overlay" aria-hidden="true" />
        {region !== undefined && point !== undefined && (
          <article className="noven-wb-map-card" style={{ left: `${point.x * 100}%`, top: `${point.y * 100}%` }}>
            <header>
              <span className="noven-wb-map-kind">{kindLabel(region.kind)}</span>
              <button type="button" aria-label={t('annotate.cancel')}
                onClick={(e) => { e.stopPropagation(); setRegion(undefined); setPoint(undefined) }}>×</button>
            </header>
            <h3>{region.name}</h3>
            {region.summary !== undefined && <p>{region.summary}</p>}
            {region.details !== undefined && region.details.length > 0 && (
              <dl>{region.details.map(d => (
                <div key={d.label}><dt>{d.label}</dt><dd>{d.value}</dd></div>
              ))}</dl>
            )}
            {region.sourcePaths !== undefined && region.sourcePaths.length > 0 && (
              <footer><span>{t('map.sources')}</span>{region.sourcePaths.map(s => <small key={s}>{s}</small>)}</footer>
            )}
          </article>
        )}
      </div>
    </div>
  )
}
