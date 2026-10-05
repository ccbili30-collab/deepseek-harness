/**
 * 我的 — the creator profile page: editable profile header (name / bio / avatar
 * persist locally until an account backend exists), the 世界/角色/创作库/作品
 * tab row, and the card grid in slot form — pure tiles with captions in the
 * page air, a dashed create tile trailing the grid. The 创作库 section shows
 * an honest empty state until workbench and output listings get a client read
 * path.
 * @module noven-shell/client/pages/Me
 */
import { useEffect, useRef, useState } from 'react'
import { Modal } from '@deepseek-ai/dsh-client-ui-primitives'
import type { ShellT } from './Home.tsx'
import type { NovenShellLocaleKey } from '../locales.ts'
import type { MainPanelId } from '@deepseek-ai/dsh-client-ui-layout/client'
import type { SnapshotSelectorHook } from '@deepseek-ai/dsh-client-ui-slots'
import type { CardRow, MeTab } from '../index.tsx'
import type { ProjectAddr, ProjectRow } from '../library-api.ts'
import type { CardAddr } from '../card-api.ts'
import { glyph } from '../icons.tsx'
import { cardContentUrl } from '../card-api.ts'
import { dissolveElement } from '../dissolve.ts'
import { ExcerptTile } from '../cardtile.tsx'
import { CardPick, type CardKind } from './CardPick.tsx'
import { LibraryOverview } from './Library.tsx'
import { AVATARS, getProfile, onProfileChange, profileAvatarUrl, setProfile, type Profile } from '../profile.ts'

interface Props {
  readonly t: ShellT
  readonly useCards: SnapshotSelectorHook<readonly CardRow[]>
  readonly useProjects: SnapshotSelectorHook<readonly ProjectRow[]>
  readonly useStore: SnapshotSelectorHook<{ meTab: MeTab }>
  /** Switch the catalog tab — shared state, other pages can aim it. */
  readonly onTab: (tab: MeTab) => void
  /** Navigate to the card editor main panel. */
  readonly onOpenCard?: (id: string, addr: CardAddr) => void
  /** Navigate to a main panel by id (新建 tiles open the creation surface). */
  readonly onOpenPanel?: (id: MainPanelId) => void
  /** Open one project workspace's creative library. */
  readonly onOpenProject?: (row: ProjectRow) => void
  /** 新建文件夹 flow: create `title` under a picked parent, register + workspace. */
  readonly onCreateProject?: (title: string) => Promise<void>
  /** 从 Finder 选择 flow: register a picked directory as project + workspace. */
  readonly onPickProject?: () => Promise<void>
  /** 移出创作库: drop the registry pointer; the on-disk directory is untouched. */
  readonly onRemoveProject?: (root: string) => Promise<void>
  /** 重命名: project.json.title + the matching Workspace title, one name everywhere. */
  readonly onRenameProject?: (root: string, title: string) => Promise<void>
  /** Create a durable card of the kind, then open it in the editor. */
  readonly onNewCard?: (kind: 'world' | 'character', name: string) => void
  /** Import a card package file into the workspace, then open it in the editor. */
  readonly onImportCard?: (file: File) => void
  /** Tile-menu actions on catalog cards. */
  readonly onExportCard?: (addr: CardAddr, cardId: string, name: string) => Promise<void>
  readonly onDeleteCard?: (addr: CardAddr, cardId: string) => Promise<void>
  /** Relocate a card to another project workspace. */
  readonly onMoveCard?: (addr: CardAddr, cardId: string, target: ProjectAddr) => Promise<void>
}

const fmt = (t: ShellT, key: NovenShellLocaleKey, vars: Record<string, string | number>): string =>
  Object.entries(vars).reduce((s, [k, v]) => s.replace(`{${k}}`, String(v)), t(key))

