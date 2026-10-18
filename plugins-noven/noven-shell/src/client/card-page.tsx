/**
 * 卡页 — 画布里的"卡"对象体：分页结构，一个模块一页。点树里的模块行
 * 切页；默认页是「总览」——把其余各页的成果缩略聚合过来，只读 + 跳转。
 * 模块页内正文走通用编辑器（块级点编），预制模块（时间线/关系图/地图）
 * 自带完整详情界面。
 * @module noven-shell/client/card-page
 */
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type { SessionId } from '@deepseek-ai/dsh-session/types'
import { MarkdownDelegateProvider, Menu } from '@deepseek-ai/dsh-client-ui-primitives'
import type { CardAddr, CardBlockView, CardDocView, CardModuleDoc, CardOpResult, CardState } from './card-api.ts'
import { CardConflict, cardContentUrl, fetchCard } from './card-api.ts'
import { findModule } from './pages/CardEditor.tsx'
import { BlockEditor, type EditableBlock, type EditorSaveResult, type MdLabels } from './editor.tsx'
import { CollectionWidget, MiniRelation, MiniTimeline, RelationWidget, TimelineWidget, chipTone, coll, collText, mapData, rel, tl, type RefBacklink, type RefTarget, type WidgetSend } from './widgets.tsx'
import { MapEditor } from './map-editor.tsx'
import { fmt, type ShellT } from './pages/Home.tsx'
import { glyph } from './icons.tsx'
import { InlineRename, notifyUndo, useArmedMenu } from './ui/interact.tsx'
import { useRetainedCard, useRetainedScroll } from './ui/retain.ts'
import { MODLIB_ART } from './modlib-art.ts'
import { islandDoc } from './stage-island.tsx'

/** 卡页认领的深链协议：noven://card/<id>[/module/<id>] 与 noven://file/<路径>。 */
const NOVEN_LINK_PROTOCOLS = ['noven:']

/** 模块类型名 → 视图字典键（与内容树同一套语义图标无关，名字走 locale）。 */
const WIDGET_LABEL: Record<string, string> = {
  collection: 'editor.widget.kind.collection',
}

interface ModuleLibraryProps {
  readonly t: ShellT
  readonly onPick: (widget: string | undefined, name: string) => void
  readonly onClose: () => void
}

/** 模块库瓦片：`art` 是缩略图键；空 art = 虚线空盒；`wide` 跨两列（AI 块）。 */
interface ModTile {
  readonly id: string
  readonly label: string
  readonly art?: string
  readonly widget?: string
  readonly soon?: boolean
  readonly wide?: boolean
  readonly mint?: boolean
}

const AI_TILE: Pick<ModTile, 'id' | 'widget' | 'wide' | 'mint'> = { id: 'ai', widget: 'html', wide: true, mint: true }

/** 模块库（设计稿 11）：新建对话框 + 预制模块/Studio 双 tab + 三列缩略图格。
    专用编辑器未开放的类型置灰注明，不放假钮。 */
function ModuleLibrary({ t, onPick, onClose }: ModuleLibraryProps) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent): void => { if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', onKey)
    return () => { window.removeEventListener('keydown', onKey) }
  }, [onClose])
  const [tab, setTab] = useState<'preset' | 'studio'>('preset')
  const presets: readonly ModTile[] = [
    { id: 'doc', label: t('modules.tile.doc'), art: 'doc' },
    { id: 'timeline', label: t('modules.tile.timeline'), art: 'timeline', widget: 'timeline' },
    { id: 'map', label: t('modules.tile.map'), art: 'map', widget: 'map' },
    { id: 'factions', label: t('modules.tile.factions'), art: 'factions', soon: true },
    { id: 'relation', label: t('modules.tile.relation'), art: 'relation', widget: 'relation' },
    { id: 'gallery', label: t('modules.tile.gallery'), art: 'gallery', soon: true },
    { id: 'collection', label: t('modules.tile.collection'), art: 'factions', widget: 'collection' },
  ]
  const ai: ModTile = { ...AI_TILE, label: t('modules.tile.ai') }
  const tiles = tab === 'preset' ? [...presets, ai] : [ai]
  return (
    <div className="nv-create-veil" onClick={onClose}>
      <div className="nv-modlib" role="dialog" aria-modal="true" onClick={e => e.stopPropagation()}>
        <div className="nv-modlib-head">
          <span className="nv-modlib-title">{t('modules.title')}</span>
          <button type="button" className="nv-canvas-tabx" aria-label={t('create.cancel')} onClick={onClose}>×</button>
        </div>
        <div className="nv-modlib-tabs">
          {(['preset', 'studio'] as const).map(id => (
            <button key={id} type="button"
              className={`nv-modlib-tab${tab === id ? ' nv-modlib-tab-on' : ''}`}
              onClick={() => setTab(id)}>{t(id === 'preset' ? 'modules.tab.preset' : 'modules.tab.studio')}</button>
          ))}
        </div>
        <div className="nv-modlib-grid">
          {tiles.map(tile => (
            <button key={tile.id} type="button"
              className={`nv-modlib-tile${tile.wide === true ? ' nv-modlib-tile-wide' : ''}${tile.mint === true ? ' nv-modlib-tile-mint' : ''}`}
              disabled={tile.soon === true}
              title={tile.soon === true ? t('modules.soon') : undefined}
              onClick={() => onPick(tile.widget, tile.label)}>
              {tile.mint === true ? (
                <span className="nv-modlib-aibody">
                  <span className="nv-modlib-aiglyph">{glyph.sparkle(22)}</span>
                  <span className="nv-modlib-tilename">{tile.label}</span>
                </span>
              ) : tile.art !== undefined ? (
                <img className="nv-modlib-art" src={MODLIB_ART[tile.art]} alt="" />
              ) : (
                <span className="nv-modlib-emptyart">＋</span>
              )}
              {tile.mint !== true && <span className="nv-modlib-tilename">{tile.label}</span>}
            </button>
          ))}
        </div>
        <div className="nv-modlib-foot">{t('modules.foot')}</div>
      </div>
    </div>
  )
}

