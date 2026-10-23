/**
 * 我的 — three parallel interfaces: 展览 (profile + horizontal world tape +
 * character waterfall), 创作库 (the sidebar-folder shelf and its cards), and
 * 作品 (non-card artifacts). The sidebar's working folders remain the single
 * library membership source.
 * @module noven-shell/client/pages/MeHome
 */
import { Fragment, useCallback, useEffect, useRef, useState, type ReactNode } from 'react'
import { Modal } from '@deepseek-ai/dsh-client-ui-primitives'
import type { SessionId } from '@deepseek-ai/dsh-session/types'
import type { WorkspaceId, WorkspaceSnapshot, WorkspaceView } from '@deepseek-ai/dsh-api-workspace-controller/client'
import type { SnapshotSelectorHook } from '@deepseek-ai/dsh-client-ui-slots'
import type { ShellT } from './Home.tsx'
import type { NovenShellLocaleKey } from '../locales.ts'
import type { CardRow, MeView } from '../index.tsx'
import type { CardAddr } from '../card-api.ts'
import type { ProjectAddr, ProjectRow } from '../library-api.ts'
import { isMiscRoot } from '../library-api.ts'
import { cardContentUrl } from '../card-api.ts'
import { dissolveElement } from '../dissolve.ts'
import { ExcerptTile } from '../cardtile.tsx'
import { glyph } from '../icons.tsx'
import { CardPick, type CardKind } from './CardPick.tsx'
import { MeWorks } from './MeWorks.tsx'
import { getProfile, onProfileChange, profileAvatarUrl, readAvatarFile, setProfile, type Profile } from '../profile.ts'
import { useRetainedScroll } from '../ui/retain.ts'
import { fmt } from './Home.tsx'

/** Shared focus request: the sidebar asks the page to reveal one library. */
export interface LibraryFocus {
  readonly root: string
  readonly token: number
}

/** A card can move to any other sidebar folder. */
interface MoveTarget {
  readonly root: string
  readonly title: string
  readonly sessionId?: SessionId
}

interface PickTarget {
  readonly kind: CardKind
  readonly workspaceId?: WorkspaceId
  readonly title: string
}

interface Props {
  readonly t: ShellT
  readonly useCards: SnapshotSelectorHook<readonly CardRow[]>
  readonly useProjects: SnapshotSelectorHook<readonly ProjectRow[]>
  readonly useCatalogReady: SnapshotSelectorHook<boolean>
  readonly useWorkspaces: SnapshotSelectorHook<WorkspaceSnapshot>
  readonly useStore: SnapshotSelectorHook<{ readonly libraryFocus: LibraryFocus | null; readonly meView: MeView }>
  readonly onOpenPreview: (cardId: string, addr: CardAddr) => void
  readonly onEditCard: (cardId: string, addr: CardAddr) => void
  readonly onSetView: (view: MeView) => void
  readonly onCreateProject: (title: string) => Promise<string | undefined>
  readonly onPickProject: () => Promise<string | undefined>
  readonly onRemoveProject: (root: string) => Promise<void>
  readonly onDeleteProject: (root: string) => Promise<void>
  readonly onRenameProject: (root: string, title: string) => Promise<void>
  readonly onNewCard: (kind: CardKind, name: string, workspaceId?: WorkspaceId) => void
  readonly onImportCard: (file: File, workspaceId?: WorkspaceId) => void
  readonly onExportCard: (addr: CardAddr, cardId: string, name: string) => Promise<void>
  readonly onDeleteCard: (addr: CardAddr, cardId: string, name: string) => Promise<void>
  readonly onMoveCard: (addr: CardAddr, cardId: string, target: ProjectAddr) => Promise<void>
}

const shortTime = (at: string | undefined): string => {
  if (at === undefined) return ''
  const date = new Date(at)
  return Number.isNaN(date.getTime()) ? '' : `${date.getMonth() + 1}/${date.getDate()}`
}

const coverUrl = (card: CardRow): string =>
  card.coverRef === undefined || card.workspaceRoot === ''
    ? ''
    : cardContentUrl(card.workspaceRoot, card.dir, card.coverRef)

const cardAddr = (card: CardRow): CardAddr => ({ sessionId: card.sessionId, root: card.workspaceRoot })

const isSystemWorkspace = (workspace: WorkspaceView, projects: readonly ProjectRow[]): boolean =>
  isMiscRoot(workspace.path) || projects.find(project => project.root === workspace.path)?.misc === true

const cardsOf = (cards: readonly CardRow[], root: string): readonly CardRow[] =>
  cards.filter(card => card.workspaceRoot === root)

const isWorld = (card: CardRow): boolean => card.kind === 'WORLD'
const isCharacter = (card: CardRow): boolean => card.kind === 'CHARACTER'

/** Click-to-edit text used by the profile header. */
function Editable({ value, placeholder, className, hint, onCommit }: {
  readonly value: string
  readonly placeholder?: string
  readonly className?: string
  readonly hint?: string
  readonly onCommit: (next: string) => void
}) {
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState(value)
  if (!editing) {
    return (
      <span className={`nv-editable ${className ?? ''}`} title={hint} role="button" tabIndex={0}
        onClick={() => { setDraft(value); setEditing(true) }}
        onKeyDown={event => { if (event.key === 'Enter') { setDraft(value); setEditing(true) } }}>
        {value === '' ? <span className="nv-editable-ph">{placeholder}</span> : value}
      </span>
    )
  }
  return (
    <input
      className={`nv-editable-input ${className ?? ''}`} value={draft} autoFocus
      onChange={event => { setDraft(event.target.value) }}
      onBlur={() => { setEditing(false); const next = draft.trim(); if (next !== value) onCommit(next) }}
      onKeyDown={event => {
        if (event.key === 'Enter') event.currentTarget.blur()
        if (event.key === 'Escape') { setDraft(value); setEditing(false) }
      }} />
  )
}