/** The card tile's ⋯ menu: export downloads the exchange package; move relocates the whole card to another project; delete arms on first press. */
function CardMenu({ t, targets, onExport, onMove, onDelete }: {
  readonly t: ShellT
  readonly targets: readonly ProjectRow[]
  readonly onExport: () => void
  readonly onMove: (target: ProjectRow) => void
  readonly onDelete: () => void
}) {
  const [open, setOpen] = useState(false)
  const [armed, setArmed] = useState(false)
  const [picking, setPicking] = useState(false)
  const close = (): void => { setOpen(false); setArmed(false); setPicking(false) }
  return (
    <span className="nv-cardmenu" onClick={e => e.stopPropagation()}>
      <button className="nv-cardmenu-dot" aria-label={t('me.card.menu')} onClick={() => setOpen(v => !v)}>⋯</button>
      {open && (
        <>
          <span className="nv-cardmenu-mask" onClick={close} />
          <span className="nv-cardmenu-pop" role="menu">
            {picking ? (
              <>
                <button role="menuitem" onClick={() => { setPicking(false) }}>← {t('me.card.move')}</button>
                {targets.length === 0
                  ? <button role="menuitem" disabled>{t('me.card.moveNone')}</button>
                  : targets.map(p => (
                    <button role="menuitem" key={p.root} onClick={() => { close(); onMove(p) }}>{p.title}</button>
                  ))}
              </>
            ) : (
              <>
                <button role="menuitem" onClick={() => { close(); onExport() }}>{t('me.card.export')}</button>
                <button role="menuitem" onClick={() => { setPicking(true) }}>{t('me.card.move')}</button>
                <button role="menuitem" data-armed={armed || undefined} onClick={() => { if (!armed) { setArmed(true); return } close(); onDelete() }}>
                  {armed ? t('me.card.deleteConfirm') : t('me.card.delete')}
                </button>
              </>
            )}
          </span>
        </>
      )}
    </span>
  )
}

/** One card slot: artwork tile, or the card's content page when it has no cover. */
function CardSlot({ t, card, targets, onOpen, onExport, onMove, onDelete }: {
  readonly t: ShellT
  readonly card: CardRow
  readonly targets: readonly ProjectRow[]
  readonly onOpen: () => void
  readonly onExport: () => void
  readonly onMove: (target: ProjectRow) => void
  /** Resolves when the card is gone; a rejection restores the tile. */
  readonly onDelete: () => Promise<void> | void
}) {
  const [leaving, setLeaving] = useState(false)
  const [collapse, setCollapse] = useState(false)
  const slotRef = useRef<HTMLDivElement>(null)
  const startDelete = () => {
    if (leaving) return
    setLeaving(true)
    // The erosion edge turns the face into particles; the column collapses
    // underneath the last sparks, then the real delete fires.
    if (slotRef.current !== null) dissolveElement(slotRef.current, card.name)
    window.setTimeout(() => setCollapse(true), 520)
    window.setTimeout(() => {
      const p = onDelete()
      if (p !== undefined) void p.catch(() => {
        const el = slotRef.current
        if (el !== null) {
          el.style.visibility = ''; el.style.clipPath = ''
          el.style.transform = ''; el.style.filter = ''; el.style.transition = ''
        }
        setCollapse(false); setLeaving(false)
      })
    }, 860)
  }
  const cover = card.coverRef === undefined || card.workspaceRoot === ''
    ? undefined
    : cardContentUrl(card.workspaceRoot, card.dir, card.coverRef)
  const inner = card.excerpt !== undefined
    ? <ExcerptTile module={card.excerpt.module} text={card.excerpt.text} />
    : <span className="nv-slot-ph">{card.kind === 'CHARACTER' ? glyph.user(26) : glyph.planet(26)}</span>
  const open = onOpen
  return (
    <div ref={slotRef} className="nv-slot" data-leaving={leaving || undefined} data-collapse={collapse || undefined}>
      <button className={`nv-slot-tile${cover === undefined && card.excerpt === undefined ? ' nv-slot-coverless' : ''}`} onClick={open}>
        {cover !== undefined ? <img src={cover} alt="" /> : inner}
        {card.hasDraft && <span className="nv-slot-badge">{t('me.draft')}</span>}
      </button>
      <div className="nv-slot-cap-row">
        <button className="nv-slot-cap nv-slot-cap-btn" onClick={open}>
          <strong>{card.name}</strong>
          <small>{fmt(t, 'me.card.meta', { modules: card.modules, revision: card.revision })}</small>
        </button>
        <CardMenu t={t} targets={targets} onExport={onExport} onMove={onMove} onDelete={startDelete} />
      </div>
    </div>
  )
}

