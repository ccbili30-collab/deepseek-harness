/**
 * 画布宿主 — 抽屉旁画布面的标签页工作面（契约 C1 的最小落地）。注册为
 * rightbar 单元的一个 selfChrome 页签（openTab 即浮上画布），内部自带
 * 标签条与对象体派发：起点、卡页、文稿、素材文件。对象登记目前是本包内
 * 的一张小表；跨插件扩展要等独立的登记服务。
 * @module noven-shell/client/canvas
 */
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import type { SessionId } from '@deepseek-ai/dsh-session/types'
import type { ObservableSnapshot } from '@deepseek-ai/dsh-client-store'
import { defineStore } from '@deepseek-ai/dsh-client-store'
import type { PropsLocale, PropsRuntime, PropsStore, InjectFace } from '@deepseek-ai/dsh-client-ui-slots'
import { Menu, MarkdownText, type MarkdownLabels } from '@deepseek-ai/dsh-client-ui-primitives'
import type { CardAddr, CardOp, CardOpResult, CardState } from './card-api.ts'
import type { ImportReport } from './tree-api.ts'

import { CardPage } from './card-page.tsx'
import { AiEditsContext, useAiEdits, type AiEditsSnapshot } from './ai-edits.ts'
import { SurfaceViewContext } from './surface-view.ts'
import { metaOf, wordCount, type MdLabels } from './editor.tsx'
import { BlockNoteDocEditor, PlainTextDocEditor, type OutlineItem, type OutlineMark } from './doc-editor.tsx'
import { fmt, type ShellT } from './pages/Home.tsx'
import type { NovenTree, TreeModuleRow } from './tree-api.ts'
import { CreateDialog, type CreateKind, type CreateRequest } from './creation.tsx'
import { glyph } from './icons.tsx'
import { InlineRename, notifyUndo, useArmedMenu } from './ui/interact.tsx'
import { PhoneStage, type TranscriptState } from './stage-phone.tsx'
import { ConvView, type ConvChannel, type ConvsMap } from './conv.tsx'
import type { ModelCatalog, ModelSelection } from '@deepseek-ai/dsh-api-session-controller/types'
import type { IslandCall, IslandFrame } from './stage-island.tsx'
import { buildEnv, realWebview, SIM_IME, WEBVIEW_BASELINE, type FrameSendResult } from './stage-frame.ts'
import { collectDeltas, foldArchive, DELTA_WINDOW } from './stage-archive.ts'
import { useSessionSettings } from './session-settings.tsx'

/** markdown 文稿走富编辑器（BlockNote）；其余文本（json/yaml/代码…）保留纯文本块编辑。 */
const RICH_TEXT_PATH = /\.(md|markdown|mdx|txt)$/i
/** 文稿缩放记忆（全局，跨页签/重启保留）。 */
const DOC_ZOOM_KEY = 'noven.doc.zoom'
/** 大纲浮窗尺寸记忆（全局）。 */
const PANEL_W_KEY = 'noven.doc.panel.w'
const PANEL_H_KEY = 'noven.doc.panel.h'

/** 文件行的标签种类：可编辑文本走文稿编辑器，其余（HTML/图片/二进制）走画框预览。 */
export const fileTabKind = (path: string): 'doc' | 'work' =>
  !path.includes('.') || /\.(md|markdown|mdx|txt|json|ya?ml|toml|xml|csv|css|m?[jt]s)$/i.test(path) ? 'doc' : 'work'

/** 走图片查看器而非 iframe 画框的作品扩展名——与创作库登记的 kind 推断同口径。 */
const IMAGE_WORK_EXTS = new Set(['.png', '.jpg', '.jpeg', '.webp', '.gif', '.svg'])

/** 画布上一个打开的对象：key 去重，kind 派发体组件，owner 归属会话（C9）。 */
export interface CanvasTab {
  readonly key: string
  readonly kind: 'start' | 'chat' | 'card' | 'doc' | 'files' | 'work' | 'conv' | 'manual'
  readonly title: string
  /** 会话域归属——"开着什么"是每个会话自己的工作现场，跨会话不串。 */
  readonly owner: SessionId
  /** card 体：卡号与它的家（存根不存会话地址，会话会变、项目不会）。 */
  readonly cardId?: string
  readonly cardAddr?: CardAddr
  /** 树里点模块行时的深链目标：卡页打开后滚到/切到该模块。 */
  readonly moduleId?: string
  /**
   * Reserved presentation contract: `page` pages may render full-canvas
   * without reading chrome. Free surfaces currently derive it from the
   * module widget; the field is the future canvas-unification seam.
   */
  readonly presentation?: 'inline' | 'page'
  /** 树里卡行尾「＋」的信号：卡页就绪即弹模块库；消费时清掉（不留在持久态）。 */
  readonly addModule?: boolean
  /** doc 体：工作区相对路径；files 体不带。 */
  readonly path?: string
  /** conv 体：背后的侧线会话 id + 发送通道（见 conv.tsx）。 */
  readonly convId?: SessionId
  readonly convChannel?: ConvChannel
  /** manual 体：翻开的手册主题（noven-docs 的 slug）。 */
  readonly slug?: string
}

/** 一页从页签条撕下的对象：键引用同一个 CanvasTab，坐标尺寸归浮窗态。 */
export interface FloatPage {
  readonly key: string
  readonly x: number
  readonly y: number
  readonly w: number
  readonly h: number
}

/** 会话的起点标签：每个会话自己的第一格。 */
export function startTab(owner: SessionId): CanvasTab {
  return { key: 'start', kind: 'start', title: '', owner }
}

/** 会话的手机屏标签：常驻不可关——手机上会话本身就是那个屏。 */
export function chatTab(owner: SessionId): CanvasTab {
  return { key: 'chat', kind: 'chat', title: '', owner }
}

/** 布局树叶：一组页签（各自页签条 + 活动页）。 */
export interface CanvasLeaf {
  readonly id: string
  readonly tabs: string[]
  /** 活动页签 key——start/chat 这类虚拟页签也合法（每叶都能渲）。 */
  active?: string
}

/** 布局树节点：分割（方向 + 比例）或叶。 */
export interface CanvasSplit {
  readonly id: string
  readonly dir: 'x' | 'y'
  readonly ratio: number
  readonly a: CanvasNode
  readonly b: CanvasNode
}
export type CanvasNode = CanvasLeaf | CanvasSplit

/** 页签拖放的目标区：叶的四缘（分栏）或中心（移入该叶）。 */
export type DropZone = 'left' | 'right' | 'top' | 'bottom' | 'center'

export type CanvasState = {
  tabs: CanvasTab[]
  /** owner → 布局树。缺省/坏数据由 normLayout 自愈（旧 v3 快照只有 active）。 */
  layout: Record<string, CanvasNode>
  /** owner → 浮窗页表：页签拖出成浮窗=前台工作面，键仍指向 tabs 里的同一实体。 */
  floats?: Record<string, FloatPage[]>
  /** owner → 焦点叶 id：新页签落在哪、外部 select 作用于哪。 */
  focus: Record<string, string>
  /** @deprecated v3 及更早的活动页签表——normLayout 读一次建叶，之后由叶自持。 */
  active?: Record<string, string>
  /** 新建面板：挂在发起它的会话名下；dir 是文稿要落的分组目录。 */
  dialog: { readonly owner: SessionId; readonly kind: CreateKind; readonly dir?: string } | null
  /** 手机模拟器（按项目根记）：open=当前在屏会话；pick=被标「模拟」的绑定会话。 */
  simOpen: Record<string, SessionId>
  simPick: Record<string, SessionId[]>
  /** Studio 组存续态（按项目根记）：用户在新建菜单明确开启才存在，关掉只藏组不动会话。 */
  studioOn: Record<string, boolean>
  /** 模拟器机框档位（预设名，见 DEVICE_SIZES）。 */
  simSize: string
  /** 模拟键盘弹出开关（B3：预演真机作品区抬升 + env.ime 推帧）。 */
  simIme?: boolean
  /** 内核上报模式：baseline 恒报 111（作品的降级分支在 PC 上才测得到），real 报真实版本。 */
  simWebview?: 'baseline' | 'real'
  /** 模拟器内部视图（按 owner 会话记）；缺省 = 自动（开着上次会话进聊天，否则落列表）。 */
  simView: Record<string, 'chat' | 'list' | 'settings' | 'records'>
}

type CanvasActions = {
  open: (draft: CanvasState, tab: CanvasTab, leafId?: string) => void
  close: (draft: CanvasState, owner: SessionId, key: string) => void
  select: (draft: CanvasState, owner: SessionId, key: string) => void
  /** 树刷新后同步存活对象的标题（重命名等）。 */
  retitle: (draft: CanvasState, owner: SessionId, key: string, title: string) => void
  /** 键盘/鼠标焦点叶：点哪片叶子，新页签就开进哪片。 */
  focusLeaf: (draft: CanvasState, owner: SessionId, leafId: string) => void
  /** 拖页签：zone 中心 = 移入目标叶，四缘 = 把目标叶劈成两栏塞进新叶。 */
  moveTab: (draft: CanvasState, owner: SessionId, key: string, leafId: string, zone: DropZone) => void
  /** 拖分割条改比例。 */
  resize: (draft: CanvasState, owner: SessionId, splitId: string, ratio: number) => void
  /** 打开/关闭新建面板（起点页动作与树底「＋ 新建」共用）。 */
  openDialog: (draft: CanvasState, owner: SessionId, kind: CreateKind, dir?: string) => void
  closeDialog: (draft: CanvasState) => void
  /** 模拟器会话选中/挂载开关/机框档位——按项目根归属，跨画布会话共享。 */
  simOpenSet: (draft: CanvasState, root: string, sessionId: SessionId | undefined) => void
  simPickToggle: (draft: CanvasState, root: string, sessionId: SessionId) => void
  /** Studio 开关：新建菜单的 Studio 项翻转它——不是建会话。 */
  studioSet: (draft: CanvasState, root: string, on: boolean) => void
  simSizeSet: (draft: CanvasState, size: string) => void
  simImeSet: (draft: CanvasState, on: boolean) => void
  simWebviewSet: (draft: CanvasState, mode: 'baseline' | 'real') => void
  /** 模拟器视图态归属画布 store——切走再回来不丢自己在哪个屏。 */
  simViewSet: (draft: CanvasState, owner: SessionId, view: 'chat' | 'list' | 'settings' | 'records' | undefined) => void
  /** 页签拖出画布 → 浮窗：页实体不动，键从叶移进浮窗表。 */
  floatTab: (draft: CanvasState, owner: SessionId, key: string, x: number, y: number) => void
  /** 浮窗拖回页签条 → 归叶激活（浮窗→页签只是换栖身地）。 */
  dockFloat: (draft: CanvasState, owner: SessionId, key: string, leafId: string) => void
  /** 浮窗几何/层级更新：patch 只写坐标尺寸，undefined 不改。 */
  floatSet: (draft: CanvasState, owner: SessionId, key: string, patch: Partial<Pick<FloatPage, 'x' | 'y' | 'w' | 'h'>>) => void
  /** 浮窗点到即前置（数组末尾 = 渲染最上层）。 */
  floatFocus: (draft: CanvasState, owner: SessionId, key: string) => void
  /** 分叉继承：把 from 会话的整套画布（页签/布局/浮窗/焦点/模拟器视图）复制给 to。 */
  inheritOwner: (draft: CanvasState, from: SessionId, to: SessionId) => void
}

const isLeaf = (node: CanvasNode): node is CanvasLeaf => 'tabs' in node

let nodeSeq = 0
const nid = (prefix: string): string => `${prefix}${Date.now().toString(36)}${(nodeSeq++).toString(36)}`

/** 收齐树里全部叶（先序）。 */
function leavesOf(node: CanvasNode): CanvasLeaf[] {
  return isLeaf(node) ? [node] : [...leavesOf(node.a), ...leavesOf(node.b)]
}

function leafWith(node: CanvasNode, key: string): CanvasLeaf | undefined {
  if (isLeaf(node)) return node.tabs.includes(key) ? node : undefined
  return leafWith(node.a, key) ?? leafWith(node.b, key)
}

function leafById(node: CanvasNode, id: string): CanvasLeaf | undefined {
  if (isLeaf(node)) return node.id === id ? node : undefined
  return leafById(node.a, id) ?? leafById(node.b, id)
}

/** owner 画布焦点叶的当前页签 key；取不到焦点叶回退首叶，无布局返回 undefined。 */
export function activeKey(state: Pick<CanvasState, 'layout' | 'focus'>, owner: SessionId): string | undefined {
  const node = state.layout[owner]
  if (node === undefined) return undefined
  return (leafById(node, state.focus[owner] ?? '') ?? leavesOf(node)[0])?.active
}

/** 把 leafId 那片叶换成节点 n（分裂时用），纯函数。 */
function replaceLeaf(node: CanvasNode, leafId: string, next: CanvasNode): CanvasNode {
  if (isLeaf(node)) return node.id === leafId ? next : node
  return { ...node, a: replaceLeaf(node.a, leafId, next), b: replaceLeaf(node.b, leafId, next) }
}

/** 分裂目标叶：zone 四缘决定方向与新叶落在哪一侧。 */
function splitLeaf(leaf: CanvasLeaf, zone: Exclude<DropZone, 'center'>, fresh: CanvasLeaf): CanvasSplit {
  const dir = zone === 'left' || zone === 'right' ? 'x' : 'y'
  const first = zone === 'left' || zone === 'top'
  return { id: nid('s'), dir, ratio: 0.5, a: first ? fresh : leaf, b: first ? leaf : fresh }
}

/**
 * 布局自愈（纯函数）：剔除死页签引用、合掉空叶（根叶除外）、无家可归的页签归队。
 * 每条页签只许在一叶——重复引用按先序保留第一份。v3 快照没有 layout 时按
 * active 表建单叶，老现场一格不丢。
 */
function normLayout(state: Pick<CanvasState, 'tabs' | 'layout' | 'active' | 'floats'>, owner: SessionId): CanvasNode {
  const keys = state.tabs.filter(row => row.owner === owner).map(row => row.key)
  const seen = new Set<string>()
  // 浮窗里的键是有家的——不算无家可归、不塞回叶里。
  for (const f of state.floats?.[owner] ?? []) seen.add(f.key)
  const rebuild = (node: CanvasNode): CanvasNode | null => {
    if (isLeaf(node)) {
      // start/chat 是宿主补的虚拟页签——可以在某叶显式落位（拖分栏双视口），
      // 不在 state.tabs 也不算死引用。
      const tabs = node.tabs.filter(key => (keys.includes(key) || key === 'start' || key === 'chat') && !seen.has(key))
      tabs.forEach(key => seen.add(key))
      if (tabs.length === 0) return null
      const active = node.active !== undefined && (tabs.includes(node.active) || node.active === 'start' || node.active === 'chat')
        ? node.active : tabs[tabs.length - 1] ?? 'chat'
      return { ...node, tabs, active }
    }
    const a = rebuild(node.a), b = rebuild(node.b)
    if (a === null && b === null) return null
    if (a === null) return b
    if (b === null) return a
    return { ...node, a, b }
  }
  const firstLeaf = (node: CanvasNode): CanvasLeaf | undefined => isLeaf(node) ? node : firstLeaf(node.a) ?? firstLeaf(node.b)
  const rebuilt = state.layout?.[owner] !== undefined ? rebuild(state.layout[owner] as CanvasNode) : null
  let node = rebuilt ?? { id: nid('L'), tabs: [], active: state.active?.[owner] ?? 'chat' }
  const missing = keys.filter(key => !seen.has(key))
  const first = firstLeaf(node)
  if (first !== undefined && missing.length > 0) {
    node = replaceLeaf(node, first.id, { ...first, tabs: [...first.tabs, ...missing] })
  }
  return node
}

/** draft 版自愈：规整 layout[owner] 并修 focus。 */
function normDraft(d: CanvasState, owner: SessionId): CanvasNode {
  if (d.layout === undefined) d.layout = {}
  if (d.focus === undefined) d.focus = {}
  const node = normLayout(d, owner)
  d.layout[owner] = node
  if (d.active !== undefined) delete d.active[owner] // 迁移完即清，不拖着两口径
  if (d.focus[owner] === undefined || leafById(node, d.focus[owner]) === undefined) {
    d.focus[owner] = leavesOf(node)[0]?.id ?? ''
  }
  return node
}

