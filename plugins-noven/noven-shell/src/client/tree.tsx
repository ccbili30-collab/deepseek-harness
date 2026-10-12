/**
 * 内容树 — 抽屉上区（设计稿 01/02/J05），挂在 `sidebar.right.pane.top`：
 * 项目头 + 搜索 + 卡/文稿/作品分组 + 「素材与文件」与「＋ 新建」底排。
 * `rail` 态画图标列。数据只读 `/api/noven-tree` 的轮询源；点击行由注入面
 * 落到画布标签。
 * @module noven-shell/client/tree
 */
import { useEffect, useMemo, useRef, useState, type DragEvent, type ReactNode } from 'react'
import { Menu, writeClipboard } from '@deepseek-ai/dsh-client-ui-primitives'
import type { ObservableSnapshot } from '@deepseek-ai/dsh-client-store'
import type { SessionId } from '@deepseek-ai/dsh-session/types'
import type { InjectFace, PropsLocale, PropsRuntime } from '@deepseek-ai/dsh-client-ui-slots'
import type { ProjectRow } from './library-api.ts'
import type { NovenTree, TreeCardRow, TreeModuleRow, TreeSectionRow } from './tree-api.ts'
import type { ProjectFocus, SimRow } from './canvas.tsx'
import type { CreateKind } from './creation.tsx'
import type { SidebarRightGuideBox } from '@deepseek-ai/dsh-client-ui-sidebar-right/client'
import type { ShellT } from './pages/Home.tsx'
import { glyph } from './icons.tsx'

/** 内容树注入面：数据四源 + 打开/切换回调。 */
export interface TreeInjected {
  readonly hooks: {
    readonly tree: ObservableSnapshot<NovenTree | undefined>
    readonly project: ObservableSnapshot<ProjectFocus | undefined>
    readonly projects: ObservableSnapshot<readonly ProjectRow[]>
    /** 项目根下的会话清单——Studio 组列其中带「模拟」标记的。 */
    readonly sims: ObservableSnapshot<readonly SimRow[]>
    /** 挂窗开态（菜单勾选态；noven-dock 缺席时恒 false）。 */
    readonly dock: ObservableSnapshot<boolean>
    /** 底部面板开态（better-sidebar 缺席时恒 false）。 */
    readonly bottomPanel: ObservableSnapshot<boolean>
    /** Studio 组存续态：新建菜单里明确开启才 true（按项目根记）。 */
    readonly studio: ObservableSnapshot<boolean>
    /** 本会话画布焦点叶的当前页签 key——树行据此点亮相映的"当前页"。 */
    readonly activeTab: ObservableSnapshot<string | undefined>
    /** 右栏功能页签清单（guide 注册表）——工具菜单的功能行按它枚举。 */
    readonly featureTabs: ObservableSnapshot<readonly SidebarRightGuideBox[]>
  }
  /** Studio 组行：把该会话挂进模拟器并切到画布手机屏。 */
  readonly openSim: (id: SessionId) => void
  /** Studio 组头「＋」：建一条 模- 会话。 */
  readonly createSim: () => void
  /** 「新建 → Studio」：翻转 Studio 组的存续态（开关，不是建会话）。 */
  readonly toggleStudio: () => void
  /** 工具菜单功能行：开对应的右栏功能页签。 */
  readonly openFeatureTab: (kind: string) => void
  /** 「挂窗」开合——noven-dock 缺席时 undefined，工具行不出。 */
  readonly toggleDock?: () => void
  /** 「底部面板」开合——better-sidebar 缺席时 undefined，工具行不出。 */
  readonly toggleBottomPanel?: () => void
  /** 散文件原地改名/删除——树行与页内菜单共用同一对。 */
  readonly renameFile: (path: string, name: string) => void
  readonly deleteFile: (path: string) => void
  /** 呈现轴：'hidden' 隐藏节点 / 'file' 恢复默认展示。 */
  readonly present: (path: string, view: 'hidden' | 'file') => void
  /** 用户分组删除（rmdir 递归；UI 侧已确认）。 */
  readonly deleteGroup: (name: string) => void
  readonly openCard: (cardId: string, moduleId?: string, title?: string) => void
  /** 卡行尾的「＋」：打开该卡并直接弹模块库（在卡里加下属模块）。 */
  readonly addModule: (cardId: string) => void
  /** 模块行 ⋯ 菜单的三个动作；宿主负责 loadCard 拿 version 后 apply。 */
  readonly renameModule: (cardId: string, moduleId: string, name: string) => void
  readonly copyModule: (cardId: string, moduleId: string) => void
  readonly deleteModule: (cardId: string, moduleId: string) => void
  /** 把项目文件嵌进模块：moduleId 为 null 时在该卡根以文件名新建一个模块。 */
  readonly embedFile: (cardId: string, moduleId: string | null, path: string) => void
  /** 卡行 ⋯ 菜单的两个动作；删除是软删（写 deleted.json，历史保留）。 */
  readonly renameCard: (cardId: string, name: string) => void
  readonly deleteCard: (cardId: string) => void
  readonly openDoc: (path: string, title: string) => void
  readonly openWork: (path: string, title: string) => void
  readonly openFiles: () => void
  readonly openCreate: (kind: CreateKind, dir?: string) => void
  readonly switchProject: (root: string) => void
  /** rail 态里把抽屉展开回来。 */
  readonly expandDrawer: () => void
}

/** 模块行的类型图标：widget type → 线性图标（设计稿 02/03）。 */
const MODULE_ICON: Record<string, () => ReactNode> = {
  document: () => glyph.file(13),
  timeline: () => glyph.clock(13),
  collection: () => glyph.layers(13),
  map: () => glyph.map(13),
  html: () => glyph.code(13),
  layout: () => glyph.grid(13),
  relation: () => glyph.users(13),
}

