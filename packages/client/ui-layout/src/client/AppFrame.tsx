/**
 * Three-column shell frame, registered into the built-in 'root' slot (the web
 * shell renders only 'root'). Owns the grid tracks (sidebar | center |
 * rightbar), the drag handles (pointer capture + rAF throttle), the column
 * solve (columns.ts), and the child-slot render decisions: the sidebar slot
 * receives live parameters from that solve. The root-scoped main slot selects
 * the Conversation or a global panel. Each column occupant owns its Session
 * binding and reports the geometry it needs.
 *
 * The right column is a track, not a box: its occupant draws its panel anchored
 * to the frame's right edge at the resolved normal width, and the
 * track only decides whether the centre makes room for it. The occupant reports
 * shown/track/fullscreen/canvas through `ctx.layout`; fullscreen keeps the
 * reported track but hides the outer resize handle, and a claimed canvas widens
 * the column into a flexible region the occupant fills beside its panel.
 * Everything arrives through the framework
 * shares — zero cordis or framework imports, zero self-made hooks.
 */
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState, useSyncExternalStore } from 'react'
import type { ReactNode } from 'react'
import type {
  PropsLocale, PropsRenderSlots, PropsRuntime, PropsStore,
} from '@deepseek-ai/dsh-client-ui-slots'
import { CANVAS_MIN, CENTER_MIN, clampWidth, computeColumns, RIGHTBAR_DEFAULT, RIGHTBAR_MAX_RATIO, RIGHTBAR_MIN, RIGHTBAR_RAIL, SIDEBAR_AUTO_COLLAPSE, SIDEBAR_COLLAPSED, SIDEBAR_DEFAULT } from './columns.ts'
import { unitSide } from './arrangement.ts'
import { useRegionSort } from './region-sort.ts'
import { DocumentTitle } from './DocumentTitle.tsx'
import type { createLayoutStore } from './stores.ts'
import css from './AppFrame.module.css'

/** Full composed props: runtime share + child-slot render share + store share. */
export type AppFrameProps =
  & PropsRuntime<'root'>
  & PropsRenderSlots<'sidebar' | 'main' | 'rightbar' | 'shell.overlay' | 'shell.leading'>
  & PropsStore<ReturnType<typeof createLayoutStore>>
  & PropsLocale<'common'>

/** Center column grid item (session-body building block). */
function CenterColumn(props: { order: number; children?: ReactNode }) {
  // data-region-grip: blank presses inside the conversation column arm the
  // frame's long-press sort (region-sort.ts skips interactive elements).
  return <div className={css.centerCol} data-center-col data-region-grip="conv" style={{ order: props.order }}>{props.children}</div>
}

/** Subscribe to the main key without subscribing the column frame to each panel id. */
function MainPanel({ usePanelInfo, renderSlot }: Pick<PropsRuntime<'root'>, 'usePanelInfo'> & PropsRenderSlots<'main'>) {
  const panelId = usePanelInfo(info => info.activePanelId)
  return renderSlot('main', {}, { entryKey: panelId ?? 'conversation' })
}

/**
 * Right column grid item. Zero-width unless the occupant asked for a track;
 * a claimed canvas instead turns it into the flexible region that holds the
 * canvas page beside the panel. The occupant's panel is positioned against the
 * column's right edge, which never moves, so it can hang over the centre when
 * there is no track.
 */
function RightbarColumn(props: { order: number; children?: ReactNode }) {
  // data-region-grip: blank presses on the column's own surface arm the
  // frame's long-press sort (the canvas/drawer grips sit closer and win).
  return <div className={css.rightbarCol} data-rightbar-col data-region-grip="unit" style={{ order: props.order }}>{props.children}</div>
}

/**
 * One drag handle: pointer capture, rAF-throttled dx reports against the drag-start origin.
 * `side` keys the hover-reveal CSS to the owning column.
 */
