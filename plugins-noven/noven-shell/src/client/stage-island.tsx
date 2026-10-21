/** 岛引擎：手机端 HtmlIsland 的 web 等价物——srcdoc 沙箱 iframe + NOVEN_FRAME 包装页。 */
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { fmt, type ShellT } from './pages/Home.tsx'
import { frameReason, type FrameCastRow, type FrameChoices, type FrameEnv, type FrameReason, type FrameSendResult, type FrameTurn, type TranscriptSeg } from './stage-frame.ts'
import type { FoldedArchive } from './stage-archive.ts'

/**
 * 注入岛的契约帧（v0.3，bridgeVersion 2）：v0.2 的
 * {card,state,max,messages,theme} + PC 侧 archive/deltas/assets/session/base，
 * 新增 env/reason/turn/transcript/choices/cast/sendResult。
 * assets 是 id → 工作区相对路径的声明表，包装页把它们解成 blob URL。
 * messages 标弃用（皮肤 overlay 依赖），v0.4 移除；正文请读 transcript。
 */
export interface IslandFrame {
  readonly card?: { readonly name?: string; readonly kind?: string }
  readonly session?: string
  readonly state?: Record<string, unknown>
  readonly max?: Record<string, unknown>
  /** 物化档案（r2 B6）：种子 + 日志增量折叠产物；结构见 FoldedArchive。 */
  readonly archive?: FoldedArchive
  readonly deltas?: readonly unknown[]
  readonly assets?: Record<string, string>
  readonly base?: string
  /** @deprecated v0.3 起由 transcript 承载正文；保留一版兼容皮肤 overlay。 */
  readonly messages?: readonly { readonly role: string; readonly text: string }[]
  /** 结构化叙事流（r2 B1）；段结构见 TranscriptSeg。 */
  readonly transcript?: readonly TranscriptSeg[]
  readonly env?: FrameEnv
  /** 推帧原因；宿主显式赋值优先，缺省时由壳按帧差推导（frameReason）。 */
  readonly reason?: FrameReason
  readonly turn?: FrameTurn
  /** 选项数据转交作品；无选项时 null（r2 B4）。 */
  readonly choices?: FrameChoices | null
  readonly cast?: readonly FrameCastRow[]
  /** send 出站回执（r2 B2）；每次回执是新对象，壳据此推 reason:'send'。 */
  readonly sendResult?: FrameSendResult
  readonly theme?: { readonly dark?: boolean; readonly accent?: string; readonly text?: string; readonly surface?: string }
}

/** 岛→壳出站消息（包装页 postMessage 上来，壳侧按 noven 派发）。 */
export interface IslandCall {
  readonly kind: 'query' | 'compose' | 'picked' | 'err' | 'send' | 'ready' | 'openCard' | 'openModule' | 'navigate'
  readonly domain?: string
  readonly id?: string
  readonly text?: string
  readonly label?: string
  readonly sel?: string
  /** 发起场景（query/compose 的 ?from=<scene>，v0.3 scene 语义）。 */
  readonly from?: string
  /** 调试展示用的处理结果注记（如 send 的回执结果）。 */
  readonly note?: string
  readonly cardId?: string
  readonly moduleId?: string
  readonly itemId?: string
  readonly target?: { readonly cardId?: string, readonly moduleId?: string, readonly itemId?: string }
}

/** 导出参数：独立文件把卡数据/资源内嵌，保存留在本地，不依赖宿主。 */
export interface IslandDocOptions {
  readonly standalone?: boolean
  /** 独立文件可读到卡名/卡类/模块快照（与宿主 cardRead 同形）。 */
  readonly cardState?: unknown
  /** 独立文件的本地存档键；同一游戏重复导出仍接得上原存档。 */
  readonly storageKey?: string
  /** 独立文件内联的 three.js ESM 源码；有它时把 NOVEN_THREE 换成 data URL。 */
  readonly threeSource?: string
  /** 宿主运行时 URL；默认 /api/noven-three。 */
  readonly threeUrl?: string
}

