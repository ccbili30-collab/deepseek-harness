/**
 * 本会话 — the right-rail tab holding the session's mounted card context:
 * answer identity, background cards, the managed subject with its edit
 * permission, and what this session produced. Rows bind through
 * `/api/noven-bindings`; outputs derive from the session's own durable
 * `tool/result` saved meta.
 * @module noven-shell/client/tabs/Context
 */
import { useRef, useState } from 'react'
import { Menu, type MenuEntry } from '@deepseek-ai/dsh-client-ui-primitives'
import type { ShellT } from '../pages/Home.tsx'
import type { UseSidebarRightTabInfo } from '@deepseek-ai/dsh-client-ui-sidebar-right/client'
import type { SnapshotSelectorHook } from '@deepseek-ai/dsh-client-ui-slots'
import type { BindingOp, BindingState, ManagePermission } from '../bindings-api.ts'
import type { CardAddr } from '../card-api.ts'
import type { CardRow, SessionOutputRow } from '../index.tsx'
import { glyph } from '../icons.tsx'

interface Props {
  readonly t: ShellT
  readonly useTabInfo: UseSidebarRightTabInfo
  readonly useOutputs: SnapshotSelectorHook<readonly SessionOutputRow[]>
  readonly useBinding: SnapshotSelectorHook<BindingState | undefined>
  /** This session's workspace cards — the picker's catalog. */
  readonly useCards: SnapshotSelectorHook<readonly CardRow[]>
  /** Cards in other workspaces — mountable as cross-project references. */
  readonly useForeign: SnapshotSelectorHook<readonly CardRow[]>
  /** The session's project — labels the picker's local group. */
  readonly useProject: SnapshotSelectorHook<{ readonly root: string; readonly title: string } | undefined>
  readonly bind: (op: BindingOp) => Promise<void>
  readonly openWorkbench: () => void
  readonly openCard: (id: string, addr?: CardAddr) => void
}

function Section({ title, action, children }: {
  readonly title: string
  readonly action?: React.ReactNode
  readonly children?: React.ReactNode
}) {
  return (
    <section className="nv-card nv-ctx-section">
      <h4>{title}{action}</h4>
      {children}
    </section>
  )
}

/** Anchor-held picker: caller-composed menu entries (and a clear row when given). */
function CardPicker({ t, entries, onPick, clearLabel }: {
  readonly t: ShellT
  readonly entries: readonly MenuEntry[]
  readonly onPick: (cardId: string | undefined) => void
  readonly clearLabel?: string
}) {
  const [open, setOpen] = useState(false)
  const anchor = useRef<HTMLButtonElement | null>(null)
  const items: MenuEntry[] = [
    ...(clearLabel === undefined ? [] : [{ id: '@clear', label: clearLabel }]),
    ...entries,
  ]
  return (
    <>
      <button
        ref={anchor} type="button" className="nv-iconbtn nv-ctx-add"
        aria-label={t('ctx.add')} onClick={() => { setOpen(v => !v) }}
      >{glyph.plus(12)}</button>
      <Menu
        open={open} anchor={null} portal side="bottom" align="end" items={items}
        getAnchorRect={() => anchor.current?.getBoundingClientRect() ?? null}
        onClose={() => { setOpen(false) }}
        onSelect={id => { setOpen(false); onPick(id === '@clear' ? undefined : id) }}
      />
    </>
  )
}

const PERMISSIONS: readonly ManagePermission[] = ['read', 'approve', 'free']

/** `@ref:<root>:<cardId>` — a foreign catalog entry in the background picker. */
const REF_PREFIX = '@ref:'