/** Local portrait + name + bio dialog. */
function ProfileDialog({ t, open, profile, onClose }: {
  readonly t: ShellT
  readonly open: boolean
  readonly profile: Profile
  readonly onClose: () => void
}) {
  const [name, setName] = useState(profile.name)
  const [bio, setBio] = useState(profile.bio)
  const [avatar, setAvatar] = useState(profile.avatar)
  const [reading, setReading] = useState(false)
  const fileRef = useRef<HTMLInputElement | null>(null)
  useEffect(() => {
    if (open) { setName(profile.name); setBio(profile.bio); setAvatar(profile.avatar); setReading(false) }
  }, [open])
  const pickAvatar = (file: File | undefined): void => {
    if (file === undefined) return
    setReading(true)
    void readAvatarFile(file)
      .then(dataUrl => { setAvatar(dataUrl) })
      .catch(() => { /* unreadable image: keep the current portrait */ })
      .finally(() => { setReading(false) })
  }
  const save = (): void => {
    setProfile({ name: name.trim(), bio: bio.trim(), avatar })
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
          <div className="nv-profedit-portraitrow">
            <button type="button" className="nv-profedit-portrait" disabled={reading}
              aria-label={t('me.profile.avatarUpload')} onClick={() => { fileRef.current?.click() }}>
              {avatar === ''
                ? <span className="nv-profedit-portrait-empty" aria-hidden="true" />
                : <img src={profileAvatarUrl({ ...profile, avatar })} alt="" />}
            </button>
            <div className="nv-profedit-portraitacts">
              <button type="button" className="nv-btn-ghost" disabled={reading}
                onClick={() => { fileRef.current?.click() }}>
                {reading ? t('me.profile.avatarReading') : t('me.profile.avatarUpload')}
              </button>
              {avatar !== '' && (
                <button type="button" className="nv-btn-ghost" onClick={() => { setAvatar('') }}>
                  {t('me.profile.avatarRemove')}
                </button>
              )}
            </div>
            <input ref={fileRef} type="file" accept="image/*" hidden
              onChange={event => {
                pickAvatar(event.target.files?.[0])
                event.currentTarget.value = ''
              }} />
          </div>
        </div>
        <div className="nv-profedit-field">
          <span className="nv-profedit-label">{t('me.profile.name')}</span>
          <input className="nv-profedit-input" value={name} data-modal-autofocus
            onChange={event => { setName(event.target.value) }} />
        </div>
        <div className="nv-profedit-field">
          <span className="nv-profedit-label">{t('me.profile.bio')}</span>
          <textarea className="nv-profedit-input nv-profedit-area" rows={3} value={bio}
            onChange={event => { setBio(event.target.value) }} />
        </div>
      </div>
    </Modal>
  )
}

