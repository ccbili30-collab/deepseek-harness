/**
 * v0.3 帧骨架：env / reason / turn 与叙事流段的类型和纯函数构造。
 * WorkTab 手机档与 ChatTab 两个模拟器共用这一份——帧字段翻倍后各写一份
 * 必然漂移，而 PC 是协议参考实现，漂移会传染给手机侧。
 * @module noven-shell/client/stage-frame
 */

/** 制作基线 Chromium 主版本（r2 §A：能力上限非运行门槛，标红永远按它判）。 */
export const WEBVIEW_BASELINE = 111

/** 机框档位 → 模拟键盘高度（CSS px），回执 E3 的预设表，真机测过再调。 */
export const SIM_IME: Record<string, number> = {
  p360: 280,
  p390: 300,
  p430: 320,
  t768: 320,
  t834: 340,
  t1024: 300,
}

/** env.ime：系统键盘可见性与占位高度（height 为 CSS px，收起为 0）。 */
export interface FrameIme {
  readonly visible: boolean
  readonly height: number
}

/** 帧 env 字段（r2 B3）：宿主平台、桥版本、上报内核、键盘状态。 */
export interface FrameEnv {
  readonly platform: 'pc-shell'
  readonly bridgeVersion: 2
  readonly webview: number
  readonly ime: FrameIme
}

/** 帧顶层 reason：这帧为什么被推下来（r2 B6 reason 全集）。 */
export type FrameReason = 'init' | 'turn' | 'query' | 'branch' | 'ime' | 'send'

/** 帧 turn 字段（r2 B2）：回合状态与仍在排队的本地发送数。 */
export interface FrameTurn {
  readonly status: 'idle' | 'streaming'
  /**
   * PC 侧拿不到服务端队列长度，只能近似为「本地已发、尚未被 turn
   * 消化掉」的发送计数（busy 归零时清零）。
   */
  readonly queued: number
}

/** 帧 transcript 的一段（r2 B1）：宿主解析一次，作品不碰 markdown/围栏。 */
export interface TranscriptSeg {
  /** 段 id = 消息 id + '#' + 段序号（一条消息切成多段）。 */
  readonly id: string
  readonly messageId: string
  readonly segment: number
  readonly turnId?: string
  readonly role: 'assistant' | 'user'
  readonly kind: 'narration' | 'dialogue' | 'image'
  /** kind=dialogue 时的说话人（B1.1 行首标记识别，可能不准，作品不得依赖）。 */
  readonly speaker?: string
  readonly text: string
  /** 安全子集：<b><i><br> 以外全部转义。 */
  readonly html: string
  /** kind=image 时可经 asset() 解析的 id，其余为 null。 */
  readonly src: string | null
  /** 本段仍在流式增长；PC 读不到流帧，恒为 false（已登记的已知差异）。 */
  readonly streaming: boolean
}

/** 帧 choices 字段（r2 B4）：模型选项数据转交作品，全屏时原生选项条隐藏。 */
export interface FrameChoices {
  readonly turnId?: string
  readonly items: readonly { readonly id: string; readonly label: string }[]
}

/** 帧 cast 角色名册行（r2 B5）：字段可缺省，缺省兜底是作品自己的事。 */
export interface FrameCastRow {
  readonly id: string
  readonly name: string
  readonly avatar?: string | null
  readonly color?: string | null
}

/** 帧 sendResult 回执（r2 B2）：作品据此显示已发送 / 排队中 / 没发出去。 */
export interface FrameSendResult {
  readonly result: 'accepted' | 'queued' | 'dropped'
  readonly why: 'rate' | 'gesture' | 'not-own' | 'length' | null
}

/**
 * 实际浏览器内核主版本。解析不到（node 测试环境、非 Chrome 系）回退基线。
 * @param ua 待解析的 UA 串；缺省取 navigator.userAgent
 * @returns Chromium 主版本号
 */
export function realWebview(ua?: string): number {
  const agent = ua ?? (typeof navigator === 'undefined' ? '' : navigator.userAgent)
  const m = /Chrome\/(\d+)/.exec(agent)
  return m === null ? WEBVIEW_BASELINE : Number(m[1])
}

/** buildEnv 入参：机框档位、模拟键盘开关、内核上报模式。 */
export interface EnvInput {
  /** SIM_IME 的键（与 SIM_SIZES 档位同名）；未知档位回落 p390。 */
  readonly sizeKey: string
  readonly imeOn: boolean
  /**
   * 'real' 上报真实内核版本；否则按基线 111 上报——如实上报的话
   * 作品的降级分支在 PC 上永远跑不到，作者测不到（回执 §B2）。
   */
  readonly webview: 'baseline' | 'real'
  readonly ua?: string
}

/**
 * 构造帧 env：平台恒 pc-shell、bridgeVersion 恒 2。
 * @param input 档位与开关
 * @returns 帧的 env 字段
 */
export function buildEnv(input: EnvInput): FrameEnv {
  const height = input.imeOn ? SIM_IME[input.sizeKey] ?? SIM_IME.p390 : 0
  return {
    platform: 'pc-shell',
    bridgeVersion: 2,
    webview: input.webview === 'real' ? realWebview(input.ua) : WEBVIEW_BASELINE,
    ime: { visible: input.imeOn, height },
  }
}

/** frameReason 参与判定的帧字段子集（与 IslandFrame 结构兼容）。 */
interface FrameDelta {
  readonly session?: string
  readonly env?: FrameEnv
  readonly sendResult?: unknown
}

/**
 * 推帧原因推导：上一帧与下一帧对比，按 branch > send > ime > turn 取一个
 * （query 回包由宿主在帧上显式写 reason，不走推导——查证改的是档案字段，
 * 无法与 novex-use 产生的 deltas 变化区分）。
 * - session 变了 = 用户切了分支（PC 上 fork = 新会话 id）；
 * - sendResult 每次出站回执都是新对象，引用不等即一次发送；
 * - env.ime 按值比较（buildEnv 每次产出新对象）。
 * @param prev 上一次推给岛的帧；undefined = 首帧
 * @param next 本次要推的帧
 * @returns 帧顶层 reason
 */
export function frameReason(prev: FrameDelta | undefined, next: FrameDelta): FrameReason {
  if (prev === undefined) return 'init'
  if (next.session !== prev.session) return 'branch'
  if (next.sendResult !== undefined && next.sendResult !== prev.sendResult) return 'send'
  const a = prev.env?.ime
  const b = next.env?.ime
  if ((a === undefined) !== (b === undefined)
    || (a !== undefined && b !== undefined && (a.visible !== b.visible || a.height !== b.height))) return 'ime'
  return 'turn'
}
