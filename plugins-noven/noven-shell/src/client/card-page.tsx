/**
 * 卡页 — 画布里的"卡"对象体：分页结构，一个模块一页。点树里的模块行
 * 切页；默认页是「总览」——把其余各页的成果缩略聚合过来，只读 + 跳转。
 * 模块页内正文走通用编辑器（块级点编），预制模块（时间线/关系图/地图）
 * 自带完整详情界面。
 * @module noven-shell/client/card-page
 */
import { Component, useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import type { SessionId } from '@deepseek-ai/dsh-session/types'
import { MarkdownDelegateProvider, Menu } from '@deepseek-ai/dsh-client-ui-primitives'
import type { CardAddr, CardBlockView, CardDocView, CardModuleDoc, CardOpResult, CardState } from './card-api.ts'
import { CardConflict, cardContentUrl, deleteUserModule, fetchCard, fetchUserModules, type UserModuleDefinition } from './card-api.ts'
import { findModule } from './pages/card-tree.ts'
import type { EditorSaveResult } from './editor.tsx'
import { CardMarkdownEditor } from './doc-editor.tsx'
import { CollectionWidget, RelationWidget, SceneWidget, TimelineWidget, coll, collText, rel, tl, type RefBacklink, type RefTarget, type TlPlace, type WidgetSend } from './widgets.tsx'
import { setPlaceFocus } from './place-link.ts'
import { setModuleLinkFocus } from './module-link.ts'
import { setCollectionFocus } from './collection-focus.ts'
import { MapEditor } from './map-editor.tsx'
import { fmt, type ShellT } from './pages/Home.tsx'
import { glyph } from './icons.tsx'
import { InlineRename, notifyUndo, useArmedMenu } from './ui/interact.tsx'
import { useRetainedCard, useRetainedScroll } from './ui/retain.ts'
import { MODLIB_ART } from './modlib-art.ts'
import { createPortal } from 'react-dom'
import { assembleSurface, parseSurface, surfaceSource, type SurfaceManifest } from './surface.ts'
import { StageIsland, standaloneDoc, type IslandControl } from './stage-island.tsx'

/** 卡页认领的深链协议：noven://card/<id>[/module/<id>] 与 noven://file/<路径>。 */
const NOVEN_LINK_PROTOCOLS = ['noven:']

/** 模块类型名 → 视图字典键（与内容树同一套语义图标无关，名字走 locale）。 */
const WIDGET_LABEL: Record<string, string> = {
  collection: 'editor.widget.kind.collection',
}

interface RefSpec {
  readonly sourceCardId: string
  readonly sourceModuleId: string
  readonly name: string
  readonly view?: string
  readonly filter?: { readonly characters?: readonly string[] }
}

interface ModuleLibraryProps {
  readonly t: ShellT
  readonly currentCardId: string
  readonly refTargets?: readonly RefTarget[]
  readonly userModules?: readonly UserModuleDefinition[]
  readonly onPick: (preset: string, name: string) => void
  readonly onRef: (spec: RefSpec) => void
  readonly onUseUserModule: (definition: UserModuleDefinition) => void
  readonly onDeleteUserModule: (id: string) => void
  readonly onGenerateUserModule: () => void
  readonly onClose: () => void
}

/** 模块库瓦片：`art` 是缩略图键；`preset` 落到后端的单模块预设。 */
interface ModTile {
  readonly id: string
  readonly label: string
  readonly preset: string
  readonly art?: string
  readonly ai?: boolean
}

interface ModGroup { readonly id: string, readonly label: string, readonly tiles: readonly ModTile[] }

/** 模块库：按卡型分组；每个入口都落成带字段/视图的可用模块。 */
function ModuleLibrary({ t, currentCardId, refTargets, userModules, onPick, onRef, onUseUserModule, onDeleteUserModule, onGenerateUserModule, onClose }: ModuleLibraryProps) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent): void => { if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', onKey)
    return () => { window.removeEventListener('keydown', onKey) }
  }, [onClose])
  const tile = (id: string, preset: string, label: string, art?: string): ModTile => ({ id, preset, label, ...(art === undefined ? {} : { art }) })
  const doc = tile('doc', 'doc', t('modules.tile.doc'), 'doc')
  const collection = tile('collection', 'collection', t('modules.tile.collection'), 'collection')
  const gallery = tile('gallery', 'gallery', t('modules.tile.gallery'), 'gallery')
  const timeline = tile('timeline', 'timeline', t('modules.tile.timeline'), 'timeline')
  const map = tile('map', 'map', t('modules.tile.map'), 'map')
  const relation = tile('relation', 'graph', t('modules.tile.relation'), 'relation')
  const surface = tile('surface', 'surface', t('modules.tile.surface'), 'surface')
  const free3d = tile('free3d', 'free3d', t('modules.tile.free3d'), 'free3d')
  const ai: ModTile = { id: 'ai', preset: '', label: t('modules.ai.tile'), art: 'ai', ai: true }

  const places = tile('places', 'places', t('modules.tile.geography'), 'places')
  const factions = tile('factions', 'factions', t('modules.tile.factions'), 'factions')
  const races = tile('races', 'races', t('modules.tile.races'), 'races')
  const culture = tile('culture', 'culture', t('modules.tile.culture'), 'culture')
  const rules = tile('rules', 'rules', t('modules.tile.rules'), 'rules')

  const diary = tile('diary', 'diary', t('modules.tile.diary'), 'diary')
  const forms = tile('forms', 'forms', t('modules.tile.galleryForms'), 'forms')
  const quotes = tile('quotes', 'quotes', t('modules.tile.quotes'), 'quotes')
  const abilities = tile('abilities', 'abilities', t('modules.tile.abilities'), 'abilities')
  const equipment = tile('equipment', 'equipment', t('modules.tile.equipment'), 'equipment')

  const worldGroup: ModGroup = { id: 'world', label: t('modules.group.world'), tiles: [places, factions, races, culture, rules] }
  const characterGroup: ModGroup = { id: 'character', label: t('modules.group.character'), tiles: [diary, forms, quotes, abilities, equipment] }
  const commonGroup: ModGroup = { id: 'common', label: t('modules.group.common'), tiles: [doc, collection, gallery, timeline, map, relation, surface, free3d, ai] }
  const groups: readonly ModGroup[] = [worldGroup, characterGroup, commonGroup]
  const refCards = (refTargets ?? []).filter(target => target.cardId !== currentCardId && (target.modules?.length ?? 0) > 0)
  const [refOpen, setRefOpen] = useState(false)
  const [refCard, setRefCard] = useState('')
  const [refModule, setRefModule] = useState('')
  const [refName, setRefName] = useState('')
  const [refView, setRefView] = useState('')
  const [refChars, setRefChars] = useState('')
  const selectedCard = refCards.find(target => target.cardId === refCard)
  const refModules = (selectedCard?.modules ?? []).filter(module => module.type === 'collection' || module.type === 'timeline')
  const selectedModule = refModules.find(module => module.id === refModule)
  const pickCard = (cardId: string): void => {
    const card = refCards.find(target => target.cardId === cardId)
    const first = (card?.modules ?? []).find(module => module.type === 'collection' || module.type === 'timeline')
    setRefCard(cardId); setRefModule(first?.id ?? ''); setRefName(first?.name ?? ''); setRefView(''); setRefChars('')
  }
  const pickModule = (moduleId: string): void => {
    const next = refModules.find(module => module.id === moduleId)
    setRefModule(moduleId); setRefName(next?.name ?? ''); setRefView(''); setRefChars('')
  }
  return (
    <div className="nv-create-veil" onClick={onClose}>
      <div className="nv-modlib" role="dialog" aria-modal="true" onClick={e => e.stopPropagation()}>
        <div className="nv-modlib-head">
          <span className="nv-modlib-title">{t('modules.title')}</span>
          <button type="button" className="nv-canvas-tabx" aria-label={t('create.cancel')} onClick={onClose}>×</button>
        </div>
        {groups.map(group => (
          <section key={group.id} className="nv-modlib-group">
            <h4 className="nv-modlib-grouplabel">{group.label}</h4>
            <div className="nv-modlib-grid">
              {group.tiles.map(item => (
                <button key={`${group.id}:${item.id}`} type="button" className="nv-modlib-tile"
                  onClick={() => item.ai === true ? onGenerateUserModule() : onPick(item.preset, item.label)}>
                  {item.art !== undefined
                    ? <img className="nv-modlib-art" src={MODLIB_ART[item.art]} alt="" />
                    : <span className="nv-modlib-emptyart">＋</span>}
                  <span className="nv-modlib-tilename">{item.label}</span>
                </button>
              ))}
            </div>
          </section>
        ))}
        {(userModules ?? []).length > 0 && (
          <div className="nv-modlib-saved">
            <span>{t('modules.user.title')}</span>
            {(userModules ?? []).map(definition => (
              <span key={definition.id} className="nv-modlib-saveditem">
                <button type="button" onClick={() => onUseUserModule(definition)}>{definition.name}</button>
                <button type="button" aria-label={t('modules.user.delete')} onClick={() => onDeleteUserModule(definition.id)}>×</button>
              </span>
            ))}
          </div>
        )}
        <section className="nv-modlib-ref">
          <button type="button" className="nv-modlib-refhead" onClick={() => setRefOpen(value => !value)}>
            ↳ {t('modules.ref.title')}
          </button>
          {refOpen && (refCards.length === 0
            ? <div className="nv-modlib-refempty">{t('modules.ref.empty')}</div>
            : (
              <div className="nv-modlib-refform">
                <label><span>{t('modules.ref.card')}</span>
                  <select value={refCard} onChange={event => pickCard(event.target.value)}>
                    <option value="">—</option>
                    {refCards.map(card => <option key={card.cardId} value={card.cardId}>{card.name}</option>)}
                  </select>
                </label>
                <label><span>{t('modules.ref.module')}</span>
                  <select value={refModule} onChange={event => pickModule(event.target.value)}>
                    <option value="">—</option>
                    {refModules.map(module => <option key={module.id} value={module.id}>{module.name} · {module.type}</option>)}
                  </select>
                </label>
                <label><span>{t('modules.ref.name')}</span>
                  <input value={refName} placeholder={selectedModule?.name ?? t('modules.ref.name')} onChange={event => setRefName(event.target.value)} />
                </label>
                <label><span>{t('modules.ref.view')}</span>
                  <select value={refView} onChange={event => setRefView(event.target.value)}>
                    <option value="">{t('modules.ref.follow')}</option>
                    {selectedModule?.type === 'timeline'
                      ? <option value="diary">{t('coll.view.diary')}</option>
                      : <>
                        <option value="cards">{t('coll.view.cards')}</option>
                        <option value="list">{t('coll.view.list')}</option>
                        <option value="form">{t('coll.view.form')}</option>
                        <option value="profile">{t('modules.ref.profile')}</option>
                        <option value="graph">{t('modules.ref.graph')}</option>
                      </>}
                  </select>
                </label>
                {selectedModule?.type === 'timeline' && (
                  <label><span>{t('modules.ref.filter')}</span>
                    <input value={refChars} placeholder={t('modules.ref.filterPh')} onChange={event => setRefChars(event.target.value)} />
                  </label>
                )}
                <button type="button" className="nv-modlib-refgo" disabled={refCard === '' || refModule === ''}
                  onClick={() => {
                    if (refCard === '' || refModule === '') return
                    const characters = refChars.split(/[,，、]/).map(part => part.trim()).filter(part => part !== '')
                    onRef({
                      sourceCardId: refCard, sourceModuleId: refModule,
                      name: refName.trim() === '' ? (selectedModule?.name ?? t('modules.ref.title')) : refName.trim(),
                      ...(refView === '' ? {} : { view: refView }),
                      ...(characters.length === 0 ? {} : { filter: { characters } }),
                    })
                  }}>{t('modules.ref.go')}</button>
              </div>
            ))}
        </section>
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
  scene: glyph.layers,
}

