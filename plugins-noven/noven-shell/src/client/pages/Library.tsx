/**
 * 创作库 — the creative library: an overview grid of project workspaces (each
 * backed by the app-ledger manifest) and one project's inner page, where works
 * group by kind, stage is a badge/filter, and a drawer folds a work's
 * revision chain. Mutations POST ops to `/api/noven-library`; files never move.
 * @module noven-shell/client/pages/Library
 */
import { useEffect, useMemo, useState } from 'react'
import { Modal } from '@deepseek-ai/dsh-client-ui-primitives'
import type { ShellT } from './Home.tsx'
import type { NovenShellLocaleKey } from '../locales.ts'
import type { SnapshotSelectorHook } from '@deepseek-ai/dsh-client-ui-slots'
import { isMiscRoot } from '../library-api.ts'
import type { SessionId } from '@deepseek-ai/dsh-session/types'
import type { CardRow } from '../index.tsx'
import type { InboxItem, LibraryOp, LibraryPayload, LibraryWork, ProjectAddr, ProjectRow, WorkKind, WorkStage } from '../library-api.ts'
import type { CardAddr } from '../card-api.ts'
import { cardContentUrl } from '../card-api.ts'

const fmt = (t: ShellT, key: NovenShellLocaleKey, vars: Record<string, string | number>): string =>
  Object.entries(vars).reduce((s, [k, v]) => s.replace(`{${k}}`, String(v)), t(key))

const KIND_ORDER: readonly WorkKind[] = ['card', 'map', 'comic', 'image', 'text', 'other']
const STAGES: readonly WorkStage[] = ['draft', 'final', 'published']
const IMAGE_KINDS: ReadonlySet<WorkKind> = new Set(['image', 'map', 'comic'])

const kindLabel = (t: ShellT, kind: WorkKind): string =>
  t(`lib.kind.${kind}` as NovenShellLocaleKey)

const stageLabel = (t: ShellT, stage: WorkStage): string =>
  t(`lib.stage.${stage}` as NovenShellLocaleKey)

const fileUrl = (root: string, rel: string): string =>
  `/api/file?path=${encodeURIComponent(`${root}/${rel}`)}`

const shortTime = (at: string): string => {
  const time = new Date(at)
  return Number.isNaN(time.getTime()) ? at : `${time.getMonth() + 1}/${time.getDate()} ${String(time.getHours()).padStart(2, '0')}:${String(time.getMinutes()).padStart(2, '0')}`
}

interface OverviewProps {
  readonly t: ShellT
  readonly useProjects: SnapshotSelectorHook<readonly ProjectRow[]>
  readonly useCards: SnapshotSelectorHook<readonly CardRow[]>
  readonly onOpenProject?: (row: ProjectRow) => void
  /** 新建项目 opens the two-entry dialog (新建文件夹 / 从 Finder 选择). */
  readonly onNewProject?: () => void
  /** 移出创作库 drops the registry pointer; the on-disk directory is untouched. */
  readonly onRemoveProject?: (root: string) => Promise<void>
  /** 重命名 writes project.json.title and the matching Workspace title — one name everywhere. */
  readonly onRenameProject?: (root: string, title: string) => Promise<void>
}

/** The project tile's ⋯ menu: 移出创作库 arms on first press — the files stay where they are. */
function ProjectMenu({ t, onRename, onRemove }: { readonly t: ShellT; readonly onRename?: () => void; readonly onRemove: () => void }) {
  const [open, setOpen] = useState(false)
  const [armed, setArmed] = useState(false)
  const close = (): void => { setOpen(false); setArmed(false) }
  return (
    <span className="nv-cardmenu" onClick={e => e.stopPropagation()}>
      <button className="nv-cardmenu-dot" aria-label={t('me.card.menu')} onClick={() => setOpen(v => !v)}>⋯</button>
      {open && (
        <>
          <span className="nv-cardmenu-mask" onClick={close} />
          <span className="nv-cardmenu-pop" role="menu">
            {onRename !== undefined && <button role="menuitem" onClick={() => { close(); onRename() }}>{t('lib.project.rename')}</button>}
            <button role="menuitem" data-armed={armed || undefined} onClick={() => { if (!armed) { setArmed(true); return } close(); onRemove() }}>
              {armed ? t('lib.project.removeConfirm') : t('lib.project.remove')}
            </button>
          </span>
        </>
      )}
    </span>
  )
}