function moduleIcon(type: string, name: string): ReactNode {
  // 「设定总览」是世界卡起手时的约定名——它配专属图标，其余文档模块走 file。
  if (name === '设定总览') return glyph.bolt(13)
  return (MODULE_ICON[type] ?? MODULE_ICON.document)()
}

/** 模块行的总览判定：起手模块带 overview 渲染器；旧卡退化为约定名。总览由卡下的固定行承担，模块行里不再单列。 */
function isOverviewRow(module: TreeModuleRow): boolean {
  return module.type === 'overview' || module.name === '设定总览'
}

/** 拖放项目文件用的 dataTransfer 类型。 */
const FILE_DROP_TYPE = 'application/x-noven-file'

/** 模块行的嵌入落点判定；返回拖来的文件路径，没有则 undefined。 */
function fileDrop(e: DragEvent): string | undefined {
  const path = e.dataTransfer.getData(FILE_DROP_TYPE)
  return path === '' ? undefined : path
}

/** 一行模块：图标 + 名 + 悬停行尾的 ⋯ 菜单（重命名/复制/归档）。 */
function ModuleRow({ module, depth, cardId, current, pending, t, onOpen, ops }: {
  readonly module: TreeModuleRow
  readonly depth: number
  readonly cardId: string
  readonly current: boolean
  readonly pending: boolean
  readonly t: ShellT
  readonly onOpen: (moduleId: string, name: string) => void
  readonly ops: ModuleOps
}) {
  const [menuOpen, setMenuOpen] = useState(false)
  const [renaming, setRenaming] = useState(false)
  const [draft, setDraft] = useState(module.name)
  const archived = module.routing === 'STANDBY'
  const commit = (): void => {
    setRenaming(false)
    const next = draft.trim()
    if (next !== '' && next !== module.name) ops.rename(cardId, module.id, next)
  }
  return (
    <div className="nv-tree-row nv-tree-module" data-archived={archived || undefined}
      data-current={current || undefined}
      style={{ paddingLeft: 28 + depth * 14 }}
      onDragOver={e => { if (e.dataTransfer.types.includes(FILE_DROP_TYPE)) e.preventDefault() }}
      onDrop={e => { const path = fileDrop(e); if (path !== undefined) { e.preventDefault(); ops.embedFile(cardId, module.id, path) } }}>
      {renaming ? (
        <input className="nv-tree-renamein" value={draft} autoFocus
          onChange={e => setDraft(e.target.value)} onBlur={commit}
          onKeyDown={e => { if (e.key === 'Enter') commit(); if (e.key === 'Escape') setRenaming(false) }} />
      ) : (
        <button type="button" className="nv-tree-main" onClick={() => onOpen(module.id, module.name)}>
          <span className="nv-tree-glyph">{moduleIcon(module.type, module.name)}</span>
          <span className="nv-tree-name">{module.name}</span>
          {pending && <span className="nv-tree-pending" title={t('tree.pending')} />}
        </button>
      )}
      <Menu open={menuOpen} side="bottom" align="end" selection="fill" listClassName="nv-tree-newmenu"
        onClose={() => setMenuOpen(false)}
        onSelect={id => {
          setMenuOpen(false)
          if (id === 'rename') { setDraft(module.name); setRenaming(true) }
          if (id === 'copy') ops.copy(cardId, module.id)
          if (id === 'link') void writeClipboard(`[${module.name}](noven://card/${cardId}/module/${module.id})`)
          if (id === 'delete' && window.confirm(t('tree.mod.deleteConfirm').replace('{name}', module.name))) ops.delete(cardId, module.id)
        }}
        items={[
          { id: 'rename', label: t('tree.mod.rename') },
          { id: 'copy', label: t('tree.mod.copy') },
          { id: 'link', label: t('tree.mod.copyLink') },
          { id: 'delete', label: t('tree.mod.delete') },
        ]}
        anchor={(
          <button type="button" className="nv-tree-more" aria-label={t('tree.mod.more')}
            onClick={() => setMenuOpen(v => !v)}>⋯</button>
        )} />
    </div>
  )
}

/** 模块行可用的注入操作。 */
export interface ModuleOps {
  readonly rename: (cardId: string, moduleId: string, name: string) => void
  readonly copy: (cardId: string, moduleId: string) => void
  readonly delete: (cardId: string, moduleId: string) => void
  /** 文件拖放到模块行 / 卡行（moduleId null = 卡根新建模块）时的嵌入。 */
  readonly embedFile: (cardId: string, moduleId: string | null, path: string) => void
}

/** 卡行 ⋯ 菜单可用的注入操作。 */
export interface CardOps {
  readonly rename: (cardId: string, name: string) => void
  readonly delete: (cardId: string) => void
  /** 「查看源文件」：把卡目录的 card.json 开成文稿页签。 */
  readonly showSource: (path: string) => void
  /** 呈现轴：'hidden' 隐藏卡目录 / 'file' 恢复。 */
  readonly present: (path: string, view: 'hidden' | 'file') => void
}