function moduleGlyph(module: CardModuleDoc, size: number): ReturnType<typeof glyph.file> {
  const icon = MODULE_GLYPH[module.widget?.type ?? ''] ?? glyph.file
  return icon(size)
}

/** 模块正文 → markdown：文字块原样、图片块写成 card-image 行（保存时由卡系统还原）。 */
function moduleMarkdown(blocks: readonly CardBlockView[]): string {
  return blocks.map(block => block.kind === 'text'
    ? block.text ?? ''
    : `![${block.caption ?? ''}](card-image:${block.resourceId ?? ''}#${block.id}${block.width === undefined ? '' : ` "w=${String(Math.round(block.width))}%"`})`).join('\n\n')
}

/** 同项目跨卡引用：加载源卡，渲染源模块，编辑写回源卡；本卡只保留视图/过滤/覆盖。 */
function RefModule({ module, t, addr, loadCard, op, onOpenCard, refTargets }: {
  readonly module: CardModuleDoc
  readonly t: ShellT
  readonly addr: CardAddr
  readonly loadCard: (addr: CardAddr, cardId: string) => Promise<CardState | undefined>
  readonly op: (addr: CardAddr, op: import('./card-api.ts').CardOp) => Promise<CardOpResult>
  readonly onOpenCard?: (cardId: string, moduleId?: string) => void
  readonly refTargets?: readonly RefTarget[]
}) {
  const source = module.widget?.source
  const [state, setState] = useState<CardState | null | undefined>(undefined)
  const [notice, setNotice] = useState('')
  useEffect(() => {
    if (source === undefined) return
    let live = true
    void loadCard(addr, source.cardId).then(next => { if (live) setState(next ?? null) })
    return () => { live = false }
  }, [addr, loadCard, source?.cardId])
  const sourceModule = state === undefined || state === null || source === undefined ? undefined : findModule(state.document.modules, source.moduleId)
  const snapshot = module.widget?.snapshot
  const imageUrl = useCallback((resourceId: string): string => {
    const ref = state?.resources.find(resource => resource.id === resourceId)?.ref
    return ref === undefined || state === undefined || state === null ? '' : cardContentUrl(addr.root ?? '', state.dir, ref)
  }, [addr.root, state])
  const send = useCallback(async (command: Parameters<WidgetSend>[0]): Promise<boolean> => {
    if (state === undefined || state === null) return false
    try {
      const result = await op(addr, { op: 'apply', cardId: state.cardId, version: state.version, command })
      const next = await loadCard(addr, state.cardId)
      if (next !== undefined) setState(next)
      if (result.version === undefined) setNotice(t('card.refConflict'))
      return true
    } catch (error: unknown) {
      setNotice(String(error instanceof Error ? error.message : error))
      const next = await loadCard(addr, state.cardId)
      if (next !== undefined) setState(next)
      return false
    }
  }, [addr, loadCard, op, state, t])
  const derive = (base: CardModuleDoc | undefined): CardModuleDoc | undefined => {
    if (base === undefined) return undefined
    const widget = base.widget
    if (widget === undefined) return base
    let data = widget.data
    if (widget.type === 'collection') {
      data = { ...coll(widget.data), ...(module.widget?.view === undefined ? {} : { view: module.widget.view }), ...(module.widget?.overrides ?? {}) }
    } else if (widget.type === 'timeline') {
      const baseData = tl(widget.data)
      const characters = module.widget?.filter?.characters ?? []
      const events = characters.length === 0
        ? baseData.events
        : baseData.events.filter(event => event.characters?.some(name => characters.includes(name)) === true)
      data = {
        ...baseData, ...(module.widget?.view === undefined ? {} : { view: module.widget.view }),
        ...(module.widget?.overrides ?? {}), events,
      }
    }
    return { ...base, widget: { ...widget, data } }
  }
  const derived = useMemo(() => derive(sourceModule), [module.widget, sourceModule])
  const snapshotModule = useMemo((): CardModuleDoc | undefined => {
    if (snapshot === undefined) return undefined
    return derive({
      id: module.id, name: snapshot.moduleName, blocks: [], children: [], characterIds: [], layout: 'VERTICAL', tags: [],
      widget: { type: snapshot.widget.type, ...(snapshot.widget.data === undefined ? {} : { data: snapshot.widget.data }) },
    })
  }, [module.id, module.widget, snapshot])
  const snapshotImageUrl = useCallback((resourceId: string): string => {
    const resource = snapshot?.resources?.[resourceId]
    return resource === undefined ? '' : `data:${resource.mediaType};base64,${resource.base64}`
  }, [snapshot])
  const mapPlaces: TlPlace[] = (state?.document.modules ?? []).flatMap(candidate => {
    if (candidate.widget?.type !== 'map') return []
    const data = candidate.widget.data as { readonly markers?: readonly { readonly id?: unknown, readonly label?: unknown }[] } | undefined
    return (Array.isArray(data?.markers) ? data.markers : []).flatMap(marker =>
      typeof marker.id === 'string' && typeof marker.label === 'string'
        ? [{ mapModuleId: candidate.id, markerId: marker.id, label: marker.label }]
        : [])
  })
  const openPlace = (place: TlPlace): void => {
    if (state === undefined || state === null) return
    setPlaceFocus({ cardId: state.cardId, mapModuleId: place.mapModuleId, markerId: place.markerId, ...(place.label === undefined ? {} : { label: place.label }) })
    onOpenCard?.(state.cardId, place.mapModuleId)
  }
  if (source === undefined) return <div className="nv-canvas-missing">{t('cardpage.missing')}</div>
  const live = derived !== undefined && state !== undefined && state !== null && sourceModule !== undefined
  const display = live ? derived : snapshotModule
  if (display === undefined) {
    return <div className="nv-canvas-missing">{state === undefined ? t('canvas.files.loading') : t('cardpage.module.missing')}</div>
  }
  const displayType = display.widget?.type
  const displayImageUrl = live ? imageUrl : snapshotImageUrl
  return (
    <div className="nv-refmodule">
      <div className="nv-refbanner">
        <span>↳ {live
          ? fmt(t, 'card.refSource', { card: state.document.name, module: sourceModule.name })
          : fmt(t, 'card.refSnapshot', { card: snapshot?.cardName ?? '', module: snapshot?.moduleName ?? '' })}</span>
        {live && <button type="button" onClick={() => onOpenCard?.(state.cardId, sourceModule.id)}>{t('card.refOpen')}</button>}
      </div>
      {notice !== '' && <div className="nv-refnotice">{notice}</div>}
      <div className={live ? undefined : 'nv-refmodule-snapshot'}>
        {displayType === 'collection' && (
          <CollectionWidget module={display} t={t} send={live ? send : async () => false} imageUrl={displayImageUrl} refTargets={refTargets}
            siblings={live ? state.document.modules : []} ownerName={live ? state.document.name : snapshot?.cardName}
            ownerId={live ? state.cardId : undefined} cardKind={live ? state.document.kind : undefined} />
        )}
        {displayType === 'timeline' && <TimelineWidget module={display} t={t} send={live ? send : async () => false}
          {...(live ? { cardId: state.cardId, places: mapPlaces, onOpenPlace: openPlace } : {})} />}
        {displayType !== 'collection' && displayType !== 'timeline' && (
          <div className="nv-modbox-widget">{t('card.refUnsupported')}</div>
        )}
      </div>
    </div>
  )
}