/** Click-to-edit text field used by the profile header. */
function Editable({ value, placeholder, className, hint, onCommit }: {
  readonly value: string
  readonly placeholder?: string
  readonly className?: string
  readonly hint?: string
  readonly onCommit: (next: string) => void
}) {
  const [editing, setEditing] = useState(false)
  const [v, setV] = useState(value)
  if (!editing) {
    return (
      <span className={`nv-editable ${className ?? ''}`} title={hint} role="button" tabIndex={0}
        onClick={() => { setV(value); setEditing(true) }}
        onKeyDown={e => { if (e.key === 'Enter') { setV(value); setEditing(true) } }}>
        {value === '' ? <span className="nv-editable-ph">{placeholder}</span> : value}
      </span>
    )
  }
  return (
    <input
      className={`nv-editable-input ${className ?? ''}`} value={v} autoFocus
      onChange={e => { setV(e.target.value) }}
      onBlur={() => { setEditing(false); const next = v.trim(); if (next !== value) onCommit(next) }}
      onKeyDown={e => {
        if (e.key === 'Enter') { e.currentTarget.blur() }
        if (e.key === 'Escape') { setV(value); setEditing(false) }
      }}
    />
  )
}

/** The profile edit dialog: avatar preset picker + name + bio, committed as one save. */
function ProfileDialog({ t, open, profile, onClose }: {
  readonly t: ShellT
  readonly open: boolean
  readonly profile: Profile
  readonly onClose: () => void
}) {
  const [name, setName] = useState(profile.name)
  const [bio, setBio] = useState(profile.bio)
  const [avatar, setAvatar] = useState(profile.avatar)
  useEffect(() => {
    if (open) { setName(profile.name); setBio(profile.bio); setAvatar(profile.avatar) }
    // Reopen always reseeds the drafts from the stored profile.
  }, [open]) // eslint-disable-line react-hooks/exhaustive-deps
  const save = () => {
    setProfile({ name: name.trim() === '' ? profile.name : name.trim(), bio: bio.trim(), avatar })
    onClose()
  }
  return (
    <Modal open={open} onClose={onClose} title={t('me.profile.dialog.title')} closeLabel={t('me.profile.close')}
      footer={(
        <>
          <button className="nv-btn-ghost" onClick={onClose}>{t('me.profile.cancel')}</button>
          <button className="nv-btn-primary" onClick={save}>{t('editor.save')}</button>
        </>
      )}>
      <div className="nv-profedit">
        <div className="nv-profedit-field">
          <span className="nv-profedit-label">{t('me.profile.avatar')}</span>
          <div className="nv-profedit-avatars">
            {AVATARS.map(a => (
              <button key={a} className="nv-profedit-avatar" data-active={a === avatar || undefined}
                onClick={() => { setAvatar(a) }}>
                <img src={profileAvatarUrl({ ...profile, avatar: a })} alt="" />
              </button>
            ))}
          </div>
        </div>
        <div className="nv-profedit-field">
          <span className="nv-profedit-label">{t('me.profile.name')}</span>
          <input className="nv-profedit-input" value={name} data-modal-autofocus
            onChange={e => { setName(e.target.value) }} />
        </div>
        <div className="nv-profedit-field">
          <span className="nv-profedit-label">{t('me.profile.bio')}</span>
          <textarea className="nv-profedit-input nv-profedit-area" rows={3} value={bio}
            placeholder={t('me.bio')} onChange={e => { setBio(e.target.value) }} />
        </div>
      </div>
    </Modal>
  )
}