/** 「总览」模块的判定：起手模块带 widget.type='overview'；旧卡退化为约定名。 */
function isOverviewModule(module: CardModuleDoc): boolean {
  return module.widget?.type === 'overview' || module.name === '设定总览'
}

/** 模块类型名 → 树/总览共用的语义图标。 */
const MODULE_GLYPH: Record<string, (size: number) => ReturnType<typeof glyph.file>> = {
  overview: glyph.bolt,
  timeline: glyph.clock,
  collection: glyph.layers,
  map: glyph.map,
  html: glyph.code,
  relation: glyph.users,
}

function moduleGlyph(module: CardModuleDoc, size: number): ReturnType<typeof glyph.file> {
  const icon = MODULE_GLYPH[module.widget?.type ?? ''] ?? glyph.file
  return icon(size)
}

/** 一个模块盒：标题（点击即改名）+ 正文（块级点编 / 预制模块渲染器）。
    子模块不再在盒内堆叠——它们是独立页面，盒尾给跳转行。 */
function ModuleBox({ module, t, mdLabels, card, imageUrl, imageResources, saveBlock, addBlock, renameModule, removeModule, send, onOpenModule, ask, readFile, onOpenFile, refTargets, refEdges, mapReferenced }: {
  readonly module: CardModuleDoc
  readonly t: ShellT
  readonly mdLabels: MdLabels
  /** 宿主卡身份——html 模块的 NOVEN_FRAME.card 拿它。 */
  readonly card: { readonly name: string; readonly kind: string | undefined }
  readonly imageUrl: (resourceId: string) => string
  /** 本卡可用的图片资源（地图选底图用）。 */
  readonly imageResources: readonly { readonly id: string }[]
  readonly saveBlock: (module: CardModuleDoc, blockId: string, text: string, expected: string) => Promise<EditorSaveResult>
  readonly addBlock: (module: CardModuleDoc, text: string) => Promise<EditorSaveResult>
  readonly renameModule: (module: CardModuleDoc, name: string) => void
  /** 删除模块（宿主负责回执与撤销）。 */
  readonly removeModule: (module: CardModuleDoc) => void
  /** 预制模块的编辑命令直发（apply + 刷新由宿主负责）。 */
  readonly send: WidgetSend
  /** 打开另一个模块的页签。 */
  readonly onOpenModule: (moduleId: string) => void
  /** 引用选择器的目标卡（项目引用索引）。 */
  readonly refTargets?: readonly RefTarget[]
  /** 同卡引用派生的关系边（渲染用，不落盘）。 */
  readonly refEdges?: readonly { readonly from: string, readonly to: string, readonly label: string }[]
  /** 被集合条目引用到的地点名（地图按引用过滤）。 */
  readonly mapReferenced?: ReadonlySet<string>
  /** 模块向本会话排一句话（AI 任务入口）。 */
  readonly ask: (text: string) => Promise<void>
  /** 读项目内文件文本（html 模块的活引用渲染）。 */
  readonly readFile?: (path: string) => Promise<string | undefined>
  /** 打开项目文件到画布页签。 */
  readonly onOpenFile?: (path: string) => void
}) {
  const [renaming, setRenaming] = useState(false)
  const [modMenu, setModMenu] = useState(false)
  const arm = useArmedMenu(useMemo(() => [{ id: 'delete', confirmLabel: t('ui.armed.delete') }], [t]))
  const widget = module.widget?.type
  const blocks: EditableBlock[] = module.blocks.map(b => b.kind === 'text'
    ? { id: b.id, kind: 'text' as const, text: b.text ?? '', ref: b.ref }
    : { id: b.id, kind: 'image' as const, imageUrl: b.resourceId === undefined ? undefined : imageUrl(b.resourceId), caption: b.caption })
  return (
    <section className="nv-modbox">
      <div className="nv-modbox-head">
        {renaming ? (
          <InlineRename className="nv-modbox-rename" value={module.name}
            onDone={next => { setRenaming(false); if (next !== undefined) renameModule(module, next) }} />
        ) : (
          <h2 className="nv-modbox-title" onClick={() => setRenaming(true)}>{module.name}</h2>
        )}
        <Menu open={modMenu} side="bottom" align="end" selection="fill" listClassName="nv-tree-newmenu"
          onClose={() => { arm.reset(); setModMenu(false) }}
          onSelect={id => {
            if (arm.select(id) === 'armed') return
            setModMenu(false)
            if (id === 'copy') void send({ kind: 'copy_module', moduleId: module.id })
            if (id === 'delete') removeModule(module)
          }}
          items={arm.decorate([
            { id: 'copy', label: t('editor.module.copy') },
            { id: 'delete', label: t('editor.module.remove'), danger: true },
          ])}
          anchor={(
            <button type="button" className="nv-modbox-more" aria-label={t('tree.mod.more')}
              onClick={() => setModMenu(v => !v)}>⋯</button>
          )} />
      </div>
      {widget === 'timeline' && <TimelineWidget module={module} t={t} send={send} />}
      {widget === 'relation' && <RelationWidget module={withDerivedRelation(module, refEdges)} t={t} send={send} imageUrl={imageUrl} />}
      {widget === 'map' && <MapEditor module={module} t={t} send={send} ask={ask} imageUrl={imageUrl} imageResources={imageResources} referenced={mapReferenced} />}
      {widget === 'collection' && <CollectionWidget module={module} t={t} send={send} imageUrl={imageUrl} refTargets={refTargets} />}
      {widget !== undefined && widget !== 'document' && widget !== 'html'
        && widget !== 'timeline' && widget !== 'relation' && widget !== 'map' && widget !== 'collection' && (
        <div className="nv-modbox-widget">
          {fmt(t, 'modules.widgetSoon', { name: t((WIDGET_LABEL[widget] ?? 'editor.widget.name') as Parameters<ShellT>[0]) })}
        </div>
      )}
      {widget === 'html' && (
        <HtmlModule module={module} t={t} saveBlock={saveBlock} readFile={readFile} onOpenFile={onOpenFile}
          card={card} />
      )}
      {(widget === undefined || widget === 'document') && (
        <BlockEditor blocks={blocks} labels={mdLabels} t={t}
          onSaveBlock={(blockId, text, expected) => saveBlock(module, blockId, text, expected)}
          onAdd={text => addBlock(module, text)} />
      )}
      {module.children.length > 0 && (
        <div className="nv-page-children">
          {module.children.map(child => (
            <button key={child.id} type="button" className="nv-page-childlink" onClick={() => onOpenModule(child.id)}>
              <span className="nv-tree-glyph">{moduleGlyph(child, 13)}</span>
              <span>{child.name}</span>
            </button>
          ))}
        </div>
      )}
    </section>
  )
}

