/**
 * 内容树 — 抽屉上区（设计稿 01/02/J05），挂在 `sidebar.right.pane.top`：
 * 项目头 + 搜索 + 卡/文稿/作品分组 + 「素材与文件」与「＋ 新建」底排。
 * `rail` 态画图标列。数据只读 `/api/noven-tree` 的轮询源；点击行由注入面
 * 落到画布标签。
 * @module noven-shell/client/tree
 */
import { useEffect, useMemo, useRef, useState, type DragEvent, type MouseEvent as ReactMouseEvent, type ReactNode } from 'react'
import { Menu, writeClipboard } from '@deepseek-ai/dsh-client-ui-primitives'
import type { ObservableSnapshot } from '@deepseek-ai/dsh-client-store'
import type { SessionId } from '@deepseek-ai/dsh-session/types'
import type { InjectFace, PropsLocale, PropsRuntime } from '@deepseek-ai/dsh-client-ui-slots'
import type { ProjectRow } from './library-api.ts'
import type { NovenTree, TreeCardRow, TreeModuleRow, TreeSectionRow, TreeWorkRow } from './tree-api.ts'
import type { ProjectFocus, SimRow } from './canvas.tsx'
import type { CreateKind } from './creation.tsx'
import type { SidebarRightGuideBox } from '@deepseek-ai/dsh-client-ui-sidebar-right/client'
import type { ShellT } from './pages/Home.tsx'
import { glyph } from './icons.tsx'
import { askConfirm, InlineRename, useArmedMenu } from './ui/interact.tsx'

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
  readonly deleteCard: (cardId: string, name: string) => void
  readonly openDoc: (path: string, title: string) => void
  readonly openWork: (path: string, title: string) => void
  readonly openFiles: () => void
  readonly openCreate: (kind: CreateKind, dir?: string) => void
  /** 项目名点击：画布全屏打开当前项目的创作库页（返回由面板栈还原）。 */
  readonly openProject: () => void
  /** 改作品清单里的展示名（账本轴，与文件名无关）。 */
  readonly renameWork: (workId: string, title: string) => void
  /** 把登记作品移出清单（文件留在盘上）；`title` 用于回执。 */
  readonly dropWork: (workId: string, title: string) => void
  /** 批量呈现：同父目录的 .noven.json 是 read-modify-write，并发会互相
      覆盖——宿主侧串行写。 */
  readonly presentAll: (paths: readonly string[], view: 'hidden' | 'file') => void
  /** 批量删除：卡走软删、文件走 rm、登记行顺带移出清单——同样串行。 */
  readonly deleteSel: (items: readonly { readonly path: string; readonly cardId?: string; readonly workId?: string }[]) => void
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
/** 顶层分组拖排序用的 dataTransfer 类型。 */
const GROUP_DROP_TYPE = 'application/x-noven-treegroup'

/** 顶层分组的折叠态与排序（按项目根记 localStorage）。`view` 记视图档：
    缺省 'entity'（模块视图）——只列成品实体；'file' 是文件管理器全量档。 */
interface GroupPrefs {
  readonly order: readonly string[]
  readonly collapsed: readonly string[]
  readonly view?: 'file' | 'entity'
}

const EMPTY_GROUP_PREFS: GroupPrefs = { order: [], collapsed: [] }

function groupPrefsKey(root: string): string {
  return `noven.tree.groups.v1:${root}`
}