/** 一棵模块子树：行点击打开所属卡页。`pendingModules` = 提案碰过的模块 id 集。 */
function ModuleRows({ modules, depth, cardId, currentKey, pendingModules, onOpen, t, ops }: {
  readonly modules: readonly TreeModuleRow[]
  readonly depth: number
  readonly cardId: string
  readonly currentKey: string | undefined
  readonly pendingModules: ReadonlySet<string> | undefined
  readonly onOpen: (moduleId: string, name: string) => void
  readonly t: ShellT
  readonly ops: ModuleOps
}) {
  return (
    <>
      {modules.map(module => (
        <div key={module.id}>
          <ModuleRow module={module} depth={depth} cardId={cardId} t={t} onOpen={onOpen} ops={ops}
            pending={pendingModules?.has(module.id) === true}
            current={currentKey === `mod:${cardId}:${module.id}`} />
          <ModuleRows modules={module.children} depth={depth + 1} cardId={cardId} currentKey={currentKey} pendingModules={pendingModules} onOpen={onOpen} t={t} ops={ops} />
        </div>
      ))}
    </>
  )
}

/** 树里模块子树展平（嵌入目标菜单用，只取标签）。 */
function flatTreeModules(modules: readonly TreeModuleRow[]): readonly TreeModuleRow[] {
  return modules.flatMap(module => [module, ...flatTreeModules(module.children)])
}

/** 一行项目文件/目录占位：点击开文稿页签；⋯ 给「放入模块」二级菜单、
    复制链接与呈现轴（隐藏/恢复）。`dir` 行不拖拽不内嵌（是目录占位）。 */
function FileRow({ path, title, dir, hidden, indent = 0, current, t, onOpen, embedTargets, onEmbed, fileOps, present }: {
  readonly path: string
  readonly title: string
  readonly dir?: boolean
  readonly hidden?: boolean
  readonly current?: boolean
  /** 架层内的额外缩进层级。 */
  readonly indent?: number
  readonly t: ShellT
  readonly onOpen: (path: string, title: string) => void
  /** 放入模块的二级菜单项；id 形如 `embed:<cardId>:<moduleId|''>`。 */
  readonly embedTargets: readonly { readonly id: string; readonly label: string }[]
  readonly onEmbed: (id: string) => void
  readonly fileOps: { readonly rename: (path: string, name: string) => void; readonly delete: (path: string) => void }
  readonly present: (path: string, view: 'hidden' | 'file') => void
}) {
  const [menuOpen, setMenuOpen] = useState(false)
  const fileName = path.split('/').pop() ?? path
  const isDir = dir === true
  return (
    <div className={`nv-tree-row nv-tree-module${hidden === true ? ' nv-tree-hidden' : ''}`} style={{ paddingLeft: 28 + indent * 14 }}
      data-current={current || undefined}
      draggable={!isDir}
      onDragStart={e => { e.dataTransfer.setData(FILE_DROP_TYPE, path); e.dataTransfer.effectAllowed = 'copy' }}>
      <button type="button" className="nv-tree-main" onClick={() => { if (!isDir) onOpen(path, title) }}>
        <span className="nv-tree-glyph">{isDir ? glyph.folder(13) : glyph.file(13)}</span>
        <span className="nv-tree-name">{title}</span>
      </button>
      <Menu open={menuOpen} side="bottom" align="end" selection="fill" listClassName="nv-tree-newmenu"
        onClose={() => setMenuOpen(false)}
        onSelect={id => {
          setMenuOpen(false)
          if (id === 'link') { void writeClipboard(`[${title}](${encodeURI(path)})`); return }
          if (id === 'rename') {
            const next = window.prompt(t('canvas.doc.renamePrompt'), fileName)?.trim()
            if (next !== undefined && next !== '' && next !== fileName) fileOps.rename(path, next)
            return
          }
          if (id === 'hide' || id === 'unhide') { present(path, id === 'hide' ? 'hidden' : 'file'); return }
          if (id === 'delete' && window.confirm(t('canvas.doc.deleteConfirm').replace('{name}', fileName))) { fileOps.delete(path); return }
          if (id.startsWith('embed:')) onEmbed(id)
        }}
        items={[
          ...(!isDir ? [
            { id: 'embed', label: t('tree.file.embed'), submenu: embedTargets },
            { id: 'link', label: t('tree.mod.copyLink') },
            { type: 'separator' as const, id: 'file-sep' },
            { id: 'rename', label: t('canvas.doc.rename') },
            { id: 'delete', label: t('canvas.doc.delete'), danger: true as const },
          ] : []),
          { id: hidden === true ? 'unhide' : 'hide', label: t(hidden === true ? 'tree.unhide' : 'tree.hide') },
        ]}
        anchor={(
          <button type="button" className="nv-tree-more" aria-label={t('tree.file.more')}
            onClick={() => setMenuOpen(v => !v)}>⋯</button>
        )} />
    </div>
  )
}

/** 卡类图标：世界 → globe，角色 → user，其他 → file（设计稿 02）。 */
function cardIcon(kind: string): ReactNode {
  if (kind === 'WORLD') return glyph.globe(14)
  if (kind === 'CHARACTER') return glyph.user(14)
  return glyph.file(14)
}

/** 一张卡的子树（设计稿 02）：图标 + 名字 + 右端（⋯ 菜单、悬停「＋」加模块、› 折叠）。
    卡内角色收进「角色 N」子组行，成员再缩进一级。 */
