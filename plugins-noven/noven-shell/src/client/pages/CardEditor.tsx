/**
 * 卡片编辑器 — the three-pane card editor: breadcrumb + draft state, a real
 * collapsible module tree with 世界内角色, the selected module's editable
 * Markdown (textarea ⇄ preview, toolbar, save/discard), and the "交给 AI"
 * side pane (inert until editor-scoped chat lands). Reads and writes go
 * through `/api/noven-cards` — the same EditorCommand set the model uses,
 * sourced HUMAN.
 * @module noven-shell/client/pages/CardEditor
 */
import { useEffect, useMemo, useRef, useState } from 'react'
import type { ShellT } from './Home.tsx'
import { fmt } from './Home.tsx'
import { notifyUndo, useArmedPress } from '../ui/interact.tsx'
import type { CardAddr, CardBlockView, CardDocView, CardModuleDoc, CardOp, CardOpResult, CardState } from '../card-api.ts'
import { cardContentUrl } from '../card-api.ts'
import type { SnapshotSelectorHook } from '@deepseek-ai/dsh-client-ui-slots'
import type { SessionId } from '@deepseek-ai/dsh-session/types'

export interface CardEditorProps {
  readonly t: ShellT
  readonly useStore: SnapshotSelectorHook<{ card: { cardId: string; sessionId?: SessionId; root: string } | null }>
  readonly loadCard: (addr: CardAddr, cardId: string) => Promise<CardState | undefined>
  readonly op: (addr: CardAddr, op: CardOp) => Promise<CardOpResult>
  readonly workspaceRoot: (addr: CardAddr) => string
  /** Breadcrumb navigation back to 我的 on the matching catalog tab. */
  readonly back: (tab: 'worlds' | 'characters') => void
}

export interface FlatRow { readonly row: CardModuleDoc; readonly depth: number; readonly parentId: string | null }

export function flatten(modules: readonly CardModuleDoc[], collapsed: ReadonlySet<string>, depth = 0, parentId: string | null = null, out: FlatRow[] = []): FlatRow[] {
  for (const m of modules) {
    out.push({ row: m, depth, parentId })
    if (!collapsed.has(m.id)) flatten(m.children, collapsed, depth + 1, m.id, out)
  }
  return out
}

/** Blocks → the editor's Markdown: image blocks keep their card-image line so a round-trip preserves ids. */
export function moduleMarkdown(module: CardModuleDoc): string {
  return module.blocks.map(b => b.kind === 'text'
    ? (b.text ?? '')
    : `![${b.caption ?? ''}](card-image:${b.resourceId ?? ''}#${b.id})`,
  ).join('\n\n')
}

export function findModule(modules: readonly CardModuleDoc[], id: string): CardModuleDoc | undefined {
  for (const m of modules) {
    if (m.id === id) return m
    const nested = findModule(m.children, id)
    if (nested !== undefined) return nested
  }
  return undefined
}

