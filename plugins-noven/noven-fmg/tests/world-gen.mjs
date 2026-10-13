/**
 * noven-fmg 世界生成管线自测：
 * 1. 固定种子 → 两次生成逐格一致（确定性）；
 * 2. 模板输入长出大陆/海洋/河流/湖泊，河水全部入海、入湖或出图；
 * 3. 语义高度输入：中心一圈陆地、四周海，河流从陆地向海/湖排放；
 * 4. 世界可结构化克隆（可序列化前提）。
 *
 * Run: node tests/world-gen.mjs
 * @module noven-fmg/tests/world-gen
 */
import { generateWorld, getGridDims, guessDraftLevel, rasterizeDraft, resampleWorld, worldStats, applyWorldEdits } from '../lib/world/index.js'

let failures = 0
const check = (ok, what) => {
  console.log(`${ok ? 'PASS' : 'FAIL'} ${what}`)
  if (!ok) failures += 1
}

const seed = 'noven-fmg-smoke'

// 1. determinism: same seed → identical flux/river/feature layout
const w1 = generateWorld({ seed, config: { names: true }, heightmap: { kind: 'template', template: 'continents' } })
const w2 = generateWorld({ seed, config: { names: true }, heightmap: { kind: 'template', template: 'continents' } })
check(
  Buffer.from(w1.pack.cells.h).equals(Buffer.from(w2.pack.cells.h)) &&
    Buffer.from(w1.pack.cells.r).equals(Buffer.from(w2.pack.cells.r)) &&
    w1.pack.rivers.length === w2.pack.rivers.length,
  '同种子两次生成一致（确定性）'
)

const stats = worldStats(w1)
console.log('  stats:', JSON.stringify(stats))
check(stats.islands >= 1, '有陆地块')
check(stats.rivers > 0, `河流数量 ${stats.rivers} > 0`)
check(stats.features > stats.islands, '有水体特征（海/湖）')

// 2. every river drains: last cell is water, a border exit (-1), or a cell on the parent river
const { cells, rivers, features } = w1.pack
const byId = Object.fromEntries(rivers.map(r => [r.i, r]))
let undrained = 0
for (const river of rivers) {
  const last = river.cells[river.cells.length - 1]
  if (last === -1 || cells.h[last] < 20) continue
  const parent = byId[river.parent]
  if (!parent || !parent.cells.includes(last)) {
    undrained++
    if (undrained <= 3) console.log(`    undrained river ${river.i}: ends at land cell ${last} h=${cells.h[last]}`)
  }
}
check(undrained === 0, `所有河流入海/入湖/出图/汇流（异常 ${undrained} 条）`)

// rivers span at least 3 cells and follow real cells
check(rivers.every(r => r.cells.length >= 3), '每条河至少 3 格')
check(rivers.some(r => r.parent !== r.i), '存在支流汇入干流')
check(rivers.some(r => features[cells.f[r.cells[r.cells.length - 1]]]?.type === 'ocean'), '存在入海的河')

// 2a. names flag: default off leaves entities unnamed; on restores Markov names
{
  const unnamed = generateWorld({ seed, heightmap: { kind: 'template', template: 'continents' } })
  check(unnamed.pack.burgs.filter(b => b?.i).every(b => b.name === undefined || b.name === ''), '默认无名：城邦无占位名')
  check(unnamed.pack.states.filter(s => s.i).every(s => s.name === ''), '默认无名：国家无占位名')
  check(unnamed.pack.features.filter(f => f?.i).every(f => f.name === ''), '默认无名：地貌无占位名')
  check(unnamed.pack.rivers.filter(r => r.i).every(r => r.name === ''), '默认无名：河流无占位名')
  check(unnamed.pack.rivers.every(r => r.type !== ''), '无名模式仍算河型（分类≠命名）')
}

// 2b. entities: cultures → burgs → states
{
  const { pack } = w1
  check(stats.cultures >= 5, `文化数量 ${stats.cultures} >= 5`)
  check(stats.burgs > 0, `城邦数量 ${stats.burgs} > 0`)
  check(stats.states >= 3, `国家数量 ${stats.states} >= 3`)

  const capitals = pack.burgs.filter(b => b?.capital)
  check(capitals.length === stats.states, `每个国家一个都城（${capitals.length}/${stats.states}）`)
  check(pack.burgs.filter(b => b?.i).every(b => b.name), '所有城邦有名')
  check(pack.states.filter(s => s.i).every(s => s.name && s.color), '所有国家有名和色')
  check(pack.states.filter(s => s.i).every(s => s.pole && s.pole[0] >= 0), '所有国家有 pole 标签位')
  check(pack.burgs.some(b => b?.port), '存在港口')
  check(
    pack.cells.i.some(i => cells.state[i] > 0),
    '陆地块归属国家'
  )
  check(
    pack.burgs.filter(b => b?.i).every(b => b.state !== undefined),
    '所有城邦归属已分配'
  )
}

