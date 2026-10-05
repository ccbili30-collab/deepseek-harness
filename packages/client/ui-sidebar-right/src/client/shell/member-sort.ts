/**
 * Member sort: long-pressing a blank grip inside the unit's own surfaces —
 * the canvas chrome/body (`data-region-grip="canvas"`) or the navigation
 * column (`data-region-grip="drawer"`) — lifts that member into a draggable
 * block. Dragging it across the other member swaps which side of the panel
 * the canvas parks on. The gesture is confined to the unit: the dragged
 * member clamps at the column's bounds, so it can never budge the unit
 * itself — swapping the unit with the conversation column is the frame's
 * gesture (region-sort.ts in ui-layout), armed outside the members.
 *
 * All travel rides inline transforms; commits re-anchor the members and a
 * FLIP pass lands them where they ended visually.
 */
import { useEffect, useRef } from 'react'
import type { RefObject } from 'react'
import { canvasSide } from './canvas.ts'

/** Hold time before a still press arms the sort. */
const HOLD_MS = 450
/** Pointer travel that cancels the hold. */
const SLOP_PX = 6
/** The lifted block's settle scale while sorting. */
const LIFT_SCALE = 0.985
/** Easing for a neighbour sliding aside and for the drop/settle pass. */
const SETTLE = 'transform var(--ds-transition-duration-slow) var(--ds-ease-in-out)'
/** Elements a press must not steal: the gesture stays on blank surfaces. */
const INTERACTIVE = 'button, a, input, textarea, select, label, summary, [contenteditable="true"], [draggable="true"], [role="button"], [role="tab"], [role="link"], [role="menuitem"], [role="option"], [role="switch"], [role="checkbox"], [role="combobox"], [role="slider"]'

interface MemberSession {
  pointerId: number
  originX: number
  originY: number
  /** The dragged member block. */
  lifted: HTMLElement
  /** The member that makes way. */
  sibling: HTMLElement
  /** The unit column element (both members' parent) — the drag's hard bounds. */
  column: HTMLElement
  armed: boolean
  swapped: boolean
  timer: number
  raf: number | null
}

/**
 * The member-side sort gesture.
 * @param panelRef - the navigation panel element; its parent column scopes the gesture.
 * @param enabled - whether the panel seat is mounted in a state that may sort (off in fullscreen).
 */
