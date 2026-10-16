/**
 * Creation-surface scene transitions. They decorate a real navigation commit;
 * no screenshot or page clone is retained. The temporary sheet exists only for
 * the 420ms handoff from the creation launcher into the persisted IDE layout.
 */

const IDE_SCENE_MS = 420
const COMPOSER_TRANSITION = 'noven-create-composer'

type ViewTransitionDocument = Document & {
  startViewTransition?: (update: () => void | Promise<void>) => { finished: Promise<void> }
}

/**
 * Morph the creation thought field into the real main-conversation composer.
 * The target name is attached only after navigation mounts the card, then
 * removed when the transition settles so embedded composers never collide.
 * @param commit - real async session/navigation commit.
 * @returns the commit result.
 */
export async function enterConversationScene(commit: () => Promise<boolean>): Promise<boolean> {
  const documentWithTransition = document as ViewTransitionDocument
  if (documentWithTransition.startViewTransition === undefined || matchMedia('(prefers-reduced-motion: reduce)').matches) {
    return commit()
  }
  const operation = commit()
  let target: HTMLElement | null = null
  let failed = false
  void operation.then(ok => { failed = !ok })
  const transition = documentWithTransition.startViewTransition(async () => {
    for (let frame = 0; frame < 90 && target === null && !failed; frame += 1) {
      await new Promise<void>(resolve => requestAnimationFrame(() => resolve()))
      target = document.querySelector<HTMLElement>('[data-center-col] [data-conversation-region="chat"] [data-composer-card]')
    }
    if (target !== null) target.style.viewTransitionName = COMPOSER_TRANSITION
  })
  const result = await operation
  await transition.finished.finally(() => {
    if (target !== null) target.style.viewTransitionName = ''
  })
  return result
}

/**
 * Lift a temporary sheet from the handcraft action, then let the real IDE frame
 * take over underneath it.
 * @param source - handcraft action button.
 * @param commit - synchronous real layout/navigation commit.
 */
export function enterIdeScene(source: HTMLElement, commit: () => void): void {
  const rect = source.getBoundingClientRect()
  const sheet = document.createElement('div')
  sheet.className = 'nv-ide-sheet'
  Object.assign(sheet.style, {
    left: `${rect.left}px`,
    top: `${rect.top}px`,
    width: `${rect.width}px`,
    height: `${rect.height}px`,
  })
  document.body.append(sheet)
  document.documentElement.dataset.novenScene = 'ide'

  sheet.animate([
    { transform: 'translateY(0) scale(1)', borderRadius: '14px', opacity: 0.72 },
    { offset: 0.2, transform: 'translateY(-12px) scale(1.025)', borderRadius: '14px', opacity: 0.92 },
    { offset: 0.72, transform: `translate(${24 - rect.left}px, ${18 - rect.top}px) scale(${Math.max(1, (innerWidth - 48) / Math.max(1, rect.width))}, ${Math.max(1, (innerHeight - 36) / Math.max(1, rect.height))})`, borderRadius: '8px', opacity: 0.42 },
    { transform: `translate(${24 - rect.left}px, ${18 - rect.top}px) scale(${Math.max(1, (innerWidth - 48) / Math.max(1, rect.width))}, ${Math.max(1, (innerHeight - 36) / Math.max(1, rect.height))})`, borderRadius: '8px', opacity: 0 },
  ], { duration: IDE_SCENE_MS, easing: 'cubic-bezier(.2,.72,.12,1)', fill: 'forwards' })

  window.setTimeout(commit, 72)
  window.setTimeout(() => {
    sheet.remove()
    delete document.documentElement.dataset.novenScene
  }, IDE_SCENE_MS)
}