/** New library: create a folder, or register an existing one. */
function ProjectDialog({ t, open, onClose, onCreate, onPick, onCreated }: {
  readonly t: ShellT
  readonly open: boolean
  readonly onClose: () => void
  readonly onCreate: (title: string) => Promise<string | undefined>
  readonly onPick: () => Promise<string | undefined>
  readonly onCreated: (root: string) => void
}) {
  const [title, setTitle] = useState('')
  const [busy, setBusy] = useState(false)
  useEffect(() => { if (open) { setTitle(''); setBusy(false) } }, [open])
  const run = (job: () => Promise<string | undefined>): void => {
    setBusy(true)
    void job()
      .then(root => { if (root !== undefined) onCreated(root) })
      .catch(() => { /* picker errors surface in the shell */ })
      .finally(() => { setBusy(false); onClose() })
  }
  return (
    <Modal open={open} onClose={onClose} title={t('me.project.dialog.title')} closeLabel={t('me.profile.close')}>
      <div className="nv-profedit">
        <div className="nv-profedit-field">
          <span className="nv-profedit-label">{t('me.project.dialog.name')}</span>
          <input className="nv-profedit-input" value={title} data-modal-autofocus
            placeholder={t('me.project.dialog.nameHint')}
            onChange={event => { setTitle(event.target.value) }} />
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

/** Rename one library; writes the Workspace title and the project metadata together. */
function RenameLibraryDialog({ t, target, onClose, onRename }: {
  readonly t: ShellT
  readonly target: WorkspaceView | undefined
  readonly onClose: () => void
  readonly onRename: (root: string, title: string) => Promise<void>
}) {
  const [title, setTitle] = useState('')
  const [busy, setBusy] = useState(false)
  useEffect(() => { setTitle(target?.title ?? ''); setBusy(false) }, [target])
  return (
    <Modal open={target !== undefined} onClose={onClose} title={t('me.home.renameTitle')} closeLabel={t('me.profile.close')}>
      <div className="nv-profedit">
        <div className="nv-profedit-field">
          <input className="nv-profedit-input" value={title} data-modal-autofocus
            onChange={event => { setTitle(event.target.value) }}
            onKeyDown={event => {
              if (event.key !== 'Enter' || target === undefined || title.trim() === '' || busy) return
              setBusy(true)
              void onRename(target.path, title.trim()).finally(() => { setBusy(false); onClose() })
            }} />
        </div>
        <div className="nv-profedit-field nv-projdlg-actions">
          <button className="nv-btn-primary" disabled={busy || target === undefined || title.trim() === ''}
            onClick={() => {
              if (target === undefined) return
              setBusy(true)
              void onRename(target.path, title.trim()).finally(() => { setBusy(false); onClose() })
            }}>{t('me.home.renameConfirm')}</button>
        </div>
      </div>
    </Modal>
  )
}

/** Destructive library confirmation; the folder goes to the system Trash. */
function DeleteLibraryDialog({ t, target, project, cards, onClose, onDelete }: {
  readonly t: ShellT
  readonly target: WorkspaceView | undefined
  readonly project: ProjectRow | undefined
  readonly cards: readonly CardRow[]
  readonly onClose: () => void
  readonly onDelete: (root: string) => Promise<void>
}) {
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | undefined>(undefined)
  useEffect(() => { setBusy(false); setError(undefined) }, [target])
  if (target === undefined) return null
  const libraryCards = cardsOf(cards, target.path)
  const worlds = libraryCards.filter(isWorld).length
  const chars = libraryCards.filter(isCharacter).length
  const works = (project?.works ?? 0) + (project?.pending ?? 0)
  const body = fmt(t, 'me.home.deleteBody', {
    worlds,
    chars,
    works: works > 0 ? fmt(t, 'me.home.deleteWorks', { works }) : '',
  })
  const note = fmt(t, 'me.home.deleteNote', { sessions: target.sessionIds.length })
  return (
    <Modal open onClose={busy ? () => {} : onClose} title={fmt(t, 'me.home.deleteTitle', { title: target.title })}
      closeLabel={t('me.profile.close')}
      footer={(
        <>
          <button className="nv-btn-ghost" disabled={busy} onClick={onClose}>{t('me.home.cancel')}</button>
          <button className="nv-btn-danger" disabled={busy}
            onClick={() => {
              setBusy(true)
              setError(undefined)
              void onDelete(target.path)
                .then(onClose)
                .catch((reason: unknown) => { setError(reason instanceof Error ? reason.message : String(reason)) })
                .finally(() => { setBusy(false) })
            }}>{t('me.home.deleteConfirm')}</button>
        </>
      )}>
      <div className="nv-me-deletecopy">
        <p>{body}</p>
        <p className="nv-me-deletenote">{note}</p>
        {error !== undefined && <p className="nv-me-deleteerror" role="alert">{error}</p>}
      </div>
    </Modal>
  )
}

/** One card menu: manage / export / move / delete, with a two-step delete. */
function CardMenu({ t, targets, onManage, onExport, onMove, onDelete }: {
  readonly t: ShellT
  readonly targets: readonly MoveTarget[]
  readonly onManage?: () => void
  readonly onExport: () => Promise<void> | void
  readonly onMove: (target: MoveTarget) => Promise<void> | void
  readonly onDelete: () => void
}) {
  const [picking, setPicking] = useState(false)
  const [armed, setArmed] = useState(false)
  const detailsRef = useRef<HTMLDetailsElement | null>(null)
  const close = (): void => {
    if (detailsRef.current !== null) detailsRef.current.open = false
    setPicking(false)
    setArmed(false)
  }
  return (
    <details className="nv-me-more" ref={detailsRef}>
      <summary aria-label={t('me.card.menu')}>⋯</summary>
      <div className="nv-me-menu" onClick={event => { event.stopPropagation() }}>
        {picking ? (
          <>
            <button type="button" className="nv-me-menuback" onClick={() => { setPicking(false) }}>← {t('me.card.move')}</button>
            {targets.length === 0
              ? <button type="button" disabled>{t('me.home.noOtherLibrary')}</button>
              : targets.map(target => (
                <button type="button" key={target.root} onClick={() => { close(); void onMove(target) }}>{target.title}</button>
              ))}
          </>
        ) : (
          <>
            {onManage !== undefined && (
              <button type="button" onClick={() => { close(); onManage() }}>{t('me.home.manage')}</button>
            )}
            <button type="button" onClick={() => { close(); void onExport() }}>{t('me.card.export')}</button>
            <button type="button" onClick={() => { setPicking(true) }}>{t('me.card.move')}</button>
            <button type="button" className="danger" data-armed={armed || undefined}
              onClick={() => {
                if (!armed) { setArmed(true); return }
                close()
                onDelete()
              }}>{armed ? t('me.card.deleteConfirm') : t('me.card.delete')}</button>
          </>
        )}
      </div>
    </details>
  )
}

/** One poster/tape/shelf card: flat cover, caption, edit shortcut and menu. */
function MeCard({ t, card, variant, targets, onOpen, onEdit, onManage, onExport, onMove, onDelete }: {
  readonly t: ShellT
  readonly card: CardRow
  readonly variant: 'poster' | 'shelf' | 'tape'
  readonly targets: readonly MoveTarget[]
  readonly onOpen: () => void
  readonly onEdit?: () => void
  readonly onManage?: () => void
  readonly onExport: () => Promise<void> | void
  readonly onMove: (target: MoveTarget) => Promise<void> | void
  readonly onDelete: () => Promise<void> | void
}) {
  const [leaving, setLeaving] = useState(false)
  const slotRef = useRef<HTMLDivElement | null>(null)
  const cover = coverUrl(card)
  const startDelete = (): void => {
    if (leaving) return
    setLeaving(true)
    const element = slotRef.current
    if (element !== null) dissolveElement(element, card.name)
    window.setTimeout(() => {
      const job = onDelete()
      if (job === undefined) return
      void job.catch(() => {
        if (element !== null) {
          element.style.visibility = ''
          element.style.clipPath = ''
          element.style.transform = ''
          element.style.filter = ''
          element.style.transition = ''
        }
        setLeaving(false)
      })
    }, 520)
  }
  return (
    <div ref={slotRef} className="nv-me-card" data-variant={variant} data-kind={card.kind}
      data-cover={cover !== '' ? 'image' : card.excerpt !== undefined ? 'excerpt' : 'flat'}
      data-leaving={leaving || undefined}>
      <button type="button" className="nv-me-card-hit" onClick={onOpen}
        aria-label={`${t('me.home.preview')}《${card.name}》`}>
        <span className="nv-me-cover">
          {cover !== ''
            ? <img className="nv-me-cover-img" src={cover} alt="" loading="lazy" />
            : card.excerpt !== undefined
              ? <ExcerptTile module={card.excerpt.module} text={card.excerpt.text} />
              : (
                <span className={`nv-me-ph nv-me-ph--${isCharacter(card) ? 'char' : 'world'}`} aria-hidden="true">
                  {isCharacter(card) ? glyph.user(30) : glyph.planet(30)}
                </span>
              )}
          {card.hasDraft && <span className="nv-me-draft">{t('me.draft')}</span>}
        </span>
        <span className="nv-me-cap">
          <span className="nv-me-cardname">{card.name}</span>
          {variant !== 'shelf' && card.excerpt !== undefined && <span className="nv-me-ex">{card.excerpt.text}</span>}
          <span className="nv-me-meta">{fmt(t, 'me.home.cardMeta', { modules: card.modules })}</span>
        </span>
      </button>
      <span className="nv-me-card-actions" onClick={event => { event.stopPropagation() }}>
        {onEdit !== undefined && (
          <button type="button" className="nv-me-icon" aria-label={t('me.home.edit')} onClick={onEdit}>✎</button>
        )}
        <CardMenu t={t} targets={targets} onManage={onManage} onExport={onExport} onMove={onMove} onDelete={startDelete} />
      </span>
    </div>
  )
}

/** A dashed create tile in the waterfall. */
function NewTile({ t, kind, onOpen }: { readonly t: ShellT; readonly kind: CardKind; readonly onOpen: () => void }) {
  return (
    <button type="button" className={`nv-me-newtile nv-me-newtile--${kind}`} onClick={onOpen}>
      <span className="nv-me-plus" aria-hidden="true">＋</span>
      <span>{kind === 'world' ? t('me.home.newWorld') : t('me.home.newCharacter')}</span>
    </button>
  )
}

/** One album-like library box; a collage of its first four cards, never a file folder. */
function LibraryMenu({ t, onRename, onRemove, onDelete }: {
  readonly t: ShellT
  readonly onRename: () => void
  readonly onRemove: () => void
  readonly onDelete: () => void
}) {
  const detailsRef = useRef<HTMLDetailsElement | null>(null)
  const close = (): void => { if (detailsRef.current !== null) detailsRef.current.open = false }
  return (
    <details className="nv-me-libmore" ref={detailsRef}>
      <summary aria-label={t('me.card.menu')}>⋯</summary>
      <div className="nv-me-menu" onClick={event => { event.stopPropagation() }}>
        <button type="button" onClick={() => { close(); onRename() }}>{t('me.home.renameLibrary')}</button>
        <button type="button" onClick={() => { close(); onRemove() }}>
          <span>{t('me.home.removeLibrary')}</span>
          <small>{t('me.home.removeHint')}</small>
        </button>
        <button type="button" className="danger" onClick={() => { close(); onDelete() }}>{t('me.home.deleteLibrary')}</button>
      </div>
    </details>
  )
}

function LibraryBox({ t, workspace, project, cards, system, active, onSelect, onRename, onRemove, onDelete }: {
  readonly t: ShellT
  readonly workspace: WorkspaceView
  readonly project: ProjectRow | undefined
  readonly cards: readonly CardRow[]
  readonly system: boolean
  readonly active: boolean
  readonly onSelect: () => void
  readonly onRename: () => void
  readonly onRemove: () => void
  readonly onDelete: () => void
}) {
  const worlds = cards.filter(isWorld).length
  const chars = cards.filter(isCharacter).length
  const minis = cards.slice(0, 4)
  const empties = Array.from({ length: Math.max(0, 4 - minis.length) })
  const updated = shortTime(project?.updatedAt ?? workspace.updatedAt)
  return (
    <div className={`nv-me-libbox${active ? ' is-active' : ''}${system ? ' is-system' : ''}`}
      data-missing={project?.missing || undefined}>
      <button type="button" className="nv-me-libbox-hit" onClick={onSelect}>
        <span className="nv-me-collage">
          {minis.map(card => {
            const cover = coverUrl(card)
            return cover === ''
              ? <span key={card.cardId} className={`nv-me-mini nv-me-mini--${isCharacter(card) ? 'char' : 'world'}`}>{card.name.slice(0, 1)}</span>
              : <span key={card.cardId} className="nv-me-mini" style={{ backgroundImage: `url("${cover}")` }} />
          })}
          {empties.map((_, index) => <span key={`empty-${String(index)}`} className="nv-me-mini nv-me-mini--empty" />)}
        </span>
        <span className="nv-me-libbody">
          <span className="nv-me-libname">
            {workspace.title}
            {system && <span className="nv-me-libtag">{t('me.home.system')}</span>}
            {project?.missing === true && <span className="nv-me-libtag">{t('me.home.libraryMissing')}</span>}
          </span>
          <span className="nv-me-libcounts">{fmt(t, 'me.home.libraryCounts', { worlds, chars })}</span>
          {updated !== '' && <span className="nv-me-libtime">{fmt(t, 'me.home.libraryUpdated', { time: updated })}</span>}
        </span>
      </button>
      {!system && <LibraryMenu t={t} onRename={onRename} onRemove={onRemove} onDelete={onDelete} />}
    </div>
  )
}

/**
 * The creator page. The two waterfalls read across every working folder; the
 * library shelf mirrors the sidebar and the selected library's cards render
 * directly below it — selecting a box never changes the page.
 */
export function MeHome({
  t, useCards, useProjects, useCatalogReady, useWorkspaces, useStore, onOpenPreview, onEditCard, onSetView,
  onCreateProject, onPickProject, onRemoveProject, onDeleteProject, onRenameProject,
  onNewCard, onImportCard, onExportCard, onDeleteCard, onMoveCard,
}: Props) {
  const cards = useCards(state => state)
  const projects = useProjects(state => state)
  const catalogReady = useCatalogReady(state => state)
  const workspaces = useWorkspaces(state => state.items)
  const libraryFocus = useStore(state => state.libraryFocus)
  const view = useStore(state => state.meView)
  const [profile, setLocalProfile] = useState(getProfile)
  const [profileOpen, setProfileOpen] = useState(false)
  const [projectOpen, setProjectOpen] = useState(false)
  const [renameTarget, setRenameTarget] = useState<WorkspaceView | undefined>(undefined)
  const [deleteTarget, setDeleteTarget] = useState<WorkspaceView | undefined>(undefined)
  const [selectedRoot, setSelectedRoot] = useState<string | undefined>(undefined)
  const [pick, setPick] = useState<PickTarget | null>(null)
  const [tapePaused, setTapePaused] = useState(false)
  const [notice, setNotice] = useState<string | undefined>(undefined)
  const pageRef = useRef<HTMLDivElement | null>(null)
  const activeRef = useRef<HTMLDivElement | null>(null)
  const tapeRef = useRef<HTMLDivElement | null>(null)

  useEffect(() => onProfileChange(() => { setLocalProfile(getProfile()) }), [])
  useEffect(() => {
    if (notice === undefined) return
    const timer = window.setTimeout(() => { setNotice(undefined) }, 5000)
    return () => { window.clearTimeout(timer) }
  }, [notice])
  useRetainedScroll(pageRef, 'noven-me')

  const projectByRoot = new Map(projects.map(project => [project.root, project] as const))
  const systemWorkspaces = workspaces.filter(workspace => isSystemWorkspace(workspace, projects))
  const userWorkspaces = workspaces.filter(workspace => !isSystemWorkspace(workspace, projects))
  const firstRoot = userWorkspaces[0]?.path ?? workspaces[0]?.path
  const effectiveRoot = selectedRoot !== undefined && workspaces.some(workspace => workspace.path === selectedRoot)
    ? selectedRoot
    : firstRoot
  const selected = workspaces.find(workspace => workspace.path === effectiveRoot)
  const selectedSystem = selected === undefined ? false : isSystemWorkspace(selected, projects)
  const selectedCards = selected === undefined ? [] : cardsOf(cards, selected.path)
  const selectedWorlds = selectedCards.filter(isWorld)
  const selectedCharacters = selectedCards.filter(isCharacter)

  const focusLibrary = useCallback((root: string): void => {
    onSetView('library')
    setSelectedRoot(root)
    window.setTimeout(() => {
      activeRef.current?.scrollIntoView({
        behavior: window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth',
        block: 'start',
      })
    }, 60)
  }, [onSetView])

  useEffect(() => {
    if (libraryFocus === null) return
    focusLibrary(libraryFocus.root)
  }, [libraryFocus?.token, focusLibrary])

  const workspaceRoots = new Set(workspaces.map(workspace => workspace.path))
  const libraryCards = cards.filter(card => workspaceRoots.has(card.workspaceRoot))
  const worlds = libraryCards.filter(isWorld)
  const characters = libraryCards.filter(isCharacter)

  const tapeStep = (): number => {
    const tape = tapeRef.current
    const card = tape?.querySelector<HTMLElement>('.nv-me-card')
    return (card?.offsetWidth ?? 380) + 18
  }
  const pageTape = (direction: 1 | -1): void => {
    const tape = tapeRef.current
    if (tape === null) return
    tape.scrollBy({ left: direction * tapeStep(), behavior: 'smooth' })
  }
  useEffect(() => {
    if (view !== 'exhibit' || tapePaused || worlds.length === 0) return
    if (!window.matchMedia('(hover: hover)').matches) return
    const timer = window.setInterval(() => {
      const tape = tapeRef.current
      if (tape === null) return
      const max = tape.scrollWidth - tape.clientWidth
      if (max <= 8) return
      if (tape.scrollLeft >= max - 8) tape.scrollTo({ left: 0, behavior: 'smooth' })
      else tape.scrollBy({ left: tapeStep(), behavior: 'smooth' })
    }, 5200)
    return () => { window.clearInterval(timer) }
  }, [view, tapePaused, worlds.length])

  useEffect(() => {
    if (view !== 'exhibit') return
    const tape = tapeRef.current
    if (tape === null) return
    const onWheel = (event: WheelEvent): void => {
      if (event.ctrlKey || event.metaKey) return
      const delta = Math.abs(event.deltaY) >= Math.abs(event.deltaX) ? event.deltaY : event.deltaX
      if (delta === 0) return
      const max = tape.scrollWidth - tape.clientWidth
      if (max <= 0) return
      const next = Math.min(max, Math.max(0, tape.scrollLeft + delta))
      if (next === tape.scrollLeft) return
      event.preventDefault()
      tape.scrollLeft = next
    }
    tape.addEventListener('wheel', onWheel, { passive: false })
    return () => { tape.removeEventListener('wheel', onWheel) }
  }, [view, worlds.length])

  const moveTargets = (card: CardRow): readonly MoveTarget[] => workspaces
    .filter(workspace => workspace.path !== card.workspaceRoot)
    .map(workspace => ({
      root: workspace.path,
      title: workspace.title,
      sessionId: projectByRoot.get(workspace.path)?.sessionId,
    }))

  const openPick = (kind: CardKind, workspace: WorkspaceView | undefined): void => {
    setPick({ kind, workspaceId: workspace?.workspaceId, title: workspace?.title ?? '' })
  }

  const openCardMenu = (card: CardRow, variant: 'poster' | 'shelf' | 'tape', manage: boolean): ReactNode => (
    <MeCard
      t={t}
      card={card}
      variant={variant}
      targets={moveTargets(card)}
      onOpen={() => { onOpenPreview(card.cardId, cardAddr(card)) }}
      onEdit={() => { onEditCard(card.cardId, cardAddr(card)) }}
      onManage={manage ? () => { focusLibrary(card.workspaceRoot) } : undefined}
      onExport={() => onExportCard(cardAddr(card), card.cardId, card.name)}
      onMove={target => onMoveCard(cardAddr(card), card.cardId, { root: target.root, sessionId: target.sessionId })}
      onDelete={() => onDeleteCard(cardAddr(card), card.cardId, card.name)}
    />
  )

  const galleryCard = (card: CardRow): ReactNode => openCardMenu(card, 'poster', true)
  const tapeCard = (card: CardRow): ReactNode => openCardMenu(card, 'tape', true)
  const shelfCard = (card: CardRow): ReactNode => openCardMenu(card, 'shelf', false)

  const removeLibrary = (workspace: WorkspaceView): void => {
    void onRemoveProject(workspace.path)
      .then(() => {
        setNotice(fmt(t, 'me.home.removed', { title: workspace.title }))
        if (effectiveRoot === workspace.path) setSelectedRoot(undefined)
      })
      .catch((reason: unknown) => { setNotice(reason instanceof Error ? reason.message : String(reason)) })
  }

  const deleteLibrary = async (root: string): Promise<void> => {
    const workspace = workspaces.find(candidate => candidate.path === root)
    await onDeleteProject(root)
    if (workspace !== undefined) setNotice(fmt(t, 'me.home.deleted', { title: workspace.title }))
    if (effectiveRoot === root) setSelectedRoot(undefined)
  }

  const profileCard = (
    <header className="nv-me-profile">
      <button type="button" className="nv-me-avatar" aria-label={t('me.profile.avatarHint')}
        onClick={() => { setProfileOpen(true) }}>
        {profile.avatar === ''
          ? <span>{profile.name.trim().slice(0, 1) || '我'}</span>
          : <img src={profileAvatarUrl(profile)} alt="" />}
      </button>
      <div className="nv-me-profile-body">
        <Editable className="nv-me-name" value={profile.name} placeholder={t('me.profile.name')}
          hint={t('me.profile.editHint')} onCommit={name => { setProfile({ name }) }} />
        <Editable className="nv-me-bio" value={profile.bio} placeholder={t('me.profile.bio')}
          hint={t('me.profile.editHint')} onCommit={bio => { setProfile({ bio }) }} />
        <div className="nv-me-stats">
          {fmt(t, 'me.home.stats', {
            libs: userWorkspaces.length,
            worlds: worlds.length,
            chars: characters.length,
          })}
        </div>
      </div>
      <button type="button" className="nv-btn-ghost" onClick={() => { setProfileOpen(true) }}>{t('me.profile.edit')}</button>
    </header>
  )

  return (
    <div className="nv-page nv-mehome" ref={pageRef}>
      <div className="nv-inner nv-meinner">
        <div className="nv-mehead">
          {profileCard}
          <nav className="nv-meview-tabs" role="tablist" aria-label={t('me.title')}>
            {([
              { id: 'exhibit', label: 'me.tab.exhibit' },
              { id: 'library', label: 'me.tab.library' },
              { id: 'works', label: 'me.tab.works' },
            ] as const).map(item => (
              <button key={item.id} type="button" role="tab" className="nv-meview-tab"
                data-active={view === item.id || undefined} aria-selected={view === item.id}
                onClick={() => { onSetView(item.id); pageRef.current?.scrollTo({ top: 0, behavior: 'smooth' }) }}>
                {t(item.label)}
              </button>
            ))}
          </nav>
        </div>

        {view === 'exhibit' && (
          <>
            <section className="nv-me-gallery nv-me-exhibit-worlds" aria-labelledby="nv-me-worlds">
              <div className="nv-me-gallery-head">
                <div className="nv-me-gallery-title">
                  <h2 id="nv-me-worlds">{t('me.home.worlds')}</h2>
                  <span>{worlds.length}</span>
                </div>
                <div className="nv-me-gallery-actions">
                  <span className="nv-me-tape-nav">
                    <button type="button" aria-label={t('me.home.tapePrev')} onClick={() => { pageTape(-1) }}>‹</button>
                    <button type="button" aria-label={t('me.home.tapeNext')} onClick={() => { pageTape(1) }}>›</button>
                  </span>
                  <button type="button" className="nv-btn-soft" onClick={() => { openPick('world', selected) }}>
                    ＋ {t('me.home.newWorld')}
                  </button>
                </div>
              </div>
              <div ref={tapeRef} className="nv-me-tape" tabIndex={0}
                onPointerEnter={() => { setTapePaused(true) }}
                onPointerLeave={() => { setTapePaused(false) }}
                onFocusCapture={() => { setTapePaused(true) }}
                onBlurCapture={() => { setTapePaused(false) }}>
                {!catalogReady && worlds.length === 0 && (
                  <>
                    <div className="nv-me-skel nv-me-skel--tape" />
                    <div className="nv-me-skel nv-me-skel--tape" />
                    <div className="nv-me-skel nv-me-skel--tape" />
                  </>
                )}
                {worlds.map(card => <Fragment key={card.cardId}>{tapeCard(card)}</Fragment>)}
                <NewTile t={t} kind="world" onOpen={() => { openPick('world', selected) }} />
              </div>
              {catalogReady && worlds.length === 0 && (
                <div className="nv-me-empty"><strong>{t('me.home.emptyWorlds')}</strong><span>{t('me.home.emptyHint')}</span></div>
              )}
            </section>

            <section className="nv-me-gallery" aria-labelledby="nv-me-characters">
              <div className="nv-me-gallery-head">
                <div className="nv-me-gallery-title">
                  <h2 id="nv-me-characters">{t('me.home.characters')}</h2>
                  <span>{characters.length}</span>
                </div>
                <div className="nv-me-gallery-actions">
                  <button type="button" className="nv-btn-soft" onClick={() => { openPick('character', selected) }}>
                    ＋ {t('me.home.newCharacter')}
                  </button>
                </div>
              </div>
              <div className="nv-me-masonry nv-me-masonry-chars">
                {!catalogReady && characters.length === 0 && (
                  <>
                    <div className="nv-me-skel nv-me-skel--char" />
                    <div className="nv-me-skel nv-me-skel--char" />
                    <div className="nv-me-skel nv-me-skel--char" />
                  </>
                )}
                {characters.map(card => <Fragment key={card.cardId}>{galleryCard(card)}</Fragment>)}
                <NewTile t={t} kind="character" onOpen={() => { openPick('character', selected) }} />
              </div>
              {catalogReady && characters.length === 0 && (
                <div className="nv-me-empty"><strong>{t('me.home.emptyCharacters')}</strong><span>{t('me.home.emptyHint')}</span></div>
              )}
            </section>
          </>
        )}

        {view === 'library' && (
          <div className="nv-meview-library">
        <section className="nv-me-library" aria-labelledby="nv-me-library-title">
          <div className="nv-me-libhead">
            <div>
              <div className="nv-me-gallery-title">
                <h2 id="nv-me-library-title">{t('me.tab.library')}</h2>
                <span>{userWorkspaces.length}</span>
              </div>
              <p>{t('me.home.libraryHint')}</p>
            </div>
            <button type="button" className="nv-btn-soft" onClick={() => { setProjectOpen(true) }}>
              ＋ {t('me.home.newLibrary')}
            </button>
          </div>

          <div className="nv-me-shelf">
            {userWorkspaces.map(workspace => {
              const project = projectByRoot.get(workspace.path)
              const libraryCards = cardsOf(cards, workspace.path)
              return (
                <LibraryBox key={workspace.workspaceId} t={t} workspace={workspace} project={project}
                  cards={libraryCards} system={false} active={workspace.path === effectiveRoot}
                  onSelect={() => { focusLibrary(workspace.path) }}
                  onRename={() => { setRenameTarget(workspace) }}
                  onRemove={() => { removeLibrary(workspace) }}
                  onDelete={() => { setDeleteTarget(workspace) }} />
              )
            })}
            <button type="button" className="nv-me-newlib" onClick={() => { setProjectOpen(true) }}>
              <span className="nv-me-plus" aria-hidden="true">＋</span>
              <span>{t('me.home.newLibrary')}</span>
            </button>
          </div>

          {selected !== undefined && (
            <div className="nv-me-active" ref={activeRef}>
              <div className="nv-me-active-head">
                <div>
                  <h3>{selected.title}</h3>
                  <p>{fmt(t, 'me.home.libraryCounts', { worlds: selectedWorlds.length, chars: selectedCharacters.length })}</p>
                </div>
                {!selectedSystem && (
                  <LibraryMenu t={t}
                    onRename={() => { setRenameTarget(selected) }}
                    onRemove={() => { removeLibrary(selected) }}
                    onDelete={() => { setDeleteTarget(selected) }} />
                )}
              </div>

              {selectedCards.length === 0 ? (
                catalogReady ? (
                  <div className="nv-me-libempty">
                    <div className="nv-me-emptyart" aria-hidden="true">＋</div>
                    <strong>{t('me.home.libraryEmpty')}</strong>
                    <span>{t('me.home.libraryEmptyHint')}</span>
                    <div className="nv-me-emptyacts">
                      <button type="button" className="nv-btn-primary" onClick={() => { openPick('world', selected) }}>{t('me.home.newWorld')}</button>
                      <button type="button" className="nv-btn-ghost" onClick={() => { openPick('character', selected) }}>{t('me.home.newCharacter')}</button>
                    </div>
                  </div>
                ) : <div className="nv-me-secempty">{t('canvas.files.loading')}</div>
              ) : (
                <>
                  <div className="nv-me-active-sec">
                    <div className="nv-me-active-sechead">
                      <span>{t('me.tab.worlds')}</span>
                      <span className="nv-me-count">{selectedWorlds.length}</span>
                      <button type="button" className="nv-linkbtn" onClick={() => { openPick('world', selected) }}>＋ {t('me.home.newWorld')}</button>
                    </div>
                    {selectedWorlds.length === 0
                      ? <div className="nv-me-secempty">{t('me.home.emptyWorlds')}</div>
                      : <div className="nv-me-grid">{selectedWorlds.map(card => <Fragment key={card.cardId}>{shelfCard(card)}</Fragment>)}</div>}
                  </div>
                  <div className="nv-me-active-sec">
                    <div className="nv-me-active-sechead">
                      <span>{t('me.tab.characters')}</span>
                      <span className="nv-me-count">{selectedCharacters.length}</span>
                      <button type="button" className="nv-linkbtn" onClick={() => { openPick('character', selected) }}>＋ {t('me.home.newCharacter')}</button>
                    </div>
                    {selectedCharacters.length === 0
                      ? <div className="nv-me-secempty">{t('me.home.emptyCharacters')}</div>
                      : <div className="nv-me-grid nv-me-grid-chars">{selectedCharacters.map(card => <Fragment key={card.cardId}>{shelfCard(card)}</Fragment>)}</div>}
                  </div>
                </>
              )}
            </div>
          )}

          {systemWorkspaces.length > 0 && (
            <>
              <div className="nv-me-syshead">
                <span>{t('me.home.system')}</span>
                <small>{t('me.home.systemHint')}</small>
              </div>
              <div className="nv-me-shelf">
                {systemWorkspaces.map(workspace => {
                  const project = projectByRoot.get(workspace.path)
                  const libraryCards = cardsOf(cards, workspace.path)
                  return (
                    <LibraryBox key={workspace.workspaceId} t={t} workspace={workspace} project={project}
                      cards={libraryCards} system active={workspace.path === effectiveRoot}
                      onSelect={() => { focusLibrary(workspace.path) }}
                      onRename={() => {}}
                      onRemove={() => {}}
                      onDelete={() => {}} />
                  )
                })}
              </div>
            </>
          )}
        </section>

        <div className="nv-me-foot">
          <span>{t('me.home.libraryHint')}</span>
          {effectiveRoot !== undefined && (
            <button type="button" className="nv-linkbtn" onClick={() => { focusLibrary(effectiveRoot) }}>{t('me.home.openLibrary')} →</button>
          )}
        </div>
          </div>
        )}

        {view === 'works' && (
          <MeWorks t={t} workspaces={workspaces} onOpenLibrary={() => { onSetView('library') }} />
        )}
      </div>

      <ProfileDialog t={t} open={profileOpen} profile={profile} onClose={() => { setProfileOpen(false) }} />
      <ProjectDialog t={t} open={projectOpen} onClose={() => { setProjectOpen(false) }}
        onCreate={onCreateProject} onPick={onPickProject}
        onCreated={root => { focusLibrary(root) }} />
      <RenameLibraryDialog t={t} target={renameTarget} onClose={() => { setRenameTarget(undefined) }}
        onRename={onRenameProject} />
      <DeleteLibraryDialog t={t} target={deleteTarget}
        project={deleteTarget === undefined ? undefined : projectByRoot.get(deleteTarget.path)}
        cards={cards} onClose={() => { setDeleteTarget(undefined) }} onDelete={deleteLibrary} />
      {pick !== null && (
        <CardPick t={t} kind={pick.kind} target={pick.title}
          defaultName={`${t(pick.kind === 'world' ? 'create.pick.name.default.world' : 'create.pick.name.default.character')} ${libraryCards.filter(card => pick.kind === 'world' ? isWorld(card) : isCharacter(card)).length + 1}`}
          onClose={() => { setPick(null) }}
          onCreate={name => { const target = pick; setPick(null); onNewCard(target.kind, name, target.workspaceId) }}
          onImport={file => { const target = pick; setPick(null); onImportCard(file, target.workspaceId) }} />
      )}
      {notice !== undefined && <div className="nv-me-notice">{notice}</div>}
    </div>
  )
}