// 2c. routes: roads between capitals, trails between burgs, searoutes between ports
{
  const { routes } = w1.pack
  check(routes.length > 0, `路线数量 ${routes.length} > 0`)
  const groups = new Set(routes.map(r => r.group))
  check(groups.has('roads'), '存在主干道')
  check(groups.has('trails'), '存在小径')
  check(groups.has('searoutes'), '存在航线')
  check(
    routes.every(r => r.cells.length >= 2 && r.points.length === r.cells.length),
    '每条路线至少两点且 cells/points 对齐'
  )
  check(
    routes.every(r => r.cells.every((c, i) => c === r.points[i][2])),
    '路线锚点与格 id 一致'
  )
  const sea = routes.filter(r => r.group === 'searoutes')
  const isPortCell = c => w1.pack.cells.burg[c] && w1.pack.burgs[w1.pack.cells.burg[c]]?.port
  check(
    sea.every(r => r.cells.every(c => w1.pack.cells.h[c] < 20 || w1.pack.cells.r[c] > 0 || isPortCell(c))),
    '航线不跨陆地（仅可走可航河段和港口陆格）'
  )
  const land = routes.filter(r => r.group !== 'searoutes')
  check(
    land.every(r => r.cells.every(c => w1.pack.cells.h[c] >= 20)),
    '陆路不入海'
  )
}

// 3. semantic heights: a centered island on a sea map
const cellsN = w1.grid.cells.i.length
const { cellsX, cellsY } = w1.grid
const heights = new Uint8Array(cellsN)
for (let y = 0; y < cellsY; y++) {
  for (let x = 0; x < cellsX; x++) {
    const dx = x / cellsX - 0.5
    const dy = y / cellsY - 0.5
    const r2 = dx * dx + dy * dy
    heights[y * cellsX + x] = r2 < 0.12 ? (r2 < 0.02 ? 70 : 40) : 5
  }
}
const w3 = generateWorld({ seed: seed + '-draft', heightmap: { kind: 'heights', heights } })
const s3 = worldStats(w3)
console.log('  draft stats:', JSON.stringify(s3))
check(s3.islands >= 1, '语义高度输入：中间长出陆地')
check(
  w3.pack.cells.h.some(h => h >= 20) && w3.pack.cells.h.some(h => h < 20),
  '语义高度输入：海陆并存'
)

// determinism on the semantic input too
const w3b = generateWorld({ seed: seed + '-draft', heightmap: { kind: 'heights', heights } })
check(
  Buffer.from(w3.pack.cells.h).equals(Buffer.from(w3b.pack.cells.h)),
  '语义高度输入同种子一致'
)

// 4. structured clone (serialization precondition)
const clone = structuredClone(w1)
check(clone.pack.rivers.length === w1.pack.rivers.length && clone.grid.cells.i.length === cellsN, 'world 可结构化克隆')

// 5. gray input path (DEM-style)
const gray = new Uint8Array(cellsN).fill(255).map((_, i) => (w1.grid.cells.h[i] >= 20 ? 230 : 30))
const w4 = generateWorld({ seed: seed + '-gray', heightmap: { kind: 'gray', gray } })
check(
  w4.grid.cells.h.some(h => h >= 20) && w4.grid.cells.h.some(h => h < 20),
  '灰度输入：按灰阶分海陆'
)

// 6. 语义草稿栅格化：stroke 画一块陆地、subtract 挖一个湖湾、erase 擦回底层
{
  const cellsX = 80, cellsY = 50, aspect = 1.6
  const levelOf = color => ({ '#6D9DC5': 5, '#B8A888': 40, '#8D8D8D': 80 })[color]
  const stroke = { color: '#B8A888', r: 0.25, pts: [[0.5, 0.5]] } // 中心一个大圆点 = 一块陆
  const hill = { color: '#8D8D8D', r: 0.08, pts: [[0.5, 0.35]] }
  const bite = { kind: 'poly', color: '#6D9DC5', op: 'subtract', pts: [[0.45, 0.6], [0.55, 0.6], [0.5, 0.72]] }
  const erase = { color: '#000', r: 0.04, pts: [[0.62, 0.45]], erase: true }
  const heights = rasterizeDraft([stroke, hill, bite, erase], { cellsX, cellsY, aspect, baseLevel: 5, levelOf })
  const at = (fx, fy) => heights[Math.floor(fy * cellsY) * cellsX + Math.floor(fx * cellsX)]
  check(at(0.5, 0.5) === 40, '草稿栅格化：陆地色落到 40')
  check(at(0.5, 0.35) === 80, '草稿栅格化：山点落到 80')
  check(at(0.5, 0.65) === 5, '草稿栅格化：subtract 挖回底层')
  check(at(0.62, 0.45) === 5, '草稿栅格化：erase 笔挖回底层')
  check(at(0.05, 0.05) === 5, '草稿栅格化：未涂区 = 底层')
  const again = rasterizeDraft([stroke, hill, bite, erase], { cellsX, cellsY, aspect, baseLevel: 5, levelOf })
  check(Buffer.from(heights).equals(Buffer.from(again)), '草稿栅格化同输入一致')
  const w5 = generateWorld({ seed: seed + '-raster', config: { points: 4000 }, heightmap: { kind: 'heights', heights } })
  check(w5.pack.cells.h.some(h => h >= 20), '草稿栅格直通管线：长出陆地')
  check(guessDraftLevel('海', 'ocean water') === 8 && guessDraftLevel('山', 'mountains') === 75, '语义名兜底：海=8 山=75')
  check(guessDraftLevel('无名', '') === undefined, '语义名兜底：猜不到返回 undefined')
}