/** 一个模块盒：标题（点击即改名）+ 正文（模块内富文本 / 预制模块渲染器）。
    子模块不再在盒内堆叠——它们是独立页面，盒尾给跳转行。 */
function ModuleBox({ module, t, card, addr, loadCard, op, onOpenCard, imageUrl, imageResources, saveBlock, saveMarkdown, send, onOpenModule, ask, seedComposer, readFile, onOpenFile, refTargets, siblings, refEdges, mapReferenced }: {
  readonly module: CardModuleDoc
  readonly t: ShellT
  /** 宿主卡身份——html 模块的 NOVEN_FRAME.card 拿它。 */
  readonly card: { readonly id: string, readonly name: string, readonly kind: string | undefined }
  readonly imageUrl: (resourceId: string) => string
  /** 本卡可用的图片资源（地图选底图用）。 */
  readonly imageResources: readonly { readonly id: string, readonly mediaType?: string }[]
  readonly saveBlock: (module: CardModuleDoc, blockId: string, text: string, expected: string) => Promise<EditorSaveResult>
  readonly saveMarkdown: (module: CardModuleDoc, text: string) => Promise<EditorSaveResult>
  /** 预制模块的编辑命令直发（apply + 刷新由宿主负责）。 */
  readonly send: WidgetSend
  /** 打开另一个模块的页签。 */
  readonly onOpenModule: (moduleId: string) => void
  /** 引用选择器的目标卡（项目引用索引）。 */
  readonly refTargets?: readonly RefTarget[]
  /** 同一张卡的模块清单——集合的直接引用（如多形态→角色档案）靠它解析。 */
  readonly siblings?: readonly CardModuleDoc[]
  /** 同卡引用派生的关系边（渲染用，不落盘）。 */
  readonly refEdges?: readonly { readonly from: string, readonly to: string, readonly label: string }[]
  /** 被集合条目引用到的地点名（地图按引用过滤）。 */
  readonly mapReferenced?: ReadonlySet<string>
  /** 模块向本会话排一句话（AI 任务入口）。 */
  readonly ask: (text: string) => Promise<void>
  /** 把 AI 编辑指令填进会话输入框（自由界面/自由 3D）。 */
  readonly seedComposer?: (text: string) => void
  /** 跨卡引用需要的源卡加载与命令入口。 */
  readonly addr: CardAddr
  readonly loadCard: (addr: CardAddr, cardId: string) => Promise<CardState | undefined>
  readonly op: (addr: CardAddr, op: import('./card-api.ts').CardOp) => Promise<CardOpResult>
  readonly onOpenCard?: (cardId: string, moduleId?: string) => void

  /** 读项目内文件文本（html 模块的活引用渲染）。 */
  readonly readFile?: (path: string) => Promise<string | undefined>
  /** 打开项目文件到画布页签。 */
  readonly onOpenFile?: (path: string) => void
}) {
  const widget = module.widget?.type
  const mapPlaces: TlPlace[] = (siblings ?? []).flatMap(candidate => {
    if (candidate.widget?.type !== 'map') return []
    const data = candidate.widget.data as { readonly markers?: readonly { readonly id?: unknown, readonly label?: unknown }[] } | undefined
    return (Array.isArray(data?.markers) ? data.markers : []).flatMap(marker =>
      typeof marker.id === 'string' && typeof marker.label === 'string'
        ? [{ mapModuleId: candidate.id, markerId: marker.id, label: marker.label }]
        : [])
  })
  const timelineModules = (siblings ?? []).filter(candidate => candidate.widget?.type === 'timeline')
  const openPlace = (place: TlPlace): void => {
    setPlaceFocus({ cardId: card.id, mapModuleId: place.mapModuleId, markerId: place.markerId, ...(place.label === undefined ? {} : { label: place.label }) })
    onOpenModule(place.mapModuleId)
  }
  const profileTarget = (siblings ?? []).find(candidate => candidate.widget?.type === 'collection' && (coll(candidate.widget.data).presentation?.contract === 'profile' || candidate.name === '角色档案' || candidate.name === '基本信息'))?.id
  const relationTarget = (siblings ?? []).find(candidate => candidate.widget?.type === 'collection' && (coll(candidate.widget.data).presentation?.contract === 'relations' || coll(candidate.widget.data).view === 'graph' || candidate.name === '关系'))?.id
  const relationModule = relationTarget === undefined ? undefined : (siblings ?? []).find(candidate => candidate.id === relationTarget)
  const relationData = relationModule?.widget?.type === 'collection' ? coll(relationModule.widget.data) : undefined
  const relationNameField = relationData?.fields.find(field => field.name === '关系')
  const relationNames = [...new Set((relationData?.items ?? [])
    .map(item => {
      const raw = relationNameField === undefined ? '' : collText(relationData?.values[item.id]?.[relationNameField.id])
      return raw.trim() === '' ? item.name : raw.trim()
    })
    .filter(name => name !== ''))]
  const characterNames = [...new Set([card.name, ...(refTargets ?? []).filter(target => target.kind === 'CHARACTER').map(target => target.name)])]
  const followTimeline = (target: string | undefined): void => {
    if (target === undefined) return
    setModuleLinkFocus({ cardId: card.id, targetModuleId: target, sourceModuleId: module.id, sourceModuleName: module.name })
    onOpenModule(target)
  }
  const filterTimeline = timelineModules[0] === undefined ? undefined : (marker: { readonly id: string, readonly label: string }): void => {
    setPlaceFocus({ cardId: card.id, mapModuleId: module.id, markerId: marker.id, label: marker.label })
    onOpenModule(timelineModules[0]!.id)
  }
  return (
    <section className="nv-modbox">
      {widget === 'ref' && (
        <RefModule module={module} t={t} addr={addr} loadCard={loadCard} op={op}
          onOpenCard={onOpenCard} refTargets={refTargets} />
      )}
      {widget === 'timeline' && <TimelineWidget module={module} t={t} send={send} cardId={card.id}
        places={mapPlaces} onOpenPlace={openPlace}
        links={{ characterTarget: profileTarget, relationTarget, characters: characterNames, relations: relationNames,
          onOpenCharacter: profileTarget === undefined ? undefined : () => followTimeline(profileTarget),
          onOpenRelation: relationTarget === undefined ? undefined : () => followTimeline(relationTarget),
          onCreateCharacter: profileTarget === undefined ? () => { void send({ kind: 'add_module', name: '角色档案', preset: 'profile' }) } : undefined,
          onCreateRelation: relationTarget === undefined ? () => { void send({ kind: 'add_module', name: '关系', preset: 'graph' }) } : undefined }} />}
      {widget === 'scene' && <SceneWidget module={module} t={t} send={send} imageUrl={imageUrl} />}
      {widget === 'relation' && <RelationWidget module={withDerivedRelation(module, refEdges)} t={t} send={send} imageUrl={imageUrl} />}
      {widget === 'map' && <MapEditor module={module} t={t} send={send} ask={ask} imageUrl={imageUrl} imageResources={imageResources}
        referenced={mapReferenced} onFilterTimeline={filterTimeline} onOpenSource={onOpenModule} />}
      {widget === 'collection' && <CollectionWidget module={module} t={t} send={send} imageUrl={imageUrl} refTargets={refTargets}
        siblings={siblings} ownerName={card.name} ownerId={card.id} cardKind={card.kind} onOpenModule={onOpenModule} places={mapPlaces} />}
      {widget !== undefined && widget !== 'document' && widget !== 'html'
        && widget !== 'timeline' && widget !== 'relation' && widget !== 'map' && widget !== 'collection' && widget !== 'scene' && (
        <div className="nv-modbox-widget">
          {fmt(t, 'modules.widgetSoon', { name: t((WIDGET_LABEL[widget] ?? 'editor.widget.name') as Parameters<ShellT>[0]) })}
        </div>
      )}
      {widget === 'html' && (
        <HtmlModule module={module} t={t} cardId={card.id} readFile={readFile} onOpenFile={onOpenFile}
          card={card} imageUrl={imageUrl} imageResources={imageResources} send={send} ask={ask} seedComposer={seedComposer}
          onOpenCard={onOpenCard} onOpenModule={onOpenModule}
          cardData={{ name: card.name, kind: card.kind, modules: siblings ?? [] }} />
      )}
      {(widget === undefined || widget === 'document') && (
        <CardMarkdownEditor markdown={moduleMarkdown(module.blocks)}
          onSave={(text: string) => { void saveMarkdown(module, text) }} />
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

class HtmlBoundary extends Component<{ readonly t: ShellT, readonly children: ReactNode }, { readonly error: string | null }> {
  state = { error: null as string | null }
  static getDerivedStateFromError(error: unknown): { error: string } {
    return { error: String(error instanceof Error ? error.message : error) }
  }
  render(): ReactNode {
    return this.state.error === null
      ? this.props.children
      : <div className="nv-isl-err">{fmt(this.props.t, 'work.island.err', { err: this.state.error })}</div>
  }
}

interface HtmlCardData {
  readonly name: string
  readonly kind: string | undefined
  readonly modules: readonly CardModuleDoc[]
}

const HTML_WRITE_KINDS = new Set([
  'collection_set_value', 'collection_update_item', 'collection_add_item', 'collection_move_item',
  'timeline_add_event', 'timeline_update_event', 'timeline_remove_event', 'write_text',
])

const readTheme = (): { dark: boolean, accent: string, text: string, surface: string } => {
  const cs = getComputedStyle(document.documentElement)
  return {
    dark: document.documentElement.dataset.theme === 'dark',
    accent: cs.getPropertyValue('--nv-accent').trim(),
    text: cs.getPropertyValue('--nv-primary-text').trim(),
    surface: cs.getPropertyValue('--nv-surface').trim(),
  }
}

/** Fullscreen shell for a free surface: cover, story, start/continue, pause, slots, export/share. */
function GameShell({ html, frame, t, moduleName, cardId, moduleId, cardData, assetTypes, resolveAsset, onCardRead, onCardWrite, ask, onClose, threeSource, manifest, coverUrl, onOpenCard, onOpenModule }: {
  readonly html: string
  readonly frame: { card: { name: string, kind?: string }, base: string, theme: { dark: boolean, accent: string, text: string, surface: string }, assets: Record<string, string> }
  readonly t: ShellT
  readonly moduleName: string
  readonly cardId: string
  readonly moduleId: string
  readonly cardData: HtmlCardData
  readonly assetTypes: Record<string, string>
  readonly resolveAsset: (path: string) => Promise<Blob | null>
  readonly onCardRead: () => unknown
  readonly onCardWrite: (command: unknown) => Promise<{ ok: boolean, error?: string }>
  readonly ask: (text: string) => Promise<void>
  readonly onClose: () => void
  readonly threeSource?: string
  readonly manifest?: SurfaceManifest
  readonly coverUrl?: string
  readonly onOpenCard?: (cardId: string, moduleId?: string) => void
  readonly onOpenModule?: (moduleId: string) => void
}) {
  interface SlotInfo { readonly n: number, readonly saved: boolean, readonly at: number }
  const control = useRef<IslandControl | null>(null)
  const [status, setStatus] = useState('')
  const [started, setStarted] = useState(manifest === undefined)
  const [paused, setPaused] = useState(false)
  const [slotsOpen, setSlotsOpen] = useState(false)
  const [slots, setSlots] = useState<readonly SlotInfo[]>([])
  const pendingSlot = useRef<number | null>(null)
  const togglePause = (): void => {
    const next = !paused
    setPaused(next)
    control.current?.setPaused(next)
  }
  const storageKey = `noven-game:${cardId}:${moduleId}`
  const slotKey = (n: number): string => `${storageKey}:slot:${String(n)}`
  const readSlot = (n: number): { readonly at: number, readonly state: unknown } | undefined => {
    try {
      const raw = localStorage.getItem(slotKey(n))
      if (raw === null) return undefined
      const parsed = JSON.parse(raw) as { at?: unknown, state?: unknown }
      if (typeof parsed.at === 'number' && 'state' in parsed) return { at: parsed.at, state: parsed.state }
      return { at: 0, state: parsed }
    } catch {
      return undefined
    }
  }
  useEffect(() => {
    setSlots([1, 2, 3].map(n => {
      const slot = readSlot(n)
      return { n, saved: slot !== undefined, at: slot?.at ?? 0 }
    }))
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [storageKey])
  const readSave = (): unknown => {
    try {
      const raw = localStorage.getItem(storageKey)
      return raw === null ? null : JSON.parse(raw)
    } catch {
      return null
    }
  }
  /** 旧 HTML 模块的单存档；带 manifest 的自由工程走槽位。 */
  const save = (): void => {
    control.current?.requestSave()
    setStatus(t('game.saving'))
  }
  const load = (): void => {
    const state = readSave()
    if (state === null) { setStatus(t('game.noSave')); return }
    control.current?.loadState(state)
    setStatus(t('game.loaded'))
  }
  const saveSlot = (n: number): void => {
    pendingSlot.current = n
    control.current?.requestSave()
    setStatus(fmt(t, 'game.savingSlot', { n }))
  }
  const loadSlot = (n: number): void => {
    const slot = readSlot(n)
    if (slot === undefined) { setStatus(t('game.noSave')); return }
    control.current?.loadState(slot.state)
    setStarted(true)
    setPaused(false)
    control.current?.setPaused(false)
    setSlotsOpen(false)
    setStatus(fmt(t, 'game.loadedSlot', { n }))
  }
  const latestSlot = slots.filter(slot => slot.saved).sort((a, b) => b.at - a.at)[0]
  const continueLatest = (): void => { if (latestSlot !== undefined) loadSlot(latestSlot.n) }
  const downloadDataUrl = (data: string, name: string): void => {
    const anchor = document.createElement('a')
    anchor.href = data
    anchor.download = name
    anchor.click()
  }
  const capture = (): void => { control.current?.capture() }
  const inlineAssets = async (): Promise<Record<string, string>> => {
    const out: Record<string, string> = {}
    await Promise.all(Object.entries(frame.assets).map(async ([id, url]) => {
      try {
        const response = await fetch(url)
        if (!response.ok) return
        const raw = await response.blob()
        const declared = assetTypes[id]
        const blob = raw.type === '' || raw.type === 'application/octet-stream'
          ? new Blob([raw], { type: declared ?? raw.type })
          : raw
        const data = await new Promise<string>((resolve, reject) => {
          const reader = new FileReader()
          reader.onload = () => { resolve(String(reader.result)) }
          reader.onerror = () => { reject(reader.error ?? new Error('resource read failed')) }
          reader.readAsDataURL(blob)
        })
        out[id] = data
      } catch (error) {
        void error
      }
    }))
    return out
  }
  const exportHtml = (): void => {
    void (async () => {
      setStatus(t('game.exporting'))
      const assets = await inlineAssets()
      let runtimeSource = threeSource
      if (html.includes('NOVEN_THREE') && runtimeSource === undefined) {
        const response = await fetch(new URL('/api/noven-three', window.location.origin)).catch(() => undefined)
        if (response === undefined || !response.ok) { setStatus(t('game.exportFailed')); return }
        runtimeSource = await response.text()
      }
      const documentHtml = standaloneDoc(html, { ...frame, assets }, cardData, storageKey, runtimeSource)
      const blob = new Blob([documentHtml], { type: 'text/html;charset=utf-8' })
      const url = URL.createObjectURL(blob)
      const anchor = document.createElement('a')
      anchor.href = url
      anchor.download = `${moduleName.replace(/[\\/:*?"<>|]/g, '_') || 'game'}.html`
      anchor.click()
      window.setTimeout(() => URL.revokeObjectURL(url), 5000)
      setStatus(fmt(t, 'game.exportedAssets', { n: Object.keys(assets).length }))
    })()
  }
  const share = (): void => {
    const link = `noven://card/${cardId}/module/${moduleId}`
    void navigator.clipboard?.writeText(link).then(() => setStatus(t('game.shared'))).catch(() => setStatus(link))
  }
  useEffect(() => {
    const onKey = (event: KeyboardEvent): void => {
      if (event.key !== 'Escape') return
      if (slotsOpen) { setSlotsOpen(false); return }
      if (paused) { setPaused(false); control.current?.setPaused(false); return }
      if (manifest !== undefined && started) { setPaused(true); return }
      onClose()
    }
    window.addEventListener('keydown', onKey)
    return () => { window.removeEventListener('keydown', onKey) }
  }, [manifest, started, paused, slotsOpen, onClose])
  return createPortal(
    <div className="nv-game-shell" data-surface={manifest === undefined ? undefined : 'manifest'}>
      <div className="nv-game-shell-head">
        <b>{manifest?.name ?? moduleName ?? t('game.title')}</b>
        <span className="nv-game-shell-status">{status}</span>
        <span className="nv-game-shell-spacer" />
        {manifest === undefined ? (
          <>
            <button type="button" onClick={save}>{t('game.save')}</button>
            <button type="button" onClick={load}>{t('game.load')}</button>
          </>
        ) : (
          <>
            <button type="button" onClick={togglePause}>{paused ? t('game.resume') : t('game.pause')}</button>
            <button type="button" onClick={() => setSlotsOpen(value => !value)}>{t('game.slots')}</button>
          </>
        )}
        <button type="button" onClick={capture}>{t('game.screenshot')}</button>
        <button type="button" onClick={exportHtml}>{t('game.export')}</button>
        <button type="button" onClick={share}>{t('game.share')}</button>
        <button type="button" className="nv-game-shell-close" onClick={onClose}>{t('game.exit')}</button>
      </div>
      {slotsOpen && (
        <div className="nv-game-slots">
          {[1, 2, 3].map(n => {
            const slot = slots.find(candidate => candidate.n === n)
            return (
              <div className="nv-game-slot" key={n} data-slot={n}>
                <b>{fmt(t, 'game.slot', { n })}</b>
                <span>{slot?.saved === true ? new Date(slot.at).toLocaleString() : t('game.slotEmpty')}</span>
                <button type="button" onClick={() => saveSlot(n)}>{t('game.saveSlot')}</button>
                <button type="button" disabled={slot?.saved !== true} onClick={() => loadSlot(n)}>{t('game.loadSlot')}</button>
              </div>
            )
          })}
        </div>
      )}
      <div className={`nv-game-shell-stage${started ? '' : ' nv-game-covered'}`}>
        <StageIsland html={html} frame={frame} t={t} fillParent controlRef={control} threeSource={threeSource}
          resolveAsset={resolveAsset} onCardRead={onCardRead} onCardWrite={onCardWrite}
          onScreenshot={result => {
            if (result.error !== undefined) setStatus(result.error)
            else if (result.data !== undefined) downloadDataUrl(result.data, `${manifest?.name ?? moduleName ?? 'game'}.png`)
          }}
          onGameSave={state => {
            try {
              if (manifest !== undefined && pendingSlot.current !== null) {
                const n = pendingSlot.current
                pendingSlot.current = null
                localStorage.setItem(slotKey(n), JSON.stringify({ at: Date.now(), state }))
                setSlots(current => current.map(slot => slot.n === n ? { ...slot, saved: true, at: Date.now() } : slot))
                setStatus(fmt(t, 'game.savedSlot', { n }))
                return
              }
              localStorage.setItem(storageKey, JSON.stringify(state))
              setStatus(t('game.saved'))
            } catch {
              setStatus(t('game.saveFailed'))
            }
          }}
          onGameLoad={() => readSave()}
          onCall={call => { if (call.kind === 'compose' || call.kind === 'send') void ask(call.text ?? ''); else if (call.kind === 'openModule' && call.moduleId !== undefined) { setModuleLinkFocus({ cardId, targetModuleId: call.moduleId, sourceModuleId: moduleId, sourceModuleName: moduleName }); if (call.itemId !== undefined) setCollectionFocus({ cardId, moduleId: call.moduleId, itemId: call.itemId }); onOpenModule?.(call.moduleId) } else if (call.kind === 'openCard' && call.cardId !== undefined) onOpenCard?.(call.cardId); else if (call.kind === 'navigate' && call.target !== undefined) { const target = call.target; if (target.cardId !== undefined) onOpenCard?.(target.cardId, target.moduleId); else if (target.moduleId !== undefined) { setModuleLinkFocus({ cardId, targetModuleId: target.moduleId, sourceModuleId: moduleId, sourceModuleName: moduleName }); if (target.itemId !== undefined) setCollectionFocus({ cardId, moduleId: target.moduleId, itemId: target.itemId }); onOpenModule?.(target.moduleId) } } }} />
      </div>
      {manifest !== undefined && !started && (
        <div className="nv-game-start">
          <div className="nv-game-start-cover">
            {coverUrl === undefined || coverUrl === ''
              ? <span>{manifest.name.slice(0, 1)}</span>
              : <img src={coverUrl} alt="" />}
          </div>
          <div className="nv-game-start-story">
            <small>{t('game.surfaceKicker')}</small>
            <h1>{manifest.name}</h1>
            {manifest.description !== '' && <p>{manifest.description}</p>}
          </div>
          <div className="nv-game-start-actions">
            <button type="button" className="nv-game-start-primary" onClick={() => { setPaused(false); setStarted(true) }}>{t('game.start')}</button>
            {latestSlot !== undefined && <button type="button" onClick={continueLatest}>{t('game.continue')}</button>}
            <button type="button" onClick={onClose}>{t('game.exit')}</button>
          </div>
        </div>
      )}
      {manifest !== undefined && paused && (
        <div className="nv-game-pause">
          <div>
            <small>{t('game.paused')}</small>
            <h2>{manifest.name}</h2>
            <button type="button" className="nv-game-start-primary" onClick={togglePause}>{t('game.resume')}</button>
            <button type="button" onClick={onClose}>{t('game.exit')}</button>
          </div>
        </div>
      )}
    </div>,
    document.body,
  )
}

/** HTML 小组件：live file 或 inline source 都进同一沙箱；主题/资源/卡数据桥由岛契约提供。 */
function HtmlModule({ module, t, readFile, onOpenFile, card, cardId, imageUrl, imageResources, send, ask, seedComposer, cardData, onOpenCard, onOpenModule }: {
  readonly module: CardModuleDoc
  readonly t: ShellT
  readonly cardId: string
  readonly readFile?: (path: string) => Promise<string | undefined>
  readonly onOpenFile?: (path: string) => void
  readonly card: { readonly name: string, readonly kind: string | undefined }
  readonly imageUrl: (resourceId: string) => string
  readonly imageResources: readonly { readonly id: string, readonly mediaType?: string }[]
  readonly send: WidgetSend
  readonly ask: (text: string) => Promise<void>
  readonly seedComposer?: (text: string) => void
  readonly cardData: HtmlCardData
  readonly onOpenCard?: (cardId: string, moduleId?: string) => void
  readonly onOpenModule?: (moduleId: string) => void
}) {
  const path = module.widget?.path
  const [fileText, setFileText] = useState<string | null | undefined>(undefined)
  const [theme, setTheme] = useState(readTheme)
  const [playing, setPlaying] = useState(false)
  const [diagnostics, setDiagnostics] = useState(false)
  const [logs, setLogs] = useState<readonly { readonly level: string, readonly text: string }[]>([])
  const [threeSource, setThreeSource] = useState<string | undefined>(undefined)
  const [threeError, setThreeError] = useState('')
  const control = useRef<IslandControl | null>(null)
  useEffect(() => {
    if (path === undefined || readFile === undefined) { setFileText(undefined); return }
    let live = true
    setFileText(undefined)
    void readFile(path).then(text => { if (live) setFileText(text ?? null) })
    return () => { live = false }
  }, [path, readFile])
  useEffect(() => {
    const observer = new MutationObserver(() => setTheme(readTheme()))
    observer.observe(document.documentElement, { attributes: true, attributeFilter: ['style', 'class', 'data-theme'] })
    const media = window.matchMedia?.('(prefers-color-scheme: dark)')
    const onScheme = (): void => setTheme(readTheme())
    media?.addEventListener?.('change', onScheme)
    return () => { observer.disconnect(); media?.removeEventListener?.('change', onScheme) }
  }, [])
  const text = module.blocks.find((block): block is CardBlockView & { kind: 'text' } => block.kind === 'text')?.text ?? ''
  const assets = useMemo(() => Object.fromEntries(imageResources.map(resource => [resource.id, imageUrl(resource.id)])), [imageResources, imageUrl])
  const resolveAsset = useCallback(async (assetPath: string): Promise<Blob | null> => {
    const url = assetPath.startsWith('http') || assetPath.startsWith('/') ? assetPath : imageUrl(assetPath)
    if (url === '') return null
    const response = await fetch(url).catch(() => undefined)
    return response?.ok === true ? response.blob() : null
  }, [imageUrl])
  const surface = useMemo(() => path === undefined ? parseSurface(text) : undefined, [path, text])
  const html = path === undefined ? (surface === undefined ? text : assembleSurface(surface)) : (typeof fileText === 'string' ? fileText : '')
  const manifest = surface?.manifest
  const needsThree = (surface === undefined ? html : surfaceSource(surface)).includes('NOVEN_THREE')
  const coverUrl = manifest?.cover === undefined ? '' : /^(data:|https?:|\/)/.test(manifest.cover) ? manifest.cover : imageUrl(manifest.cover)
  const fullLauncher = manifest?.fullscreen === true
  useEffect(() => {
    if (!needsThree) { setThreeSource(undefined); setThreeError(''); return }
    let live = true
    setThreeSource(undefined); setThreeError('')
    void fetch(new URL('/api/noven-three', window.location.origin))
      .then(async response => {
        if (!response.ok) throw new Error(`three runtime ${String(response.status)}`)
        return response.text()
      })
      .then(source => { if (live) setThreeSource(source) })
      .catch((error: unknown) => { if (live) setThreeError(String(error instanceof Error ? error.message : error)) })
    return () => { live = false }
  }, [needsThree])
  const frame = useMemo(() => ({
    card: { name: card.name, ...(card.kind === undefined ? {} : { kind: card.kind }) },
    base: path !== undefined && path.includes('/') ? path.slice(0, path.lastIndexOf('/')) : '',
    theme,
    assets,
  }), [assets, card.kind, card.name, path, theme])
  const onCardWrite = useCallback(async (command: unknown): Promise<{ ok: boolean, error?: string }> => {
    if (typeof command !== 'object' || command === null) return { ok: false, error: 'command must be an object' }
    const kind = typeof (command as Record<string, unknown>).kind === 'string' ? String((command as Record<string, unknown>).kind) : ''
    if (!HTML_WRITE_KINDS.has(kind)) return { ok: false, error: `unsupported command: ${kind}` }
    const moduleId = String((command as Record<string, unknown>).moduleId ?? '')
    if (!cardData.modules.some(candidate => candidate.id === moduleId)) return { ok: false, error: 'moduleId is not in this card' }
    try {
      await send(command as Parameters<WidgetSend>[0])
      return { ok: true }
    } catch (error: unknown) {
      return { ok: false, error: String(error instanceof Error ? error.message : error) }
    }
  }, [cardData.modules, send])
  const sourceBar = (
    <div className="nv-htmlfile-bar">
      <span className="nv-tree-glyph">{glyph.code(13)}</span>
      <span className="nv-htmlfile-name">{path !== undefined ? (path.split('/').pop() ?? path) : module.name}</span>
      {path !== undefined && onOpenFile !== undefined && (
        <button type="button" className="nv-htmlfile-open" onClick={() => onOpenFile(path)}>{t('editor.file.open')}</button>
      )}
      <button type="button" className="nv-htmlfile-open" onClick={() => seedComposer?.(fmt(t, 'editor.html.aiPrompt', { name: module.name }))}>{t('editor.html.aiEdit')}</button>
      {!fullLauncher && (
        <>
          <button type="button" className="nv-htmlfile-open" onClick={() => setDiagnostics(value => !value)}>{t('editor.html.diagnostics')}{logs.length > 0 ? ` ${String(logs.length)}` : ''}</button>
          <button type="button" className="nv-htmlfile-open" onClick={() => control.current?.capture()}>{t('editor.html.screenshot')}</button>
          <button type="button" className="nv-htmlfile-open" disabled={html === ''} onClick={() => setPlaying(true)}>{t('editor.html.play')}</button>
        </>
      )}
    </div>
  )
  return (
    <div className="nv-htmlfile">
      {sourceBar}
      {path !== undefined && fileText === undefined && <div className="nv-htmlfile-empty">{t('canvas.files.loading')}</div>}
      {path !== undefined && fileText === null && <div className="nv-htmlfile-empty">{t('editor.file.missing')}</div>}
      {html === '' ? (
        <div className="nv-htmlfile-empty">{t('editor.html.empty')}</div>
      ) : fullLauncher && manifest !== undefined ? (
        <div className="nv-surface-launch">
          <figure>{coverUrl === '' ? <span>{manifest.name.slice(0, 1)}</span> : <img src={coverUrl} alt="" />}</figure>
          <div className="nv-surface-story"><h3>{manifest.name}</h3>{manifest.description !== '' && <p>{manifest.description}</p>}</div>
          <button type="button" onClick={() => setPlaying(true)}>{t('surface.start')}</button>
        </div>
      ) : needsThree && threeError !== '' ? (
        <div className="nv-htmlfile-empty">{threeError}</div>
      ) : needsThree && threeSource === undefined ? (
        <div className="nv-htmlfile-empty">{t('editor.html.runtimeLoading')}</div>
      ) : (
        <HtmlBoundary t={t}>
          <StageIsland html={html} frame={frame} t={t} cap={module.widget?.height ?? 520}
            controlRef={control} showSource={false} threeSource={threeSource}
            resolveAsset={resolveAsset}
            onCardRead={() => cardData}
            onCardWrite={onCardWrite}
            onConsole={entry => setLogs(current => [...current.slice(-39), entry])}
            onScreenshot={result => {
              if (result.error !== undefined) {
                setLogs(current => [...current.slice(-39), { level: 'error', text: result.error ?? '' }])
                setDiagnostics(true)
                return
              }
              if (result.data === undefined) return
              const anchor = document.createElement('a')
              anchor.href = result.data
              anchor.download = `${module.name || 'surface'}.png`
              anchor.click()
              setLogs(current => [...current.slice(-39), { level: 'log', text: t('editor.html.shotSaved') }])
            }}
            onCall={call => {
              if (call.kind === 'compose' || call.kind === 'send') void ask(call.text ?? '')
              else if (call.kind === 'openModule' && call.moduleId !== undefined) { setModuleLinkFocus({ cardId, targetModuleId: call.moduleId, sourceModuleId: module.id, sourceModuleName: module.name }); if (call.itemId !== undefined) setCollectionFocus({ cardId, moduleId: call.moduleId, itemId: call.itemId }); onOpenModule?.(call.moduleId) }
              else if (call.kind === 'openCard' && call.cardId !== undefined) onOpenCard?.(call.cardId)
              else if (call.kind === 'navigate' && call.target !== undefined) {
                const target = call.target
                if (target.cardId !== undefined) onOpenCard?.(target.cardId, target.moduleId)
                else if (target.moduleId !== undefined) { setModuleLinkFocus({ cardId, targetModuleId: target.moduleId, sourceModuleId: module.id, sourceModuleName: module.name }); if (target.itemId !== undefined) setCollectionFocus({ cardId, moduleId: target.moduleId, itemId: target.itemId }); onOpenModule?.(target.moduleId) }
              }
            }} />
        </HtmlBoundary>
      )}
      {diagnostics && (
        <div className="nv-htmlfile-diag">
          <div className="nv-htmlfile-diaghead"><b>{t('editor.html.diagnostics')}</b><button type="button" onClick={() => setLogs([])}>{t('editor.html.clearLogs')}</button></div>
          {logs.length === 0
            ? <p>{t('editor.html.noLogs')}</p>
            : logs.map((entry, index) => <div key={`${String(index)}:${entry.level}`} data-level={entry.level}><span>{entry.level}</span>{entry.text}</div>)}
        </div>
      )}
      {playing && html !== '' && (
        <GameShell html={html} frame={frame} t={t} moduleName={module.name} cardId={cardId} moduleId={module.id} cardData={cardData} threeSource={threeSource}
          onOpenCard={onOpenCard} onOpenModule={onOpenModule}
          manifest={manifest} coverUrl={coverUrl}
          assetTypes={Object.fromEntries(imageResources.map(resource => [resource.id, resource.mediaType ?? '']))}
          resolveAsset={resolveAsset} onCardRead={() => cardData} onCardWrite={onCardWrite} ask={ask}
          onClose={() => setPlaying(false)} />
      )}
    </div>
  )
}

/** 总览模块预览：直接复用新建模块库的插画，不再自造灰骨架或字段行。 */
function overviewArt(module: CardModuleDoc, cardKind?: string): string {
  const widget = module.widget?.type
  if (widget === 'map') return 'map'
  if (widget === 'timeline') return tl(module.widget?.data).view === 'diary' ? 'diary' : 'timeline'
  if (widget === 'relation') return cardKind === 'WORLD' ? 'worldRelations' : 'relation'
  if (widget === 'html') return 'surface'
  if (widget === 'scene') return 'free3d'
  if (widget === 'collection') {
    const data = coll(module.widget?.data)
    const layout = data.presentation?.layout
      ?? (data.view === 'graph' ? 'graph' : data.view === 'profile' ? 'profile' : undefined)
    if (layout === 'profile') return cardKind === 'WORLD' ? 'worldProfile' : 'profile'
    if (layout === 'atlas') return 'places'
    if (layout === 'heraldry') return 'factions'
    if (layout === 'bestiary') return 'races'
    if (layout === 'magazine') return 'culture'
    if (layout === 'rulebook') return 'rules'
    if (layout === 'graph') return cardKind === 'WORLD' ? 'worldRelations' : 'relation'
    if (layout === 'gallery') return 'gallery'
    if (layout === 'quoteWall') return 'quotes'
    if (layout === 'skillSheet') return 'abilities'
    if (layout === 'armory') return 'equipment'
    if (layout === 'multiForm') return 'forms'
    return 'collection'
  }
  return 'doc'
}

/** 总览里一页模块：模块库同款插画 + 名称，点击翻到那一页。 */
function OverviewTile({ module, onOpen, t, cardKind }: {
  readonly module: CardModuleDoc
  readonly onOpen: () => void
  readonly t: ShellT
  readonly cardKind?: string
}) {
  const widget = module.widget?.type
  const excerpt = module.blocks.find(b => b.kind === 'text')?.text?.trim() ?? ''
  const imageBlock = widget === 'map' ? module.blocks.find(b => b.kind === 'image') : undefined
  const collection = widget === 'collection' ? coll(module.widget?.data) : undefined
  const timeline = widget === 'timeline' ? tl(module.widget?.data) : undefined
  const relation = widget === 'relation' ? rel(module.widget?.data) : undefined
  const empty = collection !== undefined
    ? collection.items.length === 0
    : timeline !== undefined
      ? timeline.events.length === 0 && timeline.eras.length === 0
      : relation !== undefined
        ? relation.edges.length === 0 && relation.nodes.length === 0
        : widget === 'map'
          ? imageBlock?.resourceId === undefined
          : (widget === undefined || widget === 'document') && excerpt === ''
  const art = overviewArt(module, cardKind)
  return (
    <button type="button" className="nv-ov-tile nv-ov-tile-art" onClick={onOpen}>
      <img className="nv-ov-art" src={MODLIB_ART[art] ?? MODLIB_ART.collection} alt="" />
      <span className="nv-ov-info">
        <span className="nv-ov-name">{module.name}</span>
        {empty && <span className="nv-ov-state">{t('ov.blank')}</span>}
        <span className="nv-ov-arrow">›</span>
      </span>
    </button>
  )
}

/**
 * 总览页：这张卡其余各页的成果橱窗——每页一块，只读摘要 + 迷你图 + 跳转；
 * 总览模块自己写的文字块作为页首导语（仍可直接编辑）。
 */
function OverviewPage({ target, overviewModule, isCharacter, cardKind, t, imageUrl, imageResources, saveMarkdown, roles, rolesOpen, onToggleRoles, onOpenRole, onOpenModule, onAdd, backlinks, onOpenRefCard }: {
  readonly target: Omit<CardDocView, 'characters'> | CardDocView
  readonly overviewModule: CardModuleDoc | undefined
  readonly isCharacter: boolean
  /** 宿主卡种类：总览按卡型挑选要展示的模块。 */
  readonly cardKind?: string
  readonly t: ShellT
  readonly imageUrl: (resourceId: string) => string
  readonly imageResources: readonly { readonly id: string, readonly mediaType?: string }[]
  readonly saveMarkdown: (module: CardModuleDoc, text: string) => Promise<EditorSaveResult>
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
  // 总览是索引：该卡的全部模块都在册，不按卡型裁剪。
  const shownTiles = tiles
  const introMarkdown = moduleMarkdown(overviewModule?.blocks ?? [])
  const worldCover = cardKind === 'WORLD' ? (() => {
    const profile = target.modules.find(module => {
      const widget = module.widget?.data
      return module.widget?.type === 'collection' && coll(widget).view === 'profile'
    })
    if (profile === undefined) return undefined
    const data = coll(profile.widget?.data)
    const item = data.items[0]
    if (item === undefined) return undefined
    const imageField = data.fields.find(field => field.type === 'image')
    const raw = imageField === undefined ? undefined : data.values[item.id]?.[imageField.id]
    const resourceId = typeof raw === 'object' && raw !== null && 'resourceId' in raw && typeof raw.resourceId === 'string'
      ? raw.resourceId : item.visualKey
    return resourceId ?? undefined
  })() : undefined
  return (
    <div className="nv-ov">
      {worldCover !== undefined && <img className="nv-ov-cover" src={imageUrl(worldCover)} alt="" />}
      {overviewModule !== undefined && (overviewModule.blocks?.length ?? 0) > 0 && (
        <div className="nv-ov-intro">
          <CardMarkdownEditor markdown={introMarkdown}
            onSave={(text: string) => { void saveMarkdown(overviewModule, text) }} />
        </div>
      )}
      {tiles.length === 0 && <div className="nv-canvas-missing">{t('ov.empty')}</div>}
      <div className="nv-ov-grid">
        {shownTiles.map(module => (
          <OverviewTile key={module.id} module={module} t={t} cardKind={cardKind}
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
interface ModuleRefBacklink {
  readonly fromCardId: string
  readonly fromCardName: string
  readonly refModuleId: string
  readonly refModuleName: string
}

export function CardPage({ addr, cardId, pageModuleId, autoLibrary, scrollKey, t, owner, loadCard, op, ask, seedComposer, readFile, onOpenFile, onOpenCard }: {
  readonly addr: CardAddr
  readonly cardId: string
  readonly pageModuleId?: string
  /** 树里卡行尾「＋」直达：就绪即弹模块库（一次性信号，标签上已清）。 */
  /** 每次＋新模块递增；>0 时再开库（同页签重复＋也不会丢信号）。 */
  readonly autoLibrary?: number
  /** 滚动留存键（会话 × 页签）；不给则不记滚动。 */
  readonly scrollKey?: string
  /** 页签归属会话——无 root 时用它解析项目做引用索引。 */
  readonly owner?: SessionId
  readonly t: ShellT
  readonly loadCard: (addr: CardAddr, cardId: string) => Promise<CardState | undefined>
  readonly op: (addr: CardAddr, op: import('./card-api.ts').CardOp) => Promise<CardOpResult>
  /** 模块向本会话排一句话（地图「直接生成底图」这类 AI 任务入口）。 */
  readonly ask: (text: string) => Promise<void>
  /** 把预设指令填进会话输入框，不直接发送。 */
  readonly seedComposer?: (text: string) => void
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
  const [userModules, setUserModules] = useState<readonly UserModuleDefinition[]>([])
  const [refIndex, setRefIndex] = useState<{ readonly targets: readonly RefTarget[], readonly backlinks: Record<string, readonly RefBacklink[]>, readonly moduleBacklinks?: Record<string, readonly ModuleRefBacklink[]> } | undefined>(undefined)
  useEffect(() => {
    const root = addr.root
    if (root === undefined && owner === undefined) return
    // 会话优先：会话能解析出项目，而页签的 addr.root 可能是空的。
    const refsUrl = owner !== undefined
      ? `api/noven-cards?refs=1&session=${encodeURIComponent(owner)}`
      : `api/noven-cards?refs=1&root=${encodeURIComponent(root ?? '')}`
    void fetch(new URL(refsUrl, document.baseURI).href)
      .then(response => response.ok ? response.json() as Promise<{ targets: readonly RefTarget[], backlinks: Record<string, readonly RefBacklink[]>, moduleBacklinks?: Record<string, readonly ModuleRefBacklink[]> }> : Promise.reject(new Error(String(response.status))))
      .then(setRefIndex)
      .catch(() => { /* 索引缺席只是没有选择器与反查，不阻塞卡页 */ })
  }, [addr.root, owner])

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
  useEffect(() => {
    if (!library) return
    let live = true
    void fetchUserModules(addr).then(next => { if (live) setUserModules(next) })
    return () => { live = false }
  }, [addr, library])
  /** version 跟随最新快照（缓存命中与后台刷新都会推进它）。 */
  useEffect(() => { if (typeof state === 'object' && state !== null) setVersion(state.version) }, [state])

  // 树里卡行尾「＋」：卡页进来直接弹模块库。
  useEffect(() => { if ((autoLibrary ?? 0) > 0) setLibrary(true) }, [autoLibrary])

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

  const saveMarkdown = useCallback(async (module: CardModuleDoc, text: string): Promise<EditorSaveResult> => {
    if (locked) { setNotice(t('prop.locked')); return 'error' }
    try {
      const result = await op(addr, {
        op: 'apply', cardId, targetId, version,
        command: { kind: 'write_markdown', moduleId: module.id, name: module.name, text },
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

  /** 预制模块命令直发：apply → 记 version → 刷新。错误进 notice 条。 */
  const send = useCallback<WidgetSend>(async command => {
    if (locked) { setNotice(t('prop.locked')); return false }
    try {
      const result = await op(addr, { op: 'apply', cardId, targetId, version, command })
      if (result.version !== undefined) setVersion(result.version)
      void refresh()
      return true
    } catch (error: unknown) {
      setNotice(String(error instanceof Error ? error.message : error))
      return false
    }
  }, [addr, cardId, locked, op, refresh, t, targetId, version])

  const addCustomModule = useCallback((definition: UserModuleDefinition) => {
    if (target === undefined || locked) return
    setLibrary(false)
    void op(addr, {
      op: 'apply', cardId, targetId, version,
      command: { kind: 'add_module_custom', name: definition.name, definition },
    }).then(result => {
      if (result.version !== undefined) setVersion(result.version)
      void refresh()
      const created = result.createdModuleIds?.[0]
      if (created !== undefined) onOpenCard?.(cardId, created)
    }).catch((error: unknown) => setNotice(String(error instanceof Error ? error.message : error)))
  }, [addr, cardId, locked, onOpenCard, op, refresh, target, targetId, version])
  const removeUserModule = useCallback((id: string) => {
    void deleteUserModule(addr, id).then(ok => {
      if (ok) setUserModules(current => current.filter(module => module.id !== id))
    })
  }, [addr])
  const generateUserModule = useCallback(() => {
    setLibrary(false)
    const text = t('modules.ai.prompt').replace('{name}', target?.name ?? '')
    if (seedComposer !== undefined) seedComposer(text)
    else void ask(text)
  }, [ask, seedComposer, t, target?.name])
  const addRefModule = useCallback((spec: RefSpec) => {
    if (target === undefined || locked) return
    setLibrary(false)
    void op(addr, {
      op: 'apply', cardId, targetId, version,
      command: { kind: 'add_module_ref', sourceCardId: spec.sourceCardId, sourceModuleId: spec.sourceModuleId,
        name: spec.name, ...(spec.view === undefined ? {} : { view: spec.view }),
        ...(spec.filter === undefined ? {} : { filter: spec.filter }),
      },
    }).then(result => {
      if (result.version !== undefined) setVersion(result.version)
      void refresh()
      const created = result.createdModuleIds?.[0]
      if (created !== undefined) onOpenCard?.(cardId, created)
    }).catch((error: unknown) => setNotice(String(error instanceof Error ? error.message : error)))
  }, [addr, cardId, locked, onOpenCard, op, refresh, target, targetId, version])
  const addModule = useCallback((preset: string, name?: string) => {
    if (target === undefined || locked) return
    setLibrary(false)
    // 模板名只是货架名；实例名独立。重名时自动加序号，之后可随时改。
    const used = new Set<string>()
    const collect = (modules: readonly CardModuleDoc[]): void => {
      for (const module of modules) { used.add(module.name); collect(module.children) }
    }
    collect(target.modules)
    const base = name ?? t('editor.module.defaultName')
    let instanceName = base
    for (let n = 2; used.has(instanceName); n += 1) instanceName = `${base} ${String(n)}`
    void op(addr, {
      op: 'apply', cardId, targetId, version,
      command: { kind: 'add_module', name: instanceName, preset },
    }).then(result => {
      if (result.version !== undefined) setVersion(result.version)
      void refresh()
      const created = result.createdModuleIds?.[0]
      if (created !== undefined) onOpenCard?.(cardId, created)
    }).catch((error: unknown) => setNotice(String(error instanceof Error ? error.message : error)))
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
  /** 关系图与地图没有第二层画框：页头让位，画布铺满整列。 */
  const bleed = pageModule?.widget?.type === 'relation' || pageModule?.widget?.type === 'map'
  const pagePresentation = pageModule?.widget?.type === 'collection' ? coll(pageModule.widget.data).presentation : undefined
  // 卡总览是索引/地图，用满画布；模块页里合集用满画布，阅读页收在 1120。
  const widePage = pageModule === undefined || (pageModule.widget?.type === 'collection'
    ? pagePresentation?.layout !== 'profile'
    : pageModule.widget?.type === 'html' || pageModule.widget?.type === 'scene')
  const imageResources = state.resources.filter(r => r.mediaType.startsWith('image/')).map(r => ({ id: r.id, mediaType: r.mediaType }))
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
  const cardMenuControl = (
    <Menu portal open={cardMenu} side="bottom" align="end" selection="fill" listClassName="nv-tree-newmenu"
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
  )
  // 单条目集合且条目就是这张卡（「基本信息」）时，页头用卡名——它已经承担了整页的身份。
  const singleSelf = pageModule?.widget?.type === 'collection'
    ? coll(pageModule.widget.data).items
    : []
  const pageOwnsCardName = singleSelf.length === 1 && singleSelf[0] !== undefined
    && doc.name.startsWith(singleSelf[0].name)
  const headerTitle = pageModule === undefined || pageOwnsCardName
    ? (roleId !== undefined ? target.name : doc.name)
    : pageModule.name
  const headerKicker = pageModule === undefined
    ? (roleId !== undefined ? `${kindLabel} · ${t('card.kind.character')}` : kindLabel)
    : `${kindLabel} · ${pageModule.name}`
  return (
    <MarkdownDelegateProvider linkProtocols={NOVEN_LINK_PROTOCOLS} openLink={openLink} openFile={onOpenFile}>
    <div className="nv-cardpage">
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
      <div className={`nv-cardpage-scroll${bleed ? ' nv-cardpage-scroll-bleed' : ''}`} ref={scrollRef}>
        {bleed ? (
          <>
            <button type="button" className="nv-page-bleedback" onClick={() => onOpenCard?.(cardId)}>
              ‹ {doc.name}
            </button>
            <div className="nv-cardpage-bleed">
              {pageModule !== undefined && (
                <ModuleBox module={pageModule} t={t}
                  card={{ id: cardId, name: doc.name, kind: doc.kind }}
                  addr={addr} loadCard={loadCard} op={op} onOpenCard={onOpenCard}
                  imageUrl={imageUrl} imageResources={imageResources}
                  saveBlock={saveBlock} saveMarkdown={saveMarkdown} send={send}
                  onOpenModule={id => onOpenCard?.(cardId, id)} ask={ask} seedComposer={seedComposer} readFile={readFile} onOpenFile={onOpenFile}
                  refTargets={refIndex?.targets} siblings={target.modules} refEdges={refDerived.edges} mapReferenced={refDerived.referenced} />
              )}
            </div>
          </>
        ) : (
          <div className={`nv-page-inner${widePage ? ' nv-page-inner-wide' : ''}`}>
            <header className="nv-pagehead">
              <div className="nv-pagehead-main">
                {pageModuleId !== undefined && (
                  <button type="button" className="nv-pagehead-crumb" onClick={() => onOpenCard?.(cardId)}>
                    ‹ {target.id === doc.id ? doc.name : `${doc.name} · ${target.name}`}
                  </button>
                )}
                {roleId !== undefined && (
                  <button type="button" className="nv-pagehead-crumb" onClick={() => setRoleId(undefined)}>
                    ‹ {doc.name}
                  </button>
                )}
                {cardRenaming ? (
                  <InlineRename className="nv-pagehead-rename" value={doc.name}
                    onDone={next => {
                      setCardRenaming(false)
                      if (next === undefined) return
                      void op(addr, { op: 'apply', cardId, targetId, version, command: { kind: 'rename_card', name: next } })
                        .then(result => { if (result.version !== undefined) setVersion(result.version); void refresh() })
                        .catch((error: unknown) => setNotice(String(error instanceof Error ? error.message : error)))
                    }} />
                ) : (
                  <h1 className="nv-pagehead-title">{headerTitle}</h1>
                )}
              </div>
              <div className="nv-pagehead-side">
                {pageModule !== undefined && (refIndex?.moduleBacklinks?.[`${cardId}:${pageModule.id}`]?.length ?? 0) > 0 && (
                  <span className="nv-pagehead-refcount">{fmt(t, 'card.refCount', { n: refIndex?.moduleBacklinks?.[`${cardId}:${pageModule.id}`]?.length ?? 0 })}</span>
                )}
                <span className="nv-pagehead-kicker">{headerKicker}</span>
                {state.hasDraft && <span className="nv-cardpage-draft">{t('me.draft')}</span>}
                {cardMenuControl}
              </div>
            </header>
            {pageModuleId !== undefined ? (
              <div className="nv-cardpage-module">
                {pageModule !== undefined ? (
                  <ModuleBox module={pageModule} t={t}
                    card={{ id: cardId, name: doc.name, kind: doc.kind }}
                    addr={addr} loadCard={loadCard} op={op} onOpenCard={onOpenCard}
                      imageUrl={imageUrl} imageResources={imageResources}
                    saveBlock={saveBlock} saveMarkdown={saveMarkdown} send={send}
                    onOpenModule={id => onOpenCard?.(cardId, id)} ask={ask} seedComposer={seedComposer} readFile={readFile} onOpenFile={onOpenFile}
                    refTargets={refIndex?.targets} siblings={target.modules} refEdges={refDerived.edges} mapReferenced={refDerived.referenced} />
                ) : (
                  <OverviewPage target={target} overviewModule={overviewModule} isCharacter={target.id !== doc.id} cardKind={doc?.kind}
                    t={t} imageUrl={imageUrl} imageResources={imageResources}
                    saveMarkdown={saveMarkdown}
                    roles={doc.characters} rolesOpen={rolesOpen}
                    onToggleRoles={() => setRolesOpen(v => !v)} onOpenRole={setRoleId}
                    onOpenModule={id => onOpenCard?.(cardId, id)} onAdd={() => setLibrary(true)}
                    backlinks={refIndex?.backlinks[cardId]} onOpenRefCard={id => onOpenCard?.(id)} />
                )}
              </div>
            ) : (
              <OverviewPage target={target} overviewModule={overviewModule} isCharacter={roleId !== undefined} cardKind={doc?.kind}
                t={t} imageUrl={imageUrl} imageResources={imageResources}
                saveMarkdown={saveMarkdown}
                roles={doc.characters} rolesOpen={rolesOpen}
                onToggleRoles={() => setRolesOpen(v => !v)} onOpenRole={setRoleId}
                onOpenModule={id => onOpenCard?.(cardId, id)} onAdd={() => setLibrary(true)}
                backlinks={refIndex?.backlinks[cardId]} onOpenRefCard={id => onOpenCard?.(id)} />
            )}
          </div>
        )}
      </div>
      {library && (
        <ModuleLibrary t={t} currentCardId={cardId}
          refTargets={refIndex?.targets} userModules={userModules} onClose={() => setLibrary(false)}
          onPick={(preset, label) => addModule(preset, label)}
          onRef={addRefModule}
          onUseUserModule={addCustomModule}
          onDeleteUserModule={removeUserModule}
          onGenerateUserModule={generateUserModule} />
      )}
    </div>
    </MarkdownDelegateProvider>
  )
}
