/**
 * 创作库 — the right-rail tab listing this workspace's workbenches and
 * recent outputs. Shares the fixtures with 我的 → 创作库 until the real
 * library service exists.
 * @module noven-shell/client/tabs/Library
 */
import type { ShellT } from '../pages/Home.tsx'
import { WORKBENCHES, RECENT_OUTPUTS, coverStyle } from '../data.ts'

interface Props { readonly t: ShellT }

export function LibraryTab({ t }: Props) {
  return (
    <div className="nv-ctx">
      <div className="nv-card nv-ctx-section">
        {WORKBENCHES.slice(0, 3).map(w => (
          <div key={w.id} className="nv-ctx-row">
            <span className="nv-ctx-thumb" style={coverStyle(w.hue, true)} />
            <div>
              <div style={{ fontSize: 13, fontWeight: 600 }}>{w.title}</div>
              <small style={{ color: 'var(--nv-secondary-text)', fontSize: 11 }}>{w.project} · {w.files}</small>
            </div>
          </div>
        ))}
      </div>
      <div className="nv-card nv-ctx-section">
        <h4>{t('me.library.recent')}</h4>
        {RECENT_OUTPUTS.map(r => (
          <div key={r.id} className="nv-ctx-row" style={{ fontSize: 12 }}>
            {r.name}
          </div>
        ))}
      </div>
    </div>
  )
}