/** 读某项目的分组偏好；坏档/未存过都回默认。 */
function readGroupPrefs(root: string | undefined): GroupPrefs {
  if (root === undefined) return EMPTY_GROUP_PREFS
  try {
    const raw = localStorage.getItem(groupPrefsKey(root))
    if (raw === null) return EMPTY_GROUP_PREFS
    const parsed = JSON.parse(raw) as Partial<GroupPrefs>
    return {
      order: Array.isArray(parsed.order) ? parsed.order.filter((k): k is string => typeof k === 'string') : [],
      collapsed: Array.isArray(parsed.collapsed) ? parsed.collapsed.filter((k): k is string => typeof k === 'string') : [],
      view: parsed.view === 'file' || parsed.view === 'entity' ? parsed.view : undefined,
    }
  } catch (parseErr) {
    // localStorage 在隐私/沙箱态可抛，坏 JSON 也统一回默认——偏好丢了只是顺序复原。
    void parseErr
    return EMPTY_GROUP_PREFS
  }
}

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
  const arm = useArmedMenu(useMemo(() => [{ id: 'delete', confirmLabel: t('ui.armed.delete') }], [t]))
  const archived = module.routing === 'STANDBY'
  return (
    <div className="nv-tree-row nv-tree-module" data-archived={archived || undefined}
      data-current={current || undefined}
      style={{ paddingLeft: 28 + depth * 14 }}
      onDragOver={e => { if (e.dataTransfer.types.includes(FILE_DROP_TYPE)) e.preventDefault() }}
      onDrop={e => { const path = fileDrop(e); if (path !== undefined) { e.preventDefault(); ops.embedFile(cardId, module.id, path) } }}>
      {renaming ? (
        <InlineRename className="nv-tree-renamein" value={module.name}
          onDone={next => { setRenaming(false); if (next !== undefined) ops.rename(cardId, module.id, next) }} />
      ) : (
        <button type="button" className="nv-tree-main" onClick={() => onOpen(module.id, module.name)}>
          <span className="nv-tree-glyph">{moduleIcon(module.type, module.name)}</span>
          <span className="nv-tree-name">{module.name}</span>
          {pending && <span className="nv-tree-pending" title={t('tree.pending')} />}
        </button>
      )}
      <Menu open={menuOpen} side="bottom" align="end" selection="fill" listClassName="nv-tree-newmenu"
        onClose={() => { arm.reset(); setMenuOpen(false) }}
        onSelect={id => {
          if (arm.select(id) === 'armed') return
          setMenuOpen(false)
          if (id === 'rename') setRenaming(true)
          if (id === 'copy') ops.copy(cardId, module.id)
          if (id === 'link') void writeClipboard(`[${module.name}](noven://card/${cardId}/module/${module.id})`)
          if (id === 'delete') ops.delete(cardId, module.id)
        }}
        items={arm.decorate([
          { id: 'rename', label: t('tree.mod.rename') },
          { id: 'copy', label: t('tree.mod.copy') },
          { id: 'link', label: t('tree.mod.copyLink') },
          { id: 'delete', label: t('tree.mod.delete'), danger: true },
        ])}
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
  /** 软删除；`name` 用于回执文案（回执带撤销）。 */
  readonly delete: (cardId: string, name: string) => void
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

/** 行选择柄：`pick` 处理 Shift 区间/⌘ 离散的修饰键点击；`on` 是选中态；
    `clear` 由普通点击调用——打开行的同时把选择清掉。 */
interface RowSel {
  readonly on: boolean
  readonly pick: (e: ReactMouseEvent) => void
  readonly clear: () => void
}

/** 同级列表里可选的一行：`key` 在同层内唯一，`path` 是呈现轴写面用的项目
    相对路径（卡行是 `卡/<dir>`）。`kind` 决定批量删除走哪条写面。 */
interface SelItem {
  readonly key: string
  readonly path: string
  readonly kind: 'file' | 'dir' | 'card' | 'work'
  readonly cardId?: string
  /** 登记进作品清单的行带 workId——删除文件时顺带移出清单。 */
  readonly workId?: string
}

/** 一份同层多选集：scope 隔离不同父列表，anchor 是 Shift 区间的锚点。 */
interface Selection {
  readonly scope: string
  readonly anchor: string
  readonly items: ReadonlyMap<string, SelItem>
}

/** 构造某层某行的选择柄；`order` 是该层可选项的渲染顺序（Shift 区间用）。 */
type SelFor = (scope: string, order: readonly SelItem[], item: SelItem) => RowSel

/** 一行项目文件/目录占位：点击开文稿页签；⋯ 给「放入模块」二级菜单、
    复制链接与呈现轴（隐藏/恢复）。`dir` 行不拖拽不内嵌（是目录占位）。
    `renameTitle` 给了才出「修改模块名」——登记实体（作品/文稿）的展示名
    走清单账本，与真实文件名是两件事。 */
function FileRow({ path, title, dir, hidden, indent = 0, current, fileView, sel, renameTitle, t, onOpen, embedTargets, onEmbed, fileOps, present }: {
  readonly path: string
  readonly title: string
  readonly dir?: boolean
  readonly hidden?: boolean
  readonly current?: boolean
  /** 文件视图：行名显示真实文件名而不是展示名。 */
  readonly fileView?: boolean
  /** 同级多选柄；不给则行不参与批量选择。 */
  readonly sel?: RowSel
  /** 展示名写面（作品清单标题）；散文件没有展示名，不出菜单项。 */
  readonly renameTitle?: (name: string) => void
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
  /** 行内改名：'file' 改磁盘文件名，'title' 改清单展示名。 */
  const [renaming, setRenaming] = useState<'file' | 'title' | null>(null)
  const arm = useArmedMenu(useMemo(() => [{ id: 'delete', confirmLabel: t('ui.armed.delete') }], [t]))
  const fileName = path.split('/').pop() ?? path
  const isDir = dir === true
  return (
    <div className={`nv-tree-row nv-tree-module${hidden === true ? ' nv-tree-hidden' : ''}`} style={{ paddingLeft: 28 + indent * 14 }}
      data-current={current || undefined}
      data-sel={sel?.on === true || undefined}
      draggable={!isDir && renaming === null}
      onDragStart={e => { e.dataTransfer.setData(FILE_DROP_TYPE, path); e.dataTransfer.effectAllowed = 'copy' }}>
      {renaming !== null ? (
        <InlineRename className="nv-tree-renamein" value={renaming === 'file' ? fileName : title}
          onDone={next => {
            const mode = renaming
            setRenaming(null)
            if (next === undefined) return
            if (mode === 'file') fileOps.rename(path, next)
            else renameTitle?.(next)
          }} />
      ) : (
        <button type="button" className="nv-tree-main" onClick={e => {
          if (sel !== undefined && (e.shiftKey || e.metaKey || e.ctrlKey)) { sel.pick(e); return }
          sel?.clear()
          if (!isDir) onOpen(path, title)
        }}>
          <span className="nv-tree-glyph">{isDir ? glyph.folder(13) : glyph.file(13)}</span>
          <span className="nv-tree-name">{fileView === true ? fileName : title}</span>
        </button>
      )}
      <Menu open={menuOpen} side="bottom" align="end" selection="fill" listClassName="nv-tree-newmenu"
        onClose={() => { arm.reset(); setMenuOpen(false) }}
        onSelect={id => {
          if (arm.select(id) === 'armed') return
          setMenuOpen(false)
          if (id === 'link') { void writeClipboard(`[${title}](${encodeURI(path)})`); return }
          if (id === 'rename') { setRenaming('file'); return }
          if (id === 'rename-title' && renameTitle !== undefined) { setRenaming('title'); return }
          if (id === 'hide' || id === 'unhide') { present(path, id === 'hide' ? 'hidden' : 'file'); return }
          if (id === 'delete') { fileOps.delete(path); return }
          if (id.startsWith('embed:')) onEmbed(id)
        }}
        items={arm.decorate([
          ...(!isDir ? [
            { id: 'embed', label: t('tree.file.embed'), submenu: embedTargets },
            { id: 'link', label: t('tree.mod.copyLink') },
            { type: 'separator' as const, id: 'file-sep' },
          ] : []),
          { id: 'rename', label: t('tree.file.renameFile') },
          ...(renameTitle !== undefined ? [{ id: 'rename-title', label: t('tree.file.renameTitle') }] : []),
          ...(!isDir ? [{ id: 'delete', label: t('canvas.doc.delete'), danger: true as const }] : []),
          { id: hidden === true ? 'unhide' : 'hide', label: t(hidden === true ? 'tree.unhide' : 'tree.hide') },
        ])}
        anchor={(
          <button type="button" className="nv-tree-more" aria-label={t('tree.file.more')}
            onClick={() => setMenuOpen(v => !v)}>⋯</button>
        )} />
    </div>
  )
}

/** 一行登记作品：打开 + ⋯ 菜单（模块名=清单标题 / 文件名=磁盘名 / 隐藏 /
    移出清单 / 删文件）。文件级选择与同级批量处理走 `sel`。 */
function WorkRow({ work, current, fileView, sel, t, onOpen, fileOps, present, renameWork, dropWork }: {
  readonly work: TreeWorkRow
  readonly current?: boolean
  readonly fileView?: boolean
  readonly sel?: RowSel
  readonly t: ShellT
  readonly onOpen: (path: string, title: string) => void
  readonly fileOps: { readonly rename: (path: string, name: string) => void; readonly delete: (path: string) => void }
  readonly present: (path: string, view: 'hidden' | 'file') => void
  /** 改清单里的展示名（账本轴，不动文件名）。 */
  readonly renameWork: (workId: string, title: string) => void
  /** 移出作品清单（文件留在盘上）。 */
  readonly dropWork: (workId: string, title: string) => void
}) {
  const [menuOpen, setMenuOpen] = useState(false)
  const [renaming, setRenaming] = useState<'file' | 'title' | null>(null)
  const arm = useArmedMenu(useMemo(() => [
    { id: 'drop', confirmLabel: t('ui.armed.drop') },
    { id: 'delete', confirmLabel: t('ui.armed.delete') },
  ], [t]))
  const fileName = work.path.split('/').pop() ?? work.path
  return (
    <div className={`nv-tree-row nv-tree-module${work.hidden === true ? ' nv-tree-hidden' : ''}`} style={{ paddingLeft: 28 }}
      data-current={current || undefined}
      data-sel={sel?.on === true || undefined}>
      {renaming !== null ? (
        <InlineRename className="nv-tree-renamein" value={renaming === 'file' ? fileName : work.title}
          onDone={next => {
            const mode = renaming
            setRenaming(null)
            if (next === undefined) return
            if (mode === 'file') fileOps.rename(work.path, next)
            else renameWork(work.id, next)
          }} />
      ) : (
        <button type="button" className="nv-tree-main" onClick={e => {
          if (sel !== undefined && (e.shiftKey || e.metaKey || e.ctrlKey)) { sel.pick(e); return }
          sel?.clear()
          onOpen(work.path, work.title)
        }}>
          <span className="nv-tree-glyph">{glyph.grid(13)}</span>
          <span className="nv-tree-name">{fileView === true ? fileName : work.title}</span>
        </button>
      )}
      <Menu open={menuOpen} side="bottom" align="end" selection="fill" listClassName="nv-tree-newmenu"
        onClose={() => { arm.reset(); setMenuOpen(false) }}
        onSelect={id => {
          if (arm.select(id) === 'armed') return
          setMenuOpen(false)
          if (id === 'rename') { setRenaming('file'); return }
          if (id === 'rename-title') { setRenaming('title'); return }
          if (id === 'drop') { dropWork(work.id, work.title); return }
          if (id === 'hide' || id === 'unhide') { present(work.path, id === 'hide' ? 'hidden' : 'file'); return }
          if (id === 'delete') fileOps.delete(work.path)
        }}
        items={arm.decorate([
          { id: 'rename-title', label: t('tree.file.renameTitle') },
          { id: 'rename', label: t('tree.file.renameFile') },
          { id: 'drop', label: t('tree.work.drop') },
          { type: 'separator' as const, id: 'work-sep' },
          { id: work.hidden === true ? 'unhide' : 'hide', label: t(work.hidden === true ? 'tree.unhide' : 'tree.hide') },
          { id: 'delete', label: t('canvas.doc.delete'), danger: true as const },
        ])}
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
function CardBranch({ card, depth, currentKey, fileView, sel, t, onOpen, onAdd, ops, cardOps }: {
  readonly card: TreeCardRow
  /** 架层深度：卡/ 顶层的卡是 0，每深一层缩进 14。 */
  readonly depth: number
  readonly currentKey: string | undefined
  /** 文件视图：行名显示真实目录名而不是卡名。 */
  readonly fileView?: boolean
  /** 同级多选柄；不给则卡行不参与批量选择。 */
  readonly sel?: RowSel
  readonly t: ShellT
  readonly onOpen: (moduleId?: string, name?: string) => void
  readonly onAdd: () => void
  readonly ops: ModuleOps
  readonly cardOps: CardOps
}) {
  const [open, setOpen] = useState(true)
  const [menuOpen, setMenuOpen] = useState(false)
  const [renaming, setRenaming] = useState(false)
  const arm = useArmedMenu(useMemo(() => [{ id: 'delete', confirmLabel: t('ui.armed.delete') }], [t]))
  const indent = 4 + depth * 14
  return (
    <div>
      <div className={`nv-tree-row nv-tree-card${card.hidden === true ? ' nv-tree-hidden' : ''}`}
        data-current={currentKey === `card:${card.cardId}` || undefined}
        data-sel={sel?.on === true || undefined}
        style={{ paddingLeft: indent }}
        onDragOver={e => { if (e.dataTransfer.types.includes(FILE_DROP_TYPE)) e.preventDefault() }}
        onDrop={e => { const path = fileDrop(e); if (path !== undefined) { e.preventDefault(); ops.embedFile(card.cardId, null, path) } }}>
        {renaming ? (
          <InlineRename className="nv-tree-renamein" value={card.name}
            onDone={next => { setRenaming(false); if (next !== undefined) cardOps.rename(card.cardId, next) }} />
        ) : (
          <button type="button" className="nv-tree-main" onClick={e => {
            if (sel !== undefined && (e.shiftKey || e.metaKey || e.ctrlKey)) { sel.pick(e); return }
            sel?.clear()
            onOpen()
          }}>
            <span className="nv-tree-cardicon">{cardIcon(card.kind)}</span>
            <span className="nv-tree-name">{fileView === true ? card.dir : card.name}</span>
            {card.pending && <span className="nv-tree-pending" title={t('tree.pending')} />}
          </button>
        )}
        <Menu open={menuOpen} side="bottom" align="end" selection="fill" listClassName="nv-tree-newmenu"
          onClose={() => { arm.reset(); setMenuOpen(false) }}
          onSelect={id => {
            if (arm.select(id) === 'armed') return
            setMenuOpen(false)
            if (id === 'rename') setRenaming(true)
            if (id === 'link') void writeClipboard(`[${card.name}](noven://card/${card.cardId})`)
            if (id === 'source') cardOps.showSource(`卡/${card.dir}/card.json`)
            if (id === 'hide' || id === 'unhide') cardOps.present(`卡/${card.dir}`, id === 'hide' ? 'hidden' : 'file')
            if (id === 'delete') cardOps.delete(card.cardId, card.name)
          }}
          items={arm.decorate([
            { id: 'rename', label: t('tree.card.rename') },
            { id: 'source', label: t('tree.card.showSource') },
            { id: 'link', label: t('tree.card.copyLink') },
            { id: card.hidden === true ? 'unhide' : 'hide', label: t(card.hidden === true ? 'tree.unhide' : 'tree.hide') },
            { id: 'delete', label: t('tree.card.delete'), danger: true },
          ])}
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
function ShelfBranch({ node, depth, currentKey, fileView, selFor, t, onOpen, onAdd, ops, cardOps, fileOps }: {
  readonly node: ShelfNode
  readonly depth: number
  readonly currentKey: string | undefined
  readonly fileView?: boolean
  /** 同层多选构造柄；架层目录行自身不进选择集（结构行只留 ⋯ 菜单）。 */
  readonly selFor?: SelFor
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
  const scope = `shelf:${node.path}`
  const order: readonly SelItem[] = [
    ...node.cards.map(c => ({ key: `card:${c.cardId}`, path: `卡/${c.dir}`, kind: 'card' as const, cardId: c.cardId })),
    ...node.rows.map(r => ({ key: `f:${r.path}`, path: r.path, kind: (r.dir === true ? 'dir' : 'file') as 'dir' | 'file' })),
  ]
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
              fileView={fileView} selFor={selFor}
              onOpen={onOpen} onAdd={onAdd} ops={ops} cardOps={cardOps} fileOps={fileOps} />
          ))}
          {node.cards.map(card => (
            <CardBranch key={card.cardId} card={card} depth={depth + 1} currentKey={currentKey} t={t}
              fileView={fileView}
              sel={selFor?.(scope, order, { key: `card:${card.cardId}`, path: `卡/${card.dir}`, kind: 'card', cardId: card.cardId })}
              onOpen={(moduleId, name) => onOpen(card.cardId, moduleId, name)}
              onAdd={() => onAdd(card.cardId)} ops={ops} cardOps={cardOps} />
          ))}
          {node.rows.map(row => (
            <FileRow key={row.path} path={row.path} title={row.title} dir={row.dir} hidden={row.hidden}
              current={currentKey === `doc:${row.path}`}
              fileView={fileView}
              sel={selFor?.(scope, order, { key: `f:${row.path}`, path: row.path, kind: row.dir === true ? 'dir' : 'file' })}
              indent={depth + 1} t={t} onOpen={fileOps.open} embedTargets={fileOps.embedTargets}
              onEmbed={id => fileOps.embed(id, row.path)}
              fileOps={{ rename: fileOps.rename, delete: fileOps.delete }} present={fileOps.present} />
          ))}
        </div>
      )}
    </div>
  )
}

/** 分组头（设计稿 02）：单击整行收起/展开，`drag` 给了就可长按拖排序；
    `onAdd`/`onDelete` 是行尾悬停才显的「＋」「×」。 */
function Group({ title, count, children, onAdd, addTitle, onDelete, deleteTitle, always, collapsed, onToggle, drag, t }: {
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
  readonly collapsed?: boolean
  readonly onToggle?: () => void
  /** 组头行拖动：给了即 draggable；落点与排序由调用方的槽位处理。 */
  readonly drag?: {
    readonly onDragStart: (e: DragEvent) => void
    readonly onDragEnd: () => void
  }
  readonly t: ShellT
}) {
  if (count === 0 && always !== true) return null
  const open = collapsed !== true
  return (
    <div className="nv-tree-group">
      <div className={`nv-tree-grouprow${onToggle !== undefined ? ' nv-tree-grouprow-toggle' : ''}`}
        draggable={drag !== undefined}
        onDragStart={drag?.onDragStart}
        onDragEnd={drag?.onDragEnd}
        onClick={onToggle}>
        <button type="button" className="nv-tree-grouptitle"
          onClick={e => { e.stopPropagation(); onToggle?.() }}>{title}</button>
        {onAdd !== undefined && (
          <button type="button" className="nv-tree-add" title={addTitle}
            onClick={e => { e.stopPropagation(); onAdd() }}>+</button>
        )}
        {onDelete !== undefined && (
          <button type="button" className="nv-tree-add nv-tree-del" title={deleteTitle}
            onClick={e => { e.stopPropagation(); onDelete() }}>×</button>
        )}
        {onToggle !== undefined && (
          <button type="button" className={`nv-tree-fold${open ? ' nv-tree-fold-on' : ''}`}
            aria-label={t(open ? 'tree.collapse' : 'tree.expand')}
            onClick={e => { e.stopPropagation(); onToggle() }}>›</button>
        )}
      </div>
      {open && children}
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
  const { t, useTree, useProject } = props
  const tree = useTree(v => v)
  const project = useProject(v => v)
  const currentKey = props.useActiveTab(v => v)
  const [query, setQuery] = useState('')
  const [menuOpen, setMenuOpen] = useState(false)
  const [toolsOpen, setToolsOpen] = useState(false)
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

  /* 同层多选：scope 区分父列表（同级才能一起选），anchor 是 Shift 区间锚。
     修饰键点击进选择不打开；普通点击照旧打开并清选择。 */
  const [sel, setSel] = useState<Selection | null>(null)
  const pickSel = (e: ReactMouseEvent, scope: string, order: readonly SelItem[], item: SelItem): void => {
    e.preventDefault()
    if (e.shiftKey && sel !== null && sel.scope === scope) {
      const keys = order.map(r => r.key)
      const a = keys.indexOf(sel.anchor)
      const b = keys.indexOf(item.key)
      if (a >= 0 && b >= 0) {
        const [lo, hi] = a < b ? [a, b] : [b, a]
        setSel({ scope, anchor: sel.anchor, items: new Map(order.slice(lo, hi + 1).map(r => [r.key, r])) })
        return
      }
    }
    if ((e.metaKey || e.ctrlKey) && sel !== null && sel.scope === scope) {
      const items = new Map(sel.items)
      if (items.delete(item.key) === false) items.set(item.key, item)
      setSel(items.size === 0 ? null : { scope, anchor: item.key, items })
      return
    }
    setSel({ scope, anchor: item.key, items: new Map([[item.key, item]]) })
  }
  /** 行组件拿的选择柄：scope 是父列表标识，order 是该层渲染顺序。 */
  const selFor: SelFor = (scope, order, item) => ({
    on: sel?.items.has(item.key) === true,
    pick: e => pickSel(e, scope, order, item),
    clear: () => { if (sel !== null) setSel(null) },
  })

  /* 顶层分组：折叠态 + 排序 + 视图档按项目根落 localStorage；拖动用专用
     type，与文件拖入模块（FILE_DROP_TYPE）互不干扰。 */
  const root = project?.root
  const [prefs, setPrefs] = useState<GroupPrefs>(() => readGroupPrefs(root))
  const [prefsRoot, setPrefsRoot] = useState(root)
  if (prefsRoot !== root) {
    setPrefsRoot(root)
    setPrefs(readGroupPrefs(root))
    setSel(null)
  }
  const writeGroupPrefs = (next: GroupPrefs): void => {
    setPrefs(next)
    if (root === undefined) return
    try { localStorage.setItem(groupPrefsKey(root), JSON.stringify(next)) }
    catch (storageErr) {
      // 隐私/沙箱态可抛，丢了只是回到默认顺序。
      void storageErr
    }
  }
  const viewFile = prefs.view === 'file'

  // 呈现轴三态（与会话栏归档过滤同款）：'hide' 默认藏 / 'show' 灰显全列 /
  // 'only' 只看隐藏项——批量收拾完用 only 复核藏了什么。
  const [hiddenMode, setHiddenMode] = useState<'hide' | 'show' | 'only'>('hide')
  const display = useMemo((): NovenTree | undefined => {
    if (filtered === undefined) return filtered
    const keep = (hidden?: boolean): boolean =>
      hiddenMode === 'show' ? true : hiddenMode === 'only' ? hidden === true : hidden !== true
    return {
      ...filtered,
      cards: filtered.cards.filter(c => keep(c.hidden)),
      docs: filtered.docs.filter(d => keep(d.hidden)),
      works: filtered.works.filter(w => keep(w.hidden)),
      sections: (filtered.sections ?? [])
        .filter(s => keep(s.hidden) || (hiddenMode === 'only' && s.rows.some(r => r.hidden === true)))
        .map(s => ({ ...s, rows: s.rows.filter(r => keep(r.hidden)) })),
    }
  }, [filtered, hiddenMode])
  /** 模块视图：散文件层（用户分组、卡架散件）整层不渲，只留成品实体。 */
  const visible = useMemo((): NovenTree | undefined => {
    if (display === undefined || viewFile) return display
    return { ...display, sections: [] }
  }, [display, viewFile])
  const hiddenCount = filtered === undefined ? 0
    : filtered.cards.filter(c => c.hidden === true).length
      + filtered.docs.filter(d => d.hidden === true).length
      + filtered.works.filter(w => w.hidden === true).length
      + (filtered.sections ?? []).reduce((n, s) => n + (s.hidden === true ? 1 : 0) + s.rows.filter(r => r.hidden === true).length, 0)

  const empty = visible !== undefined && visible.cards.length === 0 && visible.docs.length === 0
    && visible.works.length === 0 && (visible.sections ?? []).length === 0
  /** 目录存在性 → 内置分组的空架子也要渲染（用户刚建出的组必须可见）。 */
  const hasDir = (name: string): boolean => (visible?.sections ?? []).some(s => s.name === name)
  /** 用户分组 = 顶层目录里刨掉内置的 卡/ 文稿/。 */
  const userSections = (visible?.sections ?? []).filter(s => s.name !== '卡' && s.name !== '文稿')
  /** 卡/ 架层散件行（卡目录内部不算散件，服务端已剔）。 */
  const cardShelfRows = (visible?.sections ?? []).find(s => s.name === '卡')?.rows ?? []
  /** 卡行与散件行按目录归架层；卡/ 顶层的留在根节点。 */
  const shelfRoot = useMemo(() => buildShelves(visible?.cards ?? [], cardShelfRows), [visible, cardShelfRows])
  /* 各同层列表的可选顺序：Shift 区间按它取段。卡架根层 = 卡行 ∪ 散件行。 */
  const cardOrder: readonly SelItem[] = useMemo(() => [
    ...shelfRoot.cards.map(c => ({ key: `card:${c.cardId}`, path: `卡/${c.dir}`, kind: 'card' as const, cardId: c.cardId })),
    ...shelfRoot.rows.map(r => ({ key: `f:${r.path}`, path: r.path, kind: (r.dir === true ? 'dir' : 'file') as 'dir' | 'file' })),
  ], [shelfRoot])
  const docOrder: readonly SelItem[] = useMemo(() => (visible?.docs ?? [])
    .map(d => ({ key: `f:${d.path}`, path: d.path, kind: 'file' as const, workId: d.id ?? undefined })), [visible])
  const workOrder: readonly SelItem[] = useMemo(() => (visible?.works ?? [])
    .map(w => ({ key: `w:${w.path}`, path: w.path, kind: 'work' as const, workId: w.id })), [visible])
  /** 选择集里可删的条目数（目录行不进批量删除——unlink 拒收目录）。 */
  const deletable = sel === null ? 0 : [...sel.items.values()].filter(i => i.kind !== 'dir').length
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

  const collapsedSet = useMemo(() => new Set(prefs.collapsed), [prefs])
  const toggleGroup = (key: string): void => {
    const next = new Set(collapsedSet)
    if (next.has(key)) next.delete(key)
    else next.add(key)
    writeGroupPrefs({ ...prefs, collapsed: [...next] })
  }
  const [dragGroup, setDragGroup] = useState<string | null>(null)
  const [dropHint, setDropHint] = useState<{ key: string; before: boolean } | null>(null)
  const groupKeys = useMemo(() => [
    'cards', 'docs', 'works',
    ...userSections.map(s => `sec:${s.name}`),
    ...(studioOn ? ['studio'] : []),
  ], [userSections, studioOn])
  const groupOrder = useMemo(() => {
    const stored = prefs.order.filter(k => groupKeys.includes(k))
    return [...stored, ...groupKeys.filter(k => !stored.includes(k))]
  }, [prefs, groupKeys])
  const groupDrag = (key: string) => ({
    onDragStart: (e: DragEvent) => {
      e.dataTransfer.setData(GROUP_DROP_TYPE, key)
      e.dataTransfer.effectAllowed = 'move'
      setDragGroup(key)
    },
    onDragEnd: () => { setDragGroup(null); setDropHint(null) },
  })
  const groupSlot = (key: string, node: ReactNode): ReactNode => (
    <div key={key}
      className={`nv-tree-groupslot${dragGroup === key ? ' nv-tree-groupslot-drag' : ''}${dropHint?.key === key ? (dropHint.before ? ' nv-tree-drop-before' : ' nv-tree-drop-after') : ''}`}
      onDragOver={e => {
        if (!e.dataTransfer.types.includes(GROUP_DROP_TYPE)) return
        e.preventDefault()
        e.dataTransfer.dropEffect = 'move'
        const rect = e.currentTarget.getBoundingClientRect()
        const before = e.clientY < rect.top + rect.height / 2
        setDropHint(h => (h?.key === key && h.before === before ? h : { key, before }))
      }}
      onDrop={e => {
        if (!e.dataTransfer.types.includes(GROUP_DROP_TYPE)) return
        e.preventDefault()
        const moved = e.dataTransfer.getData(GROUP_DROP_TYPE)
        const rect = e.currentTarget.getBoundingClientRect()
        const before = e.clientY < rect.top + rect.height / 2
        if (moved !== '' && moved !== key) {
          const order = groupOrder.filter(k => k !== moved)
          const at = order.indexOf(key)
          if (at >= 0) {
            order.splice(at + (before ? 0 : 1), 0, moved)
            writeGroupPrefs({ ...prefs, order })
          }
        }
        setDragGroup(null)
        setDropHint(null)
      }}>
      {node}
    </div>
  )

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
        {/* 项目名不再是切换器——单击开创作库的项目页；切换项目在库里做。 */}
        <button type="button" className="nv-tree-project" title={t('tree.library.open')}
          onClick={props.openProject}>
          <span className="nv-tree-projectname">{title}</span>
          <span className="nv-tree-caret">›</span>
        </button>
        <button type="button" className={`nv-tree-eye${viewFile ? ' nv-tree-eye-on' : ''}`}
          title={t(viewFile ? 'tree.view.entity' : 'tree.view.files')}
          onClick={() => writeGroupPrefs({ ...prefs, view: viewFile ? 'entity' : 'file' })}>
          {viewFile ? glyph.folder(13) : glyph.layers(13)}
        </button>
        {hiddenCount > 0 && (
          <button type="button" className={`nv-tree-eye${hiddenMode !== 'hide' ? ' nv-tree-eye-on' : ''}`}
            title={t(hiddenMode === 'hide' ? 'tree.showHidden' : hiddenMode === 'show' ? 'tree.onlyHidden' : 'tree.hideHidden')}
            onClick={() => setHiddenMode(m => m === 'hide' ? 'show' : m === 'show' ? 'only' : 'hide')}>
            {glyph.eye(13)}
            <span className="nv-tree-eyecount">{hiddenCount}</span>
          </button>
        )}
      </div>
      {sel !== null && (
        <div className="nv-tree-selbar">
          <span className="nv-tree-selcount">{t('tree.sel.count').replace('{n}', String(sel.items.size))}</span>
          <button type="button" className="nv-tree-selbtn" onClick={() => { props.presentAll([...sel.items.values()].map(i => i.path), 'hidden'); setSel(null) }}>{t('tree.hide')}</button>
          <button type="button" className="nv-tree-selbtn" onClick={() => { props.presentAll([...sel.items.values()].map(i => i.path), 'file'); setSel(null) }}>{t('tree.unhide')}</button>
          <button type="button" className="nv-tree-selbtn nv-tree-selbtn-danger" disabled={deletable === 0}
            onClick={() => {
              const items = [...sel.items.values()]
                .filter(i => i.kind !== 'dir')
                .map(i => ({ path: i.path, cardId: i.cardId, workId: i.workId }))
              void askConfirm({
                title: t('ui.confirm.selTitle').replace('{n}', String(deletable)),
                body: t('ui.confirm.selBody'),
                confirm: t('ui.delete'), cancel: t('ui.cancel'), danger: true,
              }).then(ok => { if (!ok) return; props.deleteSel(items); setSel(null) })
            }}>{t('canvas.doc.delete')}</button>
          <button type="button" className="nv-tree-selbtn" title={t('tree.sel.clear')} onClick={() => setSel(null)}>✕</button>
        </div>
      )}
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
        {groupOrder.map(key => {
          const shared = {
            collapsed: collapsedSet.has(key),
            onToggle: () => toggleGroup(key),
            drag: groupDrag(key),
            t,
          }
          if (key === 'cards') return groupSlot('cards', (
            <Group title={t('tree.cards')} count={visible?.cards.length ?? 0} always={hasDir('卡')}
              onAdd={() => props.openCreate('world')} addTitle={t('create.world.title')} {...shared}>
              {shelfRoot.shelves.map(shelf => (
                <ShelfBranch key={shelf.path} node={shelf} depth={0} currentKey={currentKey} t={t}
                  fileView={viewFile} selFor={selFor}
                  onOpen={props.openCard} onAdd={props.addModule}
                  ops={{ rename: props.renameModule, copy: props.copyModule, delete: props.deleteModule, embedFile: props.embedFile }}
                  cardOps={cardOps} fileOps={fileOps} />
              ))}
              {shelfRoot.cards.map(card => (
                <CardBranch key={card.cardId} card={card} depth={0} currentKey={currentKey} t={t}
                  fileView={viewFile}
                  sel={selFor('cards', cardOrder, { key: `card:${card.cardId}`, path: `卡/${card.dir}`, kind: 'card', cardId: card.cardId })}
                  onOpen={(moduleId, name) => props.openCard(card.cardId, moduleId, name)}
                  onAdd={() => props.addModule(card.cardId)}
                  ops={{ rename: props.renameModule, copy: props.copyModule, delete: props.deleteModule, embedFile: props.embedFile }}
                  cardOps={cardOps} />
              ))}
              {shelfRoot.rows.map(row => (
                <FileRow key={row.path} path={row.path} title={row.title} dir={row.dir} hidden={row.hidden} t={t}
                  current={currentKey === `doc:${row.path}`}
                  fileView={viewFile}
                  sel={selFor('cards', cardOrder, { key: `f:${row.path}`, path: row.path, kind: row.dir === true ? 'dir' : 'file' })}
                  onOpen={fileOps.open} embedTargets={embedTargets} onEmbed={id => embedFromId(id, row.path)}
                  fileOps={{ rename: fileOps.rename, delete: fileOps.delete }} present={fileOps.present} />
              ))}
            </Group>
          ))
          if (key === 'docs') return groupSlot('docs', (
            <Group title={t('tree.docs')} count={visible?.docs.length ?? 0} always={hasDir('文稿')}
              onAdd={() => props.openCreate('doc')} addTitle={t('create.doc.title')} {...shared}>
              {visible?.docs.map(doc => (
                <FileRow key={doc.path} path={doc.path} title={doc.title} hidden={doc.hidden} t={t}
                  current={currentKey === `doc:${doc.path}`}
                  fileView={viewFile}
                  sel={selFor('docs', docOrder, { key: `f:${doc.path}`, path: doc.path, kind: 'file', workId: doc.id ?? undefined })}
                  renameTitle={doc.id === null ? undefined : name => props.renameWork(doc.id ?? '', name)}
                  onOpen={props.openDoc} embedTargets={embedTargets} onEmbed={id => embedFromId(id, doc.path)}
                  fileOps={fileOps} present={props.present} />
              ))}
            </Group>
          ))
          if (key === 'works') return groupSlot('works', (
            <Group title={t('tree.works')} count={visible?.works.length ?? 0} {...shared}>
              {visible?.works.map(work => (
                <WorkRow key={work.id} work={work} t={t}
                  current={currentKey === `work:${work.path}`}
                  fileView={viewFile}
                  sel={selFor('works', workOrder, { key: `w:${work.path}`, path: work.path, kind: 'work', workId: work.id })}
                  onOpen={props.openWork}
                  fileOps={{ rename: fileOps.rename, delete: fileOps.delete }} present={props.present}
                  renameWork={props.renameWork} dropWork={props.dropWork} />
              ))}
            </Group>
          ))
          if (key === 'studio') return groupSlot('studio', (
            <Group title={t('tree.studio')} count={simRows.length}
              onAdd={props.createSim} addTitle={t('sim.list.new')} {...shared}>
              {simRows.map(row => (
                <button key={row.id} type="button" className="nv-tree-row nv-tree-module" style={{ paddingLeft: 28 }}
                  onClick={() => props.openSim(row.id)}>
                  <span className="nv-tree-glyph">{glyph.phone(13)}</span>
                  <span className="nv-tree-name">{row.title}</span>
                  {row.running && <span className="nv-simrow-dot" />}
                </button>
              ))}
            </Group>
          ))
          const section = userSections.find(s => `sec:${s.name}` === key)
          if (section === undefined) return null
          const secOrder: readonly SelItem[] = section.rows
            .map(r => ({ key: `f:${r.path}`, path: r.path, kind: (r.dir === true ? 'dir' : 'file') as 'dir' | 'file' }))
          return groupSlot(key, (
            <Group title={section.name} count={section.rows.length} always
              onAdd={() => props.openCreate('doc', section.name)} addTitle={t('create.doc.title')}
              onDelete={() => {
                void askConfirm({
                  title: t('ui.confirm.groupTitle').replace('{name}', section.name),
                  body: section.rows.length === 0 ? t('ui.confirm.groupEmpty') : t('ui.confirm.groupBody').replace('{count}', String(section.rows.length)),
                  confirm: t('ui.delete'), cancel: t('ui.cancel'), danger: true,
                }).then(ok => { if (ok) props.deleteGroup(section.name) })
              }}
              deleteTitle={t('tree.group.delete')} {...shared}>
              {section.rows.map(row => (
                <FileRow key={row.path} path={row.path} title={row.title} dir={row.dir} hidden={row.hidden} t={t}
                  fileView={viewFile}
                  sel={selFor(key, secOrder, { key: `f:${row.path}`, path: row.path, kind: row.dir === true ? 'dir' : 'file' })}
                  onOpen={props.openDoc} embedTargets={embedTargets} onEmbed={id => embedFromId(id, row.path)}
                  fileOps={fileOps} present={props.present} />
              ))}
            </Group>
          ))
        })}
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
