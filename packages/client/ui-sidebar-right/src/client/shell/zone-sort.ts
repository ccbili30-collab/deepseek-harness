/**
 * Zone sort: long-pressing a blank grip marked `data-zone-grip` inside the
 * navigation column lifts that zone into a draggable block; dragging it across
 * the sibling zone swaps which half of the column it stands on. The gesture is
 * confined to the navigation column — the member gesture (member-sort.ts)
 * swaps canvas and drawer, and the frame gesture (region-sort.ts in
 * ui-layout) swaps whole columns; this one orders the zones inside the drawer.
 *
 * All travel rides inline transforms; commits flip the zone order in the store
 * and a FLIP pass lands the zones where they ended visually.
 */
import { useEffect, useRef } from 'react'
import type { RefObject } from 'react'

/** Hold time before a still press arms the sort. */
const HOLD_MS = 450
/** Pointer travel that cancels the hold. */
const SLOP_PX = 6
/** The lifted block's settle scale while sorting. */
const LIFT_SCALE = 0.985
/** Easing for the sibling sliding aside and for the drop/settle pass. */
const SETTLE = 'transform var(--ds-transition-duration-slow) var(--ds-ease-in-out)'
/** Presses a zone sort must not steal. Unlike the member and region gestures —
   * whose grips are blank chrome — the zones are dense with buttons, so rows
   * and controls DO arm the hold; a press released before the hold still clicks
   * normally, and an armed drop swallows the stray click. Only text entry and
   * selectable content stay reserved. */
const INTERACTIVE = 'input, textarea, select, [contenteditable="true"]'

interface ZoneSession {
  pointerId: number
  originX: number
  originY: number
  /** The dragged zone block. */
  lifted: HTMLElement
  /** The zone that makes way. */
  sibling: HTMLElement
  /** The sibling's resting centre, captured at arm time before transforms apply. */
  siblingCentreY: number
  /** The navigation element — the drag's hard bounds. */
  container: HTMLElement
  armed: boolean
  swapped: boolean
  timer: number
  raf: number | null
}

/**
 * The in-drawer zone sort gesture.
 * @param navRef - the navigation element whose `[data-zone]` children reorder.
 * @param enabled - whether the panel stands expanded; the rail has no zones.
 * @param onCommit - flips the persisted zone order on a landed swap.
 */
