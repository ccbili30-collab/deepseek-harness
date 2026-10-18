/**
 * Creation-surface scene transitions. They decorate a real navigation commit;
 * no screenshot or page clone is retained.
 *
 * The load-bearing rule: the commit runs INSIDE the View Transition update
 * callback. The commits are store-driven (openSession/selectPanel flush React
 * synchronously and unmount the ritual page), so calling commit() before
 * startViewTransition() leaves the old capture with an empty stage — the old
 * composer, the title, and the page are already detached, and the scene
 * degenerates into a plain crossfade. Capturing first, then mutating, is what
 * turns the same names into an actual morph.
 */

const COMPOSER_TRANSITION = 'noven-create-composer'
const PAGE_TRANSITION = 'noven-create-page'
const SEED_TRANSITION = 'noven-handcraft-seed'

/** Root attribute marking which creation-surface scene is running. */
const SCENE_ATTRIBUTE = 'data-create-scene'

/** Ritual furniture that exits with its own name in the conversation scene. */
const EXIT_REGIONS = [
  { selector: '.nv-create-intro', name: 'noven-create-intro' },
  { selector: '.nv-create-paths', name: 'noven-create-paths' },
] as const

/** IDE landmarks named for their entrances once the commit has landed them. */
const IDE_REGIONS = [
  { selector: '[data-sidebar-right-panel]', name: 'noven-ide-drawer' },
  { selector: '.nv-canvas', name: 'noven-ide-canvas' },
  { selector: '[data-conversation-region="chat"]', name: 'noven-ide-chat' },
] as const

type ViewTransitionDocument = Document & {
  startViewTransition?: (update: () => void | Promise<void>) => { finished: Promise<void> }
}

/**
 * Pump for landmark polling inside a View Transition update. Rendering —
 * requestAnimationFrame included — is suppressed while the update callback is
 * pending, so frame callbacks never fire there; macrotask ticks do (the same
 * reason ui-workspace's page turn commits through nested setTimeout).
 */
const nextTick = (): Promise<void> => new Promise(resolve => { setTimeout(resolve, 16) })

/**
 * Morph the creation thought field into the real main-conversation composer.
 * A morph needs BOTH anchors named before the capture: the hero composer on
 * the ritual page (old) and, once navigation mounts it, the docked composer
 * in the conversation (new). Named exits paint above the incoming root image,
 * so the ritual furniture gets a visible farewell — the title lifts, the path
 * cards sink — instead of being covered in place by the conversation's
 * opaque background. All names are removed when the transition settles so
 * embedded composers never collide.
 * @param commit - real session/navigation commit; runs inside the transition.
 * @returns the commit result; a thrown commit is logged and reported as false.
 */
export async function enterConversationScene(commit: () => Promise<boolean>): Promise<boolean> {
  const documentWithTransition = document as ViewTransitionDocument
  if (documentWithTransition.startViewTransition === undefined || matchMedia('(prefers-reduced-motion: reduce)').matches) {
    return commit()
  }
  const page = document.querySelector<HTMLElement>('.nv-create-page')
  if (page !== null) page.style.viewTransitionName = PAGE_TRANSITION
  const source = document.querySelector<HTMLElement>('.nv-create-hero [data-composer-card]')
  if (source !== null) source.style.viewTransitionName = COMPOSER_TRANSITION
  const exits: HTMLElement[] = []
  for (const region of EXIT_REGIONS) {
    const el = document.querySelector<HTMLElement>(region.selector)
    if (el !== null) { el.style.viewTransitionName = region.name; exits.push(el) }
  }
  let target: HTMLElement | null = null
  let result = false
  // Cleanup reads the closure-assigned names through a function boundary so
  // the outer scope's initializer narrowing does not collapse them to null.
  const clearNames = (): void => {
    if (target !== null) target.style.viewTransitionName = ''
    if (source !== null) source.style.viewTransitionName = ''
    if (page !== null) page.style.viewTransitionName = ''
    for (const el of exits) el.style.viewTransitionName = ''
  }
  const transition = documentWithTransition.startViewTransition(async () => {
    try {
      result = await commit()
    } catch (reason: unknown) {
      console.warn('noven-shell: conversation scene commit failed:', reason)
      return
    }
    if (!result) return
    for (let frame = 0; frame < 90 && target === null; frame += 1) {
      await nextTick()
      target = document.querySelector<HTMLElement>('[data-center-col] [data-conversation-region="chat"] [data-composer-card]')
    }
    if (target !== null) target.style.viewTransitionName = COMPOSER_TRANSITION
  })
  await transition.finished.catch(() => undefined)
  clearNames()
  return result
}