/** 重命名 dialog: one input seeded with the current title; confirm writes project.json + Workspace. */
function RenameProjectDialog({ t, row, onClose, onRename }: {
  readonly t: ShellT
  readonly row: ProjectRow | undefined
  readonly onClose: () => void
  readonly onRename: (root: string, title: string) => Promise<void>
}) {
  const [title, setTitle] = useState('')
  const [busy, setBusy] = useState(false)
  useEffect(() => { setTitle(row?.title ?? ''); setBusy(false) }, [row])
  return (
    <Modal open={row !== undefined} onClose={onClose} title={t('lib.project.rename')} closeLabel={t('me.profile.close')}>
      <div className="nv-profedit">
        <div className="nv-profedit-field">
          <input className="nv-profedit-input" value={title} data-modal-autofocus
            onChange={e => { setTitle(e.target.value) }}
            onKeyDown={e => {
              if (e.key !== 'Enter' || row === undefined || title.trim() === '' || busy) return
              setBusy(true)
              void onRename(row.root, title.trim()).finally(() => { setBusy(false); onClose() })
            }} />
        </div>
        <div className="nv-profedit-field nv-projdlg-actions">
          <button className="nv-btn-primary" disabled={busy || row === undefined || title.trim() === ''}
            onClick={() => {
              if (row === undefined) return
              setBusy(true)
              void onRename(row.root, title.trim()).finally(() => { setBusy(false); onClose() })
            }}>{t('lib.project.renameConfirm')}</button>
        </div>
      </div>
    </Modal>
  )
}

function ProjectTile({ t, row, cards, onOpen, onRename, onRemove }: { readonly t: ShellT; readonly row: ProjectRow; readonly cards: readonly CardRow[]; readonly onOpen: () => void; readonly onRename?: () => void; readonly onRemove?: () => void }) {
  const cardCount = cards.filter(c => c.workspaceRoot === row.root).length
  const kinds = KIND_ORDER.filter(k => k !== 'card' && (row.kindCounts[k] ?? 0) > 0)
  return (
    <div className="nv-card nv-proj" data-missing={row.missing || undefined}>
      <button className="nv-proj-hit" onClick={onOpen}>
        <span className="nv-proj-cover" data-count={row.covers.length}>
          {row.covers.length === 0 && <span className="ph">{row.title.slice(0, 1)}</span>}
          {row.covers.map(rel => <img key={rel} src={fileUrl(row.root, rel)} alt="" />)}
        </span>
        <span className="nv-proj-body">
          <span className="nv-ccard-title">{row.title}{row.missing && <span className="nv-tag">{t('lib.project.missing')}</span>}</span>
          <span className="nv-ccard-meta">{fmt(t, 'lib.project.meta', { cards: cardCount, works: row.works })}</span>
          {kinds.length > 0 && (
            <span className="nv-proj-kinds">
              {kinds.map(k => <span key={k} className="nv-tag">{kindLabel(t, k)} {row.kindCounts[k]}</span>)}
            </span>
          )}
          {row.pending > 0 && <span className="nv-dirty">{fmt(t, 'lib.project.pending', { count: row.pending })}</span>}
        </span>
      </button>
      {(onRemove !== undefined || onRename !== undefined) && <ProjectMenu t={t} onRename={onRename} onRemove={onRemove ?? (() => {})} />}
    </div>
  )
}

