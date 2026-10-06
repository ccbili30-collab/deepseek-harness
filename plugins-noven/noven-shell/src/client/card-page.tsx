/**
 * 卡页 — 画布里的"卡"对象体（设计稿 J02）：头栏 + 模块竖排堆叠——每个
 * 模块一个标题盒，盒内正文走通用编辑器（块级点编）；模块导航不归这里，
 * 在抽屉树。盒尾是同宽的虚线「添加模块」区，点开是 J03 的模块库。
 * 卡的结构性操作（角色、封面、模块增删、草稿提交）经头栏「管理」切去
 * CardStudio。
 * @module noven-shell/client/card-page
 */
import { useCallback, useEffect, useMemo, useState } from 'react'
import type { CardAddr, CardBlockView, CardDocView, CardModuleDoc, CardOpResult, CardState } from './card-api.ts'
import { CardConflict, cardContentUrl } from './card-api.ts'
import { findModule } from './pages/CardEditor.tsx'
import { BlockEditor, type EditableBlock, type EditorSaveResult, type MdLabels } from './editor.tsx'
import { fmt, type ShellT } from './pages/Home.tsx'

/** 模块类型名 → 视图字典键（与内容树同一套语义图标无关，名字走 locale）。 */
const WIDGET_LABEL: Record<string, string> = {
  timeline: 'editor.widget.kind.timeline',
  map: 'editor.widget.kind.map',
  collection: 'editor.widget.kind.collection',
  html: 'editor.widget.kind.html',
}

interface ModuleLibraryProps {
  readonly t: ShellT
  readonly onPick: (widget: string | undefined) => void
  readonly onClose: () => void
}

/** J03 模块库：预制模块格子。专用编辑器未开放的类型置灰注明，不放假钮。 */
function ModuleLibrary({ t, onPick, onClose }: ModuleLibraryProps) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent): void => { if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', onKey)
    return () => { window.removeEventListener('keydown', onKey) }
  }, [onClose])
  const tiles: readonly { id: string; name: string; sub: string; widget?: string; soon?: boolean }[] = [
    { id: 'doc', name: t('modules.tile.doc'), sub: t('modules.tile.doc.sub') },
    { id: 'timeline', name: t('editor.widget.kind.timeline'), sub: t('modules.soon'), soon: true },
    { id: 'collection', name: t('editor.widget.kind.collection'), sub: t('modules.soon'), soon: true },
    { id: 'map', name: t('editor.widget.kind.map'), sub: t('modules.soon'), soon: true },
    { id: 'html', name: t('modules.tile.html'), sub: t('modules.tile.html.sub'), widget: 'html' },
  ]
  return (
    <div className="nv-create-veil" onClick={onClose}>
      <div className="nv-modlib" role="dialog" aria-modal="true" onClick={e => e.stopPropagation()}>
        <div className="nv-modlib-head">
          <span className="nv-modlib-title">{t('modules.title')}</span>
          <button type="button" className="nv-canvas-tabx" aria-label={t('create.cancel')} onClick={onClose}>×</button>
        </div>
        <div className="nv-modlib-grid">
          {tiles.map(tile => (
            <button key={tile.id} type="button" className="nv-modlib-tile" disabled={tile.soon === true}
              title={tile.soon === true ? t('modules.soon') : undefined}
              onClick={() => onPick(tile.widget)}>
              <span className="nv-modlib-tilename">{tile.name}</span>
              <span className="nv-modlib-tilesub">{tile.sub}</span>
            </button>
          ))}
        </div>
        <div className="nv-modlib-foot">{t('modules.foot')}</div>
      </div>
    </div>
  )
}

