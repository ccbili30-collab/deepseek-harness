/**
 * 作品 — the third parallel interface inside 我的: maps, comics, images and
 * text registered in each library manifest. Cards live in the card library;
 * this surface only shows non-card work files and opens them read-only.
 * @module noven-shell/client/pages/MeWorks
 */
import { useEffect, useState } from 'react'
import type { WorkspaceView } from '@deepseek-ai/dsh-api-workspace-controller/client'
import type { ShellT } from './Home.tsx'
import type { NovenShellLocaleKey } from '../locales.ts'
import { fetchLibrary, type LibraryWork, type WorkKind } from '../library-api.ts'

interface WorkEntry {
  readonly work: LibraryWork
  readonly root: string
  readonly project: string
}

interface Props {
  readonly t: ShellT
  readonly workspaces: readonly WorkspaceView[]
  /** Empty-state shortcut back to the card library. */
  readonly onOpenLibrary: () => void
}

const IMAGE_KINDS: ReadonlySet<WorkKind> = new Set(['image', 'map', 'comic'])
const KIND_ORDER: readonly WorkKind[] = ['map', 'comic', 'image', 'text', 'other']

const kindLabel = (t: ShellT, kind: WorkKind): string => t(`lib.kind.${kind}` as NovenShellLocaleKey)
const stageLabel = (t: ShellT, stage: LibraryWork['stage']): string => t(`lib.stage.${stage}` as NovenShellLocaleKey)

const fileUrl = (root: string, rel: string): string =>
  `/api/file?path=${encodeURIComponent(`${root}/${rel}`)}`

/** One read-only work tile; clicking opens the backing file in a new browser tab. */
function WorkTile({ t, entry }: { readonly t: ShellT; readonly entry: WorkEntry }) {
  const { work, root, project } = entry
  const cover = work.cover?.path ?? (IMAGE_KINDS.has(work.kind) ? work.primary.path : undefined)
  return (
    <button type="button" className="nv-me-work"
      onClick={() => { window.open(fileUrl(root, work.primary.path), '_blank', 'noopener') }}>
      <span className={`nv-me-workcover${cover === undefined ? ' nv-me-workcover--type' : ''}`}
        style={cover === undefined ? undefined : { backgroundImage: `url("${fileUrl(root, cover)}")` }}>
        {cover === undefined && <span>{kindLabel(t, work.kind)}</span>}
      </span>
      <span className="nv-me-workbody">
        <strong>{work.title}</strong>
        <span className="nv-me-workmeta">
          <span className="nv-tag">{kindLabel(t, work.kind)}</span>
          <span className="nv-stage" data-stage={work.stage}>{stageLabel(t, work.stage)}</span>
          {work.archived && <span className="nv-tag">{t('lib.work.archived')}</span>}
          <span className="nv-me-workproject">{project}</span>
        </span>
      </span>
    </button>
  )
}

/**
 * Cross-library work gallery. The library manifest is fetched per workspace
 * only while this interface is mounted; archived works are shown with a tag.
 */
export function MeWorks({ t, workspaces, onOpenLibrary }: Props) {
  const [entries, setEntries] = useState<readonly WorkEntry[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let live = true
    setLoading(true)
    void Promise.all(workspaces.map(async workspace => {
      const payload = await fetchLibrary({ root: workspace.path })
      return (payload?.works ?? [])
        .filter(work => work.kind !== 'card')
        .map(work => ({ work, root: workspace.path, project: workspace.title }))
    }))
      .then(groups => {
        if (!live) return
        const next = groups.flat().sort((left, right) => right.work.updatedAt.localeCompare(left.work.updatedAt))
        setEntries(next)
        setLoading(false)
      })
      .catch(() => { if (live) { setEntries([]); setLoading(false) } })
    return () => { live = false }
  }, [workspaces])

  const grouped = KIND_ORDER
    .map(kind => ({ kind, rows: entries.filter(entry => entry.work.kind === kind) }))
    .filter(group => group.rows.length > 0)

  return (
    <section className="nv-meview-works" aria-labelledby="nv-me-works-title">
      <header className="nv-me-workshead">
        <div>
          <div className="nv-me-gallery-title">
            <h2 id="nv-me-works-title">{t('me.tab.works')}</h2>
            <span className="nv-me-count">{entries.length}</span>
          </div>
          <p>{t('me.home.worksHint')}</p>
        </div>
      </header>

      {loading && <div className="nv-me-secempty">{t('lib.work.loading')}</div>}
      {!loading && entries.length === 0 && (
        <div className="nv-me-worksempty">
          <div className="nv-me-emptyart" aria-hidden="true">＋</div>
          <strong>{t('me.home.worksEmpty')}</strong>
          <span>{t('me.home.worksEmptyHint')}</span>
          <button type="button" className="nv-btn-ghost" onClick={onOpenLibrary}>{t('me.worksGoLibrary')}</button>
        </div>
      )}
      {!loading && grouped.map(group => (
        <section key={group.kind} className="nv-me-worksgroup">
          <div className="nv-me-active-sechead">
            <span>{kindLabel(t, group.kind)}</span>
            <span className="nv-me-count">{group.rows.length}</span>
          </div>
          <div className="nv-me-worksgrid">
            {group.rows.map(entry => <WorkTile key={`${entry.root}:${entry.work.id}`} t={t} entry={entry} />)}
          </div>
        </section>
      ))}
    </section>
  )
}