export function ContextTab({ t, useTabInfo, useOutputs, useBinding, useCards, useForeign, useProject, bind, openWorkbench, openCard }: Props) {
  useTabInfo()
  const outputs = useOutputs(state => state)
  const state = useBinding(s => s)
  const cards = useCards(s => s)
  const foreign = useForeign(s => s)
  const project = useProject(s => s)
  const binding = state?.binding
  const refs = state?.refCards ?? []
  const cardName = (id: string | undefined): string | undefined =>
    id === undefined ? undefined : state?.cards[id]?.name ?? cards.find(c => c.cardId === id)?.name
  const cardKind = (id: string | undefined): string | undefined =>
    id === undefined ? undefined : state?.cards[id]?.kind ?? cards.find(c => c.cardId === id)?.kind
  const kindLabel = (kind: string | undefined): string =>
    kind === 'CHARACTER' ? t('card.kind.character') : t('card.kind.world')
  const run = (op: BindingOp) => { void bind(op).catch(() => { /* route keeps the previous binding */ }) }
  const managed = binding?.managed
  const identity = binding?.identityCardId
  const bgIds = binding?.backgroundCardIds ?? []
  const mounted = new Set(refs.map(r => `${r.root}:${r.cardId}`))
  const foreignByRoot = new Map<string, CardRow[]>()
  for (const c of foreign) {
    if (mounted.has(`${c.workspaceRoot}:${c.cardId}`)) continue
    const rows = foreignByRoot.get(c.workspaceRoot) ?? []
    rows.push(c)
    foreignByRoot.set(c.workspaceRoot, rows)
  }
  // The picker groups by owning project — 本项目 first (an empty project still
  // gets its heading so the layout explains itself), then one group per other
  // project titled by its registry name. 「引用」only marks already-mounted
  // rows below; the picker speaks in project names, not binding mechanics.
  const local = cards.filter(c => !bgIds.includes(c.cardId))
  const bgEntries: MenuEntry[] = [
    { type: 'label', id: '@proj:local', text: project === undefined ? t('ctx.thisProject') : `${t('ctx.thisProject')} · ${project.title}` },
    ...(local.length === 0
      ? [{ id: '@none', label: t('ctx.projectEmpty'), disabled: true }]
      : local.map(c => ({ id: c.cardId, label: c.name }))),
    ...[...foreignByRoot.entries()].flatMap(([root, rows]): MenuEntry[] => [
      { type: 'label', id: `@proj:${root}`, text: rows[0]?.projectTitle ?? root.split('/').pop() ?? root },
      ...rows.map(c => ({ id: `${REF_PREFIX}${root}:${c.cardId}`, label: c.name })),
    ]),
  ]
  const pickBackground = (id: string | undefined) => {
    if (id === undefined) return
    if (id.startsWith(REF_PREFIX)) {
      const rest = id.slice(REF_PREFIX.length)
      const cut = rest.lastIndexOf(':')
      run({ op: 'add-ref', root: rest.slice(0, cut), cardId: rest.slice(cut + 1) })
    } else {
      run({ op: 'add-background', cardId: id })
    }
  }
  return (
    <div className="nv-ctx">
      <Section title={t('ctx.background')} action={(
        <CardPicker t={t} entries={bgEntries} onPick={pickBackground} />
      )}>
        {bgIds.length === 0 && refs.length === 0
          ? <div className="nv-ctx-row nv-ctx-empty">{t('ctx.none')}</div>
          : null}
        {bgIds.map(id => (
            <div className="nv-ctx-row" key={id}>
              <button type="button" className="nv-ctx-card" onClick={() => { openCard(id) }}>
                <span className="nv-avatar nv-ctx-cardicon">{cardKind(id) === 'CHARACTER' ? '角' : '世'}</span>
                {cardName(id) ?? id}
                <small className="nv-tag">{kindLabel(cardKind(id))}</small>
              </button>
              <button
                type="button" className="nv-iconbtn nv-ctx-remove" aria-label={t('ctx.remove')}
                onClick={() => { run({ op: 'remove-background', cardId: id }) }}
              >✕</button>
            </div>
          ))}
        {refs.map(ref => {
          const home = foreign.find(c => c.workspaceRoot === ref.root && c.cardId === ref.cardId)
          return (
            <div className="nv-ctx-row" key={`${ref.root}:${ref.cardId}`}>
              <button
                type="button" className="nv-ctx-card" data-missing={ref.missing || undefined}
                onClick={() => { openCard(ref.cardId, { sessionId: home?.sessionId, root: ref.root }) }}
              >
                <span className="nv-avatar nv-ctx-cardicon">{ref.kind === 'CHARACTER' ? '角' : '世'}</span>
                {ref.name}
                <small className="nv-tag">{kindLabel(ref.kind)}</small>
                <small className="nv-tag nv-tag-ref">{ref.missing ? t('ctx.refMissing') : `${t('ctx.ref')} · ${ref.root.split('/').pop() ?? ref.root}`}</small>
              </button>
              <button
                type="button" className="nv-iconbtn nv-ctx-remove" aria-label={t('ctx.remove')}
                onClick={() => { run({ op: 'remove-ref', root: ref.root, cardId: ref.cardId }) }}
              >✕</button>
            </div>
          )
        })}
      </Section>
      <Section title={t('ctx.identity')} action={(
        <CardPicker
          t={t} entries={cards.filter(c => c.kind === 'CHARACTER').map(c => ({ id: c.cardId, label: c.name }))}
          clearLabel={t('ctx.identityDefault')}
          onPick={id => { run({ op: 'set-identity', cardId: id ?? null }) }}
        />
      )}>
        <div className="nv-ctx-row">
          <span className="nv-avatar" style={{ width: 28, height: 28, fontSize: 11 }}>{identity === undefined ? 'N' : '角'}</span>
          {cardName(identity) ?? 'Nova（默认）'}
        </div>
      </Section>
      <Section title={t('ctx.managing')} action={(
        <CardPicker
          t={t} entries={cards.map(c => ({ id: c.cardId, label: c.name }))} clearLabel={t('ctx.managedNone')}
          onPick={id => { run({ op: 'set-managed', cardId: id ?? null, permission: managed?.permission ?? 'free' }) }}
        />
      )}>
        {managed === undefined
          ? <div className="nv-ctx-row nv-ctx-empty">{t('ctx.none')}</div>
          : (
            <>
              <div className="nv-ctx-row">
                <button type="button" className="nv-ctx-card" onClick={() => { openCard(managed.cardId) }}>
                  <span className="nv-avatar nv-ctx-cardicon">{cardKind(managed.cardId) === 'CHARACTER' ? '角' : '世'}</span>
                  {cardName(managed.cardId) ?? managed.cardId}
                  <small className="nv-tag">{kindLabel(cardKind(managed.cardId))}</small>
                </button>
                {managed.permission !== 'read' && <span className="nv-tag nv-tag-mint">{t('ctx.editable')}</span>}
              </div>
              <div className="nv-ctx-perms">
                {PERMISSIONS.map(p => (
                  <button
                    type="button" key={p}
                    className="nv-ctx-perm" data-on={p === managed.permission || undefined}
                    onClick={() => { run({ op: 'set-managed', cardId: managed.cardId, permission: p }) }}
                  >{t(`ctx.perm.${p}`)}</button>
                ))}
              </div>
            </>
          )}
      </Section>
      <Section title={t('ctx.outputs')} action={(
        <button type="button" className="nv-btn-ghost nv-ctx-wb" onClick={openWorkbench}>{t('ctx.workbench')}</button>
      )}>
        {outputs.length === 0
          ? <div className="nv-ctx-row nv-ctx-empty">{t('ctx.outputsEmpty')}</div>
          : outputs.map(row => (
            <div className="nv-ctx-row" key={row.rootId ?? row.name}>
              <span className="nv-avatar nv-ctx-cardicon">{row.kind === 'CHARACTER' ? '角' : '世'}</span>
              {row.name}
              {row.kind !== undefined && <small className="nv-tag">{kindLabel(row.kind)}</small>}
              {row.rootId !== undefined && (
                <button className="nv-btn-ghost" style={{ padding: '2px 10px', fontSize: 11, marginLeft: 'auto' }} onClick={() => openCard(row.rootId as string)}>{t('ctx.open')}</button>
              )}
            </div>
          ))}
      </Section>
    </div>
  )
}