/** The 创作库 tab of 我的 — the cross-project overview grid. */
export function LibraryOverview({ t, useProjects, useCards, onOpenProject, onNewProject, onRemoveProject, onRenameProject }: OverviewProps) {
  const projects = useProjects(state => state)
  const cards = useCards(state => state)
  const pending = projects.reduce((n, p) => n + p.pending, 0)
  const [renameTarget, setRenameTarget] = useState<ProjectRow | undefined>(undefined)
  return (
    <div className="nv-lib">
      {pending > 0 && (
        <div className="nv-lib-inboxbar">
          <span className="nv-tag"><span className="dot" />{fmt(t, 'lib.inbox.pill', { count: pending })}</span>
        </div>
      )}
      {projects.length === 0 && <div className="nv-empty">{t('lib.empty')}</div>}
      <div className="nv-grid nv-proj-grid">
        {projects.map(p => (
          <ProjectTile key={p.root} t={t} row={p} cards={cards}
            onOpen={() => onOpenProject?.(p)}
            onRename={onRenameProject === undefined || isMiscRoot(p.root) ? undefined : () => { setRenameTarget(p) }}
            onRemove={onRemoveProject === undefined || isMiscRoot(p.root) ? undefined : () => { void onRemoveProject(p.root) }} />
        ))}
        {onRenameProject !== undefined && (
          <RenameProjectDialog t={t} row={renameTarget} onClose={() => { setRenameTarget(undefined) }} onRename={onRenameProject} />
        )}
        <button className="nv-newcard" onClick={onNewProject}>
          <span className="plus">+</span>
          {t('lib.newProject')}
        </button>
      </div>
    </div>
  )
}

/** The state the shared shell store carries for the project page. */
export interface ProjectRef { readonly sessionId?: SessionId; readonly root: string; readonly title: string }

interface ProjectProps {
  readonly t: ShellT
  /** The selected project; undefined renders an honest empty state. */
  readonly project: ProjectRef | undefined
  readonly useLibrary: SnapshotSelectorHook<LibraryPayload | undefined>
  readonly useCards: SnapshotSelectorHook<readonly CardRow[]>
  /** Apply one manifest op and refresh. */
  readonly op: (addr: ProjectAddr, op: LibraryOp, baseRevision?: number) => Promise<void>
  /** Read one workspace text file for preview/compare. */
  readonly readText: (addr: ProjectAddr, path: string) => Promise<string>
  /** Display title of a session for the 来源 row. */
  readonly sessionTitle: (sessionId: SessionId) => string | undefined
  readonly onOpenCard: (cardId: string, addr: CardAddr) => void
  readonly onBack: () => void
}

const sourceLabel = (t: ShellT, source: { readonly type: string; readonly sessionId?: string }, sessionTitle: (id: SessionId) => string | undefined): string => {
  if (source.type !== 'session' || source.sessionId === undefined) return t('lib.source.manual')
  const title = sessionTitle(source.sessionId as SessionId)
  return title === undefined ? t('lib.source.session') : fmt(t, 'lib.source.named', { title })
}

function WorkTile({ t, root, work, onOpen }: { readonly t: ShellT; readonly root: string; readonly work: LibraryWork; readonly onOpen: () => void }) {
  const cover = work.cover?.path ?? (IMAGE_KINDS.has(work.kind) ? work.primary.path : undefined)
  const versions = work.revisions.length + 1
  return (
    <button className="nv-card nv-work" onClick={onOpen}>
      <span className="nv-work-cover">
        {cover !== undefined && IMAGE_KINDS.has(work.kind)
          ? <img src={fileUrl(root, cover)} alt="" loading="lazy" />
          : <span className="ph">{kindLabel(t, work.kind)}</span>}
        <span className="nv-badge-cover">{kindLabel(t, work.kind)}</span>
        {versions > 1 && <span className="nv-badge-enter">{fmt(t, 'lib.work.versions', { count: versions })}</span>}
      </span>
      <span className="nv-work-body">
        <span className="nv-ccard-title">{work.title}</span>
        <span className="nv-work-meta">
          <span className="nv-stage" data-stage={work.stage}>{stageLabel(t, work.stage)}</span>
          {work.archived && <span className="nv-tag">{t('lib.work.archived')}</span>}
        </span>
      </span>
    </button>
  )
}

