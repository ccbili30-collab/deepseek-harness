/**
 * 结构化叙事流（r2 B1）：宿主把消息文本解析一次成段下发，作品不碰
 * markdown 和 novex 围栏。解析规则以 tests/fixtures/transcript/ 的
 * 黄金样例为准（B1.0：两端各有一个解析器，样例判归属）——本文件是
 * PC 侧参考实现，改动必须与样例同步。
 * @module noven-shell/client/stage-transcript
 */
import { renderBlocks } from './stage-artifacts.ts'
import type { TranscriptSeg } from './stage-frame.ts'

/** transcript 窗口：最近 N 段（r2 B1 建议值；历史翻页留待 v0.4）。 */
export const TRANSCRIPT_WINDOW = 60

/** buildTranscript 的输入消息（转录已剥掉非 user 来源与协议事件）。 */
export interface TranscriptMsgIn {
  /** 消息 id：PC 用会话事件 seq。 */
  readonly id: string
  readonly role: 'user' | 'assistant'
  readonly text: string
  readonly turnId?: string
}

/** UpdateVariable 是状态协议块，不进正文（B1）；novex 围栏由 renderBlocks 剥。 */
const UPDATE_VAR_RE = /<UpdateVariable>[\s\S]*?<\/UpdateVariable>/gi

const IMG_LINE_RE = /^\s*!\[([^\]]*)\]\(([^)\s]+)\)\s*$/
const BLANK_RE = /\n[^\S\n]*\n+/

/** 安全子集（B1）：全文转义后只还原 **粗** → b、*斜* → i、换行 → br。 */
function safeHtml(text: string): string {
  const esc = text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;').replace(/'/g, '&#39;')
  return esc
    .replace(/\*\*([^*]+)\*\*/g, '<b>$1</b>')
    .replace(/\*([^*]+)\*/g, '<i>$1</i>')
    .replace(/\n/g, '<br>')
}

/** 剥掉协议块后剩下的纯文本（novex 围栏 + UpdateVariable）。 */
function stripProtocol(raw: string): string {
  const texts = renderBlocks(raw)
    .filter(b => b.type === 'text' && b.text !== undefined)
    .map(b => b.text as string)
  return texts.join('\n\n').replace(UPDATE_VAR_RE, '')
}

/**
 * 行首台词标记（B1.1）：行首（可留白）+ 可选 @ + 名册名 + 冒号。
 * 名册按长度降序传进来（「阿七娘」先于「阿七」）；句中 @名字 不触发。
 * 误判在预期内——speaker 只用于呈现，不得做逻辑分支。
 */
function dialogueLine(line: string, cast: readonly string[]): { readonly name: string; readonly rest: string } | null {
  const s = line.trimStart()
  const t = s.startsWith('@') ? s.slice(1) : s
  for (const name of cast) {
    if (t.startsWith(`${name}：`)) return { name, rest: t.slice(name.length + 1).trim() }
    if (t.startsWith(`${name}:`)) return { name, rest: t.slice(name.length + 1).trim() }
  }
  return null
}

/**
 * 消息流 → 结构化段流。切段：空行分段；段内逐行判定——整行图片出 image、
 * 行首台词标记出 dialogue、其余行并入 narration（连续行合成一段）。
 * 用户消息不拆：剥协议块后整段一个 narration。
 * PC 读不到流帧，streaming 恒 false（已登记的 PC 已知差异）。
 * @param messages 可见消息流（按序）
 * @param cast 本局角色名册的名字列（B5；没有名册时全部按旁白/普通行处理）
 * @returns 最近 TRANSCRIPT_WINDOW 段
 */
export function buildTranscript(messages: readonly TranscriptMsgIn[], cast: readonly string[]): TranscriptSeg[] {
  const roster = [...cast].filter(n => n !== '').sort((a, b) => b.length - a.length)
  const segs: TranscriptSeg[] = []
  for (const msg of messages) {
    let n = 0
    const emit = (seg: Omit<TranscriptSeg, 'id' | 'messageId' | 'segment' | 'role' | 'streaming'>): void => {
      segs.push({
        id: `${msg.id}#${n}`,
        messageId: msg.id,
        segment: n,
        role: msg.role,
        ...(msg.turnId !== undefined ? { turnId: msg.turnId } : {}),
        streaming: false,
        ...seg,
      })
      n += 1
    }
    if (msg.role === 'user') {
      const text = stripProtocol(msg.text).trim()
      if (text !== '') emit({ kind: 'narration', text, html: safeHtml(text), src: null })
      continue
    }
    for (const block of renderBlocks(msg.text)) {
      if (block.type !== 'text' || block.text === undefined) continue
      const cleaned = block.text.replace(UPDATE_VAR_RE, '')
      for (const para of cleaned.split(BLANK_RE)) {
        if (para.trim() === '') continue
        let narr: string[] = []
        const flush = (): void => {
          const text = narr.join('\n').trim()
          narr = []
          if (text !== '') emit({ kind: 'narration', text, html: safeHtml(text), src: null })
        }
        for (const line of para.split('\n')) {
          const img = IMG_LINE_RE.exec(line)
          if (img !== null) {
            flush()
            emit({ kind: 'image', text: img[1], html: '', src: img[2] })
            continue
          }
          const dlg = dialogueLine(line, roster)
          if (dlg !== null) {
            flush()
            emit({ kind: 'dialogue', speaker: dlg.name, text: dlg.rest, html: safeHtml(dlg.rest), src: null })
            continue
          }
          narr.push(line)
        }
        flush()
      }
    }
  }
  return segs.slice(-TRANSCRIPT_WINDOW)
}