/** 一个模块盒：标题 + 正文（块级点编 / 小组件占位）。 */
function ModuleBox({ module, depth, t, mdLabels, imageUrl, saveBlock, addBlock }: {
  readonly module: CardModuleDoc
  readonly depth: number
  readonly t: ShellT
  readonly mdLabels: MdLabels
  readonly imageUrl: (resourceId: string) => string
  readonly saveBlock: (module: CardModuleDoc, blockId: string, text: string, expected: string) => Promise<EditorSaveResult>
  readonly addBlock: (module: CardModuleDoc, text: string) => Promise<EditorSaveResult>
}) {
  const widget = module.widget?.type
  const blocks: EditableBlock[] = module.blocks.map(b => b.kind === 'text'
    ? { id: b.id, kind: 'text' as const, text: b.text ?? '', ref: b.ref }
    : { id: b.id, kind: 'image' as const, imageUrl: b.resourceId === undefined ? undefined : imageUrl(b.resourceId), caption: b.caption })
  return (
    <section id={`nv-cardpage-sec-${module.id}`} className="nv-modbox" data-depth={depth}>
      <h2 className="nv-modbox-title">{module.name}</h2>
      {widget !== undefined && widget !== 'document' && widget !== 'html' && (
        <div className="nv-modbox-widget">
          {fmt(t, 'modules.widgetSoon', { name: t((WIDGET_LABEL[widget] ?? 'editor.widget.name') as Parameters<ShellT>[0]) })}
        </div>
      )}
      {widget === 'html' && (
        <HtmlModule module={module} t={t} saveBlock={saveBlock} />
      )}
      {(widget === undefined || widget === 'document') && (
        <BlockEditor blocks={blocks} labels={mdLabels} t={t}
          onSaveBlock={(blockId, text, expected) => saveBlock(module, blockId, text, expected)}
          onAdd={text => addBlock(module, text)} />
      )}
      {module.children.length > 0 && (
        <div className="nv-modbox-children">
          {module.children.map(child => (
            <ModuleBox key={child.id} module={child} depth={depth + 1} t={t} mdLabels={mdLabels}
              imageUrl={imageUrl} saveBlock={saveBlock} addBlock={addBlock} />
          ))}
        </div>
      )}
    </section>
  )
}

/** HTML 小组件模块：源码一块，始终可编（write_text 整块覆盖）。 */
function HtmlModule({ module, t, saveBlock }: {
  readonly module: CardModuleDoc
  readonly t: ShellT
  readonly saveBlock: (module: CardModuleDoc, blockId: string, text: string, expected: string) => Promise<EditorSaveResult>
}) {
  const first = module.blocks.find((b): b is CardBlockView & { kind: 'text' } => b.kind === 'text')
  const [text, setText] = useState(first?.text ?? '')
  useEffect(() => { setText(first?.text ?? '') }, [first?.id, first?.text])
  return (
    <textarea className="nv-blk-area nv-modbox-html" value={text} placeholder={t('editor.widget.ph')}
      onChange={e => setText(e.target.value)}
      onBlur={() => { if (first !== undefined && text !== (first.text ?? '')) void saveBlock(module, first.id, text, first.text ?? '') }} />
  )
}

/**
 * 卡页。`focusModuleId` 是树行深链：加载完成后滚到该模块盒。
 * @param props - 卡地址、读写注入、切回卡级管理的回调。
 * @returns 头栏 + 模块堆叠 + 添加模块区 + 角色盒。
 */