/** 新建项目 dialog: two entries — 新建文件夹 names a fresh directory, 从 Finder 选择 registers an existing one. */
function ProjectDialog({ t, open, onClose, onCreate, onPick }: {
  readonly t: ShellT
  readonly open: boolean
  readonly onClose: () => void
  readonly onCreate: (title: string) => Promise<void>
  readonly onPick: () => Promise<void>
}) {
  const [title, setTitle] = useState('')
  const [busy, setBusy] = useState(false)
  useEffect(() => { if (open) { setTitle(''); setBusy(false) } }, [open])
  const run = (job: () => Promise<void>) => {
    setBusy(true)
    void job().catch(() => { /* picker errors surface in the shell */ }).finally(() => { setBusy(false); onClose() })
  }
  return (
    <Modal open={open} onClose={onClose} title={t('me.project.dialog.title')} closeLabel={t('me.profile.close')}>
      <div className="nv-profedit">
        <div className="nv-profedit-field">
          <span className="nv-profedit-label">{t('me.project.dialog.name')}</span>
          <input className="nv-profedit-input" value={title} data-modal-autofocus
            placeholder={t('me.project.dialog.nameHint')}
            onChange={e => { setTitle(e.target.value) }} />
        </div>
        <div className="nv-profedit-field nv-projdlg-actions">
          <button className="nv-btn-primary" disabled={busy || title.trim() === ''}
            onClick={() => { run(() => onCreate(title.trim())) }}>{t('me.project.dialog.create')}</button>
          <button className="nv-btn-ghost" disabled={busy}
            onClick={() => { run(onPick) }}>{t('me.project.dialog.pick')}</button>
        </div>
      </div>
    </Modal>
  )
}