/** 画布标签 store：一份持久态按 owner 切成会话切片（C9：开着什么归会话）。 */
export function createCanvasStore() {
  return defineStore<CanvasState, CanvasActions>({
    // 持久键沿用 v3：v3 快照的 active 表由 normLayout 迁成单叶布局，老现场不丢。
    persist: 'noven.canvas.tabs.v3',
    init: () => ({ tabs: [], layout: {}, focus: {}, dialog: null, simOpen: {}, simPick: {}, studioOn: {}, simSize: 'p390', simIme: false, simWebview: 'baseline', simView: {}, floats: {} }),
    actions: {
      open: (d, tab, leafId) => {
        const existing = d.tabs.findIndex(t => t.key === tab.key && t.owner === tab.owner)
        if (existing >= 0) d.tabs[existing] = { ...d.tabs[existing], ...tab }
        else d.tabs.push(tab)
        // open = 归队：浮窗里的同键页被请回页签条（一处栖身，不两头在）。
        const floats = d.floats?.[tab.owner]
        const at = floats?.findIndex(f => f.key === tab.key) ?? -1
        if (floats !== undefined && at >= 0) floats.splice(at, 1)
        normDraft(d, tab.owner)
        const node = d.layout[tab.owner] as CanvasNode
        // 落点序：显式叶 → 页签已在的叶 → 焦点叶 → 第一叶。已存在 = 跳回旧页签。
        const leaf = (leafId !== undefined ? leafById(node, leafId) : undefined)
          ?? leafWith(node, tab.key)
          ?? leafById(node, d.focus[tab.owner])
          ?? leavesOf(node)[0]
        if (leaf === undefined) return
        if (!leaf.tabs.includes(tab.key)) leaf.tabs.push(tab.key)
        leaf.active = tab.key
        d.focus[tab.owner] = leaf.id
      },
      close: (d, owner, key) => {
        const index = d.tabs.findIndex(t => t.key === key && t.owner === owner)
        if (index < 0) return
        d.tabs.splice(index, 1)
        const floats = d.floats?.[owner]
        const fat = floats?.findIndex(f => f.key === key) ?? -1
        if (floats !== undefined && fat >= 0) floats.splice(fat, 1)
        // 剔死引用、合空叶、修 active/focus 全交给 normalize。
        normDraft(d, owner)
      },
      // 虚拟页签（start/chat）可能在任一叶活动——找不到宿主叶就落在焦点叶。
      select: (d, owner, key) => {
        normDraft(d, owner)
        const node = d.layout[owner] as CanvasNode
        const leaf = leafWith(node, key) ?? leafById(node, d.focus[owner]) ?? leavesOf(node)[0]
        if (leaf === undefined) return
        if (!leaf.tabs.includes(key) && key !== 'start' && key !== 'chat') return
        leaf.active = key
        d.focus[owner] = leaf.id
      },
      retitle: (d, owner, key, title) => {
        const index = d.tabs.findIndex(t => t.key === key && t.owner === owner)
        if (index >= 0) d.tabs[index] = { ...d.tabs[index], title }
      },
      focusLeaf: (d, owner, leafId) => {
        normDraft(d, owner)
        if (leafById(d.layout[owner] as CanvasNode, leafId) !== undefined) d.focus[owner] = leafId
      },
      moveTab: (d, owner, key, leafId, zone) => {
        normDraft(d, owner)
        const node = d.layout[owner] as CanvasNode
        const target = leafById(node, leafId)
        if (target === undefined) return
        const src = leafWith(node, key)
        if (src !== undefined) src.tabs.splice(src.tabs.indexOf(key), 1)
        // 中心：移入（同叶内等于挪尾+激活）；四缘：目标叶分裂，新叶承 tab。
        if (zone === 'center') {
          if (!target.tabs.includes(key)) target.tabs.push(key)
          target.active = key
          d.focus[owner] = target.id
        } else {
          const fresh: CanvasLeaf = { id: nid('L'), tabs: [key], active: key }
          d.layout[owner] = replaceLeaf(node, leafId, splitLeaf(target, zone, fresh))
          d.focus[owner] = fresh.id
        }
        d.layout[owner] = normLayout(d, owner)
        if (d.focus[owner] === undefined || leafById(d.layout[owner] as CanvasNode, d.focus[owner]) === undefined) {
          d.focus[owner] = leavesOf(d.layout[owner] as CanvasNode)[0]?.id ?? ''
        }
      },
      resize: (d, owner, splitId, ratio) => {
        const node = d.layout?.[owner]
        if (node === undefined) return
        const set = (n: CanvasNode): CanvasNode => isLeaf(n) ? n
          : n.id === splitId ? { ...n, ratio } : { ...n, a: set(n.a), b: set(n.b) }
        d.layout[owner] = set(node)
      },
      openDialog: (d, owner, kind, dir) => { d.dialog = { owner, kind, dir } },
      closeDialog: (d) => { d.dialog = null },
      simOpenSet: (d, root, sessionId) => {
        if (sessionId === undefined) delete d.simOpen[root]; else d.simOpen[root] = sessionId
      },
      simPickToggle: (d, root, sessionId) => {
        const list = d.simPick[root] ?? (d.simPick[root] = [])
        const at = list.indexOf(sessionId)
        if (at >= 0) list.splice(at, 1); else list.push(sessionId)
      },
      studioSet: (d, root, on) => {
        // persist 整棵替换不补 init：老快照可能还没有 studioOn。
        const map = d.studioOn ?? (d.studioOn = {})
        if (on) map[root] = true; else delete map[root]
      },
      simSizeSet: (d, size) => { d.simSize = size },
      simImeSet: (d, on) => { d.simIme = on },
      simWebviewSet: (d, mode) => { d.simWebview = mode },
      simViewSet: (d, owner, view) => {
        if (view === undefined) delete d.simView[owner]; else d.simView[owner] = view
      },
      floatTab: (d, owner, key, x, y) => {
        if (d.floats === undefined) d.floats = {}
        const list = d.floats[owner] ?? (d.floats[owner] = [])
        if (!list.some(f => f.key === key)) {
          list.push({ key, x: Math.max(8, Math.min(x, window.innerWidth - 80)), y: Math.max(8, Math.min(y, window.innerHeight - 60)), w: 340, h: 420 })
        }
        // 从叶里摘掉（有的话）——页签→浮窗是挪窝不是复制。
        const node = d.layout[owner]
        const src = node !== undefined ? leafWith(node, key) : undefined
        if (src !== undefined) src.tabs.splice(src.tabs.indexOf(key), 1)
        normDraft(d, owner)
      },
      dockFloat: (d, owner, key, leafId) => {
        const floats = d.floats?.[owner]
        const at = floats?.findIndex(f => f.key === key) ?? -1
        if (floats === undefined || at < 0) return
        floats.splice(at, 1)
        normDraft(d, owner)
        const node = d.layout[owner] as CanvasNode
        const leaf = leafById(node, leafId) ?? leafById(node, d.focus[owner]) ?? leavesOf(node)[0]
        if (leaf === undefined) return
        if (!leaf.tabs.includes(key)) leaf.tabs.push(key)
        leaf.active = key
        d.focus[owner] = leaf.id
      },
      floatSet: (d, owner, key, patch) => {
        const list = d.floats?.[owner]
        const at = list?.findIndex(row => row.key === key) ?? -1
        if (list === undefined || at < 0) return
        const f = list[at]
        const w = patch.w === undefined ? f.w : Math.max(240, Math.min(patch.w, window.innerWidth - f.x - 8))
        const h = patch.h === undefined ? f.h : Math.max(200, Math.min(patch.h, window.innerHeight - f.y - 8))
        const x = patch.x === undefined ? f.x : Math.max(8 - w + 80, Math.min(patch.x, window.innerWidth - 80))
        const y = patch.y === undefined ? f.y : Math.max(8, Math.min(patch.y, window.innerHeight - 60))
        list[at] = { key, x, y, w, h }
      },
      floatFocus: (d, owner, key) => {
        const list = d.floats?.[owner]
        if (list === undefined) return
        const at = list.findIndex(f => f.key === key)
        if (at >= 0 && at < list.length - 1) list.push(list.splice(at, 1)[0])
      },
      // 分叉后子会话继承父画布：页签行换 owner 克隆，布局/浮窗/焦点整树照搬。
      // 'start'/'chat' 是虚键不进 tabs，布局里的引用由 normLayout 保留。
      inheritOwner: (d, from, to) => {
        for (const row of d.tabs.filter(t => t.owner === from)) {
          d.tabs.push({ ...row, owner: to })
        }
        const layout = d.layout?.[from]
        if (layout !== undefined) d.layout[to] = structuredClone(layout)
        const floats = d.floats?.[from]
        if (floats !== undefined) (d.floats ??= {})[to] = floats.map(f => ({ ...f }))
        const focus = d.focus?.[from]
        if (focus !== undefined) d.focus[to] = focus
        const view = d.simView?.[from]
        if (view !== undefined) d.simView[to] = view
      },
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
/** 模拟器「返回界面」的会话行：模拟会话正常色，绑定会话标灰。 */
export interface SimRow {
  readonly id: SessionId
  readonly title: string
  readonly running: boolean
  /** 天生模拟会话（标题带 模- 前缀）或被用户在列表里点了「模拟」。 */
  readonly sim: boolean
}

/** 文档温层条目：'ready' 的 content 即乐观锁 base；缓存键见 {@link docKey}。 */
export interface DocEntry {
  readonly state: 'loading' | 'ready' | 'missing'
  readonly content?: string
}

/** 目录清单温层条目：一级目录条目；缓存键见 {@link dirKey}。 */
export interface DirEntry {
  readonly state: 'loading' | 'ready' | 'error'
  readonly entries: readonly { readonly name: string; readonly type: string }[]
}

/** 温层缓存键：会话 + 路径。键是字符串是为了让 Record 快照可持久、可浅比较。 */
export const docKey = (sessionId: SessionId, path: string): string => `${sessionId}|${path}`
export const dirKey = (sessionId: SessionId, path: string): string => `${sessionId}|${path}`

/** 页签状态点词汇：页体把实体态镜像上来，页签条只负责画。 */
export type TabFlag = 'working' | 'error' | 'unsaved'
export type TabFlags = Partial<Record<TabFlag, boolean>>
/** 状态键：owner 会话 + 页签 key（状态不随画布持久——瞬态态留在会话内温层）。 */
export const statusKey = (owner: SessionId, tabKey: string): string => `${owner}|${tabKey}`

/** 树的模块行是嵌套的——按 id 找名字（页签标题回写用）。 */
function findTreeModule(modules: readonly TreeModuleRow[], id: string): TreeModuleRow | undefined {
  for (const row of modules) {
    if (row.id === id) return row
    const child = findTreeModule(row.children, id)
    if (child !== undefined) return child
  }
  return undefined
}

/** 待落位的包：analyze 已过、用户在对话框里选落点期间的暂态。 */
export interface ImportPack {
  readonly name: string
  readonly report: ImportReport
}

export interface CanvasInjected {
  /** 这片画布属于哪段会话：标签按它切片，文档读写也走这个会话的工作区。 */
  readonly session: SessionId
  readonly hooks: {
    /** 当前项目（绑定会话的 cwd + 创作库标题）；无项目时空态禁写。 */
    readonly project: ObservableSnapshot<ProjectFocus | undefined>
    /** 内容树快照——起点页据此决定空态。 */
    readonly tree: ObservableSnapshot<NovenTree | undefined>
    /** 本会话正在被 AI 写的卡/模块；画布、页签与卡页共用这一份快照。 */
    readonly edits: ObservableSnapshot<AiEditsSnapshot>
    /** 会话可见消息流——作品页「手机」档的戏台复刻屏拿它当转录。 */
    readonly transcript: ObservableSnapshot<TranscriptState>
    /** 项目根下的会话清单（模拟器「返回界面」的数据源）。 */
    readonly sims: ObservableSnapshot<readonly SimRow[]>
    /** 模拟器当前会话的转录——跟随 simOpen 切换。 */
    readonly simTranscript: ObservableSnapshot<TranscriptState>
    /** 文档温层：按键 `docKey(sessionId, path)` 索引；退订不丢快照。 */
    readonly docs: ObservableSnapshot<Readonly<Record<string, DocEntry>>>
    /** 目录清单温层：按键 `dirKey(sessionId, path)` 索引。 */
    readonly dirs: ObservableSnapshot<Readonly<Record<string, DirEntry>>>
    /** 页签状态点表：按键 `statusKey(owner, tabKey)` 索引；不进画布持久态。 */
    readonly status: ObservableSnapshot<Readonly<Record<string, TabFlags>>>
    /** 导入暂态：analyze 出的包等落点选择；undefined = 没有待落位包。 */
    readonly importPack: ObservableSnapshot<ImportPack | undefined>
    /** 侧线会话温层：conv 页按会话 id 取自己的折叠态（挂窗/侧边对话共用）。 */
    readonly convs: ObservableSnapshot<ConvsMap>
  }
  /** 侧线会话事件源：首次 ensure 绑定折叠，channel 决定发送走 prompt 还是 sidechat.prompt。 */
  readonly ensureConv: (sessionId: SessionId, channel: ConvChannel) => void
  readonly sendConv: (sessionId: SessionId, text: string) => void
  /** 温层预取：条目缺位才拉；refresh* 无视缓存重拉、旧快照留到响应到达。 */
  readonly ensureDoc: (sessionId: SessionId, path: string) => void
  readonly refreshDoc: (sessionId: SessionId, path: string) => void
  readonly ensureDir: (sessionId: SessionId, path: string) => void
  readonly refreshDir: (sessionId: SessionId, path: string) => void
  /** 页体汇报状态点：owner 已在注入侧绑好，页只给页签 key + 旗标开关。 */
  readonly setStatus: (tabKey: string, flag: TabFlag, on: boolean) => void
  /** 散文件写面：原地改名（回新路径）/删除；宿主连带收换被改名文件的页签。 */
  readonly renameFile: (path: string, name: string) => Promise<string | undefined>
  readonly deleteFile: (path: string) => Promise<boolean>
  /** 模拟器动作面：会话生命周期与发送都落真实 Session 服务。 */
  readonly sim: {
    /** 建一条 模- 会话（真实 session，cwd=项目根）。 */
    readonly create: () => Promise<SessionId | undefined>
    readonly rename: (sessionId: SessionId, title: string) => Promise<void>
    /** 删除对话 = 宿主归档通道。 */
    readonly archive: (sessionId: SessionId) => Promise<void>
    /** 发送进指定会话（可拼每轮注入/文风 parts）。 */
    readonly ask: (sessionId: SessionId, parts: readonly { readonly type: 'text'; readonly text: string }[]) => Promise<void>
    readonly models: () => Promise<ModelCatalog | undefined>
    readonly selectModel: (sessionId: SessionId, sel: ModelSelection) => Promise<boolean>
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
  /** Reapply the official IDE panel arrangement without creating content. */
  readonly applyLayoutSeed: () => void
  /** 新建面板提交：宿主决定落到哪条路由。 */
  readonly submitCreate: (request: CreateRequest) => void
  /** 导入卡包文件（隐藏 input 的 onChange 直达）：analyze 后单卡直通、包/文件进对话框。 */
  readonly importCard: (file: File) => void
  /** 导入对话框提交：按所选落点落位；成功返回 true 并清暂态。 */
  readonly commitImport: (target: string) => Promise<boolean>
  /** 导入对话框取消：丢掉暂态（文件未落位）。 */
  readonly cancelImport: () => void
  /** 「采用到世界卡」的卡目录：列本工作区全部活卡。 */
  readonly listCards: (sessionId: SessionId) => Promise<readonly { cardId: string; name: string }[]>
  /** 文件嵌入模块：moduleId 为 null 时在卡根以文件名新建模块（与树行「放入模块」同一链路）。 */
  readonly embedFile: (cardId: string, moduleId: string | null, path: string) => void
  /** 画布全屏：帧级呈现状态，导航/抽屉/对话列让位，画布盖住整个窗口。 */
  readonly setCanvasFullscreen: (on: boolean) => void
}

type CanvasProps = PropsRuntime<'sidebar.right.pane.tab'> & PropsLocale<'novenShell'> & PropsStore<ReturnType<typeof createCanvasStore>> & InjectFace<CanvasInjected>

/** 文档温层选择器——tab 体通过注入 hooks.docs 拿到的 hook 类型。 */
export type DocsHook = CanvasProps['useDocs']

/**
 * 案头 — the IDE start page. Two sections: 预设 (prepared work: the two
 * prefilled card kinds and the built-in manual) and 开始 (a blank document
 * in one tab). Everything here lands with one click: no dialog stands
 * between the desk and the work.
 */
function StartTab({ t, empty, noProject, onPreset, onStart }: {
  readonly t: ShellT
  readonly empty: boolean
  readonly noProject: boolean
  readonly onPreset: (preset: 'world' | 'character' | 'manual') => void
  readonly onStart: (kind: 'doc' | 'world' | 'character' | 'timeline' | 'map' | 'collection') => void
}) {
  return (
    <div className="nv-desk">
      <div className="nv-desk-inner">
        <p className="nv-desk-lead">{t('canvas.desk.lead')}</p>
        {noProject && <p className="nv-desk-note">{t('canvas.desk.noProject')}</p>}
        <section className="nv-desk-section">
          <h3 className="nv-desk-label">{t('canvas.desk.preset')}</h3>
          <div className="nv-desk-row">
            <button type="button" className="nv-desk-tile" onClick={() => onPreset('world')}>
              <span className="nv-desk-glyph">{glyph.globe(20)}</span>
              <span className="nv-desk-name">{t('canvas.desk.world')}</span>
              <span className="nv-desk-sub">{t('canvas.desk.world.sub')}</span>
            </button>
            <button type="button" className="nv-desk-tile" onClick={() => onPreset('character')}>
              <span className="nv-desk-glyph">{glyph.user(20)}</span>
              <span className="nv-desk-name">{t('canvas.desk.character')}</span>
              <span className="nv-desk-sub">{t('canvas.desk.character.sub')}</span>
            </button>
            <button type="button" className="nv-desk-tile" onClick={() => onPreset('manual')}>
              <span className="nv-desk-glyph">{glyph.file(20)}</span>
              <span className="nv-desk-name">{t('canvas.desk.manual')}</span>
              <span className="nv-desk-sub">{t('canvas.desk.manual.sub')}</span>
            </button>
          </div>
        </section>
        <section className="nv-desk-section">
          <h3 className="nv-desk-label">{t('canvas.desk.start')}</h3>
          <div className="nv-desk-row">
            <button type="button" className="nv-desk-tile" onClick={() => onStart('doc')}>
              <span className="nv-desk-glyph">{glyph.file(20)}</span>
              <span className="nv-desk-name">{t('canvas.desk.doc')}</span>
              <span className="nv-desk-sub">{t('canvas.desk.doc.sub')}</span>
            </button>
            <button type="button" className="nv-desk-tile" onClick={() => onStart('world')}>
              <span className="nv-desk-glyph">{glyph.globe(20)}</span>
              <span className="nv-desk-name">{t('canvas.desk.blankworld')}</span>
              <span className="nv-desk-sub">{t('canvas.desk.blankworld.sub')}</span>
            </button>
            <button type="button" className="nv-desk-tile" onClick={() => onStart('character')}>
              <span className="nv-desk-glyph">{glyph.user(20)}</span>
              <span className="nv-desk-name">{t('canvas.desk.blankcharacter')}</span>
              <span className="nv-desk-sub">{t('canvas.desk.blankcharacter.sub')}</span>
            </button>
            <button type="button" className="nv-desk-tile" onClick={() => onStart('timeline')}>
              <span className="nv-desk-glyph">{glyph.clock(20)}</span>
              <span className="nv-desk-name">{t('canvas.desk.timeline')}</span>
              <span className="nv-desk-sub">{t('canvas.desk.timeline.sub')}</span>
            </button>
            <button type="button" className="nv-desk-tile" onClick={() => onStart('map')}>
              <span className="nv-desk-glyph">{glyph.map(20)}</span>
              <span className="nv-desk-name">{t('canvas.desk.map')}</span>
              <span className="nv-desk-sub">{t('canvas.desk.map.sub')}</span>
            </button>
            <button type="button" className="nv-desk-tile" onClick={() => onStart('collection')}>
              <span className="nv-desk-glyph">{glyph.grid(20)}</span>
              <span className="nv-desk-name">{t('canvas.desk.collection')}</span>
              <span className="nv-desk-sub">{t('canvas.desk.collection.sub')}</span>
            </button>
          </div>
        </section>
        {empty && <p className="nv-desk-empty">{t('canvas.desk.empty')}</p>}
      </div>
    </div>
  )
}

/** 手册页签：内置说明书（noven-docs 的只读 Markdown），不是文稿、不可编辑。 */
function ManualTab({ tab, t }: { readonly tab: CanvasTab; readonly t: ShellT }) {
  const [doc, setDoc] = useState<{ readonly title: string; readonly content: string } | undefined>(undefined)
  const [failed, setFailed] = useState(false)
  useEffect(() => {
    setFailed(false)
    void fetch(new URL(`api/noven-docs?slug=${encodeURIComponent(tab.slug ?? 'getting-started')}`, document.baseURI).href)
      .then(response => response.ok ? response.json() as Promise<{ title: string; content: string }> : Promise.reject(new Error(String(response.status))))
      .then(setDoc)
      .catch(() => { setFailed(true) })
  }, [tab.slug])
  const labels = useMemo<MdLabels>(() => ({
    code: {
      copyLabel: t('editor.md.copy'),
      copiedLabel: t('editor.md.copied'),
      toolbarLabels: { codeLabel: t('editor.md.code'), wrapLabel: t('editor.md.wrap'), unwrapLabel: t('editor.md.unwrap') },
    },
    footnotes: '',
  }), [t])
  return (
    <div className="nv-manual">
      {failed && <div className="nv-manual-note">{t('canvas.manual.failed')}</div>}
      {!failed && doc === undefined && <div className="nv-manual-note">{t('canvas.manual.loading')}</div>}
      {doc !== undefined && <MarkdownText text={doc.content} labels={labels} />}
    </div>
  )
}

/**
 * 卡体：卡页（设定总览 + 分页模块）。
 */
function CardTab({ tab, t, loadCard, op, ask, seedComposer, readFile, resolveProjectAsset, onOpenFile, onOpenCard, close, consumeAddModule }: {
  readonly tab: CanvasTab
  readonly t: ShellT
  readonly loadCard: CanvasInjected['loadCard']
  readonly op: CanvasInjected['cardOp']
  readonly ask: CanvasInjected['ask']
  readonly seedComposer: (text: string) => void
  /** 读项目内文件文本（html 活引用 / markdown 文件链接）。 */
  readonly readFile: (path: string) => Promise<string | undefined>
  /** 读项目内任意文件字节（自由模块的 glb/纹理/音频/JSON）。 */
  readonly resolveProjectAsset: (path: string, base?: string) => Promise<Blob | null>
  readonly onOpenFile: (path: string) => void
  /** noven:// 深链跨卡跳页：同地址（同项目）开/换 card 页签。 */
  readonly onOpenCard: (cardId: string, moduleId?: string) => void
  readonly close: () => void
  /** 清掉标签上的 addModule 信号（一次性）。 */
  readonly consumeAddModule: () => void
}) {
  // 每个页签自己的开库信号序号：页签体复用、addModule 清掉后，下一次＋仍能+1。
  const [autoSignals, setAutoSignals] = useState<Record<string, number>>({})
  useEffect(() => {
    if (tab.addModule !== true) return
    setAutoSignals(current => ({ ...current, [tab.key]: (current[tab.key] ?? 0) + 1 }))
    consumeAddModule()
  }, [tab.key, tab.addModule, consumeAddModule])
  const autoLibrary = autoSignals[tab.key] ?? 0
  const addr: CardAddr = tab.cardAddr ?? {}
  if (tab.cardId === undefined) return null
  return (
    <div className="nv-canvas-cardbody">
      <CardPage
        addr={addr}
        cardId={tab.cardId}
        pageModuleId={tab.moduleId}
        owner={tab.owner}
        autoLibrary={autoLibrary}
        scrollKey={`${tab.owner}|${tab.key}`}
        t={t}
        loadCard={loadCard}
        op={op}
        ask={ask}
        seedComposer={seedComposer}
        readFile={readFile}
        resolveProjectAsset={resolveProjectAsset}
        onOpenFile={onOpenFile}
        onOpenCard={onOpenCard}
      />
    </div>
  )
}

/** 文稿体：通用编辑器 + /api/noven-doc 乐观锁保存；内容走温层——重挂先渲缓存不闪 loading。 */
function DocTab({ tab, t, sessionId, useDocs, ensureDoc, saveDoc, setStatus, renameFile, deleteFile }: {
  readonly tab: CanvasTab
  readonly t: ShellT
  readonly sessionId: SessionId
  readonly useDocs: CanvasProps['useDocs']
  readonly ensureDoc: CanvasInjected['ensureDoc']
  readonly saveDoc: CanvasInjected['saveDoc']
  readonly setStatus: CanvasInjected['setStatus']
  readonly renameFile: CanvasInjected['renameFile']
  readonly deleteFile: CanvasInjected['deleteFile']
}) {
  const path = tab.path ?? ''
  const [menuOpen, setMenuOpen] = useState(false)
  const [renaming, setRenaming] = useState(false)
  const [outline, setOutline] = useState<readonly OutlineItem[]>([])
  const [activeHeading, setActiveHeading] = useState<string | undefined>(undefined)
  const [marks, setMarks] = useState<readonly OutlineMark[]>([])
  const [liveCount, setLiveCount] = useState<number | undefined>(undefined)
  const [panelOpen, setPanelOpen] = useState(false)
  const [pinned, setPinned] = useState(false)
  const [panelOffset, setPanelOffset] = useState<{ x: number, y: number }>({ x: 0, y: 0 })
  const dragRef = useRef<{ px: number, py: number, ox: number, oy: number } | null>(null)
  const justDragged = useRef(false)
  const [panelW, setPanelW] = useState<number>(() => {
    const raw = Number(window.localStorage.getItem(PANEL_W_KEY))
    return Number.isFinite(raw) && raw >= 220 && raw <= 600 ? raw : 300
  })
  const [panelH, setPanelH] = useState<number | undefined>(() => {
    const raw = Number(window.localStorage.getItem(PANEL_H_KEY))
    return Number.isFinite(raw) && raw >= 200 ? raw : undefined
  })
  useEffect(() => { window.localStorage.setItem(PANEL_W_KEY, String(panelW)) }, [panelW])
  useEffect(() => {
    if (panelH !== undefined) window.localStorage.setItem(PANEL_H_KEY, String(panelH))
  }, [panelH])
  const closeTimer = useRef<number | undefined>(undefined)
  const [zoom, setZoom] = useState<number>(() => {
    try {
      const raw = Number(window.localStorage.getItem(DOC_ZOOM_KEY))
      return Number.isFinite(raw) && raw >= 0.5 && raw <= 2 ? raw : 1
    } catch { return 1 }
  })
  useEffect(() => { window.localStorage.setItem(DOC_ZOOM_KEY, String(zoom)) }, [zoom])
  const arm = useArmedMenu(useMemo(() => [{ id: 'delete', confirmLabel: t('ui.armed.delete') }], [t]))
  const entry = useDocs(s => s[docKey(sessionId, path)])
  useEffect(() => { ensureDoc(sessionId, path) }, [sessionId, path, ensureDoc])
  // 挂载即清上一任留下的旗标——本页自己产的状态点由本页续写。
  useEffect(() => { setStatus(tab.key, 'working', false); setStatus(tab.key, 'error', false) }, [tab.key, setStatus])
  useEffect(() => () => {
    if (closeTimer.current !== undefined) window.clearTimeout(closeTimer.current)
  }, [])
  useEffect(() => {
    if (!RICH_TEXT_PATH.test(path)) return
    const onShortcut = (event: KeyboardEvent): void => {
      if (event.key.toLowerCase() !== 'o' || !event.shiftKey || !(event.metaKey || event.ctrlKey)) return
      event.preventDefault()
      togglePanel()
    }
    window.addEventListener('keydown', onShortcut)
    return () => { window.removeEventListener('keydown', onShortcut) }
  })
  useEffect(() => {
    if (!panelOpen) return
    const onKey = (event: KeyboardEvent): void => {
      if (event.key !== 'Escape') return
      setPinned(false)
      setPanelOpen(false)
    }
    const onDown = (event: PointerEvent): void => {
      if (pinned) return
      const target = event.target
      if (!(target instanceof Element)) return
      if (target.closest('.nv-doc-panel') !== null || target.closest('.nv-doc-rail') !== null) return
      setPanelOpen(false)
    }
    window.addEventListener('keydown', onKey)
    document.addEventListener('pointerdown', onDown)
    return () => {
      window.removeEventListener('keydown', onKey)
      document.removeEventListener('pointerdown', onDown)
    }
  }, [panelOpen, pinned])
  const state = entry === undefined || entry.state === 'loading' ? 'loading' : entry.state
  const base = entry?.content
  const saveText = useCallback(async (text: string): Promise<'ok' | 'conflict' | 'error'> => {
    // 注入的 saveDoc 在 'ok' 时把新内容写回温层——base 的推进由缓存承担。
    setStatus(tab.key, 'working', true)
    const result = await saveDoc(sessionId, path, text, base ?? null)
    setStatus(tab.key, 'working', false)
    setStatus(tab.key, 'error', result !== 'ok')
    return result
  }, [sessionId, saveDoc, path, base, tab.key, setStatus])
  if (state === 'missing' || base === undefined) {
    return <div className="nv-canvas-missing">{t(state === 'missing' ? 'canvas.doc.missing' : 'canvas.files.loading')}</div>
  }
  // 标题只显示名字（不带扩展名）；改名回写时保留原扩展名。
  const fileName = path.split('/').pop() ?? path
  const extension = /\.(md|markdown|mdx|txt)$/i.exec(path)?.[0] ?? ''
  const name = extension === '' ? fileName : fileName.slice(0, -extension.length)
  const jumpToHeading = (id: string): void => {
    const element = document.querySelector(`.nv-doc-bn .bn-block[data-id="${CSS.escape(id)}"]`)
    element?.scrollIntoView({ block: 'start', behavior: 'smooth' })
  }
  // 面板改尺寸：左缘改宽、下缘改高、右下角同时改；窗口级监听，尺寸持久化。
  const startPanelResize = (axis: 'x' | 'y' | 'xy') => (event: React.PointerEvent<HTMLSpanElement>): void => {
    event.preventDefault()
    event.stopPropagation()
    const panelElement = event.currentTarget.closest('.nv-doc-panel')
    const host = event.currentTarget.closest('.nv-ed')?.getBoundingClientRect()
    const start = {
      px: event.clientX, py: event.clientY,
      w: panelW,
      h: panelElement?.getBoundingClientRect().height ?? 400,
    }
    const move = (moveEvent: PointerEvent): void => {
      if (axis !== 'y') setPanelW(Math.min(600, Math.max(220, start.w + (start.px - moveEvent.clientX))))
      if (axis !== 'x') {
        const maxH = Math.max(200, (host?.height ?? 700) - 108)
        setPanelH(Math.min(maxH, Math.max(200, start.h + (moveEvent.clientY - start.py))))
      }
    }
    const up = (): void => {
      window.removeEventListener('pointermove', move)
      window.removeEventListener('pointerup', up)
      justDragged.current = true
      if (closeTimer.current !== undefined) { window.clearTimeout(closeTimer.current); closeTimer.current = undefined }
    }
    window.addEventListener('pointermove', move)
    window.addEventListener('pointerup', up)
  }
  // 面板拖动：窗口级监听（指针移出面板也能跟手）；松手后不自动收起（用户刚拖过它）。
  const startPanelDrag = (event: React.PointerEvent<HTMLDivElement>): void => {
    if (!(event.target instanceof Element) || event.target.closest('.nv-doc-panel-pin') !== null) return
    event.preventDefault()
    const host = event.currentTarget.closest('.nv-ed')?.getBoundingClientRect()
    const start = { px: event.clientX, py: event.clientY, ox: panelOffset.x, oy: panelOffset.y }
    dragRef.current = start
    const move = (moveEvent: PointerEvent): void => {
      const minX = -(host?.width ?? 800) + 340
      const minY = -(host?.height ?? 600) + 180
      setPanelOffset({
        x: Math.min(0, Math.max(minX, start.ox + moveEvent.clientX - start.px)),
        y: Math.min(400, Math.max(minY, start.oy + moveEvent.clientY - start.py)),
      })
    }
    const up = (): void => {
      window.removeEventListener('pointermove', move)
      window.removeEventListener('pointerup', up)
      dragRef.current = null
      justDragged.current = true
      if (closeTimer.current !== undefined) { window.clearTimeout(closeTimer.current); closeTimer.current = undefined }
    }
    window.addEventListener('pointermove', move)
    window.addEventListener('pointerup', up)
  }
  const openPanel = (): void => {
    if (closeTimer.current !== undefined) { window.clearTimeout(closeTimer.current); closeTimer.current = undefined }
    justDragged.current = false
    setPanelOpen(true)
  }
  /** 显式开关（按钮/快捷键/点击刻度）：开就钉住，再触发就收起。 */
  const togglePanel = (): void => {
    if (panelOpen) {
      setPanelOpen(false)
      setPinned(false)
    } else {
      justDragged.current = false
      setPinned(true)
      setPanelOpen(true)
    }
  }
  const scheduleClose = (): void => {
    if (pinned || dragRef.current !== null || justDragged.current || closeTimer.current !== undefined) return
    closeTimer.current = window.setTimeout(() => {
      closeTimer.current = undefined
      setPanelOpen(false)
    }, 300)
  }
  return (
    <div className={RICH_TEXT_PATH.test(path) ? 'nv-ed nv-ed-doc' : 'nv-ed'}>
      <div className="nv-ed-main">
      <header className="nv-ed-head">
        {renaming ? (
          <InlineRename className="nv-ed-title nv-ed-titlein" value={name}
            onDone={next => {
              setRenaming(false)
              if (next === undefined) return
              const trimmed = next.trim()
              if (trimmed === '' || trimmed === name) return
              const base = extension !== '' && trimmed.toLowerCase().endsWith(extension.toLowerCase())
                ? trimmed.slice(0, -extension.length) : trimmed
              void renameFile(path, `${base}${extension}`)
            }} />
        ) : (
          <h1 className="nv-ed-title" title={t('canvas.doc.rename')}
            onClick={() => setRenaming(true)}>{name}</h1>
        )}
        <div className="nv-ed-meta">{metaOf([
          t('tree.docs'),
          fmt(t, 'editor.wordcount', { count: liveCount ?? wordCount(base) }),
          zoom === 1 ? undefined : `${String(Math.round(zoom * 100))}%`,
        ])}</div>
        <Menu portal open={menuOpen} side="bottom" align="end" selection="fill" listClassName="nv-tree-newmenu"
          onClose={() => { arm.reset(); setMenuOpen(false) }}
          onSelect={id => {
            if (arm.select(id) === 'armed') return
            setMenuOpen(false)
            if (id === 'rename') setRenaming(true)
            if (id === 'delete') {
              void deleteFile(path).then(ok => { notifyUndo({ text: fmt(t, ok ? 'ui.receipt.fileDeleted' : 'ui.receipt.failed', { name }) }) })
            }
          }}
          items={arm.decorate([
            { id: 'rename', label: t('canvas.doc.rename') },
            { id: 'delete', label: t('canvas.doc.delete'), danger: true },
          ])}
          anchor={(
            <button type="button" className="nv-ed-more" aria-label={t('canvas.doc.more')}
              onClick={() => setMenuOpen(v => !v)}>⋯</button>
          )} />
        {RICH_TEXT_PATH.test(path) && (
          <button type="button" className={`nv-ed-outline-btn${panelOpen ? ' on' : ''}`}
            title={`${t('canvas.outline')} · ⌘/Ctrl+Shift+O`}
            aria-pressed={panelOpen} onClick={togglePanel}>
            {t('canvas.outline')}
          </button>
        )}
      </header>
      {RICH_TEXT_PATH.test(path)
        ? <BlockNoteDocEditor markdown={base} onChange={text => { void saveText(text) }}
            onOutline={setOutline} onActive={setActiveHeading} onWordCount={setLiveCount} onMarks={setMarks}
            zoom={zoom} onZoom={setZoom} />
        : <PlainTextDocEditor text={base} onChange={text => { void saveText(text) }} />}
      </div>
      {RICH_TEXT_PATH.test(path) && (
        <>
          {/* 常驻：右缘刻度（位置标尺，不占布局、只标位置） */}
          <div className="nv-doc-rail" aria-hidden="true"
            onPointerEnter={openPanel} onPointerLeave={scheduleClose} onClick={togglePanel}>
            {marks.map(mark => (
              <span key={mark.id}
                className={`nv-doc-rail-mark${mark.id === activeHeading ? ' nv-doc-rail-mark-on' : ''}`}
                style={{ top: `${Math.round(mark.top * 1000) / 10}%` }} />
            ))}
          </div>
          {/* 唤出：大纲面板 */}
          <div className={`nv-doc-panel${panelOpen ? ' nv-doc-panel-open' : ''}`}
            style={{
              width: panelW,
              ...(panelH === undefined ? {} : { height: panelH, bottom: 'auto' as const }),
              ...(panelOpen ? { transform: `translate(${String(panelOffset.x)}px, ${String(panelOffset.y)}px)` } : {}),
            }}
            onPointerEnter={openPanel} onPointerLeave={scheduleClose}>
            <span className="nv-doc-resize nv-doc-resize-l" onPointerDown={startPanelResize('x')} />
            <span className="nv-doc-resize nv-doc-resize-b" onPointerDown={startPanelResize('y')} />
            <span className="nv-doc-resize nv-doc-resize-c" onPointerDown={startPanelResize('xy')} />
            <div className="nv-doc-panel-head" onPointerDown={startPanelDrag}>
              <span className="nv-doc-panel-title">{t('canvas.outline')}</span>
              <button type="button" className={`nv-doc-panel-pin${pinned ? ' nv-doc-panel-pin-on' : ''}`}
                title={t('canvas.outline.pin')} aria-pressed={pinned}
                onClick={() => { setPinned(v => !v); if (!pinned) setPanelOpen(true) }}>
                {glyph.pin(13)}
              </button>
            </div>
            {outline.length === 0 && <div className="nv-doc-panel-empty">{t('canvas.outline.empty')}</div>}
            {outline.map(item => (
              <button key={item.id} type="button"
                className={`nv-doc-panel-item${item.id === activeHeading ? ' nv-doc-panel-item-on' : ''}`}
                data-level={Math.min(item.level, 3)} title={item.text}
                onClick={() => { jumpToHeading(item.id) }}>
                {item.text}
              </button>
            ))}
          </div>
        </>
      )}
    </div>
  )
}

/** 岛→壳的一次出站调用记录（戏台壳调试盘的一行）。 */
interface StageCall {
  readonly at: number
  readonly kind: 'query' | 'compose' | 'send' | 'ready'
  readonly text: string
}

/** 选元素回包：prelude 回报的展示标签与定位选择器。 */
interface PickedEl {
  readonly label: string
  readonly sel: string
}

/** 戏台壳底排页签：戏台=岛出站调试盘；源码/文件/版本沿用设计稿 Studio 底排。 */
type WorkPane = 'stage' | 'source' | 'files' | 'versions'

const escapeRe = (s: string): string => s.replace(/[.*+?^${}()|[\]\\]/gu, '\\$&')

/**
 * 作品体：Studio 产物两档预览。「桌面」档是 /api/noven-frame 的原始
 * 画框；「手机」档是手机会话页复刻——作品文件当「当前舞台」挂进
 * PhoneStage 的消息区，转录接真会话事件流，输入栏真发 prompt，
 * novex-def/use/html 围栏在消息里就地成岛。契约帧的
 * state/archive/assets 由同目录 `<页面名>.stage.json` 播种；
 * 「推新帧」重读作品与档案重演「宿主写档案→推帧」闭环。
 * 底排是设计稿 Studio 的 戏台/源码/文件/版本 页签，版本按
 * `名字.vN.<ext>` 同目录约定认；「采用到世界卡」走树的 embed_file
 * 同一条链路（卡根新建 html 模块）。
 */
/**
 * 会话页签体：手机 ChatScreen 的网页镜像——顶栏、消息流（novex 件就地投影）、
 * 舞台切换、底部输入栏真发本会话 prompt。没有「当前作品文件」；舞台只从
 * 消息流里的 fullscreen use 块长出来，和手机侧一致。
 */
/** 机型档位：常用手机宽 + 平板宽；高跟随容器，内部一律自适应。 */
const SIM_SIZES = [
  { key: 'p360', w: 360, h: 780 },
  { key: 'p390', w: 390, h: 844 },
  { key: 'p430', w: 430, h: 932 },
  { key: 't768', w: 768, h: 1024 },
  { key: 't834', w: 834, h: 1194 },
  { key: 't1024', w: 1024, h: 768 },
] as const

/**
 * 会话页签 = 手机模拟器：给项目根下的真实会话套手机渲染。
 * 返回界面列模拟会话 + 绑定会话（标灰，悬停出「模拟」/红「取消」）；
 * 设置与会话设置页签共用 `.noven/session/<id>.json`（见 session-settings.tsx），
 * 发送时把每轮注入/文风拼进 prompt parts。
 */
function ChatTab({ t, sessionId, useStore, actions, useSims, useSimTranscript, useProject, sim, saveDoc, useDocs, ensureDoc, useDirs, ensureDir, refreshDir }: {
  readonly t: ShellT
  readonly sessionId: SessionId
  readonly useStore: CanvasProps['useStore']
  readonly actions: CanvasProps['actions']
  readonly useSims: CanvasProps['useSims']
  readonly useSimTranscript: CanvasProps['useSimTranscript']
  readonly useProject: CanvasProps['useProject']
  readonly sim: CanvasInjected['sim']
  readonly saveDoc: CanvasInjected['saveDoc']
  readonly useDocs: CanvasProps['useDocs']
  readonly ensureDoc: CanvasInjected['ensureDoc']
  readonly useDirs: CanvasProps['useDirs']
  readonly ensureDir: CanvasInjected['ensureDir']
  readonly refreshDir: CanvasInjected['refreshDir']
}) {
  const project = useProject(v => v)
  const root = project?.root
  const sims = useSims(v => v)
  const transcript = useSimTranscript(v => v)
  const openId = useStore(s => root === undefined ? undefined : s.simOpen[root])
  const sizeKey = useStore(s => s.simSize)
  // 整棵替换式持久化不补新字段——老快照没有 simIme/simWebview，读时兜底。
  const imeOn = useStore(s => s.simIme === true)
  const wvMode = useStore(s => s.simWebview ?? 'baseline')
  // 视图态在画布 store（按 owner 会话持久）；undefined = 自动（开着上次会话进聊天，否则落列表）
  const route = useStore(s => s.simView[sessionId])
  const setRoute = useCallback((v: 'chat' | 'list' | 'settings' | 'records'): void => {
    actions.simViewSet(sessionId, v)
  }, [actions, sessionId])
  const [menuOpen, setMenuOpen] = useState(false)
  const [renaming, setRenaming] = useState(false)
  const [draftTitle, setDraftTitle] = useState('')
  const simArm = useArmedMenu(useMemo(() => [{ id: 'delete', confirmLabel: t('ui.armed.delete') }], [t]))
  const [models, setModels] = useState<ModelCatalog | undefined>(undefined)
  const [modelsOpen, setModelsOpen] = useState(false)

  const openRow = sims.find(r => r.id === openId)
  // 选中的会话没了（被归档）→ 落回列表
  const view: 'chat' | 'list' | 'settings' | 'records' =
    route === undefined
      ? (openRow !== undefined ? 'chat' : 'list')
      : (route !== 'list' && openRow === undefined ? 'list' : route)

  const size = SIM_SIZES.find(s => s.key === sizeKey) ?? SIM_SIZES[1]

  // 设置走会话设置统一读写（文档温层 + 旧 sim 文件迁移）；remount 时表单不闪空。
  const { settings, save: saveSettings } = useSessionSettings(openId, useDocs, ensureDoc, saveDoc)

  // 资料与存档：.noven 目录清单走目录温层，进 records 屏时先渲缓存再重拉。
  const recordsEntry = useDirs(s => openId === undefined ? undefined : s[dirKey(openId, '.noven')])
  useEffect(() => {
    if (view === 'records' && openId !== undefined) refreshDir(openId, '.noven')
  }, [view, openId, refreshDir])
  const files = recordsEntry?.state === 'ready' ? recordsEntry.entries : undefined

  /** 沙箱岛拿不到会话 Cookie——资产字节由壳代取为 blob；基目录即工作区根。 */
  const resolveAsset = useCallback((relPath: string, base?: string): Promise<Blob | null> => {
    const sid = openId ?? sessionId
    const ap = new URLSearchParams({ session: sid, path: relPath })
    if (base !== undefined && base !== '') ap.set('base', base)
    return fetch(new URL(`api/noven-frame?${ap.toString()}`, document.baseURI).href)
      .then(r => (r.ok ? r.blob() : null))
      .catch(() => null)
  }, [openId, sessionId])

  const frameBase = useMemo<IslandFrame>(() => {
    const cs = getComputedStyle(document.documentElement)
    return {
      session: openId ?? sessionId,
      base: '',
      env: buildEnv({ sizeKey, imeOn, webview: wvMode }),
      theme: {
        dark: false,
        accent: cs.getPropertyValue('--nv-accent').trim(),
        text: cs.getPropertyValue('--nv-primary-text').trim(),
        surface: cs.getPropertyValue('--nv-surface').trim(),
      },
    }
  }, [openId, sessionId, sizeKey, imeOn, wvMode])

  const openSession = useCallback((id: SessionId) => {
    if (root !== undefined) actions.simOpenSet(root, id)
    setRoute('chat')
  }, [root, actions])

  const sendTo = useCallback(async (text: string): Promise<FrameSendResult | undefined> => {
    if (openId === undefined) return
    const parts: { type: 'text'; text: string }[] = [{ type: 'text', text }]
    if (settings.perTurn.trim() !== '') parts.push({ type: 'text', text: `[每轮注入]\n${settings.perTurn}` })
    if (settings.style.trim() !== '') parts.push({ type: 'text', text: `[文风]\n${settings.style}` })
    await sim.ask(openId, parts)
  }, [openId, settings.perTurn, settings.style, sim])

  const exportPack = useCallback(() => {
    if (openRow === undefined) return
    const pack = {
      title: openRow.title,
      sessionId: openRow.id,
      exportedAt: new Date().toISOString(),
      messages: transcript.messages,
      settings,
    }
    const blob = new Blob([JSON.stringify(pack, null, 2)], { type: 'application/json' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `${openRow.title}.noven-pack.json`
    a.click()
    URL.revokeObjectURL(url)
  }, [openRow, transcript.messages, settings])



  const device = (
    <div className="nv-stage-device" style={{ width: `min(${size.w}px, 100%)`, height: `min(${size.h}px, 100%)` }}>
      {view === 'chat' && openRow !== undefined && (
        <PhoneStage t={t} title={openRow.title} frameBase={frameBase}
          transcript={transcript.messages} busy={transcript.busy} ask={sendTo}
          resolveAsset={resolveAsset}
          onBack={() => setRoute('list')}
          topActions={(
            <>
              <Menu portal open={modelsOpen} side="bottom" align="end" selection="fill"
                onClose={() => setModelsOpen(false)}
                onSelect={id => {
                  setModelsOpen(false)
                  const [provider, model] = id.split('::')
                  if (openId !== undefined && provider !== undefined && model !== undefined) {
                    void sim.selectModel(openId, { provider, model })
                  }
                }}
                items={models?.groups.flatMap(g => g.models.map(m => ({
                  id: `${g.id}::${m.id}`,
                  label: `${g.name} · ${m.name}`,
                }))) ?? []}
                anchor={(
                  <button type="button" className="nv-ptop-btn" aria-label={t('sim.model')}
                    onClick={() => {
                      if (models === undefined) void sim.models().then(m => { setModels(m); setModelsOpen(true) })
                      else setModelsOpen(v => !v)
                    }}>⌁</button>
                )} />
              <Menu portal open={menuOpen} side="bottom" align="end" selection="fill" listClassName="nv-menu-pop"
                onClose={() => { simArm.reset(); setMenuOpen(false) }}
                onSelect={id => {
                  if (simArm.select(id) === 'armed') return
                  setMenuOpen(false)
                  if (id === 'history') setRoute('list')
                  if (id === 'settings') setRoute('settings')
                  if (id === 'records') setRoute('records')
                  if (id === 'export') exportPack()
                  if (id === 'rename' && openRow !== undefined) { setDraftTitle(openRow.title); setRenaming(true) }
                  if (id === 'delete' && openRow !== undefined) {
                    const title = openRow.title
                    void sim.archive(openRow.id).then(() => { notifyUndo({ text: fmt(t, 'ui.receipt.simDeleted', { name: title }) }) })
                    if (root !== undefined) actions.simOpenSet(root, undefined)
                    setRoute('list')
                  }
                }}
                items={simArm.decorate([
                  { id: 'history', label: t('sim.menu.history') },
                  { id: 'settings', label: t('sim.menu.settings') },
                  { id: 'records', label: t('sim.menu.records') },
                  { id: 'export', label: t('sim.menu.export') },
                  { id: 'rename', label: t('sim.menu.rename') },
                  { id: 'delete', label: t('sim.menu.delete'), danger: true },
                ])}
                anchor={(
                  <button type="button" className="nv-ptop-btn" aria-label={t('sim.menu.more')}
                    onClick={() => setMenuOpen(v => !v)}>⋯</button>
                )} />
            </>
          )} />
      )}
      {view === 'list' && (
        <div className="nv-simlist">
          <div className="nv-simlist-head">
            <span className="nv-simlist-title">{t('sim.list.title')}</span>
            <button type="button" className="nv-simlist-new"
              onClick={() => { void sim.create().then(id => { if (id !== undefined) setRoute('chat') }) }}>
              {t('sim.list.new')}
            </button>
          </div>
          <div className="nv-simlist-body">
            {sims.length === 0 && <div className="nv-simlist-empty">{t('sim.list.empty')}</div>}
            {sims.map(row => (
              <div key={row.id} className={`nv-simrow${row.sim ? '' : ' nv-simrow-dim'}`}>
                <button type="button" className="nv-simrow-main" onClick={() => openSession(row.id)}>
                  {row.running && <span className="nv-simrow-dot" />}
                  <span className="nv-simrow-name">{row.title}</span>
                </button>
                {row.sim ? (
                  row.title.startsWith('模-') ? null : (
                    <button type="button" className="nv-simrow-act nv-simrow-cancel"
                      onClick={() => root !== undefined && actions.simPickToggle(root, row.id)}>
                      {t('sim.list.unsim')}
                    </button>
                  )
                ) : (
                  <button type="button" className="nv-simrow-act"
                    onClick={() => root !== undefined && actions.simPickToggle(root, row.id)}>
                    {t('sim.list.sim')}
                  </button>
                )}
              </div>
            ))}
          </div>
        </div>
      )}
      {view === 'settings' && openRow !== undefined && (
        <div className="nv-simset">
          <div className="nv-simset-head">
            <button type="button" className="nv-ptop-btn" onClick={() => setRoute('chat')}>‹</button>
            <span className="nv-simlist-title">{t('sim.set.title')}</span>
          </div>
          <div className="nv-simset-body">
            {renaming ? (
              <label className="nv-simset-field">
                <span>{t('sim.set.name')}</span>
                <input value={draftTitle} autoFocus
                  onChange={e => setDraftTitle(e.target.value)}
                  onBlur={() => { setRenaming(false); if (draftTitle.trim() !== '') void sim.rename(openRow.id, draftTitle.trim()) }}
                  onKeyDown={e => { if (e.key === 'Enter') (e.target as HTMLInputElement).blur(); if (e.key === 'Escape') setRenaming(false) }} />
              </label>
            ) : null}
            {([
              ['answerIdentity', 'sim.set.answer'],
              ['myIdentity', 'sim.set.mine'],
              ['prompt', 'sim.set.prompt'],
              ['background', 'sim.set.background'],
              ['perTurn', 'sim.set.perTurn'],
              ['style', 'sim.set.style'],
            ] as const).map(([key, label]) => (
              <label key={key} className="nv-simset-field">
                <span>{t(label)}</span>
                <textarea rows={2} value={settings[key]}
                  onChange={e => saveSettings({ ...settings, [key]: e.target.value })} />
              </label>
            ))}
            <div className="nv-simset-hint">{t('sim.set.hint')}</div>
          </div>
        </div>
      )}
      {view === 'records' && openRow !== undefined && (
        <div className="nv-simset">
          <div className="nv-simset-head">
            <button type="button" className="nv-ptop-btn" onClick={() => setRoute('chat')}>‹</button>
            <span className="nv-simlist-title">{t('sim.rec.title')}</span>
          </div>
          <div className="nv-simset-body">
            {files === undefined && <div className="nv-simlist-empty">{t('work.loading')}</div>}
            {files?.map(f => (
              <div key={f.name} className="nv-simrow-main nv-simrec-row">
                <span className="nv-canvas-fileicon">{f.type === 'directory' ? '▸' : '·'}</span>
                <span className="nv-simrow-name">{f.name}</span>
              </div>
            ))}
          </div>
        </div>
      )}
      {imeOn && (
        <div className="nv-simime" style={{ height: SIM_IME[size.key] ?? SIM_IME.p390 }}>
          {t('sim.env.imeBlock')}
        </div>
      )}
    </div>
  )

  return (
    <div className="nv-stage-wrap">
      <div className="nv-sim-sizes">
        {SIM_SIZES.map(s => (
          <button key={s.key} type="button"
            className={`nv-sim-size${s.key === size.key ? ' nv-sim-size-on' : ''}`}
            onClick={() => actions.simSizeSet(s.key)}>
            {s.key.startsWith('t') ? `${t('sim.size.pad')} ${s.w}` : s.w}
          </button>
        ))}
        <button type="button" className="nv-sim-size" aria-pressed={imeOn}
          onClick={() => actions.simImeSet(!imeOn)}>{t('sim.env.ime')}</button>
        <button type="button" className="nv-sim-size" aria-pressed={wvMode === 'real'}
          onClick={() => actions.simWebviewSet(wvMode === 'real' ? 'baseline' : 'real')}>
          {fmt(t, 'sim.env.webview', { v: wvMode === 'real' ? realWebview() : WEBVIEW_BASELINE })}
        </button>
      </div>
      <div className="nv-stage-scroll">{device}</div>
    </div>
  )
}

/**
 * 图片作品的画框体：默认整图适应窗口（contain，不拉伸）；滚轮以光标为锚
 * 缩放、缩放态可拖拽平移、双击在「适应 ↔ 原大」间切换。右下控件条给出
 * −/比例/＋/1:1。
 */
function ImageStage({ src, alt, t }: { readonly src: string; readonly alt: string; readonly t: ShellT }) {
  const boxRef = useRef<HTMLDivElement>(null)
  const natural = useRef({ w: 0, h: 0 })
  const dragRef = useRef<{ px: number; py: number; x: number; y: number } | null>(null)
  /** null = 适应窗口（纯 CSS contain，尺寸交给布局）；否则显式比例 + 平移。 */
  const [view, setView] = useState<{ readonly factor: number; readonly x: number; readonly y: number } | null>(null)

  /** 适应档下图片的显示比例——滚轮从这起步，第一滚不跳变。 */
  const fitFactor = useCallback((): number => {
    const box = boxRef.current
    const n = natural.current
    if (box === null || n.w === 0) return 1
    return Math.min(box.clientWidth / n.w, box.clientHeight / n.h)
  }, [])

  const zoomAt = useCallback((cx: number, cy: number, step: number): void => {
    setView(v => {
      const oldF = v?.factor ?? fitFactor()
      const factor = Math.min(8, Math.max(0.02, oldF * step))
      const k = factor / oldF
      const x = v?.x ?? 0
      const y = v?.y ?? 0
      return { factor, x: cx - (cx - x) * k, y: cy - (cy - y) * k }
    })
  }, [fitFactor])

  const zoomStep = useCallback((step: number): void => {
    const box = boxRef.current
    zoomAt(box === null ? 0 : box.clientWidth / 2, box === null ? 0 : box.clientHeight / 2, step)
  }, [zoomAt])

  return (
    <div ref={boxRef} className={`nv-imgview${view !== null ? ' nv-imgview-zoom' : ''}`}
      onWheel={e => {
        const rect = boxRef.current?.getBoundingClientRect()
        if (rect === undefined) return
        zoomAt(e.clientX - rect.left - rect.width / 2, e.clientY - rect.top - rect.height / 2,
          Math.exp(-e.deltaY * 0.0015))
      }}
      onPointerDown={e => {
        if (view === null) return
        dragRef.current = { px: e.clientX, py: e.clientY, x: view.x, y: view.y }
        e.currentTarget.setPointerCapture(e.pointerId)
      }}
      onPointerMove={e => {
        const d = dragRef.current
        if (d === null) return
        setView(v => v === null ? v : { ...v, x: d.x + e.clientX - d.px, y: d.y + e.clientY - d.py })
      }}
      onPointerUp={() => { dragRef.current = null }}
      onPointerCancel={() => { dragRef.current = null }}
      onDoubleClick={() => setView(v => v === null ? { factor: 1, x: 0, y: 0 } : null)}>
      <img src={src} alt={alt} draggable={false}
        onLoad={e => { natural.current = { w: e.currentTarget.naturalWidth, h: e.currentTarget.naturalHeight } }}
        style={view === null ? undefined : {
          width: natural.current.w * view.factor, maxWidth: 'none', maxHeight: 'none',
          transform: `translate(${view.x}px, ${view.y}px)`,
        }} />
      <div className="nv-imgview-ctl" onPointerDown={e => e.stopPropagation()} onDoubleClick={e => e.stopPropagation()}>
        <button type="button" aria-label={t('work.img.zoomOut')} onClick={() => zoomStep(0.8)}>−</button>
        <button type="button" className="nv-imgview-pct" title={t('work.img.fit')} onClick={() => setView(null)}>
          {view === null ? t('work.img.fit') : `${String(Math.round(view.factor * 100))}%`}
        </button>
        <button type="button" aria-label={t('work.img.zoomIn')} onClick={() => zoomStep(1.25)}>＋</button>
        <button type="button" title={t('work.img.actual')} onClick={() => setView({ factor: 1, x: 0, y: 0 })}>1:1</button>
      </div>
    </div>
  )
}

function WorkTab({ tab, t, sessionId, openDoc, embedFile, listCards, useSimTranscript, sim, simSession, useStore, actions, useDocs, ensureDoc, refreshDoc, useDirs, ensureDir, refreshDir, setStatus }: {
  readonly tab: CanvasTab
  readonly t: ShellT
  readonly sessionId: SessionId
  readonly openDoc: (path: string, title: string) => void
  readonly embedFile: CanvasInjected['embedFile']
  readonly listCards: CanvasInjected['listCards']
  /** 戏台转录订阅（手机档）——绑 simOpen 的模拟器会话，普通会话不进帧。 */
  readonly useSimTranscript: CanvasProps['useSimTranscript']
  readonly sim: CanvasInjected['sim']
  /** simOpen[root] 选中的模拟器会话；undefined = 本项目没开模拟器。 */
  readonly simSession: SessionId | undefined
  readonly useStore: CanvasProps['useStore']
  readonly actions: CanvasProps['actions']
  readonly useDocs: CanvasProps['useDocs']
  readonly ensureDoc: CanvasInjected['ensureDoc']
  readonly refreshDoc: CanvasInjected['refreshDoc']
  readonly useDirs: CanvasProps['useDirs']
  readonly ensureDir: CanvasInjected['ensureDir']
  readonly refreshDir: CanvasInjected['refreshDir']
  readonly setStatus: CanvasInjected['setStatus']
}) {
  const transcript = useSimTranscript(v => v)
  /** 戏台会话 = simOpen 选中的模拟器会话；没开模拟器时回退画布会话（与 chat 页签同语义）。 */
  const stageSession = simSession ?? sessionId
  /** 岛/输入栏发送进模拟器会话；未开模拟器时丢回收据，不往普通会话塞消息。 */
  const simAsk = useCallback(async (text: string): Promise<FrameSendResult | undefined> => {
    if (simSession === undefined) return { result: 'dropped', why: null }
    await sim.ask(simSession, [{ type: 'text', text }])
    return undefined
  }, [simSession, sim])
  // 整棵替换式持久化不补新字段——老快照没有 simIme/simWebview，读时兜底。
  const imeOn = useStore(s => s.simIme === true)
  const wvMode = useStore(s => s.simWebview ?? 'baseline')
  const sizeKey = useStore(s => s.simSize)
  const size = SIM_SIZES.find(s => s.key === sizeKey) ?? SIM_SIZES[1]
  const [device, setDevice] = useState<'desktop' | 'phone'>('desktop')
  const [pane, setPane] = useState<WorkPane>('stage')
  const [calls, setCalls] = useState<readonly StageCall[]>([])
  const [note, setNote] = useState('')
  const [picking, setPicking] = useState(false)
  const [picked, setPicked] = useState<PickedEl | null>(null)
  const [verOpen, setVerOpen] = useState(false)
  const [ver, setVer] = useState<string | null>(null)
  const [adoptOpen, setAdoptOpen] = useState(false)
  const [adoptCards, setAdoptCards] = useState<readonly { cardId: string; name: string }[] | undefined>(undefined)
  const [repushing, setRepushing] = useState(false)
  const [stageData, setStageData] = useState<Record<string, unknown>>({})

  const path = tab.path ?? ''
  const dir = path.includes('/') ? path.slice(0, path.lastIndexOf('/')) : ''
  const fileName = path.split('/').pop() ?? path
  const stem = fileName.replace(/\.[^./]+$/u, '')
  const ext = fileName.slice(stem.length)
  const isImage = IMAGE_WORK_EXTS.has(ext.toLowerCase())
  const servedPath = ver === null ? path : (dir === '' ? ver : `${dir}/${ver}`)
  const stagePath = servedPath.replace(/\.[^./]+$/u, '') + '.stage.json'

  const src = new URL(`api/noven-frame?${new URLSearchParams({ session: sessionId, path: servedPath }).toString()}`, document.baseURI).href

  // 手机档的岛源与契约档案走文档温层——切走再回先渲缓存，不闪空岛。
  const htmlEntry = useDocs(s => s[docKey(sessionId, servedPath)])
  const stageEntry = useDocs(s => s[docKey(sessionId, stagePath)])
  const dirEntry = useDirs(s => s[dirKey(sessionId, dir)])
  const islandHtml = htmlEntry?.state === 'ready' ? htmlEntry.content : undefined
  const source = htmlEntry?.state === 'ready' ? htmlEntry.content : undefined
  useEffect(() => {
    // 图片作品不走文本温层——二进制拉成字符串只会得到乱码岛源。
    if (!isImage) {
      ensureDoc(sessionId, servedPath)
      ensureDoc(sessionId, stagePath)
    }
  }, [sessionId, servedPath, stagePath, isImage, ensureDoc])
  useEffect(() => {
    if (stageEntry === undefined || stageEntry.state === 'loading') return
    if (stageEntry.state !== 'ready' || stageEntry.content === undefined) {
      setStageData({})
      if (repushing) { setNote(fmt(t, 'work.stage.noJson', { path: stagePath })); setRepushing(false) }
      return
    }
    try {
      setStageData(JSON.parse(stageEntry.content) as Record<string, unknown>)
      if (repushing) { setNote(t('work.stage.pushed')); setRepushing(false) }
    }
    catch (parseErr) { setNote(t('work.stage.badJson')); void parseErr; setRepushing(false) }
  }, [stageEntry, repushing, t, stagePath])

  /** 沙箱岛没有会话 Cookie——资产字节由壳代取并以 blob 回投。 */
  const resolveAsset = useCallback((relPath: string, base?: string): Promise<Blob | null> => {
    const ap = new URLSearchParams({ session: stageSession, path: relPath })
    const b = base ?? dir
    if (b !== undefined && b !== '') ap.set('base', b)
    return fetch(new URL(`api/noven-frame?${ap.toString()}`, document.baseURI).href)
      .then(r => (r.ok ? r.blob() : null))
      .catch(() => null)
  }, [stageSession, dir])

  // B6：档案真相源 = 模拟器会话日志里的 novex-use 增量，.stage.json 只当种子；
  // 普通会话消息不进帧。transcript.messages 带原始 assistant 文本（围栏未剥）；
  // fork 分支隔离由事件流天然提供——兄弟分支的增量根本不进模拟器会话绑定。
  const deltas = useMemo(() => collectDeltas(transcript.messages), [transcript.messages])
  const folded = useMemo(() => foldArchive(stageData, deltas), [stageData, deltas])

  /** 契约帧的非消息部分：档案播种 + 壳侧主题（岛据此对齐产品色）。 */
  const frameBase = useMemo<IslandFrame>(() => {
    const cs = getComputedStyle(document.documentElement)
    const cardRaw = stageData.card
    const card = cardRaw !== null && typeof cardRaw === 'object' && !Array.isArray(cardRaw)
      ? cardRaw as { readonly name?: string; readonly kind?: string }
      : { name: stem, kind: 'stage' }
    return {
      card,
      session: stageSession,
      base: dir,
      env: buildEnv({ sizeKey, imeOn, webview: wvMode }),
      state: folded.state,
      ...(stageData.max !== undefined ? { max: stageData.max as Record<string, unknown> } : {}),
      archive: folded.archive,
      deltas: deltas.slice(-DELTA_WINDOW),
      ...(stageData.assets !== undefined ? { assets: stageData.assets as Record<string, string> } : {}),
      theme: {
        dark: false,
        accent: cs.getPropertyValue('--nv-accent').trim(),
        text: cs.getPropertyValue('--nv-primary-text').trim(),
        surface: cs.getPropertyValue('--nv-surface').trim(),
      },
    }
  }, [stageData, folded, deltas, stem, stageSession, dir, sizeKey, imeOn, wvMode])

  /** 岛→壳出站：query 落调试盘、picked 落到选中 chip；compose 已被 PhoneStage 消化。 */
  const handleCall = useCallback((call: IslandCall): void => {
    if (call.kind === 'query') {
      const from = call.from === undefined ? '' : ` ← ${call.from}`
      setCalls(cs => [...cs.slice(-19), { at: Date.now(), kind: 'query', text: `${call.domain ?? ''}/${call.id ?? ''}${from}` }])
    } else if (call.kind === 'send' || call.kind === 'ready') {
      // 浏览器版 send 不做手势门控（E2）——每次都记调试盘，note 是回执结果。
      const text = `${call.text ?? ''}${call.note !== undefined ? ` → ${call.note}` : ''}`
      setCalls(cs => [...cs.slice(-19), { at: Date.now(), kind: call.kind as 'send' | 'ready', text }])
    } else if (call.kind === 'picked') {
      setPicking(false)
      setPicked({ label: call.label ?? '', sel: call.sel ?? '' })
    }
  }, [])

  /** 重读作品与档案：强制重拉两路温层——条目到达时由 stageEntry effect 落 note。 */
  const repush = useCallback((): void => {
    setRepushing(true)
    refreshDoc(sessionId, servedPath)
    refreshDoc(sessionId, stagePath)
  }, [refreshDoc, sessionId, servedPath, stagePath])

  // 页签状态点：推帧在跑 → working；卸载时清掉（推完与否以温层为准）。
  useEffect(() => {
    if (!repushing) return
    setStatus(tab.key, 'working', true)
    return () => setStatus(tab.key, 'working', false)
  }, [repushing, tab.key, setStatus])

  /** 选元素开关：PhoneStage 把它打到舞台岛的捕获层上。 */
  const togglePick = useCallback((): void => { setPicking(v => !v) }, [])

  const switchDevice = useCallback((next: 'desktop' | 'phone'): void => {
    setDevice(next)
    if (next === 'desktop') { setPicking(false); setPicked(null) }
  }, [])

  /** 版本按同目录 `名字.vN.<ext>` 约定认；版本页签与顶栏下拉共用目录温层派生。 */
  const vers = useMemo(() => {
    if (dirEntry?.state !== 'ready') return undefined
    const re = new RegExp(`^${escapeRe(stem)}\\.v\\d+${escapeRe(ext)}$`, 'u')
    return dirEntry.entries.filter(e => e.type === 'file' && re.test(e.name)).map(e => e.name).sort()
  }, [dirEntry, stem, ext])
  const loadVersions = useCallback((): void => { refreshDir(sessionId, dir) }, [refreshDir, sessionId, dir])
  const siblings = dirEntry?.state === 'ready' ? dirEntry.entries : undefined

  const openPane = useCallback((next: WorkPane): void => {
    setPane(next)
    if (next === 'source' && !isImage) ensureDoc(sessionId, servedPath)
    if (next === 'files' || next === 'versions') loadVersions()
  }, [ensureDoc, sessionId, servedPath, loadVersions])

  const openAdopt = (): void => {
    setAdoptOpen(v => !v)
    if (adoptCards === undefined) void listCards(sessionId).then(setAdoptCards).catch(() => setAdoptCards([]))
  }

  const frame = (
    // 桌面档保留同源画框——资产直连与 fetch 改写都要会话 Cookie。
    <iframe className="nv-canvas-workframe" src={src} title={tab.title} />
  )
  /** 图片作品没有戏台/源码面—— pane 落回「文件」。 */
  const paneNow: WorkPane = isImage && (pane === 'stage' || pane === 'source') ? 'files' : pane
  return (
    <div className="nv-work">
      <div className="nv-work-bar">
        <div className="nv-seg">
          <button type="button" className={device === 'desktop' ? 'nv-seg-on' : ''}
            onClick={() => switchDevice('desktop')}>{t('work.device.desktop')}</button>
          <button type="button" className={device === 'phone' ? 'nv-seg-on' : ''}
            onClick={() => switchDevice('phone')}>{t('work.device.phone')}</button>
        </div>
        <Menu portal open={verOpen} side="bottom" align="start" selection="check" selectedId={ver ?? 'current'}
          onClose={() => setVerOpen(false)}
          onSelect={id => { setVerOpen(false); setVer(id === 'current' ? null : id) }}
          items={[
            { id: 'current', label: t('work.ver.current') },
            ...(vers ?? []).map(name => ({ id: name, label: name })),
          ]}
          anchor={(
            <button type="button" className="nv-work-ver"
              onClick={() => { setVerOpen(v => !v); if (vers === undefined) loadVersions() }}>
              {ver ?? t('work.ver.current')} ⌄
            </button>
          )} />
        {picked !== null && (
          <span className="nv-work-picked">
            {fmt(t, 'work.stage.picked', { label: picked.label })}
            <button type="button" className="nv-work-pickedx" aria-label="×"
              onClick={() => setPicked(null)}>×</button>
          </span>
        )}
        <span className="nv-work-barspace" />
        {device === 'phone' && !isImage && (
          <button type="button" className={`nv-stage-push${picking ? ' nv-stage-picking' : ''}`}
            onClick={togglePick}>{t('work.stage.pick')}</button>
        )}
        {device === 'phone' && !isImage && (
          <button type="button" className="nv-stage-push" onClick={repush}>{t('work.stage.push')}</button>
        )}
        {device === 'phone' && !isImage && (
          <button type="button" className="nv-stage-push" aria-pressed={imeOn}
            onClick={() => actions.simImeSet(!imeOn)}>{t('sim.env.ime')}</button>
        )}
        {device === 'phone' && !isImage && (
          <button type="button" className="nv-stage-push" aria-pressed={wvMode === 'real'}
            onClick={() => actions.simWebviewSet(wvMode === 'real' ? 'baseline' : 'real')}>
            {fmt(t, 'sim.env.webview', { v: wvMode === 'real' ? realWebview() : WEBVIEW_BASELINE })}
          </button>
        )}
        <Menu portal open={adoptOpen} side="bottom" align="end" selection="fill"
          onClose={() => setAdoptOpen(false)}
          onSelect={id => {
            setAdoptOpen(false)
            const card = adoptCards?.find(c => c.cardId === id)
            if (card === undefined) return
            embedFile(card.cardId, null, servedPath)
            setNote(fmt(t, 'work.adopt.done', { name: card.name }))
          }}
          items={adoptCards === undefined
            ? [{ id: 'none', label: t('work.loading'), disabled: true }]
            : adoptCards.length === 0
              ? [{ id: 'none', label: t('work.adopt.empty'), disabled: true }]
              : adoptCards.map(card => ({ id: card.cardId, label: card.name }))}
          anchor={(
            <button type="button" className="nv-work-adopt" onClick={openAdopt}>{t('work.adopt')}</button>
          )} />
      </div>
      {device === 'desktop' ? (isImage ? <ImageStage src={src} alt={fileName} t={t} /> : frame) : (
        <div className="nv-stage-wrap">
          <div className="nv-stage-scroll">
            <div className="nv-stage-device" style={{ width: `min(${size.w}px, 100%)`, height: `min(${size.h}px, 100%)` }}>
              {isImage ? (
                <div className="nv-imgview nv-imgview-phone">
                  <img src={src} alt={fileName} draggable={false} />
                </div>
              ) : (
                <PhoneStage t={t} title={stem} islandHtml={stageEntry !== undefined && stageEntry.state !== 'loading' ? islandHtml : undefined} frameBase={frameBase}
                  transcript={transcript.messages} busy={transcript.busy} ask={simAsk}
                  resolveAsset={resolveAsset} onCall={handleCall} picking={picking} />
              )}
              {!isImage && imeOn && (
                <div className="nv-simime" style={{ height: SIM_IME[sizeKey] ?? SIM_IME.p390 }}>
                  {t('sim.env.imeBlock')}
                </div>
              )}
            </div>
          </div>
        </div>
      )}
      <div className="nv-work-panes">
        <div className="nv-work-panetabs" role="tablist">
          {(['stage', 'source', 'files', 'versions'] as const).filter(p => !isImage || (p !== 'stage' && p !== 'source')).map(p => (
            <button key={p} type="button" role="tab" aria-selected={paneNow === p}
              className={`nv-work-panetab${paneNow === p ? ' nv-work-panetab-on' : ''}`}
              onClick={() => openPane(p)}>{t(`work.tabs.${p}`)}</button>
          ))}
        </div>
        <div className="nv-work-panebody">
          {paneNow === 'stage' && (
            <>
              <div className="nv-stage-hint">{fmt(t, 'work.stage.archive', { path: stagePath })}</div>
              {calls.length === 0 && <div className="nv-stage-call nv-stage-emptyrow">{t('work.stage.empty')}</div>}
              {calls.map((call, index) => (
                <div key={index} className="nv-stage-call">
                  <span className={`nv-stage-kind nv-stage-kind-${call.kind}`}>
                    {t(`work.stage.${call.kind}`)}
                  </span>
                  <span className="nv-stage-text">{call.text}</span>
                  {call.kind === 'compose' && (
                    <button type="button" className="nv-stage-copy"
                      onClick={() => { void navigator.clipboard.writeText(call.text) }}>{t('work.stage.copy')}</button>
                  )}
                </div>
              ))}
            </>
          )}
          {paneNow === 'source' && (
            source === undefined
              ? <div className="nv-stage-call nv-stage-emptyrow">{t('work.loading')}</div>
              : <pre className="nv-work-source">{source}</pre>
          )}
          {paneNow === 'files' && (
            siblings === undefined
              ? <div className="nv-stage-call nv-stage-emptyrow">{t('work.loading')}</div>
              : siblings.length === 0
                ? <div className="nv-stage-call nv-stage-emptyrow">{t('work.files.empty')}</div>
                : siblings.map(entry => (
                  <button key={entry.name} type="button" className="nv-canvas-filerow"
                    onClick={() => { if (entry.type === 'file') openDoc(dir === '' ? entry.name : `${dir}/${entry.name}`, entry.name) }}>
                    <span className="nv-canvas-fileicon">{entry.type === 'directory' ? '▸' : '·'}</span>
                    <span>{entry.name}</span>
                  </button>
                ))
          )}
          {paneNow === 'versions' && (
            vers === undefined
              ? <div className="nv-stage-call nv-stage-emptyrow">{t('work.loading')}</div>
              : vers.length === 0
                ? <div className="nv-stage-call nv-stage-emptyrow">{fmt(t, 'work.versions.empty', { stem, ext })}</div>
                : [{ name: 'current', label: `${fileName} — ${t('work.ver.current')}` },
                    ...vers.map(name => ({ name, label: name }))].map(row => (
                  <button key={row.name} type="button"
                    className={`nv-canvas-filerow${(ver ?? 'current') === row.name ? ' nv-work-ver-on' : ''}`}
                    onClick={() => setVer(row.name === 'current' ? null : row.name)}>
                    <span className="nv-canvas-fileicon">·</span>
                    <span>{row.label}</span>
                  </button>
                ))
          )}
          {note !== '' && <div className="nv-stage-note">{note}</div>}
        </div>
      </div>
    </div>
  )
}

/** 素材与文件体：项目根的一层列表（温层源）；文稿目录行点进 doc 体。 */
function FilesTab({ t, sessionId, useDirs, refreshDir, openDoc }: {
  readonly t: ShellT
  readonly sessionId: SessionId
  readonly useDirs: CanvasProps['useDirs']
  readonly refreshDir: CanvasInjected['refreshDir']
  readonly openDoc: (path: string, title: string) => void
}) {
  const entry = useDirs(s => s[dirKey(sessionId, '')])
  // 挂载即重拉：先渲缓存快照，目录成员变了再静悄悄换单。
  useEffect(() => { refreshDir(sessionId, '') }, [sessionId, refreshDir])
  const entries = entry?.state === 'ready' ? entry.entries : undefined
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

/** 单页签的渲染体：哪个叶的活动页是它，就由哪片叶渲——同 key 可以在两片叶各渲一份（双视口）。 */
function TabBody({ tab, t, session, useStore, actions, props, openDoc, readCardFile, resolveProjectAsset, importRef, project, tree }: {
  readonly tab: CanvasTab
  readonly t: ShellT
  readonly session: SessionId
  readonly useStore: CanvasProps['useStore']
  readonly actions: CanvasProps['actions']
  readonly props: CanvasProps
  readonly openDoc: (path: string, title: string) => void
  readonly readCardFile: (path: string) => Promise<string | undefined>
  readonly resolveProjectAsset: (path: string, base?: string) => Promise<Blob | null>
  readonly importRef: React.RefObject<HTMLInputElement | null>
  readonly project: ProjectFocus | undefined
  readonly tree: NovenTree | undefined
}) {
  const closeTab = useCallback(() => actions.close(session, tab.key), [actions, session, tab.key])
  // 树「＋」开的卡带 addModule 信号——卡页消费一次即清，不留在持久态。
  const consumeAddModule = useCallback(() => actions.open({ ...tab, addModule: undefined }), [actions, tab])
  /** 本项目 simOpen 绑定的模拟器会话——作品页签的戏台数据源。 */
  const simOpenId = useStore(s => project === undefined ? undefined : s.simOpen[project.root])
  const composerDraft = props.useInput(state => state.draft)
  const seedComposer = useCallback((text: string) => {
    const existing = composerDraft.trimEnd()
    props.inputActions.setDraft(existing === '' ? text : `${existing}\n\n${text}`)
    window.requestAnimationFrame(() => {
      document.querySelector<HTMLElement>('[data-composer-seat] [contenteditable="true"]')?.focus()
    })
  }, [composerDraft, props.inputActions])
  return (
    <>
      {tab.kind === 'chat' && (
        <ChatTab t={t} sessionId={session} useStore={useStore} actions={actions}
          useSims={props.useSims} useSimTranscript={props.useSimTranscript} useProject={props.useProject}
          sim={props.sim} saveDoc={props.saveDoc}
          useDocs={props.useDocs} ensureDoc={props.ensureDoc} useDirs={props.useDirs}
          ensureDir={props.ensureDir} refreshDir={props.refreshDir} />
      )}
      {tab.kind === 'start' && (
        <StartTab t={t} noProject={project === undefined}
          empty={(tree?.cards.length ?? 0) === 0 && (tree?.docs.length ?? 0) === 0 && (tree?.works.length ?? 0) === 0}
          onPreset={preset => {
            if (preset === 'manual') {
              actions.open({
                key: 'manual:getting-started', kind: 'manual', title: t('canvas.desk.manual'),
                owner: session, slug: 'getting-started',
              })
              return
            }
            props.submitCreate({
              kind: preset,
              name: preset === 'world' ? t('canvas.desk.world.name') : t('canvas.desk.character.name'),
              starter: `template:${preset}`,
            })
          }}
          onStart={kind => {
            if (kind === 'doc') {
              // 单页签直接落一张空白文稿；重名自动编号，绝不覆盖已有文稿。
              const base = t('canvas.desk.doc.name')
              const taken = new Set((tree?.docs ?? []).map(row => row.path))
              let name = base
              for (let index = 2; taken.has(`文稿/${name}.md`); index += 1) name = `${base} ${index}`
              props.submitCreate({ kind: 'doc', name, starter: 'blank' })
              return
            }
            // 空白卡：不带骨架从零填；单模块卡：带一个专用模块并直开该模块页。
            const names = {
              world: t('canvas.desk.world.name'), character: t('canvas.desk.character.name'),
              timeline: t('canvas.desk.timeline.name'), map: t('canvas.desk.map.name'),
              collection: t('canvas.desk.collection.name'),
            } as const
            const blank = kind === 'world' || kind === 'character'
            props.submitCreate({
              kind: kind === 'character' ? 'character' : 'world',
              name: names[kind],
              starter: blank ? 'blank' : `template:${kind}`,
            })
          }} />
      )}
      {tab.kind === 'card' && (
        <CardTab tab={tab} t={t} loadCard={props.loadCard} op={props.cardOp} ask={props.ask} seedComposer={seedComposer}
          readFile={readCardFile} resolveProjectAsset={resolveProjectAsset}
          onOpenFile={path => openDoc(path, path.split('/').pop() ?? path)}
          onOpenCard={(cardId, moduleId) => actions.open({
            key: moduleId === undefined ? `card:${cardId}` : `mod:${cardId}:${moduleId}`,
            kind: 'card', title: '', owner: session, cardId,
            cardAddr: tab.cardAddr, moduleId,
            presentation: moduleId === undefined ? 'inline' : 'page',
          })}
          close={closeTab} consumeAddModule={consumeAddModule} />
      )}
      {tab.kind === 'doc' && (
        <DocTab key={tab.key} tab={tab} t={t} sessionId={session}
          useDocs={props.useDocs} ensureDoc={props.ensureDoc} saveDoc={props.saveDoc}
          setStatus={props.setStatus} renameFile={props.renameFile} deleteFile={props.deleteFile} />
      )}
      {tab.kind === 'files' && (
        <FilesTab t={t} sessionId={session} useDirs={props.useDirs} refreshDir={props.refreshDir} openDoc={openDoc} />
      )}
      {tab.kind === 'work' && (
        <WorkTab tab={tab} t={t} sessionId={session}
          openDoc={openDoc} embedFile={props.embedFile} listCards={props.listCards}
          useSimTranscript={props.useSimTranscript} sim={props.sim} simSession={simOpenId}
          useStore={useStore} actions={actions}
          useDocs={props.useDocs} ensureDoc={props.ensureDoc} refreshDoc={props.refreshDoc}
          useDirs={props.useDirs} ensureDir={props.ensureDir} refreshDir={props.refreshDir}
          setStatus={props.setStatus} />
      )}
      {tab.kind === 'conv' && tab.convId !== undefined && (
        <ConvTab convId={tab.convId} channel={tab.convChannel ?? 'direct'} t={t} props={props} />
      )}
      {tab.kind === 'manual' && <ManualTab tab={tab} t={t} />}
    </>
  )
}

/** conv 页体薄壳：首次挂载绑事件源，之后只读温层。 */
function ConvTab({ convId, channel, t, props }: {
  readonly convId: SessionId
  readonly channel: ConvChannel
  readonly t: ShellT
  readonly props: CanvasProps
}) {
  const entry = props.useConvs(v => v[convId])
  useEffect(() => props.ensureConv(convId, channel), [convId, channel, props])
  const labels = useMemo<MarkdownLabels>(() => ({
    code: {
      copyLabel: t('conv.md.copy'), copiedLabel: t('conv.md.copied'),
      toolbarLabels: { codeLabel: t('conv.md.code'), wrapLabel: t('conv.md.wrap'), unwrapLabel: t('conv.md.unwrap') },
    },
    footnotes: '',
  }), [t])
  return (
    <ConvView entry={entry} labels={labels}
      send={text => props.sendConv(convId, text)}
      placeholder={t('conv.placeholder')} sendLabel={t('conv.send')} busyLabel={t('conv.busy')} />
  )
}

/** 拖放落区判定：按指针在叶内位置分四缘/中心。 */
function dropZone(e: React.DragEvent, el: HTMLElement): DropZone {
  const rect = el.getBoundingClientRect()
  const x = (e.clientX - rect.left) / Math.max(rect.width, 1)
  const y = (e.clientY - rect.top) / Math.max(rect.height, 1)
  if (x < 0.22) return 'left'
  if (x > 0.78) return 'right'
  if (y < 0.22) return 'top'
  if (y > 0.78) return 'bottom'
  return 'center'
}

/** 一片叶：页签条 + 活动页体 + 拖放落区（拖页签经过时显形）。 */
function LeafView({ leaf, focused, immersive = false, canvasFullscreen, toggleCanvasFullscreen, t, session, actions, props, tabByKey, project, tree, sims, statusMap, simOpenMap, openDoc, readCardFile, resolveProjectAsset, importRef, dragKey, setDragKey, dropSpot, setDropSpot }: {
  readonly leaf: CanvasLeaf
  readonly focused: boolean
  /** Module fullscreen: the page fills the canvas and the strip steps aside. */
  readonly immersive?: boolean
  readonly canvasFullscreen: boolean
  readonly toggleCanvasFullscreen: () => void
  readonly t: ShellT
  readonly session: SessionId
  readonly actions: CanvasProps['actions']
  readonly props: CanvasProps
  readonly tabByKey: ReadonlyMap<string, CanvasTab>
  readonly project: ProjectFocus | undefined
  readonly tree: NovenTree | undefined
  readonly sims: readonly SimRow[]
  readonly statusMap: Readonly<Record<string, TabFlags>>
  readonly simOpenMap: Readonly<Record<string, SessionId>>
  readonly openDoc: (path: string, title: string) => void
  readonly readCardFile: (path: string) => Promise<string | undefined>
  readonly resolveProjectAsset: (path: string, base?: string) => Promise<Blob | null>
  readonly importRef: React.RefObject<HTMLInputElement | null>
  readonly dragKey: string | undefined
  readonly setDragKey: (key: string | undefined) => void
  readonly dropSpot: { readonly leaf: string; readonly zone: DropZone } | undefined
  readonly setDropSpot: (spot: { readonly leaf: string; readonly zone: DropZone } | undefined) => void
}) {
  const studioOn = props.useStore(s => project !== undefined && s.studioOn?.[project.root] === true)
  const aiEdits = useAiEdits()
  const strip = useMemo(() => {
    // chat 页签就是 Studio 面：组关着时整条不出（持久叶里残留的 'chat' 一并滤掉）。
    const keys = [...(leaf.tabs.includes('start') ? [] : ['start']),
      ...(studioOn && !leaf.tabs.includes('chat') ? ['chat'] : []), ...leaf.tabs]
      .filter(key => studioOn || key !== 'chat')
    const seen = new Set<string>()
    return keys.filter(key => {
      if (seen.has(key)) return false
      seen.add(key)
      return true
    }).map(key => tabByKey.get(key) ?? (key === 'start' ? startTab(session) : key === 'chat' ? chatTab(session) : undefined))
      .filter((row): row is CanvasTab => row !== undefined)
  }, [leaf.tabs, tabByKey, session, studioOn])
  const activeTab = strip.find(row => row.key === leaf.active) ?? strip[0]
  const active = activeTab?.key ?? leaf.active ?? 'chat'
  const spotZone = dropSpot?.leaf === leaf.id ? dropSpot.zone : undefined
  return (
    <div className="nv-leaf"
      onMouseDownCapture={() => actions.focusLeaf(session, leaf.id)}>
      {!immersive && <div className="nv-canvas-strip" role="tablist" data-leaf={leaf.id}>
        {strip.map(row => {
          // 状态点两路汇合：页体上报的（statusMap）+ 页签条从实体源直推的
          // （chat=模拟会话在跑）——镜像实体态，页不发明状态。
          const flags = statusMap[statusKey(session, row.key)]
          const chatRunning = row.kind === 'chat' && project !== undefined
            && sims.find(r => r.id === simOpenMap[project.root])?.running === true
          const working = flags?.working === true || chatRunning
          const error = flags?.error === true
          const unsaved = flags?.unsaved === true
          const aiEditing = row.kind === 'card' && row.cardId !== undefined && aiEdits.cards.has(row.cardId)
          return (
          <div key={row.key} role="tab" aria-selected={row.key === active} aria-busy={aiEditing || undefined}
            className={`nv-canvas-tab${row.key === active ? ' nv-canvas-tab-on' : ''}${aiEditing ? ' nv-canvas-tab-ai' : ''}`}
            draggable
            onDragStart={e => { e.dataTransfer.setData('application/x-noven-tab', row.key); e.dataTransfer.effectAllowed = 'move'; setDragKey(row.key) }}
            onDragEnd={e => {
              setDragKey(undefined); setDropSpot(undefined)
              // 拖出画布无人接 = 撕成浮窗（前台工作面，不是挂后台）。虚拟页签不可撕。
              if (e.dataTransfer.dropEffect === 'none' && row.kind !== 'start' && row.kind !== 'chat') {
                actions.floatTab(session, row.key, e.clientX - 170, e.clientY - 16)
              }
            }}
            onClick={() => actions.select(session, row.key)}>
            <span className="nv-canvas-tabtitle">{tabTitle(row, t)}</span>
            {aiEditing && <span className="nv-ai-tag" title={t('ai.editing')}>{t('ai.tag')}</span>}
            <span className="nv-canvas-dots">
              {working && <span className="nv-canvas-dot nv-dot-working" title={t('canvas.dot.working')} />}
              {error && <span className="nv-canvas-dot nv-dot-error" title={t('canvas.dot.error')} />}
              {unsaved && <span className="nv-canvas-dot nv-dot-unsaved" title={t('canvas.dot.unsaved')} />}
            </span>
            {row.kind !== 'start' && row.kind !== 'chat' && (
              <button type="button" className="nv-canvas-tabx" aria-label={t('canvas.tab.close')}
                onClick={e => { e.stopPropagation(); actions.close(session, row.key) }}>×</button>
            )}
          </div>
          )
        })}
        <button type="button" className="nv-canvas-plus" aria-label={t('canvas.tab.new')}
          onClick={() => actions.open(startTab(session), leaf.id)}>+</button>
        <button type="button" className="nv-canvas-fullscreentoggle" data-active={canvasFullscreen || undefined}
          aria-label={t('canvas.fullscreen')} title={t('canvas.fullscreen')}
          onClick={toggleCanvasFullscreen}>{glyph.expand(13)}</button>
      </div>}
      <div className="nv-canvas-body">
        {activeTab !== undefined && (
          <TabBody tab={activeTab} t={t} session={session} useStore={props.useStore} actions={actions}
            props={props} openDoc={openDoc} readCardFile={readCardFile} resolveProjectAsset={resolveProjectAsset}
            importRef={importRef} project={project} tree={tree} />
        )}
      </div>
      {dragKey !== undefined && (
        <div className="nv-leaf-drop"
          onDragOver={e => { if (!e.dataTransfer.types.includes('application/x-noven-tab')) return; e.preventDefault(); e.dataTransfer.dropEffect = 'move'; setDropSpot({ leaf: leaf.id, zone: dropZone(e, e.currentTarget) }) }}
          onDrop={e => {
            const key = e.dataTransfer.getData('application/x-noven-tab')
            if (key === '') return
            e.preventDefault()
            const zone = dropZone(e, e.currentTarget)
            setDragKey(undefined); setDropSpot(undefined)
            actions.moveTab(session, key, leaf.id, zone)
          }}
          onDragLeave={e => { if (dropSpot?.leaf === leaf.id && !e.currentTarget.contains(e.relatedTarget as Node | null)) setDropSpot(undefined) }}>
          {spotZone !== undefined && <div className={`nv-leaf-hint nv-leaf-hint-${spotZone}`} />}
        </div>
      )}
    </div>
  )
}

/** 分割节点：两栏 + 可拖缝条。 */
function SplitView({ node, leafProps, actions, session }: {
  readonly node: CanvasSplit
  readonly leafProps: Omit<Parameters<typeof LeafView>[0], 'leaf' | 'focused'> & { readonly focusLeaf: string | undefined }
  readonly actions: CanvasProps['actions']
  readonly session: SessionId
}) {
  const render = (child: CanvasNode): React.ReactNode => isLeaf(child)
    ? <LeafView {...leafProps} leaf={child} focused={child.id === leafProps.focusLeaf} />
    : <SplitView node={child} leafProps={leafProps} actions={actions} session={session} />
  const grab = (e: React.PointerEvent<HTMLDivElement>): void => {
    e.preventDefault()
    const bar = e.currentTarget
    const box = bar.parentElement?.getBoundingClientRect()
    if (box === undefined) return
    const move = (ev: PointerEvent): void => {
      const ratio = node.dir === 'x' ? (ev.clientX - box.left) / box.width : (ev.clientY - box.top) / box.height
      actions.resize(session, node.id, Math.min(0.85, Math.max(0.15, ratio)))
    }
    const up = (): void => { window.removeEventListener('pointermove', move); window.removeEventListener('pointerup', up) }
    window.addEventListener('pointermove', move)
    window.addEventListener('pointerup', up)
  }
  return (
    <div className={`nv-split nv-split-${node.dir}`}>
      <div className="nv-split-cell" style={{ flex: `${node.ratio} 1 0` }}>{render(node.a)}</div>
      <div className="nv-split-bar" onPointerDown={grab} />
      <div className="nv-split-cell" style={{ flex: `${1 - node.ratio} 1 0` }}>{render(node.b)}</div>
    </div>
  )
}

/** 指针命中的页签条（浮窗拖拽的归宿判定）；条上 data-leaf 记着叶 id。 */
function stripAt(x: number, y: number): HTMLElement | undefined {
  const strips = document.querySelectorAll<HTMLElement>('.nv-canvas-strip')
  for (let i = 0; i < strips.length; i++) {
    const r = strips[i].getBoundingClientRect()
    if (x >= r.left && x <= r.right && y >= r.top && y <= r.bottom) return strips[i]
  }
  return undefined
}

/** 页签条公共标题口径：实体标题优先，虚拟页签走 locale。 */
function tabTitle(row: CanvasTab, t: ShellT): string {
  return row.title !== '' ? row.title
    : row.kind === 'chat' ? t('canvas.tab.chat')
      : row.kind === 'conv' ? t('canvas.tab.conv')
        : row.cardId ?? t('canvas.start.tab')
}

/**
 * 浮窗：撕下来的页签 = 前台工作面。头栏拖动即移动；拖到任何页签条上
 * 亮绿特效，松手归叶变回页签。右/下/角三向拉伸。
 */
function FloatFrame({ float, tab, t, session, actions, props, openDoc, readCardFile, resolveProjectAsset, importRef, project, tree }: {
  readonly float: FloatPage
  readonly tab: CanvasTab
  readonly t: ShellT
  readonly session: SessionId
  readonly actions: CanvasProps['actions']
  readonly props: CanvasProps
  readonly openDoc: (path: string, title: string) => void
  readonly readCardFile: (path: string) => Promise<string | undefined>
  readonly resolveProjectAsset: (path: string, base?: string) => Promise<Blob | null>
  readonly importRef: React.RefObject<HTMLInputElement | null>
  readonly project: ProjectFocus | undefined
  readonly tree: NovenTree | undefined
}) {
  const onHeadDown = (e: React.PointerEvent<HTMLDivElement>): void => {
    if ((e.target as HTMLElement).closest('.nv-float-x') !== null) return
    e.preventDefault()
    const sx = e.clientX, sy = e.clientY, ox = float.x, oy = float.y
    let strip: HTMLElement | undefined
    const move = (ev: PointerEvent): void => {
      actions.floatSet(session, float.key, { x: ox + ev.clientX - sx, y: oy + ev.clientY - sy })
      const hit = stripAt(ev.clientX, ev.clientY)
      if (hit !== strip) {
        strip?.removeAttribute('data-floatdrop')
        strip = hit
        strip?.setAttribute('data-floatdrop', '')
      }
    }
    const up = (ev: PointerEvent): void => {
      window.removeEventListener('pointermove', move)
      window.removeEventListener('pointerup', up)
      const hit = strip ?? stripAt(ev.clientX, ev.clientY)
      strip?.removeAttribute('data-floatdrop')
      const leafId = hit?.dataset.leaf
      if (leafId !== undefined) actions.dockFloat(session, float.key, leafId)
    }
    window.addEventListener('pointermove', move)
    window.addEventListener('pointerup', up)
  }
  const onSizeDown = (dir: 'e' | 's' | 'se') => (e: React.PointerEvent<HTMLDivElement>): void => {
    e.preventDefault(); e.stopPropagation()
    const sx = e.clientX, sy = e.clientY, ow = float.w, oh = float.h
    const move = (ev: PointerEvent): void => {
      actions.floatSet(session, float.key, {
        w: dir === 's' ? undefined : ow + ev.clientX - sx,
        h: dir === 'e' ? undefined : oh + ev.clientY - sy,
      })
    }
    const up = (): void => { window.removeEventListener('pointermove', move); window.removeEventListener('pointerup', up) }
    window.addEventListener('pointermove', move)
    window.addEventListener('pointerup', up)
  }
  return (
    <div className="nv-float" style={{ left: float.x, top: float.y, width: float.w, height: float.h }}
      onMouseDownCapture={() => actions.floatFocus(session, float.key)}>
      <div className="nv-float-head" onPointerDown={onHeadDown}>
        <span className="nv-float-title">{tabTitle(tab, t)}</span>
        <button type="button" className="nv-float-x" aria-label={t('canvas.tab.close')}
          onClick={() => actions.close(session, float.key)}>×</button>
      </div>
      <div className="nv-float-body">
        <TabBody tab={tab} t={t} session={session} useStore={props.useStore} actions={actions}
          props={props} openDoc={openDoc} readCardFile={readCardFile} resolveProjectAsset={resolveProjectAsset}
          importRef={importRef} project={project} tree={tree} />
      </div>
      <div className="nv-float-size nv-float-size-e" onPointerDown={onSizeDown('e')} />
      <div className="nv-float-size nv-float-size-s" onPointerDown={onSizeDown('s')} />
      <div className="nv-float-size nv-float-size-se" onPointerDown={onSizeDown('se')} />
    </div>
  )
}

/**
 * 导入对话框（设计 §5）：analyze 报告用卡的语言列出（卡名/类 + 文件数），
 * 落点默认 `卡/<包名>`（有卡）或 `<包名>`（纯文件包）——卡/ 之外的
 * 落点会让卡目录落成裸文件，报告如实告诉用户。
 */
function ImportDialog({ t, pack, onCommit, onCancel }: {
  readonly t: ShellT
  readonly pack: ImportPack
  readonly onCommit: (target: string) => Promise<boolean>
  readonly onCancel: () => void
}) {
  const [target, setTarget] = useState(() => pack.report.cards.length > 0 ? `卡/${pack.report.suggestion}` : pack.report.suggestion)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState(false)
  const inputRef = useRef<HTMLInputElement | null>(null)
  useEffect(() => { inputRef.current?.focus(); inputRef.current?.select() }, [])
  useEffect(() => {
    const onKey = (event: KeyboardEvent): void => { if (event.key === 'Escape') onCancel() }
    window.addEventListener('keydown', onKey)
    return () => { window.removeEventListener('keydown', onKey) }
  }, [onCancel])
  const submit = (): void => {
    if (busy) return
    setBusy(true)
    void onCommit(target.trim()).then(ok => { if (!ok) { setBusy(false); setError(true) } })
  }
  return (
    <div className="nv-create-veil" onClick={onCancel}>
      <div className="nv-create" role="dialog" aria-modal="true" onClick={e => e.stopPropagation()}
        onKeyDown={e => { if (e.key === 'Enter' && (e.target as HTMLElement).tagName === 'INPUT') submit() }}>
        <div className="nv-create-title">{t('import.title')}</div>
        <div className="nv-import-summary">
          {pack.report.cards.map(card => (
            <div key={card.from} className="nv-import-row">
              <span className="nv-tree-glyph">{glyph.layers(13)}</span>
              <span className="nv-import-name">{card.name}</span>
              <span className="nv-import-kind">{t(card.cardKind === 'WORLD' ? 'card.kind.world' : 'card.kind.character')}</span>
            </div>
          ))}
          {pack.report.files.length > 0 && (
            <div className="nv-import-row nv-import-files">
              <span className="nv-tree-glyph">{glyph.file(13)}</span>
              <span className="nv-import-name">{t('import.files').replace('{count}', String(pack.report.files.length))}</span>
            </div>
          )}
          {pack.report.cards.length === 0 && pack.report.files.length === 0 && (
            <div className="nv-import-row"><span className="nv-import-name">{t('import.empty')}</span></div>
          )}
        </div>
        <div className="nv-create-label">{t('import.target')}</div>
        <input ref={inputRef} className="nv-create-name" value={target}
          placeholder={t('import.target.placeholder')} onChange={e => setTarget(e.target.value)} />
        <div className="nv-import-hint">{t('import.target.hint')}</div>
        {error && <div className="nv-import-error">{t('import.failed')}</div>}
        <div className="nv-create-actions">
          <button type="button" className="nv-create-cancel" onClick={onCancel}>{t('create.cancel')}</button>
          <button type="button" className="nv-create-ok" disabled={busy} onClick={submit}>
            {busy ? t('import.busy') : t('import.commit')}
          </button>
        </div>
      </div>
    </div>
  )
}

/**
 * 画布宿主：布局树（叶=页签组，节点=分割）。`start`/`chat` 每叶常驻不可关。
 * @param props - 画布页签座标准 props + 画布 store + 注入面。
 * @returns 画布工作面。
 */
export function CanvasHost(props: CanvasProps) {
  const { t, useStore, actions } = props
  const session = props.session
  const allTabs = useStore(s => s.tabs)
  const layoutMap = useStore(s => s.layout)
  const legacyActive = useStore(s => s.active)
  const dialogRow = useStore(s => s.dialog)
  const project = props.useProject(v => v)
  const tree = props.useTree(v => v)
  const edits = props.useEdits(v => v)
  const sims = props.useSims(v => v)
  const statusMap = props.useStatus(v => v)
  const importPack = props.useImportPack(v => v)
  const simOpenMap = useStore(s => s.simOpen)
  const focusMap = useStore(s => s.focus)
  const floatsMap = useStore(s => s.floats)
  const [dragKey, setDragKey] = useState<string | undefined>(undefined)
  const [dropSpot, setDropSpot] = useState<{ readonly leaf: string; readonly zone: DropZone } | undefined>(undefined)
  /** Module fullscreen: the tab key whose page fills the canvas. */
  const [immersiveKey, setImmersiveKey] = useState<string | undefined>(undefined)
  /** Canvas fullscreen: the frame collapses to this column. */
  const [canvasFullscreen, setCanvasFullscreen] = useState(false)
  // 会话切片 + 布局自愈（v3 快照无 layout 时建单叶，老现场不丢）。
  const tabs = useMemo(() => allTabs.filter(row => row.owner === session), [allTabs, session])
  const floats = useMemo(() => floatsMap?.[session] ?? [], [floatsMap, session])
  const node = useMemo(() => normLayout({ tabs: allTabs, layout: layoutMap, active: legacyActive, floats: floatsMap }, session),
    [allTabs, layoutMap, legacyActive, floatsMap, session])
  const tabByKey = useMemo(() => new Map(tabs.map(row => [row.key, row] as const)), [tabs])
  const dialog = dialogRow !== null && dialogRow.owner === session ? dialogRow : null
  const importRef = useRef<HTMLInputElement | null>(null)
  const openDoc = useCallback((path: string, title: string) => {
    const kind = fileTabKind(path)
    actions.open({ key: `${kind}:${path}`, kind, title, owner: session, path })
  }, [actions, session])
  const submit = useCallback((request: CreateRequest) => {
    actions.closeDialog()
    props.submitCreate(request)
  }, [actions, props])
  // 卡页 html 活引用的文件读回调必须稳定——否则 HtmlModule 的 effect 每次
  // 渲染都重跑，iframe 反复卸载重挂（肉眼可见的闪烁）。
  const readCardFile = useCallback((path: string) => props.readDoc(session, path), [props.readDoc, session])
  // Free surfaces read project bytes (glb/texture/audio/json) through the same
  // session-fenced frame route the workbench canvas uses.
  const resolveProjectAsset = useCallback((assetPath: string, base?: string): Promise<Blob | null> => {
    const ap = new URLSearchParams({ session, path: assetPath })
    if (base !== undefined && base !== '') ap.set('base', base)
    return fetch(new URL(`api/noven-frame?${ap.toString()}`, document.baseURI).href)
      .then(response => (response.ok ? response.blob() : null))
      .catch(() => null)
  }, [session])
  useEffect(() => {
    if (dialog?.kind === 'import') { actions.closeDialog(); importRef.current?.click() }
  }, [dialog, actions])
  // 卡/模块页签的标题以内容树为准：打开时拿不到名字，树轮询到达后回写。
  useEffect(() => {
    if (tree === undefined) return
    for (const row of tabs) {
      if (row.kind !== 'card' || row.cardId === undefined) continue
      const card = tree.cards.find(c => c.cardId === row.cardId)
      const name = row.moduleId === undefined ? card?.name
        : card === undefined ? undefined : findTreeModule(card.modules, row.moduleId)?.name
      if (name !== undefined && name !== row.title) actions.retitle(session, row.key, name)
    }
  }, [tree, tabs, session, actions])
  // 页签跟着对象走：树确认某张卡/某个模块已不存在时，页签自己退场。
  // "见过才算失踪"——新建对象与树轮询之间存在竞态，首帧快照里缺席的直接判死，
  // 之后只关曾经出现过的对象，避免刚建的卡被旧树快照误杀。
  const seenTargets = useRef<{ cards: Set<string>; modules: Set<string> } | undefined>(undefined)
  useEffect(() => {
    if (tree === undefined) return
    const cards = new Set<string>()
    const modules = new Set<string>()
    const collect = (cardId: string, rows: readonly TreeModuleRow[]): void => {
      for (const row of rows) {
        modules.add(`${cardId}:${row.id}`)
        collect(cardId, row.children)
      }
    }
    for (const card of tree.cards) {
      cards.add(card.cardId)
      collect(card.cardId, card.modules)
    }
    const previous = seenTargets.current
    for (const row of tabs) {
      if (row.kind !== 'card' || row.cardId === undefined) continue
      // 外项目的引用卡不在本树里，缺失态留给卡页自己裁决。
      if (row.cardAddr?.root !== undefined && project !== undefined && row.cardAddr.root !== project.root) continue
      const cardGone = !cards.has(row.cardId) && (previous === undefined || previous.cards.has(row.cardId))
      const moduleKey = row.moduleId === undefined ? undefined : `${row.cardId}:${row.moduleId}`
      const moduleGone = moduleKey !== undefined && !modules.has(moduleKey)
        && (previous === undefined || previous.modules.has(moduleKey))
      if (cardGone || moduleGone) actions.close(session, row.key)
    }
    seenTargets.current = { cards, modules }
  }, [tree, tabs, session, actions, project])
  const focusedLeaf = leafById(node, focusMap?.[session] ?? '') ?? leavesOf(node)[0]
  const activeTabKey = focusedLeaf?.active ?? 'start'
  const immersiveLeaf = immersiveKey === undefined ? undefined : leafWith(node, immersiveKey)
  const immersive = immersiveKey !== undefined && immersiveLeaf?.active === immersiveKey
  const toggleCanvasFullscreen = useCallback((): void => {
    setCanvasFullscreen(current => !current)
  }, [])
  const toggleImmersive = useCallback((): void => {
    setImmersiveKey(current => current === undefined ? activeTabKey : undefined)
  }, [activeTabKey])
  // Switching the active page leaves module fullscreen: the new page did not
  // ask for it. Canvas fullscreen is a frame mode and survives tab switches.
  useEffect(() => { setImmersiveKey(undefined) }, [activeTabKey])
  // The frame renders from ui-layout; the canvas keeps the local chain value
  // and mirrors it through a ref so a fresh injected face object does not
  // re-commit the same frame state on every render. Leaving drops the mode.
  const setFrameFullscreen = useRef(props.setCanvasFullscreen)
  setFrameFullscreen.current = props.setCanvasFullscreen
  useEffect(() => { setFrameFullscreen.current(canvasFullscreen) }, [canvasFullscreen])
  useEffect(() => () => { setFrameFullscreen.current(false) }, [])
  useEffect(() => {
    if (!immersive && !canvasFullscreen) return
    const onKey = (event: KeyboardEvent): void => {
      if (event.key !== 'Escape') return
      const target = event.target
      if (target instanceof Element && target.closest('input, textarea, [contenteditable]')) return
      // A menu or dialog above the page owns Escape first.
      if (document.querySelector('[role="dialog"], [role="menu"]') !== null) return
      event.preventDefault()
      event.stopPropagation()
      if (immersive) { setImmersiveKey(undefined); return }
      setCanvasFullscreen(false)
    }
    document.addEventListener('keydown', onKey, true)
    return () => { document.removeEventListener('keydown', onKey, true) }
  }, [immersive, canvasFullscreen])
  const leafProps = {
    t, session, actions, props, tabByKey, project, tree, sims, statusMap, simOpenMap,
    openDoc, readCardFile, resolveProjectAsset, importRef, dragKey, setDragKey, dropSpot, setDropSpot,
    focusLeaf: focusMap?.[session], canvasFullscreen, toggleCanvasFullscreen,
  }
  const aiEditing = edits.cards.size > 0
  return (
    <AiEditsContext.Provider value={edits}>
    <SurfaceViewContext.Provider value={{ immersive, canvasFullscreen, toggleImmersive, toggleCanvasFullscreen }}>
    <div className="nv-canvas" data-ai-editing={aiEditing ? '' : undefined}
      data-immersive={immersive || undefined} data-canvas-fullscreen={canvasFullscreen || undefined}>
      <input ref={importRef} type="file" accept=".zip,.png,.json,.txt" hidden
        onChange={e => { const file = e.target.files?.[0]; e.target.value = ''; if (file !== undefined) props.importCard(file) }} />
      {immersive && immersiveLeaf !== undefined
        // Module fullscreen renders one leaf only: the layout tree is left
        // untouched, so exiting restores every split exactly.
        ? <LeafView {...leafProps} leaf={immersiveLeaf} focused={false} immersive />
        : isLeaf(node)
          // 焦点标记只在多分栏时有意义——单叶恒焦点，打标就成页签条上一条多余的色线。
          ? <LeafView {...leafProps} leaf={node} focused={false} />
          : <SplitView node={node} leafProps={leafProps} actions={actions} session={session} />}
      {dialog !== null && dialog.kind !== 'import' && (
        <CreateDialog kind={dialog.kind} dir={dialog.dir} t={t}
          worlds={(tree?.cards ?? []).filter(c => c.kind === 'WORLD').map(c => ({ cardId: c.cardId, name: c.name }))}
          onSubmit={submit} onCancel={actions.closeDialog} />
      )}
      {importPack !== undefined && (
        <ImportDialog t={t} pack={importPack} onCommit={props.commitImport} onCancel={props.cancelImport} />
      )}
      {floats.map(f => {
        const tab = tabByKey.get(f.key)
        // 浮窗 portal 到 body——画布被收起/停靠时窗仍在前台工作。
        return tab === undefined ? null : createPortal(
          <FloatFrame key={f.key} float={f} tab={tab} t={t} session={session} actions={actions}
            props={props} openDoc={openDoc} readCardFile={readCardFile} resolveProjectAsset={resolveProjectAsset}
            importRef={importRef} project={project} tree={tree} />,
          document.body,
        )
      })}
      {aiEditing && !immersive && <div className="nv-ai-pill nv-ai-pill-canvas" role="status">{t('ai.editing')}</div>}
    </div>
    </SurfaceViewContext.Provider>
    </AiEditsContext.Provider>
  )
}