export function useMemberSort(panelRef: RefObject<HTMLDivElement | null>, enabled: boolean): void {
  const session = useRef<MemberSession | null>(null)

  useEffect(() => {
    if (!enabled) return
    // The seat renders through slot wrappers (display:contents boxes have no
    // geometry): climb to the frame's column element itself.
    const column = panelRef.current?.closest('[data-rightbar-col]')
    if (!(column instanceof HTMLElement)) return
    const frame = column.parentElement
    if (!(frame instanceof HTMLElement)) return

    const swallow = (event: Event): void => {
      event.preventDefault()
      event.stopPropagation()
    }

    const clearVisuals = (s: MemberSession): void => {
      s.lifted.removeAttribute('data-region-lift')
      s.lifted.style.transition = ''
      s.sibling.removeAttribute('data-region-yield')
      s.sibling.style.transition = ''
      frame.removeAttribute('data-region-sorting')
    }

    const drop = (commit: boolean): void => {
      const s = session.current
      if (s === null || !s.armed) { session.current = null; return }
      session.current = null
      window.clearTimeout(s.timer)
      if (s.raf !== null) cancelAnimationFrame(s.raf)
      const { lifted, sibling, swapped } = s
      frame.addEventListener('click', swallow, { capture: true, once: true })
      // A cancel ends without a click; the one-shot listener must not eat a
      // later click that never belonged to this gesture.
      window.setTimeout(() => { frame.removeEventListener('click', swallow, { capture: true }) }, 0)
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
      const liftedVisual = lifted.getBoundingClientRect().left
      const siblingVisual = sibling.getBoundingClientRect().left
      lifted.style.transition = 'none'
      sibling.style.transition = 'none'
      lifted.style.transform = ''
      sibling.style.transform = ''
      canvasSide.toggle()
      requestAnimationFrame(() => {
        const dxLift = liftedVisual - lifted.getBoundingClientRect().left
        const dxSib = siblingVisual - sibling.getBoundingClientRect().left
        lifted.style.transform = `translateX(${dxLift}px) scale(${LIFT_SCALE})`
        sibling.style.transform = `translateX(${dxSib}px)`
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
      // Zone grips sit inside the drawer's member grip: a press meant for the
      // zone-sort gesture must not also arm the member swap.
      if (target.closest('[data-zone-grip]') !== null) return
      const grip = target.closest('[data-region-grip]')
      if (!(grip instanceof HTMLElement) || !column.contains(grip)) return
      const kind = grip.dataset['regionGrip']
      if (kind !== 'canvas' && kind !== 'drawer') return
      const lifted = kind === 'canvas'
        ? column.querySelector<HTMLElement>('[data-sidebar-right-canvas-host]')
        : column.querySelector<HTMLElement>('[data-sidebar-right-panel]')
      const sibling = kind === 'canvas'
        ? column.querySelector<HTMLElement>('[data-sidebar-right-panel]')
        : column.querySelector<HTMLElement>('[data-sidebar-right-canvas-host]')
      // A lone member has nothing to swap with: no session, no lift.
      if (lifted == null || sibling == null) return
      // A member mid-fold is scenery, not a sort target.
      if (lifted.hasAttribute('data-canvas-exiting') || sibling.hasAttribute('data-canvas-exiting')) return
      session.current = {
        pointerId: event.pointerId, originX: event.clientX, originY: event.clientY,
        lifted, sibling, column, armed: false, swapped: false,
        timer: window.setTimeout(() => {
          const live = session.current
          if (live === null || live.armed) return
          live.armed = true
          live.lifted.setAttribute('data-region-lift', '')
          frame.setAttribute('data-region-sorting', '')
          grip.setPointerCapture?.(live.pointerId)
        }, HOLD_MS), raf: null,
      }
    }

    const onPointerMove = (event: PointerEvent): void => {
      const s = session.current
      if (s === null || event.pointerId !== s.pointerId) return
      const dx = event.clientX - s.originX
      if (!s.armed) {
        if (Math.abs(dx) > SLOP_PX || Math.abs(event.clientY - s.originY) > SLOP_PX) {
          window.clearTimeout(s.timer)
          session.current = null
        }
        return
      }
      if (s.raf !== null) return
      const clientX = event.clientX
      s.raf = requestAnimationFrame(() => {
        const live = session.current
        if (live === null) return
        live.raf = null
        // The member cannot leave the unit: clamp its travel inside the
        // column's own bounds (offsetLeft ignores the live transform).
        const minMove = -(live.lifted.offsetLeft)
        const maxMove = live.column.offsetWidth - live.lifted.offsetLeft - live.lifted.offsetWidth
        const move = Math.min(maxMove, Math.max(minMove, clientX - live.originX))
        // The swap arms on intrusion, not pointer position: once the lifted
        // block's leading edge crosses this deep into the sibling's slot the
        // sibling eases into the vacated slot — proportional for narrow
        // members, capped so wide ones need no hike. A dead band keeps a hover
        // at the boundary from flapping.
        const entry = Math.min(180, Math.max(56, live.sibling.offsetWidth * 0.3))
        const restingLeft = live.lifted.offsetLeft < live.sibling.offsetLeft
        const leading = restingLeft
          ? live.lifted.offsetLeft + move + live.lifted.offsetWidth
          : live.lifted.offsetLeft + move
        const boundary = restingLeft ? live.sibling.offsetLeft : live.sibling.offsetLeft + live.sibling.offsetWidth
        const over = restingLeft ? leading - boundary : boundary - leading
        live.swapped = live.swapped ? over > entry - 36 : over > entry
        // Making way means sliding into the vacated slot — the lifted block's
        // own width toward it. Anchoring to the lifted's origin instead sends
        // a wide sibling flying past the column when the short side drags.
        const shift = live.swapped ? (restingLeft ? -live.lifted.offsetWidth : live.lifted.offsetWidth) : 0
        // The sibling floats while the swap is armed — a swap preview, and
        // pulling back out settles it, which is the cancel signal.
        live.sibling.toggleAttribute('data-region-yield', live.swapped)
        live.lifted.style.transition = 'none'
        live.lifted.style.transform = `translateX(${move}px) scale(${LIFT_SCALE})`
        live.sibling.style.transition = SETTLE
        live.sibling.style.transform = `translateX(${shift}px)`
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

    column.addEventListener('pointerdown', onPointerDown)
    window.addEventListener('pointermove', onPointerMove)
    window.addEventListener('pointerup', onPointerUp)
    window.addEventListener('pointercancel', onPointerCancel)
    window.addEventListener('keydown', onKey)
    return () => {
      column.removeEventListener('pointerdown', onPointerDown)
      window.removeEventListener('pointermove', onPointerMove)
      window.removeEventListener('pointerup', onPointerUp)
      window.removeEventListener('pointercancel', onPointerCancel)
      window.removeEventListener('keydown', onKey)
      drop(false)
    }
  }, [panelRef, enabled])
}
