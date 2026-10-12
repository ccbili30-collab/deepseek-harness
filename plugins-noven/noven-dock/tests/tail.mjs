// noven-dock 尾随逻辑行为测试：假 ctx 驱动 registerTail，
// 验证身份简报、双向游标、注入内容不回传、对端缺席不注入。
import assert from 'node:assert/strict'
import { registerTail } from '../lib/tail.js'
import { DockPairs } from '../lib/ledger.js'

const userMsg = (text, kind = 'user') => ({ content: [{ type: 'text', text }], source: { kind } })
const ev = (seq, type, data) => ({ seq, type, data })
const umsg = (seq, text, kind = 'user') => ev(seq, 'user/message', { content: [{ type: 'text', text }], source: { kind } })
const amsg = (seq, text) => ev(seq, 'assistant/message', { message: { content: [{ type: 'text', text }] } })

/** 假会话：一段固定日志。 */
function fakeSession(id, events) {
  return { id, snapshotEvents: () => events }
}

/** 假 ctx：投影按调用当下重折（真实现是增量物化，语义同），pre-step 监听收集起来手动触发。 */
function fakeCtx(sessions) {
  const preSteps = []
  let def
  return {
    sessions: { get: id => sessions.get(id) },
    sessionProjections: {
      register(d) { def = d },
      stateOf(session, key) {
        assert.equal(key, 'novenDock')
        let state = def.init()
        for (const e of session.snapshotEvents()) state = def.apply(state, e)
        return state
      },
    },
    on(name, fn) { assert.equal(name, 'agent/pre-step'); preSteps.push(fn) },
    async step(session) {
      const agent = { session }
      for (const fn of preSteps) {
        const decision = await fn({ agent, signal: new AbortController().signal }, async () => ({ kind: 'enter', messages: [] }))
        // 模仿 agent-loop：decision.messages 落进会话日志
        for (const m of decision.messages) session.append('user/message', m)
      }
    },
  }
}

/** 可增长的会话：append 同步进日志。 */
function liveSession(id, events = []) {
  const log = [...events]
  let seq = log.length ? log.at(-1).seq : 0
  return { id, snapshotEvents: () => [...log], append(type, data) { log.push(ev(++seq, type, data)) } }
}

const pairs = new DockPairs()
// 主线 forkAt=10：挂窗日志前 10 条与主线共享，end-seed 在 seq 11
pairs.add('main', { dockId: 'dock', forkAt: 11 })
const main = liveSession('main', [umsg(8, '主线早说的话'), amsg(9, '主线早回的话'), ev(10, 'turn/end', {})])
const dock = liveSession('dock', [umsg(8, '主线早说的话'), amsg(9, '主线早回的话'), ev(10, 'turn/end', {}), ev(11, 'session/end-seed', {})])
const ctx = fakeCtx(new Map([['main', main], ['dock', dock]]))
registerTail(ctx, pairs)

// 挂窗第一步：拿身份简报；主线还没有分叉后的新内容 → 没有尾随
await ctx.step(dock)
const intro = dock.snapshotEvents().find(e => e.data?.source?.kind === 'noven-dock')
assert.ok(intro, '挂窗第一步应注入身份简报')
assert.ok(intro.data.content[0].text.includes('挂窗分叉'))

// 挂窗第二步：简报不再重复
await ctx.step(dock)
assert.equal(dock.snapshotEvents().filter(e => e.data?.source?.kind === 'noven-dock').length, 1, '简报只注入一次')

// 主线新产生一轮 → 挂窗下一step 收到【主线动态】
main.append('user/message', userMsg('主线新问'))
main.append('assistant/message', { message: { content: [{ type: 'text', text: '主线新答' }] } })
await ctx.step(dock)
const tail1 = dock.snapshotEvents().find(e => e.data?.source?.kind === 'noven-dock-peer')
assert.ok(tail1, '挂窗应收到主线动态')
assert.ok(tail1.data.content[0].text.includes('主线新问'))
assert.ok(tail1.data.content[0].text.includes('主线新答'))
assert.equal(tail1.data.source.peer, 'main')
assert.ok(tail1.data.source.uptoSeq > 10)

// 挂窗再走一步：同一批内容不重复注入
await ctx.step(dock)
assert.equal(dock.snapshotEvents().filter(e => e.data?.source?.kind === 'noven-dock-peer').length, 1, '游标去重：旧内容不重发')

// 挂窗新产生一轮真实对话 → 主线下一step 收到【旁窗动态】，且不含注入物
dock.append('user/message', userMsg('挂窗里的提问'))
dock.append('assistant/message', { message: { content: [{ type: 'text', text: '挂窗里的回答' }] } })
await ctx.step(main)
const back = main.snapshotEvents().find(e => e.data?.source?.kind === 'noven-dock-peer')
assert.ok(back, '主线应收到旁窗动态')
const body = back.data.content[0].text
assert.ok(body.includes('主线新问') === false, '主线自己的发言不会绕回')
assert.ok(!body.includes('【主线动态】'), '注入物不被回传')
assert.ok(!body.includes('【身份简报】'), '简报不被回传')
assert.ok(body.includes('挂窗里的提问'), '挂窗用户发言进转述')
assert.ok(body.includes('挂窗里的回答'), '挂窗助手回复进转述')

// 对端缺席：挂窗不在场时主线读不到日志 → 不注入、游标原地等
const lonely = fakeCtx(new Map([['main', main]]))
const pairs2 = new DockPairs()
pairs2.add('main', { dockId: 'dock', forkAt: 11 })
registerTail(lonely, pairs2)
const before = main.snapshotEvents().length
await lonely.step(main)
assert.equal(main.snapshotEvents().length - before, 0, '对端缺席不注入')

console.log('tail.mjs: all assertions passed')