function CardBranch({ card, depth, currentKey, t, onOpen, onAdd, ops, cardOps }: {
  readonly card: TreeCardRow
  /** 架层深度：卡/ 顶层的卡是 0，每深一层缩进 14。 */
  readonly depth: number
  readonly currentKey: string | undefined
  readonly t: ShellT
  readonly onOpen: (moduleId?: string, name?: string) => void
  readonly onAdd: () => void
  readonly ops: ModuleOps
  readonly cardOps: CardOps
}) {
  const [open, setOpen] = useState(true)
  const [menuOpen, setMenuOpen] = useState(false)
  const [renaming, setRenaming] = useState(false)
  const [draft, setDraft] = useState(card.name)
  const commit = (): void => {
    setRenaming(false)
    const next = draft.trim()
    if (next !== '' && next !== card.name) cardOps.rename(card.cardId, next)
  }
  const indent = 4 + depth * 14
  return (
    <div>
      <div className={`nv-tree-row nv-tree-card${card.hidden === true ? ' nv-tree-hidden' : ''}`}
        data-current={currentKey === `card:${card.cardId}` || undefined}
        style={{ paddingLeft: indent }}
        onDragOver={e => { if (e.dataTransfer.types.includes(FILE_DROP_TYPE)) e.preventDefault() }}
        onDrop={e => { const path = fileDrop(e); if (path !== undefined) { e.preventDefault(); ops.embedFile(card.cardId, null, path) } }}>
        {renaming ? (
          <input className="nv-tree-renamein" value={draft} autoFocus
            onChange={e => setDraft(e.target.value)} onBlur={commit}
            onKeyDown={e => { if (e.key === 'Enter') commit(); if (e.key === 'Escape') setRenaming(false) }} />
        ) : (
          <button type="button" className="nv-tree-main" onClick={() => onOpen()}>
            <span className="nv-tree-cardicon">{cardIcon(card.kind)}</span>
            <span className="nv-tree-name">{card.name}</span>
            {card.pending && <span className="nv-tree-pending" title={t('tree.pending')} />}
          </button>
        )}
        <Menu open={menuOpen} side="bottom" align="end" selection="fill" listClassName="nv-tree-newmenu"
          onClose={() => setMenuOpen(false)}
          onSelect={id => {
            setMenuOpen(false)
            if (id === 'rename') { setDraft(card.name); setRenaming(true) }
            if (id === 'link') void writeClipboard(`[${card.name}](noven://card/${card.cardId})`)
            if (id === 'source') cardOps.showSource(`卡/${card.dir}/card.json`)
            if (id === 'hide' || id === 'unhide') cardOps.present(`卡/${card.dir}`, id === 'hide' ? 'hidden' : 'file')
            if (id === 'delete' && window.confirm(t('tree.card.deleteConfirm').replace('{name}', card.name))) cardOps.delete(card.cardId)
          }}
          items={[
            { id: 'rename', label: t('tree.card.rename') },
            { id: 'source', label: t('tree.card.showSource') },
            { id: 'link', label: t('tree.card.copyLink') },
            { id: card.hidden === true ? 'unhide' : 'hide', label: t(card.hidden === true ? 'tree.unhide' : 'tree.hide') },
            { id: 'delete', label: t('tree.card.delete'), danger: true },
          ]}
          anchor={(
            <button type="button" className="nv-tree-more" aria-label={t('tree.card.more')}
              onClick={() => setMenuOpen(v => !v)}>⋯</button>
          )} />
        <button type="button" className="nv-tree-add" title={t('modules.add')} onClick={onAdd}>+</button>
        <button type="button" className={`nv-tree-fold${open ? ' nv-tree-fold-on' : ''}`}
          aria-label={t(open ? 'tree.collapse' : 'tree.expand')}
          onClick={() => setOpen(v => !v)}>›</button>
      </div>
      {open && (
        <div>
          <button type="button" className="nv-tree-row nv-tree-module" style={{ paddingLeft: 28 + depth * 14 }}
            data-current={currentKey === `card:${card.cardId}` || undefined}
            onClick={() => onOpen()}>
            <span className="nv-tree-glyph">{glyph.bolt(13)}</span>
            <span className="nv-tree-name">{t('tree.overview')}</span>
          </button>
          <ModuleRows modules={card.modules.filter(m => !isOverviewRow(m))} depth={depth} cardId={card.cardId} currentKey={currentKey} onOpen={onOpen} t={t} ops={ops}
            pendingModules={card.pendingScopes === undefined ? undefined : new Set(card.pendingScopes.map(s => s.moduleId))} />
          {card.characters.length > 0 && (
            <>
              <div className="nv-tree-roleshead" style={{ paddingLeft: 28 + depth * 14 }}>
                <span className="nv-tree-glyph">{glyph.user(13)}</span>
                <span className="nv-tree-rolestitle">{t('tree.roles')}</span>
                <span className="nv-tree-count">{card.characters.length}</span>
              </div>
              {card.characters.map(character => (
                <button key={character.id} type="button" className="nv-tree-row nv-tree-module" style={{ paddingLeft: 42 + depth * 14 }}
                  onClick={() => onOpen()}>
                  <span className="nv-tree-name">{character.name}</span>
                </button>
              ))}
            </>
          )}
          <button type="button" className="nv-tree-new nv-tree-newmodule" style={{ marginLeft: 28 + depth * 14 }} onClick={onAdd}>
            ＋ {t('tree.newmodule')}
          </button>
        </div>
      )}
    </div>
  )
}

/** 卡架层节点：卡/ 下含卡目录或散件的目录，按路径还原成嵌套组头。 */
interface ShelfNode {
  readonly name: string
  /** 相对 卡/ 的路径（present 用它定位元数据）。 */
  readonly path: string
  readonly shelves: ShelfNode[]
  readonly cards: TreeCardRow[]
  /** 直接躺在这一层的散件行（卡目录内部的由服务端剔掉，到不了这里）。 */
  readonly rows: TreeSectionRow[]
}

/** 找/建 path 指向的架层节点（path 相对 卡/，段间 '/'）。 */
function shelfAt(root: ShelfNode, shelf: string): ShelfNode {
  if (shelf === '') return root
  let node = root
  let path = ''
  for (const segment of shelf.split('/')) {
    path = path === '' ? segment : `${path}/${segment}`
    let next = node.shelves.find(s => s.name === segment)
    if (next === undefined) {
      next = { name: segment, path, shelves: [], cards: [], rows: [] }
      node.shelves.push(next)
    }
    node = next
  }
  return node
}

