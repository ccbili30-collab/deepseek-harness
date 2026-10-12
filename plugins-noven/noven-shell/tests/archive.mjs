/**
 * 档案日志重放测试（r2 B6）：collectDeltas 从 assistant 原文抽 novex-use
 * 信封，foldArchive 按「同 domain+id 字段绝对覆盖」折叠。分支截断由事件流
 * 天然提供——这里用消息列表截断等价验证「只看到祖先增量」的折叠结果。
 *
 * Run: node tests/archive.mjs（先 tsc，测的是 lib/client/ 产物）
 * @module noven-shell/tests/archive
 */
import { collectDeltas, foldArchive } from '../lib/client/stage-archive.js'

let failures = 0
const check = (ok, what) => {
  console.log(`${ok ? 'PASS' : 'FAIL'} ${what}`)
  if (!ok) failures += 1
}
const eq = (a, b) => JSON.stringify(a) === JSON.stringify(b)

const use = (data, name = '档') =>
  '```novex-use\n' + JSON.stringify({ name, data }) + '\n```'

const msgs = [
  { seq: 10, role: 'user', text: '开局' },
  {
    seq: 11, role: 'assistant', text: '旁白。\n' + use({
      scene: '京城',
      hud: { 声望: 10 },
      delta: { persons: [{ id: '赵九', hp: 100, 立场: '中立' }] },
      events: ['进城'],
    }),
  },
  { seq: 12, role: 'user', text: '继续' },
  {
    seq: 13, role: 'assistant', text: use({
      hud: { 声望: 12 },
      delta: { persons: [{ id: '赵九', hp: 80 }, { id: '阿七', hp: 30 }] },
      fog: { asof: 2 },
    }),
  },
]

// 1. 顺序折叠：两条 assistant 消息的增量合成一份档案。
{
  const ds = collectDeltas(msgs)
  check(ds.length === 2, `1a 增量数 ${ds.length} = 2`)
  check(eq(ds.map(d => d.messageId), ['11', '13']), '1b 增量锚定消息 id')
  const { archive, state } = foldArchive({}, ds)
  check(archive.scene === '京城', '1c scene 保留')
  check(archive.hud['声望'] === 12, '1d hud 后者覆盖')
  check(eq(archive.entities.persons['赵九'], { hp: 80, 立场: '中立' }), '1e 同 id 字段级合并')
  check(eq(archive.entities.persons['阿七'], { hp: 30 }), '1f 新实体入库')
  check(archive.fog.asof === 2, '1g fog 并入')
  check(eq(archive.events, ['进城']), '1h events 保留最近一次提供轮（13 未给 events）')
  void state
}

// 2. 分支截断：只折叠到第一条增量 = 第二条不存在的世界线。
{
  const { archive } = foldArchive({}, collectDeltas(msgs.slice(0, 2)))
  check(archive.hud['声望'] === 10 && archive.entities.persons['赵九'].hp === 100
    && archive.entities.persons['阿七'] === undefined,
    '2 截断折叠只见第一条增量')
}

// 3. 绝对值语义：负数字段是设定值不是加减（D4 拍板）。
{
  const ds = [
    { messageId: '1', seq: 1, name: '档', fullscreen: false, data: { delta: { armies: [{ id: 'a', strength: 5000 }] } } },
    { messageId: '2', seq: 2, name: '档', fullscreen: false, data: { delta: { armies: [{ id: 'a', strength: -3000 }] } } },
  ]
  const { archive } = foldArchive({}, ds)
  check(archive.entities.armies['a'].strength === -3000,
    `3 绝对值覆盖：strength = ${archive.entities.armies['a'].strength}（应为 -3000，非 2000）`)
}

// 4. 种子回退：无增量时种子 archive/state 原样供出；增量只在种子之上折叠。
{
  const seed = {
    archive: { scene: '旧京', hud: { 声望: 3 }, entities: { persons: { 赵九: { hp: 50 } } }, events: ['旧档'] },
    state: { 章节: 7 },
  }
  const a = foldArchive(seed, [])
  check(a.archive.scene === '旧京' && a.archive.hud['声望'] === 3
    && a.archive.entities.persons['赵九'].hp === 50 && eq(a.archive.events, ['旧档'])
    && a.state['章节'] === 7, '4a 种子原样回退')
  const b = foldArchive(seed, collectDeltas([msgs[1]]))
  check(b.archive.hud['声望'] === 10 && b.archive.entities.persons['赵九'].hp === 100
    && b.archive.entities.persons['赵九']['立场'] === '中立', '4b 增量在种子上折叠')
  check(b.state['章节'] === 7, '4c 种子 state 不被增量清空')
}

// 5. state 增量与异常行：data.state 浅并入 state；缺 id/非对象行跳过不炸。
{
  const ds = collectDeltas([{
    seq: 1, role: 'assistant', text: use({
      delta: { persons: [{ hp: 1 }, 'junk', { id: 'ok', hp: 9 }] },
      state: { 旗: true },
    }),
  }])
  const { archive, state } = foldArchive({}, ds)
  check(archive.entities.persons['ok'].hp === 9 && state['旗'] === true, '5 异常行跳过 + state 并入')
}

// 6. 200 回合折叠耗时应 << 100ms（B6 冷启动目标）。
{
  const big = []
  for (let i = 0; i < 200; i++) {
    big.push({ messageId: String(i), seq: i, name: '档', fullscreen: false, data: {
      hud: { 回合: i },
      delta: { persons: [{ id: `p${i % 20}`, hp: i }] },
      events: [`e${i}`],
    } })
  }
  const t0 = performance.now()
  const { archive } = foldArchive({}, big)
  const ms = performance.now() - t0
  check(archive.hud['回合'] === 199 && archive.entities.persons['p0'].hp === 180 && ms < 100,
    `6 200 回合折叠 ${ms.toFixed(1)}ms < 100ms`)
}

console.log(failures === 0 ? 'ALL PASS' : `${failures} FAILURES`)
process.exit(failures === 0 ? 0 : 1)