function CardLibraryTile({ t, card, meta, onOpen }: { readonly t: ShellT; readonly card: CardRow; readonly meta: { readonly stage: WorkStage; readonly archived: boolean } | undefined; readonly onOpen: () => void }) {
  const cover = card.coverRef === undefined || card.workspaceRoot === ''
    ? undefined
    : cardContentUrl(card.workspaceRoot, card.dir, card.coverRef)
  return (
    <button className="nv-card nv-work" onClick={onOpen}>
      <span className="nv-work-cover">
        {cover !== undefined ? <img src={cover} alt="" loading="lazy" /> : <span className="ph">{card.kind === 'CHARACTER' ? t('card.kind.character') : t('card.kind.world')}</span>}
        <span className="nv-badge-cover">{card.kind === 'CHARACTER' ? t('card.kind.character') : t('card.kind.world')}</span>
      </span>
      <span className="nv-work-body">
        <span className="nv-ccard-title">{card.name}</span>
        <span className="nv-work-meta">
          <span className="nv-tag">{fmt(t, 'lib.card.revisions', { count: card.revision })}</span>
          {meta !== undefined && <span className="nv-stage" data-stage={meta.stage}>{stageLabel(t, meta.stage)}</span>}
          {meta?.archived === true && <span className="nv-tag">{t('lib.work.archived')}</span>}
        </span>
      </span>
    </button>
  )
}

function WorkDrawer({
  t, project, work, payload, cards, op, readText, sessionTitle, onOpenCard, onClose,
}: {
  readonly t: ShellT
  readonly project: ProjectRef
  readonly work: LibraryWork
  readonly payload: LibraryPayload
  readonly cards: readonly CardRow[]
  readonly op: ProjectProps['op']
  readonly readText: ProjectProps['readText']
  readonly sessionTitle: ProjectProps['sessionTitle']
  readonly onOpenCard: ProjectProps['onOpenCard']
  readonly onClose: () => void
}) {
  const [text, setText] = useState<string | undefined>(undefined)
  const [busy, setBusy] = useState(false)
  const isText = work.kind === 'text' || work.kind === 'other'
  useEffect(() => {
    setText(undefined)
    if (isText) {
      void readText(project, work.primary.path).then(setText)
    }
  }, [work.id, work.primary.path, isText, project.sessionId, project.root, readText])
  const run = async (opArgs: LibraryOp) => {
    setBusy(true)
    try {
      await op(project, opArgs, payload.revision)
    } finally {
      setBusy(false)
    }
  }
  const linked = work.cardIds
    .map(id => cards.find(c => c.cardId === id && c.workspaceRoot === project.root))
    .filter((c): c is CardRow => c !== undefined)
  return (
    <div className="nv-wdrawer">
      <div className="nv-wdrawer-head">
        <strong>{work.title}</strong>
        <span className="nv-tag">{kindLabel(t, work.kind)}</span>
        <span className="nv-stage" data-stage={work.stage}>{stageLabel(t, work.stage)}</span>
        <button className="nv-landing-close" onClick={onClose}>×</button>
      </div>
      <div className="nv-wdrawer-scroll">
        <div className="nv-wdrawer-preview">
          {IMAGE_KINDS.has(work.kind) && <img src={fileUrl(project.root, work.primary.path)} alt="" />}
          {isText && <div className="nv-wdrawer-text">{text === undefined ? t('lib.work.loading') : text}</div>}
          {!IMAGE_KINDS.has(work.kind) && !isText && <div className="nv-empty">{work.primary.path}</div>}
        </div>
        <div className="nv-wdrawer-side">
          <h4>{t('lib.work.revisions')}</h4>
          <div className="nv-rev" data-current="true">
            <strong>{t('lib.work.current')}</strong>
            <small>{work.primary.path}</small>
            <small>{shortTime(work.updatedAt)} · {sourceLabel(t, work.source, sessionTitle)}</small>
          </div>
          {work.revisions.map((r, i) => (
            <div className="nv-rev" key={`${r.ref.path}-${i}`}>
              <strong>{r.label}</strong>
              <small>{r.ref.path}</small>
              <small>{shortTime(r.at)} · {sourceLabel(t, r.source, sessionTitle)}</small>
              <button className="nv-link" disabled={busy}
                onClick={() => { void run({ op: 'set-primary', workId: work.id, revisionIndex: i }) }}>
                {t('lib.work.setPrimary')}
              </button>
            </div>
          ))}
          {linked.length > 0 && (
            <>
              <h4>{t('lib.work.linked')}</h4>
              <div className="nv-wdrawer-links">
                {linked.map(c => (
                  <button key={c.cardId} className="nv-tag" onClick={() => onOpenCard(c.cardId, { sessionId: c.sessionId, root: c.workspaceRoot })}>{c.name}</button>
                ))}
              </div>
            </>
          )}
          <h4>{t('lib.work.source')}</h4>
          <div className="nv-rev-src">{sourceLabel(t, work.source, sessionTitle)} · {shortTime(work.createdAt)}</div>
        </div>
      </div>
      <div className="nv-wdrawer-foot">
        <button className="nv-btn-ghost" disabled title={t('lib.work.publishSoon')}>{t('lib.work.publish')}</button>
        <button className="nv-btn-ghost" disabled={busy}
          onClick={() => { void run({ op: 'archive', workId: work.id, archived: !work.archived }) }}>
          {work.archived ? t('lib.work.unarchive') : t('lib.work.archive')}
        </button>
        <button className="nv-btn-ghost nv-danger" disabled={busy}
          onClick={() => { void run({ op: 'unregister', workId: work.id }).then(onClose) }}>
          {t('lib.work.remove')}
        </button>
      </div>
    </div>
  )
}