/** HTML 小组件模块：widget.path 是项目文件活引用（实时读 + 沙箱 iframe + 打开源文件）；否则源码一块，始终可编（write_text 整块覆盖）。 */
function HtmlModule({ module, t, saveBlock, readFile, onOpenFile, card }: {
  readonly module: CardModuleDoc
  readonly t: ShellT
  readonly saveBlock: (module: CardModuleDoc, blockId: string, text: string, expected: string) => Promise<EditorSaveResult>
  readonly readFile?: (path: string) => Promise<string | undefined>
  readonly onOpenFile?: (path: string) => void
  /** 宿主卡身份——经 islandDoc 注入为 NOVEN_FRAME.card。 */
  readonly card: { readonly name: string; readonly kind: string | undefined }
}) {
  const path = module.widget?.path
  const [fileText, setFileText] = useState<string | null | undefined>(undefined)
  useEffect(() => {
    if (path === undefined || readFile === undefined) { setFileText(undefined); return }
    let live = true
    setFileText(undefined)
    void readFile(path).then(text => { if (live) setFileText(text ?? null) })
    return () => { live = false }
  }, [path, readFile])
  // 卡内 html 模块也走岛契约：NOVEN_FRAME.card=宿主卡、base=文件目录、
  // theme=产品色。asset/query/compose 出站暂时没有卡内接收方——挂着不拦。
  const srcDoc = useMemo(() => {
    if (typeof fileText !== 'string') return undefined
    const cs = getComputedStyle(document.documentElement)
    const dir = path !== undefined && path.includes('/') ? path.slice(0, path.lastIndexOf('/')) : ''
    return islandDoc(fileText, {
      card,
      base: dir,
      theme: {
        dark: false,
        accent: cs.getPropertyValue('--nv-accent').trim(),
        text: cs.getPropertyValue('--nv-primary-text').trim(),
        surface: cs.getPropertyValue('--nv-surface').trim(),
      },
    })
  }, [fileText, path, card])
  if (path !== undefined) {
    const name = path.split('/').pop() ?? path
    return (
      <div className="nv-htmlfile">
        <div className="nv-htmlfile-bar">
          <span className="nv-tree-glyph">{glyph.code(13)}</span>
          <span className="nv-htmlfile-name">{name}</span>
          {onOpenFile !== undefined && (
            <button type="button" className="nv-htmlfile-open" onClick={() => onOpenFile(path)}>{t('editor.file.open')}</button>
          )}
        </div>
        {fileText === undefined && <div className="nv-htmlfile-empty">{t('canvas.files.loading')}</div>}
        {fileText === null && <div className="nv-htmlfile-empty">{t('editor.file.missing')}</div>}
        {srcDoc !== undefined && (
          <iframe className="nv-ed-iframe" title={module.name} sandbox="allow-scripts" srcDoc={srcDoc} style={{ height: module.widget?.height ?? 320 }} />
        )}
      </div>
    )
  }
  const first = module.blocks.find((b): b is CardBlockView & { kind: 'text' } => b.kind === 'text')
  const [text, setText] = useState(first?.text ?? '')
  useEffect(() => { setText(first?.text ?? '') }, [first?.id, first?.text])
  return (
    <textarea className="nv-blk-area nv-modbox-html" value={text} placeholder={t('editor.widget.ph')}
      onChange={e => setText(e.target.value)}
      onBlur={() => { if (first !== undefined && text !== (first.text ?? '')) void saveBlock(module, first.id, text, first.text ?? '') }} />
  )
}