export function CardPage({ addr, cardId, focusModuleId, autoLibrary, t, loadCard, op, onAdmin }: {
  readonly addr: CardAddr
  readonly cardId: string
  readonly focusModuleId?: string
  /** 树里卡行尾「＋」直达：就绪即弹模块库（一次性信号，标签上已清）。 */
  readonly autoLibrary?: boolean
  readonly t: ShellT
  readonly loadCard: (addr: CardAddr, cardId: string) => Promise<CardState | undefined>
  readonly op: (addr: CardAddr, op: import('./card-api.ts').CardOp) => Promise<CardOpResult>
  readonly onAdmin: () => void
}) {
  const [state, setState] = useState<CardState | 'loading' | undefined>('loading')
  const [targetId, setTargetId] = useState<string | undefined>(undefined)
  const [version, setVersion] = useState('')
  const [notice, setNotice] = useState<string | undefined>(undefined)
  const [library, setLibrary] = useState(false)
  const [rolesOpen, setRolesOpen] = useState(false)

  const mdLabels = useMemo<MdLabels>(() => ({
    code: {
      copyLabel: t('editor.md.copy'),
      copiedLabel: t('editor.md.copied'),
      toolbarLabels: { codeLabel: t('editor.md.code'), wrapLabel: t('editor.md.wrap'), unwrapLabel: t('editor.md.unwrap') },
    },
    footnotes: '',
  }), [t])

  const doc: CardDocView | undefined = typeof state === 'object' && state !== null ? state.document : undefined
  const target = doc === undefined ? undefined
    : targetId === undefined || targetId === doc.id ? doc
    : doc.characters.find(c => c.id === targetId)

  const refresh = useCallback(async () => {
    const next = await loadCard(addr, cardId)
    if (next !== undefined) setVersion(next.version)
    setState(next)
  }, [addr, cardId, loadCard])

  useEffect(() => {
    let live = true
    setState('loading')
    void loadCard(addr, cardId).then(next => {
      if (!live) return
      setState(next)
      if (next !== undefined) setVersion(next.version)
    })
    return () => { live = false }
  }, [addr, cardId, loadCard])

  // 树里卡行尾「＋」：卡页进来直接弹模块库。
  useEffect(() => { if (autoLibrary === true) setLibrary(true) }, [autoLibrary])

  // 树深链：模块落在哪个 target 就切过去并滚动定位。
  useEffect(() => {
    if (focusModuleId === undefined || doc === undefined) return
    if (findModule(doc.modules, focusModuleId) === undefined) {
      const owner = doc.characters.find(c => findModule(c.modules, focusModuleId) !== undefined)
      if (owner !== undefined) setTargetId(owner.id)
    } else {
      setTargetId(undefined)
    }
    requestAnimationFrame(() => {
      document.getElementById(`nv-cardpage-sec-${focusModuleId}`)?.scrollIntoView({ behavior: 'smooth', block: 'start' })
    })
  }, [focusModuleId, doc])

  const saveBlock = useCallback(async (module: CardModuleDoc, blockId: string, text: string, expected: string): Promise<EditorSaveResult> => {
    try {
      const result = await op(addr, {
        op: 'apply', cardId, targetId, version,
        command: { kind: 'write_text', moduleId: module.id, blockId, moduleName: module.name, text, expectedContent: expected },
      })
      if (result.version !== undefined) setVersion(result.version)
      void refresh()
      return 'ok'
    } catch (error: unknown) {
      if (error instanceof CardConflict) { setNotice(t('editor.conflict')); void refresh(); return 'conflict' }
      setNotice(String(error instanceof Error ? error.message : error))
      return 'error'
    }
  }, [addr, cardId, op, refresh, t, targetId, version])

  const addBlock = useCallback(async (module: CardModuleDoc, text: string): Promise<EditorSaveResult> => {
    try {
      const result = await op(addr, {
        op: 'apply', cardId, targetId, version,
        command: { kind: 'write_text', moduleId: module.id, blockId: null, moduleName: module.name, text },
      })
      if (result.version !== undefined) setVersion(result.version)
      void refresh()
      return 'ok'
    } catch (error: unknown) {
      setNotice(String(error instanceof Error ? error.message : error))
      return 'error'
    }
  }, [addr, cardId, op, refresh, targetId, version])

  const addModule = useCallback((widget: string | undefined, name?: string) => {
    if (target === undefined) return
    setLibrary(false)
    void op(addr, {
      op: 'apply', cardId, targetId, version,
      command: { kind: 'add_module', name: name ?? t('editor.module.defaultName'), ...(widget !== undefined ? { widget } : {}) },
    }).then(result => { if (result.version !== undefined) setVersion(result.version); void refresh() })
      .catch((error: unknown) => setNotice(String(error instanceof Error ? error.message : error)))
  }, [addr, cardId, op, refresh, t, target, targetId, version])

  const imageUrl = useCallback((resourceId: string): string => {
    const ref = typeof state === 'object' && state !== null
      ? state.resources.find(r => r.id === resourceId)?.ref
      : undefined
    return ref === undefined || typeof state !== 'object' || state === null
      ? '' : cardContentUrl(addr.root ?? '', state.dir, ref)
  }, [addr.root, state])

  if (state === 'loading') return <div className="nv-canvas-missing">{t('canvas.files.loading')}</div>
  if (state === undefined || doc === undefined || target === undefined) {
    return <div className="nv-canvas-missing">{t('cardpage.missing')}</div>
  }
  const kindLabel = t(doc.kind === 'WORLD' ? 'card.kind.world' : 'card.kind.character')
  const quickKinds: readonly { label: string; widget?: string; soon?: boolean }[] = [
    { label: t('modules.tile.doc') },
    { label: t('editor.widget.kind.timeline'), soon: true },
    { label: t('editor.widget.kind.map'), soon: true },
    { label: t('editor.widget.kind.collection'), soon: true },
    { label: t('modules.more') },
  ]
  return (
    <div className="nv-cardpage">
      <header className="nv-cardpage-head">
        <span className="nv-cardpage-kind">{kindLabel}</span>
        <span className="nv-cardpage-name">{doc.name}</span>
        {state.hasDraft && <span className="nv-cardpage-draft">{t('me.draft')}</span>}
        <button type="button" className="nv-cardpage-admin" onClick={onAdmin}>{t('cardpage.admin')}</button>
      </header>
      {notice !== undefined && <div className="nv-canvas-conflict">{notice}</div>}
      <div className="nv-cardpage-scroll">
        {targetId !== undefined && (
          <button type="button" className="nv-cardpage-back" onClick={() => setTargetId(undefined)}>
            ‹ {doc.name}
          </button>
        )}
        {target.modules.length === 0 && (
          <div className="nv-canvas-missing">{t('cardpage.empty')}</div>
        )}
        {target.modules.map(module => (
          <ModuleBox key={module.id} module={module} depth={0} t={t} mdLabels={mdLabels}
            imageUrl={imageUrl} saveBlock={saveBlock} addBlock={addBlock} />
        ))}
        <button type="button" className="nv-cardpage-addzone" onClick={() => setLibrary(true)}>
          <span className="nv-cardpage-addplus">＋</span>
          <span className="nv-cardpage-addlabel">{t('modules.add')}</span>
          <span className="nv-cardpage-chips">
            {quickKinds.map((row, i) => (
              <span key={i} className={`nv-cardpage-chip${row.soon === true ? ' nv-cardpage-chip-soon' : ''}`}
                title={row.soon === true ? t('modules.soon') : undefined}
                onClick={e => {
                  e.stopPropagation()
                  if (row.soon === true) return
                  if (row.label === t('modules.more')) setLibrary(true)
                  else addModule(row.widget, row.widget === undefined ? t('modules.tile.doc') : undefined)
                }}>{row.label}</span>
            ))}
          </span>
        </button>
        {targetId === undefined && doc.characters.length > 0 && (
          <section className="nv-modbox nv-cardpage-rolesbox">
            <button type="button" className="nv-cardpage-roleshead" onClick={() => setRolesOpen(v => !v)}>
              <span className={`nv-tree-fold${rolesOpen ? ' nv-tree-fold-on' : ''}`}>›</span>
              <span>{fmt(t, 'cardpage.roles', { count: doc.characters.length })}</span>
            </button>
            {rolesOpen && doc.characters.map(character => (
              <button key={character.id} type="button" className="nv-tree-row nv-tree-module"
                onClick={() => setTargetId(character.id)}>
                <span className="nv-tree-glyph">♙</span>
                <span className="nv-tree-name">{character.name}</span>
              </button>
            ))}
          </section>
        )}
      </div>
      {library && (
        <ModuleLibrary t={t} onClose={() => setLibrary(false)}
          onPick={widget => addModule(widget)} />
      )}
    </div>
  )
}
