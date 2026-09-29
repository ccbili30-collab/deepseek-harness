/**
 * 本会话 — the right-rail tab holding the session's card context: background
 * world, answer identity, managed objects, and the outputs this session has
 * produced. All rows are fixtures until the card/session link layer lands.
 * @module noven-shell/client/tabs/Context
 */
import type { ShellT } from '../pages/Home.tsx'

interface Props { readonly t: ShellT }

function Section({ title, children }: { readonly title: string; readonly children?: React.ReactNode }) {
  return (
    <section className="nv-card nv-ctx-section">
      <h4>{title}</h4>
      {children}
    </section>
  )
}

export function ContextTab({ t }: Props) {
  return (
    <div className="nv-ctx">
      <Section title={t('ctx.background')}>
        <div className="nv-ctx-row">
          <span className="nv-ctx-thumb" />
          住在云上的第七天
          <button className="nv-btn-ghost" style={{ padding: '2px 10px', fontSize: 11 }}>{t('ctx.open')}</button>
        </div>
      </Section>
      <Section title={t('ctx.identity')}>
        <div className="nv-ctx-row"><span className="nv-avatar">检</span>检票员</div>
      </Section>
      <Section title={t('ctx.managing')}>
        <div className="nv-ctx-row">
          <span className="nv-ctx-thumb" />
          青玄门
          <small className="nv-tag" data-outline="true">{t('ctx.editable')}</small>
        </div>
      </Section>
      <Section title={t('ctx.outputs')}>
        <div className="nv-ctx-row">
          <span className="nv-ctx-thumb" />
          山门地图 v3.png
          <button className="nv-btn-ghost" style={{ padding: '2px 10px', fontSize: 11 }}>{t('ctx.open')}</button>
        </div>
        <div className="nv-ctx-row">
          <span className="nv-ctx-thumb" />
          沈砚.md
          <button className="nv-btn-ghost" style={{ padding: '2px 10px', fontSize: 11 }}>{t('ctx.open')}</button>
        </div>
      </Section>
    </div>
  )
}
