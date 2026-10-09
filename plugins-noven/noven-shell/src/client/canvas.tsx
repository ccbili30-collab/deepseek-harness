/**
 * 画布宿主 — 抽屉旁画布面的标签页工作面（契约 C1 的最小落地）。注册为
 * rightbar 单元的一个 selfChrome 页签（openTab 即浮上画布），内部自带
 * 标签条与对象体派发：起点、卡页、文稿、素材文件。对象登记目前是本包内
 * 的一张小表；跨插件扩展要等独立的登记服务。
 * @module noven-shell/client/canvas
 */
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type { SessionId } from '@deepseek-ai/dsh-session/types'
import type { ObservableSnapshot } from '@deepseek-ai/dsh-client-store'
import { defineStore } from '@deepseek-ai/dsh-client-store'
import type { PropsLocale, PropsRuntime, PropsStore, InjectFace } from '@deepseek-ai/dsh-client-ui-slots'
import type { CardAddr, CardOp, CardOpResult, CardState } from './card-api.ts'

import { CardPage } from './card-page.tsx'
import { BlockEditor, metaOf, wordCount, type EditableBlock, type MdLabels } from './editor.tsx'
import { fmt, type ShellT } from './pages/Home.tsx'
import type { NovenTree } from './tree-api.ts'
import { CreateDialog, type CreateKind, type CreateRequest } from './creation.tsx'
import { glyph } from './icons.tsx'

/** 文件行的标签种类：可编辑文本走文稿编辑器，其余（HTML/图片/二进制）走画框预览。 */
export const fileTabKind = (path: string): 'doc' | 'work' =>
  !path.includes('.') || /\.(md|markdown|mdx|txt)$/i.test(path) ? 'doc' : 'work'

/** 画布上一个打开的对象：key 去重，kind 派发体组件，owner 归属会话（C9）。 */
export interface CanvasTab {
  readonly key: string
  readonly kind: 'start' | 'card' | 'doc' | 'files' | 'work'
  readonly title: string
  /** 会话域归属——"开着什么"是每个会话自己的工作现场，跨会话不串。 */
  readonly owner: SessionId
  /** card 体：卡号与它的家（存根不存会话地址，会话会变、项目不会）。 */
  readonly cardId?: string
  readonly cardAddr?: CardAddr
  /** 树里点模块行时的深链目标：卡页打开后滚到/切到该模块。 */
  readonly moduleId?: string
  /** 树里卡行尾「＋」的信号：卡页就绪即弹模块库；消费时清掉（不留在持久态）。 */
  readonly addModule?: boolean
  /** doc 体：工作区相对路径；files 体不带。 */
  readonly path?: string
}

/** 会话的起点标签：每个会话自己的第一格。 */
export function startTab(owner: SessionId): CanvasTab {
  return { key: 'start', kind: 'start', title: '', owner }
}

type CanvasState = {
  tabs: CanvasTab[]
  /** 每会话的活动标签：owner → tab key。 */
  active: Record<string, string>
  /** 新建面板：挂在发起它的会话名下；dir 是文稿要落的分组目录。 */
  dialog: { readonly owner: SessionId; readonly kind: CreateKind; readonly dir?: string } | null
}

type CanvasActions = {
  open: (draft: CanvasState, tab: CanvasTab) => void
  close: (draft: CanvasState, owner: SessionId, key: string) => void
  select: (draft: CanvasState, owner: SessionId, key: string) => void
  /** 树刷新后同步存活对象的标题（重命名等）。 */
  retitle: (draft: CanvasState, owner: SessionId, key: string, title: string) => void
  /** 打开/关闭新建面板（起点页动作与树底「＋ 新建」共用）。 */
  openDialog: (draft: CanvasState, owner: SessionId, kind: CreateKind, dir?: string) => void
  closeDialog: (draft: CanvasState) => void
}

