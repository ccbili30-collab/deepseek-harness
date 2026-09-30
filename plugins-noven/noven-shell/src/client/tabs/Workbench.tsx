/**
 * 工作台 — the work-mode canvas living inside the right Sidebar as a native
 * tab (`noven:workbench`). Opening it widens the right column toward the
 * design's canvas share while the conversation keeps its place on the left;
 * closing or switching tabs restores the narrow rail. The file tree opens
 * from the breadcrumb as an overlay and can pin to the canvas's right edge.
 *
 * The widening is a plugin-side stylesheet override: DSH's public layout face
 * exposes no right-column width setter, so while this tab is visible the
 * component marks the frame and panel elements and `nv-wb` CSS widens both.
 * @module noven-shell/client/tabs/Workbench
 */
import { useEffect, useRef, useState } from 'react'
import type { UseSidebarRightTabInfo } from '@deepseek-ai/dsh-client-ui-sidebar-right/client'
import type { ShellT } from '../pages/Home.tsx'
import { asset } from '../data.ts'
import { glyph } from '../icons.tsx'

interface Props { readonly useTabInfo: UseSidebarRightTabInfo; readonly t: ShellT }

type View = 'home' | 'exhibit' | 'doc'

interface TreeItem { readonly id: string; readonly name: string; readonly icon: 'map' | 'file' | 'image' }
interface TreeGroup { readonly title: string; readonly items: readonly TreeItem[] }

/** One file-tree group; leaf ids open a view inside the canvas. */
const TREE: readonly TreeGroup[] = [
  { title: '首页', items: [{ id: 'home', name: '山门地图', icon: 'map' }] },
  { title: '人物志', items: [
    { id: 'doc-shenyan', name: '沈砚.md', icon: 'file' },
    { id: 'doc-yunhe', name: '云鹤.md', icon: 'file' },
    { id: 'doc-linwan', name: '林晚.md', icon: 'file' },
  ] },
  { title: '门派史', items: [{ id: 'doc-history', name: '继任规则.md', icon: 'file' }] },
  { title: '故事集', items: [{ id: 'doc-night', name: '继任夜.md', icon: 'file' }] },
  { title: '漫画', items: [{ id: 'img-comic', name: '四格草稿.png', icon: 'image' }] },
]

/** Region chips floated over the homepage map, echoing the 06c comp. */
const MAP_SPOTS: readonly { name: string; x: string; y: string; fresh?: boolean }[] = [
  { name: '藏经峰', x: '30%', y: '24%' },
  { name: '掌教大殿', x: '52%', y: '42%' },
  { name: '沈砚居所', x: '62%', y: '56%', fresh: true },
  { name: '寒潭', x: '36%', y: '74%' },
]

/** Walk up from `el` to the outermost element carrying an inline style needle. */
const styledAncestor = (el: HTMLElement | null, needle: string): HTMLElement | null => {
  let found: HTMLElement | null = null
  for (let n = el; n; n = n.parentElement) if (n.getAttribute('style')?.includes(needle)) found = n
  return found
}

function TreeBody({ onPick, active }: { readonly onPick: (id: string) => void; readonly active: string }) {
  return (
    <>
      {TREE.map(group => (
        <div key={group.title} className="nv-wb-tree-group">
          <h5>{group.title}</h5>
          {group.items.map(item => (
            <button key={item.id} className="nv-tree-row" data-active={active === item.id} onClick={() => onPick(item.id)}>
              <span className="nv-wb-tree-ic">{item.icon === 'map' ? glyph.map(14) : item.icon === 'image' ? glyph.image(14) : glyph.file(14)}</span>
              {item.name}
            </button>
          ))}
        </div>
      ))}
      <button className="nv-wb-allfiles">全部文件</button>
    </>
  )
}