/** 总览里一页模块的成果行：图标 + 名 + 摘要 + 迷你图，点击翻到那一页。 */
function OverviewTile({ module, t, imageUrl, onOpen }: {
  readonly module: CardModuleDoc
  readonly t: ShellT
  readonly imageUrl: (resourceId: string) => string
  readonly onOpen: () => void
}) {
  const widget = module.widget?.type
  const excerpt = module.blocks.find(b => b.kind === 'text')?.text?.trim() ?? ''
  const summary = ((): string => {
    if (widget === 'timeline') {
      const d = tl(module.widget?.data)
      return fmt(t, 'ov.sum.timeline', { eras: d.eras.length, events: d.events.length })
    }
    if (widget === 'relation') {
      const d = rel(module.widget?.data)
      return fmt(t, 'ov.sum.relation', { nodes: d.nodes.length, edges: d.edges.length })
    }
    if (widget === 'map') return fmt(t, 'ov.sum.map', { markers: mapData(module.widget?.data).markers.length })
    if (widget === 'collection') return fmt(t, 'ov.sum.collection', { count: coll(module.widget?.data).items.length })
    if (widget === 'html') return t('ov.sum.html')
    const chars = module.blocks.reduce((n, b) => n + (b.text?.length ?? 0), 0)
    return chars === 0 ? t('ov.sum.emptyDoc') : fmt(t, 'editor.wordcount', { count: chars })
  })()
  const imageBlock = widget === 'map' ? module.blocks.find(b => b.kind === 'image') : undefined
  return (
    <button type="button" className="nv-ov-tile" onClick={onOpen}>
      <span className="nv-ov-mini">
        {widget === 'timeline' && <MiniTimeline data={tl(module.widget?.data)} />}
        {widget === 'relation' && <MiniRelation data={rel(module.widget?.data)} />}
        {widget === 'map' && imageBlock?.resourceId !== undefined && (
          <img className="nv-ov-mapimg" src={imageUrl(imageBlock.resourceId)} alt="" />
        )}
        {(widget === undefined || widget === 'document') && excerpt !== '' && (
          <span className="nv-ov-excerpt">{excerpt.slice(0, 140)}</span>
        )}
        {widget === 'html' && <span className="nv-ov-htmlglyph">{glyph.code(26)}</span>}
        {widget === 'collection' && (() => {
          const data = coll(module.widget?.data)
          const item = data.items[0]
          const values = item === undefined ? undefined : data.values[item.id]
          const imageField = data.fields.find(field => field.type === 'image')
          const thumbs = imageField === undefined ? [] : data.items
            .map(candidate => candidate.visualKey)
            .filter((key): key is string => key !== null)
            .slice(0, 3)
          const rows = data.fields.filter(field => field.type !== 'image' && field.type !== 'chips').slice(0, 3)
          const chipField = data.fields.find(field => field.type === 'chips')
          const chips = chipField === undefined || values === undefined ? [] : collText(values[chipField.id]).split('、').map(part => part.trim()).filter(part => part !== '').slice(0, 4)
          return (
            <span className="nv-ov-collpreview">
              {thumbs.length > 0 && <span className="nv-ov-thumbs">{thumbs.map(key => <img key={key} src={imageUrl(key)} alt="" />)}</span>}
              {rows.map(field => {
                const value = values === undefined ? '' : collText(values[field.id])
                return (
                  <span key={field.id} className="nv-ov-prow">
                    <span className="nv-ov-plabel">{field.name}</span>
                    {field.name === '立场' && value !== ''
                      ? <span className={`nv-coll-chip nv-coll-chip-${chipTone(value)}`}>{value}</span>
                      : <span className="nv-ov-pvalue">{value === '' ? '—' : value}</span>}
                  </span>
                )
              })}
              {chips.length > 0 && <span className="nv-ov-pchips">{chips.map(chip => <span key={chip} className="nv-coll-chip nv-coll-chip-neutral">{chip}</span>)}</span>}
            </span>
          )
        })()}
      </span>
      <span className="nv-ov-info">
        <span className="nv-ov-name">{moduleGlyph(module, 14)}{module.name}</span>
        <span className="nv-ov-sum">{summary}</span>
      </span>
      <span className="nv-ov-go">{t('ov.open')} ›</span>
    </button>
  )
}

/**
 * 总览页：这张卡其余各页的成果橱窗——每页一块，只读摘要 + 迷你图 + 跳转；
 * 总览模块自己写的文字块作为页首导语（仍可直接编辑）。
 */
function OverviewPage({ target, overviewModule, isCharacter, cardKind, t, mdLabels, imageUrl, imageResources, saveBlock, addBlock, roles, rolesOpen, onToggleRoles, onOpenRole, onOpenModule, onAdd, backlinks, onOpenRefCard }: {
  readonly target: Omit<CardDocView, 'characters'> | CardDocView
  readonly overviewModule: CardModuleDoc | undefined
  readonly isCharacter: boolean
  /** 宿主卡种类：总览按卡型挑选要展示的模块。 */
  readonly cardKind?: string
  readonly t: ShellT
  readonly mdLabels: MdLabels
  readonly imageUrl: (resourceId: string) => string
  readonly imageResources: readonly { readonly id: string }[]
  readonly saveBlock: (module: CardModuleDoc, blockId: string, text: string, expected: string) => Promise<EditorSaveResult>
  readonly addBlock: (module: CardModuleDoc, text: string) => Promise<EditorSaveResult>
  readonly roles: readonly Omit<CardDocView, 'characters'>[]
  readonly rolesOpen: boolean
  readonly onToggleRoles: () => void
  readonly onOpenRole: (id: string) => void
  readonly onOpenModule: (moduleId: string) => void
  readonly onAdd: () => void
  /** 反查索引：谁通过引用字段指向了这张卡。 */
  readonly backlinks?: readonly RefBacklink[]
  /** 点被引用行：打开来源卡。 */
  readonly onOpenRefCard?: (cardId: string) => void
}) {
  const flattenLeaves = (modules: readonly CardModuleDoc[]): CardModuleDoc[] => modules.flatMap(module =>
    module.children.length === 0 ? [module] : flattenLeaves(module.children))
  const tiles = flattenLeaves(target.modules.filter(m => !isOverviewModule(m)))
  // 总览不是目录：按卡型挑一组固定模块，其余留给抽屉树。
  const curatedNames = cardKind === 'CHARACTER'
    ? ['基本信息', '关系图', '时间线', '多形态', '语录']
    : cardKind === 'WORLD'
      ? ['力量与规则', '禁忌与代价', '地图', '地区名录', '势力名录', '种族名录', '时间线', '关系图']
      : []
  const curatedTiles = curatedNames.flatMap(name => tiles.filter(tile => tile.name === name).slice(0, 1))
  const shownTiles = curatedTiles.length > 0 ? curatedTiles : tiles
  const introBlocks: EditableBlock[] = (overviewModule?.blocks ?? []).map(b => b.kind === 'text'
    ? { id: b.id, kind: 'text' as const, text: b.text ?? '', ref: b.ref }
    : { id: b.id, kind: 'image' as const, imageUrl: b.resourceId === undefined ? undefined : imageUrl(b.resourceId), caption: b.caption })
  return (
    <div className="nv-ov">
      {overviewModule !== undefined && introBlocks.length > 0 && (
        <div className="nv-ov-intro">
          <BlockEditor blocks={introBlocks} labels={mdLabels} t={t}
            onSaveBlock={(blockId, text, expected) => saveBlock(overviewModule, blockId, text, expected)}
            onAdd={text => addBlock(overviewModule, text)} />
        </div>
      )}
      {tiles.length === 0 && <div className="nv-canvas-missing">{t('ov.empty')}</div>}
      <div className="nv-ov-grid">
        {shownTiles.map(module => (
          <OverviewTile key={module.id} module={module} t={t} imageUrl={imageUrl}
            onOpen={() => onOpenModule(module.id)} />
        ))}
      </div>
      <button type="button" className="nv-cardpage-add" onClick={onAdd}>
        ＋ {t('modules.add')}
      </button>
      {!isCharacter && roles.length > 0 && (
        <section className="nv-modbox nv-cardpage-rolesbox">
          <button type="button" className="nv-cardpage-roleshead" onClick={onToggleRoles}>
            <span className={`nv-tree-fold${rolesOpen ? ' nv-tree-fold-on' : ''}`}>›</span>
            <span>{fmt(t, 'cardpage.roles', { count: roles.length })}</span>
          </button>
          {rolesOpen && roles.map(character => (
            <button key={character.id} type="button" className="nv-tree-row nv-tree-module"
              onClick={() => onOpenRole(character.id)}>
              <span className="nv-tree-glyph">♙</span>
              <span className="nv-tree-name">{character.name}</span>
            </button>
          ))}
        </section>
      )}
      {backlinks !== undefined && backlinks.length > 0 && (
        <section className="nv-ov-refs">
          <h3 className="nv-ov-refshead">{fmt(t, 'ov.refs', { count: backlinks.length })}</h3>
          {backlinks.map((entry, index) => (
            <button key={`${entry.fromCardId}:${entry.moduleId}:${entry.fieldId}:${String(index)}`} type="button"
              className="nv-ov-refrow" onClick={() => onOpenRefCard?.(entry.fromCardId)}>
              <span className="nv-ov-refname">{entry.fromCardName}</span>
              <span className="nv-ov-refmeta">{entry.moduleName} · {entry.fieldName} · {entry.itemName}</span>
            </button>
          ))}
        </section>
      )}
    </div>
  )
}