/** 画布标签 store：一份持久态按 owner 切成会话切片（C9：开着什么归会话）。 */
export function createCanvasStore() {
  return defineStore<CanvasState, CanvasActions>({
    // v2：旧 noven.canvas.tabs 存的是全局一份标签（无 owner），整值替换会
    // 把字符串 active 灌进 Record——换键隔离，旧条目废弃。
    persist: 'noven.canvas.tabs.v2',
    init: () => ({ tabs: [], active: {}, dialog: null }),
    actions: {
      open: (d, tab) => {
        const existing = d.tabs.findIndex(t => t.key === tab.key && t.owner === tab.owner)
        if (existing >= 0) d.tabs[existing] = { ...d.tabs[existing], ...tab }
        else d.tabs.push(tab)
        d.active[tab.owner] = tab.key
      },
      close: (d, owner, key) => {
        const index = d.tabs.findIndex(t => t.key === key && t.owner === owner)
        if (index < 0) return
        d.tabs.splice(index, 1)
        if (d.active[owner] === key) {
          const siblings = d.tabs.filter(t => t.owner === owner)
          const next = siblings[Math.min(index, siblings.length - 1)]
          d.active[owner] = next?.key ?? 'start'
        }
      },
      // start 可以是宿主补的虚拟标签（本会话还没开过任何对象时）——放行选中。
      select: (d, owner, key) => { if (key === 'start' || d.tabs.some(t => t.key === key && t.owner === owner)) d.active[owner] = key },
      retitle: (d, owner, key, title) => {
        const index = d.tabs.findIndex(t => t.key === key && t.owner === owner)
        if (index >= 0) d.tabs[index] = { ...d.tabs[index], title }
      },
      openDialog: (d, owner, kind, dir) => { d.dialog = { owner, kind, dir } },
      closeDialog: (d) => { d.dialog = null },
    },
  })
}

/** 当前项目坐标：画布与树共享的"我在哪个工作区"。 */
export interface ProjectFocus {
  readonly root: string
  readonly sessionId: SessionId | undefined
  readonly title: string | undefined
}

/** 画布注入面：对象读写都从这里走，组件不碰服务。 */
export interface CanvasInjected {
  /** 这片画布属于哪段会话：标签按它切片，文档读写也走这个会话的工作区。 */
  readonly session: SessionId
  readonly hooks: {
    /** 当前项目（绑定会话的 cwd + 创作库标题）；无项目时空态禁写。 */
    readonly project: ObservableSnapshot<ProjectFocus | undefined>
    /** 内容树快照——起点页据此决定空态。 */
    readonly tree: ObservableSnapshot<NovenTree | undefined>
  }
  readonly loadCard: (addr: CardAddr, cardId: string) => Promise<CardState | undefined>
  readonly cardOp: (addr: CardAddr, op: CardOp) => Promise<CardOpResult>
  readonly workspaceRoot: (addr: CardAddr) => string
  /** 文稿读/写：写走 /api/noven-doc（base 乐观锁）。 */
  readonly readDoc: (sessionId: SessionId, path: string) => Promise<string | undefined>
  readonly saveDoc: (sessionId: SessionId, path: string, content: string, base: string | null) => Promise<'ok' | 'conflict' | 'error'>
  /** 素材列表：一级目录条目。 */
  readonly listDir: (sessionId: SessionId, path: string) => Promise<readonly { name: string; type: string }[]>
  /** 让画布里的模块把一句话排进本会话对话队列（如地图的「直接生成底图」）。 */
  readonly ask: (text: string) => Promise<void>
  /** 新建面板提交：宿主决定落到哪条路由。 */
  readonly submitCreate: (request: CreateRequest) => void
  /** 导入卡包文件（隐藏 input 的 onChange 直达）。 */
  readonly importCard: (file: File) => void
}

type CanvasProps = PropsRuntime<'sidebar.right.pane.tab'> & PropsLocale<'novenShell'> & PropsStore<ReturnType<typeof createCanvasStore>> & InjectFace<CanvasInjected>

