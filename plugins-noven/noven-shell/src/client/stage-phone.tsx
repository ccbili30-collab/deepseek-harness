/**
 * 手机会话页复刻：ChatScreen 的 web 镜像——顶栏、消息流（用户气泡 +
 * 助手块流里的 novex 件投影）、舞台岛占满转录区、底部输入栏。
 * 输入栏真发本会话 prompt；岛出的 compose 回填草稿、query 上抛壳调试盘。
 * @module noven-shell/client/stage-phone
 */
import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { fmt, type ShellT } from './pages/Home.tsx'
import { collectNovexDefs, renderBlocks, stageInputOwn, substituteNovexArtifact, type NovexDef, type RenderBlock } from './stage-artifacts.ts'
import { StageIsland, type IslandControl, type IslandFrame, type IslandCall } from './stage-island.tsx'
import { buildTranscript } from './stage-transcript.ts'
import type { FrameSendResult } from './stage-frame.ts'

/** 转录里的一条可见消息。 */
export interface TranscriptMsg {
  readonly key: string
  readonly role: 'user' | 'assistant'
  readonly text: string
  /** 会话事件 seq——transcript 的 messageId 由它撑（v0.3 B1）。 */
  readonly seq: number
  /** assistant 消息所属回合号（user/message 没有 turn 字段）。 */
  readonly turnId?: string
}

/** 转录快照：消息流 + 会话是否在跑。 */
export interface TranscriptState {
  readonly messages: readonly TranscriptMsg[]
  readonly busy: boolean
}

/** 当前舞台：打开的作品文件或一条 novex-use 投影出来的 fullscreen 岛。 */
interface StageMount {
  readonly title: string
  readonly html: string
  /** v0.3 B2：声明 input:"own" 的作品自带输入层——宿主藏原生栏、收 send。 */
  readonly inputOwn: boolean
}

/**
 * send 通道约束（r2 B2）：限频与长度上限。长度上限对齐原生输入栏——
 * 原生栏当前没有显式上限，取 2000 作工作值，待真机对账后调整。
 * 浏览器版不做手势门控（沙箱里脚本可绕过，做了是安全表演——回执 E2），
 * 每次 send 都上抛调试盘记日志。
 */
const SEND_TEXT_MAX = 2000
const SEND_RATE_MS = 1000