/** 把集合引用派生的边并进关系图（仅渲染，不写回载荷）。 */
function withDerivedRelation(module: CardModuleDoc, derived?: readonly { readonly from: string, readonly to: string, readonly label: string }[]): CardModuleDoc {
  if (derived === undefined || derived.length === 0 || module.widget === undefined) return module
  const widget = module.widget
  const base = rel(module.widget?.data)
  const nodes = [...base.nodes]
  const edges = [...base.edges]
  for (const edge of derived) {
    for (const name of [edge.from, edge.to]) {
      if (!nodes.some(node => node.name === name)) nodes.push({ id: `ref:${name}`, name, note: '', x: null, y: null })
    }
    const from = nodes.find(node => node.name === edge.from)
    const to = nodes.find(node => node.name === edge.to)
    if (from === undefined || to === undefined) continue
    if (edges.some(candidate => candidate.from === from.id && candidate.to === to.id && candidate.label === edge.label)) continue
    edges.push({ id: `ref:${from.id}:${to.id}:${edge.label}`, from: from.id, to: to.id, label: edge.label })
  }
  const baseData = typeof widget.data === 'object' && widget.data !== null ? widget.data : {}
  return { ...module, widget: { ...widget, data: { ...baseData, nodes, edges } } }
}

/**
 * 卡页。`pageModuleId` 是本页签的模块实体：undefined = 卡总览页，否则整页只渲那个模块。
 * @param props - 卡地址、读写注入、开其它页签的回调。
 * @returns 头栏 + 总览或单个模块页 + 模块库。
 */