/** 起点页：设计稿 01 的中列空态——四张动作卡加一句引导；无项目只剩一句提示。 */
function StartTab({ t, empty, noProject, onCreate }: {
  readonly t: ShellT
  readonly empty: boolean
  readonly noProject: boolean
  readonly onCreate: (kind: CreateKind) => void
}) {
  if (noProject) {
    return (
      <div className="nv-canvas-start">
        <div className="nv-start-center">
          <div className="nv-start-title">{t('canvas.start.noProject')}</div>
          <div className="nv-start-sub">{t('canvas.start.noProjectSub')}</div>
        </div>
      </div>
    )
  }
  return (
    <div className="nv-canvas-start">
      <div className="nv-start-center">
        <div className="nv-start-title">{t(empty ? 'canvas.start.emptyTitle' : 'canvas.start.title')}</div>
        <div className="nv-start-sub">{t('canvas.start.sub')}</div>
        <div className="nv-start-grid">
          <button type="button" className="nv-start-card" onClick={() => onCreate('world')}>
            <span className="nv-start-glyph">{glyph.globe(22)}</span>
            <span>{t('canvas.start.world')}</span>
          </button>
          <button type="button" className="nv-start-card" onClick={() => onCreate('character')}>
            <span className="nv-start-glyph">{glyph.user(22)}</span>
            <span>{t('canvas.start.character')}</span>
          </button>
          <button type="button" className="nv-start-card" onClick={() => onCreate('doc')}>
            <span className="nv-start-glyph">{glyph.file(22)}</span>
            <span>{t('canvas.start.doc')}</span>
          </button>
          <button type="button" className="nv-start-card" onClick={() => onCreate('import')}>
            <span className="nv-start-glyph">{glyph.download(22)}</span>
            <span>{t('canvas.start.import')}</span>
          </button>
        </div>
        <div className="nv-start-hint">{t('canvas.start.hint')}</div>
      </div>
    </div>
  )
}

/**
 * 卡体：卡页（设定总览 + 分页模块）。
 */
function CardTab({ tab, t, loadCard, op, ask, close, consumeAddModule }: {
  readonly tab: CanvasTab
  readonly t: ShellT
  readonly loadCard: CanvasInjected['loadCard']
  readonly op: CanvasInjected['cardOp']
  readonly ask: CanvasInjected['ask']
  readonly close: () => void
  /** 清掉标签上的 addModule 信号（一次性）。 */
  readonly consumeAddModule: () => void
}) {
  const [autoLib, setAutoLib] = useState(false)
  useEffect(() => {
    if (tab.addModule !== true) return
    setAutoLib(true)
    consumeAddModule()
  }, [tab.addModule, consumeAddModule])
  const addr: CardAddr = tab.cardAddr ?? {}
  if (tab.cardId === undefined) return null
  return (
    <div className="nv-canvas-cardbody">
      <CardPage
        addr={addr}
        cardId={tab.cardId}
        focusModuleId={tab.moduleId}
        autoLibrary={autoLib}
        t={t}
        loadCard={loadCard}
        op={op}
        ask={ask}
      />
    </div>
  )
}

/** 把文稿正文按空行切成伪块（id 携带原文，保存时整文重拼）。 */
function docBlocks(text: string): EditableBlock[] {
  if (text === '') return []
  return text.split(/\n{2,}/).map((chunk, i) => ({ id: `p${i}`, kind: 'text' as const, text: chunk }))
}