/**
 * Choreograph the creation page into the clean IDE work surface: the clicked
 * card lifts and dissolves as the seed, the ritual page exits beneath it, and
 * the IDE lands region by region — drawer, canvas, conversation. The card's
 * name and the page's name must be set before the capture, so they are marked
 * ahead of the transition; the region names attach once the landed DOM shows
 * them and are cleared when the transition settles, so later page turns
 * capture the work layer whole again.
 * @param source - the handcraft action card.
 * @param commit - the real navigation + arrangement commit; runs inside the transition.
 * @returns the commit result; a thrown commit is logged and reported as false.
 */
export async function enterHandcraftScene(source: HTMLElement, commit: () => Promise<boolean>): Promise<boolean> {
  const documentWithTransition = document as ViewTransitionDocument
  if (documentWithTransition.startViewTransition === undefined || matchMedia('(prefers-reduced-motion: reduce)').matches) {
    return commit()
  }
  const page = document.querySelector<HTMLElement>('.nv-create-page')
  if (page !== null) page.style.viewTransitionName = PAGE_TRANSITION
  // The thought field exits with the page in this scene: morph names are
  // scene-scoped (set and cleared inside enterConversationScene), so the
  // hero composer arrives unnamed and is captured into the page's old image.
  source.style.viewTransitionName = SEED_TRANSITION
  const regions: HTMLElement[] = []
  let result = false
  const transition = documentWithTransition.startViewTransition(async () => {
    try {
      result = await commit()
    } catch (reason: unknown) {
      console.warn('noven-shell: handcraft scene commit failed:', reason)
      return
    }
    if (!result) return
    for (let frame = 0; frame < 90; frame += 1) {
      await nextTick()
      for (const region of IDE_REGIONS) {
        if (regions.some(el => el.style.viewTransitionName === region.name)) continue
        const el = document.querySelector<HTMLElement>(region.selector)
        if (el !== null && el.style.viewTransitionName === '') {
          el.style.viewTransitionName = region.name
          regions.push(el)
        }
      }
      // The capture settles once the two load-bearing regions have landed.
      if (regions.length >= 2) break
    }
  })
  await transition.finished.catch(() => undefined)
  for (const el of regions) el.style.viewTransitionName = ''
  if (page !== null) page.style.viewTransitionName = ''
  source.style.viewTransitionName = ''
  return result
}

/**
 * Reveal the creation page from wherever the viewer stands: the work layer
 * sinks and dims while the ritual page blooms up from below. The page carries
 * its view-transition-name in CSS, so no naming step is needed on either side.
 * The panel commit runs inside the update, per the capture rule above.
 * @param commit - the synchronous panel commit (selectPanel(CREATE_ID)).
 * @returns settlement of the scene (immediately without the API or under reduced motion).
 */
export function enterCreateScene(commit: () => void): Promise<void> {
  const documentWithTransition = document as ViewTransitionDocument
  if (documentWithTransition.startViewTransition === undefined || matchMedia('(prefers-reduced-motion: reduce)').matches) {
    commit()
    return Promise.resolve()
  }
  const root = document.documentElement
  root.setAttribute(SCENE_ATTRIBUTE, 'enter')
  const transition = documentWithTransition.startViewTransition(async () => {
    commit()
    // Rendering inside a pending update is suppressed; tick until React has
    // actually mounted the page, or the new capture still shows the old view
    // and the page's own group never exists.
    for (let frame = 0; frame < 90 && document.querySelector('.nv-create-page') === null; frame += 1) {
      await nextTick()
    }
  })
  void transition.finished.catch(() => undefined).finally(() => {
    if (root.getAttribute(SCENE_ATTRIBUTE) === 'enter') root.removeAttribute(SCENE_ATTRIBUTE)
  })
  return transition.finished.catch(() => undefined)
}
