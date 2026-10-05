/**
 * 创作库 — the right-rail tab for this session's creative library. Workbench
 * records have no client read route yet (only model-side mutation tools), so
 * that section stays an honest empty state; 最近产出 derives from the
 * session's own durable `tool/result` saved meta — real cards, replayable.
 * @module noven-shell/client/tabs/Library
 */
import type { ShellT } from '../pages/Home.tsx'
import type { SnapshotSelectorHook } from '@deepseek-ai/dsh-client-ui-slots'
import type { SessionOutputRow } from '../index.tsx'

interface Props {
  readonly t: ShellT
  readonly useOutputs: SnapshotSelectorHook<readonly SessionOutputRow[]>
  readonly openCard: (id: string) => void
}

export function LibraryTab({ t, useOutputs, openCard }: Props) {
  const outputs = useOutputs(state => state)
  return (
    <div className="nv-ctx">
      <div className="nv-card nv-ctx-section">
        <h4>{t('tab.library')}</h4>
        <div className="nv-ctx-row nv-ctx-empty">{t('lib.empty')}</div>
      </div>
      <div className="nv-card nv-ctx-section">
        <h4>{t('me.library.recent')}</h4>
        {outputs.length === 0
          ? <div className="nv-ctx-row nv-ctx-empty">{t('ctx.outputsEmpty')}</div>
          : outputs.map(row => (
            <div className="nv-ctx-row" key={row.rootId ?? row.name} style={{ fontSize: 12 }}>
              <span className="nv-avatar nv-ctx-cardicon">{row.kind === 'CHARACTER' ? '角' : '世'}</span>
              {row.name}
              {row.kind !== undefined && <small className="nv-tag">{row.kind === 'CHARACTER' ? t('card.kind.character') : t('card.kind.world')}</small>}
              {row.rootId !== undefined && (
                <button className="nv-btn-ghost" style={{ padding: '2px 10px', fontSize: 11, marginLeft: 'auto' }} onClick={() => openCard(row.rootId as string)}>{t('ctx.open')}</button>
              )}
            </div>
          ))}
      </div>
    </div>
  )
}