function DragHandle(props: { side: 'sidebar' | 'rightbar' | 'unit'; left: number; onStart: () => void; onDrag: (dx: number) => void; onEnd: () => void }) {
  const [dragging, setDragging] = useState(false)
  const origin = useRef(0)
  const latest = useRef(0)
  const frame = useRef<number | null>(null)
  const capture = useRef<{ element: HTMLDivElement; id: number } | null>(null)
  const callbacks = useRef({ onStart: props.onStart, onDrag: props.onDrag, onEnd: props.onEnd })
  callbacks.current = { onStart: props.onStart, onDrag: props.onDrag, onEnd: props.onEnd }

  const endDrag = useCallback(() => {
    const active = capture.current
    if (active === null) return
    capture.current = null
    if (frame.current !== null) { cancelAnimationFrame(frame.current); frame.current = null }
    if (active.element.hasPointerCapture(active.id)) active.element.releasePointerCapture(active.id)
    setDragging(false)
    callbacks.current.onEnd()
  }, [])
  useEffect(() => endDrag, [endDrag])

  const onPointerDown = useCallback((e: React.PointerEvent<HTMLDivElement>) => {
    if (e.button !== 0 || capture.current !== null) return
    e.preventDefault()
    e.currentTarget.setPointerCapture(e.pointerId)
    capture.current = { element: e.currentTarget, id: e.pointerId }
    origin.current = e.clientX
    latest.current = e.clientX
    callbacks.current.onStart()
    setDragging(true)
  }, [])
  const onPointerMove = useCallback((e: React.PointerEvent<HTMLDivElement>) => {
    if (capture.current?.id !== e.pointerId) return
    latest.current = e.clientX
    frame.current ??= requestAnimationFrame(() => {
      frame.current = null
      callbacks.current.onDrag(latest.current - origin.current)
    })
  }, [])
  const onPointerUp = useCallback((e: React.PointerEvent<HTMLDivElement>) => {
    if (capture.current?.id !== e.pointerId) return
    callbacks.current.onDrag(e.clientX - origin.current)
    endDrag()
  }, [endDrag])
  const onPointerCancel = useCallback((e: React.PointerEvent<HTMLDivElement>) => {
    if (capture.current?.id === e.pointerId) endDrag()
  }, [endDrag])

  return (
    <div
      className={css.handle}
      style={{ left: props.left }}
      data-side={props.side}
      data-dragging={dragging || undefined}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      onPointerCancel={onPointerCancel}
      onLostPointerCapture={onPointerCancel}
    />
  )
}