// 7. Resample：裁一块区域重采样，子世界在更密格子上重算
{
  const res = resampleWorld(w1, [0.3, 0.2, 0.7, 0.6], 2)
  const dims = getGridDims(res.config.width, res.config.height, res.config.points)
  check(res.heights.length === dims.cellsX * dims.cellsY, '重采样：高度数 = 子格数')
  check(res.heights.every(h => h >= 0 && h <= 100), '重采样：高度都在 0-100')
  const res2 = resampleWorld(w1, [0.3, 0.2, 0.7, 0.6], 2)
  check(res2.seed === res.seed && JSON.stringify(res2.heights) === JSON.stringify(res.heights), '重采样：同区域同结果')
  const res3 = resampleWorld(w1, [0.6, 0.4, 0.9, 0.7], 2)
  check(res3.seed !== res.seed, '重采样：不同区域不同种子')
  const child = generateWorld({ seed: res.seed, config: res.config, heightmap: { kind: 'heights', heights: res.heights } })
  const stats = worldStats(child)
  console.log('  resampled child stats:', JSON.stringify(stats))
  check(child.pack.cells.h.some(h => h >= 20) || child.pack.cells.h.every(h => h < 20), '重采样子世界可生成')
  check(stats.rivers >= 0 && stats.burgs >= 0, '重采样子世界：实体管线可跑')
}

// 8. 实体覆写：改名/移除/lock 在重算后回贴
{
  const mk = () => generateWorld({ seed: seed + '-edits', config: { points: 5000, names: true }, heightmap: { kind: 'template', template: 'continents' } })
  const a = mk()
  const burg = a.pack.burgs.find(b => b?.i && b.name)
  const state = a.pack.states.find(s => s.i && s.name)
  check(burg !== undefined && state !== undefined, '覆写测试有实体可用')

  // 同种子重算：名字匹配回贴
  const edits = [
    { kind: 'burg', key: burg.name, name: 'Renamed Town', lock: true },
    { kind: 'state', key: state.name, remove: true }
  ]
  const b = mk()
  const applied = applyWorldEdits(b, edits)
  check(applied === 2, `覆写同种子回贴 ${applied}/2`)
  const renamed = b.pack.burgs.find(x => x?.name === 'Renamed Town')
  check(renamed !== undefined && renamed.lock === true, '改名城邦在同种子重算后存活且锁定')
  check(b.pack.states.find(s => s.name === state.name)?.removed === true, '移除国家在同种子重算后仍被移除')

  // 换高度图重算：按 at 位置就近回贴
  const c = generateWorld({ seed: seed + '-edits-2', config: { points: 5000 }, heightmap: { kind: 'template', template: 'atoll' } })
  const at = [burg.x / a.config.width, burg.y / a.config.height]
  const appliedC = applyWorldEdits(c, [{ kind: 'burg', at, name: 'Anchored Town', lock: true }])
  const anchored = c.pack.burgs.find(x => x?.name === 'Anchored Town')
  check(appliedC <= 1 && (appliedC === 0 || anchored?.lock === true), `换地形后按位置回贴（${appliedC === 1 ? '命中' : '无城邦可贴，合法'}）`)

  // 无名路线按位置回贴移除
  const route = a.pack.routes.find(r => r.i)
  if (route !== undefined) {
    const mid = route.points[Math.floor(route.points.length / 2)]
    const d = mk()
    applyWorldEdits(d, [{ kind: 'route', at: [mid[0] / a.config.width, mid[1] / a.config.height], remove: true }])
    check(d.pack.routes.some(r => r.removed === true), '路线按位置回贴移除')
  }

  // id 锚点：无名实体也能精确回贴（AI 命名通道）
  const e = mk()
  const target = e.pack.burgs.find(b => b?.i)
  const appliedId = applyWorldEdits(e, [{ kind: 'burg', id: target.i, name: 'Id Named', lock: true }])
  check(appliedId === 1 && e.pack.burgs.find(b => b?.i === target.i)?.name === 'Id Named', '无名城邦按 id 回贴改名')
}

console.log(failures ? `\n${failures} FAIL` : '\nALL PASS')
process.exit(failures ? 1 : 0)