export function Me({ t, useCards, useProjects, useStore, onTab, onOpenCard, onOpenPanel, onOpenProject, onCreateProject, onPickProject, onRemoveProject, onRenameProject, onNewCard, onImportCard, onExportCard, onDeleteCard, onMoveCard }: Props) {
  const tab = useStore(s => s.meTab)
  const setTab = onTab
  const [dialogOpen, setDialogOpen] = useState(false)
  const [projectDlg, setProjectDlg] = useState(false)
  const [pick, setPick] = useState<CardKind | null>(null)
  const [notice, setNotice] = useState<string | undefined>(undefined)
  useEffect(() => {
    if (notice === undefined) return
    const timer = setTimeout(() => setNotice(undefined), 5000)
    return () => clearTimeout(timer)
  }, [notice])
  const [profile, setLocal] = useState(getProfile)
  useEffect(() => onProfileChange(() => { setLocal(getProfile()) }), [])
  const cards = useCards(state => state)
  const projects = useProjects(state => state)

  const tabs = [
    { id: 'worlds', label: t('me.tab.worlds') },
    { id: 'characters', label: t('me.tab.characters') },
    { id: 'library', label: t('me.tab.library') },
    { id: 'works', label: t('me.tab.works') },
  ] as const
  const kind = tab === 'worlds' ? 'WORLD' : 'CHARACTER'
  const shown = cards.filter(c => c.kind === kind)

  const createKind = () => { setPick(kind === 'WORLD' ? 'world' : 'character') }

  return (
    <div className="nv-page">
      <div className="nv-inner">
        <div className="nv-profile">
          <button className="nv-profile-avatar" title={t('me.profile.avatarHint')}
            onClick={() => { setProfile({ avatar: AVATARS[(AVATARS.indexOf(profile.avatar) + 1) % AVATARS.length] }) }}>
            <img src={profileAvatarUrl(profile)} alt="" />
          </button>
          <div style={{ flex: 1, minWidth: 0 }}>
            <Editable className="nv-profile-name" value={profile.name}
              hint={t('me.profile.editHint')} onCommit={name => { if (name !== '') setProfile({ name }) }} />
            <Editable className="nv-profile-bio" value={profile.bio} placeholder={t('me.bio')}
              hint={t('me.profile.editHint')} onCommit={bio => { setProfile({ bio }) }} />
            <div className="nv-profile-mark">{t('me.mark')}</div>
          </div>
          <div className="nv-profile-actions">
            <button className="nv-btn-ghost" onClick={() => { setDialogOpen(true) }}>{t('me.profile.edit')}</button>
          </div>
        </div>
        <ProfileDialog t={t} open={dialogOpen} profile={profile} onClose={() => { setDialogOpen(false) }} />
        <ProjectDialog t={t} open={projectDlg} onClose={() => { setProjectDlg(false) }}
          onCreate={title => (onCreateProject ?? (() => Promise.resolve()))(title)}
          onPick={() => (onPickProject ?? (() => Promise.resolve()))()} />

        <div className="nv-me-bar">
          <div className="nv-me-tabs">
            {tabs.map(tb => (
              <button key={tb.id} className="nv-me-tab" data-active={tab === tb.id} onClick={() => setTab(tb.id)}>{tb.label}</button>
            ))}
          </div>
        </div>

        {tab === 'library' ? (
          <LibraryOverview t={t} useProjects={useProjects} useCards={useCards}
            onOpenProject={onOpenProject} onNewProject={() => { setProjectDlg(true) }} onRemoveProject={onRemoveProject} onRenameProject={onRenameProject} />
        ) : tab === 'works' ? (
          <div className="nv-empty">
            <div>{t('me.worksEmpty')}</div>
            <button className="nv-btn-primary" onClick={() => { setTab('library') }}>{t('me.worksGoLibrary')}</button>
          </div>
        ) : (
          <div className="nv-slots nv-slots-wrap">
            {shown.map(c => (
              <CardSlot key={c.cardId} t={t} card={c}
                targets={projects.filter(p => p.root !== c.workspaceRoot)}
                onOpen={() => { onOpenCard?.(c.cardId, { sessionId: c.sessionId, root: c.workspaceRoot }) }}
                onExport={() => { void onExportCard?.({ sessionId: c.sessionId, root: c.workspaceRoot }, c.cardId, c.name).catch(err => setNotice(String(err instanceof Error ? err.message : err))) }}
                onMove={target => { void onMoveCard?.({ sessionId: c.sessionId, root: c.workspaceRoot }, c.cardId, { sessionId: target.sessionId, root: target.root }).catch(err => setNotice(String(err instanceof Error ? err.message : err))) }}
                onDelete={() => onDeleteCard?.({ sessionId: c.sessionId, root: c.workspaceRoot }, c.cardId).catch(err => { setNotice(String(err instanceof Error ? err.message : err)); throw err })} />
            ))}
            <button className="nv-slot" onClick={createKind}>
              <span className="nv-slot-tile nv-slot-empty">
                <span className="nv-slot-plus">{glyph.plus(26)}</span>
              </span>
              <span className="nv-slot-cap">
                <strong>{tab === 'worlds' ? t('me.newWorldTile') : t('me.newCharTile')}</strong>
              </span>
            </button>
            {shown.length === 0 && (
              <div className="nv-card" style={{ padding: '28px 24px', color: 'var(--nv-secondary-text)', fontSize: 13 }}>
                {tab === 'worlds' ? t('me.worldsEmpty') : t('me.charsEmpty')}
              </div>
            )}
          </div>
        )}
      </div>

      {notice !== undefined && <div className="nv-me-notice">{notice}</div>}
      {pick !== null && (
        <CardPick t={t} kind={pick}
          defaultName={pick === 'world'
            ? `${t('create.pick.name.default.world')} ${cards.filter(c => c.kind === 'WORLD').length + 1}`
            : `${t('create.pick.name.default.character')} ${cards.filter(c => c.kind === 'CHARACTER').length + 1}`}
          onClose={() => setPick(null)}
          onCreate={name => { setPick(null); onNewCard?.(pick, name) }}
          onImport={file => { setPick(null); onImportCard?.(file) }} />
      )}
    </div>
  )
}