/** 文稿体：通用编辑器 + /api/noven-doc 乐观锁保存；冲突时提示重开。 */
function DocTab({ tab, t, sessionId, readDoc, saveDoc }: {
  readonly tab: CanvasTab
  readonly t: ShellT
  readonly sessionId: SessionId
  readonly readDoc: CanvasInjected['readDoc']
  readonly saveDoc: CanvasInjected['saveDoc']
}) {
  const [base, setBase] = useState<string | undefined>(undefined)
  const [state, setState] = useState<'loading' | 'ready' | 'missing'>('loading')
  const path = tab.path ?? ''
  useEffect(() => {
    let live = true
    setState('loading')
    void readDoc(sessionId, path).then(content => {
      if (!live) return
      if (content === undefined) { setState('missing'); return }
      setBase(content); setState('ready')
    })
    return () => { live = false }
  }, [sessionId, path, readDoc])
  const mdLabels = useMemo<MdLabels>(() => ({
    code: {
      copyLabel: t('editor.md.copy'),
      copiedLabel: t('editor.md.copied'),
      toolbarLabels: { codeLabel: t('editor.md.code'), wrapLabel: t('editor.md.wrap'), unwrapLabel: t('editor.md.unwrap') },
    },
    footnotes: '',
  }), [t])
  const saveText = useCallback(async (text: string): Promise<'ok' | 'conflict' | 'error'> => {
    const result = await saveDoc(sessionId, path, text, base ?? null)
    if (result === 'ok') setBase(text)
    return result
  }, [sessionId, saveDoc, path, base])
  const saveBlock = useCallback(async (blockId: string, text: string): Promise<'ok' | 'conflict' | 'error'> => {
    if (base === undefined) return 'error'
    const chunks = docBlocks(base)
    const index = Number(blockId.slice(1))
    const next = chunks.map((c, i) => i === index ? text : c.text ?? '').join('\n\n')
    return saveText(next)
  }, [base, saveText])
  const addBlock = useCallback(async (text: string) => saveText(`${base ?? ''}\n\n${text}`), [base, saveText])
  if (state === 'missing' || base === undefined) {
    return <div className="nv-canvas-missing">{t(state === 'missing' ? 'canvas.doc.missing' : 'canvas.files.loading')}</div>
  }
  const name = path.split('/').pop() ?? path
  return (
    <div className="nv-ed">
      <header className="nv-ed-head">
        <h1 className="nv-ed-title">{name}</h1>
        <div className="nv-ed-meta">{metaOf([t('tree.docs'), fmt(t, 'editor.wordcount', { count: wordCount(base) })])}</div>
      </header>
      <BlockEditor blocks={docBlocks(base)} labels={mdLabels} t={t} onSaveBlock={saveBlock} onAdd={addBlock} />
    </div>
  )
}

/** 作品体：Studio 产物按 /api/noven-frame 的 sandbox 画框渲染。 */
function WorkTab({ tab, t, sessionId }: {
  readonly tab: CanvasTab
  readonly t: ShellT
  readonly sessionId: SessionId
}) {
  const src = new URL(`api/noven-frame?session=${encodeURIComponent(sessionId)}&path=${encodeURIComponent(tab.path ?? '')}`, document.baseURI).href
  return <iframe className="nv-canvas-workframe" src={src} title={tab.title} />
}

/** 素材与文件体：项目根的一层列表；文稿目录行点进 doc 体。 */
function FilesTab({ t, sessionId, listDir, openDoc }: {
  readonly t: ShellT
  readonly sessionId: SessionId
  readonly listDir: CanvasInjected['listDir']
  readonly openDoc: (path: string, title: string) => void
}) {
  const [entries, setEntries] = useState<readonly { name: string; type: string }[] | undefined>(undefined)
  useEffect(() => {
    let live = true
    void listDir(sessionId, '').then(list => { if (live) setEntries(list) })
    return () => { live = false }
  }, [sessionId, listDir])
  return (
    <div className="nv-canvas-files">
      {entries === undefined && <div className="nv-canvas-missing">{t('canvas.files.loading')}</div>}
      {entries !== undefined && entries.length === 0 && <div className="nv-canvas-missing">{t('canvas.files.empty')}</div>}
      {entries?.map(entry => (
        <button key={entry.name} type="button" className="nv-canvas-filerow"
          onClick={() => { if (entry.type === 'file') openDoc(entry.name, entry.name) }}>
          <span className="nv-canvas-fileicon">{entry.type === 'directory' ? '▸' : '·'}</span>
          <span>{entry.name}</span>
        </button>
      ))}
    </div>
  )
}

/**
 * 画布宿主：标签条 + 活动体。`start` 常驻且不可关；`+` 回到起点。
 * @param props - 画布页签座标准 props + 画布 store + 注入面。
 * @returns 画布工作面。
 */