/** 卡行与散件行按目录归进架层树；卡/ 顶层的留在根节点。 */
function buildShelves(cards: readonly TreeCardRow[], loose: readonly TreeSectionRow[]): ShelfNode {
  const root: ShelfNode = { name: '', path: '', shelves: [], cards: [], rows: [] }
  for (const card of cards) shelfAt(root, card.shelf).cards.push(card)
  for (const row of loose) {
    const rel = row.path.slice('卡/'.length)
    const slash = rel.lastIndexOf('/')
    shelfAt(root, slash < 0 ? '' : rel.slice(0, slash)).rows.push(row)
  }
  return root
}

/** 架层的「全隐」近似：其下卡与散件都被隐藏时组头也画灰（呈现轴按链下传）。 */
function shelfHidden(node: ShelfNode): boolean {
  const total = node.cards.length + node.rows.length + node.shelves.reduce((n, s) => n + countShelfItems(s), 0)
  return total > 0 && node.cards.every(c => c.hidden === true) && node.rows.every(r => r.hidden === true) && node.shelves.every(shelfHidden)
}
function countShelfItems(node: ShelfNode): number {
  return node.cards.length + node.rows.length + node.shelves.reduce((n, s) => n + countShelfItems(s), 0)
}

/** 文件行操作面：架层里的散件与用户分组的文件共用一套。 */
interface FileOps {
  readonly open: (path: string, title: string) => void
  readonly embedTargets: readonly { readonly id: string; readonly label: string }[]
  readonly embed: (id: string, path: string) => void
  readonly rename: (path: string, name: string) => void
  readonly delete: (path: string) => void
  readonly present: (path: string, view: 'hidden' | 'file') => void
}

/** 一层架层：文件夹组头（折叠 + ⋯ 隐藏/恢复）+ 子架层 + 卡行 + 散件行。 */
function ShelfBranch({ node, depth, currentKey, t, onOpen, onAdd, ops, cardOps, fileOps }: {
  readonly node: ShelfNode
  readonly depth: number
  readonly currentKey: string | undefined
  readonly t: ShellT
  readonly onOpen: (cardId: string, moduleId?: string, name?: string) => void
  readonly onAdd: (cardId: string) => void
  readonly ops: ModuleOps
  readonly cardOps: CardOps
  readonly fileOps: FileOps
}) {
  const [open, setOpen] = useState(true)
  const [menuOpen, setMenuOpen] = useState(false)
  const hidden = shelfHidden(node)
  return (
    <div>
      <div className={`nv-tree-row nv-tree-shelf${hidden ? ' nv-tree-hidden' : ''}`} style={{ paddingLeft: 4 + depth * 14 }}>
        <button type="button" className="nv-tree-main" onClick={() => setOpen(v => !v)}>
          <span className="nv-tree-glyph">{glyph.folder(13)}</span>
          <span className="nv-tree-name">{node.name}</span>
        </button>
        <Menu open={menuOpen} side="bottom" align="end" selection="fill" listClassName="nv-tree-newmenu"
          onClose={() => setMenuOpen(false)}
          onSelect={id => {
            setMenuOpen(false)
            if (id === 'hide' || id === 'unhide') cardOps.present(`卡/${node.path}`, id === 'hide' ? 'hidden' : 'file')
          }}
          items={[
            { id: hidden ? 'unhide' : 'hide', label: t(hidden ? 'tree.unhide' : 'tree.hide') },
          ]}
          anchor={(
            <button type="button" className="nv-tree-more" aria-label={t('tree.file.more')}
              onClick={() => setMenuOpen(v => !v)}>⋯</button>
          )} />
        <button type="button" className={`nv-tree-fold${open ? ' nv-tree-fold-on' : ''}`}
          aria-label={t(open ? 'tree.collapse' : 'tree.expand')}
          onClick={() => setOpen(v => !v)}>›</button>
      </div>
      {open && (
        <div>
          {node.shelves.map(shelf => (
            <ShelfBranch key={shelf.path} node={shelf} depth={depth + 1} currentKey={currentKey} t={t}
              onOpen={onOpen} onAdd={onAdd} ops={ops} cardOps={cardOps} fileOps={fileOps} />
          ))}
          {node.cards.map(card => (
            <CardBranch key={card.cardId} card={card} depth={depth + 1} currentKey={currentKey} t={t}
              onOpen={(moduleId, name) => onOpen(card.cardId, moduleId, name)}
              onAdd={() => onAdd(card.cardId)} ops={ops} cardOps={cardOps} />
          ))}
          {node.rows.map(row => (
            <FileRow key={row.path} path={row.path} title={row.title} dir={row.dir} hidden={row.hidden}
              current={currentKey === `doc:${row.path}`}
              indent={depth + 1} t={t} onOpen={fileOps.open} embedTargets={fileOps.embedTargets}
              onEmbed={id => fileOps.embed(id, row.path)}
              fileOps={{ rename: fileOps.rename, delete: fileOps.delete }} present={fileOps.present} />
          ))}
        </div>
      )}
    </div>
  )
}

/** 分组头（设计稿 02）：纯灰小标签，不折叠、不计数；`onAdd` 是行尾
    悬停才显的「＋」（造一个同级成员）。 */
