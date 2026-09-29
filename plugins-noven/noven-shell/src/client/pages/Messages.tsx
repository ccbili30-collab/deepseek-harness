/**
 * 消息 — reserved for real-user social notifications; locally only an empty
 * state exists.
 * @module noven-shell/client/pages/Messages
 */
import type { ShellT } from './Home.tsx'

interface Props { readonly t: ShellT }

export function Messages({ t }: Props) {
  return (
    <div className="nv-page">
      <div className="nv-page-inner">
        <div className="nv-h1">{t('nav.messages')}</div>
        <div className="nv-card">
          <div className="nv-empty">
            <div>{t('messages.empty')}</div>
            <div style={{ fontSize: 12 }}>{t('messages.hint')}</div>
          </div>
        </div>
      </div>
    </div>
  )
}