export function CanvasHost(props: CanvasProps) {
  const { t, useStore, actions } = props
  const session = props.session
  const allTabs = useStore(s => s.tabs)
  const activeMap = useStore(s => s.active)
  const dialogRow = useStore(s => s.dialog)
  const project = props.useProject(v => v)
  const tree = props.useTree(v => v)
  // 会话切片：本会话的标签集；起点标签缺位时补一个虚拟的（不落库）。
  const tabs = useMemo(() => {
    const rows = allTabs.filter(row => row.owner === session)
    return rows.some(row => row.kind === 'start') ? rows : [startTab(session), ...rows]
  }, [allTabs, session])
  const active = activeMap[session] ?? 'start'
  const dialog = dialogRow !== null && dialogRow.owner === session ? dialogRow : null
  const tab = tabs.find(row => row.key === active) ?? tabs[0]
  const importRef = useRef<HTMLInputElement | null>(null)
  const openDoc = useCallback((path: string, title: string) => {
    const kind = fileTabKind(path)
    actions.open({ key: `${kind}:${path}`, kind, title, owner: session, path })
  }, [actions, session])
  const closeActive = useCallback(() => { if (tab !== undefined) actions.close(session, tab.key) }, [actions, session, tab])
  // 树「＋」开的卡带 addModule 信号——卡页消费一次即清，不留在持久态。
  const consumeAddModule = useCallback(() => {
    if (tab !== undefined) actions.open({ ...tab, addModule: undefined })
  }, [actions, tab])
  const submit = useCallback((request: CreateRequest) => {
    actions.closeDialog()
    props.submitCreate(request)
  }, [actions, props])
  useEffect(() => {
    if (dialog?.kind === 'import') { actions.closeDialog(); importRef.current?.click() }
  }, [dialog, actions])
  // 卡标签的标题以内容树为准：打开时拿不到卡名，树轮询到达后回写。
  useEffect(() => {
    if (tree === undefined) return
    for (const row of tabs) {
      if (row.kind !== 'card' || row.cardId === undefined) continue
      const name = tree.cards.find(card => card.cardId === row.cardId)?.name
      if (name !== undefined && name !== row.title) actions.retitle(session, row.key, name)
    }
  }, [tree, tabs, session, actions])
  return (
    <div className="nv-canvas">
      <input ref={importRef} type="file" accept=".zip,.png,.json,.txt" hidden
        onChange={e => { const file = e.target.files?.[0]; e.target.value = ''; if (file !== undefined) props.importCard(file) }} />
      <div className="nv-canvas-strip" role="tablist">
        {tabs.map(row => (
          <div key={row.key} role="tab" aria-selected={row.key === active}
            className={`nv-canvas-tab${row.key === active ? ' nv-canvas-tab-on' : ''}`}
            onClick={() => actions.select(session, row.key)}>
            <span className="nv-canvas-tabtitle">{row.title !== '' ? row.title : row.cardId ?? t('canvas.start.tab')}</span>
            {row.key !== 'start' && (
              <button type="button" className="nv-canvas-tabx" aria-label={t('canvas.tab.close')}
                onClick={e => { e.stopPropagation(); actions.close(session, row.key) }}>×</button>
            )}
          </div>
        ))}
        <button type="button" className="nv-canvas-plus" aria-label={t('canvas.tab.new')}
          onClick={() => actions.open(startTab(session))}>+</button>
      </div>
      <div className="nv-canvas-body">
        {tab !== undefined && tab.kind === 'start' && (
          <StartTab t={t} noProject={project === undefined}
            empty={(tree?.cards.length ?? 0) === 0 && (tree?.docs.length ?? 0) === 0 && (tree?.works.length ?? 0) === 0}
            onCreate={kind => { if (kind === 'import') importRef.current?.click(); else actions.openDialog(session, kind) }} />
        )}
        {tab !== undefined && tab.kind === 'card' && (
          <CardTab tab={tab} t={t} loadCard={props.loadCard} op={props.cardOp} ask={props.ask}
            close={closeActive} consumeAddModule={consumeAddModule} />
        )}
        {tab !== undefined && tab.kind === 'doc' && (
          <DocTab key={tab.key} tab={tab} t={t} sessionId={session} readDoc={props.readDoc} saveDoc={props.saveDoc} />
        )}
        {tab !== undefined && tab.kind === 'files' && (
          <FilesTab t={t} sessionId={session} listDir={props.listDir} openDoc={openDoc} />
        )}
        {tab !== undefined && tab.kind === 'work' && (
          <WorkTab tab={tab} t={t} sessionId={session} />
        )}
      </div>
      {dialog !== null && dialog.kind !== 'import' && (
        <CreateDialog kind={dialog.kind} dir={dialog.dir} t={t}
          worlds={(tree?.cards ?? []).filter(c => c.kind === 'WORLD').map(c => ({ cardId: c.cardId, name: c.name }))}
          onSubmit={submit} onCancel={actions.closeDialog} />
      )}
    </div>
  )
}
