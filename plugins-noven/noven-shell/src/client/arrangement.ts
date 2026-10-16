/**
 * 面板排布：命名的结构种子，产品只有两个场景。
 *
 * agent —— 导航展开｜对话主列｜抽屉轨在最右缘（unitSide 右）｜画布停靠不占位。
 * ide   —— 导航折叠成轨｜抽屉画布贴轨（unitSide 左）｜扣除导航与抽屉后画布/对话为 7∶3｜对话副窗保底。
 *
 * 种子只写结构（导航折叠、unitSide）；主动应用预设时请求显式画布配额，覆盖
 * 旧单元列宽一次，用户之后拖缝保存的新宽度优先。画布的侧边与停靠态归会话的 surface
 * （ui-sidebar-right），不进几何。种子按会话 id 写进几何记录（契约 C9：界面
 * 现场属于会话）：目标会话已可见则当场生效，尚不可见则在进入时加载——入口
 * 路径不必关心翻页提交的时序。
 */

/** 命名排布；两个产品场景。 */
export type Arrangement = 'agent' | 'ide'

/** 一个排布种子写进会话几何记录的结构字段。 */
export interface ArrangementSeed {
  sidebarCollapsed?: boolean
  narrowExpanded?: boolean
  unitSide?: 'left' | 'right'
  rightbarCollapsed?: boolean
}

/** 排布种子需要的写入口，来自 ctx.layout（发布版未带的新方法按可选口径传入）。 */
export interface ArrangementDeps {
  seedSessionGeometry(sessionId: string, seed: ArrangementSeed): void
  seedUnitShare(share: number): void
}

/**
 * 把一个命名排布的种子写进目标会话。
 * @param deps - ctx.layout 的种子写入口。
 * @param sessionId - 种子落到的会话。
 * @param kind - 要应用的排布。
 */
export function applyArrangement(deps: ArrangementDeps, sessionId: string, kind: Arrangement): void {
  if (kind === 'ide') {
    deps.seedSessionGeometry(sessionId, { sidebarCollapsed: true, unitSide: 'left', rightbarCollapsed: false })
    deps.seedUnitShare(0.7)
    return
  }
  deps.seedSessionGeometry(sessionId, { sidebarCollapsed: false, unitSide: 'right', rightbarCollapsed: true })
}