/** UTF-8 → base64（分块，避免大源码触发参数上限）。 */
const base64Utf8 = (text: string): string => {
  const bytes = new TextEncoder().encode(text)
  let binary = ''
  for (let offset = 0; offset < bytes.length; offset += 0x8000) {
    binary += String.fromCharCode(...bytes.subarray(offset, offset + 0x8000))
  }
  return btoa(binary)
}

/**
 * 岛包装页：对齐手机端 wrapIslandDocument——CSP 断网、NOVEN_FRAME 先于
 * 岛脚本注入、noven:frame 热推、ResizeObserver 自报高、error 上报。
 * 多出的是 PC 兜底：query/compose 走 postMessage（浏览器的 location.href
 * 拦不到），asset 声明表解成 blob URL 并回写 src 上的 novex-asset://
 * minis:// novex-res:// 引用，让岛代码三端一字不差。
 * standalone 时帧里的 assets 已是 data URL，cardRead 读内嵌快照，
 * gameSave/gameLoad 落 localStorage——导出的单文件无需宿主也能跑。
 */
export function islandDoc(html: string, frame: IslandFrame, options: IslandDocOptions = {}): string {
  const json = JSON.stringify(frame).replace(/</g, '\\u003c')
  const standalone = options.standalone === true
  const cardJson = JSON.stringify(options.cardState ?? null).replace(/</g, '\\u003c')
  const saveKeyJson = JSON.stringify(options.storageKey ?? 'noven-standalone-save').replace(/</g, '\\u003c')
  const threeData = options.threeSource === undefined ? undefined : `data:text/javascript;base64,${base64Utf8(options.threeSource)}`
  const documentHtml = threeData === undefined ? html : html.replaceAll('NOVEN_THREE', threeData)
  const boot = `(function(){ try{
var STANDALONE = ${standalone ? 'true' : 'false'};
var CARD_STATE = ${cardJson};
var N = window.NOVEN_FRAME = ${json};
if(typeof N.reason!=='string') N.reason='init';
var WANT = N.assets || {};
N.assets = STANDALONE ? WANT : {};
var pending = 0;
function post(m){ if(STANDALONE) return; try{ parent.postMessage(m,'*') }catch(e){} }
function relay(level,args){ var text=''; try{ text=Array.prototype.map.call(args,function(v){ if(typeof v==='string') return v; try{ return JSON.stringify(v) }catch(e){ return String(v) } }).join(' ') }catch(e){ text=String(args) } post({noven:'console',level:level,text:String(text).slice(0,4000)}) }
function merge(p){ for(var k in p){ N[k]=p[k] } }
function dispatch(){ try{ window.dispatchEvent(new Event('noven:frame')) }catch(e){} }
function want(id,path){ if(STANDALONE) return; pending++; post({noven:'assetReq',id:id,path:path,base:N.base}) }
N.asset=function(id){
  if(N.assets[id]) return N.assets[id];
  if(WANT[id]) want(id, WANT[id]);
  return ''
};
N.assetReq=function(id,path){ want(id,String(path)) };
N.query=function(d,i,from){ post({noven:'query',domain:String(d==null?'':d),id:String(i==null?'':i),from:from==null?undefined:String(from)}) };
N.compose=function(t,from){ post({noven:'compose',text:String(t==null?'':t),from:from==null?undefined:String(from)}) };
N.send=function(t){ post({noven:'send',text:String(t==null?'':t)}) };
N.openCard=function(id){ post({noven:'openCard',cardId:String(id==null?'':id)}) };
N.openModule=function(moduleId,itemId){ post({noven:'openModule',moduleId:String(moduleId==null?'':moduleId),itemId:itemId==null?undefined:String(itemId)}) };
N.navigate=function(target){ post({noven:'navigate',target:target||{}}) };
N.cardRead=function(){ post({noven:'cardRead'}) };
N.cardWrite=function(command){ post({noven:'cardWrite',command:command}) };
N.gameSave=function(data){ post({noven:'gameSave',data:data}) };
N.gameLoad=function(){ post({noven:'gameLoad'}) };
N.gamePaused=false;
N.ready=function(){ post({noven:'ready'}) };
N.screenshot=function(){
  try{
    var c=document.querySelector('canvas');
    if(c&&typeof c.toDataURL==='function'){ var data=c.toDataURL('image/png'); post({noven:'screenshot',data:data}); return data }
    // DOM fallback: serialize the sandbox document into an SVG foreignObject image.
    var clone=document.documentElement.cloneNode(true);
    var scripts=clone.querySelectorAll('script'); for(var si=0;si<scripts.length;si++) scripts[si].remove();
    var w=Math.max(document.documentElement.scrollWidth,document.body.scrollWidth,320);
    var h=Math.max(document.documentElement.scrollHeight,document.body.scrollHeight,220);
    var markup=new XMLSerializer().serializeToString(clone);
    var svg='<svg xmlns="http://www.w3.org/2000/svg" width="'+w+'" height="'+h+'"><foreignObject width="100%" height="100%">'+markup+'</foreignObject></svg>';
    var img=new Image();
    img.onload=function(){ try{ var out=document.createElement('canvas'); out.width=w; out.height=h; out.getContext('2d').drawImage(img,0,0); post({noven:'screenshot',data:out.toDataURL('image/png')}) }catch(e){ post({noven:'screenshot',error:String(e)}) } };
    img.onerror=function(){ post({noven:'screenshot',error:'DOM screenshot failed'}) };
    img.src='data:image/svg+xml;charset=utf-8,'+encodeURIComponent(svg);
    return '';
  }catch(e){ post({noven:'screenshot',error:String(e)}); return '' }
};
N.update=function(p){ merge(p||{}); dispatch() };
if(!STANDALONE){ var log0=console.log, warn0=console.warn, err0=console.error; console.log=function(){ log0.apply(console,arguments); relay('log',arguments) }; console.warn=function(){ warn0.apply(console,arguments); relay('warn',arguments) }; console.error=function(){ err0.apply(console,arguments); relay('error',arguments) } }
if(STANDALONE){
  var SAVE_KEY=${saveKeyJson};
  function readSave(){ try{ var raw=localStorage.getItem(SAVE_KEY); return raw===null?null:JSON.parse(raw) }catch(e){ return null } }
  N.cardState=CARD_STATE;
  N.cardRead=function(){ return N.cardState };
  N.cardWrite=function(command){ N.cardWriteResult={ok:false,error:'standalone export is read-only'}; dispatch() };
  N.gameSave=function(data){ try{ localStorage.setItem(SAVE_KEY,JSON.stringify(data)) }catch(e){} N.gameState=data; dispatch() };
  N.gameLoad=function(){ var s=readSave(); N.gameState=s; dispatch(); return s };
  N.gameState=readSave();
}
var HI=null;
function clearHi(){ if(HI){ HI.style.outline=''; HI=null } }
function selOf(el){
  var s=el.tagName.toLowerCase();
  if(el.id) s+='#'+el.id;
  var c=el.getAttribute('class');
  if(c) s+='.'+c.trim().split(/\\s+/).join('.');
  return s
}
var picking=false;
document.addEventListener('click',function(ev){
  if(!picking) return;
  ev.preventDefault(); ev.stopPropagation();
  var el=ev.target; clearHi(); HI=el;
  el.style.outline='2px solid '+((N.theme&&N.theme.accent)||'#34D399');
  var label=(el.getAttribute('data-label')||el.textContent||el.tagName||'').trim().slice(0,60);
  post({noven:'picked',label:label,sel:selOf(el)});
  picking=false;
},true);
function respec(el,s){
  if(/^novex-asset:/.test(s)) return s.slice('novex-asset://'.length);
  if(/^minis:/.test(s)) return s.replace(/^minis:\\/*/, '');
  if(/^novex-res:/.test(s)) return s.replace(/^novex-res:\\/*/, '');
  return null
}
function patchSrc(){
  var els=document.querySelectorAll('[src]');
  for(var i=0;i<els.length;i++){
    var spec=respec(els[i],els[i].getAttribute('src')||'');
    if(spec===null) continue;
    if(N.assets[spec]) els[i].setAttribute('src',N.assets[spec]);
    else if(WANT[spec]) want(spec,WANT[spec]);
    else want(spec,spec);
  }
}
window.addEventListener('message',function(ev){
  var d=ev.data; if(!d||typeof d!=='object') return;
  try{
    if(d.noven==='frame'){ merge(d.patch||{}); patchSrc(); dispatch() }
    else if(d.noven==='asset'){
      pending--;
      if(d.blob){ N.assets[d.id]=URL.createObjectURL(d.blob); patchSrc() }
      dispatch()
    }
    else if(d.noven==='pick'){ picking=!!d.on; if(!picking) clearHi() }
    else if(d.noven==='cardState'){ N.cardState=d.state; dispatch() }
    else if(d.noven==='gameState'){ N.gameState=d.state; dispatch() }
    else if(d.noven==='cardWriteResult'){ N.cardWriteResult=d.result; dispatch() }
    else if(d.noven==='gamePaused'){ N.gamePaused=!!d.paused; dispatch() }
    else if(d.noven==='capture'){ N.screenshot() }
  }catch(msgErr){ post({noven:'err',text:'msg: '+String(msgErr&&msgErr.stack||msgErr).slice(0,400)}) }
});
window.addEventListener('error',function(e){
  var st=''; try{ st=String((e.error&&e.error.stack)||'') }catch(_e){}
  var loc=String(e.filename||'');
  // 沙箱文档里 Chrome 内部注入脚本（自动填充等）读 localStorage 抛
  // SecurityError——堆栈只给 <anonymous>，不是岛代码，不上报。
  if(st.indexOf('srcdoc')<0&&loc.indexOf('srcdoc')<0) return;
  post({noven:'err',text:String(e.message||'error')+' @'+loc.slice(-30)+':'+(e.lineno||0)})
});
window.addEventListener('unhandledrejection',function(e){ post({noven:'err',text:String(e.reason||'rejection')}) });
function report(){
  var b=document.body;
  var h=Math.ceil(Math.max(b?b.scrollHeight:0,document.documentElement.scrollHeight));
  post({noven:'h',h:h})
}
if(typeof ResizeObserver!=='undefined'&&document.body){
  new ResizeObserver(report).observe(document.body)
}
window.addEventListener('load',function(){ report(); patchSrc() });
setTimeout(report,0); setTimeout(report,500);
if(STANDALONE){
  if(typeof MutationObserver!=='undefined'){
    new MutationObserver(function(){ patchSrc() }).observe(document.documentElement,{childList:true,subtree:true})
  }
  setTimeout(function(){ patchSrc(); dispatch() },0)
} else {
  var ids=Object.keys(WANT);
  for(var j=0;j<ids.length;j++){ want(ids[j],WANT[ids[j]]) }
}
}catch(bootErr){ try{ parent.postMessage({noven:'err',text:'boot: '+String(bootErr&&bootErr.stack||bootErr).slice(0,400)},'*') }catch(_e){} }
})()`
    const theme = frame.theme
  const themeCss = theme === undefined ? '' : `:root{${theme.dark === true ? 'color-scheme:dark;' : ''}--nv-accent:${theme.accent ?? ''};--nv-text:${theme.text ?? ''};--nv-primary-text:${theme.text ?? ''};--nv-surface:${theme.surface ?? ''};}`
  return `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta http-equiv="Content-Security-Policy" content="default-src 'none'; img-src data: blob:; style-src 'unsafe-inline'; script-src 'unsafe-inline' data: blob:; font-src data:; media-src 'none'; object-src 'none'; base-uri 'none'; form-action 'none'; connect-src data: blob:"><style>html,body{margin:0;padding:0;background:transparent}${themeCss}</style><script>${boot}</script></head><body>${documentHtml}</body></html>`
}

