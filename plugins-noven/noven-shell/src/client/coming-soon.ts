/**
 * 敬请期待：社区 / 消息尚未接入，点导航行先抖一下，再在屏幕中央浮一张
 * 克制的卡片。卡片只出现一次（重复点不再叠加），点遮罩或按钮关闭。
 * @module noven-shell/client/coming-soon
 */

const SHAKE_MS = 420
const CARD_MS = 260

/**
 * Shake the navigation row that owns `eventTarget`, then show the centered
 * coming-soon card. Safe to call from any panel-row click handler.
 * @param eventTarget - the clicked navigation element.
 * @param label - centered card text.
 */
export function showComingSoon(eventTarget: EventTarget | null, label: string): void {
  const row = eventTarget instanceof Element ? eventTarget.closest<HTMLElement>('button, [role="button"], li, [data-row-key]') : null
  if (row !== null) {
    row.animate(
      [
        { transform: 'translateX(0)' },
        { transform: 'translateX(-5px)' },
        { transform: 'translateX(5px)' },
        { transform: 'translateX(-4px)' },
        { transform: 'translateX(4px)' },
        { transform: 'translateX(0)' },
      ],
      { duration: SHAKE_MS, easing: 'ease-in-out' },
    )
  }
  presentCard(label)
}

let current: HTMLElement | null = null

function presentCard(label: string): void {
  if (current !== null) return
  const overlay = document.createElement('div')
  overlay.className = 'nv-soon-overlay'
  overlay.setAttribute('role', 'dialog')
  overlay.setAttribute('aria-modal', 'true')
  const card = document.createElement('div')
  card.className = 'nv-soon-card'
  card.append(label)
  overlay.append(card)
  document.body.append(overlay)
  current = overlay
  // Enter on the next frame so the starting state transitions.
  requestAnimationFrame(() => {
    requestAnimationFrame(() => { overlay.dataset.open = 'true' })
  })
  const close = (): void => {
    if (current !== overlay) return
    current = null
    overlay.dataset.open = 'false'
    window.setTimeout(() => overlay.remove(), CARD_MS)
    window.removeEventListener('keydown', onKey)
  }
  const onKey = (event: KeyboardEvent): void => { if (event.key === 'Escape') close() }
  overlay.addEventListener('click', event => { if (event.target === overlay) close() })
  window.addEventListener('keydown', onKey)
  window.setTimeout(close, 2600)
}