function Group({ title, count, children, onAdd, addTitle, onDelete, deleteTitle, always }: {
  readonly title: string
  readonly count: number
  readonly children: ReactNode
  readonly onAdd?: () => void
  readonly addTitle?: string
  /** 悬停行尾的「×」：用户分组可连目录一起删（确认在调用方）。 */
  readonly onDelete?: () => void
  readonly deleteTitle?: string
  /** 空也渲染：用户显式建出的分组架子不能因为没东西就消失。 */
  readonly always?: boolean
}) {
  if (count === 0 && always !== true) return null
  return (
    <div className="nv-tree-group">
      <div className="nv-tree-grouprow">
        <span className="nv-tree-grouptitle">{title}</span>
        {onAdd !== undefined && (
          <button type="button" className="nv-tree-add" title={addTitle}
            onClick={e => { e.stopPropagation(); onAdd() }}>+</button>
        )}
        {onDelete !== undefined && (
          <button type="button" className="nv-tree-add nv-tree-del" title={deleteTitle}
            onClick={e => { e.stopPropagation(); onDelete() }}>×</button>
        )}
      </div>
      {children}
    </div>
  )
}

type TreeProps = PropsRuntime<'sidebar.right.pane.top'> & PropsLocale<'novenShell'> & InjectFace<TreeInjected>

/**
 * 内容树组件：读树源 + 项目源，行点击全部经注入面回到画布。
 * @param props - 抽屉上区座标准 props（`rail` 报折叠态）+ 注入面。
 * @returns 抽屉导航。
 */
