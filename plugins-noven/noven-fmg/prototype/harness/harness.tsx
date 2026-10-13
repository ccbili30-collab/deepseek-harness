/**
 * MapEditor 的本地验货页：mock 掉 send/ask/imageUrl，?img=0 走无底图入口。
 * 用法：esbuild 打包后开静态服务；Playwright 截图或人工查看。
 */
import { useState } from 'react'
import { createRoot } from 'react-dom/client'
import { MapEditor } from '../../../noven-shell/src/client/map-editor.tsx'
import { zh, type NovenShellLocaleKey } from '../../../noven-shell/src/client/locales.ts'
import { injectNovenStyles } from '../../../noven-shell/src/client/style.ts'
import type { CardModuleDoc } from '../../../noven-shell/src/client/card-api.ts'

injectNovenStyles()

const t = (k: NovenShellLocaleKey): string => zh[k] ?? k

/** 画一张占位底图：羊皮纸 + 几块大陆色 + 海面，返回 dataURL。 */
function fakeBase(): string {
  const cv = document.createElement('canvas')
  cv.width = 1280; cv.height = 800
  const c = cv.getContext('2d')!
  const g = c.createLinearGradient(0, 0, 1280, 800)
  g.addColorStop(0, '#EFE6D0'); g.addColorStop(1, '#E2D6B8')
  c.fillStyle = g; c.fillRect(0, 0, 1280, 800)
  const blob = (cx: number, cy: number, r: number, color: string, n = 14): void => {
    c.fillStyle = color
    c.beginPath()
    for (let i = 0; i <= n; i++) {
      const a = (i / n) * Math.PI * 2
      const rr = r * (0.75 + 0.25 * Math.sin(i * 2.7 + cx))
      const x = cx + Math.cos(a) * rr, y = cy + Math.sin(a) * rr * 0.7
      i === 0 ? c.moveTo(x, y) : c.lineTo(x, y)
    }
    c.closePath(); c.fill()
  }
  blob(360, 300, 190, '#C9D8B0')
  blob(830, 480, 150, '#C9D8B0')
  blob(1080, 180, 90, '#B8C89E')
  blob(360, 300, 90, '#A9B98E')
  c.strokeStyle = 'rgba(80,70,50,.35)'; c.lineWidth = 3
  c.beginPath(); c.moveTo(120, 640); c.bezierCurveTo(420, 560, 700, 700, 1160, 620); c.stroke()
  return cv.toDataURL('image/png')
}

const BASE = fakeBase()

function Host(): JSX.Element {
  const bare = new URLSearchParams(location.search).get('img') === '0'
  const [data, setData] = useState<Record<string, unknown>>({})
  const module: CardModuleDoc = {
    id: 'm1', name: '地图', blocks: bare ? [] : [{ id: 'b1', kind: 'image', resourceId: 'base' }],
    children: [], characterIds: [], layout: '', tags: [],
    widget: { type: 'map', data },
  }
  return (
    <div className="nv-page-demo">
      <MapEditor
        module={module}
        t={t}
        send={async cmd => {
          if (cmd.kind === 'set_widget_data') setData(cmd.data as Record<string, unknown>)
          console.log('send', cmd)
        }}
        ask={async text => { console.log('ask', text); window.__asks = [...(window.__asks ?? []), text] }}
        imageUrl={id => id === 'base' ? BASE : ''}
        imageResources={[{ id: 'base' }]}
      />
    </div>
  )
}

createRoot(document.getElementById('root')!).render(<Host />)