export function CardEditor({ t, useStore, loadCard, op, workspaceRoot, back }: CardEditorProps) {
  const card = useStore(s => s.card)
  const [state, setState] = useState<CardState | 'loading' | undefined>(undefined)
  const [targetId, setTargetId] = useState<string | undefined>(undefined)
  const [selected, setSelected] = useState<string | undefined>(undefined)
  const [collapsed, setCollapsed] = useState<ReadonlySet<string>>(new Set())
  const [rolesOpen, setRolesOpen] = useState(true)
  const [edits, setEdits] = useState<Readonly<Record<string, string>>>({})
  const [mode, setMode] = useState<'edit' | 'preview'>('edit')
  const [busy, setBusy] = useState(false)
  const [notice, setNotice] = useState<string | undefined>(undefined)
  const [pending, setPending] = useState<{ readonly id: string; readonly original: string } | null>(null)
  const [renameText, setRenameText] = useState('')
  const areaRef = useRef<HTMLTextAreaElement>(null)

  const refresh = async (): Promise<CardState | undefined> => {
    if (card === null) return undefined
    const next = await loadCard(card, card.cardId)
    setState(next)
    return next
  }

  useEffect(() => {
    let live = true
    setSelected(undefined); setTargetId(undefined); setEdits({}); setCollapsed(new Set()); setNotice(undefined); setPending(null)
    if (card === null) { setState(undefined); return }
    setState('loading')
    void loadCard(card, card.cardId).then(d => { if (live) setState(d) })
    return () => { live = false }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [card?.cardId, card?.sessionId, loadCard])

  const doc: CardDocView | undefined = state !== undefined && state !== 'loading' ? state.document : undefined
  const target: Omit<CardDocView, 'characters'> | undefined = doc === undefined
    ? undefined
    : targetId === undefined || targetId === doc.id
      ? doc
      : doc.characters.find(c => c.id === targetId)
  const rows = useMemo(() => (target !== undefined ? flatten(target.modules, collapsed) : []), [target, collapsed])
  const current = rows.find(r => r.row.id === selected)?.row ?? rows[0]?.row
  const resources = useMemo(() => new Map((state !== undefined && state !== 'loading' ? state.resources : []).map(r => [r.id, r.ref])), [state])
  const media = (resourceId: string | undefined) => {
    const ref = resourceId === undefined ? undefined : resources.get(resourceId)
    return ref === undefined || card === null || state === undefined || state === 'loading'
      ? '' : cardContentUrl(workspaceRoot(card), state.dir, ref)
  }
  const hasDraft = state !== undefined && state !== 'loading' && state.hasDraft
  const dirtyModules = current !== undefined && edits[current.id] !== undefined && edits[current.id] !== moduleMarkdown(current)
  const dirty = hasDraft || Object.keys(edits).length > 0
  const version = state !== undefined && state !== 'loading' ? state.version : ''

  const run = async (action: () => Promise<unknown>): Promise<CardState | undefined> => {
    if (card === null || busy) return undefined
    setBusy(true); setNotice(undefined)
    try {
      await action()
      return await refresh()
    } catch (error: unknown) {
      setNotice(error instanceof Error && error.name === 'CardConflict' ? t('editor.conflict') : String(error instanceof Error ? error.message : error))
      return await refresh()
    } finally {
      setBusy(false)
    }
  }

  const apply = (command: CardOp['command']) => run(async () => {
    await op((card as NonNullable<typeof card>), { op: 'apply', cardId: (card as NonNullable<typeof card>).cardId, targetId, version, command })
  })

  const save = () => run(async () => {
    const addr = (card as NonNullable<typeof card>)
    const cardId = (card as NonNullable<typeof card>).cardId
    let v = version
    for (const [moduleId, text] of Object.entries(edits)) {
      const module = findModule(target?.modules ?? [], moduleId)
      if (module === undefined || text === moduleMarkdown(module)) continue
      const result = await op(addr, {
        op: 'apply', cardId, targetId, version: v,
        command: { kind: 'write_markdown', moduleId, name: module.name, text },
      })
      v = result.version ?? v
    }
    if (hasDraft) await op(addr, { op: 'commit', cardId, version: v })
    setEdits({})
  })

  const addModule = async (parentId: string | null) => {
    // Explorer-style: the row lands immediately under a default name, selected
    // for inline rename — no dialog asks for a name up front.
    const name = `${t('editor.module.defaultName')} ${rows.filter(r => r.parentId === parentId).length + 1}`
    const next = await run(async () => {
      await op((card as NonNullable<typeof card>), {
        op: 'apply', cardId: (card as NonNullable<typeof card>).cardId, targetId, version,
        command: { kind: 'add_module', name, ...(parentId !== null ? { parentId } : {}) },
      })
    })
    if (parentId !== null && collapsed.has(parentId)) toggleCollapse(parentId)
    const added = next === undefined ? undefined : flatten(next.document.characters.find(c => c.id === targetId)?.modules
      ?? next.document.modules, new Set()).map(f => f.row).filter(m => m.name === name).pop()
    if (added !== undefined) { setPending({ id: added.id, original: added.name }); setRenameText(added.name); setSelected(added.id) }
  }

  const renameModule = (module: CardModuleDoc) => {
    setPending({ id: module.id, original: module.name })
    setRenameText(module.name)
  }

  const commitRename = () => {
    if (pending === null) return
    const name = renameText.trim()
    if (name.length > 0 && name !== pending.original) {
      void apply({ kind: 'rename_module', moduleId: pending.id, name })
    }
    setPending(null)
  }

  /** 行尾 ✕ 两段确认：第一下武装，第二下删除；删除后回执可撤销。 */
  const removeArm = useArmedPress()
  const removeModule = (module: CardModuleDoc) => {
    if (!removeArm.press(module.id)) return
    let ok = false
    void run(async () => {
      await op((card as NonNullable<typeof card>), { op: 'apply', cardId: (card as NonNullable<typeof card>).cardId, targetId, version, command: { kind: 'remove_module', moduleId: module.id } })
      ok = true
    }).then(() => {
      if (!ok) return
      notifyUndo({
        text: fmt(t, 'ui.receipt.moduleDeleted', { name: module.name }),
        undoLabel: t('ui.undo'),
        undo: () => { void run(async () => { await op((card as NonNullable<typeof card>), { op: 'undo', cardId: (card as NonNullable<typeof card>).cardId }) }) },
      })
    })
    if (selected === module.id) setSelected(undefined)
  }

  const toggleCollapse = (id: string) => {
    setCollapsed(prev => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id); else next.add(id)
      return next
    })
  }

  const wrapSelection = (before: string, after: string) => {
    const area = areaRef.current
    if (area === null || current === undefined) return
    const { selectionStart: s, selectionEnd: e, value } = area
    const inner = value.slice(s, e)
    const nextValue = value.slice(0, s) + before + inner + after + value.slice(e)
    setEdits(prev => ({ ...prev, [current.id]: nextValue }))
    requestAnimationFrame(() => { area.focus(); area.setSelectionRange(s + before.length, e + before.length) })
  }
  const prefixLines = (prefix: string) => {
    const area = areaRef.current
    if (area === null || current === undefined) return
    const { selectionStart: s, selectionEnd: e, value } = area
    const start = value.lastIndexOf('\n', s - 1) + 1
    const nextValue = value.slice(0, start) + value.slice(start, e).split('\n').map(l => prefix + l).join('\n') + value.slice(e)
    setEdits(prev => ({ ...prev, [current.id]: nextValue }))
  }

  if (card === null || state === undefined) {
    return (
      <div className="nv-editor" style={{ alignItems: 'center', justifyContent: 'center', display: 'flex' }}>
        <div className="nv-card" style={{ padding: '32px 36px', color: 'var(--nv-secondary-text)', fontSize: 13 }}>{t('editor.empty')}</div>
      </div>
    )
  }
  if (state === 'loading' || doc === undefined || target === undefined) {
    return (
      <div className="nv-editor" style={{ alignItems: 'center', justifyContent: 'center', display: 'flex' }}>
        <div style={{ color: 'var(--nv-secondary-text)', fontSize: 13 }}>…</div>
      </div>
    )
  }

  const editText = current !== undefined ? edits[current.id] ?? moduleMarkdown(current) : ''

  return (
    <div className="nv-editor">
      <div className="nv-editor-top">
        <button className="nv-back" aria-label={t('editor.back')} title={t('editor.back')}
          onClick={() => back(doc.kind === 'CHARACTER' ? 'characters' : 'worlds')}>‹</button>
        <span className="crumb"><b>{doc.name}</b>
          {target.id !== doc.id && <> / <b>{target.name}</b></>}
        </span>
        <div className="right">
          {dirty && <span className="nv-dirty">{t('editor.dirty')}</span>}
          {notice !== undefined && <span className="nv-tag" data-kind="warn">{notice}</span>}
          <button className="nv-pill" data-active={mode === 'preview'} onClick={() => setMode(m => m === 'edit' ? 'preview' : 'edit')}>{mode === 'edit' ? t('editor.preview') : t('editor.edit')}</button>
          {hasDraft && <button className="nv-pill" disabled={busy} onClick={() => { void run(async () => { await op(card, { op: 'discard', cardId: card.cardId }) }) }}>{t('editor.discard')}</button>}
          <button className="nv-btn-primary nv-save" disabled={busy || (!dirty && !hasDraft)} onClick={() => { void save() }}>{t('editor.save')}</button>
          <span className="nv-tag">{`r${state.revision}`}</span>
        </div>
      </div>
      <div className="nv-editor-body">
        <div className="nv-editor-col">
          <div className="nv-editor-col-head">
            {t('editor.modules')}
            <button className="nv-iconbtn nv-tree-add" title={t('editor.module.new')} onClick={() => addModule(null)}>+</button>
          </div>
          {target.id !== doc.id && (
            <button className="nv-tree-row nv-tree-back" onClick={() => { setTargetId(undefined); setSelected(undefined); setEdits({}) }}>
              <span className="nv-tree-chev">‹</span>{doc.name}
            </button>
          )}
          {rows.map(({ row, depth }) => (
            <div key={row.id} className="nv-tree-row" data-active={current?.id === row.id} style={{ paddingLeft: 10 + depth * 14 }}>
              <button className="nv-tree-chev" disabled={row.children.length === 0}
                onClick={e => { e.stopPropagation(); toggleCollapse(row.id) }}>
                {row.children.length > 0 ? (collapsed.has(row.id) ? '▸' : '▾') : ''}
              </button>
              {pending?.id === row.id ? (
                <input className="nv-tree-name nv-tree-rename" value={renameText} autoFocus
                  onFocus={e => e.currentTarget.select()}
                  onChange={e => setRenameText(e.target.value)}
                  onBlur={commitRename}
                  onKeyDown={e => {
                    if (e.key === 'Enter') { e.preventDefault(); commitRename() }
                    if (e.key === 'Escape') { e.preventDefault(); setPending(null) }
                  }} />
              ) : (
                <button className="nv-tree-name" onClick={() => { setSelected(row.id); if (collapsed.has(row.id)) toggleCollapse(row.id) }}>{row.name}</button>
              )}
              <span className="nv-tree-acts">
                <button className="nv-tree-act" title={t('editor.module.addChild')} onClick={() => addModule(row.id)}>+</button>
                <button className="nv-tree-act" title={t('editor.module.rename')} onClick={() => renameModule(row)}>✎</button>
                <button className="nv-tree-act nv-armbtn" data-armed={removeArm.armed === row.id || undefined}
                  title={removeArm.armed === row.id ? t('ui.armed.delete') : t('editor.module.remove')}
                  onClick={() => removeModule(row)}>{removeArm.armed === row.id ? t('ui.delete') : '✕'}</button>
              </span>
            </div>
          ))}
          {rows.length === 0 && <div className="nv-tree-row" style={{ cursor: 'default', color: 'var(--nv-secondary-text)' }}>{t('editor.modulesEmpty')}</div>}
          {doc.kind !== 'CHARACTER' && doc.characters.length > 0 && (
            <>
              <button className="nv-tree-row nv-tree-roles" onClick={() => setRolesOpen(v => !v)}>
                <span className="nv-tree-chev">{rolesOpen ? '▾' : '▸'}</span>{t('editor.roles')}
              </button>
              {rolesOpen && doc.characters.map(c => (
                <button key={c.id} className="nv-tree-role" data-active={targetId === c.id}
                  onClick={() => { setTargetId(c.id); setSelected(undefined); setEdits({}) }}>
                  <span className="nv-avatar nv-ctx-cardicon">角</span>
                  {c.name}
                </button>
              ))}
            </>
          )}
        </div>

        <div className="nv-editor-col">
          <div className="nv-doc">
            {current !== undefined ? (
              <>
                <div className="nv-doc-title">{current.name}</div>
                {mode === 'edit' ? (
                  <>
                    <div className="nv-doc-toolbar">
                      <button className="nv-toolbtn" title="Bold" onClick={() => wrapSelection('**', '**')}><b>B</b></button>
                      <button className="nv-toolbtn" title="Italic" onClick={() => wrapSelection('*', '*')}><i>I</i></button>
                      <button className="nv-toolbtn" title="List" onClick={() => prefixLines('- ')}>☰</button>
                    </div>
                    <textarea
                      ref={areaRef}
                      className="nv-doc-area"
                      value={editText}
                      placeholder={t('editor.modEmpty')}
                      onChange={e => setEdits(prev => ({ ...prev, [current.id]: e.target.value }))}
                    />
                  </>
                ) : (
                  <ModulePreview blocks={current.blocks} media={media} />
                )}
              </>
            ) : <p style={{ color: 'var(--nv-secondary-text)' }}>{t('editor.modulesEmpty')}</p>}
          </div>
        </div>

        <div className="nv-editor-col">
          <div className="nv-side-tabs">
            <button className="nv-side-tab" data-active="true">{t('editor.side.tabs.chat')}</button>
            <button className="nv-side-tab" disabled title={t('editor.side.soon')}>{t('editor.side.tabs.preview')}</button>
            <button className="nv-side-tab" disabled title={t('editor.side.soon')}>{t('editor.side.tabs.gallery')}</button>
          </div>
          <div className="nv-side-chat">
            <div className="nv-side-head">
              <strong>{t('editor.sidechat.title')}</strong>
              <span className="nv-tag">{t('editor.sidechat.scope').replace('{card}', doc.name)}</span>
            </div>
            <div style={{ color: 'var(--nv-secondary-text)', fontSize: 12.5, padding: '8px 2px' }}>{t('editor.sidechat.empty')}</div>
          </div>
        </div>
      </div>
    </div>
  )
}

/** Rendered module: blocks in storage order — paragraphs for text, image + caption for image blocks. */
export function ModulePreview({ blocks, media }: { readonly blocks: readonly CardBlockView[]; readonly media: (resourceId: string | undefined) => string }) {
  if (blocks.length === 0) return null
  return (
    <>
      {blocks.map((b, i) => b.kind === 'text'
        ? (b.text ?? '').split(/\n{2,}/).map((para, j) => <p key={`${i}-${j}`}>{para}</p>)
        : (
          <figure key={b.id} style={{ margin: '12px 0' }}>
            <img src={media(b.resourceId)} alt={b.caption ?? ''} />
            {b.caption !== undefined && b.caption.length > 0 && <figcaption style={{ fontSize: 12, color: 'var(--nv-secondary-text)', marginTop: 4 }}>{b.caption}</figcaption>}
          </figure>
        ))}
    </>
  )
}