export function ContentTree(props: TreeProps) {
  const { t, useTree, useProject, useProjects } = props
  const tree = useTree(v => v)
  const project = useProject(v => v)
  const projects = useProjects(v => v)
  const currentKey = props.useActiveTab(v => v)
  const [query, setQuery] = useState('')
  const [menuOpen, setMenuOpen] = useState(false)
  const [toolsOpen, setToolsOpen] = useState(false)
  const [switchOpen, setSwitchOpen] = useState(false)
  const searchRef = useRef<HTMLInputElement>(null)

  // ⌘K 聚焦树内搜索（设计稿 01 搜索框的 ⌘K 角标是真的快捷键）。抽屉收成
  // rail 时输入框不存在，让出按键不拦截上游的会话搜索。
  useEffect(() => {
    const onKey = (e: KeyboardEvent): void => {
      if (e.key.toLowerCase() !== 'k' || !(e.metaKey || e.ctrlKey) || e.altKey || e.shiftKey) return
      const input = searchRef.current
      if (input === null) return
      e.preventDefault()
      e.stopPropagation()
      input.focus()
      input.select()
    }
    window.addEventListener('keydown', onKey, true)
    return () => { window.removeEventListener('keydown', onKey, true) }
  }, [])

  /** Studio 组行：只列带「模拟」标记的会话（模- 前缀 ∪ 用户点过「模拟」）。 */
  const sims = props.useSims(v => v)
  const simRows = useMemo(() => sims.filter(r => r.sim), [sims])
  const dockOpen = props.useDock(v => v)
  const bottomOpen = props.useBottomPanel(v => v)
  const studioOn = props.useStudio(v => v)
  const featureTabs = props.useFeatureTabs(v => v)
  const needle = query.trim().toLowerCase()
  const filtered = useMemo((): NovenTree | undefined => {
    if (tree === undefined || needle === '') return tree
    const match = (name: string) => name.toLowerCase().includes(needle)
    const moduleHit = (modules: readonly TreeModuleRow[]): boolean =>
      modules.some(m => match(m.name) || moduleHit(m.children))
    return {
      ...tree,
      cards: tree.cards.filter(c => match(c.name) || moduleHit(c.modules) || c.characters.some(ch => match(ch.name))),
      docs: tree.docs.filter(d => match(d.title) || match(d.path)),
      works: tree.works.filter(w => match(w.title) || match(w.path)),
      sections: (tree.sections ?? [])
        .filter(s => match(s.name) || s.rows.some(r => match(r.title) || match(r.path)))
        .map(s => ({ ...s, rows: match(s.name) ? s.rows : s.rows.filter(r => match(r.title) || match(r.path)) })),
    }
  }, [tree, needle])

  // 呈现轴：hidden 行默认不渲；眼睛开关掀开时一律画灰占位（给恢复口）。
  const [showHidden, setShowHidden] = useState(false)
  const display = useMemo((): NovenTree | undefined => {
    if (filtered === undefined || showHidden) return filtered
    return {
      ...filtered,
      cards: filtered.cards.filter(c => c.hidden !== true),
      docs: filtered.docs.filter(d => d.hidden !== true),
      works: filtered.works.filter(w => w.hidden !== true),
      sections: (filtered.sections ?? [])
        .filter(s => s.hidden !== true)
        .map(s => ({ ...s, rows: s.rows.filter(r => r.hidden !== true) })),
    }
  }, [filtered, showHidden])
  const hiddenCount = filtered === undefined ? 0
    : filtered.cards.filter(c => c.hidden === true).length
      + filtered.docs.filter(d => d.hidden === true).length
      + filtered.works.filter(w => w.hidden === true).length
      + (filtered.sections ?? []).reduce((n, s) => n + (s.hidden === true ? 1 : 0) + s.rows.filter(r => r.hidden === true).length, 0)

  const empty = display !== undefined && display.cards.length === 0 && display.docs.length === 0
    && display.works.length === 0 && (display.sections ?? []).length === 0
  /** 目录存在性 → 内置分组的空架子也要渲染（用户刚建出的组必须可见）。 */
  const hasDir = (name: string): boolean => (display?.sections ?? []).some(s => s.name === name)
  /** 用户分组 = 顶层目录里刨掉内置的 卡/ 文稿/。 */
  const userSections = (display?.sections ?? []).filter(s => s.name !== '卡' && s.name !== '文稿')
  /** 卡/ 架层散件行（卡目录内部不算散件，服务端已剔）。 */
  const cardShelfRows = (display?.sections ?? []).find(s => s.name === '卡')?.rows ?? []
  /** 卡行与散件行按目录归架层；卡/ 顶层的留在根节点。 */
  const shelfRoot = useMemo(() => buildShelves(display?.cards ?? [], cardShelfRows), [display, cardShelfRows])
  const cardOps: CardOps = useMemo(() => ({
    rename: props.renameCard, delete: props.deleteCard,
    showSource: path => props.openDoc(path, 'card.json'),
    present: props.present,
  }), [props.renameCard, props.deleteCard, props.openDoc, props.present])
  /** 文件行「放入模块」二级菜单：每卡先给"新建模块"项，再列全部模块（嵌套展平）。 */
  const embedTargets = useMemo(() => (filtered?.cards ?? []).flatMap(card => [
    { id: `embed:${card.cardId}:`, label: t('tree.file.embedNew').replace('{card}', card.name) },
    ...flatTreeModules(card.modules).map(m => ({ id: `embed:${card.cardId}:${m.id}`, label: `${card.name} / ${m.name}` })),
  ]).slice(0, 80), [filtered, t])
  const embedFromId = (id: string, path: string): void => {
    const [, cardId, moduleId] = id.split(':')
    if (cardId === undefined || cardId === '') return
    props.embedFile(cardId, moduleId === undefined || moduleId === '' ? null : moduleId, path)
  }
  const fileOps: FileOps = useMemo(() => ({
    open: props.openDoc,
    embedTargets,
    embed: embedFromId,
    rename: props.renameFile,
    delete: props.deleteFile,
    present: props.present,
  }), [props.openDoc, embedTargets, props.renameFile, props.deleteFile, props.present])
  /** 无项目态：中部圆钮替代底部新建条（建出内容后新建回到底部长条）。 */
  const noProject = filtered === undefined
  const title = project?.title ?? (project === undefined ? t('tree.noProject') : project.root.split('/').filter(Boolean).pop() ?? project.root)

  if (props.rail) {
    return (
      <div className="nv-tree nv-tree-rail">
        <button type="button" className="nv-tree-railbtn" title={title}
          onClick={props.expandDrawer}>{title.slice(0, 2)}</button>
        <button type="button" className="nv-tree-railbtn" title={t('tree.new')}
          onClick={props.expandDrawer}>＋</button>
      </div>
    )
  }

  return (
    <div className="nv-tree">
      <div className="nv-tree-head">
        <Menu open={switchOpen} side="bottom" align="start" selection="fill"
          onClose={() => setSwitchOpen(false)}
          onSelect={id => { setSwitchOpen(false); props.switchProject(id) }}
          items={projects.map(row => ({ id: row.root, label: row.title }))}
          anchor={(
            <button type="button" className="nv-tree-project" title={t('tree.switch')}
              onClick={() => setSwitchOpen(v => !v)}>
              <span className="nv-tree-projectname">{title}</span>
              <span className="nv-tree-caret">⌄</span>
            </button>
          )} />
        {hiddenCount > 0 && (
          <button type="button" className={`nv-tree-eye${showHidden ? ' nv-tree-eye-on' : ''}`}
            title={t(showHidden ? 'tree.hideHidden' : 'tree.showHidden')}
            onClick={() => setShowHidden(v => !v)}>
            {glyph.eye(13)}
            <span className="nv-tree-eyecount">{hiddenCount}</span>
          </button>
        )}
      </div>
      <div className="nv-tree-search">
        <div className="nv-tree-searchwrap">
          <span className="nv-tree-searchicon" aria-hidden="true">{glyph.search(13)}</span>
          <input ref={searchRef} className="nv-tree-searchbox" value={query} placeholder={t('tree.search')}
            onChange={e => setQuery(e.target.value)} />
          {query === '' && <kbd className="nv-tree-kbd" aria-hidden="true">⌘K</kbd>}
        </div>
      </div>
      <div className="nv-tree-scroll">
        {noProject && (
          <div className="nv-tree-orbwrap">
            <button type="button" className="nv-tree-orb" onClick={() => props.openCreate('world')}>
              <span className="nv-tree-orbplus">＋</span>
              <span>{t('tree.new')}</span>
            </button>
          </div>
        )}
        {empty && <div className="nv-tree-empty">{t('tree.empty')}</div>}
        <Group title={t('tree.cards')} count={display?.cards.length ?? 0} always={hasDir('卡')}
          onAdd={() => props.openCreate('world')} addTitle={t('create.world.title')}>
          {shelfRoot.shelves.map(shelf => (
            <ShelfBranch key={shelf.path} node={shelf} depth={0} currentKey={currentKey} t={t}
              onOpen={props.openCard} onAdd={props.addModule}
              ops={{ rename: props.renameModule, copy: props.copyModule, delete: props.deleteModule, embedFile: props.embedFile }}
              cardOps={cardOps} fileOps={fileOps} />
          ))}
          {shelfRoot.cards.map(card => (
            <CardBranch key={card.cardId} card={card} depth={0} currentKey={currentKey} t={t}
              onOpen={(moduleId, name) => props.openCard(card.cardId, moduleId, name)}
              onAdd={() => props.addModule(card.cardId)}
              ops={{ rename: props.renameModule, copy: props.copyModule, delete: props.deleteModule, embedFile: props.embedFile }}
              cardOps={cardOps} />
          ))}
          {shelfRoot.rows.map(row => (
            <FileRow key={row.path} path={row.path} title={row.title} dir={row.dir} hidden={row.hidden} t={t}
              current={currentKey === `doc:${row.path}`}
              onOpen={fileOps.open} embedTargets={embedTargets} onEmbed={id => embedFromId(id, row.path)}
              fileOps={{ rename: fileOps.rename, delete: fileOps.delete }} present={fileOps.present} />
          ))}
        </Group>
        <Group title={t('tree.docs')} count={display?.docs.length ?? 0} always={hasDir('文稿')}
          onAdd={() => props.openCreate('doc')} addTitle={t('create.doc.title')}>
          {display?.docs.map(doc => (
            <FileRow key={doc.path} path={doc.path} title={doc.title} hidden={doc.hidden} t={t}
              current={currentKey === `doc:${doc.path}`}
              onOpen={props.openDoc} embedTargets={embedTargets} onEmbed={id => embedFromId(id, doc.path)}
              fileOps={fileOps} present={props.present} />
          ))}
        </Group>
        <Group title={t('tree.works')} count={display?.works.length ?? 0}>
          {display?.works.map(work => (
            <button key={work.id} type="button" className={`nv-tree-row nv-tree-module${work.hidden === true ? ' nv-tree-hidden' : ''}`} style={{ paddingLeft: 28 }}
              data-current={currentKey === `work:${work.path}` || undefined}
              onClick={() => props.openWork(work.path, work.title)}>
              <span className="nv-tree-glyph">{glyph.grid(13)}</span>
              <span className="nv-tree-name">{work.title}</span>
            </button>
          ))}
        </Group>
        {userSections.map(section => (
          <Group key={section.name} title={section.name} count={section.rows.length} always
            onAdd={() => props.openCreate('doc', section.name)} addTitle={t('create.doc.title')}
            onDelete={() => {
              if (window.confirm(t('tree.group.deleteConfirm').replace('{name}', section.name).replace('{count}', String(section.rows.length))))
                props.deleteGroup(section.name)
            }}
            deleteTitle={t('tree.group.delete')}>
            {section.rows.map(row => (
              <FileRow key={row.path} path={row.path} title={row.title} dir={row.dir} hidden={row.hidden} t={t}
                onOpen={props.openDoc} embedTargets={embedTargets} onEmbed={id => embedFromId(id, row.path)}
                fileOps={fileOps} present={props.present} />
            ))}
          </Group>
        ))}
        {studioOn && (
        <Group title={t('tree.studio')} count={simRows.length}
          onAdd={props.createSim} addTitle={t('sim.list.new')}>
          {simRows.map(row => (
            <button key={row.id} type="button" className="nv-tree-row nv-tree-module" style={{ paddingLeft: 28 }}
              onClick={() => props.openSim(row.id)}>
              <span className="nv-tree-glyph">{glyph.phone(13)}</span>
              <span className="nv-tree-name">{row.title}</span>
              {row.running && <span className="nv-simrow-dot" />}
            </button>
          ))}
        </Group>
        )}
      </div>
      {!noProject && (
      <div className="nv-tree-foot">
        <Menu open={menuOpen} side="top" align="start" selection="fill" listClassName="nv-tree-newmenu"
          onClose={() => setMenuOpen(false)}
          onSelect={id => {
            setMenuOpen(false)
            // Studio 是开关不是新建对象：翻转组存续态，其余 kinds 走新建面板。
            if (id === 'studio') { props.toggleStudio(); return }
            props.openCreate(id as CreateKind)
          }}
          selectedIds={studioOn ? ['studio'] : []}
          items={[
            { id: 'group', label: t('create.group.title'), icon: glyph.folder(14) },
            { id: 'card', label: t('create.card.title'), icon: glyph.layers(14) },
            { id: 'studio', label: t('create.studio.title'), icon: glyph.phone(14) },
            { id: 'doc', label: t('create.doc.title'), icon: glyph.file(14) },
            { id: 'comic', label: t('create.comic.title'), icon: glyph.image(14) },
            { id: 'import', label: t('canvas.start.import'), icon: glyph.upload(14) },
          ]}
          anchor={(
            <button type="button" className="nv-tree-new nv-tree-foothalf" onClick={() => setMenuOpen(v => !v)}>
              <span>＋</span>
              <span>{t('tree.new')}</span>
            </button>
          )} />
        <Menu open={toolsOpen} side="top" align="start" selection="fill" listClassName="nv-tree-newmenu"
          onClose={() => setToolsOpen(false)}
          onSelect={id => {
            setToolsOpen(false)
            if (id === 'dock') { props.toggleDock?.(); return }
            if (id === 'bottom') { props.toggleBottomPanel?.(); return }
            props.openFeatureTab(id)
          }}
          selectedIds={[...(dockOpen ? ['dock'] : []), ...(bottomOpen ? ['bottom'] : [])]}
          items={[
            ...featureTabs.map(box => ({ id: box.kind, label: box.title(), icon: box.icon === undefined ? undefined : <box.icon size={14} /> })),
            ...(props.toggleDock === undefined ? [] : [{ type: 'separator' as const, id: 'tool-sep-dock' }, { id: 'dock', label: t('tree.tool.dock'), icon: glyph.floatWin(14) }]),
            ...(props.toggleBottomPanel === undefined ? [] : [{ id: 'bottom', label: t('tree.tool.bottom'), icon: glyph.panelBottom(14) }]),
          ]}
          anchor={(
            <button type="button" className="nv-tree-new nv-tree-foothalf" onClick={() => setToolsOpen(v => !v)}>
              <span className="nv-tree-toolicon">{glyph.wrench(13)}</span>
              <span>{t('tree.tools')}</span>
            </button>
          )} />
      </div>
      )}
    </div>
  )
}