/** 手机会话页复刻。islandHtml 是当台作品文件——当它是「当前舞台」挂进消息区。 */
export function PhoneStage({ t, title, islandHtml, frameBase, transcript, busy, ask, resolveAsset, onCall, picking, onBack, topActions }: {
  readonly t: ShellT
  /** 顶栏标题（作品文件名去扩展）。 */
  readonly title: string
  /** 当台作品的岛源；undefined 表示还没有可挂的舞台。 */
  readonly islandHtml?: string
  /** 契约帧去 messages 的部分——messages 由转录实时折叠进来。 */
  readonly frameBase: IslandFrame
  readonly transcript: readonly TranscriptMsg[]
  readonly busy: boolean
  /** 发送进戏台会话 prompt 队列。返回回执 = 权威结果（覆盖乐观记账）；undefined = 按排队/已受理记。 */
  readonly ask: (text: string) => Promise<FrameSendResult | undefined>
  readonly resolveAsset: (path: string, base?: string) => Promise<Blob | null>
  /** query/picked/err 上抛——compose 由本屏消化（回填输入框）。 */
  readonly onCall?: (call: IslandCall) => void
  /** 壳侧选元素开关：只打到舞台岛。 */
  readonly picking?: boolean
  /** 转录态下按 ‹ 的外抛（模拟器回会话列表）；不设时 ‹ 只收舞台。 */
  readonly onBack?: () => void
  /** 顶栏右侧附加件（模型 pill、⋯ 菜单）。 */
  readonly topActions?: ReactNode
}) {
  const [draft, setDraft] = useState('')
  const [stageOpen, setStageOpen] = useState(true)
  const [useStage, setUseStage] = useState<StageMount | null>(null)
  const [sendResult, setSendResult] = useState<FrameSendResult | undefined>(undefined)
  const [notice, setNotice] = useState<string | null>(null)
  const transRef = useRef<HTMLDivElement | null>(null)
  const stageCtl = useRef<IslandControl | null>(null)
  const lastSendAt = useRef(0)
  const noticeTimer = useRef<number | undefined>(undefined)

  useEffect(() => { stageCtl.current?.setPick(picking === true) }, [picking, stageOpen])
  useEffect(() => () => { if (noticeTimer.current !== undefined) window.clearTimeout(noticeTimer.current) }, [])

  const stage: StageMount | null = useStage
    ?? (islandHtml === undefined ? null : { title, html: islandHtml, inputOwn: stageInputOwn(islandHtml) })
  const defs = useMemo(() => collectNovexDefs(transcript.filter(m => m.role === 'assistant').map(m => m.text)).defs, [transcript])

  // turn.queued 是近似值：PC 拿不到服务端队列长度，只数「本地已发、busy 还没消化完」的发送数。
  const [pending, setPending] = useState(0)
  useEffect(() => { if (!busy) setPending(0) }, [busy])

  const frame = useMemo<IslandFrame>(() => ({
    ...frameBase,
    turn: { status: busy ? 'streaming' : 'idle', queued: pending },
    sendResult,
    // messages 弃用但保留一版（皮肤 overlay 依赖，v0.4 移除）；正文走 transcript。
    messages: transcript.slice(-30).map(m => ({ role: m.role, text: m.text })),
    transcript: buildTranscript(
      transcript.map(m => ({ id: String(m.seq), role: m.role, text: m.text, turnId: m.turnId })),
      (frameBase.cast ?? []).map(c => c.name)),
  }), [frameBase, transcript, busy, pending, sendResult])

  const handleCall = useCallback((call: IslandCall): void => {
    if (call.kind === 'compose') {
      // 手机语义：compose 只填输入框，发送永远是人按的。
      setDraft(call.text ?? '')
      return
    }
    if (call.kind === 'send') {
      // send（r2 B2）：未声明 own 一律丢弃；限频与长度对齐原生栏；
      // 生成中发送 = 排队，不拒收。内容照常进原生对话（ask 就是本会话 prompt）。
      const text = (call.text ?? '').trim()
      const now = Date.now()
      let res: FrameSendResult
      if (stage?.inputOwn !== true) res = { result: 'dropped', why: 'not-own' }
      else if (text === '' || text.length > SEND_TEXT_MAX) res = { result: 'dropped', why: 'length' }
      else if (now - lastSendAt.current < SEND_RATE_MS) res = { result: 'dropped', why: 'rate' }
      else {
        lastSendAt.current = now
        setPending(p => p + 1)
        res = { result: busy ? 'queued' : 'accepted', why: null }
        // ask 回执是权威结果（如未开模拟器 → dropped）——先乐观记账，到达后覆盖。
        void ask(text).then(final => { if (final !== undefined) setSendResult(final) })
      }
      // 每次回执是新对象——壳侧帧差推导会把它认成 reason:'send' 推下去。
      setSendResult(res)
      onCall?.({ ...call, note: `${res.result}${res.why === null ? '' : `:${res.why}`}` })
      return
    }
    onCall?.(call)
  }, [onCall, stage, busy, ask])

  /** 全屏岛超时未 ready / 运行中崩溃 → 收舞台回原生对话（r2 B7 逃生口）。 */
  const stageFallback = useCallback((): void => {
    setStageOpen(false)
    setNotice(t('work.stage.fallback'))
    if (noticeTimer.current !== undefined) window.clearTimeout(noticeTimer.current)
    noticeTimer.current = window.setTimeout(() => setNotice(null), 6000)
  }, [t])

  const send = useCallback((): void => {
    const text = draft.trim()
    if (text === '') return
    setDraft('')
    setPending(p => p + 1)
    void ask(text)
  }, [draft, ask])

  // 新消息滚到底——转录是消息流不是面板。
  useEffect(() => {
    const el = transRef.current
    if (el !== null) el.scrollTop = el.scrollHeight
  }, [transcript.length, stageOpen])

  const openStage = useCallback((mount: StageMount): void => {
    setUseStage(mount)
    setStageOpen(true)
  }, [])

  // input:"own" 的作品接管输入层——全屏活动期藏原生栏；退回转录后恢复（逃生口）。
  const ownInput = stageOpen && stage?.inputOwn === true

  return (
    <div className="nv-phone">
      <div className="nv-ptop">
        <button type="button" className="nv-ptop-btn" title={t('work.stage.transcript')}
          onClick={() => { if (stageOpen && stage !== null) setStageOpen(false); else onBack?.() }}>‹</button>
        <div className="nv-ptitle">{stage?.title ?? title}</div>
        <div className="nv-ptop-side">
          {busy ? <span className="nv-pbusy">…</span> : null}
          {topActions}
        </div>
      </div>
      {stageOpen && stage !== null ? (
        <div className="nv-pstage">
          <StageIsland html={stage.html} frame={frame} fillParent t={t}
            onCall={handleCall} onFallback={stageFallback} resolveAsset={resolveAsset} controlRef={stageCtl} />
        </div>
      ) : (
        <div className="nv-ptrans" ref={transRef}>
          {transcript.length === 0 ? <div className="nv-pempty">{t('work.stage.noMsgs')}</div> : null}
          {transcript.map(msg => (
            <PhoneMsg key={msg.key} msg={msg} defs={defs} frame={frame} t={t}
              onCall={handleCall} resolveAsset={resolveAsset} onOpenStage={openStage} />
          ))}
        </div>
      )}
      {stage !== null && !stageOpen ? (
        <button type="button" className="nv-pfloat" onClick={() => setStageOpen(true)}>
          {fmt(t, 'work.stage.reopen', { name: stage.title })}
        </button>
      ) : null}
      {notice !== null && <div className="nv-pnotice">{notice}</div>}
      {!ownInput && (
        <div className="nv-pcompose">
          <textarea className="nv-pinput" rows={1} value={draft}
            placeholder={t('work.stage.input')}
            onChange={e => setDraft(e.target.value)}
            onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); send() } }} />
          <button type="button" className="nv-psend" disabled={draft.trim() === ''} onClick={send}>
            {t('work.stage.send')}
          </button>
        </div>
      )}
    </div>
  )
}