export function useZoneSort(navRef: RefObject<HTMLElement | null>, enabled: boolean, onCommit: () => void): void {
  const session = useRef<ZoneSession | null>(null)

  useEffect(() => {
    const container = navRef.current
    if (!enabled || container === null) return

    const swallow = (event: Event): void => {
      event.preventDefault()
      event.stopPropagation()
    }

    const clearVisuals = (s: ZoneSession): void => {
      s.lifted.removeAttribute('data-zone-lift')
      s.lifted.style.transition = ''
      s.sibling.removeAttribute('data-zone-yield')
      s.sibling.style.transition = ''
      container.removeAttribute('data-zone-sorting')
    }

    const drop = (commit: boolean): void => {
      const s = session.current
      if (s === null || !s.armed) { session.current = null; return }
      session.current = null
      window.clearTimeout(s.timer)
      if (s.raf !== null) cancelAnimationFrame(s.raf)
      const { lifted, sibling, swapped } = s
      container.addEventListener('click', swallow, { capture: true, once: true })
      // A cancel ends without a click; the one-shot listener must not eat a
      // later click that never belonged to this gesture.
      window.setTimeout(() => { container.removeEventListener('click', swallow, { capture: true }) }, 0)
      if (!(commit && swapped)) {
        lifted.style.transition = SETTLE
        sibling.style.transition = SETTLE
        lifted.style.transform = ''
        sibling.style.transform = ''
        const onEnd = (event: TransitionEvent): void => {
          if (event.target === lifted && event.propertyName === 'transform') clearVisuals(s)
        }
        lifted.addEventListener('transitionend', onEnd)
        window.setTimeout(() =>{  clearVisuals(s) }, 400)
        return
      }
      const liftedVisual = lifted.getBoundingClientRect().top
      const siblingVisual = sibling.getBoundingClientRect().top
      lifted.style.transition = 'none'
      sibling.style.transition = 'none'
      lifted.style.transform = ''
      sibling.style.transform = ''
      onCommit()
      requestAnimationFrame(() => {
        const dyLift = liftedVisual - lifted.getBoundingClientRect().top
        const dySib = siblingVisual - sibling.getBoundingClientRect().top
        lifted.style.transform = `translateY(${dyLift}px) scale(${LIFT_SCALE})`
        sibling.style.transform = `translateY(${dySib}px)`
        void lifted.offsetHeight
        lifted.style.transition = SETTLE
        sibling.style.transition = SETTLE
        lifted.style.transform = ''
        sibling.style.transform = ''
        const onEnd = (event: TransitionEvent): void => {
          if (event.target === lifted && event.propertyName === 'transform') clearVisuals(s)
        }
        lifted.addEventListener('transitionend', onEnd)
        window.setTimeout(() =>{  clearVisuals(s) }, 400)
      })
    }

    const onPointerDown = (event: PointerEvent): void => {
      if (event.button !== 0 || session.current !== null) return
      const target = event.target
      if (!(target instanceof Element)) return
      if (target.closest(INTERACTIVE) !== null) return
      const grip = target.closest('[data-zone-grip]')
      if (!(grip instanceof HTMLElement) || !container.contains(grip)) return
      const name = grip.dataset['zoneGrip']
      const lifted = container.querySelector<HTMLElement>(`[data-zone="${name ?? ''}"]`)
      const sibling = [...container.querySelectorAll<HTMLElement>('[data-zone]')].find(zone => zone !== lifted)
      // A lone zone has nothing to swap with: no session, no lift.
      if (lifted == null || sibling == null) return
      session.current = {
        pointerId: event.pointerId, originX: event.clientX, originY: event.clientY,
        lifted, sibling, container,
        siblingCentreY: sibling.getBoundingClientRect().top + sibling.offsetHeight / 2,
        armed: false, swapped: false,
        timer: window.setTimeout(() => {
          const live = session.current
          if (live === null || live.armed) return
          live.armed = true
          live.lifted.setAttribute('data-zone-lift', '')
          container.setAttribute('data-zone-sorting', '')
          grip.setPointerCapture?.(live.pointerId)
        }, HOLD_MS), raf: null,
      }
    }

    const onPointerMove = (event: PointerEvent): void => {
      const s = session.current
      if (s === null || event.pointerId !== s.pointerId) return
      const dx = event.clientX - s.originX
      const dy = event.clientY - s.originY
      if (!s.armed) {
        if (Math.abs(dx) > SLOP_PX || Math.abs(dy) > SLOP_PX) {
          window.clearTimeout(s.timer)
          session.current = null
        }
        return
      }
      if (s.raf !== null) return
      const clientY = event.clientY
      s.raf = requestAnimationFrame(() => {
        const live = session.current
        if (live === null) return
        live.raf = null
        // The zone cannot leave the column: clamp travel inside the
        // container's bounds (offsetTop ignores the live transform).
        const containerTop = live.container.offsetTop
        const minMove = containerTop - live.lifted.offsetTop
        const maxMove = containerTop + live.container.offsetHeight - live.lifted.offsetTop - live.lifted.offsetHeight
        const move = Math.min(maxMove, Math.max(minMove, clientY - live.originY))
        // The swap arms two ways, whichever comes first: the lifted zone's
        // leading edge intrudes into the sibling's slot by `entry` px (the
        // member-sort rule — a short block pressing into a tall one reads
        // early), or the pointer itself crosses the sibling's resting centre
        // (a tall zone can never travel far enough to intrude — the clamp
        // holds it — so the pointer decides). Once armed, the swap stays until
        // both signals retreat — the dead band keeps a hover from flapping.
        const restingAbove = live.lifted.offsetTop < live.sibling.offsetTop
        const entry = Math.min(80, Math.max(32, live.sibling.offsetHeight * 0.25))
        const leading = restingAbove
          ? live.lifted.offsetTop + move + live.lifted.offsetHeight
          : live.lifted.offsetTop + move
        const boundary = restingAbove ? live.sibling.offsetTop : live.sibling.offsetTop + live.sibling.offsetHeight
        const intrusion = restingAbove ? leading - boundary : boundary - leading
        const pointerOver = restingAbove ? clientY - live.siblingCentreY : live.siblingCentreY - clientY
        live.swapped = live.swapped
          ? !(intrusion < entry - 24 && pointerOver < -24)
          : intrusion > entry || pointerOver > 0
        // Making way means sliding into the vacated slot — the lifted zone's
        // own height toward it.
        const shift = live.swapped ? (restingAbove ? -live.lifted.offsetHeight : live.lifted.offsetHeight) : 0
        // The sibling floats while the swap is armed — a swap preview, and
        // pulling back out settles it, which is the cancel signal.
        live.sibling.toggleAttribute('data-zone-yield', live.swapped)
        live.lifted.style.transition = 'none'
        live.lifted.style.transform = `translateY(${move}px) scale(${LIFT_SCALE})`
        live.sibling.style.transition = SETTLE
        live.sibling.style.transform = `translateY(${shift}px)`
      })
    }

    const onPointerUp = (event: PointerEvent): void => {
      if (session.current !== null && event.pointerId === session.current.pointerId) drop(true)
    }
    const onPointerCancel = (event: PointerEvent): void => {
      if (session.current !== null && event.pointerId === session.current.pointerId) drop(false)
    }
    const onKey = (event: KeyboardEvent): void => {
      if (event.key === 'Escape' && session.current !== null) drop(false)
    }

    container.addEventListener('pointerdown', onPointerDown)
    window.addEventListener('pointermove', onPointerMove)
    window.addEventListener('pointerup', onPointerUp)
    window.addEventListener('pointercancel', onPointerCancel)
    window.addEventListener('keydown', onKey)
    return () => {
      container.removeEventListener('pointerdown', onPointerDown)
      window.removeEventListener('pointermove', onPointerMove)
      window.removeEventListener('pointerup', onPointerUp)
      window.removeEventListener('pointercancel', onPointerCancel)
      window.removeEventListener('keydown', onKey)
      drop(false)
    }
  }, [navRef, enabled, onCommit])
}
