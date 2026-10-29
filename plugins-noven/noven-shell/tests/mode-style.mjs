/** Noven's third macOS leading control must widen the titlebar clearance. */
import { readFileSync } from 'node:fs'

let failures = 0
const check = (ok, what) => {
  console.log(`${ok ? 'PASS' : 'FAIL'} ${what}`)
  if (!ok) failures += 1
}
const style = readFileSync(new URL('../src/client/style.ts', import.meta.url), 'utf8')
const frame = readFileSync(new URL('../../../packages/client/ui-layout/src/client/AppFrame.module.css', import.meta.url), 'utf8')
const canvas = readFileSync(new URL('../src/client/canvas.tsx', import.meta.url), 'utf8')
const sessionNavigation = readFileSync(new URL('../src/client/session-navigation.tsx', import.meta.url), 'utf8')
check(frame.includes('--dsh-frame-leading-clearance: 160px'), '默认 DSH 普通窗口安全区保持 160px')
check(frame.includes('--dsh-frame-leading-clearance: 84px'), '默认 DSH 全屏安全区保持 84px')
check(style.includes(":root:is([data-platform='darwin'], [data-chrome-platform='darwin'])[data-noven-shell] [data-sidebar-collapsed] { --dsh-frame-leading-clearance: 196px; }"), 'Noven 普通窗口为第三个控件预留 196px')
check(style.includes(":root[data-platform='darwin'][data-fullscreen][data-noven-shell] [data-sidebar-collapsed] { --dsh-frame-leading-clearance: 120px; }"), 'Noven 全屏窗口为第三个控件预留 120px')
check(style.includes(".nv-leading-mode .nv-mode-switch { width: 28px; height: 28px; margin: 0; border-radius: 50%; }"), 'Mac 顶部模式按钮为 28px 且无额外边距')
check(!style.includes("[data-slot='conversation.header'] [data-conversation-tabs] { display: none; }"), '对话视图切换不再被 Noven CSS 隐藏')
check(!style.includes("[data-zone='features'] { display: none; }"), '画布功能导航不再被 Noven CSS 隐藏')
check(canvas.includes('data-noven-canvas-switch') && canvas.includes('data-noven-canvas-tools'), '自绘画布补齐页签切换与工具菜单')
check(sessionNavigation.includes("t(returning ? 'nav.contentTree' : 'nav.sessions')"), '会话列表与返回内容树使用明确命名')
check(style.includes("document.documentElement.dataset.chromePlatform = 'darwin'"), 'Noven Web 在挂载前启用独立 macOS 呈现标记')
check(frame.includes("html:is([data-platform='darwin'], [data-chrome-platform='darwin'])"), 'Mac 顶栏几何同时服务真实 Desktop 与 Web 镜像')
check(!frame.includes(":is([data-platform='darwin'], [data-chrome-platform='darwin'])[data-fullscreen]"), '原生全屏几何不被 Web 镜像伪造')

console.log(failures === 0 ? 'ALL PASS' : `${failures} FAILURES`)
process.exit(failures === 0 ? 0 : 1)
