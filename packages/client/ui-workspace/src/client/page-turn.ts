/**
 * Session page turn: a user navigation between Sessions moves the whole work
 * layer up or down like turning a page — the previous page leaves while the
 * target page enters from the opposite edge. Another Project uses the same
 * turn with a short lift first; both run for the same total duration.
 *
 * The motion uses the View Transitions API: the browser keeps a bitmap of the
 * old work layer, applies the navigation, and animates the two bitmaps with
 * compositor transforms only (no per-frame layout). The work layer carries
 * `view-transition-name: noven-work` (ui-layout AppFrame.module.css); the
 * navigation column is not named, so it stays live and static. Engines without
 * the API apply the navigation directly.
 *
 * The page direction and weight are published on `html[data-page-turn]` as
 * `<session|project>-<up|down>` for the duration of the transition; the
 * stylesheet keys its keyframes off that attribute.
 */

/** Which way the page moves: `down` means the target sits below the previous row, so content scrolls up. */
export type PageTurnDirection = 'up' | 'down'

/** Whether the switch stays inside one Project or crosses to another. */
export type PageTurnWeight = 'session' | 'project'

/** Attribute on the root element that selects the page-turn keyframes. */
export const PAGE_TURN_ATTRIBUTE = 'data-page-turn'

type ViewTransitionDocument = Document & {
  startViewTransition?: (update: () => Promise<void> | void) => { finished: Promise<void> }
}

/**
 * Read the page direction from the navigation list's row order.
 * @param fromId - previously visible Session id.
 * @param toId - target Session id.
 * @param root - document holding the rendered rows.
 * @returns `up` when the target row sits above the previous row; `down` otherwise,
 *   including when either row is not rendered.
 */
export function rowDirection(fromId: string, toId: string, root?: ParentNode): PageTurnDirection {
  const scope = root ?? (typeof document === 'undefined' ? undefined : document)
  if (scope === undefined) return 'down'
  const keys = [...scope.querySelectorAll<HTMLElement>('[data-row-key^="session:"]')].map(row => row.dataset['rowKey'])
  const from = keys.indexOf(`session:${fromId}`)
  const to = keys.indexOf(`session:${toId}`)
  return from >= 0 && to >= 0 && to < from ? 'up' : 'down'
}

/**
 * Let the store commit reach the DOM before the new snapshot is taken.
 * Rendering is suppressed while a View Transition's update callback runs, so
 * animation frames do not fire here; two macrotask turns let React's scheduler
 * (MessageChannel tasks) flush the commit instead.
 */
function nextCommit(): Promise<void> {
  return new Promise((resolve) => {
    setTimeout(() => { setTimeout(resolve, 0) }, 0)
  })
}

/**
 * Apply a Session navigation as a page turn.
 * @param update - the synchronous navigation commit; it always runs exactly
 *   once, synchronously, so a throw reaches the caller unchanged.
 * @param direction - which way the page moves.
 * @param weight - `project` adds the lift before the turn, same total duration.
 * @param doc - document to animate; defaults to the global document when one exists.
 */
export function turnPage(
  update: () => void,
  direction: PageTurnDirection,
  weight: PageTurnWeight,
  doc?: ViewTransitionDocument,
): void {
  const target = doc ?? (typeof document === 'undefined' ? undefined : document as ViewTransitionDocument)
  const reduced = typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches
  if (target === undefined || typeof target.startViewTransition !== 'function' || reduced) {
    update()
    return
  }
  const root = target.documentElement
  const mark = `${weight}-${direction}`
  root.setAttribute(PAGE_TURN_ATTRIBUTE, mark)
  // The browser captures the old page synchronously inside this call, then
  // invokes the callback. The commit runs here, inside the transition, so the
  // new snapshot is the switched page.
  let failure: unknown
  let failed = false
  const transition = target.startViewTransition(async () => {
    try {
      update()
    } catch (error: unknown) {
      failed = true
      failure = error
      throw error
    }
    await nextCommit()
  })
  void transition.finished.catch((error: unknown) => {
    // A rejected update is reported through the caller's own error path below
    // or through the browser's skipped transition; nothing to do here.
    void error
  }).finally(() => {
    if (root.getAttribute(PAGE_TURN_ATTRIBUTE) === mark) root.removeAttribute(PAGE_TURN_ATTRIBUTE)
  })
  if (failed) throw failure
}