/** The three-column frame (see module doc). */
export function AppFrame({
  useStore,
  useSessions,
  usePanelInfo,
  actions,
  renderSlot,
  t,
}: AppFrameProps) {
  const layoutInfo = useStore(state => state.layoutInfo)
  const frameRef = useRef<HTMLDivElement | null>(null)
  // A global panel occupying the main seat has no swappable sibling: the
  // conv/unit sort only exists while the conversation faces the unit.
  const panelActive = usePanelInfo(info => info.activePanelId !== null)
  useRegionSort(frameRef, !panelActive)
  const viewport = layoutInfo.viewportWidth
  // Which side of the centre the panel+canvas unit stands on (arrangement.ts).
  useSyncExternalStore(listener => unitSide.subscribe(listener), () => unitSide.getSnapshot())
  const unitLeft = unitSide.get() === 'left'

  // Track the frame's own box (not the window): rAF-throttled ResizeObserver.
  useLayoutEffect(() => {
    const el = frameRef.current
    /* v8 ignore next -- the ref is always attached by effect time: the frame div renders unconditionally. */
    if (el === null) return
    let raf: number | null = null
    let disposed = false
    const measure = () => {
      const width = el.getBoundingClientRect().width
      if (width > 0) actions.setViewportWidth(width)
    }
    measure()
    const observer = new ResizeObserver(() => {
      if (disposed) return
      raf ??= requestAnimationFrame(() => {
        raf = null
        measure()
      })
    })
    observer.observe(el)
    return () => {
      disposed = true
      observer.disconnect()
      if (raf !== null) cancelAnimationFrame(raf)
    }
  }, [actions])

  const narrow = viewport < SIDEBAR_AUTO_COLLAPSE
  const sidebarCollapsed = narrow ? !layoutInfo.narrowExpanded : layoutInfo.sidebar === 0
  const sidebarPreference = sidebarCollapsed
    ? 0
    : layoutInfo.sidebar === 0 ? SIDEBAR_DEFAULT : layoutInfo.sidebar
  // A below-floor drag parks the panel at zero width: the occupant reads the
  // zero through canShow and collapses to its rail, which then reports back.
  const rightbarPreference = layoutInfo.rightbarCollapsed ? 0 : (layoutInfo.rightbar ?? RIGHTBAR_DEFAULT)
  // Which side of the panel a canvas page claims, or null while none is up.
  const canvas = layoutInfo.rightbarCanvas
  // The panel's anchored edge inside the unit column: opposite the canvas when
  // one is claimed; facing away from the conversation (its own outer edge)
  // while it fills the column alone.
  const anchorLeft = canvas === null ? unitLeft : canvas === 'right'
  // Desktop reopen controls occupy the frame's shell.leading seat (macOS) or
  // the Windows caption row; neither platform keeps an icon rail.
  const darwin = document.documentElement.dataset.platform === 'darwin'
  const collapsedWidth = darwin
    || document.documentElement.hasAttribute('data-windows-titlebar') ? 0 : SIDEBAR_COLLAPSED
  // Opening on a narrow frame collapses the left sidebar. Eligibility must
  // include that space before the occupant's first shown report arrives.
  const rail = layoutInfo.rightbarRail
  const normal = computeColumns(viewport, !layoutInfo.rightbarShown && narrow ? 0 : sidebarPreference, rightbarPreference, collapsedWidth)
  const cols = computeColumns(viewport, sidebarPreference, layoutInfo.rightbarTrack ? rightbarPreference : 0, collapsedWidth)
  // The rail presentation occupies the icon width instead of the solved or
  // saved preference; it always fits, so it bypasses the drag clamps.
  if (rail) {
    normal.rightbar = Math.min(RIGHTBAR_RAIL, Math.max(0, viewport - normal.sidebar - CENTER_MIN))
    if (layoutInfo.rightbarTrack) cols.rightbar = normal.rightbar
  }
  const colsRef = useRef(cols)
  colsRef.current = cols
  const rightbarWidth = useRef(normal.rightbar)
  rightbarWidth.current = normal.rightbar

  // The drag base is the rendered width captured at drag start (grabbing a
  // concession-clamped panel must not jump back to the stored preference);
  // it stays frozen for the whole gesture so dx deltas do not compound.
  const sidebarBase = useRef(0)
  const rightbarBase = useRef(0)
  // Track-level transitions pause for the whole gesture: eased tracks would
  // detach the column edge from the pointer (AppFrame.module.css).
  const [dragging, setDragging] = useState(false)
  // Track easing is scoped to a discrete open/close toggle: data-animating
  // goes up when the collapse state or the rightbar track flips and comes down
  // at transition end (timeout as the reduced-motion/covered-frame fallback).
  // Steady-state viewport updates stay instant (AppFrame.module.css), and so
  // does a toggle arriving together with a viewport change — that is the
  // responsive auto-collapse firing mid window-resize, where easing would
  // chase the live window edge. The counter restarts the settle window when a
  // re-toggle interrupts a running transition.
  const [animating, setAnimating] = useState(0)
  const trackToggle = `${sidebarCollapsed}:${layoutInfo.rightbarTrack}:${canvas !== null}:${rail}`
  const previousToggle = useRef(trackToggle)
  const previousViewport = useRef(viewport)
  useLayoutEffect(() => {
    const viewportChanged = previousViewport.current !== viewport
    previousViewport.current = viewport
    if (previousToggle.current === trackToggle) return
    previousToggle.current = trackToggle
    if (viewportChanged) return
    setAnimating(token => token + 1)
  }, [trackToggle, viewport])
  useEffect(() => {
    if (animating === 0) return
    const frame = frameRef.current
    /* v8 ignore next -- the ref is always attached by effect time: the frame div renders unconditionally. */
    if (frame === null) return
    const settle = () => { setAnimating(0) }
    const onTransitionEnd = (event: TransitionEvent) => {
      if (event.target === frame && event.propertyName === 'grid-template-columns') settle()
    }
    frame.addEventListener('transitionend', onTransitionEnd)
    const timer = setTimeout(settle, 600)
    return () => {
      frame.removeEventListener('transitionend', onTransitionEnd)
      clearTimeout(timer)
    }
  }, [animating])
  const onDragEnd = useCallback(() => { setDragging(false) }, [])
  // The rightbar release settles the collapse preview: an armed drag folds the
  // panel to its rail here, an unarmed one just ends.
  const onRightbarEnd = useCallback(() => { actions.settleRightbar(); setDragging(false) }, [actions])
  const onSidebarStart = useCallback(() => { sidebarBase.current = colsRef.current.sidebar; setDragging(true) }, [])
  const onSidebarDrag = useCallback((dx: number) => {
    actions.setSidebar(sidebarBase.current + dx)
  }, [actions])
  const onRightbarStart = useCallback(() => { rightbarBase.current = rightbarWidth.current; setDragging(true) }, [])
  const onRightbarDrag = useCallback((dx: number) => {
    actions.setRightbar(rightbarBase.current + (anchorLeft ? dx : -dx))
  }, [actions, anchorLeft])
  const productTitle = process.env.DSH_CLIENT_TITLE ?? t('brand.localBuild')
  // The rendered template lets the grid solve the squeeze natively: the centre
  // declares its protected minimum and the right column bids up to the clamped
  // preference, so a window resize lands in the same layout pass as the frame
  // edge. The JS solve lags the viewport by a ResizeObserver + rAF frame; when
  // it priced the squeeze itself, the centre column absorbed each width change
  // whole and was corrected two frames later — visible jitter. cols keeps only
  // the discrete decisions (track present, collapse state) and the drag base.
  const rightbarMax = cols.rightbar === 0
    ? 0
    : rail ? cols.rightbar : clampWidth(rightbarPreference, RIGHTBAR_MIN, viewport * RIGHTBAR_MAX_RATIO)
  // A claimed canvas widens the right column into the region that holds both
  // the canvas page and the panel: the center settles at the share it would
  // keep beside the rail, and the column takes the rest of the frame. Both
  // templates keep an identical minmax track structure — the canvas swaps only
  // the third track's max bound — so grid-template-columns interpolates on the
  // open/close transition instead of freezing at its start value.
  const centerCap = Math.max(CENTER_MIN, Math.max(440, SIDEBAR_COLLAPSED + viewport * 0.3) - cols.sidebar)
  // A claimed canvas widens the right column into the region that holds both
  // the canvas page and the panel. Its conversation-facing edge is the unit
  // seam: draggable between the conversation's protected share and a floor of
  // the drawn panel plus a usable canvas.
  const unitCeiling = Math.max(0, viewport - cols.sidebar - CENTER_MIN)
  const unitFloor = Math.min(normal.rightbar + CANVAS_MIN, unitCeiling)
  const rightTrackMax = canvas === null
    ? rightbarMax
    : Math.min(unitCeiling, Math.max(unitFloor, layoutInfo.unit ?? (viewport - cols.sidebar - centerCap)))
  // The handles sit on the moving edges: the panel's free edge inside the
  // column, and the column's own conversation-facing edge while a canvas is up.
  const unitW = canvas === null ? cols.rightbar : rightTrackMax
  // The handles anchor to the solved centre width, not centerCap: a stored
  // unit width makes the drawn unit column narrower than the default share,
  // and placing grips off the nominal cap detaches them from the real seams.
  const convW = viewport - cols.sidebar - unitW
  const unitColLeft = unitLeft ? cols.sidebar : cols.sidebar + convW
  const rightbarHandleLeft = anchorLeft
    ? unitColLeft + normal.rightbar
    : unitColLeft + unitW - normal.rightbar
  const unitHandleLeft = unitLeft ? unitColLeft + unitW : unitColLeft
  const unitWRef = useRef(unitW)
  unitWRef.current = unitW
  const unitBase = useRef(0)
  const onUnitStart = useCallback(() => { unitBase.current = unitWRef.current; setDragging(true) }, [])
  const onUnitDrag = useCallback((dx: number) => {
    actions.setUnit(unitBase.current + (unitLeft ? dx : -dx))
  }, [actions, unitLeft])
  const sidebar = useMemo(() => renderSlot('sidebar', {
    collapsed: sidebarCollapsed,
    width: cols.sidebar,
  }), [renderSlot, sidebarCollapsed, cols.sidebar])
  const main = useMemo(() => (
    <MainPanel usePanelInfo={usePanelInfo} renderSlot={renderSlot} />
  ), [usePanelInfo, renderSlot])
  const overlays = useMemo(() => renderSlot('shell.overlay', {}), [renderSlot])
  // Window-chrome seat over the main panels' top-left corner: only a fully
  // hidden sidebar column on macOS desktop leaves window chrome without a
  // home — the Windows zero-width collapse keeps its controls in the caption
  // row (ui-sidebar). AppFrame.module.css publishes the matching
  // --dsh-frame-leading-clearance under the same collapsed condition.
  const leading = useMemo(() => renderSlot('shell.leading', {}), [renderSlot])
  const leadingMounted = darwin && sidebarCollapsed

  return (
    <div
      ref={frameRef}
      className={css.frame}
      style={{
        ...(document.documentElement.hasAttribute('data-windows-titlebar')
          ? { '--dsh-windows-sidebar-width': `${cols.sidebar}px` } : {}),
        gridTemplateColumns: unitLeft
          ? `${cols.sidebar}px minmax(0px, ${rightTrackMax}px) minmax(${cols.rightbar === 0 && canvas === null ? 0 : CENTER_MIN}px, 1fr)`
          : `${cols.sidebar}px minmax(${cols.rightbar === 0 && canvas === null ? 0 : CENTER_MIN}px, 1fr) minmax(0px, ${rightTrackMax}px)`,
      }}
      data-unit-side={unitLeft ? 'left' : 'right'}
      data-sidebar-collapsed={sidebarCollapsed || undefined}
      data-rightbar-collapsed={(cols.rightbar === 0 && canvas === null) || undefined}
      data-rightbar-fullscreen={layoutInfo.rightbarFullscreen || undefined}
      data-rightbar-instant={layoutInfo.rightbarInstant || undefined}
      data-dragging={dragging || undefined}
      data-animating={animating > 0 || undefined}
    >
      <DocumentTitle
        productTitle={productTitle}
        useSessions={useSessions}
        usePanelInfo={usePanelInfo}
      />
      <div className={css.sidebarCol}>
        {sidebar}
      </div>
      <>
        <CenterColumn order={unitLeft ? 2 : 1}>{main}</CenterColumn>
        <RightbarColumn order={unitLeft ? 1 : 2}>
          {renderSlot('rightbar', { width: normal.rightbar, viewportWidth: viewport, canShow: normal.rightbar > 0, collapsePreview: layoutInfo.rightbarCollapsePreview })}
        </RightbarColumn>
      </>
      <div className={css.overlayLayer} data-shell-overlay>
        {overlays}
      </div>
      {leadingMounted && (
        <div className={css.leadingSeat} data-shell-leading>
          {leading}
        </div>
      )}
      {/* The collapsed rail is fixed-width: no resize handle while closed. */}
      {!sidebarCollapsed && <DragHandle side="sidebar" left={cols.sidebar} onStart={onSidebarStart} onDrag={onSidebarDrag} onEnd={onDragEnd} />}
      {layoutInfo.rightbarShown && !layoutInfo.rightbarFullscreen && !rail && normal.rightbar > 0
        && (canvas === null || layoutInfo.rightbarTrack) && (
        <DragHandle side="rightbar" left={rightbarHandleLeft} onStart={onRightbarStart} onDrag={onRightbarDrag} onEnd={onRightbarEnd} />
      )}
      {/* The unit seam exists only while a canvas claims the column: it moves
          the whole region against the conversation, the panel's own handle
          keeps dividing canvas from panel inside it. */}
      {canvas !== null && layoutInfo.rightbarShown && !layoutInfo.rightbarFullscreen && (
        <DragHandle side="unit" left={unitHandleLeft} onStart={onUnitStart} onDrag={onUnitDrag} onEnd={onDragEnd} />
      )}
    </div>
  )
}