export function CardPage({ addr, cardId, pageModuleId, autoLibrary, scrollKey, t, owner, loadCard, op, ask, readFile, onOpenFile, onOpenCard }: {
  readonly addr: CardAddr
  readonly cardId: string
  readonly pageModuleId?: string
  /** 树里卡行尾「＋」直达：就绪即弹模块库（一次性信号，标签上已清）。 */
  readonly autoLibrary?: boolean
  /** 滚动留存键（会话 × 页签）；不给则不记滚动。 */
  readonly scrollKey?: string
  /** 页签归属会话——无 root 时用它解析项目做引用索引。 */
  readonly owner?: SessionId
  readonly t: ShellT
  readonly loadCard: (addr: CardAddr, cardId: string) => Promise<CardState | undefined>
  readonly op: (addr: CardAddr, op: import('./card-api.ts').CardOp) => Promise<CardOpResult>
  /** 模块向本会话排一句话（地图「直接生成底图」这类 AI 任务入口）。 */
  readonly ask: (text: string) => Promise<void>
  /** 读项目内文件文本（html 模块活引用 / markdown 本地文件链接）。 */
  readonly readFile?: (path: string) => Promise<string | undefined>
  /** 打开项目文件到画布页签（markdown 文件链接、嵌入文件条的「打开文件」）。 */
  readonly onOpenFile?: (path: string) => void
  /** noven://card/<id>[/module/<id>] 深链：开卡总览页签或模块页签。 */
  readonly onOpenCard?: (cardId: string, moduleId?: string) => void
}) {
  /** 温层（设计理念 §14）：见过的卡直接渲快照、后台刷新，不回 loading。 */
  const retained = useRetainedCard(addr, cardId, loadCard)
  const state = retained.state
  const setState = retained.setState
  /** 总览页内钻角色：undefined = 卡根。 */
  const [roleId, setRoleId] = useState<string | undefined>(undefined)
  const [version, setVersion] = useState('')
  const [notice, setNotice] = useState<string | undefined>(undefined)
  const [library, setLibrary] = useState(false)
  const [cardMenu, setCardMenu] = useState(false)
  const [cardRenaming, setCardRenaming] = useState(false)
  const cardArm = useArmedMenu(useMemo(() => [{ id: 'delete', confirmLabel: t('ui.armed.delete') }], [t]))
  const [rolesOpen, setRolesOpen] = useState(false)
  /** 预览态：展示的是提案合并后的文档，编辑通道锁死（先接受或拒绝）。 */
  const [preview, setPreview] = useState<CardState | undefined>(undefined)
  const [refIndex, setRefIndex] = useState<{ readonly targets: readonly RefTarget[], readonly backlinks: Record<string, readonly RefBacklink[]> } | undefined>(undefined)
  useEffect(() => {
    const root = addr.root
    if (root === undefined && owner === undefined) return
    // 会话优先：会话能解析出项目，而页签的 addr.root 可能是空的。
    const refsUrl = owner !== undefined
      ? `api/noven-cards?refs=1&session=${encodeURIComponent(owner)}`
      : `api/noven-cards?refs=1&root=${encodeURIComponent(root ?? '')}`
    void fetch(new URL(refsUrl, document.baseURI).href)
      .then(response => response.ok ? response.json() as Promise<{ targets: readonly RefTarget[], backlinks: Record<string, readonly RefBacklink[]> }> : Promise.reject(new Error(String(response.status))))
      .then(setRefIndex)
      .catch(() => { /* 索引缺席只是没有选择器与反查，不阻塞卡页 */ })
  }, [addr.root, owner])

  const mdLabels = useMemo<MdLabels>(() => ({
    code: {
      copyLabel: t('editor.md.copy'),
      copiedLabel: t('editor.md.copied'),
      toolbarLabels: { codeLabel: t('editor.md.code'), wrapLabel: t('editor.md.wrap'), unwrapLabel: t('editor.md.unwrap') },
    },
    footnotes: '',
  }), [t])

  const doc: CardDocView | undefined = preview !== undefined ? preview.document
    : typeof state === 'object' && state !== null ? state.document : undefined
  const proposal = typeof state === 'object' && state !== null ? state.proposal : undefined
  /** 同卡引用派生：关系图额外边 + 地图被引用地点集合（渲染层派生，不落盘）。 */
  const refDerived = useMemo(() => {
    const edges: { from: string, to: string, label: string }[] = []
    const referenced = new Set<string>()
    if (doc === undefined) return { edges, referenced }
    const walk = (modules: readonly CardModuleDoc[]): void => {
      for (const module of modules) {
        if (module.widget?.type === 'collection') {
          const data = coll(module.widget.data)
          for (const item of data.items) {
            const values = data.values[item.id]
            if (values === undefined) continue
            for (const field of data.fields) {
              const value = values[field.id]
              if (typeof value !== 'object' || value === null || !('name' in value) || typeof value.name !== 'string') continue
              if (!('itemId' in value) || typeof value.itemId !== 'string') continue
              edges.push({ from: item.name, to: value.name, label: field.name })
              referenced.add(value.name)
            }
          }
        }
        walk(module.children)
      }
    }
    walk(doc.modules)
    return { edges, referenced }
  }, [doc])
  /** 模块页签：模块挂在哪个 target（卡根或某个角色）写操作就打到哪个 target。 */
  const pageOwner = doc === undefined || pageModuleId === undefined ? undefined
    : findModule(doc.modules, pageModuleId) !== undefined ? doc
    : doc.characters.find(c => findModule(c.modules, pageModuleId) !== undefined)
  const roleTarget = doc === undefined ? undefined
    : roleId === undefined || roleId === doc.id ? doc
    : doc.characters.find(c => c.id === roleId)
  const target = pageModuleId === undefined ? roleTarget : pageOwner
  const targetId = pageModuleId === undefined ? roleId
    : pageOwner !== undefined && pageOwner.id !== doc?.id ? pageOwner.id : undefined

  const refresh = retained.refresh
  const scrollRef = useRef<HTMLDivElement>(null)
  useRetainedScroll(scrollRef, scrollKey, typeof state === 'object' && state !== null)
  /** version 跟随最新快照（缓存命中与后台刷新都会推进它）。 */
  useEffect(() => { if (typeof state === 'object' && state !== null) setVersion(state.version) }, [state])

  // 树里卡行尾「＋」：卡页进来直接弹模块库。
  useEffect(() => { if (autoLibrary === true) setLibrary(true) }, [autoLibrary])

  /** noven:// 深链：card/<id>[/module/<id>] 开对应页签，file/<路径> 开文件页签。 */
  const openLink = useCallback((href: string) => {
    const url = new URL(href)
    const parts = url.pathname.split('/').filter(part => part !== '').map(part => decodeURIComponent(part))
    if (url.hostname === 'card') {
      const [linkedCard, segment, linkedModule] = parts
      if (linkedCard === undefined) return
      onOpenCard?.(linkedCard, segment === 'module' ? linkedModule : undefined)
      return
    }
    if (url.hostname === 'file' && parts.length > 0) onOpenFile?.(parts.join('/'))
  }, [onOpenCard, onOpenFile])

  /** 预览态下一切写都挡在门前——版本对应的是头稿，不是提案预览。 */
  const locked = preview !== undefined
  const saveBlock = useCallback(async (module: CardModuleDoc, blockId: string, text: string, expected: string): Promise<EditorSaveResult> => {
    if (locked) { setNotice(t('prop.locked')); return 'error' }
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
  }, [addr, cardId, locked, op, refresh, t, targetId, version])

  const addBlock = useCallback(async (module: CardModuleDoc, text: string): Promise<EditorSaveResult> => {
    if (locked) { setNotice(t('prop.locked')); return 'error' }
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
  }, [addr, cardId, locked, op, refresh, t, targetId, version])

  const renameModule = useCallback((module: CardModuleDoc, name: string) => {
    if (locked) { setNotice(t('prop.locked')); return }
    void op(addr, {
      op: 'apply', cardId, targetId, version,
      command: { kind: 'rename_module', moduleId: module.id, name },
    }).then(result => { if (result.version !== undefined) setVersion(result.version); void refresh() })
      .catch((error: unknown) => setNotice(String(error instanceof Error ? error.message : error)))
  }, [addr, cardId, locked, op, refresh, t, targetId, version])

  /** 预制模块命令直发：apply → 记 version → 刷新。错误进 notice 条。 */
  const send = useCallback<WidgetSend>(async command => {
    if (locked) { setNotice(t('prop.locked')); return }
    try {
      const result = await op(addr, { op: 'apply', cardId, targetId, version, command })
      if (result.version !== undefined) setVersion(result.version)
      void refresh()
    } catch (error: unknown) {
      setNotice(String(error instanceof Error ? error.message : error))
    }
  }, [addr, cardId, locked, op, refresh, t, targetId, version])

  /** 删模块 + 撤销回执：撤销走卡的 undo op（删除是最近一笔修订）。 */
  const removeModule = useCallback((module: CardModuleDoc) => {
    void send({ kind: 'remove_module', moduleId: module.id }).then(() => {
      notifyUndo({
        text: fmt(t, 'ui.receipt.moduleDeleted', { name: module.name }),
        undoLabel: t('ui.undo'),
        undo: () => {
          void op(addr, { op: 'undo', cardId }).then(result => { if (result.version !== undefined) setVersion(result.version); void refresh() })
            .catch((error: unknown) => setNotice(String(error instanceof Error ? error.message : error)))
        },
      })
    })
  }, [addr, cardId, op, refresh, send, t])

  const addModule = useCallback((widget: string | undefined, name?: string) => {
    if (target === undefined || locked) return
    setLibrary(false)
    void op(addr, {
      op: 'apply', cardId, targetId, version,
      command: { kind: 'add_module', name: name ?? t('editor.module.defaultName'), ...(widget !== undefined ? { widget } : {}) },
    }).then(result => { if (result.version !== undefined) setVersion(result.version); void refresh() })
      .catch((error: unknown) => setNotice(String(error instanceof Error ? error.message : error)))
  }, [addr, cardId, locked, op, refresh, t, target, targetId, version])

  /** 预览切换：拉 preview=1 的合并文档到独立的展示态。 */
  const togglePreview = useCallback(() => {
    if (preview !== undefined) { setPreview(undefined); return }
    void fetchCard(addr, cardId, true).then(next => {
      if (next === undefined) setNotice(t('editor.conflict'))
      else setPreview(next)
    })
  }, [addr, cardId, preview, t])

  /** 接受或拒绝整份提案；结算后退出预览并重拉。 */
  const settleProposal = useCallback((settle: 'accept' | 'reject') => {
    void op(addr, { op: settle, cardId })
      .then(() => { setPreview(undefined); void refresh() })
      .catch((error: unknown) => setNotice(String(error instanceof Error ? error.message : error)))
  }, [addr, cardId, op, refresh])

  const imageUrl = useCallback((resourceId: string): string => {
    const ref = typeof state === 'object' && state !== null
      ? state.resources.find(r => r.id === resourceId)?.ref
      : undefined
    return ref === undefined || typeof state !== 'object' || state === null
      ? '' : cardContentUrl(addr.root ?? '', state.dir, ref)
  }, [addr.root, state])

  if (state === 'loading') return <div className="nv-canvas-missing">{t('canvas.files.loading')}</div>
  if (state === undefined || doc === undefined) {
    return <div className="nv-canvas-missing">{t('cardpage.missing')}</div>
  }
  if (pageModuleId !== undefined && pageOwner === undefined) {
    return (
      <div className="nv-cardpage">
        <div className="nv-canvas-missing">
          <span>{t('cardpage.module.missing')}</span>
          <button type="button" className="nv-page-back" onClick={() => onOpenCard?.(cardId)}>‹ {doc.name}</button>
        </div>
      </div>
    )
  }
  if (target === undefined) {
    return <div className="nv-canvas-missing">{t('cardpage.missing')}</div>
  }
  const kindLabel = t(doc.kind === 'WORLD' ? 'card.kind.world' : 'card.kind.character')
  const overviewModule = target.modules.find(isOverviewModule)
  const foundPage = pageModuleId === undefined ? undefined : findModule(target.modules, pageModuleId)
  const pageModule = foundPage === undefined || isOverviewModule(foundPage) ? undefined : foundPage
  const imageResources = state.resources.filter(r => r.mediaType.startsWith('image/')).map(r => ({ id: r.id }))
  /** 合并请求只挂它碰过的页：模块页按 moduleId，概览页挂卡层/角色/无头稿页可去的兜底变更。 */
  const pageHasProposal = proposal !== undefined && proposal !== null && (() => {
    if (pageModuleId !== undefined) {
      return pageOwner !== undefined && proposal.changes.some(c => c.targetId === pageOwner.id && c.moduleId === pageModuleId)
    }
    return proposal.changes.some(c => {
      if (c.moduleId === target.id) return true
      if (c.targetId !== target.id) return false
      return findModule(target.modules, c.moduleId) === undefined
        && !doc.characters.some(ch => ch.id === c.moduleId)
    })
  })()
  return (
    <MarkdownDelegateProvider linkProtocols={NOVEN_LINK_PROTOCOLS} openLink={openLink} openFile={onOpenFile}>
    <div className="nv-cardpage">
      <header className="nv-cardpage-head">
        <span className="nv-cardpage-kind">{kindLabel}</span>
        {cardRenaming ? (
          <InlineRename className="nv-modbox-rename" value={doc.name}
            onDone={next => {
              setCardRenaming(false)
              if (next === undefined) return
              void op(addr, { op: 'apply', cardId, targetId, version, command: { kind: 'rename_card', name: next } })
                .then(result => { if (result.version !== undefined) setVersion(result.version); void refresh() })
                .catch((error: unknown) => setNotice(String(error instanceof Error ? error.message : error)))
            }} />
        ) : (
          <span className="nv-cardpage-name">{doc.name}</span>
        )}
        {state.hasDraft && <span className="nv-cardpage-draft">{t('me.draft')}</span>}
        <Menu open={cardMenu} side="bottom" align="end" selection="fill" listClassName="nv-tree-newmenu"
          onClose={() => { cardArm.reset(); setCardMenu(false) }}
          onSelect={id => {
            if (cardArm.select(id) === 'armed') return
            setCardMenu(false)
            if (id === 'rename') setCardRenaming(true)
            if (id === 'source' && state.dir !== undefined) onOpenFile?.(`卡/${state.dir}/card.json`)
            if (id === 'delete') {
              const name = doc.name
              void op(addr, { op: 'delete', cardId }).then(() => {
                setState(undefined)
                notifyUndo({
                  text: fmt(t, 'ui.receipt.cardDeleted', { name }),
                  undoLabel: t('ui.undo'),
                  undo: () => {
                    void op(addr, { op: 'restore', cardId }).then(() => refresh())
                      .catch((error: unknown) => setNotice(String(error instanceof Error ? error.message : error)))
                  },
                })
              }).catch((error: unknown) => setNotice(String(error instanceof Error ? error.message : error)))
            }
          }}
          items={cardArm.decorate([
            { id: 'rename', label: t('tree.card.rename') },
            ...(onOpenFile !== undefined ? [{ id: 'source', label: t('tree.card.showSource') }] : []),
            { id: 'delete', label: t('tree.card.delete'), danger: true },
          ])}
          anchor={(
            <button type="button" className="nv-cardpage-more" aria-label={t('tree.card.more')}
              onClick={() => setCardMenu(v => !v)}>⋯</button>
          )} />
      </header>
      {notice !== undefined && <div className="nv-canvas-conflict">{notice}</div>}
      {pageHasProposal && (
        <div className="nv-prop">
          <span className="nv-prop-badge">{fmt(t, 'prop.count', { count: proposal.changes.length })}</span>
          <span className="nv-prop-list">
            {proposal.changes.slice(0, 4).map(change => (
              <span key={`${change.moduleId}-${change.kind}`} className={`nv-prop-item${change.stale ? ' nv-prop-stale' : ''}`}>
                <i>{t(`prop.kind.${change.kind}`)}</i>{change.name}
              </span>
            ))}
            {proposal.changes.length > 4 && <span className="nv-prop-item">…</span>}
          </span>
          <span className="nv-prop-actions">
            <button type="button" className="nv-prop-btn" onClick={togglePreview}>
              {preview !== undefined ? t('prop.exitPreview') : t('prop.preview')}
            </button>
            <button type="button" className="nv-prop-btn nv-prop-accept" onClick={() => settleProposal('accept')}>{t('prop.accept')}</button>
            <button type="button" className="nv-prop-btn nv-prop-reject" onClick={() => settleProposal('reject')}>{t('prop.reject')}</button>
          </span>
        </div>
      )}
      <div className="nv-cardpage-scroll" ref={scrollRef}>
        {pageModuleId !== undefined ? (
          <div className="nv-cardpage-module">
            <button type="button" className="nv-page-back" onClick={() => onOpenCard?.(cardId)}>
              ‹ {target.id === doc.id ? doc.name : `${doc.name} · ${target.name}`}
            </button>
            {pageModule !== undefined ? (
              <ModuleBox module={pageModule} t={t} mdLabels={mdLabels}
                card={{ name: doc.name, kind: doc.kind }}
                imageUrl={imageUrl} imageResources={imageResources}
                saveBlock={saveBlock} addBlock={addBlock} renameModule={renameModule} removeModule={removeModule} send={send}
                onOpenModule={id => onOpenCard?.(cardId, id)} ask={ask} readFile={readFile} onOpenFile={onOpenFile}
                refTargets={refIndex?.targets} refEdges={refDerived.edges} mapReferenced={refDerived.referenced} />
            ) : (
              <OverviewPage target={target} overviewModule={overviewModule} isCharacter={target.id !== doc.id} cardKind={doc?.kind}
                t={t} mdLabels={mdLabels} imageUrl={imageUrl} imageResources={imageResources}
                saveBlock={saveBlock} addBlock={addBlock}
                roles={doc.characters} rolesOpen={rolesOpen}
                onToggleRoles={() => setRolesOpen(v => !v)} onOpenRole={setRoleId}
                onOpenModule={id => onOpenCard?.(cardId, id)} onAdd={() => setLibrary(true)}
                backlinks={refIndex?.backlinks[cardId]} onOpenRefCard={id => onOpenCard?.(id)} />
            )}
          </div>
        ) : (
          <>
            {roleId !== undefined && (
              <button type="button" className="nv-cardpage-back" onClick={() => setRoleId(undefined)}>
                ‹ {doc.name}
              </button>
            )}
            <OverviewPage target={target} overviewModule={overviewModule} isCharacter={roleId !== undefined} cardKind={doc?.kind}
              t={t} mdLabels={mdLabels} imageUrl={imageUrl} imageResources={imageResources}
              saveBlock={saveBlock} addBlock={addBlock}
              roles={doc.characters} rolesOpen={rolesOpen}
              onToggleRoles={() => setRolesOpen(v => !v)} onOpenRole={setRoleId}
              onOpenModule={id => onOpenCard?.(cardId, id)} onAdd={() => setLibrary(true)}
              backlinks={refIndex?.backlinks[cardId]} onOpenRefCard={id => onOpenCard?.(id)} />
          </>
        )}
      </div>
      {library && (
        <ModuleLibrary t={t} onClose={() => setLibrary(false)}
          onPick={(widget, label) => addModule(widget, widget === undefined ? undefined : label)} />
      )}
    </div>
    </MarkdownDelegateProvider>
  )
}
