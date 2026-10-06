/**
 * 内容树 — 抽屉上区（设计稿 01/02/J05），挂在 `sidebar.right.pane.top`：
 * 项目头 + 搜索 + 卡/文稿/作品分组 + 「素材与文件」与「＋ 新建」底排。
 * `rail` 态画图标列。数据只读 `/api/noven-tree` 的轮询源；点击行由注入面
 * 落到画布标签。
 * @module noven-shell/client/tree
 */
import { useMemo, useState, type ReactNode } from 'react'
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
  readonly openDoc: (path: string, title: string) => void
  readonly openWork: (path: string, title: string) => void
  readonly openFiles: () => void
  readonly openCreate: (kind: CreateKind) => void
  readonly switchProject: (root: string) => void
  /** rail 态里把抽屉展开回来。 */
  readonly expandDrawer: () => void
}

/** 模块行的类型图标：widget type → 单字符 glyph。 */
const MODULE_GLYPH: Record<string, string> = {
  document: '¶',
  timeline: '⟶',
  collection: '☷',
  map: '◇',
  html: '⟨⟩',
  layout: '▦',
}

function moduleGlyph(type: string): string {
  return MODULE_GLYPH[type] ?? '¶'
}

/** 一棵模块子树：行点击打开所属卡页。 */
function ModuleRows({ modules, depth, cardId, onOpen }: {
  readonly modules: readonly TreeModuleRow[]
  readonly depth: number
  readonly cardId: string
  readonly onOpen: (moduleId: string) => void
}) {
  return (
    <>
      {modules.map(module => (
        <div key={module.id}>
          <button type="button" className="nv-tree-row nv-tree-module" style={{ paddingLeft: 28 + depth * 14 }}
            onClick={() => onOpen(module.id)}>
            <span className="nv-tree-glyph">{moduleGlyph(module.type)}</span>
            <span className="nv-tree-name">{module.name}</span>
          </button>
          <ModuleRows modules={module.children} depth={depth + 1} cardId={cardId} onOpen={onOpen} />
        </div>
      ))}
    </>
  )
}

