/**
 * 内容树 — 抽屉上区（设计稿 01/02/J05），挂在 `sidebar.right.pane.top`：
 * 项目头 + 搜索 + 卡/文稿/作品分组 + 「素材与文件」与「＋ 新建」底排。
 * `rail` 态画图标列。数据只读 `/api/noven-tree` 的轮询源；点击行由注入面
 * 落到画布标签。
 * @module noven-shell/client/tree
 */
import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { Menu } from '@deepseek-ai/dsh-client-ui-primitives'
import type { ObservableSnapshot } from '@deepseek-ai/dsh-client-store'
import type { InjectFace, PropsLocale, PropsRuntime } from '@deepseek-ai/dsh-client-ui-slots'
import type { ProjectRow } from './library-api.ts'
import type { NovenTree, TreeCardRow, TreeModuleRow } from './tree-api.ts'
import type { ProjectFocus } from './canvas.tsx'
import type { CreateKind } from './creation.tsx'
import type { ShellT } from './pages/Home.tsx'
import { glyph } from './icons.tsx'

/** 内容树注入面：数据三源 + 打开/切换回调。 */
export interface TreeInjected {
  readonly hooks: {
    readonly tree: ObservableSnapshot<NovenTree | undefined>
    readonly project: ObservableSnapshot<ProjectFocus | undefined>
    readonly projects: ObservableSnapshot<readonly ProjectRow[]>
  }
  readonly openCard: (cardId: string, moduleId?: string) => void
  /** 卡行尾的「＋」：打开该卡并直接弹模块库（在卡里加下属模块）。 */
  readonly addModule: (cardId: string) => void
  /** 模块行 ⋯ 菜单的三个动作；宿主负责 loadCard 拿 version 后 apply。 */
  readonly renameModule: (cardId: string, moduleId: string, name: string) => void
  readonly copyModule: (cardId: string, moduleId: string) => void
  readonly deleteModule: (cardId: string, moduleId: string) => void
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

/** 一行模块：图标 + 名 + 悬停行尾的 ⋯ 菜单（重命名/复制/归档）。 */
function ModuleRow({ module, depth, cardId, t, onOpen, ops }: {
  readonly module: TreeModuleRow
  readonly depth: number
  readonly cardId: string
  readonly t: ShellT
  readonly onOpen: (moduleId: string) => void
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
      style={{ paddingLeft: 28 + depth * 14 }}>
      {renaming ? (
        <input className="nv-tree-renamein" value={draft} autoFocus
          onChange={e => setDraft(e.target.value)} onBlur={commit}
          onKeyDown={e => { if (e.key === 'Enter') commit(); if (e.key === 'Escape') setRenaming(false) }} />
      ) : (
        <button type="button" className="nv-tree-main" onClick={() => onOpen(module.id)}>
          <span className="nv-tree-glyph">{moduleIcon(module.type, module.name)}</span>
          <span className="nv-tree-name">{module.name}</span>
        </button>
      )}
      <Menu open={menuOpen} side="bottom" align="end" selection="fill" listClassName="nv-tree-newmenu"
        onClose={() => setMenuOpen(false)}
        onSelect={id => {
          setMenuOpen(false)
          if (id === 'rename') { setDraft(module.name); setRenaming(true) }
          if (id === 'copy') ops.copy(cardId, module.id)
          if (id === 'delete') ops.delete(cardId, module.id)
        }}
        items={[
          { id: 'rename', label: t('tree.mod.rename') },
          { id: 'copy', label: t('tree.mod.copy') },
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
}

/** 一棵模块子树：行点击打开所属卡页。 */
function ModuleRows({ modules, depth, cardId, onOpen, t, ops }: {
  readonly modules: readonly TreeModuleRow[]
  readonly depth: number
  readonly cardId: string
  readonly onOpen: (moduleId: string) => void
  readonly t: ShellT
  readonly ops: ModuleOps
}) {
  return (
    <>
      {modules.map(module => (
        <div key={module.id}>
          <ModuleRow module={module} depth={depth} cardId={cardId} t={t} onOpen={onOpen} ops={ops} />
          <ModuleRows modules={module.children} depth={depth + 1} cardId={cardId} onOpen={onOpen} t={t} ops={ops} />
        </div>
      ))}
    </>
  )
}

/** 卡类图标：世界 → globe，角色 → user，其他 → file（设计稿 02）。 */
function cardIcon(kind: string): ReactNode {
  if (kind === 'WORLD') return glyph.globe(14)
  if (kind === 'CHARACTER') return glyph.user(14)
  return glyph.file(14)
}

/** 一张卡的子树（设计稿 02）：图标 + 名字 + 右端（悬停「＋」加模块、› 折叠）。
    卡内角色收进「角色 N」子组行，成员再缩进一级。 */
function CardBranch({ card, t, onOpen, onAdd, ops }: {
  readonly card: TreeCardRow
  readonly t: ShellT
  readonly onOpen: (moduleId?: string) => void
  readonly onAdd: () => void
  readonly ops: ModuleOps
}) {
  const [open, setOpen] = useState(true)
  return (
    <div>
      <div className="nv-tree-row nv-tree-card">
        <button type="button" className="nv-tree-main" onClick={() => onOpen()}>
          <span className="nv-tree-cardicon">{cardIcon(card.kind)}</span>
          <span className="nv-tree-name">{card.name}</span>
          {card.pending && <span className="nv-tree-pending" title={t('tree.pending')} />}
        </button>
        <button type="button" className="nv-tree-add" title={t('modules.add')} onClick={onAdd}>+</button>
        <button type="button" className={`nv-tree-fold${open ? ' nv-tree-fold-on' : ''}`}
          aria-label={t(open ? 'tree.collapse' : 'tree.expand')}
          onClick={() => setOpen(v => !v)}>›</button>
      </div>
      {open && (
        <div>
          <ModuleRows modules={card.modules} depth={0} cardId={card.cardId} onOpen={onOpen} t={t} ops={ops} />
          {card.characters.length > 0 && (
            <>
              <div className="nv-tree-roleshead" style={{ paddingLeft: 28 }}>
                <span className="nv-tree-glyph">{glyph.user(13)}</span>
                <span className="nv-tree-rolestitle">{t('tree.roles')}</span>
                <span className="nv-tree-count">{card.characters.length}</span>
              </div>
              {card.characters.map(character => (
                <button key={character.id} type="button" className="nv-tree-row nv-tree-module" style={{ paddingLeft: 42 }}
                  onClick={() => onOpen()}>
                  <span className="nv-tree-name">{character.name}</span>
                </button>
              ))}
            </>
          )}
          <button type="button" className="nv-tree-new nv-tree-newmodule" onClick={onAdd}>
            ＋ {t('tree.newmodule')}
          </button>
        </div>
      )}
    </div>
  )
}

/** 分组头（设计稿 02）：纯灰小标签，不折叠、不计数；`onAdd` 是行尾
    悬停才显的「＋」（造一个同级成员）。 */
function Group({ title, count, children, onAdd, addTitle, always }: {
  readonly title: string
  readonly count: number
  readonly children: ReactNode
  readonly onAdd?: () => void
  readonly addTitle?: string
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
  const [query, setQuery] = useState('')
  const [menuOpen, setMenuOpen] = useState(false)
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

  const empty = filtered !== undefined && filtered.cards.length === 0 && filtered.docs.length === 0
    && filtered.works.length === 0 && (filtered.sections ?? []).length === 0
  /** 目录存在性 → 内置分组的空架子也要渲染（用户刚建出的组必须可见）。 */
  const hasDir = (name: string): boolean => (filtered?.sections ?? []).some(s => s.name === name)
  /** 用户分组 = 顶层目录里刨掉内置的 卡/ 文稿/。 */
  const userSections = (filtered?.sections ?? []).filter(s => s.name !== '卡' && s.name !== '文稿')
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
        <Group title={t('tree.cards')} count={filtered?.cards.length ?? 0} always={hasDir('卡')}
          onAdd={() => props.openCreate('world')} addTitle={t('create.world.title')}>
          {filtered?.cards.map(card => (
            <CardBranch key={card.cardId} card={card} t={t}
              onOpen={moduleId => props.openCard(card.cardId, moduleId)}
              onAdd={() => props.addModule(card.cardId)}
              ops={{ rename: props.renameModule, copy: props.copyModule, delete: props.deleteModule }} />
          ))}
        </Group>
        <Group title={t('tree.docs')} count={filtered?.docs.length ?? 0} always={hasDir('文稿')}
          onAdd={() => props.openCreate('doc')} addTitle={t('create.doc.title')}>
          {filtered?.docs.map(doc => (
            <button key={doc.path} type="button" className="nv-tree-row nv-tree-module" style={{ paddingLeft: 28 }}
              onClick={() => props.openDoc(doc.path, doc.title)}>
              <span className="nv-tree-glyph">{glyph.file(13)}</span>
              <span className="nv-tree-name">{doc.title}</span>
            </button>
          ))}
        </Group>
        <Group title={t('tree.works')} count={filtered?.works.length ?? 0}>
          {filtered?.works.map(work => (
            <button key={work.id} type="button" className="nv-tree-row nv-tree-module" style={{ paddingLeft: 28 }}
              onClick={() => props.openWork(work.path, work.title)}>
              <span className="nv-tree-glyph">{glyph.grid(13)}</span>
              <span className="nv-tree-name">{work.title}</span>
            </button>
          ))}
        </Group>
        {userSections.map(section => (
          <Group key={section.name} title={section.name} count={section.rows.length} always
            onAdd={() => props.openCreate('doc', section.name)} addTitle={t('create.doc.title')}>
            {section.rows.map(row => (
              <button key={row.path} type="button" className="nv-tree-row nv-tree-module" style={{ paddingLeft: 28 }}
                onClick={() => props.openDoc(row.path, row.title)}>
                <span className="nv-tree-glyph">{glyph.file(13)}</span>
                <span className="nv-tree-name">{row.title}</span>
              </button>
            ))}
          </Group>
        ))}
      </div>
      {!noProject && (
      <div className="nv-tree-foot">
        <Menu open={menuOpen} side="top" align="start" selection="fill" listClassName="nv-tree-newmenu"
          onClose={() => setMenuOpen(false)}
          onSelect={id => { setMenuOpen(false); props.openCreate(id as CreateKind) }}
          items={[
            { id: 'group', label: t('create.group.title'), icon: glyph.folder(14) },
            { id: 'world', label: t('create.world.title'), icon: glyph.globe(14) },
            { id: 'character', label: t('create.character.title'), icon: glyph.user(14) },
            { id: 'import', label: t('canvas.start.import'), icon: glyph.upload(14) },
          ]}
          anchor={(
            <button type="button" className="nv-tree-new" onClick={() => setMenuOpen(v => !v)}>
              <span>＋</span>
              <span>{t('tree.new')}</span>
            </button>
          )} />
      </div>
      )}
    </div>
  )
}