/** 单条消息：用户右气泡，助手拆 renderBlocks——novex 件就地投影。 */
function PhoneMsg({ msg, defs, frame, t, onCall, resolveAsset, onOpenStage }: {
  readonly msg: TranscriptMsg
  readonly defs: ReadonlyMap<string, NovexDef>
  readonly frame: IslandFrame
  readonly t: ShellT
  readonly onCall: (call: IslandCall) => void
  readonly resolveAsset: (path: string, base?: string) => Promise<Blob | null>
  readonly onOpenStage: (mount: StageMount) => void
}) {
  if (msg.role === 'user') {
    return <div className="nv-pmsg u"><div className="nv-pbubble">{msg.text}</div></div>
  }
  return (
    <div className="nv-pmsg a">
      {renderBlocks(msg.text).map((block, i) => (
        <MsgBlock key={i} block={block} defs={defs} frame={frame} t={t}
          onCall={onCall} resolveAsset={resolveAsset} onOpenStage={onOpenStage} />
      ))}
    </div>
  )
}

/** 一个渲染块：文字、件注册 chip、use 投影（内联岛或舞台入口）、皮肤 chip、内联岛。 */
function MsgBlock({ block, defs, frame, t, onCall, resolveAsset, onOpenStage }: {
  readonly block: RenderBlock
  readonly defs: ReadonlyMap<string, NovexDef>
  readonly frame: IslandFrame
  readonly t: ShellT
  readonly onCall: (call: IslandCall) => void
  readonly resolveAsset: (path: string, base?: string) => Promise<Blob | null>
  readonly onOpenStage: (mount: StageMount) => void
}) {
  if (block.type === 'text') {
    return <div className="nv-ptext">{block.text}</div>
  }
  if (block.type === 'def') {
    return <div className="nv-pchip">{fmt(t, 'work.stage.defChip', { name: block.def?.name ?? '?' })}</div>
  }
  if (block.type === 'skin') {
    return <div className="nv-pchip">{fmt(t, 'work.stage.skinChip', { name: block.skin?.name ?? '?' })}</div>
  }
  if (block.type === 'htmlIsland') {
    return <StageIsland html={block.html ?? ''} frame={frame} t={t} onCall={onCall} resolveAsset={resolveAsset} />
  }
  if (block.type === 'use' && block.use !== undefined) {
    const def = defs.get(block.use.name)
    if (def === undefined) {
      return <div className="nv-pchip nv-pchip-bad">{fmt(t, 'work.stage.missDef', { name: block.use.name })}</div>
    }
    const html = substituteNovexArtifact(def.template, block.use.data)
    if (def.fullscreen || block.use.fullscreen) {
      return (
        <button type="button" className="nv-pentry"
          onClick={() => onOpenStage({ title: def.name, html, inputOwn: def.inputOwn })}>
          {fmt(t, 'work.stage.enter', { name: def.name })}
        </button>
      )
    }
    return <StageIsland html={html} frame={frame} t={t} onCall={onCall} resolveAsset={resolveAsset} />
  }
  return null
}