/** 独立分发文件：卡数据内嵌、资源为 data URL、存档留在浏览器本地。 */
export function standaloneDoc(html: string, frame: IslandFrame, cardState: unknown, storageKey?: string, threeSource?: string): string {
  return islandDoc(html, frame, { standalone: true, cardState, ...(storageKey === undefined ? {} : { storageKey }), ...(threeSource === undefined ? {} : { threeSource }) })
}

/** StageIsland 的命令面：壳侧经 controlRef 调用（目前是选元素开关）。 */
export interface IslandControl {
  readonly setPick: (on: boolean) => void
  /** Ask the game to emit its save payload via NOVEN_FRAME.gameSave. */
  readonly requestSave: () => void
  /** Push a saved payload into the game (NOVEN_FRAME.gameState + event). */
  readonly loadState: (state: unknown) => void
  /** Ask the island to capture its canvas as a PNG data URL. */
  readonly capture: () => void
  /** Pause/resume island animation loops that opt in via NOVEN_FRAME.gamePaused. */
  readonly setPaused: (paused: boolean) => void
}

/** StageIsland 的道具面：html 为岛源，frame 为契约帧（变化走热推不重挂）。 */
export function StageIsland({ html, frame, fillParent = false, cap = 520, t, onCall, onFallback, resolveAsset, controlRef, onCardRead, onCardWrite, onGameSave, onGameLoad, onConsole, onScreenshot, showSource = true, threeSource }: {
  readonly html: string
  readonly frame: IslandFrame
  /** 转录内岛自量高封顶（px）；舞台岛 fillParent 占满。 */
  readonly fillParent?: boolean
  readonly cap?: number
  readonly t: ShellT
  readonly onCall?: (call: IslandCall) => void
  /** 全屏岛的就绪超时/运行中崩溃回退（r2 B7）：回原生对话。仅 fillParent 生效。 */
  readonly onFallback?: () => void
  readonly resolveAsset: (path: string, base?: string) => Promise<Blob | null>
  readonly controlRef?: { current: IslandControl | null }
  /** Card data bridge: called by the sandbox's NOVEN_FRAME.cardRead(). */
  readonly onCardRead?: () => unknown | Promise<unknown>
  /** Card write bridge: the host validates and applies one command. */
  readonly onCardWrite?: (command: unknown) => Promise<{ readonly ok: boolean, readonly error?: string }>
  readonly onGameSave?: (state: unknown) => void
  readonly onGameLoad?: () => unknown | Promise<unknown>
  /** Console lines captured inside the sandbox (AI/dev feedback). */
  readonly onConsole?: (entry: { readonly level: 'log' | 'warn' | 'error', readonly text: string }) => void
  /** Canvas screenshot result; error when the surface has no canvas. */
  readonly onScreenshot?: (result: { readonly data?: string, readonly error?: string }) => void
  /** Show the in-frame source toggle; free surfaces hide it from users. */
  readonly showSource?: boolean
  /** Local three.js source injected as a data URL when the surface imports NOVEN_THREE. */
  readonly threeSource?: string
}) {
  const frameRef = useRef<HTMLIFrameElement | null>(null)
  const [height, setHeight] = useState(fillParent ? 0 : 80)
  const [showSrc, setShowSrc] = useState(false)
  const [error, setError] = useState<string | null>(null)
  // 依赖刻意只挂 html：帧变化走 postMessage 热推，不重建 iframe。
  const srcDoc = useMemo(() => islandDoc(html, frame, threeSource === undefined ? {} : { threeSource }), [html, threeSource])
  const frameJson = JSON.stringify(frame)
  const lastPushed = useRef<IslandFrame | undefined>(undefined)

  // 帧热推：契约帧变化走 postMessage，岛收到 noven:frame——不重挂 iframe。
  // reason 宿主显式赋值优先；缺省按帧差推导（session 变=branch、ime 变=ime…）。
  useEffect(() => {
    const reason = frame.reason ?? frameReason(lastPushed.current, frame)
    lastPushed.current = frame
    frameRef.current?.contentWindow?.postMessage({ noven: 'frame', patch: { ...frame, reason } }, '*')
  }, [frameJson, frame])

  // ready 超时（r2 B7）：全屏岛 8s 不ready 即退回原生对话；html 变=重挂重计。
  // 非全屏件不计时，沿用高度回报判定（B7 兼容条款）。
  const readyTimer = useRef<number | undefined>(undefined)
  const clearReady = useCallback((): void => {
    if (readyTimer.current !== undefined) { window.clearTimeout(readyTimer.current); readyTimer.current = undefined }
  }, [])
  useEffect(() => {
    if (!fillParent || onFallback === undefined) return
    readyTimer.current = window.setTimeout(onFallback, 8000)
    return clearReady
  }, [fillParent, html, onFallback, clearReady])

  useEffect(() => {
    const onMessage = (event: MessageEvent): void => {
      if (event.source !== frameRef.current?.contentWindow) return
      const d = event.data as { noven?: unknown; h?: unknown; id?: unknown; path?: unknown; base?: unknown; domain?: unknown; text?: unknown; label?: unknown; sel?: unknown; blob?: unknown; from?: unknown; level?: unknown; data?: unknown; error?: unknown; cardId?: unknown; moduleId?: unknown; itemId?: unknown; target?: unknown } | null
      if (d === null || typeof d.noven !== 'string') return
      if (d.noven === 'h') {
        const h = Number(d.h)
        if (!Number.isNaN(h) && h > 0) setHeight(Math.min(h, cap))
      } else if (d.noven === 'assetReq') {
        void resolveAsset(String(d.path ?? ''), typeof d.base === 'string' && d.base !== '' ? d.base : undefined)
          .then(blob => {
            frameRef.current?.contentWindow?.postMessage({ noven: 'asset', id: d.id, blob }, '*')
          })
      } else if (d.noven === 'query') {
        onCall?.({ kind: 'query', domain: String(d.domain ?? ''), id: String(d.id ?? ''), from: typeof d.from === 'string' ? d.from : undefined })
      } else if (d.noven === 'compose') {
        onCall?.({ kind: 'compose', text: String(d.text ?? ''), from: typeof d.from === 'string' ? d.from : undefined })
      } else if (d.noven === 'picked') {
        onCall?.({ kind: 'picked', label: String(d.label ?? ''), sel: String(d.sel ?? '') })
      } else if (d.noven === 'send') {
        onCall?.({ kind: 'send', text: String(d.text ?? '') })
      } else if (d.noven === 'openCard') {
        onCall?.({ kind: 'openCard', cardId: String(d.cardId ?? '') })
      } else if (d.noven === 'openModule') {
        onCall?.({ kind: 'openModule', moduleId: String(d.moduleId ?? ''), ...(typeof d.itemId === 'string' ? { itemId: d.itemId } : {}) })
      } else if (d.noven === 'navigate') {
        const target = typeof d.target === 'object' && d.target !== null ? d.target as { cardId?: unknown, moduleId?: unknown, itemId?: unknown } : {}
        onCall?.({ kind: 'navigate', target: {
          ...(typeof target.cardId === 'string' ? { cardId: target.cardId } : {}),
          ...(typeof target.moduleId === 'string' ? { moduleId: target.moduleId } : {}),
          ...(typeof target.itemId === 'string' ? { itemId: target.itemId } : {}),
        } })
      } else if (d.noven === 'gameSave') {
        onGameSave?.((d as { data?: unknown }).data)
      } else if (d.noven === 'gameLoad') {
        Promise.resolve(onGameLoad?.()).then(state => {
          frameRef.current?.contentWindow?.postMessage({ noven: 'gameState', state }, '*')
        }).catch(() => {
          frameRef.current?.contentWindow?.postMessage({ noven: 'gameState', state: null }, '*')
        })
      } else if (d.noven === 'cardRead') {
        Promise.resolve(onCardRead?.()).then(state => {
          frameRef.current?.contentWindow?.postMessage({ noven: 'cardState', state }, '*')
        }).catch(error => {
          frameRef.current?.contentWindow?.postMessage({ noven: 'cardState', state: null, error: String(error) }, '*')
        })
      } else if (d.noven === 'cardWrite') {
        const command = (d as { command?: unknown }).command
        void (onCardWrite?.(command) ?? Promise.resolve({ ok: false, error: 'card write bridge unavailable' }))
          .then(result => frameRef.current?.contentWindow?.postMessage({ noven: 'cardWriteResult', result }, '*'))
          .catch(error => frameRef.current?.contentWindow?.postMessage({ noven: 'cardWriteResult', result: { ok: false, error: String(error) } }, '*'))
      } else if (d.noven === 'console') {
        const level = d.level === 'error' || d.level === 'warn' ? d.level : 'log'
        onConsole?.({ level, text: String(d.text ?? '') })
      } else if (d.noven === 'screenshot') {
        onScreenshot?.(typeof d.data === 'string' && d.data !== '' ? { data: d.data } : { error: String(d.error ?? 'screenshot failed') })
      } else if (d.noven === 'ready') {
        clearReady()
        onCall?.({ kind: 'ready' })
      } else if (d.noven === 'err') {
        // 全屏岛运行中崩溃也算失败（r2 B7），退回原生对话；内联岛只亮错误条。
        if (fillParent && onFallback !== undefined) { clearReady(); onFallback() }
        else setError(String(d.text ?? 'error'))
      }
    }
    window.addEventListener('message', onMessage)
    return () => window.removeEventListener('message', onMessage)
  }, [cap, onCall, resolveAsset, fillParent, onFallback, clearReady, onCardRead, onCardWrite, onGameSave, onGameLoad, onConsole, onScreenshot])

  /** 壳侧入口：开/关选元素捕获（包装页捕获下一次点击并回报）。 */
  const setPick = useCallback((on: boolean): void => {
    frameRef.current?.contentWindow?.postMessage({ noven: 'pick', on }, '*')
  }, [])
  const requestSave = useCallback((): void => {
    frameRef.current?.contentWindow?.postMessage({ noven: 'gameSaveRequest' }, '*')
  }, [])
  const loadState = useCallback((state: unknown): void => {
    frameRef.current?.contentWindow?.postMessage({ noven: 'gameState', state }, '*')
  }, [])
  const capture = useCallback((): void => {
    frameRef.current?.contentWindow?.postMessage({ noven: 'capture' }, '*')
  }, [])
  const setPaused = useCallback((paused: boolean): void => {
    frameRef.current?.contentWindow?.postMessage({ noven: 'gamePaused', paused }, '*')
  }, [])
  useEffect(() => {
    if (controlRef === undefined) return
    controlRef.current = { setPick, requestSave, loadState, capture, setPaused }
    return () => { controlRef.current = null }
  }, [controlRef, setPick, requestSave, loadState, capture, setPaused])

  return (
    <div className={fillParent ? 'nv-isl nv-isl-fill' : 'nv-isl'}>
      {showSource && (
        <button type="button" className="nv-isl-srcbtn" title={t('work.island.src')}
          onClick={() => setShowSrc(v => !v)}>{'</>'}</button>
      )}
      {showSrc ? (
        <pre className="nv-isl-src">{html}</pre>
      ) : (
        <iframe ref={frameRef} sandbox="allow-scripts" className="nv-isl-frame"
          style={fillParent ? undefined : { height }} srcDoc={srcDoc} title={t('work.island.title')} />
      )}
      {error !== null && !showSrc && (
        <div className="nv-isl-err">{fmt(t, 'work.island.err', { err: error })}</div>
      )}
    </div>
  )
}
