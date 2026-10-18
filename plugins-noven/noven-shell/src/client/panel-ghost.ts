/**
 * panel-ghost — clones the outgoing `.nv-page` into a fixed overlay right
 * before a panel switch, then lets the real unmount happen underneath while
 * the clone drifts out. React swaps panels in one frame, so without this the
 * old page never gets an exit; the ghost turns that hard cut into a crossfade.
 * @module noven-shell/client/panel-ghost
 */

/** Milliseconds the ghost takes to fade and lift away. */
const OUT_MS = 300

/**
 * Snapshot `.nv-page` into a static overlay. If the live page element is
 * still mounted next frame the click changed nothing — the overlay is dropped
 * before it can ever be seen (it renders identical pixels anyway).
 *
 * The creation page is excluded: it exits through its own View Transition
 * (named group + keyframes), and a clone carrying the same
 * view-transition-name would abort that transition as a duplicate. The clone
 * also strips any name it picked up, so a ghost lingering over a later
 * transition cannot collide either.
 */
export function capturePanelGhost(): void {
  const page = document.querySelector<HTMLElement>('.nv-page')
  if (page === null || page.classList.contains('nv-create-page')) return
  const rect = page.getBoundingClientRect()
  if (rect.width === 0 || rect.height === 0) return

  const ghost = document.createElement('div')
  ghost.className = 'nv-ghost'
  ghost.style.cssText = `position:fixed;left:${rect.left}px;top:${rect.top}px;` +
    `width:${rect.width}px;height:${rect.height}px;overflow:hidden;pointer-events:none;`
  const clone = page.cloneNode(true) as HTMLElement
  clone.style.height = `${rect.height}px`
  clone.style.viewTransitionName = 'none'
  ghost.append(clone)
  clone.scrollTop = page.scrollTop
  // Inner scroll regions do not clone: a stale to-top snapshot over a
  // mid-scroll pane reads as a jump when the ghost drops. The cloned tree
  // keeps the live order, so index-for-index copies carry every offset.
  const live = page.querySelectorAll<HTMLElement>('*')
  const frozen = clone.querySelectorAll<HTMLElement>('*')
  for (let i = 0; i < live.length; i++) {
    if (live[i].scrollTop !== 0 || live[i].scrollLeft !== 0) {
      frozen[i].scrollTop = live[i].scrollTop
      frozen[i].scrollLeft = live[i].scrollLeft
    }
  }
  document.body.append(ghost)

  // Timers, not rAF: hidden tabs throttle rAF to a halt, and a ghost that
  // survives a background swap would cover the page when the user returns.
  window.setTimeout(() => {
    if (document.querySelector('.nv-page') === page) { ghost.remove(); return }
    ghost.classList.add('nv-ghost-out')
    window.setTimeout(() => ghost.remove(), OUT_MS + 60)
  }, 30)
  window.setTimeout(() => ghost.remove(), 2000)
}

/**
 * Arm the ghost on pointerdowns outside `.nv-page` — capture phase runs
 * before the click handlers that trigger the swap, so this catches sidebar
 * nav without hooking DSH's layout service. In-page switches (back, card
 * open) call {@link capturePanelGhost} through the shell face, and arming
 * inside the page would cover it with a stale clone on every plain click.
 */
export function installPanelGhost(): () => void {
  const onDown = (e: PointerEvent) => {
    const page = document.querySelector('.nv-page')
    if (page !== null && e.target instanceof Node && page.contains(e.target)) return
    capturePanelGhost()
  }
  document.addEventListener('pointerdown', onDown, true)
  return () => document.removeEventListener('pointerdown', onDown, true)
}