function InboxRow({ t, item, busy, onClaim, onIgnore }: {
  readonly t: ShellT
  readonly item: InboxItem
  readonly busy: boolean
  readonly onClaim: () => void
  readonly onIgnore: () => void
}) {
  return (
    <div className="nv-recent-row">
      <span className="nv-recent-ic">{kindLabel(t, item.kind).slice(0, 1)}</span>
      <div className="nv-recent-body">
        <strong>{item.path.split('/').pop()}</strong>
        <small>{item.path}</small>
      </div>
      <button className="nv-link" disabled={busy} onClick={onClaim}>{t('lib.inbox.claim')}</button>
      <button className="nv-link" disabled={busy} onClick={onIgnore}>{t('lib.inbox.ignore')}</button>
    </div>
  )
}

/** One project's inner page: kind sections, stage filters, the inbox, and the work drawer. */
export function ProjectPage({ t, project, useLibrary, useCards, op, readText, sessionTitle, onOpenCard, onBack }: ProjectProps) {
  const payload = useLibrary(state => state)
  const allCards = useCards(state => state)
  const [kindTab, setKindTab] = useState<'all' | WorkKind>('all')
  const [stage, setStage] = useState<'all' | WorkStage>('all')
  const [showArchived, setShowArchived] = useState(false)
  const [open, setOpen] = useState<string | undefined>(undefined)
  const [busy, setBusy] = useState(false)

  const cards = useMemo(() => allCards.filter(c => c.workspaceRoot === project?.root), [allCards, project?.root])
  if (project === undefined) {
    return <div className="nv-page"><div className="nv-empty">{t('lib.noProject')}</div></div>
  }
  if (payload === undefined) {
    return <div className="nv-page"><div className="nv-empty">{t('lib.work.loading')}</div></div>
  }

  const works = payload.works.filter(w => (showArchived || !w.archived) && (stage === 'all' || w.stage === stage))
  const visibleCards = cards.filter(c => {
    const meta = payload.cardMeta[c.cardId]
    return meta?.archived !== true || showArchived
  })
  const openWork = open === undefined ? undefined : payload.works.find(w => w.id === open)
  const kindsInProject = KIND_ORDER.filter(k => k !== 'card' && works.some(w => w.kind === k))
  const sections: { kind: WorkKind; rows: LibraryWork[] }[] = (kindTab === 'all'
    ? kindsInProject.map(k => ({ kind: k, rows: works.filter(w => w.kind === k) }))
    : [{ kind: kindTab, rows: works.filter(w => w.kind === kindTab) }]
  ).filter(s => s.rows.length > 0)
  const run = async (opArgs: LibraryOp) => {
    setBusy(true)
    try {
      await op(project, opArgs, payload.revision)
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="nv-page nv-projpage">
      <div className="nv-inner">
        <div className="nv-projhead">
          <button className="nv-iconbtn" onClick={onBack}>‹</button>
          <div className="nv-projhead-cover">
            {payload.works.find(w => IMAGE_KINDS.has(w.kind)) !== undefined
              ? <img src={fileUrl(project.root, (payload.works.find(w => IMAGE_KINDS.has(w.kind)) as LibraryWork).primary.path)} alt="" />
              : <span>{project.title.slice(0, 1)}</span>}
          </div>
          <div>
            <div className="nv-h1">{payload.project?.title ?? project.title}</div>
            <div className="nv-sub">{fmt(t, 'lib.project.meta', { cards: cards.length, works: payload.works.length })}</div>
          </div>
        </div>

        <div className="nv-me-bar">
          <div className="nv-me-tabs nv-kindtabs">
            <button className="nv-me-tab" data-active={kindTab === 'all'} onClick={() => setKindTab('all')}>{t('home.filter.all')}</button>
            {(['card', ...kindsInProject] as WorkKind[]).map(k => (
              <button key={k} className="nv-me-tab" data-active={kindTab === k} onClick={() => setKindTab(k)}>{kindLabel(t, k)}</button>
            ))}
          </div>
          <div className="nv-stagechips">
            <span className="nv-stagelabel">{t('lib.stage.label')}</span>
            <button className="nv-pill" data-active={stage === 'all'} onClick={() => setStage('all')}>{t('home.filter.all')}</button>
            {STAGES.map(s => (
              <button key={s} className="nv-pill" data-active={stage === s} onClick={() => setStage(s)}>{stageLabel(t, s)}</button>
            ))}
            <label className="nv-archive-toggle">
              <input type="checkbox" checked={showArchived} onChange={e => setShowArchived(e.target.checked)} />
              {t('lib.showArchived')}
            </label>
          </div>
        </div>

        {(kindTab === 'all' || kindTab === 'card') && visibleCards.length > 0 && (
          <section>
            <div className="nv-section-head"><h4 className="nv-lib-h">{fmt(t, 'lib.section', { kind: kindLabel(t, 'card'), count: visibleCards.length })}</h4></div>
            <div className="nv-grid nv-work-grid">
              {visibleCards.map(c => (
                <CardLibraryTile key={c.cardId} t={t} card={c} meta={payload.cardMeta[c.cardId]}
                  onOpen={() => onOpenCard(c.cardId, { sessionId: c.sessionId, root: c.workspaceRoot })} />
              ))}
            </div>
          </section>
        )}
        {sections.map(section => (
          <section key={section.kind}>
            <div className="nv-section-head"><h4 className="nv-lib-h">{fmt(t, 'lib.section', { kind: kindLabel(t, section.kind), count: section.rows.length })}</h4></div>
            <div className="nv-grid nv-work-grid">
              {section.rows.map(w => (
                <WorkTile key={w.id} t={t} root={project.root} work={w} onOpen={() => setOpen(w.id)} />
              ))}
            </div>
          </section>
        ))}
        {sections.length === 0 && (kindTab !== 'all' && kindTab !== 'card' || visibleCards.length === 0) && (
          <div className="nv-empty">{t('lib.project.empty')}</div>
        )}

        {payload.inbox.length > 0 && (
          <section>
            <div className="nv-section-head"><h4 className="nv-lib-h">{fmt(t, 'lib.inbox.title', { count: payload.inbox.length })}</h4></div>
            <div className="nv-card nv-recent">
              {payload.inbox.map(item => (
                <InboxRow key={item.path} t={t} item={item} busy={busy}
                  onClaim={() => { void run({ op: 'register', path: item.path }) }}
                  onIgnore={() => { void run({ op: 'ignore', path: item.path }) }} />
              ))}
            </div>
          </section>
        )}
      </div>

      {openWork !== undefined && (
        <WorkDrawer t={t} project={project} work={openWork} payload={payload} cards={cards}
          op={op} readText={readText} sessionTitle={sessionTitle} onOpenCard={onOpenCard}
          onClose={() => setOpen(undefined)} />
      )}
    </div>
  )
}