export function WorkbenchTab({ t, useTabInfo }: Props) {
  const { tab } = useTabInfo()
  const visible = tab.visible
  const root = useRef<HTMLDivElement>(null)
  const [view, setView] = useState<View>('home')
  const [treeOpen, setTreeOpen] = useState(false)
  const [pinned, setPinned] = useState(false)
  const [doc, setDoc] = useState('doc-shenyan')

  /* While this tab is the visible one the right column becomes the canvas:
   * mark the frame (grid template) and the Sidebar panel (inline width) so the
   * injected stylesheet widens both; restoring removes the marks. */
  useEffect(() => {
    if (!visible) return
    const frame = styledAncestor(root.current, 'grid-template-columns')
    const panel = styledAncestor(root.current, '--dsh-sidebar-width')
    frame?.setAttribute('data-noven-canvas', '')
    panel?.setAttribute('data-noven-canvas-panel', '')
    return () => {
      frame?.removeAttribute('data-noven-canvas')
      panel?.removeAttribute('data-noven-canvas-panel')
    }
  }, [visible])

  const pick = (id: string) => {
    if (id === 'home') setView('home')
    else { setDoc(id); setView('doc') }
    setTreeOpen(false)
  }

  const docName = TREE.flatMap(g => g.items).find(i => i.id === doc)?.name ?? '沈砚.md'

  return (
    <div ref={root} className="nv-wb">
      <div className="nv-wb-top">
        <button className="nv-wb-crumb" onClick={() => setTreeOpen(v => !v)}>
          青玄门 <span className="sep">/</span> {view === 'doc' ? docName : view === 'exhibit' ? '展览' : '首页 · 山门地图'}
          <span className="chev">▾</span>
        </button>
        <button className="nv-link nv-wb-cardlink">世界卡 · 青玄门 ↗</button>
        <span className="nv-wb-switch">
          <button data-active={view !== 'exhibit'} onClick={() => setView('home')}>{t('wb.home')}</button>
          <button data-active={view === 'exhibit'} onClick={() => setView('exhibit')}>{t('wb.exhibit')}</button>
        </span>
        <button className="nv-iconbtn" data-active={pinned} title={t('wb.pin')} onClick={() => setPinned(v => !v)}>{glyph.pin(14)}</button>
        <button className="nv-wb-collapse" onClick={() => tab.actions.close()}>{t('wb.collapse')}</button>
      </div>
      <div className="nv-wb-layout">
        {treeOpen && !pinned && (
          <div className="nv-wb-tree nv-wb-tree--float">
            <div className="nv-wb-tree-head">
              <span className="nv-wb-tree-search"><SearchGlyph /><input placeholder={t('wb.searchFiles')} /></span>
              <button className="nv-iconbtn" title={t('wb.pin')} onClick={() => { setPinned(true); setTreeOpen(false) }}>{glyph.pin(13)}</button>
            </div>
            <TreeBody onPick={pick} active={view === 'doc' ? doc : view} />
          </div>
        )}
        <div className="nv-wb-stage">
          {view === 'home' && (
            <div className="nv-wb-map">
              <img src={asset('wb-map.webp')} alt={t('wb.mapAlt')} />
              {MAP_SPOTS.map(s => (
                <button key={s.name} className="nv-wb-spot" data-fresh={s.fresh} style={{ left: s.x, top: s.y }}>{s.name}</button>
              ))}
            </div>
          )}
          {view === 'exhibit' && (
            <div className="nv-wb-exhibit">
              {TREE.filter(g => g.title !== '首页').map(g => (
                <section key={g.title}>
                  <h4>{g.title}</h4>
                  <div className="nv-wb-exhibit-grid">
                    {g.items.map(i => (
                      <button key={i.id} className="nv-card nv-wb-excard" onClick={() => pick(i.id)}>
                        <span className="nv-wb-excard-ic">{i.icon === 'image' ? glyph.image(20) : glyph.file(20)}</span>
                        {i.name}
                      </button>
                    ))}
                  </div>
                </section>
              ))}
            </div>
          )}
          {view === 'doc' && (
            <article className="nv-wb-doc">
              <h2>{docName.replace(/\.md$/, '')}</h2>
              <p className="nv-wb-doc-meta">人物志 · 青玄门 · 长老</p>
              <p>沈砚，青玄门长老，掌寒潭戒律殿。二十年前继任联署中投了唯一的反对票，此后不再过问继任之事。</p>
              <p>性沉静，授课极严，弟子私下称其「砚台」——硬而冷，磨出来的字却最好看。居所位于寒潭西侧竹林深处，非召不入。</p>
              <p>与掌门云鹤同辈，少年时曾联署上书废除血亲继任，后因藏经峰一案转而主张「继任必三方联署」，门规空白处至今留有其手书。</p>
            </article>
          )}
        </div>
        {pinned && (
          <div className="nv-wb-tree nv-wb-tree--pinned">
            <div className="nv-wb-tree-head">
              <span className="nv-wb-tree-search"><SearchGlyph /><input placeholder={t('wb.searchFiles')} /></span>
              <button className="nv-iconbtn" data-active title={t('wb.unpin')} onClick={() => setPinned(false)}>{glyph.pin(13)}</button>
            </div>
            <TreeBody onPick={pick} active={view === 'doc' ? doc : view} />
          </div>
        )}
      </div>
    </div>
  )
}

function SearchGlyph() {
  return (
    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
      <circle cx="11" cy="11" r="7" /><path d="m21 21-4.3-4.3" />
    </svg>
  )
}