/** 一张卡的子树：卡行 + 行尾「＋」（加下属模块）+ 展开后的模块与世界内角色。 */
function CardBranch({ card, t, onOpen, onAdd }: {
  readonly card: TreeCardRow
  readonly t: ShellT
  readonly onOpen: (moduleId?: string) => void
  readonly onAdd: () => void
}) {
  const [open, setOpen] = useState(true)
  const childCount = card.modules.length + card.characters.length
  return (
    <div>
      <div className="nv-tree-row nv-tree-card">
        <button type="button" className={`nv-tree-fold${open ? ' nv-tree-fold-on' : ''}`}
          aria-label={t(open ? 'tree.collapse' : 'tree.expand')}
          onClick={() => setOpen(v => !v)}>›</button>
        <button type="button" className="nv-tree-main" onClick={() => onOpen()}>
          <span className="nv-tree-name">{card.name}</span>
          {card.pending && <span className="nv-tree-pending" title={t('tree.pending')} />}
        </button>
        <button type="button" className="nv-tree-add" title={t('modules.add')} onClick={onAdd}>+</button>
      </div>
      {open && childCount > 0 && (
        <div>
          <ModuleRows modules={card.modules} depth={0} cardId={card.cardId} onOpen={onOpen} />
          {card.characters.map(character => (
            <button key={character.id} type="button" className="nv-tree-row nv-tree-module" style={{ paddingLeft: 28 }}
              onClick={() => onOpen()}>
              <span className="nv-tree-glyph">♙</span>
              <span className="nv-tree-name">{character.name}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  )
}

/** 分组头：标题 + 计数 + 折叠；`onAdd` 给行尾「＋」（造一个同级成员）。 */
function Group({ title, count, children, onAdd, addTitle }: {
  readonly title: string
  readonly count: number
  readonly children: ReactNode
  readonly onAdd?: () => void
  readonly addTitle?: string
}) {
  const [open, setOpen] = useState(true)
  if (count === 0) return null
  return (
    <div className="nv-tree-group">
      <div className="nv-tree-grouprow" onClick={() => setOpen(v => !v)} role="button">
        <span className={`nv-tree-fold${open ? ' nv-tree-fold-on' : ''}`}>›</span>
        <span className="nv-tree-grouptitle">{title}</span>
        <span className="nv-tree-count">{count}</span>
        {onAdd !== undefined && (
          <button type="button" className="nv-tree-add" title={addTitle}
            onClick={e => { e.stopPropagation(); onAdd() }}>+</button>
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
  const { t, useTree, useProject, useProjects } = props
  const tree = useTree(v => v)
  const project = useProject(v => v)
  const projects = useProjects(v => v)
  const [query, setQuery] = useState('')
  const [menuOpen, setMenuOpen] = useState(false)
  const [switchOpen, setSwitchOpen] = useState(false)

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
    }
  }, [tree, needle])

  const empty = filtered !== undefined && filtered.cards.length === 0 && filtered.docs.length === 0 && filtered.works.length === 0
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
            <button type="button" className="nv-tree-project" onClick={() => setSwitchOpen(v => !v)}>
              <span className="nv-tree-projectname">{title}</span>
              <span className="nv-tree-caret">⌄</span>
            </button>
          )} />
      </div>
      <div className="nv-tree-search">
        <input className="nv-tree-searchbox" value={query} placeholder={t('tree.search')}
          onChange={e => setQuery(e.target.value)} />
      </div>
      <div className="nv-tree-scroll">
        {empty && <div className="nv-tree-empty">{t('tree.empty')}</div>}
        <Group title={t('tree.cards')} count={filtered?.cards.length ?? 0}
          onAdd={() => props.openCreate('world')} addTitle={t('create.world.title')}>
          {filtered?.cards.map(card => (
            <CardBranch key={card.cardId} card={card} t={t}
              onOpen={moduleId => props.openCard(card.cardId, moduleId)}
              onAdd={() => props.addModule(card.cardId)} />
          ))}
        </Group>
        <Group title={t('tree.docs')} count={filtered?.docs.length ?? 0}>
          {filtered?.docs.map(doc => (
            <button key={doc.path} type="button" className="nv-tree-row nv-tree-module" style={{ paddingLeft: 28 }}
              onClick={() => props.openDoc(doc.path, doc.title)}>
              <span className="nv-tree-glyph">¶</span>
              <span className="nv-tree-name">{doc.title}</span>
            </button>
          ))}
        </Group>
        <Group title={t('tree.works')} count={filtered?.works.length ?? 0}>
          {filtered?.works.map(work => (
            <button key={work.id} type="button" className="nv-tree-row nv-tree-module" style={{ paddingLeft: 28 }}
              onClick={() => props.openWork(work.path, work.title)}>
              <span className="nv-tree-glyph">▣</span>
              <span className="nv-tree-name">{work.title}</span>
            </button>
          ))}
        </Group>
      </div>
      <div className="nv-tree-foot">
        <Menu open={menuOpen} side="top" align="start" selection="fill" listClassName="nv-tree-newmenu"
          onClose={() => setMenuOpen(false)}
          onSelect={id => { setMenuOpen(false); props.openCreate(id as CreateKind) }}
          items={[
            { id: 'world', label: t('create.world.title'), icon: glyph.globe(14) },
            { id: 'character', label: t('create.character.title'), icon: glyph.user(14) },
            { id: 'doc', label: t('create.doc.title'), icon: glyph.file(14) },
            { id: 'import', label: t('canvas.start.import'), icon: glyph.upload(14) },
          ]}
          anchor={(
            <button type="button" className="nv-tree-new" onClick={() => setMenuOpen(v => !v)}>
              <span>＋</span>
              <span>{t('tree.new')}</span>
            </button>
          )} />
        <button type="button" className="nv-tree-files" onClick={props.openFiles}>
          <span>{t('tree.files')}</span>
          <span className="nv-tree-count">{filtered?.files.count ?? 0}</span>
          <span>›</span>
        </button>
      </div>
    </div>
  )
}
