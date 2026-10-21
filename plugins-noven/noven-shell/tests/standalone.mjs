/**
 * 独立 HTML 导出包装：不依赖宿主时仍内嵌卡数据/资源，并把存档留在本地。
 *
 * Run: node tests/standalone.mjs（先构建 lib/client/）
 * @module noven-shell/tests/standalone
 */
import { islandDoc, standaloneDoc } from '../lib/client/stage-island.js'

let failures = 0
const check = (ok, what) => {
  console.log(`${ok ? 'PASS' : 'FAIL'} ${what}`)
  if (!ok) failures += 1
}

const frame = {
  card: { name: '沈青梧 8', kind: 'CHARACTER' },
  assets: { res1: 'data:image/png;base64,AAAA' },
  theme: { dark: true, accent: '#34D399' },
}
const html = '<img src="novex-asset://res1"><script>NOVEN_FRAME.ready()</script>'

const host = islandDoc(html, frame)
check(host.includes('var STANDALONE = false;'), '宿主包装走在线桥')
check(host.includes('var CARD_STATE = null;'), '宿主包装不内嵌卡快照')
check(host.includes("want(ids[j],WANT[ids[j]])"), '宿主包装向壳请求资源')

const cardState = { name: '沈青梧 8', kind: 'CHARACTER', modules: [{ id: 'm1', name: '档案' }] }
const doc = standaloneDoc(html, frame, cardState)
check(doc.includes('var STANDALONE = true;'), '独立包装标记 standalone')
check(doc.includes('data:image/png;base64,AAAA'), '独立包装内嵌资源 data URL')
check(doc.includes('沈青梧 8') && doc.includes('档案'), '独立包装内嵌卡数据')
check(doc.includes('N.cardRead=function(){ return N.cardState }'), '独立包装 cardRead 读内嵌快照')
check(doc.includes('noven-standalone-save'), '独立包装存档落 localStorage')
check(doc.includes('N.gameSave=function(data){ try{ localStorage.setItem'), '独立包装 gameSave 直接持久化')
check(doc.includes('new MutationObserver(function(){ patchSrc() })'), '独立包装插入时就地替换资源引用')
check(doc.includes("setTimeout(function(){ patchSrc(); dispatch() },0)"), '独立包装首帧主动派发状态')
check(!doc.includes('</script><script>alert('), '卡数据中的脚本闭合被转义')

const escaped = standaloneDoc('<p>x</p>', frame, { name: '</script><script>alert(1)</script>' })
check(escaped.includes('\\u003c/script>'), '卡数据尖括号转义为 JSON unicode')
check(!escaped.includes('</script><script>alert(1)'), '转义后的卡数据无法闭合包装脚本')

const keyed = standaloneDoc('<p>x</p>', frame, cardState, 'noven-game:card-1:mod-1')
check(keyed.includes('var SAVE_KEY="noven-game:card-1:mod-1";'), '独立包装使用按游戏命名的存档键')

check(host.includes("noven:'console'"), '宿主包装转发 console 日志')
check(host.includes('N.screenshot=function'), '宿主包装提供 canvas 截图桥')
check(host.includes("else if(d.noven==='capture')"), '宿主包装响应截图指令')
check(host.includes("connect-src data: blob:"), '沙箱允许 data/blob 纹理与 glTF 加载')

const threeHtml = '<script type="module">import(\'NOVEN_THREE\').then(() => {})</script>'
const withThree = standaloneDoc(threeHtml, frame, cardState, 'noven-game:1:2', 'export const REVISION = 180;')
check(withThree.includes('data:text/javascript;base64,'), '独立包装内联 three.js data URL')
check(!withThree.includes("import('NOVEN_THREE')"), '独立包装不再残留 NOVEN_THREE 裸引用')
check(withThree.includes('script-src \'unsafe-inline\' data: blob:'), '独立包装 CSP 允许 data module')
const hostThree = islandDoc(threeHtml, frame, { threeSource: 'export const REVISION = 180;' })
check(hostThree.includes('data:text/javascript;base64,'), '宿主沙箱也走同一份内联 three 源码')

const noCard = standaloneDoc('<p>x</p>', frame, null)
check(noCard.includes('var CARD_STATE = null;'), '无卡数据时导出 null 而不是 undefined')

console.log(failures === 0 ? 'ALL PASS' : `${failures} FAILURES`)
process.exit(failures === 0 ? 0 : 1)
