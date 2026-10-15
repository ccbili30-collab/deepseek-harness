/**
 * Region sort: long-pressing a marked blank grip (`data-region-grip="conv"` on
 * the conversation column, `data-region-grip="unit"` on the right-region unit)
 * lifts that column into a draggable block; dragging it across its sibling
 * swaps which side of the conversation the unit stands on.
 *
 * The gesture never eases grid-template-columns (incompatible track lists
 * cannot interpolate): the lifted block and its displaced sibling travel on
 * transforms, and the commit flips each item's grid `order` while a FLIP pass
 * holds their previous rects, so the swap lands in one motion.
 *
 * Canvas/panel swaps inside the unit are not handled here — that gesture is
 * owned by the unit's occupant (ui-sidebar-right) over its own grips.
 */
import { useEffect, useRef } from 'react'
import type { RefObject } from 'react'
import { unitSide } from './arrangement.ts'

/** Hold time before a still press arms the sort. */
const HOLD_MS = 450
/** Pointer travel that cancels the hold (ordinary click/drag goes through). */
const SLOP_PX = 6
/** The lifted block's settle scale while sorting. */
const LIFT_SCALE = 0.985
/** Easing for a neighbour sliding aside and for the drop/settle pass. */
const SETTLE = 'transform var(--ds-transition-duration-slow) var(--ds-ease-in-out)'
/** Elements a press must not steal: the gesture stays on blank surfaces. */
const INTERACTIVE = 'button, a, input, textarea, select, label, summary, [contenteditable="true"], [draggable="true"], [role="button"], [role="tab"], [role="link"], [role="menuitem"], [role="option"], [role="switch"], [role="checkbox"], [role="combobox"], [role="slider"]'

interface SortSession {
  pointerId: number
  originX: number
  originY: number
  lifted: HTMLElement
  sibling: HTMLElement
  /** Whether the hold timer fired and the block is lifted. */
  armed: boolean
  /** Whether the drag currently crosses far enough to swap on release. */
  swapped: boolean
  timer: number
  raf: number | null
}

/**
 * The frame-side sort gesture.
 * @param frameRef - the frame element every column lives in.
 * @param enabled - false while a global panel owns the main seat: a panel has no
 * swappable sibling, so blank presses there must not arm the sort.
 */
export function useRegionSort(frameRef: RefObject<HTMLDivElement | null>, enabled: boolean): void {
  const session = useRef<SortSession | null>(null)

  useEffect(() => {
    const frame = frameRef.current
    if (frame === null || !enabled) return
    // The sortable tracks live in the work layer; the sorting attribute that
    // styles the gesture must land on it, not the outer frame the stable
    // navigation column shares.
    const stage = frame.querySelector<HTMLElement>('[data-work]') ?? frame

    /** Eat the release click so it cannot land on whatever sat underneath. */
    const swallow = (event: Event): void => {
      event.preventDefault()
      event.stopPropagation()
    }

    const settle = (lifted: HTMLElement, sibling: HTMLElement): void => {
      lifted.removeAttribute('data-region-lift')
      lifted.style.transition = ''
      sibling.removeAttribute('data-region-yield')
      sibling.style.transition = ''
      stage.removeAttribute('data-region-sorting')
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
        // Revert: the blocks never left their slots, so easing the transforms
        // back to identity is the whole animation.
        lifted.style.transition = SETTLE
        sibling.style.transition = SETTLE
        lifted.style.transform = ''
        sibling.style.transform = ''
        const onEnd = (event: TransitionEvent): void => {
          if (event.target === lifted && event.propertyName === 'transform') settle(lifted, sibling)
        }
        lifted.addEventListener('transitionend', onEnd)
        window.setTimeout(() =>{  settle(lifted, sibling) }, 400)
        return
      }
      // Commit: the order flip reboxes both columns instantly. Hold each at
      // its dragged visual position with an inverse transform, then release.
      const liftedVisual = lifted.getBoundingClientRect().left
      const siblingVisual = sibling.getBoundingClientRect().left
      lifted.style.transition = 'none'
      sibling.style.transition = 'none'
      lifted.style.transform = ''
      sibling.style.transform = ''
      unitSide.toggle()
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
          if (event.target === lifted && event.propertyName === 'transform') settle(lifted, sibling)
        }
        lifted.addEventListener('transitionend', onEnd)
        window.setTimeout(() =>{  settle(lifted, sibling) }, 400)
      })
    }

    const onPointerDown = (event: PointerEvent): void => {
      if (event.button !== 0 || session.current !== null) return
      const target = event.target
      if (!(target instanceof Element)) return
      if (target.closest(INTERACTIVE) !== null) return
      // Zone grips sit inside the unit's column grip: a press meant for the
      // in-drawer zone sort must not also arm the column swap.
      if (target.closest('[data-zone-grip]') !== null) return
      const grip = target.closest('[data-region-grip]')
      if (!(grip instanceof HTMLElement)) return
      const kind = grip.dataset['regionGrip']
      const lifted = kind === 'conv'
        ? frame.querySelector<HTMLElement>('[data-center-col]')
        : kind === 'unit' ? frame.querySelector<HTMLElement>('[data-rightbar-col]') : null
      if (lifted == null) return
      const sibling = lifted.hasAttribute('data-center-col')
        ? frame.querySelector<HTMLElement>('[data-rightbar-col]')
        : frame.querySelector<HTMLElement>('[data-center-col]')
      if (sibling == null) return
      session.current = {
        pointerId: event.pointerId, originX: event.clientX, originY: event.clientY,
        lifted, sibling, armed: false, swapped: false,
        timer: window.setTimeout(() => {
          const live = session.current
          if (live === null || !live.armed) {
            if (live !== null) {
              live.armed = true
              live.lifted.setAttribute('data-region-lift', '')
              stage.setAttribute('data-region-sorting', '')
              grip.setPointerCapture?.(live.pointerId)
            }
          }
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
        const move = clientX - live.originX
        // Layout positions (offsetLeft) ignore transforms: the swap arms on
        // intrusion — once the lifted block's leading edge crosses this deep
        // into the sibling's slot, the sibling eases into the vacated slot.
        // Proportional for narrow columns, capped for wide ones, dead band so
        // hovering the boundary cannot flap the shift.
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
        // a wide sibling flying past the frame when the short side drags.
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

    frame.addEventListener('pointerdown', onPointerDown)
    window.addEventListener('pointermove', onPointerMove)
    window.addEventListener('pointerup', onPointerUp)
    window.addEventListener('pointercancel', onPointerCancel)
    window.addEventListener('keydown', onKey)
    return () => {
      frame.removeEventListener('pointerdown', onPointerDown)
      window.removeEventListener('pointermove', onPointerMove)
      window.removeEventListener('pointerup', onPointerUp)
      window.removeEventListener('pointercancel', onPointerCancel)
      window.removeEventListener('keydown', onKey)
      drop(false)
    }
  }, [frameRef, enabled])
}
