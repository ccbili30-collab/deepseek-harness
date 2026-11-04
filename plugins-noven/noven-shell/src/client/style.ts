/**
 * Noven product stylesheet, injected once per document load. The plugin
 * bundle carries no CSS module pipeline, so the styles ship as one scoped
 * `<style>` element with `nv-` class names plus a small set of `--nv-*`
 * design tokens that mirror the approved design system.
 * @module noven-shell/client/style
 */
import { CODE_CSS } from './code/code-style.ts'

const CSS = `${CODE_CSS}

/* 随包字体：标题思源黑体（650 子集）与输入框灵感句文楷。均为 OFL，
   许可证在 assets/fonts/；子集只保留当前用字，避免整包数十 MB。 */
@font-face {
  font-family: 'Source Han Sans SC';
  src: url('/api/noven-assets?name=source-han-sans-650.woff2') format('woff2');
  font-weight: 650; font-style: normal; font-display: swap;
}
@font-face {
  font-family: 'LXGW WenKai';
  src: url('/api/noven-assets?name=wenkai-quote.woff2') format('woff2');
  font-weight: 400; font-style: normal; font-display: swap;
}
:root {
  --nv-canvas: #F4F5F4;
  --nv-pane: #F7F8F9;
  --nv-surface: #FFFFFF;
  --nv-divider: #ECEEEF;
  --nv-primary-text: #16181A;
  --nv-secondary-text: #8A8F94;
  --nv-accent: #34D399;
  --nv-accent-deep: #0E9F6E;
  --nv-accent-soft: rgba(52, 211, 153, 0.12);
  --nv-select: var(--nv-accent-deep);
  --nv-hover: rgba(22, 24, 26, 0.05);
  --nv-radius: 12px;
  --nv-badge-dark: rgba(20, 24, 22, 0.72);
  --nv-inverse-surface: #16181A;
  --nv-inverse-text: #FFFFFF;

  /* 语义色：危险（删除/出错）与提醒（草稿/冲突/待复核）各一族，不再散写色值。 */
  --nv-danger: #D64545;
  --nv-danger-soft: rgba(214, 69, 69, 0.10);
  --nv-danger-line: rgba(214, 69, 69, 0.40);
  --nv-warn: #B45309;
  --nv-warn-soft: #FEF3C7;

  /* 动效词表（设计理念 §四）：新样式只从这四档 + 三条曲线里挑。
     micro=悬停/按下 · ui=菜单/抽屉/遮罩/行内态 · scene=页面/ghost · ceremony=仪式（CardPick/开场）。 */
  --nv-dur-micro: 120ms;
  --nv-dur-ui: 200ms;
  --nv-dur-scene: 320ms;
  --nv-dur-ceremony: 520ms;
  --nv-ease-out: cubic-bezier(0.2, 0.9, 0.25, 1);
  --nv-ease-in: cubic-bezier(0.5, 0, 0.75, 0.4);
  --nv-ease-spring: cubic-bezier(0.18, 0.85, 0.3, 1.1);

  /* 产品模式使用 scene 档；共享 ui-layout 在未覆盖时仍走 DSH 默认。 */
  --dsh-frame-mode-duration: var(--nv-dur-scene);
  --dsh-frame-mode-easing: var(--nv-ease-out);

}

/* 品牌重映射：上游 DSH 蓝的 alias 层 → 诺文薄荷绿。上游组件（工作区
   浏览器、composer 发送钮、链接、选中态、焦点环）都走这层 token。
   必须落在 body 上——alias 定义在 body 级，:root 的继承值压不过它；
   !important 再压过 html[data-platform='darwin'] body 的 mac 段。 */
body {
  --dsw-alias-state-business-primary: var(--nv-accent-deep) !important;
  --dsw-alias-state-business-tertiary: var(--nv-accent-soft) !important;
  --dsw-alias-button-info-fill: var(--nv-accent-deep) !important;
  --dsw-alias-button-info-hover: var(--nv-accent) !important;
  --dsw-alias-link: var(--nv-accent-deep) !important;
  --dsw-specific-sidebar-nav-item-active-accent: var(--nv-accent-soft) !important;
  --dsw-specific-bubble: var(--nv-accent-soft) !important;
  --dsw-specific-bubble-highlight: rgba(52, 211, 153, 0.22) !important;
}
body[data-ds-dark-theme] {
  --nv-canvas: var(--dsw-alias-bg-layer-2);
  --nv-pane: var(--dsw-alias-bg-layer-2);
  --nv-surface: var(--dsw-alias-bg-layer-1);
  --nv-divider: var(--dsw-alias-border-l1);
  --nv-primary-text: var(--dsw-alias-label-primary);
  --nv-secondary-text: var(--dsw-alias-label-secondary);
  --nv-hover: var(--dsw-alias-interactive-bg-hover, rgba(232, 235, 234, 0.06));
  --nv-inverse-surface: #E8EBEA;
  --nv-inverse-text: #131615;
  --nv-warn-soft: rgba(180, 83, 9, 0.22);
  --dsw-alias-state-business-primary: var(--nv-accent) !important;
  --dsw-alias-state-business-tertiary: rgba(52, 211, 153, 0.18) !important;
  --dsw-alias-button-info-fill: var(--nv-accent) !important;
  --dsw-alias-button-info-hover: var(--nv-accent-deep) !important;
  --dsw-alias-link: var(--nv-accent) !important;
  --dsw-specific-sidebar-nav-item-active-accent: rgba(52, 211, 153, 0.18) !important;
  --dsw-specific-bubble: rgba(52, 211, 153, 0.18) !important;
  --dsw-specific-bubble-highlight: rgba(52, 211, 153, 0.28) !important;
}
/* 处理态行（正在分析请求 等）的活动图标用主题色，不再是上游灰。 */
[data-step-process-icon] { color: var(--nv-accent-deep) !important; }
body[data-ds-dark-theme] [data-step-process-icon] { color: var(--nv-accent) !important; }

/* ── 交互原语（ui/interact.tsx）：二次确认 / 弹层 / 回执 ── */
/* 诺文菜单统一弹出：锚点下方轻放大淡入，不动上游 Menu 包。 */
.nv-tree-newmenu, .nv-menu-pop { transform-origin: top right; animation: nv-menu-in var(--nv-dur-ui) var(--nv-ease-out); }
@keyframes nv-menu-in { from { opacity: 0; transform: scale(0.97) translateY(-2px); } to { opacity: 1; transform: none; } }
/* 菜单内二次确认：武装后的行转红，文字轻推入。 */
.nv-armed { color: var(--nv-danger); font-weight: 500; display: inline-block; animation: nv-armed-in var(--nv-dur-micro) var(--nv-ease-out); }
@keyframes nv-armed-in { from { opacity: 0.4; transform: translateX(-3px); } to { opacity: 1; transform: none; } }
.nv-armbtn[data-armed] { color: var(--nv-danger) !important; background: var(--nv-danger-soft) !important; border-color: var(--nv-danger-line) !important; }
/* 统一弹层（askConfirm / askText） */
.nv-veil { position: fixed; inset: 0; z-index: 1000; display: grid; place-items: center; }
.nv-veil-mask { position: absolute; inset: 0; background: rgba(16, 20, 18, 0.18); backdrop-filter: blur(2px);
  animation: nv-veil-fade var(--nv-dur-ui) var(--nv-ease-out); }
.nv-veil-card { position: relative; width: min(360px, calc(100vw - 48px)); padding: 18px 18px 14px; border-radius: 14px;
  background: var(--nv-surface); color: var(--nv-primary-text); box-shadow: 0 18px 48px rgba(16, 20, 18, 0.18), 0 0 0 0.5px var(--nv-divider);
  animation: nv-veil-in var(--nv-dur-ui) var(--nv-ease-out); }
.nv-veil[data-leaving] .nv-veil-mask { animation: nv-veil-out 160ms var(--nv-ease-in) forwards; }
.nv-veil[data-leaving] .nv-veil-card { animation: nv-veil-card-out 160ms var(--nv-ease-in) forwards; }
@keyframes nv-veil-fade { from { opacity: 0; } to { opacity: 1; } }
@keyframes nv-veil-out { to { opacity: 0; } }
@keyframes nv-veil-in { from { opacity: 0; transform: translateY(6px) scale(0.98); } to { opacity: 1; transform: none; } }
@keyframes nv-veil-card-out { to { opacity: 0; transform: translateY(4px) scale(0.98); } }
.nv-veil-title { font-size: 14px; font-weight: 600; line-height: 1.45; }
.nv-veil-body { margin-top: 6px; font-size: 12.5px; line-height: 1.6; color: var(--nv-secondary-text); }
.nv-veil-input { margin-top: 12px; width: 100%; box-sizing: border-box; height: 34px; padding: 0 10px; border-radius: 8px;
  border: 0.5px solid var(--nv-divider); background: var(--nv-pane); font: inherit; font-size: 13px; color: inherit; outline: none;
  transition: border-color var(--nv-dur-micro) ease, background var(--nv-dur-micro) ease; }
.nv-veil-input:focus { border-color: var(--nv-accent-deep); background: var(--nv-surface); }
.nv-veil-actions { display: flex; justify-content: flex-end; gap: 8px; margin-top: 16px; }
.nv-veil-btn { height: 30px; padding: 0 14px; border-radius: 8px; border: 0.5px solid var(--nv-divider); background: var(--nv-surface);
  font: inherit; font-size: 12.5px; color: var(--nv-primary-text); cursor: pointer; transition: background var(--nv-dur-micro) ease; }
.nv-veil-btn:hover { background: var(--nv-hover); }
.nv-veil-ok { border-color: transparent; background: var(--nv-accent-deep); color: #fff; }
.nv-veil-ok:hover { background: var(--nv-accent-deep); filter: brightness(1.06); }
.nv-veil-ok[data-danger] { background: var(--nv-danger); }
.nv-veil-ok:disabled { opacity: 0.45; cursor: default; filter: none; }
/* 删除回执（notifyUndo）：底部居中，撤销是唯一可点处。 */
.nv-undo { position: fixed; left: 50%; bottom: 28px; z-index: 1001; display: flex; align-items: center; gap: 14px;
  padding: 9px 10px 9px 16px; border-radius: 999px; background: rgba(22, 24, 26, 0.92); color: #fff; font-size: 12.5px;
  box-shadow: 0 10px 30px rgba(16, 20, 18, 0.22); transform: translateX(-50%);
  animation: nv-undo-in var(--nv-dur-ui) var(--nv-ease-out); }
.nv-undo[data-leaving] { animation: nv-undo-out 160ms var(--nv-ease-in) forwards; }
@keyframes nv-undo-in { from { opacity: 0; transform: translate(-50%, 8px); } to { opacity: 1; transform: translate(-50%, 0); } }
@keyframes nv-undo-out { to { opacity: 0; transform: translate(-50%, 6px); } }
.nv-undo-undo { border: 0; background: rgba(255, 255, 255, 0.12); color: var(--nv-accent); font: inherit; font-weight: 600;
  padding: 3px 10px; border-radius: 999px; cursor: pointer; transition: background var(--nv-dur-micro) ease; }
.nv-undo-undo:hover { background: rgba(255, 255, 255, 0.2); }
@media (prefers-reduced-motion: reduce) {
  .nv-tree-newmenu, .nv-menu-pop, .nv-armed, .nv-veil-mask, .nv-veil-card, .nv-undo { animation: none !important; }
}

/* 敬请期待（社区/消息灰置）：点击行抖动后，屏幕中央浮一张纸色卡。 */
.nv-soon-overlay { position: fixed; inset: 0; z-index: 1100; display: grid; place-items: center;
  background: rgba(16, 20, 18, 0); opacity: 0; transition: opacity 200ms ease; }
.nv-soon-overlay[data-open='true'] { opacity: 1; background: rgba(16, 20, 18, 0.16); backdrop-filter: blur(2px); }
.nv-soon-card { min-width: 200px; padding: 22px 30px; border-radius: 14px; background: var(--nv-surface, #fff);
  color: var(--nv-secondary-text, #444); font-size: 14px; letter-spacing: 0.06em; text-align: center;
  border: 0.5px solid var(--nv-divider, rgba(0,0,0,0.08));
  box-shadow: 0 24px 64px rgba(16, 20, 18, 0.18);
  transform: translateY(10px) scale(0.96); opacity: 0; transition: transform 260ms cubic-bezier(0.2, 0, 0, 1), opacity 200ms ease; }
.nv-soon-overlay[data-open='true'] .nv-soon-card { transform: none; opacity: 1; }
.nv-soon-overlay[data-open='false'] .nv-soon-card { transform: translateY(6px) scale(0.98); opacity: 0; }
/* 灰置导航保留可点击解释；glyph 标记让标准 panel 行整体降对比。 */
button:has(.nv-nav-soon-glyph) { opacity: 0.42; }
button:has(.nv-nav-soon-glyph):hover { opacity: 0.7; }
.nv-nav-soon-glyph { display: inline-flex; }
.nv-page { height: 100%; min-height: 0; overflow-y: auto; background: var(--nv-surface); color: var(--nv-primary-text); font-size: 13px;
  animation: nv-page-in var(--nv-dur-scene) var(--nv-ease-out); }
/* Resolves in with opacity only. A full-page filter blur() entrance is the
   most expensive frame cost in every scene that mounts a page beside a View
   Transition (measured: p95 50ms → 33ms on long Sessions); the fade carries
   the same "resolve, don't flash" intent without a repaint of the whole page. */
@keyframes nv-page-in {
  from { opacity: 0.55; }
  to { opacity: 1; }
}
/* Outgoing-page clone: covers the swap frame, then lifts away so the old
   page exits instead of vanishing. Inner animations freeze so the ghost
   doesn't replay the entrance it already played. */
.nv-ghost { z-index: 60; }
.nv-ghost * { animation: none !important; }
.nv-ghost-out { opacity: 0; transform: translateY(-6px); transition: opacity var(--nv-dur-scene) var(--nv-ease-out), transform var(--nv-dur-scene) var(--nv-ease-out); }
.nv-inner { max-width: 1080px; margin: 0 auto; padding: 26px 32px 56px; display: flex; flex-direction: column; gap: 18px; }
.nv-inner--narrow { max-width: 760px; }
.nv-h1 { font-size: 20px; font-weight: 700; letter-spacing: -0.01em; }
.nv-sub { font-size: 13px; color: var(--nv-secondary-text); margin-top: 4px; }
.nv-h2 { font-size: 15px; font-weight: 700; }
.nv-card { background: var(--nv-surface); border: 0.5px solid var(--nv-divider); border-radius: var(--nv-radius); }
.nv-pill { display: inline-flex; align-items: center; gap: 5px; border: 0; border-radius: 999px; padding: 6px 16px; font-size: 13px; color: var(--nv-secondary-text); background: transparent; cursor: pointer; }
.nv-pill[data-active='true'] { background: var(--nv-inverse-surface); color: var(--nv-inverse-text); }
.nv-btn-primary { display: inline-flex; align-items: center; justify-content: center; gap: 6px; border: 0; border-radius: 999px; padding: 9px 20px; font-size: 13px; font-weight: 600; background: var(--nv-accent); color: #fff; cursor: pointer; }
.nv-btn-primary:hover { background: var(--nv-accent-deep); }
.nv-btn-primary:disabled { opacity: .5; cursor: default; }
.nv-btn-ghost { display: inline-flex; align-items: center; justify-content: center; gap: 6px; border: 1px solid var(--nv-divider); border-radius: 999px; padding: 8px 18px; font-size: 13px; background: var(--nv-surface); color: var(--nv-primary-text); cursor: pointer; }
.nv-btn-ghost:hover { border-color: var(--nv-secondary-text); }
.nv-btn-dark { display: inline-flex; align-items: center; justify-content: center; border: 0; border-radius: 999px; padding: 8px 20px; font-size: 13px; font-weight: 600; background: var(--nv-inverse-surface); color: var(--nv-inverse-text); cursor: pointer; }
.nv-search { display: flex; align-items: center; gap: 8px; background: var(--nv-surface); border: 0.5px solid var(--nv-divider); border-radius: 999px; padding: 9px 16px; color: var(--nv-secondary-text); }
.nv-search input { border: 0; outline: none; background: none; font-size: 13px; flex: 1; color: var(--nv-primary-text); font-family: inherit; }
.nv-search input::placeholder { color: var(--nv-secondary-text); }
.nv-tag { display: inline-flex; align-items: center; gap: 4px; border-radius: 999px; padding: 3px 10px; font-size: 11px; background: var(--nv-surface); border: 0.5px solid var(--nv-divider); color: var(--nv-secondary-text); }
.nv-tag .dot { width: 6px; height: 6px; border-radius: 50%; background: var(--nv-accent); }
.nv-badge-cover { position: absolute; top: 10px; left: 10px; background: var(--nv-badge-dark); color: #fff; font-size: 11px; border-radius: 6px; padding: 3px 8px; }
.nv-badge-enter { position: absolute; bottom: 10px; right: 10px; background: rgba(255,255,255,.92); color: var(--nv-accent-deep); font-size: 11px; font-weight: 600; border-radius: 999px; padding: 3px 10px; }
.nv-avatar { border-radius: 50%; background: var(--nv-accent-soft); color: var(--nv-accent-deep); display: inline-flex; align-items: center; justify-content: center; font-weight: 700; flex: none; overflow: hidden; }
.nv-avatar img { width: 100%; height: 100%; object-fit: cover; }
.nv-empty { display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 8px; padding: 72px 0; color: var(--nv-secondary-text); font-size: 13px; }
.nv-link { color: var(--nv-accent-deep); font-size: 12px; font-weight: 600; border: 0; background: none; cursor: pointer; padding: 0; }
.nv-iconbtn { display: inline-flex; align-items: center; justify-content: center; width: 30px; height: 30px; border: 0.5px solid var(--nv-divider); border-radius: 8px; background: var(--nv-surface); color: var(--nv-secondary-text); cursor: pointer; }

/* ===== 首页 ===== */
.nv-feed-tabs { display: flex; align-items: center; gap: 20px; }
.nv-feed-tab { border: 0; background: none; padding: 6px 2px; font-size: 15px; font-weight: 700; color: var(--nv-secondary-text); cursor: pointer; border-bottom: 2px solid transparent; }
.nv-feed-tab[data-active='true'] { border-bottom-color: var(--nv-accent); }
.nv-feed-pills { display: flex; gap: 4px; background: var(--nv-surface); border: 0.5px solid var(--nv-divider); border-radius: 999px; padding: 3px; }
.nv-masonry { columns: 2; column-gap: 18px; }
/* Feed cards are objects: pure tiles with captions floating in the page air. */
.nv-tcard { break-inside: avoid; margin-bottom: 22px; display: flex; flex-direction: column; gap: 9px; width: 100%; padding: 0; border: 0; background: none; text-align: left; cursor: pointer; }
.nv-tcard-tile { position: relative; display: block; border-radius: 14px; overflow: hidden; transition: transform var(--nv-dur-ui) var(--nv-ease-out), box-shadow var(--nv-dur-ui) var(--nv-ease-out); }
.nv-tcard-tile img { width: 100%; display: block; }
.nv-tcard:hover .nv-tcard-tile { transform: translateY(-2px); box-shadow: 0 10px 24px rgba(0,0,0,.10); }
.nv-tcard-text { display: flex; flex-direction: column; gap: 8px; padding: 18px 18px 30px; background: var(--nv-accent-soft); }
.nv-tcard-text .tt-title { font-size: 15px; font-weight: 700; }
.nv-tcard-text .tt-desc { font-size: 12.5px; color: var(--nv-secondary-text); line-height: 1.65; }
.nv-tcard-cap { display: flex; flex-direction: column; gap: 4px; padding: 0 2px; }
.nv-tcard-cap strong { font-size: 14px; font-weight: 600; }
.nv-tcard-meta { display: flex; align-items: center; gap: 6px; font-size: 12px; color: var(--nv-secondary-text); }
.nv-tcard-meta .nv-avatar { width: 18px; height: 18px; font-size: 9px; }
.nv-tcard-acts { margin-left: auto; display: inline-flex; align-items: center; gap: 12px; }
.nv-tcard-acts > span { display: inline-flex; align-items: center; gap: 4px; }
.nv-fcard-author { display: flex; align-items: center; gap: 7px; font-size: 12px; color: var(--nv-secondary-text); }
.nv-fcard-author .nv-avatar { width: 20px; height: 20px; font-size: 10px; }
.nv-fcard-author .spacer { flex: 1; }
.nv-bookmark { border: 0; background: none; color: var(--nv-secondary-text); cursor: pointer; display: inline-flex; }

/* 落地页侧栏 */
.nv-landing { position: absolute; top: 0; right: 0; bottom: 0; width: 400px; background: var(--nv-surface); border-left: 0.5px solid var(--nv-divider); display: flex; flex-direction: column; animation: nv-slide-in var(--nv-dur-ui) var(--nv-ease-out); z-index: 5; }
@keyframes nv-slide-in { from { transform: translateX(40px); opacity: 0; } to { transform: none; opacity: 1; } }
.nv-landing-close { position: absolute; top: 14px; right: 14px; width: 30px; height: 30px; border-radius: 50%; border: 0; background: rgba(128,128,128,.12); cursor: pointer; font-size: 16px; color: var(--nv-primary-text); z-index: 2; }
.nv-landing-scroll { flex: 1; overflow-y: auto; padding: 30px 26px; display: flex; flex-direction: column; gap: 16px; }
.nv-landing-foot { display: flex; gap: 10px; padding: 14px 22px; border-top: 0.5px solid var(--nv-divider); }
.nv-landing-foot .nv-btn-primary { flex: 1; }
.nv-landing-foot .nv-btn-ghost { flex: 1; }
.nv-section-head { display: flex; align-items: baseline; justify-content: space-between; }
.nv-section-head small { color: var(--nv-secondary-text); font-size: 12px; }
.nv-mod-list { display: flex; flex-direction: column; }
.nv-mod-item { display: flex; flex-direction: column; gap: 3px; padding: 10px 0; border-bottom: 0.5px solid var(--nv-divider); }
.nv-mod-item:last-child { border-bottom: 0; }
.nv-mod-item h4 { margin: 0; font-size: 13px; font-weight: 600; }
.nv-mod-item p { margin: 0; font-size: 12px; color: var(--nv-secondary-text); line-height: 1.6; }
.nv-role-row { display: flex; gap: 18px; }
.nv-role { display: flex; flex-direction: column; align-items: center; gap: 6px; }
.nv-role .nv-avatar { width: 46px; height: 46px; font-size: 16px; }
.nv-role span { font-size: 12px; color: var(--nv-secondary-text); }
.nv-fork-row { display: flex; align-items: center; justify-content: space-between; font-size: 13px; padding: 12px 0; }

::view-transition-group(noven-create-composer) { animation-duration: 420ms; animation-timing-function: cubic-bezier(.2,.72,.12,1); }
::view-transition-old(noven-create-composer) { animation: nv-create-composer-out 420ms cubic-bezier(.2,.72,.12,1) both; }
::view-transition-new(noven-create-composer) { animation: nv-create-composer-in 420ms cubic-bezier(.2,.72,.12,1) both; }
@keyframes nv-create-composer-out { to { opacity: .18; filter: blur(2px); } }
@keyframes nv-create-composer-in { from { opacity: .35; filter: blur(2px); } to { opacity: 1; filter: none; } }
/* Conversation scene: the ritual furniture's farewell above the incoming
   page — the title rises away, the path cards sink and follow. */
::view-transition-old(noven-create-intro) { animation: nv-create-intro-out 280ms var(--nv-ease-in) both; }
::view-transition-old(noven-create-paths) { animation: nv-create-paths-out 260ms var(--nv-ease-in) 40ms both; }
@keyframes nv-create-intro-out { to { opacity: 0; transform: translateY(-16px); } }
@keyframes nv-create-paths-out { to { opacity: 0; transform: translateY(12px); } }
/* Paper & desk: the creation page is a sheet that rises from below and covers
   the desk; leaving replays the same path downward. The desk (the Session work
   layer) never travels — it only recedes and dims under the sheet, then
   returns to focus. Both legs are one gesture played forwards and backwards:
   same axis, same curve, same durations. */
::view-transition-old(noven-create-page) { animation: nv-sheet-drop 400ms cubic-bezier(.2,.72,.12,1) both; }
html[data-create-scene='enter']::view-transition-new(noven-create-page) { animation: nv-sheet-rise 400ms cubic-bezier(.2,.72,.12,1) both; }
html[data-create-scene='enter']::view-transition-old(noven-work) { animation: nv-desk-recede 380ms var(--nv-ease-out) both; }
html[data-create-scene='conversation']::view-transition-new(noven-work) { animation: nv-desk-focus 380ms var(--nv-ease-out) both; }
html[data-create-scene='handcraft']::view-transition-new(noven-work) { animation: nv-desk-focus 380ms var(--nv-ease-out) both; }
/* The UA blends captured groups with plus-lighter; a plain crossfade is both
   what these scenes mean and the cheaper compositing path over full-screen
   snapshots. */
html[data-create-scene]::view-transition-group(noven-work),
html[data-create-scene]::view-transition-group(noven-create-page),
html[data-create-scene]::view-transition-old(noven-work),
html[data-create-scene]::view-transition-old(noven-create-page),
html[data-create-scene]::view-transition-new(noven-work),
html[data-create-scene]::view-transition-new(noven-create-page),
html[data-panel-handoff]::view-transition-group(noven-work),
html[data-panel-handoff]::view-transition-old(noven-work),
html[data-panel-handoff]::view-transition-new(noven-work) { mix-blend-mode: normal; }
@keyframes nv-sheet-rise { from { opacity: 0; transform: translateY(28px) scale(.98); } }
@keyframes nv-sheet-drop { to { opacity: 0; transform: translateY(28px) scale(.98); } }
@keyframes nv-desk-recede { to { opacity: .85; transform: scale(.985); } }
@keyframes nv-desk-focus { from { opacity: .85; transform: scale(.985); } }
@media (prefers-reduced-motion: reduce) {
  ::view-transition-group(noven-create-composer), ::view-transition-old(noven-create-composer), ::view-transition-new(noven-create-composer),
  ::view-transition-old(noven-create-intro), ::view-transition-old(noven-create-paths),
  ::view-transition-old(noven-create-page), ::view-transition-new(noven-create-page),
  ::view-transition-old(noven-work), ::view-transition-new(noven-work) { animation: none; }
}

/* Creation ritual: one quiet thought field, then two explicit working paths.
   The page centers its column inside the center column (the session page's
   reference frame), so the hero→session morph never slides sideways. */
.nv-create-page { overflow: hidden; box-sizing: border-box; display: flex; flex-direction: column;
  /* The page's own View Transition name lives here, not on one scene: every
     transition the page takes part in — entering, leaving for any Session,
     morphing into the conversation, dissolving into the IDE — captures it as
     the same named group, and its entrance/exit keyframes below are canonical. */
  view-transition-name: noven-create-page;
  /* The mint bloom is part of the composition: anchored on the title's line
     (30% ≈ the lifted stack's head), strong enough to read (.075 was lost to
     white), fading out before the path cards so the fold stays clean. */
  background:
  radial-gradient(circle at 50% 30%, rgba(52,211,153,.12), transparent 42%), var(--nv-surface); }
html[data-noven-conversation-appearance] .nv-create-page { background: transparent; }
.nv-create-topbar { display: flex; height: 48px; flex: none; align-items: center; justify-content: flex-end; padding: 0 12px; }
.nv-create-ritual { width: min(920px, calc(100% - 64px)); flex: 1; min-height: 0; margin: 0 auto; padding: 0;
  box-sizing: border-box; display: flex; flex-direction: column; align-items: stretch; gap: 12px; overflow-y: auto; scrollbar-width: none; }
/* The stack is the anchor, not any element in it: the leading spacer parks
   the column's center at 46% of the page (above center — the fold lands past
   the path cards, and the whole page reads as one lifted cluster). 190px =
   half the resting stack plus the flex gaps; the spacer shrinks away on short
   windows and the column scrolls, so nothing clips. */
.nv-create-ritual::before { content: ""; display: block; flex: 0 1 calc(46% - 190px); min-height: 20px; }
.nv-create-ritual::-webkit-scrollbar { display: none; }
.nv-create-intro { width: min(100%, 720px); max-width: 720px; text-align: center; margin: 0 auto; }
/* 花体签名：替代原来的「NOVEN · 创作现场」眉题。系统花体栈，macOS/Windows
   各有原生字体；Linux 退回 cursive。 */
.nv-create-signature { display: block; margin-bottom: 10px; font-family: "Snell Roundhand", "Apple Chancery", "Segoe Script", "Brush Script MT", cursive;
  font-size: 17px; line-height: 1.2; color: var(--nv-accent-deep); letter-spacing: .01em; }
/* 打字行：整句随字宽居中，前缀和对象始终连在一起；不预留空槽，避免短词时
   整行偏左。横向的轻微位移就是打字本身的节奏。 */
.nv-create-typed { margin: 0; display: flex; align-items: baseline; justify-content: center;
  font-family: "Source Han Sans SC", "Noto Sans SC", "PingFang SC", "Microsoft YaHei", sans-serif;
  font-size: clamp(30px, 4vw, 46px); line-height: 1.15; letter-spacing: -.02em; font-weight: 650;
  white-space: nowrap; }
/* 整句同色：前缀和后半句都是黑的，靠字体本身撑住分量。 */
.nv-create-typed-prefix { color: var(--nv-primary-text); font-weight: 650; }
.nv-create-typed-word { display: inline-block; margin-left: .16em; color: var(--nv-primary-text); font-weight: 650; }
.nv-create-caret { display: inline-block; width: 2px; height: .92em; margin-left: .08em; vertical-align: -.08em;
  background: var(--nv-accent-deep); animation: nv-create-caret 1s step-end infinite; }
@keyframes nv-create-caret { 0%, 100% { opacity: 1; } 50% { opacity: 0; } }
/* 标题下的小说句：上下滚动轮播、点击换句；宽度取最长句，避免跟标题宽度抖动。 */
.nv-create-novel { position: relative; display: block; width: max-content; max-width: 100%;
  height: 1.7em; margin: 10px auto 0; padding: 0; border: 0; appearance: none; background: none;
  font-family: "LXGW WenKai", "Kaiti SC", "STKaiti", "KaiTi", serif;
  font-size: 15px; font-weight: 400; line-height: 1.7; color: var(--nv-secondary-text);
  text-align: center; cursor: pointer; }
.nv-create-novel-ruler { display: grid; height: 1.7em; visibility: hidden; overflow: hidden; pointer-events: none; }
.nv-create-novel-ruler > span { grid-area: 1 / 1; white-space: nowrap; }
.nv-create-novel:focus-visible { outline: 2px solid var(--nv-accent); outline-offset: 4px; border-radius: 4px; }
.nv-create-novel-line { position: absolute; inset: 0; display: block; text-align: center;
  white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.nv-create-novel-out { animation: nv-create-novel-out 520ms cubic-bezier(.22,.61,.36,1) both; }
.nv-create-novel-in { animation: nv-create-novel-in 520ms cubic-bezier(.22,.61,.36,1) both; }
@keyframes nv-create-novel-out { from { transform: translateY(0); opacity: 1; } to { transform: translateY(-105%); opacity: 0; } }
@keyframes nv-create-novel-in { from { transform: translateY(105%); opacity: 0; } to { transform: translateY(0); opacity: 1; } }
@media (prefers-reduced-motion: reduce) {
  .nv-create-caret { animation: none; opacity: 1; }
  .nv-create-novel-out, .nv-create-novel-in { animation: none; }
}
/* The embedded real composer (conversation.content) sits in the same 780px
   column as the old card; the hero's own brand shell stays home — the ritual
   page keeps the composer alone as the hero. */
.nv-create-hero { width: min(780px, 100%); margin: 0 auto; }
.nv-create-hero [data-conversation-hero-shell] { display: none; }
/* 输入框占位轮播：33 句世界观前提落在原生占位层，文楷；原生 placeholder 让位。 */
.nv-input-quote { position: absolute; inset: 4px 8px auto 14px; z-index: 1; pointer-events: none; user-select: none;
  font-family: "LXGW WenKai", "Kaiti SC", "STKaiti", "KaiTi", serif; font-size: inherit; line-height: inherit;
  color: var(--dsw-alias-label-caption, var(--nv-secondary-text));
  white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
[data-composer-card]:has(.nv-input-quote) [data-composer-placeholder] { visibility: hidden; }
.nv-create-paths { width: min(780px, 100%); margin: 0 auto; display: grid; grid-template-columns: 1fr 1fr; gap: 10px; }
.nv-create-path { min-width: 0; display: grid; grid-template-columns: 34px minmax(0,1fr) 18px; align-items: center; gap: 11px;
  padding: 13px 14px; border: .5px solid var(--nv-divider); border-radius: 14px; background: rgba(255,255,255,.72); color: var(--nv-primary-text);
  text-align: left; cursor: pointer; transition: transform 220ms var(--nv-ease-out), border-color 220ms ease, background 220ms ease, box-shadow 220ms ease; }
.nv-create-path:hover { transform: translateY(-2px); border-color: rgba(14,159,110,.28); background: var(--nv-surface); box-shadow: 0 10px 28px rgba(28,64,51,.07); }
.nv-create-path-icon { width: 34px; height: 34px; border-radius: 11px; display: grid; place-items: center; color: var(--nv-accent-deep); background: var(--nv-accent-soft); }
.nv-create-path > span:nth-child(2) { display: flex; flex-direction: column; gap: 3px; min-width: 0; }
.nv-create-path strong { font-size: 13px; font-weight: 650; }
.nv-create-path small { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; font-size: 11.5px; color: var(--nv-secondary-text); }
.nv-create-path-arrow { color: var(--nv-secondary-text); font-size: 14px; transition: transform 220ms var(--nv-ease-out); }
.nv-create-path:hover .nv-create-path-arrow { transform: translate(2px,-2px); color: var(--nv-accent-deep); }
.nv-create-inline-error { width: min(780px,100%); margin: -8px auto 0; font-size: 11.5px; color: var(--nv-danger); }
/* Handcraft scene (creation-transition.ts): the clicked card lifts as the
   seed while the ritual page drops away as the shared sheet (the general
   old(noven-create-page) rule); the IDE then lands region by region — drawer,
   canvas, conversation. One View Transition carries the whole commit, so the
   Session's default page turn never runs underneath. */
::view-transition-old(noven-handcraft-seed) { animation: nv-ide-seed-lift 340ms var(--nv-ease-out) both; }
::view-transition-group(noven-handcraft-seed) { z-index: 3; }
::view-transition-new(noven-ide-drawer) { animation: nv-ide-drawer-in var(--nv-dur-scene) var(--nv-ease-out) 90ms both; }
::view-transition-new(noven-ide-canvas) { animation: nv-ide-canvas-in var(--nv-dur-scene) var(--nv-ease-out) 150ms both; }
::view-transition-new(noven-ide-chat) { animation: nv-ide-chat-in var(--nv-dur-scene) var(--nv-ease-out) 210ms both; }
@keyframes nv-ide-seed-lift {
  30% { opacity: 1; transform: translateY(-18px) scale(1.05); filter: drop-shadow(0 16px 30px rgba(28,64,51,.2)); }
  to { opacity: 0; transform: translateY(-34px) scale(1.08); filter: drop-shadow(0 24px 44px rgba(28,64,51,0)); }
}
@keyframes nv-ide-drawer-in { from { opacity: 0; transform: translateX(-16px); } }
@keyframes nv-ide-canvas-in { from { opacity: 0; transform: translateY(16px) scale(.99); } }
@keyframes nv-ide-chat-in { from { opacity: 0; transform: translateY(12px); } }
@media (max-width: 760px) {
  .nv-create-ritual { width: min(100% - 32px, 920px); }
  .nv-create-paths { grid-template-columns: 1fr; }
  .nv-create-typed { font-size: 31px; }
}
@media (prefers-reduced-motion: reduce) {
  .nv-create-path, .nv-create-mini { transition: none; }
}

/* Creation slot shelf: pure artwork tiles, captions live in the page air below. */
.nv-slots { display: flex; gap: 18px; }
.nv-slot { display: flex; flex-direction: column; gap: 10px; width: 170px; padding: 0; border: 0; background: none; text-align: left; cursor: pointer;
  transition: width var(--nv-dur-scene) var(--nv-ease-out), opacity var(--nv-dur-ui) ease, transform var(--nv-dur-ui) ease, margin-right var(--nv-dur-scene) var(--nv-ease-out); }
/* Delete: dissolve.ts erodes the face pixel by pixel; the column collapses
   underneath the last sparks so neighbours drift into the gap. */
.nv-slot[data-leaving] { animation: none; pointer-events: none; }
.nv-slot[data-leaving] .nv-slot-tile { box-shadow: none; }
.nv-slot[data-leaving][data-collapse] { width: 0; margin-right: -18px; }
.nv-slot-tile { position: relative; display: flex; align-items: center; justify-content: center; aspect-ratio: 3/4; border-radius: 14px; overflow: hidden; background: var(--nv-surface); transition: transform var(--nv-dur-ui) var(--nv-ease-out), box-shadow var(--nv-dur-ui) var(--nv-ease-out); border: 0; padding: 0; cursor: pointer; width: 100%; appearance: none; -webkit-appearance: none; font: inherit; color: inherit; }
.nv-slot-tile img { position: absolute; inset: 0; width: 100%; height: 100%; object-fit: cover; }
.nv-slot:hover:not(:disabled) .nv-slot-tile { transform: translateY(-3px); box-shadow: 0 10px 24px rgba(0,0,0,.10); }
.nv-slot:disabled { cursor: default; }
.nv-slot-empty { border: 1.5px dashed rgba(52,211,153,.55); background: var(--nv-accent-soft); }
.nv-slot-plus { display: flex; color: var(--nv-accent-deep); }
.nv-slot-badge { position: absolute; right: 8px; bottom: 8px; background: rgba(255,255,255,.92); color: var(--nv-accent-deep); font-size: 10.5px; font-weight: 600; border-radius: 999px; padding: 2px 8px; }
.nv-slot-cap { display: flex; flex-direction: column; gap: 2px; }
.nv-slot-cap strong { font-size: 14px; font-weight: 600; }
.nv-slot-cap small { font-size: 12px; color: var(--nv-secondary-text); }
.nv-slot-cap-row { display: flex; align-items: flex-start; gap: 4px; }
.nv-slot-cap-btn { flex: 1; min-width: 0; border: 0; background: none; padding: 0; cursor: pointer; text-align: left; }
.nv-cardmenu { position: relative; }
.nv-cardmenu-dot {
  border: 0; background: none; padding: 0 4px; cursor: pointer;
  color: var(--nv-secondary-text); font-size: 15px; line-height: 1.2;
  border-radius: 5px; opacity: 0; transition: opacity var(--nv-dur-micro) ease;
}
.nv-slot:hover .nv-cardmenu-dot, .nv-cardmenu:has(.nv-cardmenu-pop) .nv-cardmenu-dot { opacity: 1; }
.nv-cardmenu-dot:hover { background: rgba(128,128,128,.14); color: var(--nv-primary-text); }
.nv-cardmenu-mask { position: fixed; inset: 0; z-index: 40; }
.nv-cardmenu-pop {
  position: absolute; right: 0; top: calc(100% + 4px); z-index: 41;
  display: flex; flex-direction: column; min-width: 116px; padding: 4px;
  background: var(--nv-surface, #fff); border-radius: 10px;
  border: 1px solid rgba(128,128,128,.18);
  box-shadow: 0 10px 28px rgba(0,0,0,.14);
}
.nv-cardmenu-pop button {
  border: 0; background: none; padding: 7px 10px; cursor: pointer;
  font-size: 12.5px; color: var(--nv-primary-text); text-align: left; border-radius: 7px;
}
.nv-cardmenu-pop button:hover { background: rgba(128,128,128,.1); }
.nv-cardmenu-pop button[data-armed='true'] { color: #dc2626; background: rgba(220,38,38,.08); }
.nv-me-notice {
  position: fixed; bottom: 32px; left: 50%; transform: translateX(-50%); z-index: 90;
  padding: 9px 16px; border-radius: 10px; max-width: 420px;
  background: rgba(30, 34, 38, 0.92); color: #fff; font-size: 12.5px;
  box-shadow: 0 8px 24px rgba(0,0,0,.2);
}
.nv-slot:disabled .nv-slot-cap strong { color: var(--nv-secondary-text); }

/* Bottom pair: quiet section labels over template tiles and the tools list. */
.nv-create-bottom { display: grid; grid-template-columns: 1.35fr 1fr; gap: 48px; margin-top: 6px; }
.nv-sec-label { font-size: 12px; font-weight: 600; color: var(--nv-secondary-text); margin-bottom: 10px; }
.nv-tpls { display: flex; gap: 14px; }
.nv-tpl { display: flex; flex-direction: column; gap: 7px; width: 132px; padding: 0; border: 0; background: none; text-align: left; cursor: pointer; }
.nv-tpl-cover { width: 100%; aspect-ratio: 16/10; border-radius: 10px; object-fit: cover; display: block; transition: transform var(--nv-dur-ui) var(--nv-ease-out), box-shadow var(--nv-dur-ui) var(--nv-ease-out); }
.nv-tpl:hover .nv-tpl-cover { transform: translateY(-2px); box-shadow: 0 8px 18px rgba(0,0,0,.10); }
.nv-tpl-body { display: flex; flex-direction: column; gap: 1px; }
.nv-tpl-body strong { font-size: 12.5px; font-weight: 600; }
.nv-tpl-body small { font-size: 11.5px; color: var(--nv-secondary-text); }
.nv-tools2 { display: grid; grid-template-columns: 1fr 1fr; gap: 2px 16px; }
.nv-tool2 { display: inline-flex; align-items: center; gap: 9px; padding: 8px 10px; border: 0; border-radius: 9px; background: none; font-size: 12.5px; color: var(--nv-primary-text); text-align: left; cursor: pointer; }
.nv-tool2:hover { background: var(--nv-accent-soft); }
.nv-tool2-ic { display: inline-flex; color: var(--nv-accent-deep); }

/* ===== 我的 ===== */
.nv-profile { display: flex; align-items: center; gap: 18px; padding: 6px 4px; }
.nv-profile .nv-avatar { width: 68px; height: 68px; font-size: 26px; }
.nv-profile-name { display: block; font-size: 20px; font-weight: 700; }
.nv-profile-bio { display: block; font-size: 13px; color: var(--nv-secondary-text); margin-top: 3px; }
.nv-profile-mark { font-size: 12px; color: var(--nv-secondary-text); margin-top: 2px; }
.nv-profile-stats { display: flex; gap: 26px; font-size: 13px; color: var(--nv-secondary-text); margin-top: 10px; }
.nv-profile-stats b { color: var(--nv-primary-text); font-size: 14px; margin-right: 4px; }
.nv-profile-actions { margin-left: auto; display: flex; gap: 10px; }
.nv-me-bar { display: flex; align-items: center; gap: 8px; }
.nv-me-tabs { display: flex; gap: 26px; }
.nv-me-tab { border: 0; background: none; padding: 6px 2px; font-size: 15px; font-weight: 700; color: var(--nv-secondary-text); cursor: pointer; border-bottom: 2px solid transparent; }
.nv-me-tab[data-active='true'] { border-bottom-color: var(--nv-accent); }
.nv-me-bar .nv-search { margin-left: auto; width: 230px; padding: 7px 14px; }
.nv-sort { display: inline-flex; align-items: center; gap: 4px; font-size: 13px; color: var(--nv-secondary-text); border: 0; background: none; cursor: pointer; }
.nv-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(200px, 1fr)); gap: 18px; }
.nv-ccard-title { font-size: 14.5px; font-weight: 700; }
.nv-ccard-meta { font-size: 12px; color: var(--nv-secondary-text); display: flex; align-items: center; gap: 8px; flex-wrap: wrap; }
.nv-dirty { display: inline-flex; align-items: center; gap: 5px; font-size: 11.5px; color: var(--nv-accent-deep); }
.nv-dirty::before { content: ''; width: 6px; height: 6px; border-radius: 50%; background: var(--nv-accent); }
.nv-newcard { border: 1.5px dashed var(--nv-divider); border-radius: var(--nv-radius); display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 10px; min-height: 190px; color: var(--nv-secondary-text); background: none; cursor: pointer; font-size: 13px; }
.nv-newcard:hover { border-color: var(--nv-accent); color: var(--nv-accent-deep); }
.nv-newcard .plus { font-size: 26px; font-weight: 300; }

/* 我的 card grids reuse the creation-slot language; tiles wrap in the row. */
.nv-slots-wrap { flex-wrap: wrap; }
.nv-slot-coverless { background: var(--nv-accent-soft); }
.nv-slot-ph { display: flex; color: var(--nv-accent-deep); opacity: .55; }
/* Coverless cards borrow their own first page — paper, not placeholder. */
.nv-slot-excerpt { position: absolute; inset: 0; display: flex; flex-direction: column; gap: 6px; padding: 14px; background: var(--nv-surface); border-radius: 14px; overflow: hidden; }
.nv-slot-excerpt::after { content: ''; position: absolute; left: 0; right: 0; bottom: 0; height: 44%; background: linear-gradient(transparent, var(--nv-surface)); }
.nv-slot-excerpt-mod { font-size: 11px; font-weight: 600; color: var(--nv-accent-deep); }
.nv-slot-excerpt-body { font-size: 11.5px; line-height: 1.75; color: var(--nv-secondary-text); overflow: hidden; }
.nv-editable { cursor: text; }
.nv-editable:hover { text-decoration: underline dotted var(--nv-secondary-text); text-underline-offset: 3px; }
.nv-editable-ph { color: var(--nv-secondary-text); }
.nv-editable-input { border: 0; border-bottom: 1.5px solid var(--nv-accent); outline: none; background: none; font-family: inherit; padding: 0; }
.nv-editable-input.nv-profile-name { font-size: 20px; font-weight: 700; }
.nv-editable-input.nv-profile-bio { font-size: 13px; margin-top: 3px; color: var(--nv-secondary-text); }
.nv-profile-avatar { width: 68px; height: 68px; border-radius: 50%; overflow: hidden; border: 0; padding: 0; cursor: pointer; flex: none; background: none; }
.nv-profile-avatar img { width: 100%; height: 100%; object-fit: cover; display: block; }
.nv-profile-avatar-empty { display: block; width: 100%; height: 100%; box-sizing: border-box; border-radius: 50%; border: 1px dashed var(--nv-divider); background: var(--nv-surface); }
.nv-profedit { display: flex; flex-direction: column; gap: 16px; }
.nv-profedit-field { display: flex; flex-direction: column; gap: 7px; }
.nv-profedit-label { font-size: 12px; font-weight: 600; color: var(--nv-secondary-text); }
.nv-profedit-portraitrow { display: flex; align-items: center; gap: 14px; }
.nv-profedit-portrait { width: 64px; height: 64px; flex: none; border-radius: 50%; overflow: hidden; border: 0; padding: 0; background: none; cursor: pointer; }
.nv-profedit-portrait:disabled { cursor: default; }
.nv-profedit-portrait img { width: 100%; height: 100%; object-fit: cover; display: block; }
.nv-profedit-portrait-empty { display: block; width: 100%; height: 100%; box-sizing: border-box; border-radius: 50%; border: 1px dashed var(--nv-divider); background: var(--nv-surface); }
.nv-profedit-portraitacts { display: flex; gap: 8px; }
.nv-profedit-input { border: 0.5px solid var(--nv-divider); border-radius: 9px; padding: 8px 12px; font-size: 13px; font-family: inherit; outline: none; background: var(--nv-surface); color: var(--nv-primary-text); }
.nv-profedit-input:focus { border-color: var(--nv-accent); }
.nv-profedit-area { resize: none; line-height: 1.6; }

/* 创作库 */
.nv-proj-pills { display: flex; gap: 8px; }
.nv-proj-pills .nv-pill { background: var(--nv-surface); border: 0.5px solid var(--nv-divider); color: var(--nv-primary-text); }
.nv-proj-pills .nv-pill[data-active='true'] { background: var(--nv-inverse-surface); border-color: var(--nv-inverse-surface); color: var(--nv-inverse-text); }
.nv-wb-grid { display: grid; grid-template-columns: repeat(4, 1fr); gap: 16px; }
@media (max-width: 1400px) { .nv-wb-grid { grid-template-columns: repeat(3, 1fr); } }
.nv-wb { overflow: hidden; text-align: left; padding: 0; cursor: pointer; display: flex; flex-direction: column; }
.nv-wb-cover { position: relative; aspect-ratio: 4/3; background: var(--nv-canvas); }
.nv-wb-cover img { width: 100%; height: 100%; object-fit: cover; display: block; }
.nv-wb-cover .ph { width: 100%; height: 100%; display: flex; align-items: center; justify-content: center; color: var(--nv-secondary-text); }
.nv-wb-body { padding: 12px 14px 14px; display: flex; flex-direction: column; gap: 6px; }
.nv-wb-body .nv-tag { align-self: flex-start; }
.nv-recent { display: flex; flex-direction: column; }
.nv-recent-row { display: flex; align-items: center; gap: 12px; padding: 13px 18px; }
.nv-recent-row + .nv-recent-row { border-top: 0.5px solid var(--nv-divider); }
.nv-recent-ic { width: 30px; height: 30px; border-radius: 8px; background: var(--nv-canvas); color: var(--nv-secondary-text); display: flex; align-items: center; justify-content: center; flex: none; }
.nv-recent-body { flex: 1; min-width: 0; }
.nv-recent-body strong { font-size: 13px; }
.nv-recent-body small { display: block; color: var(--nv-secondary-text); font-size: 11.5px; margin-top: 2px; }
.nv-recent-row > time { color: var(--nv-secondary-text); font-size: 12px; }

/* ===== 卡片编辑器 ===== */
.nv-editor { display: flex; flex-direction: column; height: 100%; min-height: 0; background: var(--nv-canvas); }
.nv-editor-top { display: flex; align-items: center; padding: 14px 26px; gap: 12px; }
.nv-editor-top .crumb { font-size: 13px; color: var(--nv-secondary-text); }
.nv-editor-top .crumb b { color: var(--nv-primary-text); font-weight: 600; }
.nv-editor-top .nv-back {
  display: inline-flex; align-items: center; justify-content: center;
  width: 26px; height: 26px;
  border: 0; background: none; padding: 0;
  font-size: 20px; line-height: 1; color: var(--nv-secondary-text); cursor: pointer;
  border-radius: 6px; transition: color var(--nv-dur-micro) ease, background var(--nv-dur-micro) ease;
}
.nv-editor-top .nv-back:hover { color: var(--nv-primary-text); background: rgba(128,128,128,.1); }
.nv-editor-top .right { margin-left: auto; display: flex; align-items: center; gap: 10px; }
.nv-editor-body { flex: 1; min-height: 0; display: grid; grid-template-columns: 230px 1fr 300px; margin: 0 26px 26px; border: 0.5px solid var(--nv-divider); border-radius: 14px; background: var(--nv-surface); overflow: hidden; }
.nv-editor-col { border-right: 0.5px solid var(--nv-divider); overflow-y: auto; display: flex; flex-direction: column; min-height: 0; }
.nv-editor-col:last-child { border-right: 0; }
.nv-editor-col-head { display: flex; align-items: center; padding: 14px 16px 10px; font-size: 13px; font-weight: 600; }
.nv-editor-col-head .plus { margin-left: auto; color: var(--nv-secondary-text); font-size: 15px; }
.nv-tree-row { display: flex; align-items: center; gap: 7px; width: 100%; border: 0; background: none; padding: 7px 16px; font-size: 13px; color: var(--nv-primary-text); cursor: pointer; text-align: left; }
.nv-tree-row:hover { background: rgba(128,128,128,.08); }
.nv-tree-row[data-active='true'] { background: rgba(128,128,128,.13); border-radius: 8px; }
.nv-tree-row small { margin-left: auto; color: var(--nv-secondary-text); font-size: 11px; }
.nv-tree-chev { width: 16px; flex: none; border: 0; background: none; padding: 0; font-size: 11px; color: var(--nv-secondary-text); cursor: pointer; transition: transform var(--nv-dur-micro) ease; }
.nv-tree-chev:not(:disabled):hover { color: var(--nv-primary-text); }
.nv-tree-chev:disabled { cursor: default; }
.nv-tree-name { flex: 1; border: 0; background: none; padding: 0; font-size: 13px; color: inherit; text-align: left; cursor: pointer; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.nv-tree-rename { cursor: text; min-width: 0; border: 1px solid var(--nv-accent); border-radius: 5px; background: var(--nv-bg, #fff); padding: 1px 5px; outline: none; font-family: inherit; }
.nv-tree-acts { display: none; align-items: center; gap: 2px; margin-left: auto; }
.nv-tree-row:hover .nv-tree-acts { display: inline-flex; }
.nv-tree-act { width: 20px; height: 20px; border: 0; border-radius: 5px; background: none; color: var(--nv-secondary-text); font-size: 11px; cursor: pointer; padding: 0; line-height: 1; }
.nv-tree-act:hover { background: rgba(128,128,128,.14); color: var(--nv-primary-text); }
.nv-tree-add { margin-left: auto; border: 0; background: none; padding: 0 4px; font-size: 15px; color: var(--nv-secondary-text); cursor: pointer; }
.nv-tree-add:hover { color: var(--nv-primary-text); }
.nv-tree-back { color: var(--nv-secondary-text); font-weight: 600; }
.nv-tree-roles { font-weight: 600; margin-top: 6px; }
.nv-tree-role { display: flex; align-items: center; gap: 9px; width: 100%; border: 0; background: none; padding: 6px 16px 6px 34px; font-size: 13px; color: var(--nv-primary-text); cursor: pointer; text-align: left; }
.nv-tree-role:hover { background: rgba(128,128,128,.08); }
.nv-tree-role[data-active='true'] { background: rgba(128,128,128,.13); }
.nv-tree-role .nv-avatar { width: 24px; height: 24px; font-size: 10px; }
.nv-tree-role small { margin-left: auto; color: var(--nv-secondary-text); font-size: 11px; }
.nv-doc-area { flex: 1; min-height: 320px; width: 100%; border: 0; outline: none; resize: none; background: transparent; font-family: inherit; font-size: 13.5px; line-height: 1.8; color: var(--nv-primary-text); }
.nv-toolbtn { font-weight: 600; }
.nv-side-tab:disabled { opacity: .45; cursor: default; }
.nv-tag[data-kind='warn'] { background: #F5E9DC; border-color: #E5C9A0; color: #8A5A1F; }
.nv-doc { padding: 22px 30px; flex: 1; overflow-y: auto; }
.nv-doc-title { font-size: 19px; font-weight: 700; margin-bottom: 10px; }
.nv-doc-toolbar { display: flex; gap: 4px; border-bottom: 0.5px solid var(--nv-divider); padding-bottom: 10px; margin-bottom: 16px; }
.nv-doc-toolbar button { width: 30px; height: 28px; border: 0; border-radius: 6px; background: none; color: var(--nv-secondary-text); font-size: 13px; cursor: pointer; }
.nv-doc-toolbar button:hover { background: rgba(128,128,128,.1); color: var(--nv-primary-text); }
.nv-doc h3 { font-size: 16px; font-weight: 700; margin: 18px 0 8px; }
.nv-doc p { font-size: 13.5px; line-height: 1.8; color: var(--nv-primary-text); margin: 0 0 6px; }
.nv-doc img { width: 100%; border-radius: 10px; margin: 14px 0; display: block; }
.nv-side-tabs { display: flex; gap: 18px; padding: 14px 16px 0; }
.nv-side-tab { border: 0; background: none; padding: 0 0 8px; font-size: 13px; font-weight: 600; color: var(--nv-secondary-text); cursor: pointer; border-bottom: 2px solid transparent; }
.nv-side-tab[data-active='true'] { border-bottom-color: var(--nv-accent); }
.nv-side-chat { padding: 14px 16px; display: flex; flex-direction: column; gap: 12px; flex: 1; min-height: 0; }
.nv-side-head { display: flex; align-items: center; gap: 8px; }
.nv-side-head strong { font-size: 15px; }
.nv-bubble { max-width: 92%; padding: 10px 13px; border-radius: 12px; font-size: 12.5px; line-height: 1.6; }
.nv-bubble[data-me='true'] { align-self: flex-end; background: var(--nv-accent); color: #fff; border-bottom-right-radius: 4px; }
.nv-bubble[data-me='false'] { align-self: flex-start; background: var(--nv-canvas); border-bottom-left-radius: 4px; }
.nv-receipt { border: 0.5px solid var(--nv-divider); border-radius: 10px; padding: 10px 13px; font-size: 12.5px; display: flex; align-items: center; gap: 8px; }
.nv-receipt .ok { color: var(--nv-accent); font-weight: 700; }
.nv-receipt .nv-link { margin-left: auto; }
.nv-side-input { display: flex; align-items: center; gap: 8px; border: 0.5px solid var(--nv-divider); border-radius: 999px; padding: 6px 6px 6px 14px; }
.nv-side-input input { flex: 1; border: 0; outline: none; background: none; font-size: 12.5px; font-family: inherit; }
.nv-side-input .nv-send { width: 30px; height: 30px; }

/* ===== 卡类编辑器（文档 / 分栏 双布局） ===== */
.nv-ed-bodywrap { flex: 1; min-height: 0; display: flex; overflow: hidden; }
.nv-ed-topface { width: 22px; height: 30px; border-radius: 5px; object-fit: cover; flex: none; }
.nv-ed-chip { align-self: flex-start; font-size: 11px; padding: 2px 9px; border-radius: 999px; background: var(--nv-accent-soft); color: var(--nv-accent-deep); white-space: nowrap; }
.nv-ed-viewbtn { width: 34px; height: 26px; border: 0.5px solid var(--nv-divider); border-radius: 8px; background: none; color: var(--nv-secondary-text); cursor: pointer; display: flex; align-items: center; justify-content: center; }
.nv-ed-viewbtn:hover { color: var(--nv-primary-text); background: rgba(128,128,128,.08); }
.nv-ed-tbtn { height: 26px; padding: 0 9px; border: 0.5px solid var(--nv-divider); border-radius: 8px; background: none; color: var(--nv-secondary-text); cursor: pointer; font-size: 11.5px; font-family: inherit; }
.nv-ed-tbtn:hover:not(:disabled) { color: var(--nv-primary-text); background: rgba(128,128,128,.08); }
.nv-ed-tbtn:disabled { opacity: .4; cursor: default; }
.nv-ed-namebtn { border: 0; background: none; padding: 0; font-family: inherit; color: var(--nv-primary-text); text-align: left; cursor: text; }
.nv-ed-namebtn:hover { text-decoration: underline dotted var(--nv-secondary-text); text-underline-offset: 4px; }
.nv-ed-rename { border: 0; border-bottom: 1.5px solid var(--nv-accent); outline: none; background: none; font-family: inherit; color: var(--nv-primary-text); padding: 0; flex: 1; min-width: 0; }
.nv-ed-mint { width: 40px; height: 3px; border-radius: 2px; background: var(--nv-accent); margin: 12px 0 14px; }
.nv-ed-up { border: 0; background: none; padding: 0 0 6px; font-size: 12.5px; color: var(--nv-secondary-text); cursor: pointer; align-self: flex-start; }
.nv-ed-up:hover { color: var(--nv-primary-text); }
.nv-ed-dots { width: 24px; height: 24px; border: 0; border-radius: 6px; background: none; color: var(--nv-secondary-text); font-size: 15px; line-height: 1; cursor: pointer; flex: none; }
.nv-ed-dots:hover, .nv-ed-dots[data-open='true'] { background: rgba(128,128,128,.12); color: var(--nv-primary-text); }
.nv-ed-scrim { position: fixed; inset: 0; z-index: 60; }
.nv-ed-menu { position: fixed; z-index: 61; min-width: 150px; background: var(--nv-surface); border: 0.5px solid var(--nv-divider); border-radius: 10px; box-shadow: 0 10px 30px rgba(30,40,35,.14); padding: 4px; display: flex; flex-direction: column; overflow-y: auto; }
.nv-ed-menuitem { border: 0; background: none; text-align: left; padding: 7px 10px; font-size: 12.5px; border-radius: 6px; color: var(--nv-primary-text); cursor: pointer; white-space: nowrap; }
.nv-ed-menuitem:hover { background: rgba(128,128,128,.09); }
.nv-ed-menuitem[data-danger='true'] { color: var(--nv-danger); }
.nv-ed-menusep { height: 1px; background: var(--nv-divider); margin: 4px 6px; }
.nv-ed-pick { position: fixed; z-index: 61; width: 264px; background: var(--nv-surface); border: 0.5px solid var(--nv-divider); border-radius: 12px; box-shadow: 0 10px 30px rgba(30,40,35,.14); padding: 10px; }
.nv-ed-pickgrid { display: grid; grid-template-columns: repeat(3, 1fr); gap: 6px; max-height: 220px; overflow-y: auto; }
.nv-ed-pickitem { padding: 0; border: 2px solid transparent; border-radius: 8px; overflow: hidden; cursor: pointer; aspect-ratio: 1; background: var(--nv-canvas); }
.nv-ed-pickitem img { width: 100%; height: 100%; object-fit: cover; display: block; }
.nv-ed-pickitem:hover { border-color: var(--nv-accent); }
.nv-ed-pickitem[data-active='true'] { border-color: var(--nv-accent); }
.nv-ed-pickempty { grid-column: 1 / -1; padding: 14px 8px; font-size: 12px; color: var(--nv-secondary-text); text-align: center; }
.nv-ed-pickclear { margin-top: 8px; width: 100%; border: 0.5px solid var(--nv-divider); border-radius: 8px; background: none; padding: 6px; font-size: 12.5px; color: var(--nv-danger); cursor: pointer; }
.nv-ed-facebtn { position: absolute; right: 12px; bottom: 12px; width: 30px; height: 30px; border: 0; border-radius: 8px; background: rgba(255,255,255,.92); color: var(--nv-primary-text); font-size: 13px; cursor: pointer; box-shadow: 0 2px 8px rgba(30,40,35,.18); }
.nv-ed-facebtn:hover { background: var(--nv-surface); }

/* —— 文档模式：卡即页面 —— */
.nv-ed-docwrap { flex: 1; min-width: 0; position: relative; display: flex; }
.nv-ed-doc { flex: 1; min-width: 0; overflow-y: auto; padding: 24px 150px 60px 26px; }
.nv-ed-page { max-width: 740px; margin: 0 auto; background: var(--nv-surface); border: 0.5px solid var(--nv-divider); border-radius: 18px; overflow: hidden; display: flex; flex-direction: column; padding-bottom: 40px; }
.nv-ed-page > .nv-ed-up { margin: 14px 20px 0; }
.nv-ed-hero { position: relative; width: 100%; height: 240px; background: var(--nv-accent-soft); }
.nv-ed-hero img { width: 100%; height: 100%; object-fit: cover; display: block; }
.nv-ed-portrait { position: relative; display: flex; justify-content: center; padding: 30px 0 4px; }
.nv-ed-portrait img { width: 210px; aspect-ratio: 3/4; object-fit: cover; border-radius: 14px; display: block; }
.nv-ed-portrait .nv-ed-facebtn { right: calc(50% - 105px + 8px); bottom: 12px; }
.nv-ed-portraitph { width: 210px; aspect-ratio: 3/4; border: 1.5px dashed var(--nv-divider); border-radius: 14px; background: var(--nv-canvas); color: var(--nv-accent-deep); font-size: 52px; font-weight: 700; cursor: pointer; }
.nv-ed-portraitph:hover { border-color: var(--nv-accent); }
.nv-ed-head { padding: 22px 44px 0; display: flex; flex-direction: column; }
.nv-ed-name { font-size: 30px; font-weight: 700; margin-top: 10px; }
.nv-ed-intro { font-size: 14px; }
.nv-ed-intro p { margin: 0; line-height: 1.75; color: var(--nv-secondary-text); }
.nv-ed-introadd { align-self: flex-start; border: 0; background: none; padding: 0; font-size: 13.5px; color: var(--nv-accent-deep); cursor: pointer; }
.nv-ed-sec { padding: 22px 44px 6px; border-top: 0.5px solid var(--nv-divider); margin-top: 16px; }
.nv-ed-sec[data-depth='1'] { margin-left: 22px; border-top: 0; margin-top: 0; padding-top: 12px; }
.nv-ed-sec[data-depth='2'], .nv-ed-sec[data-depth='3'], .nv-ed-sec[data-depth='4'] { margin-left: 44px; border-top: 0; margin-top: 0; padding-top: 12px; }
.nv-ed-sechead { display: flex; align-items: center; gap: 8px; }
.nv-ed-grip { color: var(--nv-secondary-text); opacity: .55; font-size: 12px; flex: none; }
.nv-ed-secname { margin: 0; flex: 1; min-width: 0; font-size: 19px; font-weight: 700; overflow: hidden; text-overflow: ellipsis; }
.nv-ed-secname[data-sub='true'] { font-size: 15.5px; }
.nv-ed-secbody { border-radius: 8px; margin-top: 8px; }
.nv-ed-secbody[data-editable='true'] { cursor: text; }
.nv-ed-secbody[data-editable='true']:hover { background: rgba(128,128,128,.05); }
/* 段落级就地编辑：悬停提示可点，编辑中就是一段 textarea */
.nv-ed-para { border-radius: 6px; margin: 0 -8px; padding: 1px 8px; }
.nv-ed-para[data-editable='true'] { cursor: text; }
.nv-ed-para[data-editable='true']:hover { background: rgba(128,128,128,.06); }
.nv-ed-paraedit { display: block; width: 100%; min-height: 0; margin: 1px 0; padding: 4px 8px; border-radius: 6px; border: 0.5px solid transparent; background: rgba(128,128,128,.06); font-family: inherit; font-size: inherit; line-height: 1.7; color: var(--nv-primary-text); resize: none; overflow: hidden; outline: none; }
.nv-ed-paraedit:focus { border-color: var(--nv-accent); background: var(--nv-surface); }
.nv-ed-fig { margin: 12px 0; }
.nv-ed-fig img { width: 100%; border-radius: 10px; display: block; }
.nv-ed-fig figcaption { font-size: 12px; color: var(--nv-secondary-text); margin-top: 4px; }
.nv-ed-addpara { display: block; border: 0; background: none; padding: 2px 8px; margin: 0 -8px; border-radius: 6px; color: var(--nv-secondary-text); opacity: 0; cursor: pointer; font-size: 12px; transition: opacity var(--nv-dur-micro); }
.nv-ed-secbody:hover .nv-ed-addpara, .nv-ed-addpara:focus-visible { opacity: .8; }
.nv-ed-addpara:hover { color: var(--nv-primary-text); background: rgba(128,128,128,.06); }
.nv-ed-read figure { margin: 12px 0; }
.nv-ed-read figure img { width: 100%; border-radius: 10px; display: block; }
.nv-ed-read figcaption { font-size: 12px; color: var(--nv-secondary-text); margin-top: 4px; }
.nv-ed-emptyph { margin: 0; padding: 6px 0; font-size: 13px; color: var(--nv-secondary-text); opacity: .8; }
.nv-ed-editbox { margin-top: 8px; }
.nv-ed-editbox .nv-doc-toolbar { padding-bottom: 8px; margin-bottom: 10px; }
.nv-ed-area { min-height: 130px; padding: 10px 12px; border: 0.5px solid var(--nv-divider); border-radius: 10px; background: var(--nv-canvas); overflow: hidden; }
.nv-ed-area:focus { border-color: var(--nv-accent); }
.nv-ed-done { margin-left: auto; width: auto !important; padding: 0 10px; font-size: 12px !important; }
.nv-ed-chips { display: flex; flex-wrap: wrap; gap: 8px; margin-top: 14px; }
.nv-ed-chipchar { display: flex; align-items: center; gap: 7px; border: 0.5px solid var(--nv-divider); border-radius: 999px; padding: 4px 12px 4px 5px; background: var(--nv-surface); cursor: pointer; font-size: 12.5px; color: var(--nv-primary-text); font-family: inherit; }
.nv-ed-chipchar:hover { border-color: var(--nv-accent); }
.nv-ed-chipchar img { width: 22px; height: 22px; border-radius: 50%; object-fit: cover; }
.nv-ed-chipinit { width: 22px; height: 22px; border-radius: 50%; background: var(--nv-accent-soft); color: var(--nv-accent-deep); font-size: 10px; display: inline-flex; align-items: center; justify-content: center; flex: none; }
.nv-ed-chipadd { padding: 4px 12px; color: var(--nv-accent-deep); border-style: dashed; }
.nv-ed-add { margin: 20px 44px 0; border: 0.5px dashed var(--nv-divider); border-radius: 10px; background: none; padding: 10px; color: var(--nv-secondary-text); cursor: pointer; font-size: 13px; font-family: inherit; }
.nv-ed-add:hover { border-color: var(--nv-accent); color: var(--nv-accent-deep); }
.nv-ed-rail { position: absolute; right: 18px; top: 30px; width: 118px; display: flex; flex-direction: column; gap: 2px; }
.nv-ed-rail button { border: 0; background: none; text-align: left; font-size: 11.5px; color: var(--nv-secondary-text); padding: 4px 7px; border-radius: 6px; cursor: pointer; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.nv-ed-rail button:hover { background: rgba(128,128,128,.09); color: var(--nv-primary-text); }

/* —— 分栏模式：左卡右稿 —— */
.nv-ed-split { flex: 1; min-width: 0; display: flex; }
.nv-ed-left { width: 302px; flex: none; border-right: 0.5px solid var(--nv-divider); overflow-y: auto; background: var(--nv-canvas); padding: 16px 14px 30px; display: flex; flex-direction: column; }
.nv-ed-card { background: var(--nv-surface); border: 0.5px solid var(--nv-divider); border-radius: 14px; overflow: hidden; position: relative; flex: none; }
.nv-ed-cardimg { width: 100%; aspect-ratio: 4/5; object-fit: cover; display: block; }
.nv-ed-cardph { width: 100%; aspect-ratio: 4/5; display: flex; align-items: center; justify-content: center; font-size: 46px; font-weight: 700; color: var(--nv-accent-deep); background: var(--nv-accent-soft); }
.nv-ed-card .nv-ed-facebtn { top: 10px; right: 10px; bottom: auto; }
.nv-ed-cardmeta { padding: 11px 13px 13px; display: flex; flex-direction: column; gap: 7px; align-items: flex-start; }
.nv-ed-cardname { font-size: 15px; font-weight: 700; }
.nv-ed-info { margin-top: 12px; border: 0.5px dashed var(--nv-accent); border-radius: 10px; background: var(--nv-surface); flex: none; }
.nv-ed-inforow { display: flex; gap: 10px; padding: 9px 12px; font-size: 12.5px; align-items: baseline; }
.nv-ed-inforow + .nv-ed-inforow { border-top: 0.5px dashed var(--nv-divider); }
.nv-ed-infolab { width: 34px; flex: none; color: var(--nv-secondary-text); }
.nv-ed-infoval { flex: 1; min-width: 0; color: var(--nv-primary-text); }
.nv-ed-infobtn { border: 0; background: none; padding: 0; font-family: inherit; font-size: inherit; text-align: left; cursor: pointer; overflow: hidden; display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical; }
.nv-ed-infobtn:hover { color: var(--nv-accent-deep); }
.nv-ed-lhead { display: flex; align-items: center; font-size: 12px; font-weight: 600; color: var(--nv-secondary-text); padding: 16px 4px 8px; flex: none; }
.nv-ed-mrow { display: flex; align-items: center; gap: 6px; width: auto; border: 0; border-radius: 8px; background: none; padding: 6px 9px; margin-bottom: 1px; cursor: pointer; text-align: left; flex: none; position: relative; user-select: none; -webkit-user-select: none; }
.nv-ed-mrow:hover { background: rgba(128,128,128,.09); }
.nv-ed-mrow[data-active='true'] .nv-ed-mname { font-weight: 600; }
.nv-ed-mrow[data-dragging='true'] { opacity: .38; }
.nv-ed-mrow[data-inside='true'] { background: var(--nv-accent-soft); box-shadow: inset 0 0 0 1.5px var(--nv-accent); }
.nv-ed-mrow[data-drop='before']::before { content: ''; position: absolute; left: 8px; right: 8px; top: -1px; height: 2px; border-radius: 1px; background: var(--nv-accent); }
.nv-ed-mrow[data-drop='after']::after { content: ''; position: absolute; left: 8px; right: 8px; bottom: -1px; height: 2px; border-radius: 1px; background: var(--nv-accent); }
.nv-ed-dropline { height: 2px; border-radius: 1px; background: var(--nv-accent); margin: 2px 10px; }
.nv-ed-lift { position: fixed; left: 0; top: 0; z-index: 120; pointer-events: none; background: var(--nv-surface); border-radius: 10px; box-shadow: 0 14px 30px rgba(30,40,35,.22), 0 0 0 0.5px var(--nv-divider); opacity: .95; overflow: hidden; will-change: transform; }
.nv-ed-lift .nv-ed-sec { padding-left: 14px; padding-right: 14px; margin-top: 0; border-top: 0; }
.nv-ed-gap { flex: none; margin: 3px 12px; border-radius: 8px; background: var(--nv-accent-soft); animation: nv-ed-gapin var(--nv-dur-ui) var(--nv-ease-out); }
.nv-ed-hgap { flex: none; align-self: stretch; margin: 4px 0; border-radius: 8px; background: var(--nv-accent-soft); animation: nv-ed-hgapin var(--nv-dur-ui) var(--nv-ease-out); }
@keyframes nv-ed-gapin { from { height: 0; opacity: 0; } }
@keyframes nv-ed-hgapin { from { width: 0; opacity: 0; } }
.nv-ed-sec[data-inside='true'] { box-shadow: 0 0 0 1.5px var(--nv-accent); border-radius: 10px; }
.nv-ed-sec[data-dragging='true'] { opacity: .38; }
.nv-ed-grip { cursor: grab; touch-action: none; }
.nv-ed-grip:active { cursor: grabbing; }
.nv-ed-htag { font-size: 10px; color: var(--nv-accent-deep); background: var(--nv-accent-soft); border-radius: 4px; padding: 1px 5px; margin-left: 6px; vertical-align: 1px; font-weight: 500; }
.nv-ed-wtag { color: #7C5CBF; background: rgba(124,92,191,.1); text-transform: uppercase; letter-spacing: .3px; }
/* widget modules — sandboxed HTML renderer + source editing */
.nv-ed-widget { position: relative; }
.nv-ed-iframe { display: block; width: 100%; border: 0; border-radius: 10px; background: var(--nv-surface); box-shadow: inset 0 0 0 0.5px var(--nv-divider); }
.nv-ed-wph { padding: 20px; font-size: 12.5px; color: var(--nv-secondary-text); border: 0.5px dashed var(--nv-divider); border-radius: 10px; }
.nv-ed-wedit { position: absolute; top: 8px; right: 8px; width: 26px; height: 26px; border: 0.5px solid var(--nv-divider); border-radius: 7px; background: var(--nv-surface); color: var(--nv-secondary-text); cursor: pointer; opacity: 0; transition: opacity var(--nv-dur-micro); }
.nv-ed-widget:hover .nv-ed-wedit, .nv-ed-wedit:focus-visible { opacity: 1; }
.nv-ed-wedit:hover { color: var(--nv-primary-text); }
/* 内置小组件：时间线 = 顶部节点条 + 下方详情卡 */
.nv-ed-tline { margin-top: 8px; }
.nv-ed-tstrip { display: flex; overflow-x: auto; padding: 4px 2px 2px; }
.nv-ed-tnode { flex: 0 0 auto; width: 118px; text-align: center; }
.nv-ed-trail { display: flex; align-items: center; height: 8px; }
.nv-ed-tseg { flex: 1; height: 1px; background: var(--nv-divider); }
.nv-ed-tseg[data-x] { background: transparent; }
.nv-ed-tdot { width: 8px; height: 8px; border-radius: 50%; background: var(--nv-primary-text); flex: 0 0 auto; }
.nv-ed-ttime { font-size: 11px; color: var(--nv-secondary-text); margin-top: 7px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.nv-ed-ttitle { font-size: 12px; line-height: 16px; color: var(--nv-primary-text); padding: 2px 6px 0; display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical; overflow: hidden; }
.nv-ed-tcards { margin-top: 10px; display: flex; flex-direction: column; gap: 8px; }
.nv-ed-tcard { padding: 10px 12px; border-radius: 10px; background: var(--nv-surface); box-shadow: inset 0 0 0 0.5px var(--nv-divider); }
.nv-ed-tcardhead { font-size: 12px; font-weight: 600; color: var(--nv-primary-text); margin-bottom: 4px; }
/* 合集 = 条目竖列 */
.nv-ed-coll { margin-top: 8px; display: flex; flex-direction: column; }
.nv-ed-citem { padding: 8px 0; border-top: 0.5px solid var(--nv-divider); }
.nv-ed-citem:first-child { border-top: 0; padding-top: 0; }
.nv-ed-chead { font-size: 13px; font-weight: 600; color: var(--nv-primary-text); margin-bottom: 3px; }
/* 地图 = 大图 + 描述 */
.nv-ed-map { margin-top: 8px; }
.nv-ed-mapimg { display: block; width: 100%; border-radius: 10px; }
.nv-ed-mapph { display: flex; align-items: center; justify-content: center; height: 112px; border-radius: 10px; background: rgba(128,128,128,.08); color: var(--nv-secondary-text); font-size: 12px; }
.nv-ed-mapcap { font-size: 12px; color: var(--nv-secondary-text); margin-top: 4px; }
.nv-ed-code { font-family: ui-monospace, SFMono-Regular, Menlo, monospace; font-size: 12.5px; line-height: 1.6; }
/* nested horizontal — flip mode: in-section page tabs */
.nv-ed-sectabs { display: flex; align-items: center; gap: 2px; overflow-x: auto; margin-top: 10px; border-bottom: 0.5px solid var(--nv-divider); }
.nv-ed-sectabs .nv-ed-tab { padding: 6px 12px 9px; font-size: 12.5px; }
.nv-ed-sectabs .nv-ed-tab[data-active='true']::after { left: 11px; right: 11px; }
/* nested horizontal — spread mode: card shelf */
.nv-ed-shelf { position: relative; margin-top: 10px; background: #F7F8F7; border: 0.5px solid var(--nv-divider); border-radius: 12px; padding: 32px 14px 14px; }
.nv-ed-hrow { display: flex; gap: 12px; align-items: stretch; overflow-x: auto; padding-bottom: 2px; }
.nv-ed-hcol { flex: none; width: 248px; background: var(--nv-surface); border: 0.5px solid var(--nv-divider); border-radius: 10px; padding: 10px 14px 14px; position: relative; }
.nv-ed-hcol[data-dragging='true'] { opacity: .38; }
.nv-ed-hcol[data-inside='true'] { box-shadow: 0 0 0 1.5px var(--nv-accent); }
.nv-ed-hcol[data-drop='before']::before { content: ''; position: absolute; left: -8px; top: 6px; bottom: 6px; width: 2.5px; border-radius: 2px; background: var(--nv-accent); }
.nv-ed-hcol[data-drop='after']::after { content: ''; position: absolute; right: -8px; top: 6px; bottom: 6px; width: 2.5px; border-radius: 2px; background: var(--nv-accent); }
.nv-ed-hcol .nv-ed-sec { padding: 0; margin-top: 0; border-top: 0; }
.nv-ed-hcol .nv-ed-sec[data-depth] { margin-left: 0; }
.nv-ed-hcol .nv-ed-secname { font-size: 13px; }
.nv-ed-fan { margin-left: auto; margin-bottom: 4px; flex: none; display: inline-flex; align-items: center; gap: 5px; border: 0; background: none; cursor: pointer; color: var(--nv-secondary-text); font-size: 11.5px; padding: 5px 10px; border-radius: 7px; font-family: inherit; }
.nv-ed-fan:hover { background: rgba(128,128,128,.09); color: var(--nv-primary-text); }
.nv-ed-fanback { position: absolute; top: 7px; right: 10px; z-index: 2; background: var(--nv-surface); border: 0.5px solid var(--nv-divider); margin: 0; }
.nv-ed-fanback:hover { border-color: var(--nv-secondary-text); }
.nv-ed-tabs { display: flex; align-items: center; gap: 2px; overflow-x: auto; padding: 10px 44px 0; border-bottom: 0.5px solid var(--nv-divider); flex: none; }
.nv-ed-tab { flex: none; border: 0; background: none; padding: 7px 14px 11px; font-size: 13px; color: var(--nv-secondary-text); cursor: pointer; white-space: nowrap; font-family: inherit; }
.nv-ed-tab:hover { color: var(--nv-primary-text); }
.nv-ed-tab[data-active='true'] { font-weight: 600; }
.nv-ed-tab[data-active='true']::after { content: ''; position: absolute; left: 13px; right: 13px; bottom: 2px; height: 2.5px; border-radius: 2px; background: var(--nv-accent); }
.nv-ed-tab[data-dragging='true'] { opacity: 0.4; }
.nv-ed-rail button[data-active='true'] { font-weight: 600; }
.nv-ed-ltabs { padding: 0 4px 8px; border-bottom: 0.5px solid var(--nv-divider); margin-bottom: 4px; }
.nv-ed-ltabs .nv-ed-tab { padding: 6px 10px 8px; font-size: 12.5px; }
.nv-ed-ltabs .nv-ed-tab[data-active='true']::after { left: 9px; right: 9px; bottom: 1px; }
.nv-ed-tab { position: relative; }
.nv-ed-tab[data-inside='true'] { background: var(--nv-accent-soft); border-radius: 8px 8px 0 0; }
.nv-ed-tab[data-drop='before']::before { content: ''; position: absolute; left: -1px; top: 4px; bottom: 6px; width: 2px; border-radius: 1px; background: var(--nv-accent); }
.nv-ed-tab[data-drop='after']::after { content: ''; position: absolute; right: -1px; top: 4px; bottom: 6px; width: 2px; border-radius: 1px; background: var(--nv-accent); }
.nv-ed-mfold { margin-top: 7px; }
.nv-ed-mfold .nv-ed-mname { font-weight: 600; font-size: 12.5px; color: var(--nv-secondary-text); }
.nv-ed-mmain { flex: 1; min-width: 0; display: flex; flex-direction: column; gap: 1px; }
.nv-ed-mname { font-size: 13px; font-weight: 500; color: var(--nv-primary-text); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.nv-ed-mx { font-size: 11px; color: var(--nv-secondary-text); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.nv-ed-cavatar { width: 24px; height: 24px; border-radius: 50%; object-fit: cover; flex: none; }
.nv-ed-crow .nv-ed-cavatar.nv-ed-chipinit { width: 24px; height: 24px; }
.nv-ed-mchev { color: var(--nv-secondary-text); font-size: 13px; flex: none; }
.nv-ed-right { flex: 1; min-width: 0; overflow-y: auto; background: var(--nv-surface); padding: 26px 40px 60px; display: flex; flex-direction: column; }
.nv-ed-rightbody { display: flex; flex-direction: column; flex: 1; min-height: 0; }
.nv-ed-doctitle { font-size: 24px; font-weight: 700; }
.nv-ed-side { width: 280px; flex: none; border-left: 0.5px solid var(--nv-divider); display: flex; flex-direction: column; background: var(--nv-surface); }

/* ===== 本会话侧栏 ===== */
.nv-ctx { display: flex; flex-direction: column; gap: 14px; padding: 14px; overflow-y: auto; height: 100%; min-height: 0; background: var(--nv-canvas); }
.nv-ctx-section { padding: 13px 15px; display: flex; flex-direction: column; gap: 9px; }
.nv-ctx-section h4 { margin: 0; font-size: 11.5px; color: var(--nv-secondary-text); font-weight: 600; }
.nv-ctx-row { display: flex; align-items: center; gap: 9px; font-size: 13px; }
.nv-ctx-row small { margin-left: auto; color: var(--nv-secondary-text); font-size: 11px; }
.nv-ctx-empty { color: var(--nv-secondary-text); font-size: 12px; }
.nv-ctx-cardicon { width: 26px; height: 26px; font-size: 10px; flex: none; }
.nv-ctx-thumb { width: 34px; height: 34px; border-radius: 8px; object-fit: cover; background: var(--nv-accent-soft); flex: none; }

/* ===== 作品模式画布 =====
 * The workbench tab marks the frame and the Sidebar panel; these rules widen
 * the right column into the canvas share while the conversation keeps a
 * protected centre track — conversation never moves, only the column grows. */
[data-noven-canvas] { grid-template-columns: auto minmax(300px, 1fr) minmax(0, 62vw) !important; }
[data-noven-canvas-panel] { width: 62vw !important; --dsh-sidebar-width: 62vw !important; }
.nv-wb { display: flex; flex-direction: column; height: 100%; min-height: 0; background: var(--nv-canvas); color: var(--nv-primary-text); }
.nv-wb-top { display: flex; align-items: center; gap: 10px; padding: 10px 14px; border-bottom: 0.5px solid var(--nv-divider); background: var(--nv-surface); }
.nv-wb-crumb { display: inline-flex; align-items: center; gap: 5px; border: 0; background: none; font-size: 13px; font-weight: 600; color: var(--nv-primary-text); cursor: pointer; padding: 4px 6px; border-radius: 7px; }
.nv-wb-crumb:hover { background: rgba(128,128,128,.1); }
.nv-wb-crumb .sep { color: var(--nv-secondary-text); font-weight: 400; }
.nv-wb-crumb .chev { color: var(--nv-secondary-text); font-size: 10px; }
.nv-wb-cardlink { white-space: nowrap; }
.nv-wb-switch { margin-left: auto; display: flex; background: var(--nv-canvas); border-radius: 999px; padding: 2px; }
.nv-wb-switch > button { border: 0; background: none; border-radius: 999px; padding: 5px 16px; font-size: 12.5px; color: var(--nv-secondary-text); cursor: pointer; }
.nv-wb-switch > button[data-active='true'] { background: var(--nv-surface); color: var(--nv-primary-text); font-weight: 600; box-shadow: 0 1px 3px rgba(0,0,0,.08); }
.nv-iconbtn[data-active='true'] { border-color: var(--nv-accent); }
.nv-wb-collapse { border: 0; background: none; font-size: 12.5px; color: var(--nv-secondary-text); cursor: pointer; padding: 5px 8px; }
.nv-wb-collapse:hover { color: var(--nv-primary-text); }
.nv-wb-layout { position: relative; flex: 1; min-height: 0; display: flex; flex-direction: row; }
.nv-wb-stage { flex: 1; min-width: 0; overflow-y: auto; }
.nv-wb-tree { width: 218px; flex: none; display: flex; flex-direction: column; background: var(--nv-surface); overflow-y: auto; }
.nv-wb-tree--float { position: absolute; top: 8px; left: 10px; z-index: 6; max-height: calc(100% - 16px); border: 0.5px solid var(--nv-divider); border-radius: 12px; box-shadow: 0 10px 32px rgba(20,24,22,.14); }
.nv-wb-tree--pinned { border-left: 0.5px solid var(--nv-divider); }
.nv-wb-tree-head { display: flex; align-items: center; gap: 6px; padding: 10px 10px 6px; }
.nv-wb-tree-head .nv-iconbtn { width: 26px; height: 26px; border-radius: 7px; }
.nv-wb-tree-search { flex: 1; display: flex; align-items: center; gap: 6px; background: var(--nv-canvas); border-radius: 8px; padding: 6px 9px; color: var(--nv-secondary-text); }
.nv-wb-tree-search input { flex: 1; min-width: 0; border: 0; outline: none; background: none; font-size: 12px; font-family: inherit; color: var(--nv-primary-text); }
.nv-wb-tree-group { padding: 4px 8px; }
.nv-wb-tree-group h5 { margin: 6px 8px 2px; font-size: 11px; font-weight: 600; color: var(--nv-secondary-text); }
.nv-wb-tree-ic { display: inline-flex; color: var(--nv-secondary-text); }
.nv-wb-allfiles { margin: 8px 10px 12px; width: calc(100% - 20px); border: 0.5px dashed var(--nv-divider); border-radius: 8px; background: none; padding: 7px; font-size: 12px; color: var(--nv-secondary-text); cursor: pointer; }
.nv-wb-map { position: relative; min-height: 100%; }
.nv-wb-map img { width: 100%; display: block; }
.nv-wb-spot { position: absolute; transform: translate(-50%, -50%); border: 0; border-radius: 999px; padding: 4px 12px; font-size: 11.5px; font-weight: 600; background: rgba(255,255,255,.92); color: var(--nv-primary-text); box-shadow: 0 2px 8px rgba(20,24,22,.18); cursor: pointer; }
.nv-wb-spot[data-fresh] { background: var(--nv-accent); color: #fff; }
.nv-wb-exhibit { padding: 18px 20px 40px; display: flex; flex-direction: column; gap: 18px; }
.nv-wb-exhibit h4 { margin: 0 0 4px; font-size: 13px; color: var(--nv-secondary-text); font-weight: 600; }
.nv-wb-exhibit-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(130px, 1fr)); gap: 10px; }
.nv-wb-excard { display: flex; flex-direction: column; align-items: flex-start; gap: 8px; padding: 12px; font-size: 12.5px; cursor: pointer; }
.nv-wb-excard-ic { color: var(--nv-secondary-text); }
.nv-wb-doc { padding: 26px 30px 60px; max-width: 560px; }
.nv-wb-doc h2 { margin: 0; font-size: 19px; }
.nv-wb-doc-meta { font-size: 12px; color: var(--nv-secondary-text); margin: 6px 0 18px; }
.nv-wb-doc p { font-size: 13.5px; line-height: 1.85; color: var(--nv-primary-text); }

/* ===== 会话顶栏卡片标签 ===== */
.nv-hchips { position: relative; display: inline-flex; align-items: center; gap: 6px; margin-left: 8px; }
.nv-hchips .nv-tag { vertical-align: middle; }
.nv-hchips-btn { border: 0; cursor: pointer; }
.nv-hchips-btn[data-active='true'] { border-color: var(--nv-accent); }
.nv-hchips-pop { position: absolute; top: calc(100% + 8px); left: 0; z-index: 30; width: 240px; display: flex; flex-direction: column; gap: 10px; padding: 13px 15px; background: var(--nv-surface); border: 0.5px solid var(--nv-divider); border-radius: 12px; box-shadow: 0 10px 32px rgba(20,24,22,.14); }
.nv-hchips-sec { display: flex; flex-direction: column; gap: 6px; }
.nv-hchips-sec em { font-style: normal; font-size: 11.5px; color: var(--nv-secondary-text); font-weight: 600; }

/* ===== 左栏结构改造：薄荷创作钮 + 平铺会话列表 + 山也底栏 ===== */
/* 壳自带的「新会话」按钮与「插件」行没有槽位可换，按壳的语义钩子隐藏。 */
button[class*="newSession"] { display: none !important; }
nav[class*="panelList"] button[aria-label="插件"],
nav[class*="panelList"] button[aria-label="Plugins"] { display: none !important; }
/* 「创作」导航行就是设计稿的薄荷 +创作 主按钮。 */
nav[class*="panelList"] button[aria-label="创作"],
nav[class*="panelList"] button[aria-label="Create"] {
  background: var(--nv-accent); border-radius: 10px; margin: 2px 8px 8px; width: auto;
  color: #fff; font-weight: 600;
}
nav[class*="panelList"] button[aria-label="创作"]:hover,
nav[class*="panelList"] button[aria-label="Create"]:hover { filter: brightness(1.05); }
nav[class*="panelList"] button[aria-label="创作"] svg,
nav[class*="panelList"] button[aria-label="Create"] svg { color: #fff !important; }
nav[class*="panelList"] button[aria-label="创作"] span,
nav[class*="panelList"] button[aria-label="Create"] span { color: #fff !important; }
/* 它是填充型主按钮，不是列表行：选中后全局「选中态唯一规则」会剥掉底色，
   白字白图标落在透明底上等于整颗消失——这里把薄荷填充钉回来。 */
nav[class*="panelList"] button[aria-label="创作"]:not(:hover),
nav[class*="panelList"] button[aria-label="Create"]:not(:hover) { background: var(--nv-accent); }
/* 收轨后主按钮与其余导航条目同尺寸：36×36 的薄荷方块，不再缩成 20px 窄条。 */
[data-sidebar-collapsed] nav[class*="panelList"] button[aria-label="创作"],
[data-sidebar-collapsed] nav[class*="panelList"] button[aria-label="Create"] {
  width: 36px;
  margin: 0;
  border-radius: var(--dsw-radius-md);
}

.nv-side-railbtn { display: flex; align-items: center; justify-content: center; width: 36px; height: 36px; margin: 6px auto; border: 0; border-radius: 9px; background: transparent; color: var(--nv-secondary-text); cursor: pointer; }
.nv-side-railbtn:hover { background: var(--nv-accent-soft); color: var(--nv-accent-deep); }
.nv-foot { display: flex; align-items: center; gap: 6px; width: 100%; padding: 2px 4px; }
.nv-foot-user { display: flex; align-items: center; gap: 8px; flex: 1; min-width: 0; border: 0; background: transparent; border-radius: 9px; padding: 5px 6px; cursor: pointer; text-align: left; }
.nv-foot-user:hover { background: var(--nv-accent-soft); }
.nv-foot-avatar { width: 26px; height: 26px; border-radius: 50%; object-fit: cover; display: block; background: var(--nv-surface); flex: none; }
.nv-foot-avatar-empty { box-sizing: border-box; border: 1px dashed var(--nv-divider); }
.nv-foot-name { font-size: 13px; font-weight: 500; color: var(--nv-primary-text); }
.nv-foot-gear { flex: none; }
.nv-foot-rail { display: block; margin: 4px auto; border: 0; background: transparent; padding: 3px; cursor: pointer; border-radius: 50%; }
.nv-mode-switch { display: flex; align-items: center; justify-content: center; gap: 7px; width: calc(100% - 8px); min-height: 34px; margin: 4px; padding: 6px 10px; border: 0; border-radius: 9px; background: transparent; color: var(--nv-secondary-text); cursor: pointer; font-size: 13px;
  transition: color var(--nv-dur-micro) var(--nv-ease-out), background var(--nv-dur-micro) var(--nv-ease-out); }
.nv-mode-switch:hover { background: var(--nv-accent-soft); color: var(--nv-accent-deep); }
.nv-mode-switch[aria-pressed="true"] { color: var(--nv-select); }
.nv-mode-switch-icon { display: inline-flex; align-items: center; justify-content: center; flex: none;
  transition: transform var(--nv-dur-ui) var(--nv-ease-out); }
.nv-mode-switch[aria-pressed="true"] .nv-mode-switch-icon { transform: translateX(2px); }
.nv-mode-switch-label { font-weight: 500; }
.nv-mode-switch-rail { width: 36px; height: 36px; margin: 4px auto; padding: 0; }
.nv-mode-switch-brand { flex: none; width: auto; min-height: 30px; margin: 0; padding: 4px 6px; border-radius: 7px; }
/* 红绿灯占去品牌行左侧后，窄侧栏只收起次级拉丁字标；主品牌与 Agent 永不换行。 */
@container (max-width: 304px) {
  [data-integrated-brand] [data-noven-latin-name] { display: none; }
}
.nv-side-session-button { display: inline-flex; align-items: center; justify-content: center; width: 28px; height: 28px; padding: 0; border: 0; border-radius: 7px; background: transparent; color: var(--nv-secondary-text); cursor: pointer; }
.nv-side-session-button:hover { background: var(--nv-accent-soft); color: var(--nv-accent-deep); }
.nv-side-session-button:disabled { opacity: .45; cursor: default; }

/* 侧边头部为框架的 [上级][折叠] 预留同一块宽度；会话头不再各自加 padding。 */
[data-side-chrome] [class*='headerUtilities'] { padding-right: var(--dsh-side-chrome-inset); }

/* 会话页：工具行 / 保存回执 / 斜杠胶囊 */
.nv-toolrow { display: inline-flex; align-items: center; gap: 6px; max-width: 100%; padding: 3px 10px; border-radius: 999px; background: var(--nv-surface); border: 0.5px solid var(--nv-divider); font-size: 12px; color: var(--nv-secondary-text); }
.nv-toolrow-icon { display: inline-flex; color: var(--nv-secondary-text); }
.nv-toolrow[data-tone="run"] .nv-toolrow-icon { color: var(--nv-accent-deep); animation: nv-spin 1s linear infinite; }
.nv-toolrow[data-tone="done"] .nv-toolrow-icon { color: var(--nv-accent-deep); }
.nv-toolrow[data-tone="error"] { border-color: var(--nv-danger-line); color: var(--nv-danger); }
.nv-toolrow[data-tone="error"] .nv-toolrow-icon { color: var(--nv-danger); }
.nv-toolrow-label { color: var(--nv-primary-text); font-weight: 500; }
.nv-toolrow-detail { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
@keyframes nv-spin { to { transform: rotate(360deg); } }

.nv-receipt { display: flex; align-items: flex-start; gap: 10px; max-width: 460px; margin: 4px 0; padding: 12px 14px; background: var(--nv-surface); border: 0.5px solid var(--nv-divider); border-radius: 14px; box-shadow: 0 1px 3px rgba(20,60,45,.05); }
.nv-receipt-check { flex: none; width: 20px; height: 20px; margin-top: 1px; display: inline-flex; align-items: center; justify-content: center; border-radius: 50%; background: var(--nv-accent); color: #fff; }
.nv-receipt-body { flex: 1; min-width: 0; }
.nv-receipt-title { font-size: 13px; font-weight: 600; color: var(--nv-primary-text); display: flex; align-items: center; gap: 8px; }
.nv-receipt-kind { flex: none; font-size: 11px; font-weight: 500; padding: 1px 7px; border-radius: 999px; border: 0.5px solid var(--nv-accent); color: var(--nv-accent-deep); background: var(--nv-accent-soft); }
.nv-receipt-sub { margin-top: 3px; font-size: 12px; color: var(--nv-secondary-text); }
.nv-receipt-actions { flex: none; display: flex; flex-direction: column; align-items: flex-end; gap: 4px; }
.nv-receipt-btn { border: 0; background: transparent; padding: 0; font-size: 12px; color: var(--nv-accent-deep); cursor: pointer; }
.nv-receipt-btn:hover { text-decoration: underline; }
.nv-receipt-list { display: flex; flex-direction: column; gap: 6px; margin: 2px 0 6px; }

/* 空白会话 hero：noven-brand 已把品牌块放进 conversation.hero.brand.mark 槽，
   原生标题组（旧标语+预览版徽标）随 mark 一并隐藏。 */
[class*="headline"] > [class*="titleGroup"] { display: none; }

/* 会话顶栏绑定 chips（01b：项目 / 背景 / 管理） */
.nv-hchip { display: inline-flex; align-items: center; height: 22px; padding: 0 9px; margin-left: 4px; border-radius: 999px; border: 0.5px solid var(--nv-divider); background: transparent; font-size: 11px; color: var(--nv-secondary-text); cursor: pointer; }
.nv-hchip:hover { border-color: var(--nv-accent); color: var(--nv-accent-deep); background: var(--nv-accent-soft); }

/* 本会话 tab：绑定编辑 */
.nv-ctx-section h4 { display: flex; align-items: center; }
.nv-ctx-add { margin-left: auto; width: 20px; height: 20px; padding: 0; display: inline-flex; align-items: center; justify-content: center; border: 0; background: transparent; border-radius: 5px; color: var(--nv-secondary-text); cursor: pointer; }
.nv-ctx-add:hover { background: var(--nv-accent-soft); color: var(--nv-accent-deep); }
.nv-ctx-wb { margin-left: auto; padding: 3px 11px; font-size: 11px; }
.nv-ctx-card { display: inline-flex; align-items: center; gap: 9px; flex: 1; min-width: 0; border: 0; background: transparent; padding: 0; font-size: 13px; color: var(--nv-primary-text); cursor: pointer; text-align: left; }
.nv-ctx-card small { margin-left: auto; }
.nv-ctx-remove { width: 18px; height: 18px; flex: none; border: 0; background: transparent; border-radius: 5px; font-size: 10px; color: var(--nv-secondary-text); cursor: pointer; opacity: 0; }
.nv-ctx-row:hover .nv-ctx-remove { opacity: 1; }
.nv-ctx-perms { display: flex; gap: 5px; padding-left: 35px; }
.nv-ctx-perm { height: 20px; padding: 0 9px; border-radius: 999px; border: 0.5px solid var(--nv-divider); background: transparent; font-size: 11px; color: var(--nv-secondary-text); cursor: pointer; }
.nv-ctx-perm[data-on] { border-color: var(--nv-accent); }
.nv-tag-mint { border-color: var(--nv-accent); color: var(--nv-accent-deep); background: transparent; }

/* 统计行收进 hover 才展开的设计不需要——产品形态里不显示 */
[data-composer-stats] { display: none !important; }

/* ===== 创作库：项目总览 / 项目内页 / 作品抽屉 ===== */
.nv-lib { display: flex; flex-direction: column; gap: 16px; }
.nv-lib-inboxbar { display: flex; justify-content: flex-end; }
.nv-proj-grid { grid-template-columns: repeat(auto-fill, minmax(230px, 1fr)); }
.nv-proj { position: relative; text-align: left; padding: 0; display: flex; flex-direction: column; }
.nv-proj[data-missing='true'] { opacity: .55; }
.nv-proj-hit { flex: 1; display: flex; flex-direction: column; text-align: left; padding: 0; border: 0; background: none; cursor: pointer; font: inherit; color: inherit; border-radius: var(--nv-radius); overflow: hidden; }
.nv-proj .nv-cardmenu { position: absolute; top: 8px; right: 8px; }
.nv-proj .nv-cardmenu-dot { opacity: 0; background: var(--nv-surface); }
.nv-proj:hover .nv-cardmenu-dot, .nv-proj .nv-cardmenu:has(.nv-cardmenu-pop) .nv-cardmenu-dot { opacity: 1; }
.nv-projdlg-actions { display: flex; gap: 10px; }
.nv-proj-cover { display: grid; grid-template-columns: repeat(2, 1fr); aspect-ratio: 16/9; background: var(--nv-canvas); overflow: hidden; }
.nv-proj-cover .ph { grid-column: 1 / -1; display: flex; align-items: center; justify-content: center; font-size: 30px; font-weight: 700; color: var(--nv-accent-deep); background: var(--nv-accent-soft); }
.nv-proj-cover img { width: 100%; height: 100%; object-fit: cover; display: block; }
.nv-proj-cover[data-count='1'] { grid-template-columns: 1fr; }
.nv-proj-cover[data-count='3'] img:first-child { grid-row: 1 / -1; }
.nv-proj-body { padding: 12px 14px 14px; display: flex; flex-direction: column; gap: 6px; }
.nv-proj-kinds { display: flex; gap: 6px; flex-wrap: wrap; }

.nv-projpage { position: relative; }
.nv-projhead { display: flex; align-items: center; gap: 14px; }
.nv-projhead-cover { width: 52px; height: 52px; border-radius: 10px; overflow: hidden; background: var(--nv-accent-soft); color: var(--nv-accent-deep); display: flex; align-items: center; justify-content: center; font-size: 20px; font-weight: 700; flex: none; }
.nv-projhead-cover img { width: 100%; height: 100%; object-fit: cover; }
.nv-kindtabs { flex: 1; min-width: 0; overflow-x: auto; scrollbar-width: none; }
.nv-kindtabs::-webkit-scrollbar { display: none; }
.nv-stagechips { display: flex; align-items: center; gap: 6px; flex-wrap: wrap; }
.nv-stagelabel { font-size: 12px; color: var(--nv-secondary-text); }
.nv-stagechips .nv-pill { border: 0.5px solid var(--nv-divider); background: var(--nv-surface); color: var(--nv-primary-text); padding: 5px 13px; font-size: 12px; }
.nv-stagechips .nv-pill[data-active='true'] { background: var(--nv-inverse-surface); border-color: var(--nv-inverse-surface); color: var(--nv-inverse-text); }
.nv-archive-toggle { display: inline-flex; align-items: center; gap: 6px; font-size: 12px; color: var(--nv-secondary-text); cursor: pointer; }
.nv-lib-h { margin: 0 0 10px; font-size: 12px; font-weight: 600; color: var(--nv-secondary-text); }
.nv-work-grid { grid-template-columns: repeat(auto-fill, minmax(180px, 1fr)); }
.nv-work { overflow: hidden; text-align: left; padding: 0; cursor: pointer; display: flex; flex-direction: column; }
.nv-work-cover { position: relative; display: block; aspect-ratio: 4/3; background: var(--nv-canvas); }
.nv-work-cover img { width: 100%; height: 100%; object-fit: cover; display: block; }
.nv-work-cover .ph { width: 100%; height: 100%; display: flex; align-items: center; justify-content: center; font-size: 13px; color: var(--nv-secondary-text); }
.nv-work-body { padding: 10px 12px 12px; display: flex; flex-direction: column; gap: 5px; }
.nv-work-meta { display: flex; align-items: center; gap: 6px; flex-wrap: wrap; }
.nv-stage { font-size: 11px; font-weight: 600; padding: 1px 8px; border-radius: 999px; background: var(--nv-canvas); color: var(--nv-secondary-text); }
.nv-stage[data-stage='final'] { background: var(--nv-accent-soft); color: var(--nv-accent-deep); }
.nv-stage[data-stage='published'] { background: #16181A; color: #fff; }

.nv-wdrawer { position: fixed; top: 0; right: 0; bottom: 0; width: 460px; max-width: 72%; background: var(--nv-surface); border-left: 0.5px solid var(--nv-divider); display: flex; flex-direction: column; animation: nv-slide-in var(--nv-dur-ui) var(--nv-ease-out); z-index: 6; }
.nv-wdrawer-head { position: relative; display: flex; align-items: center; gap: 8px; padding: 16px 46px 12px 20px; border-bottom: 0.5px solid var(--nv-divider); }
.nv-wdrawer-head strong { font-size: 15px; }
.nv-wdrawer-scroll { flex: 1; min-height: 0; display: grid; grid-template-columns: 1fr 150px; }
.nv-wdrawer-preview { padding: 18px 20px; overflow-y: auto; border-right: 0.5px solid var(--nv-divider); }
.nv-wdrawer-preview img { width: 100%; border-radius: 10px; display: block; }
.nv-wdrawer-text { font-size: 13px; line-height: 1.8; color: var(--nv-primary-text); white-space: pre-wrap; }
.nv-wdrawer-side { padding: 16px 14px; overflow-y: auto; display: flex; flex-direction: column; gap: 8px; }
.nv-wdrawer-side h4 { margin: 6px 0 2px; font-size: 11.5px; font-weight: 600; color: var(--nv-secondary-text); }
.nv-rev { display: flex; flex-direction: column; gap: 2px; padding: 8px 10px; border-radius: 9px; border: 0.5px solid var(--nv-divider); }
.nv-rev[data-current='true'] { border-color: var(--nv-accent); }
.nv-rev strong { font-size: 12.5px; }
.nv-rev small { font-size: 11px; color: var(--nv-secondary-text); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.nv-rev .nv-link { align-self: flex-start; font-size: 11.5px; }
.nv-wdrawer-links { display: flex; gap: 6px; flex-wrap: wrap; }
.nv-wdrawer-links .nv-tag { cursor: pointer; }
.nv-rev-src { font-size: 12px; color: var(--nv-secondary-text); line-height: 1.6; }
.nv-wdrawer-foot { display: flex; gap: 10px; padding: 12px 20px; border-top: 0.5px solid var(--nv-divider); }
.nv-wdrawer-foot .nv-btn-ghost { flex: 1; padding: 8px 10px; font-size: 12.5px; }
.nv-btn-ghost.nv-danger { color: var(--nv-danger); }

/* Card pick — two trading cards levitating tilted over the dimmed page. A
   hover straightens and lights one; a click holds it upright while the
   sibling recedes, then the caption bar swaps to the naming field. */
.nv-pick {
  position: fixed; inset: 0; z-index: 1200;
  display: flex; flex-direction: column; align-items: center; justify-content: center;
  background: rgba(18, 22, 24, 0.62);
  backdrop-filter: blur(14px) saturate(0.9);
  -webkit-backdrop-filter: blur(14px) saturate(0.9);
  transition: backdrop-filter 420ms ease, -webkit-backdrop-filter 420ms ease, background 420ms ease,
    opacity 340ms ease;
  animation: nv-pick-fade 240ms ease-out;
}
/* Retract plays the entrance in reverse: each card drops, shrinks and fades
   through its enter layer, slightly staggered, while the layer fades out. */
.nv-pick[data-leaving] { pointer-events: none; }
.nv-pick[data-leaving] .nv-pick-enter {
  animation: nv-pick-exit 340ms cubic-bezier(0.5, 0, 0.75, 0.4) forwards;
}
.nv-pick[data-leaving] .nv-pick-holder[data-side='import'] .nv-pick-enter { animation-delay: 60ms; }
@keyframes nv-pick-exit {
  from { opacity: 1; transform: translateY(0) scale(1); }
  to { opacity: 0; transform: translateY(56px) scale(0.92); }
}
.nv-pick[data-leaving] .nv-pick-title,
.nv-pick[data-leaving] .nv-pick-namer { opacity: 0; }
.nv-pick[data-leaving] { opacity: 0; transition-delay: 90ms; }
.nv-pick[data-naming] {
  background: rgba(18, 22, 24, 0.78);
  backdrop-filter: blur(30px) saturate(0.85);
  -webkit-backdrop-filter: blur(30px) saturate(0.85);
}
@keyframes nv-pick-fade { from { opacity: 0; } to { opacity: 1; } }
.nv-pick-title {
  position: absolute; top: 64px;
  display: flex; align-items: center; gap: 8px;
  font-size: 15px; font-weight: 600; letter-spacing: 0.12em;
  color: rgba(255, 255, 255, 0.82);
  animation: nv-pick-title-in 480ms cubic-bezier(0.2, 0.9, 0.25, 1) backwards;
}
.nv-pick-title-star { display: flex; color: var(--nv-accent); }
.nv-pick-title, .nv-pick-namer { transition: opacity var(--nv-dur-ui) ease; }
@keyframes nv-pick-title-in {
  from { opacity: 0; transform: translateY(28px); }
  to { opacity: 1; transform: translateY(0); }
}
.nv-pick-stage {
  display: flex; align-items: center; gap: 64px;
  transition: opacity 340ms ease, transform 340ms ease;
}
/* Naming keeps the cards on stage: they slide apart to open the center while
   the namer settles between them. */
/* Naming keeps both cards live — the other side stays switchable. */
.nv-pick[data-naming] .nv-pick-holder[data-side='new'] { transform: translateX(-170px) scale(0.92); }
.nv-pick[data-naming] .nv-pick-holder[data-side='import'] { transform: translateX(170px) scale(0.92); }
/* Static hit area, padded past the card's visual edge: every transform lives
   on the inner card, so hover can never flicker as geometry moves. */
.nv-pick-holder {
  width: 340px; height: 470px;
  display: flex; align-items: center; justify-content: center;
  transition: transform 420ms cubic-bezier(0.25, 0.9, 0.3, 1);
}
.nv-pick-card {
  position: relative;
  width: 300px; aspect-ratio: 3 / 4.2;
  padding: 0; border: 1px solid rgba(255, 255, 255, 0.28); border-radius: 18px;
  overflow: hidden; cursor: pointer;
  background: #0C1219;
  box-shadow: 0 30px 60px -18px rgba(0, 0, 0, 0.65), 0 4px 14px rgba(0, 0, 0, 0.35);
  /* The rest transition is the calm one: pointer leaving releases the card
     back to its tilt without overshoot. Hover-in overrides with the spring. */
  transition: transform 340ms cubic-bezier(0.3, 0, 0.2, 1), box-shadow 320ms ease, opacity 320ms ease;
}
/* The enter layer flies the card in once; the float layer bobs forever; the
   card's transform only ever transitions tilt. Keeping each transform on its
   own element means no keyframe can own the card during a hover — the first
   touch stays smooth even while the entrance is still running. */
.nv-pick-enter { animation: nv-pick-enter 560ms cubic-bezier(0.18, 0.85, 0.3, 1.1) backwards; }
.nv-pick-holder[data-side='import'] .nv-pick-enter { animation-delay: 80ms; }
@keyframes nv-pick-enter {
  from { opacity: 0; transform: translateY(56px) scale(0.92); }
  to { opacity: 1; transform: translateY(0) scale(1); }
}
.nv-pick-float { animation: nv-pick-float 5.5s ease-in-out 560ms infinite alternate; }
.nv-pick-holder[data-side='import'] .nv-pick-float { animation-delay: 640ms; }
@keyframes nv-pick-float {
  from { transform: translateY(4px); }
  to { transform: translateY(-6px); }
}
.nv-pick-card[data-side='new'] { transform: rotate(-5.5deg); }
.nv-pick-card[data-side='import'] { transform: rotate(4.5deg); }
.nv-pick-holder:hover .nv-pick-card:not([data-chosen]):not([data-dim]),
.nv-pick-card[data-chosen] {
  transition: transform 380ms cubic-bezier(0.2, 0.9, 0.3, 1.15), box-shadow 320ms ease, opacity 320ms ease;
  transform: rotate(0deg) translateY(-5px) scale(1.045);
  box-shadow: 0 42px 80px -20px rgba(0, 0, 0, 0.7), 0 0 0 1.5px rgba(52, 211, 153, 0.75), 0 0 44px rgba(52, 211, 153, 0.28);
}
.nv-pick-card[data-chosen] { transform: rotate(0deg) translateY(-3px) scale(1.08); }
.nv-pick-card[data-dim] { opacity: 0.28; transform: scale(0.9); }
.nv-pick-holder:hover .nv-pick-card[data-dim] { opacity: 0.6; }
.nv-pick-art {
  position: absolute; inset: 0; width: 100%; height: 100%; object-fit: cover;
  user-select: none; -webkit-user-drag: none;
}
.nv-pick-cap {
  position: absolute; left: 0; right: 0; bottom: 0;
  display: flex; flex-direction: column; gap: 2px;
  padding: 40px 20px 16px;
  background: linear-gradient(180deg, transparent, rgba(8, 12, 16, 0.82) 42%);
  text-align: left;
}
.nv-pick-cap strong { font-size: 17px; font-weight: 700; color: #FFFFFF; letter-spacing: 0.04em; }
.nv-pick-cap small { font-size: 11.5px; color: rgba(255, 255, 255, 0.66); }
/* The naming step is its own centered scene over a deeper frost — the cards
   fade out through .nv-pick[data-naming] instead of swapping caption content. */
.nv-pick-namer {
  position: absolute; inset: 0; z-index: 1;
  display: flex; flex-direction: column; align-items: center; justify-content: center;
  gap: 0;
  /* The overlay spans the screen but only its own controls take the pointer —
     the cards at the sides stay clickable. */
  pointer-events: none;
  animation: nv-pick-namer-in 420ms cubic-bezier(0.2, 0.9, 0.25, 1) backwards;
}
.nv-pick-namer > * { pointer-events: auto; }
.nv-pick-namer .nv-pick-namer-ray { pointer-events: none; }
@keyframes nv-pick-namer-in {
  from { opacity: 0; transform: translateY(18px); }
  to { opacity: 1; transform: translateY(0); }
}
.nv-pick-namer-input {
  width: 300px; box-sizing: border-box; text-align: center;
  padding: 4px 0; border: 0; border-radius: 0;
  background: transparent; color: #FFFFFF; caret-color: var(--nv-accent);
  font-size: 17px; font-weight: 500; letter-spacing: 0.06em; outline: none;
}
.nv-pick-namer-input::placeholder {
  color: rgba(255, 255, 255, 0.38); font-weight: 400;
  transition: opacity var(--nv-dur-ui) ease;
}
/* Resting state shows the gray default name; hovering or having clicked in
   clears it, and it returns when the pointer leaves an untouched field. */
.nv-pick-namer-input:hover::placeholder,
.nv-pick-namer-input:focus::placeholder { opacity: 0; }
.nv-pick-namer-ray {
  width: 180px; height: 1px; margin: 24px 0 20px;
  background: linear-gradient(90deg,
    transparent 0%, rgba(52, 211, 153, 0.85) 50%, transparent 100%);
  box-shadow: 0 0 12px rgba(52, 211, 153, 0.55);
}
.nv-pick-namer-go {
  border: 0; border-radius: 0; padding: 4px 2px; cursor: pointer;
  background: none; color: rgba(255, 255, 255, 0.62);
  font-size: 13px; font-weight: 500; letter-spacing: 0.14em;
  transition: color var(--nv-dur-micro) ease;
}
.nv-pick-namer-go:hover { color: #A7F3D0; }
.nv-pick-namer-cancel {
  position: absolute; left: 50%; bottom: 56px; transform: translateX(-50%);
  appearance: none; -webkit-appearance: none;
  border: 0; padding: 4px; cursor: pointer;
  background: none; color: rgba(255, 255, 255, 0.4);
  font-size: 12px; font-weight: 400; letter-spacing: 0.18em;
  text-shadow: 0 0 10px rgba(255, 255, 255, 0.25);
  transition: color var(--nv-dur-micro) ease;
}
.nv-pick-namer-cancel:hover { color: rgba(255, 255, 255, 0.8); }

/* 内容树占满工具列表之外的剩余高度；功能入口恢复为真实的下方导航区。 */
[data-zone='top'] { flex: 1; min-height: 0; max-height: none; }
[data-zone='features'] { flex: none; max-height: 42%; }

/* ---------- 新工作台外壳：左列内容树 / 中列画布标签页 / 右列对话 ---------- */

/* 抽屉 chrome 行（上游 panelHead：全屏 + 收起两钮）。全屏钮作废隐藏；panelHead
   出流叠到抽屉右上角，收起钮落进项目头同一排——抽屉第一行由此与画布标签条、
   对话标题同高带（上游类名带 CSS-module 哈希前缀，按子串匹配）。 */
[class*='navBody'] { position: relative; }
[class*='panelHead'] { position: absolute; top: 5px; right: 8px; padding: 0; z-index: 10; }
[data-sidebar-right-mode] { display: none; }
/* 画布开关只在抽屉里的固定 switch 上；缝上胶囊不再作为第二个入口。 */
[data-sidebar-right-canvas-park] { display: none !important; }

/* 设计稿 01 底色：抽屉与会话两列底偏灰（pane），控件与画布留白。抽屉面板
   自身不刷色、内部也无白底元素，直接给面板着色；会话列的根容器刷的是
   bg-base，按 slot 契约锚点覆盖成 pane 色（composer 卡片走 input-major
   令牌，不受影响，保持白卡）。 */
[data-sidebar-right-panel] { background-color: var(--nv-pane); }
[data-slot='main.conversation'] > [data-phase] { background-color: var(--nv-pane); }
/* better-sidebar 的底部面板用 translateY(102%) 把车停在视口外，但这条
   变换后的盒仍计入外层 scrollHeight，整页被顶出 225px 纵向滚动条——
   隐藏态直接 display:none（代价仅是开面板时少一次滑入动画）。 */
[data-dsh-bottom-panel][class*='bottomPanelHidden'] { display: none; }
/* 对话顶栏保留上游的三态高度：空会话、标题与视图切换各有真实内容，
   不再把导航能力压没来凑三列顶线。 */

/* 左列内容树 */
.nv-tree { display: flex; flex-direction: column; height: 100%; min-height: 0; color: var(--nv-primary-text); }
/* 行全是 width:100% + padding，不带 border-box 会顶出横向滚动条。 */
.nv-tree * { box-sizing: border-box; }
.nv-tree-rail { align-items: center; gap: 0; }
.nv-tree-railbtn { display: flex; align-items: center; justify-content: center; width: 36px; height: 36px;
  border: 0; border-radius: var(--dsw-radius-md); background: none; color: var(--nv-primary-text);
  font-size: 13px; font-weight: 600; cursor: pointer; overflow: hidden; }
.nv-tree-railbtn:hover { background: var(--nv-hover); }
/* 开关态（Studio/挂窗/底栏）沿用"绿=状态"语义；新建组分隔线是工具组的开头。 */
.nv-tree-railbtn[data-active='true'] { color: var(--nv-select); }
/* 组间线要真的看得见（用户拍板：上新建下工具，两线之间隔一条线）——中性中灰，
   亮暗两主题都立得住；--nv-divider 太浅形同虚设。 */
.nv-tree-rail-sep { width:  22px; height: 1.5px; margin: 7px 0 5px; border-radius: 1px;
  background: rgba(128, 132, 136, 0.55); }
/* 抽屉轨只留一条组间线：上游 railTop 底的发丝线切在工具组内部（挂窗/底栏与
   功能图标之间），撤掉它，让工具组从开关到功能图标连成一段；轨上放得下，
   高度上限从 50% 放宽。功能图标整体灰度（用户拍板：工具换单色）——连按钮
   一起过滤，连 emoji 底色也一并压灰，选中底色随 §8 落回灰底。 */
div:has(> .nv-tree-rail) { border-bottom: 0 !important; margin-bottom: 2px !important; max-height: 62% !important; }
[data-sidebar-right-expand-rail] ~ nav button { filter: grayscale(1); }
/* 项目头一行（设计稿 01）：项目名按内容收窄，行尾的眼睛/收起钮留足位置；
   右 padding 给叠进来的抽屉收起钮留座。 */
.nv-tree-head { display: flex; align-items: center; gap: 2px; padding: 6px 42px 6px 12px; }
.nv-tree-head > span { flex: 1; min-width: 0; display: block; }
.nv-tree-project { display: flex; align-items: center; gap: 6px; flex: 0 1 auto; min-width: 0; max-width: 100%;
  border: 0; background: none;
  padding: 4px 6px; font-size: 14px; font-weight: 600; color: var(--nv-primary-text); cursor: pointer; border-radius: 8px; }
.nv-tree-project:hover { background: var(--nv-hover); }
.nv-tree-projectname { flex: 1; min-width: 0; text-align: left; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.nv-tree-caret { flex: none; color: var(--nv-secondary-text); }
.nv-tree-search { padding: 2px 12px 10px; }
.nv-tree-searchwrap { position: relative; display: flex; align-items: center; }
.nv-tree-searchicon { position: absolute; left: 9px; display: inline-flex; color: var(--nv-secondary-text); pointer-events: none; }
.nv-tree-searchbox { width: 100%; height: 30px; box-sizing: border-box; border: 1px solid var(--nv-divider); border-radius: 8px; padding: 4px 32px 4px 28px;
  font-size: 12px; background: var(--nv-surface); color: var(--nv-primary-text); outline: none; }
.nv-tree-searchbox:focus { border-color: var(--nv-accent); }
.nv-tree-kbd { position: absolute; right: 7px; padding: 1px 5px; border: 0.5px solid var(--nv-divider); border-radius: 4px;
  background: var(--nv-surface); color: var(--nv-secondary-text); font-size: 10px; font-family: inherit; pointer-events: none; }
.nv-tree-scroll { flex: 1; min-height: 0; overflow-y: auto; padding: 0 6px 8px; }
.nv-tree-empty { padding: 56px 12px; text-align: center; color: var(--nv-secondary-text); font-size: 12px; }
.nv-tree-newrowwrap { padding: 6px 10px 2px; }
.nv-tree-newrow { width: 100%; display: flex; align-items: center; gap: 8px; padding: 7px 10px; border: 0; border-radius: 8px;
  background: none; color: var(--nv-primary-text); font-size: 12.5px; cursor: pointer; text-align: left; font-family: inherit; }
.nv-tree-newrow:hover { background: var(--nv-accent-soft); }
.nv-tree-newrowplus { color: var(--nv-accent-deep); font-size: 14px; }
/* 分组头 = 纯灰小标签（设计稿 02/03），不折叠；行尾「＋」悬停才显。 */
.nv-tree-grouprow { display: flex; align-items: center; gap: 4px; width: 100%;
  padding: 12px 6px 3px; font-size: 11px; color: var(--nv-secondary-text); }
.nv-tree-grouprow-toggle { cursor: pointer; user-select: none; }
.nv-tree-grouptitle { flex: 1; min-width: 0; text-align: left; letter-spacing: 0.04em;
  border: 0; background: none; padding: 0; font: inherit; color: inherit; cursor: inherit; }
.nv-tree-grouprow-toggle:hover .nv-tree-grouptitle { color: var(--nv-primary-text); }
/* 分组拖排序：源组半透明，落点上下给 2px 指示线。 */
.nv-tree-groupslot { position: relative; }
.nv-tree-groupslot-drag { opacity: 0.45; }
.nv-tree-drop-before::before, .nv-tree-drop-after::after { content: ''; position: absolute;
  left: 6px; right: 6px; height: 2px; border-radius: 1px; background: var(--nv-accent); z-index: 2; }
.nv-tree-drop-before::before { top: -1px; }
.nv-tree-drop-after::after { bottom: -1px; }
.nv-tree-count { font-size: 10px; color: var(--nv-secondary-text); }
/* 折叠箭头移到行最右端（设计稿 02 卡行）；展开时旋 90°。 */
.nv-tree-fold { display: inline-flex; align-items: center; justify-content: center; width: 18px; height: 18px;
  border: 0; background: none; padding: 0; font-size: 13px; line-height: 1; color: var(--nv-secondary-text);
  cursor: pointer; transition: transform var(--nv-dur-micro); }
.nv-tree-fold-on { transform: rotate(90deg); }
/* 行尾「＋」常态隐身，悬停行才显（设计稿 J05）。 */
.nv-tree-add { flex: none; width: 18px; height: 18px; border: 0; background: none; padding: 0;
  font-size: 15px; line-height: 1; color: var(--nv-secondary-text); cursor: pointer; opacity: 0; }
.nv-tree-row:hover .nv-tree-add, .nv-tree-grouprow:hover .nv-tree-add { opacity: 1; }
.nv-tree-add:hover { color: var(--nv-primary-text); }
/* 行尾 ⋯：同 + 一族，悬停行才显。 */
.nv-tree-more { flex: none; width: 20px; height: 18px; border: 0; background: none; padding: 0;
  font-size: 13px; line-height: 1; color: var(--nv-secondary-text); cursor: pointer; opacity: 0; }
.nv-tree-row:hover .nv-tree-more { opacity: 1; }
.nv-tree-more:hover { color: var(--nv-primary-text); }
/* 归档（STANDBY）模块：淡出半透，仍可读可点。 */
.nv-tree-row[data-archived='true'] { opacity: .5; }
/* 行内改名输入框：贴着行高的一栏输入。 */
.nv-tree-renamein { flex: 1; min-width: 0; border: 1px solid var(--nv-accent); border-radius: 6px;
  background: var(--nv-surface); padding: 2px 6px; font-size: 13px; font-family: inherit;
  color: var(--nv-primary-text); outline: none; }
.nv-tree-row { display: flex; align-items: center; gap: 6px; width: 100%; border: 0; background: none;
  padding: 5px 8px; font-size: 13px; color: var(--nv-primary-text); cursor: pointer; border-radius: 8px; text-align: left; }
.nv-tree-row:hover { background: var(--nv-accent-soft); }
.nv-tree-card { padding-left: 4px; }
.nv-tree-main { display: flex; align-items: center; gap: 6px; flex: 1; min-width: 0; border: 0; background: none;
  padding: 0; font-size: 13px; color: inherit; cursor: pointer; text-align: left; }
.nv-tree-cardicon { width: 16px; flex: none; display: inline-flex; justify-content: center; color: var(--nv-secondary-text); }
/* 卡内「角色 N」子组行（设计稿 02）：图标 + 名 + 计数徽标。 */
.nv-tree-roleshead { display: flex; align-items: center; gap: 6px; padding: 5px 8px 5px 28px;
  font-size: 12px; color: var(--nv-secondary-text); }
.nv-tree-rolestitle { flex: 1; min-width: 0; }
.nv-tree-glyph { width: 16px; flex: none; color: var(--nv-secondary-text); font-size: 11px; }
.nv-tree-name { flex: 1; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
/* 底部分两半：「＋ 新建」开对象、「🔧 工具」开功能台（设计稿 01 变体——
   功能台从主面板挪回工作现场旁）。Menu anchor 根是 inline span——
   给 flex:1 让两半均分。画布开合不在这排，单独占搜索下方整行。 */
.nv-tree-foot { display: flex; flex-wrap: nowrap; gap: 6px; padding: 8px 10px 10px; }
.nv-tree-foot > span { display: flex; flex: 1; min-width: 0; }
.nv-tree-new { display: flex; align-items: center; justify-content: center; gap: 6px; width: 100%;
  border: 1px solid var(--nv-divider); border-radius: 8px; padding: 7px 0; font-size: 12px;
  background: var(--nv-surface); color: var(--nv-primary-text); cursor: pointer; white-space: nowrap; }
.nv-tree-new:hover { border-color: var(--nv-accent); color: var(--nv-accent-deep); }
/* 画布开关：固定一行，左标签右拨杆；开着薄荷、关着灰。 */
.nv-tree-canvasrow { display: flex; align-items: center; gap: 8px; padding: 0 12px 10px; }
.nv-tree-canvaslabel { flex: 1; min-width: 0; display: flex; align-items: center; gap: 6px;
  font-size: 12.5px; color: var(--nv-primary-text); }
.nv-tree-switch { position: relative; flex: none; width: 36px; height: 20px; padding: 0; border: 0;
  border-radius: 999px; background: var(--nv-divider); cursor: pointer;
  transition: background var(--nv-dur-micro) ease; }
/* 选中态有一条全局 [aria-checked='true'] { background:none }；开关要保留
   自己的薄荷底，用元素+类+属性的特异性压过它。 */
button.nv-tree-switch[data-canvas-on] { background: var(--nv-accent); }
.nv-tree-switch-thumb { position: absolute; top: 2px; left: 2px; width: 16px; height: 16px;
  border-radius: 50%; background: var(--nv-surface); box-shadow: 0 1px 3px rgba(0,0,0,.18);
  transition: transform var(--nv-dur-micro) var(--nv-ease-out); }
.nv-tree-switch[data-canvas-on] .nv-tree-switch-thumb { transform: translateX(16px); }
.nv-tree-toolicon { display: inline-flex; color: var(--nv-secondary-text); }
/* 分组头的删除钮：与「＋」同族悬停显隐，悬停转危险色。 */
.nv-tree-del:hover { color: var(--nv-danger); }
/* 卡尾的「＋ 新建模块」条：和「＋ 新建」同族，缩进对齐模块行。 */
.nv-tree-newmodule { margin: 5px 8px 8px 28px; width: calc(100% - 36px); padding: 7px 0; font-size: 12.5px; }
/* 呈现轴：隐藏行在「显示隐藏」掀开时画灰占位（可读可恢复，不是删除态）。 */
.nv-tree-hidden { opacity: .45; }
/* 卡架层组头：与卡行同高的文件夹行，名字加粗半度以示是容器不是实体。 */
.nv-tree-shelf .nv-tree-name { font-weight: 500; }
/* 树头的隐藏项开关：只在有隐藏项时出现；掀开时点亮。 */
.nv-tree-eye { display: inline-flex; flex: none; align-items: center; gap: 4px; border: 0;
  background: none; padding: 4px 6px; border-radius: 6px; color: var(--nv-secondary-text); cursor: pointer; }
/* 只有眼睛组的第一枚吃剩余空间，把整组推到项目名右侧；第二枚（隐藏项）跟排。 */
.nv-tree-project + .nv-tree-eye { margin-left: auto; }
.nv-tree-eye:hover { color: var(--nv-primary-text); background: var(--nv-accent-soft); }
.nv-tree-eyecount { font-size: 11px; }
/* 同级多选：选中行铺一层主题色底；批量操作条挂在树头下。 */
.nv-tree-row[data-sel] { background: var(--nv-accent-soft); border-radius: 6px; }
.nv-tree-row[data-sel] .nv-tree-name { color: var(--nv-accent-deep); }
.nv-tree-selbar { display: flex; align-items: center; gap: 2px; padding: 2px 12px 6px; border-bottom: 1px solid var(--nv-divider); }
.nv-tree-selcount { flex: 1; min-width: 0; font-size: 12px; color: var(--nv-secondary-text); }
.nv-tree-selbtn { border: 0; background: none; padding: 3px 8px; border-radius: 6px; font-size: 12px;
  color: var(--nv-primary-text); cursor: pointer; }
.nv-tree-selbtn:hover { background: var(--nv-hover); }
.nv-tree-selbtn:disabled { color: var(--nv-secondary-text); cursor: default; }
.nv-tree-selbtn:disabled:hover { background: none; }
.nv-tree-selbtn-danger { color: var(--nv-danger); }

/* 导入对话框：analyze 报告区——卡行（图标+名+类）+ 文件数行。 */
.nv-import-summary { max-height: 180px; overflow-y: auto; margin: 8px 0 4px;
  border: 1px solid var(--nv-divider); border-radius: 8px; padding: 4px 8px; }
.nv-import-row { display: flex; align-items: center; gap: 6px; padding: 5px 0; font-size: 13px;
  color: var(--nv-primary-text); }
.nv-import-name { flex: 1; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.nv-import-kind { flex: none; font-size: 11px; color: var(--nv-secondary-text); }
.nv-import-files { color: var(--nv-secondary-text); }
.nv-import-hint { font-size: 11.5px; color: var(--nv-secondary-text); margin-top: 4px; }
.nv-import-error { font-size: 12px; color: var(--nv-danger); margin-top: 6px; }

/* 中列画布：标签条 + 体 */
.nv-canvas { position: relative; display: flex; flex-direction: column; height: 100%; min-height: 0; background: var(--nv-surface); }
.nv-canvas-strip { display: flex; align-items: center; gap: 2px; padding: 6px 10px 0; border-bottom: 0; overflow-x: auto; flex: none; }
.nv-canvas-chrome-trailing { display: flex; align-items: center; gap: 2px; margin-left: auto; flex: none; }
.nv-canvas-chrome-trailing .nv-canvas-menubutton { width: 28px; height: 28px; }
.nv-chrome-icon-button { display: inline-flex; width: 28px; height: 28px; flex: none; align-items: center; justify-content: center; padding: 0; border: 0; border-radius: 6px; background: transparent; color: var(--nv-secondary-text); cursor: pointer; transition: color var(--nv-dur-micro) var(--nv-ease-out), background var(--nv-dur-micro) var(--nv-ease-out); }
.nv-chrome-icon-button:hover { color: var(--nv-accent-deep); background: var(--nv-accent-soft); }
.nv-chrome-icon-button svg { width: 16px; height: 16px; flex: none; }
/* 侧边画布的页签条为框架的 [上级][折叠] 预留同一块宽度。 */
[data-side-chrome] .nv-canvas-strip { padding-right: var(--dsh-side-chrome-inset); }
.nv-canvas-tab { position: relative; display: flex; align-items: center; gap: 6px; padding: 7px 12px; font-size: 12.5px; cursor: pointer;
  color: var(--nv-secondary-text); border-radius: 8px 8px 0 0; border-bottom: 2px solid transparent; white-space: nowrap; }
.nv-playable-title { display: inline-flex; min-width: 0; height: 30px; align-items: center; gap: 6px; padding: 0 8px; border: 0; border-radius: 6px; background: transparent; color: inherit; white-space: nowrap; }
.nv-playable-title:hover, .nv-playable-title:focus-visible { background: var(--nv-hover); }
.nv-title-text { min-width: 0; overflow: hidden; text-overflow: ellipsis; }
.nv-title-play { display: none; align-items: center; color: var(--nv-accent-deep); }
.nv-playable-title:hover .nv-title-text, .nv-playable-title:focus-visible .nv-title-text { display: none; }
.nv-playable-title:hover .nv-title-play, .nv-playable-title:focus-visible .nv-title-play { display: inline-flex; }
.nv-playing-dot { width: 6px; height: 6px; flex: none; border-radius: 50%; background: var(--nv-accent); }
@media (pointer: coarse) {
  .nv-playable-title .nv-title-text { display: none; }
  .nv-playable-title .nv-title-play { display: inline-flex; }
}
.nv-canvas-tab:hover { color: var(--nv-primary-text); background: var(--nv-accent-soft); }
/* 选中页签：绿字（统一规则）+ 底缘一字宽的圆头短绿线，无底色。 */
.nv-canvas-tab-on::after { content: ''; position: absolute; left: 50%; bottom: 0; transform: translateX(-50%);
  width: 1em; height: 2px; border-radius: 999px; background: var(--nv-select);
  animation: nv-tab-underline var(--nv-dur-ui) var(--nv-ease-out); }
@keyframes nv-tab-underline {
  from { opacity: .35; transform: translateX(-50%) scaleX(.4); }
  to { opacity: 1; transform: translateX(-50%) scaleX(1); }
}
.nv-canvas-tabtitle { max-width: 160px; overflow: hidden; text-overflow: ellipsis; }
/* × 钮悬停/选中才现身，但一直占位——出现不收版。 */
.nv-canvas-tabx { border: 0; background: none; padding: 0 2px; font-size: 13px; color: var(--nv-secondary-text); cursor: pointer; border-radius: 4px;
  opacity: 0; pointer-events: none; transition: opacity var(--nv-dur-micro) var(--nv-ease-out); }
.nv-canvas-tab:hover .nv-canvas-tabx, .nv-canvas-tab:focus-within .nv-canvas-tabx { opacity: 1; pointer-events: auto; }
.nv-canvas-tabx:hover { color: var(--nv-primary-text); background: var(--nv-accent-soft); }
/* 页签状态点：working 细呼吸、pending 绿、error 红、unsaved 灰（词汇见设计文档 §2）。 */
.nv-canvas-dots { display: inline-flex; gap: 4px; align-items: center; flex: none; }
.nv-canvas-dot { width: 6px; height: 6px; border-radius: 50%; }
.nv-dot-working { background: var(--nv-accent); animation: nv-dot-breathe 1.6s ease-in-out infinite; }
.nv-dot-error { background: var(--nv-danger); }
.nv-dot-unsaved { background: var(--nv-secondary-text); }
@keyframes nv-dot-breathe { 0%, 100% { opacity: 1; } 50% { opacity: 0.3; } }
/* AI 编辑流光：画布上缘扫光 + 页签底色流动 + 胶囊标签，三处共用一份会话态。 */
.nv-canvas[data-ai-editing]::after { content: ''; position: absolute; left: 0; right: 0; top: 0; height: 2px;
  background: linear-gradient(90deg, transparent, var(--nv-accent), transparent); background-size: 200% 100%;
  animation: nv-ai-flow 1.6s linear infinite; pointer-events: none; z-index: 5; }
.nv-canvas-tab-ai { color: var(--nv-accent-deep);
  background: linear-gradient(100deg, transparent 20%, rgba(52, 211, 153, .18) 50%, transparent 80%);
  background-size: 220% 100%; animation: nv-ai-flow 1.8s linear infinite; }
.nv-ai-tag { display: inline-flex; align-items: center; justify-content: center; min-width: 18px; height: 15px;
  padding: 0 4px; border-radius: 4px; background: var(--nv-accent-deep); color: #fff;
  font-size: 9px; font-weight: 700; letter-spacing: .04em; flex: none; }
.nv-ai-pill { display: inline-flex; align-items: center; gap: 6px; padding: 3px 9px; border-radius: 999px;
  color: var(--nv-accent-deep); border: 1px solid rgba(14, 159, 110, .24);
  background: linear-gradient(100deg, rgba(52, 211, 153, .10), rgba(52, 211, 153, .30), rgba(52, 211, 153, .10));
  background-size: 220% 100%; font-size: 10.5px; font-weight: 600; white-space: nowrap;
  animation: nv-ai-flow 1.8s linear infinite; }
.nv-ai-pill::before { content: ''; width: 6px; height: 6px; border-radius: 50%;
  background: var(--nv-accent-deep); animation: nv-dot-breathe 1.4s ease-in-out infinite; }
.nv-ai-pill-canvas { position: absolute; right: 14px; bottom: 14px; z-index: 6;
  box-shadow: 0 4px 14px rgba(16, 20, 18, .08); }
.nv-ai-pill-bleed { position: absolute; top: 14px; right: 16px; z-index: 2; }
/* AI 正在写的模块：内容只读，模块上缘一条薄绿流光；与页签/画布同源。 */
.nv-ai-locked { position: relative; }
.nv-ai-locked::before { content: ''; position: absolute; left: 0; right: 0; top: -9px; height: 1.5px;
  background: linear-gradient(90deg, transparent, var(--nv-accent), transparent); background-size: 200% 100%;
  animation: nv-ai-flow 1.8s linear infinite; pointer-events: none; }
.nv-ai-locked::after { content: ''; position: absolute; inset: -8px -10px; border-radius: 14px;
  box-shadow: inset 0 0 0 1px rgba(14, 159, 110, .12); pointer-events: none; }
@keyframes nv-ai-flow { from { background-position: 0% 50%; } to { background-position: 200% 50%; } }
@media (prefers-reduced-motion: reduce) {
  .nv-ai-pill, .nv-ai-pill::before, .nv-ai-tag, .nv-canvas-tab-ai, .nv-canvas-tab-on::after,
  .nv-canvas[data-ai-editing]::after, .nv-cardpage-ai::before, .nv-cardpage-ai .nv-pagehead,
  .nv-ov-tile-ai::after, .nv-ai-locked::before { animation: none; }
  .nv-mode-switch, .nv-mode-switch-icon, .nv-canvas-menubutton { transition: none; }
}
.nv-canvas-menubutton { display: inline-flex; align-items: center; justify-content: center; flex: none;
  width: 24px; height: 26px; padding: 0; border: 0; border-radius: 6px; background: transparent;
  color: var(--nv-secondary-text); cursor: pointer; transition: color var(--nv-dur-micro) var(--nv-ease-out), background var(--nv-dur-micro) var(--nv-ease-out); }
.nv-canvas-menubutton:hover { color: var(--nv-accent-deep); background: var(--nv-accent-soft); }
[data-noven-canvas-switch] svg { transform: rotate(90deg); }
.nv-canvas-body { position: relative; flex: 1; min-height: 0; overflow: hidden; display: flex; flex-direction: column; }
/* Host 页面按页签常驻：切页签只切显隐，关页签才卸载（终端等长连接不会被切走杀掉）。 */
.nv-canvas-page-slot { position: absolute; inset: 0; display: flex; flex-direction: column; min-height: 0; }
.nv-canvas-page-slot[hidden] { display: none; }
/* 分屏布局树：叶 = 页签组（strip+body 充满格），节点 = 分割 + 可拖缝条。 */
.nv-leaf { position: relative; display: flex; flex-direction: column; height: 100%; min-height: 0; min-width: 0; }
.nv-split { display: flex; flex: 1; min-height: 0; min-width: 0; }
.nv-split-x { flex-direction: row; }
.nv-split-y { flex-direction: column; }
.nv-split-cell { min-width: 0; min-height: 0; display: flex; flex-direction: column; }
.nv-split-bar { flex: none; background: var(--nv-divider); transition: background var(--nv-dur-micro); }
.nv-split-x > .nv-split-bar { width: 3px; cursor: col-resize; }
.nv-split-y > .nv-split-bar { height: 3px; cursor: row-resize; }
.nv-split-bar:hover { background: var(--nv-accent); }
/* 拖页签经过时叶上铺落区；高亮块指示会劈向哪缘/整叶移入。 */
.nv-leaf-drop { position: absolute; inset: 0; z-index: 30; }
.nv-leaf-hint { position: absolute; border: 2px solid var(--nv-accent); border-radius: 6px;
  background: var(--nv-accent-soft); opacity: .55; pointer-events: none; }
.nv-leaf-hint-left { inset: 0 55% 0 0; }
.nv-leaf-hint-right { inset: 0 0 0 55%; }
.nv-leaf-hint-top { inset: 0 0 55% 0; }
.nv-leaf-hint-bottom { inset: 55% 0 0 0; }
.nv-leaf-hint-center { inset: 12%; }
.nv-canvas-cardbody { flex: 1; min-height: 0; overflow-y: auto; }
/* 画布里的创作库页：把右栏的产出列表放进画布阅读列，而不是贴着抽屉宽度。 */
.nv-canvas-library { flex: 1; min-height: 0; overflow-y: auto; width: 100%; }
.nv-canvas-library .nv-ctx { max-width: 820px; margin: 0 auto; padding: 24px; }
/* 画布里的 host 注册页（终端等）：页面自己铺满画布内容区。 */
.nv-canvas-page { flex: 1; min-height: 0; height: 100%; display: flex; flex-direction: column; overflow: hidden; }
.nv-canvas-page > * { flex: 1; min-height: 0; }
/* 画布里的卡页：模块导航由抽屉树承担（树行深链到模块），卡内大纲栏不再重复出现。 */
.nv-canvas-cardbody .nv-ed-rail { display: none; }
.nv-canvas-missing { padding: 40px; text-align: center; color: var(--nv-secondary-text); }

/* 起点页 */
.nv-canvas-start { flex: 1; display: flex; align-items: center; justify-content: center; }
.nv-start-center { width: min(620px, 100%); text-align: center; padding: 24px; }
.nv-start-title { font-size: 20px; font-weight: 600; margin-bottom: 8px; }
.nv-start-sub { font-size: 13px; color: var(--nv-secondary-text); margin-bottom: 28px; }
.nv-start-grid { display: grid; grid-template-columns: repeat(3, 1fr); gap: 10px; }
.nv-start-card { display: flex; flex-direction: column; align-items: center; gap: 9px; padding: 18px 10px;
  border: 1px solid var(--nv-divider); border-radius: 14px; background: var(--nv-surface); cursor: pointer;
  font-size: 12.5px; color: var(--nv-primary-text); }
.nv-start-card:hover { border-color: var(--nv-accent); box-shadow: 0 4px 14px rgba(14, 159, 110, 0.10); }
.nv-start-glyph { font-size: 22px; color: var(--nv-accent-deep); }
.nv-start-layouts { display: grid; grid-template-columns: 1fr 1fr; gap: 10px; margin-top: 20px; text-align: left; }
.nv-start-layout { min-width: 0; display: grid; grid-template-columns: 48px 1fr; align-items: center; gap: 10px; padding: 10px 12px;
  border: .5px solid var(--nv-divider); border-radius: 12px; background: var(--nv-canvas); color: var(--nv-primary-text); }
button.nv-start-layout { cursor: pointer; font: inherit; text-align: left; }
button.nv-start-layout:hover { border-color: rgba(14,159,110,.34); background: var(--nv-accent-soft); }
.nv-start-layout > span:last-child { display: flex; flex-direction: column; gap: 2px; min-width: 0; }
.nv-start-layout strong { font-size: 12px; font-weight: 650; }
.nv-start-layout small { font-size: 10.5px; color: var(--nv-secondary-text); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.nv-start-layout-diagram { width: 46px; height: 30px; display: flex; gap: 2px; padding: 3px; box-sizing: border-box; border: .5px solid rgba(14,159,110,.24); border-radius: 6px; background: var(--nv-surface); }
.nv-start-layout-diagram i { display: block; flex: 1; border-radius: 2px; background: rgba(14,159,110,.16); }
.nv-start-layout-diagram i:nth-child(2) { flex: 2.2; background: rgba(14,159,110,.28); }
.nv-start-layout-free { opacity: .68; }
.nv-start-hint { margin-top: 18px; font-size: 12px; color: var(--nv-secondary-text); }

/* 案头：画布起点的桌面——预设一排，开始一列，其余留白 */
.nv-desk { flex: 1; min-height: 0; overflow-y: auto; display: flex; justify-content: center; }
.nv-desk-inner { width: min(640px, calc(100% - 48px)); margin: auto 0; padding: 40px 0; container-type: inline-size; }
.nv-desk-lead { margin: 0 0 34px; font-size: 15px; line-height: 1.8; color: var(--nv-secondary-text); text-align: center; }
.nv-desk-note { margin: -22px 0 28px; font-size: 12px; line-height: 1.7; color: var(--nv-secondary-text); text-align: center; opacity: .8; }
.nv-desk-section { margin-bottom: 26px; }
.nv-desk-label { margin: 0 0 12px; font-size: 11px; font-weight: 700; letter-spacing: .16em; color: var(--nv-accent-deep); }
/* 案头卡片按画布自身宽度排：宽三列、中两列、窄一列，不再用窗口宽度决定。 */
.nv-desk-row { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 10px; }
@container (max-width: 520px) { .nv-desk-row { grid-template-columns: repeat(2, minmax(0, 1fr)); } }
@container (max-width: 300px) { .nv-desk-row { grid-template-columns: minmax(0, 1fr); } }
.nv-desk-tile { display: flex; flex-direction: column; align-items: flex-start; gap: 4px; padding: 16px; text-align: left;
  border: 1px solid var(--nv-divider); border-radius: 14px; background: var(--nv-surface); cursor: pointer; color: var(--nv-primary-text);
  transition: transform 160ms var(--nv-ease-out), border-color 160ms ease, box-shadow 160ms ease; }
.nv-desk-tile:hover { transform: translateY(-2px); border-color: rgba(14,159,110,.28); box-shadow: 0 10px 24px rgba(28,64,51,.07); }
.nv-desk-glyph { color: var(--nv-accent-deep); }
.nv-desk-name { margin-top: 6px; font-size: 13.5px; font-weight: 650; }
.nv-desk-sub { font-size: 11.5px; line-height: 1.6; color: var(--nv-secondary-text); }
.nv-desk-start { width: 100%; display: flex; align-items: center; gap: 12px; padding: 14px 16px; text-align: left; box-sizing: border-box;
  border: 1px solid var(--nv-divider); border-radius: 14px; background: var(--nv-surface); cursor: pointer; color: var(--nv-primary-text);
  transition: transform 160ms var(--nv-ease-out), border-color 160ms ease, box-shadow 160ms ease; }
.nv-desk-start:hover { transform: translateY(-2px); border-color: rgba(14,159,110,.28); box-shadow: 0 10px 24px rgba(28,64,51,.07); }
.nv-desk-start-text { flex: 1; min-width: 0; display: flex; flex-direction: column; gap: 3px; }
.nv-desk-start-text strong { font-size: 13.5px; font-weight: 650; }
.nv-desk-start-text small { font-size: 11.5px; color: var(--nv-secondary-text); }
.nv-desk-arrow { color: var(--nv-secondary-text); font-size: 14px; }
.nv-desk-empty { margin: 10px 0 0; font-size: 12px; color: var(--nv-secondary-text); text-align: center; }

/* 说明书页签：只读 Markdown，一页书的边距 */
.nv-manual { flex: 1; min-height: 0; overflow-y: auto; padding: 30px 36px 60px; }
.nv-manual > * { max-width: 720px; margin-left: auto; margin-right: auto; }
.nv-manual-note { padding: 40px 0; text-align: center; font-size: 12.5px; color: var(--nv-secondary-text); }


/* 集合 · 表单视图：一条一张表单卡，标签—值逐行（填表的阅读面） */
/* 表单：一页一实体，头像 216×210 + 80px 资料行，不再套表单卡。 */
.nv-coll-forms { display: flex; flex-direction: column; gap: 40px; padding: 0; }
.nv-coll-formcard { border: 0; border-radius: 0; background: transparent; overflow: visible; }
.nv-coll-formhead { width: 100%; display: flex; align-items: center; justify-content: space-between; gap: 12px; padding: 0 0 20px;
  border: 0; background: none; cursor: pointer; font: inherit; color: var(--nv-primary-text); }
.nv-coll-formname { font-size: 24px; line-height: 32px; font-weight: 600; }
.nv-coll-formhead-solo { justify-content: flex-end; padding-bottom: 4px; }
.nv-coll-formedit { font-size: 14px; color: var(--nv-secondary-text); padding: 5px 12px; border-radius: 999px; }
.nv-coll-formcard:hover .nv-coll-formedit { background: var(--nv-hover); color: var(--nv-primary-text); }
.nv-coll-formrows { display: flex; flex-direction: column; }
.nv-coll-formrow { display: flex; align-items: center; gap: 20px; min-height: 80px; padding: 16px 0;
  border-top: 1px solid #f0f0f0; font-size: 16px; }
.nv-coll-formrow:first-child { border-top: 0; }
.nv-coll-formlabel { flex: none; width: 96px; font-size: 15px; line-height: 22px; color: var(--nv-secondary-text); }
.nv-coll-formvalue { flex: 1; min-width: 0; font-size: 18px; line-height: 26px; font-weight: 600;
  white-space: pre-wrap; color: var(--nv-primary-text); }
.nv-coll-formempty { color: var(--nv-secondary-text); opacity: .55; font-weight: 400; }
.nv-coll-formimg { max-width: 216px; border-radius: 12px; display: block; }

/* 引用选择器（集合里的 person/place 字段）：选项目里的卡，不是填字 */
.nv-coll-ref { width: 100%; box-sizing: border-box; border: 1px solid var(--nv-divider); border-radius: 8px; padding: 5px 8px;
  font: inherit; font-size: 12.5px; background: var(--nv-surface); color: var(--nv-primary-text); }
/* 卡总览 · 被引用区：谁通过引用字段指向这张卡 */
.nv-ov-refs { margin-top: 18px; display: flex; flex-direction: column; gap: 6px; }
.nv-ov-refshead { margin: 0 0 4px; font-size: 11px; font-weight: 700; letter-spacing: .14em; color: var(--nv-accent-deep); }
.nv-ov-refrow { display: flex; align-items: baseline; gap: 10px; padding: 7px 10px; border: 1px solid var(--nv-divider); border-radius: 10px;
  background: var(--nv-surface); cursor: pointer; font: inherit; text-align: left; color: var(--nv-primary-text); }
.nv-ov-refrow:hover { border-color: rgba(14,159,110,.28); }
.nv-ov-refname { font-size: 12.5px; font-weight: 600; }
.nv-ov-refmeta { font-size: 11.5px; color: var(--nv-secondary-text); }
/* 地图「只看被引用」开关 */
.nv-maped-refonly { border: 1px solid var(--nv-divider); border-radius: 8px; padding: 4px 10px; font-size: 11.5px;
  background: var(--nv-surface); color: var(--nv-secondary-text); cursor: pointer; }
.nv-maped-refonly.on { border-color: rgba(14,159,110,.4); color: var(--nv-accent-deep); background: var(--nv-accent-soft); }

.nv-canvas-docbody { flex: 1; min-height: 0; display: flex; flex-direction: column; }
.nv-canvas-docedit { flex: 1; min-height: 0; border: 0; resize: none; padding: 24px 28px; font-size: 14px; line-height: 1.8;
  font-family: inherit; background: var(--nv-surface); color: var(--nv-primary-text); outline: none; }
.nv-canvas-docstatus { padding: 6px 14px; font-size: 11px; color: var(--nv-secondary-text); border-top: 1px solid var(--nv-divider); }
/* 文稿富编辑器（BlockNote）：左侧标题树 + 一页文档的版心；主题色换成本站调色板 */
/* 文稿页签：正文一列 + 右上角标题树（从最顶上开始、2/3 高、白底渐隐） */
/* 文稿页签：正文整幅，右上角浮一枚小挂窗（大纲）——不占布局列。
   注意覆盖旧 .nv-ed-doc 的 150px 右内边距（那是老编辑器预留的空白，正文会被它截断）。 */
.nv-ed.nv-ed-doc { position: relative; padding: 0; overflow: hidden; }
.nv-ed-main { flex: 1; min-width: 0; min-height: 0; display: flex; flex-direction: column; }
/* 右缘刻度：常驻的位置标尺——不占布局、不挡字，只标标题所在位置（当前项薄荷） */
.nv-doc-rail { position: absolute; top: 84px; right: 4px; bottom: 24px; width: 12px; z-index: 6; cursor: pointer; }
.nv-doc-rail-mark { position: absolute; right: 0; width: 8px; height: 2px; border-radius: 1px;
  background: var(--nv-secondary-text); opacity: .28;
  transition: width 120ms ease, opacity 120ms ease, background 120ms ease; }
.nv-doc-rail-mark-on { width: 14px; opacity: .95; background: var(--nv-accent); }
/* 唤出面板：白底圆角阴影，从右缘滑入；只在用户唤出时临时覆盖纸面 */
.nv-doc-panel { position: absolute; top: 84px; right: 16px; bottom: 24px; width: 300px; z-index: 7;
  display: flex; flex-direction: column; overflow-y: auto; padding: 10px 8px 24px; box-sizing: border-box;
  background: var(--nv-surface); border: 1px solid var(--nv-divider); border-radius: 14px;
  box-shadow: 0 18px 48px rgba(28, 64, 51, .16);
  opacity: 0; transform: translateX(16px); pointer-events: none;
  transition: opacity 160ms ease, transform 160ms ease; }
.nv-doc-panel-open { opacity: 1; transform: none; pointer-events: auto; }
/* 边缘拖拽把手：左缘改宽、下缘改高、右下角同时改 */
.nv-doc-resize { position: absolute; z-index: 2; }
.nv-doc-resize-l { left: 0; top: 0; bottom: 14px; width: 7px; cursor: ew-resize; }
.nv-doc-resize-b { left: 14px; right: 0; bottom: 0; height: 7px; cursor: ns-resize; }
.nv-doc-resize-c { left: 0; bottom: 0; width: 16px; height: 16px; cursor: nwse-resize; }
.nv-doc-panel-head { display: flex; align-items: center; justify-content: space-between; padding: 4px 8px 10px;
  cursor: grab; touch-action: none; user-select: none; }
.nv-doc-panel-head:active { cursor: grabbing; }
.nv-doc-panel-title { font-size: 12px; font-weight: 700; letter-spacing: .14em; color: var(--nv-secondary-text); }
.nv-doc-panel-pin { display: inline-flex; border: 0; background: none; border-radius: 7px; padding: 4px 6px;
  color: var(--nv-secondary-text); cursor: pointer; }
.nv-doc-panel-pin:hover { background: var(--nv-accent-soft); color: var(--nv-primary-text); }
.nv-doc-panel-pin-on { background: var(--nv-accent-soft); color: var(--nv-accent-deep); }
.nv-doc-panel-empty { padding: 10px; font-size: 12.5px; line-height: 1.8; color: var(--nv-secondary-text); }
.nv-doc-panel-item { display: block; width: 100%; border: 0; background: none; border-radius: 8px; padding: 7px 10px; text-align: left;
  font-size: 13.5px; line-height: 1.7; color: var(--nv-secondary-text); cursor: pointer; font-family: inherit;
  overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.nv-doc-panel-item:hover { background: var(--nv-accent-soft); color: var(--nv-primary-text); }
.nv-doc-panel-item-on { color: var(--nv-accent-deep); font-weight: 600; }
.nv-doc-panel-item[data-level='2'] { padding-left: 22px; }
.nv-doc-panel-item[data-level='3'] { padding-left: 36px; }
.nv-doc-bn { flex: 1; min-width: 0; min-height: 0; overflow-y: auto; background: var(--nv-surface); font-family: inherit; }
.nv-doc-bn .bn-container { min-height: 100%; width: 100%; }
/* 卡内模块正文（BlockNote）：盒内富文本，无页签级大纲 */
.nv-card-bn { font-family: inherit; }
.nv-card-bn .bn-container { width: 100%; }
.nv-card-bn .bn-editor { padding: 6px 2px 12px; max-width: none; margin: 0; font-family: inherit; font-size: 14px; }
/* 纯文本编辑面（代码/配置）：等宽、原样进出 */
.nv-doc-plain { flex: 1; min-height: 0; border: 0; resize: none; padding: 16px 28px 80px; box-sizing: border-box;
  font-family: ui-monospace, SFMono-Regular, Menlo, monospace; font-size: 13px; line-height: 1.7;
  background: var(--nv-surface); color: var(--nv-primary-text); outline: none; white-space: pre; overflow: auto; }
.nv-doc-plain-with-lines { flex: 1; min-width: 0; min-height: 0; display: flex; overflow: hidden; }
.nv-doc-plain-with-lines .nv-doc-plain { min-width: 0; }
.nv-doc-line-numbers { flex: 0 0 42px; margin: 0; padding: 16px 8px 80px 0; border-right: .5px solid var(--nv-divider);
  background: var(--nv-surface); color: var(--nv-secondary-text); font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
  font-size: 11px; line-height: 1.7; text-align: right; list-style: none; user-select: none; overflow: hidden; }
.nv-doc-bn .bn-container .bn-editor { width: 100%; max-width: none; }
/* 标题字号收敛：满幅纸上 3em 的 H1 会一行只容五六字 */
.nv-doc-bn .bn-block-content[data-content-type='heading'][data-level='1'] { font-size: 2em !important; }
.nv-doc-bn .bn-block-content[data-content-type='heading'][data-level='2'] { font-size: 1.5em !important; }
.nv-doc-bn .bn-block-content[data-content-type='heading'][data-level='3'] { font-size: 1.25em !important; }
/* 选区高亮 = 薄荷绿（半透明，白底上不吞字）；块内所有行内元素共用 */
.nv-doc-bn ::selection { background: rgba(52, 211, 153, .30); color: inherit; }
.nv-doc-bn ::-moz-selection { background: rgba(52, 211, 153, .30); color: inherit; }
/* BlockNote 浮层被 portal 到编辑器容器之外：主题变量挂在 body，浮窗与页体继承同一表面色。
   浮窗（选中文字后的格式条）= 薄荷底 + 白图标；菜单/下拉使用主题表面色、薄荷选中。 */
body {
  --bn-font-family: inherit;
  --bn-colors-editor-text: var(--nv-primary-text);
  --bn-colors-editor-background: var(--nv-surface);
  --bn-colors-menu-text: var(--nv-primary-text);
  --bn-colors-menu-background: var(--nv-surface);
  --bn-colors-tooltip-text: var(--nv-inverse-text);
  --bn-colors-tooltip-background: var(--nv-inverse-surface);
  --bn-colors-hovered-text: var(--nv-primary-text);
  --bn-colors-hovered-background: var(--nv-accent-soft);
  --bn-colors-selected-text: var(--nv-primary-text);
  --bn-colors-selected-background: var(--nv-accent-soft);
  --bn-colors-disabled-text: var(--nv-secondary-text);
  --bn-colors-disabled-background: var(--nv-canvas);
  --bn-colors-shadow: rgba(28, 64, 51, .12);
  --bn-colors-border: var(--nv-divider);
  --bn-colors-side-menu: var(--nv-secondary-text);
  --bn-border-radius: 8px;
  --bn-border-radius-small: 6px;
  --bn-border-radius-medium: 8px;
  --bn-border-radius-large: 12px;
}
.bn-toolbar {
  background-color: var(--nv-accent) !important;
  border-color: transparent !important;
  box-shadow: 0 10px 28px rgba(28, 64, 51, .20) !important;
}
.bn-toolbar .mantine-ActionIcon-root,
.bn-toolbar .mantine-Button-root,
.bn-toolbar .bn-select,
.bn-toolbar .bn-select-text,
.bn-toolbar svg {
  color: #fff !important;
  background-color: transparent !important;
}
.bn-toolbar .mantine-ActionIcon-root:hover,
.bn-toolbar .mantine-Button-root:hover {
  background-color: rgba(255, 255, 255, .18) !important;
  color: #fff !important;
}
.bn-toolbar .mantine-ActionIcon-root[data-selected],
.bn-toolbar .mantine-Button-root[data-selected] {
  background-color: rgba(255, 255, 255, .26) !important;
  color: #fff !important;
}
.bn-toolbar .mantine-ActionIcon-root[data-disabled],
.bn-toolbar .mantine-Button-root[data-disabled] {
  background-color: transparent !important;
  color: rgba(255, 255, 255, .55) !important;
}
.nv-doc-bn .bn-editor { padding: 12px 48px 140px; max-width: none; margin: 0; font-family: inherit;
  font-size: calc(16px * var(--nv-doc-zoom, 1)); }
.nv-canvas-conflict { padding: 8px 14px; font-size: 12px; color: var(--nv-warn); background: var(--nv-warn-soft); }

/* 通用编辑器：标题 + meta + 正文 + 底状态条（文稿与卡模块共用） */
.nv-ed { flex: 1; min-height: 0; display: flex; flex-direction: column; }
.nv-ed .nv-ed-head { padding: 20px 28px 10px; position: relative; }
.nv-ed-outline-btn { position: absolute; top: 18px; right: 52px; border: 0; background: none; border-radius: 7px;
  padding: 3px 8px; font-size: 11.5px; font-family: inherit; color: var(--nv-secondary-text); cursor: pointer; }
.nv-ed-outline-btn:hover { background: var(--nv-accent-soft); color: var(--nv-primary-text); }
.nv-ed-outline-btn.on { background: var(--nv-accent-soft); color: var(--nv-accent-deep); }
.nv-ed-save { right: 104px; }
.nv-ed-save:disabled { cursor: default; opacity: .45; }
.nv-ed-more { position: absolute; top: 18px; right: 22px; border: 0; background: none; padding: 2px 8px;
  font-size: 15px; color: var(--nv-secondary-text); cursor: pointer; border-radius: 6px; }
.nv-ed-more:hover { color: var(--nv-primary-text); background: var(--nv-accent-soft); }
.nv-ed-title { margin: 0; font-size: 22px; font-weight: 700; color: var(--nv-primary-text); cursor: text; }
.nv-ed-titlein { display: block; width: 100%; box-sizing: border-box; border: 0; border-bottom: 1px solid var(--nv-accent-deep); background: transparent; padding: 0 0 2px; font-family: inherit; outline: none; }
.nv-ed-meta { margin-top: 5px; font-size: 12px; color: var(--nv-secondary-text); }

/* 卡页：头栏 + 模块竖排堆叠（设计稿 J02），模块导航归抽屉树 */
/* 卡页：白纸一页，内容 666 居中；页头是唯一的分隔线，模块自己不再套卡片。 */
.nv-cardpage { position: relative; height: 100%; display: flex; flex-direction: column; background: var(--nv-surface); font-size: 16px; }
/* 卡页被 AI 写：页头一层很淡的流动薄荷，正文不盖遮罩——阅读和点选照常。 */
.nv-cardpage-ai { box-shadow: inset 0 0 0 1px rgba(14, 159, 110, .18); }
.nv-cardpage-ai::before { content: ''; position: absolute; left: 0; right: 0; top: 0; height: 2px;
  background: linear-gradient(90deg, transparent, var(--nv-accent), transparent); background-size: 200% 100%;
  animation: nv-ai-flow 1.6s linear infinite; pointer-events: none; z-index: 3; }
.nv-cardpage-ai .nv-pagehead { background: linear-gradient(100deg, transparent 20%, var(--nv-accent-soft) 50%, transparent 80%);
  background-size: 220% 100%; animation: nv-ai-flow 2.4s linear infinite; }
.nv-cardpage-more { width: 28px; height: 28px; border: 0; border-radius: 8px;
  background: none; color: var(--nv-secondary-text); font-size: 18px; line-height: 1; cursor: pointer; }
.nv-cardpage-more:hover { background: var(--nv-hover); color: var(--nv-primary-text); }
.nv-cardpage-draft { font-size: 12px; color: var(--nv-warn); background: var(--nv-warn-soft); padding: 3px 9px; border-radius: 999px; }
.nv-cardpage-scroll { flex: 1; min-height: 0; overflow-y: auto; padding: 0 0 64px; }
.nv-page-inner { width: min(666px, calc(100% - 48px)); margin: 0 auto; padding-top: 24px; }
.nv-pagehead { display: flex; align-items: flex-end; justify-content: space-between; gap: 24px;
  padding-bottom: 20px; border-bottom: 1px solid var(--nv-divider); margin-bottom: 32px; }
.nv-pagehead-main { min-width: 0; flex: 1; }
.nv-pagehead-crumb { display: block; border: 0; background: none; padding: 0 0 10px; font: inherit;
  font-size: 14px; line-height: 20px; color: var(--nv-secondary-text); cursor: pointer; }
.nv-pagehead-crumb:hover { color: var(--nv-accent-deep); }
.nv-pagehead-title { margin: 0; font-size: 32px; line-height: 40px; font-weight: 600; letter-spacing: -.01em;
  color: var(--nv-primary-text); }
.nv-pagehead-rename { display: block; width: 100%; border: 0; border-bottom: 2px solid var(--nv-accent);
  background: none; padding: 0 0 2px; font: inherit; font-size: 32px; line-height: 40px; font-weight: 600;
  color: var(--nv-primary-text); outline: none; }
.nv-pagehead-side { display: flex; align-items: center; gap: 12px; padding-bottom: 6px; flex: none; }
.nv-pagehead-kicker { font-size: 14px; line-height: 20px; color: var(--nv-secondary-text); white-space: nowrap; }
/* 模块页容器是普通块——滚动全交给 .nv-cardpage-scroll，不能再套自带 overflow 的页类。 */
.nv-cardpage-module { display: block; }
/* 关系图/地图：无页头、无内框，画布直接铺满整列。 */
.nv-cardpage-scroll-bleed { position: relative; padding: 0; overflow: hidden; display: flex; flex-direction: column; flex: 1; min-height: 0; height: 100%; }
.nv-cardpage-bleed { flex: 1; min-height: 0; height: 100%; display: flex; flex-direction: column; }

/* 模块正文：页头已承担标题，模块只留内容。 */
.nv-modbox { position: relative; }
/* 地图模块 = 完整 FMG 编辑器 iframe；模块盒、内容盒都要让出整列高度。 */
.nv-modbox-map { display: flex; flex-direction: column; flex: 1; min-height: 0; }
.nv-modbox-map > .nv-modbox-body { display: flex; flex: 1; min-height: 0; }
.nv-modbox-map > .nv-fmg-host { flex: 1; min-height: 0; }
.nv-fmg-host { position: relative; display: flex; flex-direction: column; flex: 1; min-height: 0; min-width: 0; background: var(--nv-canvas); }
.nv-fmg-frame { display: block; flex: 1; width: 100%; height: 100%; min-height: 0; border: 0; }
/* 卡内全屏：覆盖整个应用窗口，不新开浏览器页；仍属于当前地图页签。 */
.nv-fmg-host-full { position: fixed; inset: 0; z-index: 1000; background: var(--nv-canvas); }
.nv-fmg-loading { position: absolute; inset: 0; display: grid; place-items: center;
  background: rgba(244, 245, 244, .88); color: var(--nv-secondary-text); font-size: 13px; }
.nv-fmg-notice { position: absolute; left: 14px; bottom: 14px; z-index: 2; max-width: min(440px, calc(100% - 28px));
  padding: 7px 11px; border: 1px solid var(--nv-divider); border-radius: 9px;
  background: rgba(255, 255, 255, .94); color: var(--nv-secondary-text); font-size: 11px; line-height: 1.5;
  box-shadow: 0 4px 16px rgba(20, 30, 26, .08); pointer-events: none; }
.nv-fmg-error { color: var(--nv-danger); border-color: rgba(178, 58, 58, .3); }
.nv-fmg-draft { position: absolute; left: 14px; right: 14px; bottom: 14px; z-index: 3;
  display: flex; align-items: center; gap: 10px; padding: 8px 12px;
  border: 1px solid rgba(14, 159, 110, .24); border-radius: 10px;
  background: rgba(228, 245, 237, .96); color: #0B7A55; font-size: 11px; line-height: 1.5;
  box-shadow: 0 4px 16px rgba(20, 30, 26, .08); }
.nv-fmg-draft span { flex: 1; min-width: 0; }
.nv-fmg-draft button { flex: 0 0 auto; height: 26px; padding: 0 10px; border: 1px solid #0E9F6E;
  border-radius: 7px; background: #0E9F6E; color: #fff; font: inherit; font-size: 10.5px; cursor: pointer; }
.nv-fmg-draft button:hover { background: #0B7A55; border-color: #0B7A55; }
.nv-fmg-terrain { position: absolute; left: 14px; right: 14px; bottom: 14px; z-index: 3;
  display: flex; align-items: center; gap: 10px; padding: 8px 12px;
  border: 1px solid var(--nv-divider); border-radius: 10px;
  background: rgba(251, 250, 246, .96); color: var(--nv-secondary-text); font-size: 11px; line-height: 1.5;
  box-shadow: 0 4px 16px rgba(20, 30, 26, .08); }
.nv-fmg-terrain span { flex: 1; min-width: 0; }
.nv-fmg-terrain button { flex: 0 0 auto; height: 26px; padding: 0 10px; border: 1px solid #0E9F6E;
  border-radius: 7px; background: #0E9F6E; color: #fff; font: inherit; font-size: 10.5px; cursor: pointer; }
.nv-fmg-terrain button:hover { background: #0B7A55; border-color: #0B7A55; }
.nv-pagehead-refcount { padding: 2px 8px; border-radius: 999px; background: var(--nv-hover);
  color: var(--nv-secondary-text); font-size: 10.5px; white-space: nowrap; }
.nv-scene { display: flex; flex-direction: column; gap: 10px; }
.nv-scene-toolbar { display: flex; align-items: center; gap: 9px; color: var(--nv-secondary-text); font-size: 11px; }
.nv-scene-toolbar > span:first-child { color: var(--nv-primary-text); font-weight: 500; }
.nv-scene-hint { flex: 1; color: var(--faint); }
.nv-scene-toolbar button { height: 28px; padding: 0 9px; border: 1px solid var(--nv-divider); border-radius: 7px;
  background: var(--nv-surface); color: var(--nv-secondary-text); font: inherit; font-size: 11px; cursor: pointer; }
.nv-scene-toolbar button:hover { border-color: var(--nv-accent); color: var(--nv-accent-deep); }
.nv-scene-toolbar .nv-scene-add { border-color: var(--nv-accent); color: var(--nv-accent-deep); }
.nv-scene-canvas { position: relative; min-height: 440px; overflow: hidden; border: 1px solid var(--nv-divider); border-radius: 16px;
  background: radial-gradient(circle at 50% 45%, #f7fbf8 0, #edf4f0 48%, #e6eeea 100%); perspective: 900px; cursor: grab; touch-action: none; }
.nv-scene-canvas:active { cursor: grabbing; }
.nv-scene-stage { position: absolute; inset: 0; transform-style: preserve-3d; transition: transform .12s linear; }
.nv-scene-card { position: absolute; left: 50%; top: 50%; width: 140px; height: 94px; padding: 9px 11px; border: 2px solid rgba(255,255,255,.5);
  border-radius: 14px; display: flex; flex-direction: column; align-items: flex-start; justify-content: center; gap: 3px;
  color: #fff; text-align: left; font: inherit; cursor: pointer; transform-style: preserve-3d; backface-visibility: visible;
  box-shadow: 0 14px 30px rgba(22,50,38,.2), inset 0 1px 0 rgba(255,255,255,.3); overflow: hidden; }
.nv-scene-card:hover { border-color: #fff; }
.nv-scene-card.is-on { border-color: #fff; box-shadow: 0 0 0 4px rgba(14,159,110,.28), 0 14px 30px rgba(22,50,38,.25); }
.nv-scene-card img { position: absolute; inset: 0; width: 100%; height: 100%; object-fit: cover; opacity: .45; }
.nv-scene-card b, .nv-scene-card small { position: relative; z-index: 1; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; max-width: 100%; }
.nv-scene-card b { font-size: 15px; font-weight: 600; text-shadow: 0 1px 4px rgba(0,0,0,.22); }
.nv-scene-card small { font-size: 10.5px; opacity: .82; }
.nv-scene-empty { position: absolute; inset: 0; display: flex; align-items: center; justify-content: center; color: var(--nv-secondary-text); font-size: 13px; }
.nv-scene-inspector { padding: 14px; border: 1px solid var(--nv-divider); border-radius: 12px; background: #fbfcfb; }
.nv-scene-inspectorhead { display: flex; align-items: center; justify-content: space-between; gap: 10px; margin-bottom: 10px; }
.nv-scene-inspectorhead b { font-size: 13px; }
.nv-scene-inspectorhead button { height: 26px; padding: 0 8px; border: 1px solid #e7c9c9; border-radius: 6px; background: var(--nv-surface);
  color: #b23a3a; font: inherit; font-size: 10.5px; cursor: pointer; }
.nv-scene-fields { display: grid; grid-template-columns: repeat(4, minmax(0, 1fr)); gap: 8px; }
.nv-scene-fields label, .nv-scene-desc { display: flex; flex-direction: column; gap: 3px; min-width: 0; }
.nv-scene-fields span, .nv-scene-desc span { font-size: 10px; color: var(--nv-secondary-text); }
.nv-scene-fields .nv-wg-input { height: 28px; font-size: 11.5px; }
.nv-scene-fields input[type="color"] { width: 100%; height: 28px; padding: 1px; border: 1px solid var(--nv-divider); border-radius: 6px; background: var(--nv-surface); }
.nv-scene-desc { margin-top: 8px; }
.nv-scene-desc .nv-wg-input { min-height: 56px; font-size: 12px; }
@container (max-width: 560px) {
  .nv-scene-fields { grid-template-columns: repeat(2, minmax(0, 1fr)); }
  .nv-scene-canvas { min-height: 360px; }
}
.nv-refmodule { display: flex; flex-direction: column; gap: 10px; }
.nv-refbanner { display: flex; align-items: center; gap: 8px; padding: 6px 10px; border: 1px solid rgba(14,159,110,.22);
  border-radius: 9px; background: rgba(244,250,247,.9); color: var(--nv-accent-deep); font-size: 11px; }
.nv-refbanner span { flex: 1; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.nv-refbanner button { flex: none; height: 24px; padding: 0 8px; border: 1px solid rgba(14,159,110,.35); border-radius: 6px;
  background: var(--nv-surface); color: var(--nv-accent-deep); font: inherit; font-size: 10.5px; cursor: pointer; }
.nv-refmodule-snapshot { pointer-events: none; opacity: .94; }
.nv-refnotice { padding: 5px 9px; border-radius: 7px; background: var(--nv-warn-soft); color: #8a5a14; font-size: 11px; }
.nv-modbox { position: relative; margin: 0; padding: 0; border: 0; background: transparent; }
.nv-module-surface { width: 100%; height: 100%; min-width: 0; min-height: 0; overflow: auto; background: var(--nv-surface); }
.nv-module-surface > .nv-modbox { box-sizing: border-box; min-height: 100%; padding: 16px; }
.nv-module-surface > .nv-modbox-map,
.nv-module-surface > .nv-modbox-html { display: flex; flex-direction: column; min-height: 100%; padding: 0; }
.nv-module-surface > .nv-modbox-map > .nv-modbox-body,
.nv-module-surface > .nv-modbox-html > .nv-modbox-body { display: flex; flex: 1; flex-direction: column; min-height: 0; }
.nv-module-surface > .nv-modbox-html .nv-htmlfile { height: 100%; }
.nv-module-block-status { box-sizing: border-box; display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 8px; width: 100%; height: 100%; padding: 16px; color: var(--nv-secondary-text); font-size: 12px; text-align: center; }
.nv-module-block-status code { max-width: 100%; overflow-wrap: anywhere; color: var(--nv-secondary-text); }
.nv-modbox-widget { font-size: 14px; color: var(--nv-secondary-text); padding: 8px 0; }
.nv-modbox-html { min-height: 120px; font-family: ui-monospace, monospace; }

/* html 模块的文件活引用：顶条（文件名 + 打开）+ 沙箱 iframe */
.nv-htmlfile { display: flex; flex-direction: column; gap: 8px; }
.nv-htmlfile .nv-isl-srcbtn { display: none; }
.nv-htmlfile-bar { display: flex; align-items: center; gap: 8px; font-size: 12.5px;
  color: var(--nv-secondary-text); }
.nv-htmlfile-name { font-weight: 600; color: var(--nv-primary-text); flex: 1; min-width: 0;
  overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.nv-htmlfile-open { border: 0.5px solid var(--nv-divider); border-radius: 999px; padding: 3px 12px;
  font-size: 12px; background: var(--nv-surface); color: var(--nv-primary-text); cursor: pointer; }
.nv-htmlfile-open:hover { border-color: var(--nv-accent); color: var(--nv-accent-deep); }
.nv-htmlfile-empty { padding: 22px 0; text-align: center; font-size: 12.5px; color: var(--nv-secondary-text); }

/* 块级点编：平时渲染，点了变编辑 */
.nv-blk { display: flex; flex-direction: column; }
.nv-blk-read { display: block; width: 100%; border: 0; background: none; text-align: left; cursor: text;
  padding: 6px 8px; border-radius: 8px; color: var(--nv-primary-text); font: inherit; }
.nv-blk-read:hover { background: var(--nv-accent-soft); }
.nv-blk-area { border: 1px solid var(--nv-accent); border-radius: 8px; resize: vertical; min-height: 90px;
  padding: 10px 12px; font-size: 14px; line-height: 1.8; font-family: inherit; background: var(--nv-surface);
  color: var(--nv-primary-text); outline: none; }
.nv-blk-empty { border: 1px dashed var(--nv-divider); border-radius: 10px; background: none; width: 100%;
  padding: 26px 0; font-size: 13px; color: var(--nv-secondary-text); cursor: text; }
.nv-blk-empty:hover { border-color: var(--nv-accent); color: var(--nv-accent-deep); }
.nv-blk-figure { margin: 6px 0; }
.nv-blk-figure img { max-width: 100%; border-radius: 10px; display: block; }
.nv-blk-figure figcaption { font-size: 12px; color: var(--nv-secondary-text); margin-top: 6px; }

/* 添加模块虚线区（与模块盒同宽）+ J03 模块库 */
/* 卡页「＋ 新增」条：和抽屉「＋ 新建」同族长条钮（用户拍板）。 */
.nv-cardpage-add { width: 100%; display: flex; align-items: center; justify-content: center; gap: 6px;
  border: 1px solid var(--nv-divider); border-radius: 10px; padding: 9px 0; font-size: 13px;
  background: var(--nv-surface); color: var(--nv-primary-text); cursor: pointer; }
.nv-cardpage-add:hover { border-color: var(--nv-accent); color: var(--nv-accent-deep); }
.nv-cardpage-rolesbox { padding-bottom: 6px; }
.nv-cardpage-roleshead { display: flex; align-items: center; gap: 4px; width: 100%; border: 0; background: none;
  font-size: 13px; font-weight: 600; color: var(--nv-primary-text); padding: 2px 0 6px; cursor: pointer; text-align: left; }
.nv-cardpage-roleshead .nv-tree-fold { border: 0; background: none; font-size: 11px; transition: transform var(--nv-dur-micro); color: var(--nv-secondary-text); }
.nv-cardpage-roleshead .nv-tree-fold-on { transform: rotate(90deg); }

/* 模块库对话框（设计稿 11）：标题「新建」+ 预制模块/Studio 双 tab + 三列缩略图格。 */
.nv-modlib { width: 480px; max-width: 92%; max-height: 88vh; overflow: auto; background: var(--nv-surface); border-radius: 14px; box-shadow: 0 18px 50px rgba(20,24,22,.18);
  padding: 18px 22px 14px; }
.nv-modlib-head { display: flex; align-items: center; justify-content: space-between; margin-bottom: 10px; }
.nv-modlib-title { font-size: 17px; font-weight: 700; color: var(--nv-primary-text); }
.nv-modlib-grid { display: grid; grid-template-columns: repeat(3, 1fr); gap: 10px; }
.nv-modlib-tile { border: 0; background: none; padding: 0; display: flex; flex-direction: column; align-items: stretch;
  gap: 6px; cursor: pointer; text-align: left; }
.nv-modlib-tile:disabled { opacity: .45; cursor: not-allowed; }
.nv-modlib-tile:not(:disabled):hover .nv-modlib-art { outline: 2px solid var(--nv-accent); }
.nv-modlib-art { display: block; width: 100%; aspect-ratio: 3 / 2; object-fit: cover; border-radius: 10px;
  background: #F3F7F4; }
.nv-modlib-emptyart { display: flex; align-items: center; justify-content: center; width: 100%; aspect-ratio: 3 / 2;
  border: 1.5px dashed var(--nv-divider); border-radius: 10px; color: var(--nv-secondary-text); font-size: 18px; }
.nv-modlib-tile:not(:disabled):hover .nv-modlib-emptyart { border-color: var(--nv-accent); color: var(--nv-accent-deep); }
.nv-modlib-tilename { font-size: 12.5px; font-weight: 600; color: var(--nv-primary-text); padding: 0 2px 2px; }
.nv-modlib-foot { margin-top: 14px; font-size: 11.5px; color: var(--nv-secondary-text); }
.nv-modlib-group { margin-bottom: 16px; }
.nv-modlib-grouplabel { margin: 0 0 8px; font-size: 11px; font-weight: 600; letter-spacing: .08em; color: var(--nv-secondary-text); }
/* 自由界面 / 自由 3D 的模板架：两块瓦片各展开一组起始工程，不把 3→6 块塞进主网格。 */
.nv-modlib-tile[data-on] .nv-modlib-art { outline: 2px solid var(--nv-accent); }
.nv-modlib-templates { margin: -4px 0 16px; padding: 12px; border: 1px solid var(--nv-divider); border-radius: 12px; background: var(--nv-pane); }
.nv-modlib-templaterow { display: flex; flex-wrap: wrap; gap: 8px; }
.nv-modlib-templatebtn { flex: 1 1 132px; display: flex; flex-direction: column; align-items: flex-start; gap: 3px;
  padding: 9px 11px; border: 1px solid var(--nv-divider); border-radius: 10px; background: var(--nv-surface);
  color: var(--nv-primary-text); font: inherit; cursor: pointer; text-align: left; }
.nv-modlib-templatebtn b { font-size: 12.5px; }
.nv-modlib-templatebtn small { font-size: 11px; color: var(--nv-secondary-text); line-height: 1.4; }
.nv-modlib-templatebtn:hover { border-color: var(--nv-accent); background: var(--nv-accent-soft); }
.nv-modlib-templateclose { align-self: center; border: 0; background: none; color: var(--nv-secondary-text);
  font: inherit; font-size: 11px; cursor: pointer; padding: 4px 6px; }
.nv-modlib-saved { display: flex; flex-wrap: wrap; align-items: center; gap: 6px; margin: -2px 0 14px; }
.nv-modlib-saved > span:first-child { color: var(--nv-secondary-text); font-size: 10.5px; letter-spacing: .06em; }
.nv-modlib-saveditem { display: inline-flex; align-items: center; border: 1px solid var(--nv-divider); border-radius: 999px; background: var(--nv-surface); overflow: hidden; }
.nv-modlib-saveditem button { height: 24px; border: 0; background: transparent; color: var(--nv-secondary-text); font: inherit; font-size: 11px; cursor: pointer; }
.nv-modlib-saveditem button:first-child { padding: 0 8px; }
.nv-modlib-saveditem button:last-child { padding: 0 7px 0 2px; color: var(--nv-faint); font-size: 13px; }
.nv-modlib-saveditem button:hover { color: var(--nv-accent-deep); }
.nv-modlib-ref { margin: 12px 0 14px; padding-top: 12px; border-top: 1px solid var(--nv-divider); }
.nv-modlib-refhead { width: 100%; padding: 8px 10px; border: 1px dashed #d8d6cd; border-radius: 8px; background: transparent;
  color: var(--nv-secondary-text); font: inherit; font-size: 12px; text-align: left; cursor: pointer; }
.nv-modlib-refhead:hover { border-color: var(--nv-accent); color: var(--nv-accent-deep); }
.nv-modlib-refempty { padding: 10px 2px; color: var(--nv-secondary-text); font-size: 11.5px; }
.nv-modlib-refform { display: grid; grid-template-columns: 1fr 1fr; gap: 8px 10px; margin-top: 8px; }
.nv-modlib-refform label { display: flex; flex-direction: column; gap: 3px; min-width: 0; font-size: 10.5px; color: var(--nv-secondary-text); }
.nv-modlib-refform input, .nv-modlib-refform select { width: 100%; box-sizing: border-box; height: 30px; border: 1px solid var(--nv-divider);
  border-radius: 7px; padding: 0 7px; background: var(--nv-surface); color: var(--nv-primary-text); font: inherit; font-size: 11.5px; outline: none; }
.nv-modlib-refform input:focus, .nv-modlib-refform select:focus { border-color: var(--nv-accent); }
.nv-modlib-refgo { grid-column: 1 / -1; justify-self: end; height: 30px; padding: 0 12px; border: 1px solid var(--nv-accent);
  border-radius: 7px; background: var(--nv-accent); color: #fff; font: inherit; font-size: 11.5px; cursor: pointer; }
.nv-modlib-refgo:disabled { opacity: .45; cursor: not-allowed; }

/* 素材列表 */
.nv-canvas-files { flex: 1; min-height: 0; overflow-y: auto; padding: 12px 16px; }
.nv-canvas-workframe { width: 100%; height: 100%; border: 0; display: block; background: var(--nv-canvas); }

/* 图片查看器：默认整图 contain，缩放态显式宽度 + translate 平移。 */
.nv-imgview { flex: 1; min-height: 0; display: flex; align-items: center; justify-content: center;
  overflow: hidden; position: relative; background: var(--nv-canvas); touch-action: none; }
.nv-imgview img { max-width: 100%; max-height: 100%; object-fit: contain; user-select: none; }
.nv-imgview-zoom img { cursor: grab; }
.nv-imgview-zoom img:active { cursor: grabbing; }
.nv-imgview-ctl { position: absolute; right: 10px; bottom: 10px; display: flex; align-items: center;
  gap: 2px; background: var(--nv-surface); border: 0.5px solid var(--nv-divider);
  border-radius: 8px; padding: 3px; box-shadow: 0 2px 10px rgba(0, 0, 0, .08); }
.nv-imgview-ctl button { border: 0; background: transparent; padding: 3px 8px; font-size: 12px;
  color: var(--nv-primary-text); cursor: pointer; border-radius: 5px; }
.nv-imgview-ctl button:hover { background: var(--nv-canvas); }
.nv-imgview-pct { min-width: 44px; text-align: center; color: var(--nv-secondary-text); }
/* 手机档的图片体：屏内 contain，背景压暗衬出屏占比。 */
.nv-imgview-phone { flex: 1; min-height: 0; background: #14100c; }

/* 作品页顶条：桌面/手机分段开关 + 版本下拉 + 采用 + 戏台壳操作 */
.nv-work { display: flex; flex-direction: column; height: 100%; min-height: 0; }
.nv-work-bar { display: flex; align-items: center; gap: 10px; padding: 8px 14px;
  border-bottom: 0.5px solid var(--nv-divider); flex-shrink: 0; }
.nv-work > .nv-canvas-workframe { flex: 1; min-height: 0; height: auto; }
.nv-work-barspace { flex: 1; }
.nv-seg { display: inline-flex; border: 0.5px solid var(--nv-divider); border-radius: 999px;
  overflow: hidden; }
.nv-seg button { border: 0; background: transparent; padding: 4px 14px; font-size: 12px;
  color: var(--nv-secondary-text); cursor: pointer; }
.nv-stage-push { border: 0.5px solid var(--nv-divider); border-radius: 999px; padding: 4px 14px;
  font-size: 12px; background: var(--nv-surface); color: var(--nv-primary-text); cursor: pointer; }
.nv-stage-push:hover { border-color: var(--nv-accent); color: var(--nv-accent-deep); }
.nv-stage-picking { border-color: var(--nv-accent); color: var(--nv-accent-deep);
  background: color-mix(in srgb, var(--nv-accent) 10%, transparent); }
.nv-work-ver { border: 0.5px solid var(--nv-divider); border-radius: 999px; padding: 4px 14px;
  font-size: 12px; background: var(--nv-surface); color: var(--nv-secondary-text); cursor: pointer; }
.nv-work-ver:hover { border-color: var(--nv-accent); color: var(--nv-accent-deep); }
.nv-work-adopt { border: 0; border-radius: 999px; padding: 5px 16px; font-size: 12px;
  font-weight: 600; background: var(--nv-accent); color: #fff; cursor: pointer; }
.nv-work-adopt:hover { filter: brightness(0.94); }
.nv-work-picked { display: inline-flex; align-items: center; gap: 6px; font-size: 12px;
  color: var(--nv-accent-deep); border: 0.5px solid var(--nv-accent); border-radius: 999px;
  padding: 3px 10px; background: color-mix(in srgb, var(--nv-accent) 8%, transparent); }
.nv-work-pickedx { border: 0; background: transparent; color: var(--nv-accent-deep);
  cursor: pointer; font-size: 13px; padding: 0 2px; }

/* 戏台壳：档位定宽、高随容器，外层可滚；内部按手机自适应规则渲染。 */
.nv-stage-wrap { flex: 1; min-height: 0; display: flex; flex-direction: column; }
.nv-stage-scroll { flex: 1; min-height: 0; overflow: auto; display: flex; justify-content: center;
  align-items: center; padding: 16px; background: var(--nv-canvas); }
.nv-stage-device { flex-shrink: 0; border-radius: 28px;
  border: 1px solid var(--nv-divider); overflow: hidden; background: var(--nv-surface);
  box-shadow: 0 10px 34px rgba(0, 0, 0, .12); display: flex; flex-direction: column; }
.nv-stage-device > .nv-phone { flex: 1; min-height: 0; }
.nv-stage-frame { width: 100%; height: 100%; border: 0; display: block; }
.nv-sim-sizes { display: flex; gap: 4px; padding: 8px 14px 0; justify-content: center; }
.nv-sim-size { border: 0.5px solid var(--nv-divider); background: transparent; border-radius: 999px;
  padding: 2px 10px; font-size: 11px; color: var(--nv-secondary-text); cursor: pointer; }
.nv-sim-size-on { border-color: var(--nv-accent); }
/* 模拟键盘占位：机框底部一块中性灰区，作品/对话区相应缩短——预演真机的作品区抬升。 */
.nv-simime { flex-shrink: 0; display: flex; align-items: center; justify-content: center;
  background: var(--nv-canvas); border-top: 0.5px solid var(--nv-divider);
  color: var(--nv-secondary-text); font-size: 11px; }

/* 模拟器内页：会话列表 / 对话设置 / 资料与存档。 */
.nv-simlist, .nv-simset { flex: 1; min-height: 0; display: flex; flex-direction: column; }
.nv-simlist-head, .nv-simset-head { display: flex; align-items: center; gap: 8px;
  padding: 12px 14px; border-bottom: 0.5px solid var(--nv-divider); }
.nv-simlist-title { font-size: 13px; font-weight: 600; color: var(--nv-primary-text); }
.nv-simlist-new { margin-left: auto; border: 0; background: transparent; cursor: pointer;
  font-size: 12px; color: var(--nv-accent-deep); }
.nv-simlist-body, .nv-simset-body { flex: 1; min-height: 0; overflow-y: auto; padding: 6px 10px; }
.nv-simlist-empty { color: var(--nv-secondary-text); font-size: 12px; padding: 18px 6px; text-align: center; }
.nv-simrow { display: flex; align-items: center; gap: 4px; border-radius: 10px; }
.nv-simrow:hover { background: color-mix(in srgb, var(--nv-accent) 5%, transparent); }
.nv-simrow-main { flex: 1; min-width: 0; display: flex; align-items: center; gap: 8px;
  border: 0; background: transparent; cursor: pointer; padding: 9px 10px; text-align: left; }
.nv-simrow-dot { width: 6px; height: 6px; border-radius: 50%; background: var(--nv-accent); flex-shrink: 0; }
.nv-simrow-name { min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;
  font-size: 13px; color: var(--nv-primary-text); }
.nv-simrow-dim .nv-simrow-name { color: var(--nv-secondary-text); }
.nv-simrow-act { display: none; flex-shrink: 0; border: 0.5px solid var(--nv-divider); border-radius: 999px;
  background: transparent; cursor: pointer; font-size: 11px; padding: 2px 9px; margin-right: 8px;
  color: var(--nv-accent-deep); }
.nv-simrow:hover .nv-simrow-act { display: inline; }
.nv-simrow-cancel { color: var(--nv-danger); border-color: var(--nv-danger-line); }
.nv-simset-field { display: flex; flex-direction: column; gap: 4px; padding: 8px 4px; }
.nv-simset-field > span { font-size: 11px; color: var(--nv-secondary-text); }
.nv-simset-field textarea, .nv-simset-field input { resize: vertical; border: 0.5px solid var(--nv-divider);
  border-radius: 8px; padding: 6px 9px; font-size: 12.5px; font-family: inherit;
  background: var(--nv-surface); color: var(--nv-primary-text); }
.nv-simset-hint { font-size: 11px; color: var(--nv-secondary-text); padding: 8px 4px; }
.nv-sesset { display: flex; flex-direction: column; gap: 2px; padding: 6px 10px 24px; }
.nv-sesset-group { display: flex; flex-direction: column; padding: 6px 0 10px; }
.nv-sesset-group h4 { margin: 6px 2px 6px; font-size: 11px; font-weight: 600; letter-spacing: .02em;
  color: var(--nv-secondary-text); text-transform: uppercase; }
.nv-sesset-field { display: flex; flex-direction: column; gap: 4px; padding: 7px 2px; }
.nv-sesset-field > span { font-size: 11.5px; color: var(--nv-secondary-text); }
.nv-sesset-field textarea { resize: vertical; border: 0.5px solid var(--nv-divider); border-radius: 8px;
  padding: 6px 9px; font-size: 12.5px; line-height: 1.55; font-family: inherit;
  background: var(--nv-surface); color: var(--nv-primary-text); }
.nv-sesset-field textarea::placeholder { color: var(--nv-tertiary-text, var(--nv-secondary-text)); opacity: .7; }
.nv-sesset-field textarea:focus { outline: none; border-color: color-mix(in srgb, var(--nv-accent) 45%, var(--nv-divider)); }
.nv-sesset-row { display: flex; align-items: center; gap: 10px; padding: 10px 2px; }
.nv-sesset-rowtext { display: flex; flex: 1; min-width: 0; flex-direction: column; gap: 2px; }
.nv-sesset-rowtitle { font-size: 12.5px; color: var(--nv-primary-text); }
.nv-sesset-rowhint { font-size: 11px; line-height: 1.5; color: var(--nv-secondary-text); }
.nv-sesset-foot { padding: 10px 2px 0; font-size: 11px; line-height: 1.6; color: var(--nv-secondary-text);
  border-top: 0.5px solid var(--nv-divider); margin-top: 4px; }
.nv-simrec-row { cursor: default; }

/* Studio 底排：戏台调试盘 / 源码 / 文件 / 版本 页签。 */
.nv-work-panes { flex-shrink: 0; border-top: 0.5px solid var(--nv-divider);
  background: var(--nv-surface); display: flex; flex-direction: column; }
.nv-work-panetabs { display: flex; gap: 2px; padding: 6px 14px 0; }
.nv-work-panetab { border: 0; background: transparent; padding: 4px 12px 6px; font-size: 12px;
  color: var(--nv-secondary-text); cursor: pointer; border-bottom: 1.5px solid transparent; }
.nv-work-panetab-on { border-bottom-color: var(--nv-accent); }
.nv-work-panebody { max-height: 170px; overflow-y: auto; padding: 8px 14px; font-size: 12px; }
.nv-work-source { margin: 0; font-family: ui-monospace, monospace; font-size: 11.5px;
  line-height: 1.5; color: var(--nv-primary-text); white-space: pre-wrap; word-break: break-all; }
.nv-work-ver-on { font-weight: 600; }
.nv-stage-hint { color: var(--nv-secondary-text); margin-bottom: 6px; }
.nv-stage-call { display: flex; align-items: center; gap: 8px; padding: 3px 0;
  color: var(--nv-primary-text); }
.nv-stage-emptyrow { color: var(--nv-secondary-text); }
.nv-stage-kind { flex-shrink: 0; font-weight: 600; font-size: 11px; padding: 1px 8px;
  border-radius: 999px; }
.nv-stage-kind-query { color: var(--nv-accent-deep); background: color-mix(in srgb, var(--nv-accent) 12%, transparent); }
.nv-stage-kind-compose { color: #B0720E; background: rgba(216, 164, 46, .14); }
.nv-stage-kind-send { color: #B0720E; background: rgba(216, 164, 46, .14); }
.nv-stage-kind-ready { color: var(--nv-secondary-text); background: var(--nv-canvas); }
.nv-stage-text { flex: 1; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;
  font-family: ui-monospace, monospace; font-size: 11.5px; }
.nv-stage-copy { border: 0; background: transparent; color: var(--nv-secondary-text); font-size: 11px;
  cursor: pointer; padding: 1px 6px; }
.nv-stage-copy:hover { color: var(--nv-accent-deep); }
.nv-stage-note { margin-top: 6px; color: var(--nv-secondary-text); }

/* 手机会话页复刻（作品页「手机」档）：顶栏/消息流/舞台/输入栏。 */
.nv-phone { display: flex; flex-direction: column; width: 100%; height: 100%;
  position: relative; background: var(--nv-surface); color: var(--nv-primary-text);
  font-size: 13px; overflow: hidden; }
.nv-ptop { display: flex; align-items: center; gap: 8px; padding: 10px 12px;
  border-bottom: 0.5px solid var(--nv-divider); background: var(--nv-surface); flex-shrink: 0; }
.nv-ptop-btn { border: 0; background: transparent; font-size: 18px; line-height: 1;
  color: var(--nv-primary-text); cursor: pointer; padding: 2px 6px; border-radius: 8px; }
.nv-ptop-btn:hover { background: var(--nv-canvas); }
.nv-ptitle { flex: 1; min-width: 0; text-align: center; font-size: 12px; font-weight: 600;
  color: var(--nv-primary-text); background: var(--nv-canvas); border-radius: 999px;
  padding: 4px 14px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.nv-ptop-side { width: 30px; text-align: right; color: var(--nv-secondary-text); }
.nv-pbusy { animation: nv-pbusy 1s infinite; }
@keyframes nv-pbusy { 50% { opacity: .3; } }
.nv-ptrans { flex: 1; min-height: 0; overflow-y: auto; padding: 12px 10px;
  display: flex; flex-direction: column; gap: 10px; }
.nv-pempty { color: var(--nv-secondary-text); text-align: center; padding: 24px 0; }
.nv-pmsg { display: flex; flex-direction: column; }
.nv-pmsg.u { align-items: flex-end; }
.nv-pbubble { max-width: 78%; background: var(--nv-accent-soft); color: var(--nv-primary-text);
  border-radius: 12px; padding: 8px 12px; font-size: 13px; line-height: 1.55;
  white-space: pre-wrap; word-break: break-word; }
.nv-pmsg.a { align-items: stretch; gap: 6px; }
.nv-ptext { font-size: 13px; line-height: 1.6; white-space: pre-wrap; word-break: break-word;
  color: var(--nv-primary-text); padding: 0 2px; }
.nv-pchip { align-self: flex-start; font-size: 11px; color: var(--nv-secondary-text);
  background: var(--nv-canvas); border-radius: 999px; padding: 3px 10px; }
.nv-pchip-bad { color: var(--nv-danger); }
.nv-pentry { align-self: stretch; border: 0.5px solid var(--nv-divider); border-radius: 12px;
  background: var(--nv-surface); color: var(--nv-primary-text); font-size: 12.5px;
  padding: 10px 12px; cursor: pointer; text-align: center; font-weight: 600; }
.nv-pentry:hover { border-color: var(--nv-accent); color: var(--nv-accent-deep); }
.nv-pstage { flex: 1; min-height: 0; position: relative; }
.nv-pfloat { position: absolute; left: 12px; bottom: 64px; z-index: 5;
  border: 0.5px solid var(--nv-divider); border-radius: 999px; padding: 6px 14px;
  background: var(--nv-surface); color: var(--nv-primary-text); font-size: 12px;
  cursor: pointer; box-shadow: 0 4px 14px rgba(0,0,0,.10); }
.nv-pfloat:hover { border-color: var(--nv-accent); }
/* 舞台回退提示：一行浅底，几秒后自己消失。 */
.nv-pnotice { flex-shrink: 0; padding: 6px 12px; font-size: 12px; text-align: center;
  color: var(--nv-secondary-text); background: var(--nv-surface);
  border-top: 0.5px solid var(--nv-divider); }
.nv-pcompose { display: flex; align-items: flex-end; gap: 8px; padding: 8px 10px;
  border-top: 0.5px solid var(--nv-divider); background: var(--nv-surface); flex-shrink: 0; }
.nv-pinput { flex: 1; min-height: 34px; max-height: 90px; resize: none; border: 0;
  outline: none; background: var(--nv-canvas); border-radius: 17px; padding: 8px 14px;
  font-size: 13px; font-family: inherit; color: var(--nv-primary-text); line-height: 1.4; }
.nv-psend { flex-shrink: 0; border: 0; border-radius: 999px; padding: 8px 16px;
  font-size: 12.5px; font-weight: 600; background: var(--nv-accent); color: #fff; cursor: pointer; }
.nv-psend:hover { background: var(--nv-accent-deep); }
.nv-psend:disabled { background: var(--nv-divider); color: var(--nv-secondary-text); cursor: default; }

/* 岛（消息流内联 / 舞台铺满）：透明底 + 自量高 + 右上 </> 源码钮。 */
.nv-isl { position: relative; border-radius: 12px; overflow: hidden;
  background: transparent; min-height: 24px; }
.nv-isl-fill { position: absolute; inset: 0; border-radius: 0; }
.nv-isl-frame { width: 100%; border: 0; display: block; background: transparent; }
.nv-isl-fill .nv-isl-frame { height: 100%; }
.nv-isl-srcbtn { position: absolute; top: 6px; right: 6px; z-index: 3; border: 0;
  border-radius: 6px; padding: 2px 7px; font-size: 11px; font-family: ui-monospace, monospace;
  background: rgba(0,0,0,.38); color: #fff; cursor: pointer; opacity: 0; transition: opacity var(--nv-dur-micro); }
.nv-isl:hover .nv-isl-srcbtn { opacity: 1; }
.nv-isl-src { margin: 0; padding: 10px; font-family: ui-monospace, monospace; font-size: 11px;
  line-height: 1.5; white-space: pre-wrap; word-break: break-all; color: var(--nv-primary-text);
  background: var(--nv-canvas); max-height: 520px; overflow-y: auto; }
.nv-isl-fill .nv-isl-src { max-height: none; height: 100%; }
.nv-isl-err { padding: 10px 12px; font-size: 12px; color: var(--nv-danger);
  background: rgba(194,65,12,.08); border-radius: 0 0 12px 12px; }
.nv-canvas-filerow { display: flex; align-items: center; gap: 8px; width: 100%; border: 0; background: none;
  padding: 7px 8px; font-size: 13px; color: var(--nv-primary-text); cursor: pointer; border-radius: 8px; text-align: left; }
.nv-canvas-filerow:hover { background: var(--nv-accent-soft); }
.nv-canvas-fileicon { width: 16px; color: var(--nv-secondary-text); }

/* 新建面板（J01）：居中白卡，字段标签 + 横排起手卡 */
.nv-create-veil { position: absolute; inset: 0; background: rgba(20, 24, 22, 0.28); display: flex;
  align-items: center; justify-content: center; z-index: 40; }
.nv-create { width: 560px; background: var(--nv-surface); border: 1px solid var(--nv-divider); border-radius: 18px;
  padding: 26px 30px; box-shadow: 0 18px 48px rgba(0, 0, 0, 0.16); }
.nv-create-title { font-size: 18px; font-weight: 700; margin-bottom: 20px; }
.nv-create-label { font-size: 13px; font-weight: 600; color: var(--nv-primary-text); margin: 14px 0 8px; }
.nv-create-label:first-of-type { margin-top: 0; }
.nv-create-name { width: 100%; height: 44px; box-sizing: border-box; border: 1px solid var(--nv-divider); border-radius: 12px; padding: 0 14px;
  font-size: 14px; outline: none; background: var(--nv-surface); color: var(--nv-primary-text); }
.nv-create-name:focus { border-color: var(--nv-accent); }
.nv-create-name::placeholder { color: var(--nv-secondary-text); }
.nv-create-world { width: 100%; margin-top: 10px; border: 1px solid var(--nv-divider); border-radius: 10px;
  padding: 8px 10px; font-size: 13px; background: var(--nv-surface); color: var(--nv-primary-text); }
.nv-create-egs { display: flex; align-items: center; gap: 8px; margin-top: 10px; }
.nv-create-eglabel { font-size: 12px; color: var(--nv-secondary-text); }
.nv-create-eg { border: 1px solid var(--nv-divider); border-radius: 999px; padding: 4px 12px; font-size: 12px;
  background: var(--nv-surface); color: var(--nv-secondary-text); cursor: pointer; }
.nv-create-eg:hover { border-color: var(--nv-accent); color: var(--nv-primary-text); }
.nv-create-starters { display: grid; grid-template-columns: repeat(2, 1fr); gap: 10px; }
.nv-create-starter { position: relative; display: flex; flex-direction: column; align-items: center; gap: 10px;
  border: 1px solid var(--nv-divider); border-radius: 12px; padding: 18px 8px 15px; background: var(--nv-surface); cursor: pointer; }
.nv-create-starter:hover:not(:disabled) { border-color: var(--nv-accent); }
.nv-create-starter-on { border-color: var(--nv-accent-deep); }
.nv-create-starter:disabled { opacity: 0.45; cursor: not-allowed; }
.nv-create-starter-icon { display: inline-flex; color: var(--nv-secondary-text); }
.nv-create-starter-label { font-size: 12.5px; color: var(--nv-primary-text); }
.nv-create-check { position: absolute; top: -7px; right: -7px; width: 20px; height: 20px; border-radius: 50%;
  background: var(--nv-accent-deep); color: #fff; display: inline-flex; align-items: center; justify-content: center; }
.nv-create-actions { display: flex; justify-content: flex-end; gap: 8px; margin-top: 22px; }
.nv-create-cancel { border: 1px solid var(--nv-divider); background: var(--nv-surface); border-radius: 10px;
  padding: 8px 18px; font-size: 13px; color: var(--nv-secondary-text); cursor: pointer; }
.nv-create-ok { border: 0; background: var(--nv-accent); color: #fff; border-radius: 10px;
  padding: 8px 20px; font-size: 13px; cursor: pointer; }
.nv-create-ok:disabled { opacity: 0.45; cursor: not-allowed; }


/* ---------- 预制模块（时间线/关系图/地图） ---------- */
.nv-wg { position: relative; border: 1px solid var(--nv-divider); border-radius: 12px;
  background: var(--nv-surface); padding: 12px; overflow: visible; }
.nv-wg-actions { display: flex; align-items: center; gap: 8px; margin-top: 10px; }
.nv-wg-add { border: 1px dashed var(--nv-divider); border-radius: 8px; background: transparent;
  padding: 5px 12px; font-size: 12px; color: var(--nv-secondary-text); cursor: pointer; }
.nv-wg-add:hover { border-color: var(--nv-accent); color: var(--nv-primary-text); }
.nv-wg-hint { font-size: 12px; color: var(--nv-secondary-text); }
.nv-wg-spacer { flex: 1; }
.nv-wg-panel { margin-top: 10px; border: 1px solid var(--nv-divider); border-radius: 10px;
  background: var(--nv-surface); padding: 12px; display: flex; flex-direction: column; gap: 8px; }
.nv-wg-panelhead { display: flex; align-items: center; justify-content: space-between;
  font-size: 13px; font-weight: 600; color: var(--nv-primary-text); }
.nv-wg-panelhead button { border: none; background: none; font-size: 16px; color: var(--nv-secondary-text); cursor: pointer; }
.nv-wg-input { border: 1px solid var(--nv-divider); border-radius: 8px; padding: 7px 10px;
  font-size: 13px; background: var(--nv-surface); color: var(--nv-primary-text); }
.nv-wg-input:focus { outline: none; border-color: var(--nv-accent); }
.nv-wg-area { min-height: 56px; resize: vertical; font-family: inherit; }
.nv-wg-row { display: flex; gap: 8px; }
.nv-wg-row .nv-wg-input { flex: 1; min-width: 0; }
.nv-wg-del { border: none; background: none; color: #c9564d; font-size: 12px; cursor: pointer; padding: 4px 0; }
.nv-wg-cancel { border: 1px solid var(--nv-divider); border-radius: 8px; background: transparent;
  padding: 5px 12px; font-size: 12px; color: var(--nv-secondary-text); cursor: pointer; }
.nv-wg-ok { border: none; border-radius: 8px; background: var(--nv-accent); color: #fff;
  padding: 5px 14px; font-size: 12px; cursor: pointer; }
.nv-wg-ok:disabled { opacity: 0.45; cursor: default; }
.nv-wg-colors { display: flex; gap: 6px; }
.nv-wg-color { width: 22px; height: 22px; border-radius: 50%; border: 2px solid transparent; cursor: pointer; }
.nv-wg-color-on { border-color: var(--nv-accent-deep); }

/* 时间线页：上半图形（刻度尺 + 纪元带 + 药丸事件），下半文章式写作面 */
.nv-tlp { margin: -4px -6px 0; }
.nv-tlset { position: relative; display: inline-flex; }
.nv-tlset-button { height: 28px; padding: 0 9px; border: 0.5px solid var(--nv-divider); border-radius: 999px; background: none;
  color: var(--nv-secondary-text); font: inherit; font-size: 11px; cursor: pointer; }
.nv-tlset-button:hover { border-color: var(--nv-accent); color: var(--nv-accent-deep); }
.nv-tlset-pop { position: absolute; left: 0; right: auto; top: calc(100% + 6px); z-index: 20; width: 230px; padding: 12px;
  border: 1px solid var(--nv-divider); border-radius: 10px; background: var(--nv-surface); box-shadow: 0 12px 30px rgba(22,24,26,.14); }
.nv-tlset-pop label { display: flex; flex-direction: column; gap: 3px; margin-bottom: 8px; font-size: 10.5px; color: var(--nv-secondary-text); }
.nv-tlset-pop input { width: 100%; box-sizing: border-box; height: 28px; border: 1px solid #dfe4df; border-radius: 6px;
  padding: 0 8px; background: var(--nv-surface); color: var(--nv-primary-text); font: inherit; font-size: 12px; outline: none; }
.nv-tlset-pop input:focus { border-color: var(--nv-accent); }
.nv-tlset-range { display: flex; gap: 8px; }
.nv-tlset-range label { flex: 1; min-width: 0; }
.nv-tlset-pop small { display: block; margin: 0 0 10px; color: var(--faint); font-size: 10px; line-height: 1.5; }
.nv-tlset-actions { display: flex; justify-content: flex-end; gap: 6px; }
.nv-tldiary-head .nv-tlset-pop { left: auto; right: 0; }
.nv-tlset-actions button { height: 28px; padding: 0 10px; border: 1px solid var(--nv-divider); border-radius: 6px;
  background: var(--nv-surface); color: var(--nv-secondary-text); font: inherit; font-size: 11px; cursor: pointer; }
.nv-tlset-actions .nv-tlset-apply { border-color: var(--nv-accent); background: var(--nv-accent); color: #fff; }
.nv-tld-place { display: inline-flex; align-items: center; gap: 3px; height: 22px; padding: 0 8px; border: 1px solid rgba(14,159,110,.25);
  border-radius: 999px; background: rgba(244,250,247,.9); color: var(--nv-accent-deep); font: inherit; font-size: 10.5px; cursor: pointer; }
.nv-tld-place:hover { border-color: var(--nv-accent); }
.nv-tld-placepick { height: 24px; max-width: 120px; border: 1px solid var(--nv-divider); border-radius: 6px; background: var(--nv-surface);
  color: var(--nv-primary-text); font: inherit; font-size: 11px; padding: 0 4px; }
.nv-tldiary-place { height: 22px; padding: 0 8px; border: 1px solid rgba(14,159,110,.25); border-radius: 999px;
  background: rgba(244,250,247,.9); color: var(--nv-accent-deep); font: inherit; font-size: 10.5px; cursor: pointer; }
.nv-tldiary-placefilter { height: 26px; padding: 0 9px; border: 1px solid rgba(14,159,110,.35); border-radius: 999px;
  background: rgba(244,250,247,.9); color: var(--nv-accent-deep); font: inherit; font-size: 10.5px; cursor: pointer; }
.nv-maped-infocardacts { flex-wrap: wrap; }
.nv-tldiary-actions { display: inline-flex; align-items: center; gap: 8px; }
.nv-tlp-bar { display: flex; align-items: center; gap: 8px; margin-bottom: 8px; position: relative; }
.nv-tlp-count { font-size: 12px; color: var(--nv-secondary-text); }
.nv-tlp-hint { font-size: 11px; color: #AEB3B7; margin-left: 12px; }
.nv-tlp-cal { border: 0.5px solid var(--nv-divider); border-radius: 999px; background: none;
  font-size: 11px; color: var(--nv-secondary-text); padding: 2px 10px; cursor: pointer; }
.nv-tlp-cal:hover { color: var(--nv-primary-text); border-color: var(--nv-secondary-text); }
.nv-tlp-calpop { position: absolute; top: 100%; left: 0; margin-top: 6px; z-index: 60;
  background: var(--nv-surface); border: 0.5px solid var(--nv-divider); border-radius: 10px;
  box-shadow: 0 10px 30px rgba(30,40,35,.14); padding: 12px 14px; width: 260px;
  display: flex; flex-direction: column; gap: 6px; font-size: 12px; }
.nv-tlp-calunits { color: var(--nv-secondary-text); font-size: 11.5px; }
.nv-tlp-calviews { display: flex; flex-direction: column; gap: 2px; }
.nv-tlp-calview { border: none; background: none; text-align: left; font-size: 12px;
  color: var(--nv-secondary-text); padding: 5px 8px; border-radius: 6px; cursor: pointer; }
.nv-tlp-calview:hover { background: var(--nv-divider); color: var(--nv-primary-text); }
.nv-tlp-calview-on { font-weight: 600; }
.nv-tlp-calview-on::before { content: '✓ '; }
.nv-tlp-caltip { color: var(--nv-accent-deep); font-size: 11.5px; line-height: 1.5;
  border-top: 0.5px solid var(--nv-divider); padding-top: 8px; }
.nv-tlp-spacer { flex: 1; }
.nv-tlp-addpri { border-color: var(--nv-accent); background: var(--nv-accent); color: #fff; }
.nv-tlp-addpri:hover { background: var(--nv-accent-deep); color: #fff; }
/* 图形区：视口固定，轨道整体 transform 平移——所有元素共享同一坐标系，缩放均等拉伸 */
.nv-tlg { position: sticky; top: 0; z-index: 3; background: var(--nv-surface);
  border-radius: 10px; overflow: hidden; cursor: grab; user-select: none; }
.nv-tlg:active { cursor: grabbing; }
.nv-tlg-band { position: absolute; left: 0; right: 0; z-index: 0; pointer-events: none;
  border-radius: 999px; background: #f4f5f2; }
.nv-tlg-track { position: absolute; top: 0; bottom: 0; left: 0; z-index: 1; will-change: transform; }
.nv-tlg-ticklab { position: absolute; top: 4px; transform: translateX(-50%);
  font-size: 10.5px; color: var(--nv-secondary-text); white-space: nowrap; cursor: pointer; }
.nv-tlg-tick-minor { position: absolute; top: 22px; width: 1px; height: 5px;
  background: var(--nv-divider); }
.nv-tlg-grid { position: absolute; top: 26px; bottom: 0; width: 1px; background: var(--nv-divider); opacity: 0.55; }
.nv-tlg-elide { position: absolute; top: 2px; height: 24px;
  font-size: 12px; color: #C6CACC; letter-spacing: 1px; padding: 0; text-align: center;
  pointer-events: none; }
.nv-tlg-era { position: absolute; height: 20px; border: none; border-radius: 5px; padding: 0 8px;
  font-size: 11px; font-weight: 600; text-align: left; white-space: nowrap; overflow: hidden;
  cursor: pointer; }
.nv-tlg-era-pending { border: 1.5px dashed var(--nv-accent); background: rgba(62,153,106,0.08);
  color: var(--nv-accent-deep); display: flex; align-items: center; }
.nv-tlg-mark { position: absolute; top: 0; bottom: 0; width: 0; border-left: 1.5px solid var(--nv-accent-deep);
  cursor: pointer; }
/* 标记线是 0 宽的——这条透明热区让人能点中整根线 */
.nv-tlg-markhit { position: absolute; top: 0; bottom: 0; left: -6px; width: 13px; }
.nv-tlg-markflag { position: absolute; top: 0; left: 0; padding: 2px 7px 2px 5px;
  background: var(--nv-accent-deep); color: #fff; font-size: 10.5px; line-height: 1.5;
  border-radius: 0 4px 4px 0; white-space: nowrap; }
.nv-tlg-markflag:empty { width: 14px; height: 17px; }
.nv-tlg-markin { position: absolute; top: 1px; left: 2px; width: 90px; border: none; outline: none;
  background: var(--nv-surface); font-size: 10.5px; padding: 2px 5px; border-radius: 4px;
  box-shadow: 0 1px 6px rgba(30,40,35,.2); font-family: inherit; user-select: text; }
.nv-tlg-stem { position: absolute; width: 1px; background: var(--nv-divider); opacity: 0.7; }
.nv-tlg-ev { position: absolute; height: 22px; border: none; border-radius: 999px; padding: 0 12px;
  font-size: 11.5px; font-weight: 600; white-space: nowrap; cursor: pointer; text-align: left;
  box-shadow: inset 0 0 0 1px rgba(0,0,0,0.04); }
.nv-tlg-ev-on { outline: 2px solid var(--nv-accent-deep); outline-offset: 1px; }
.nv-tlg-ev-near { box-shadow: inset 0 0 0 1.5px var(--nv-accent); }
.nv-tlg-ph { position: absolute; top: 0; bottom: 0; left: 50%; width: 0; z-index: 4;
  border-left: 1.5px solid var(--nv-danger); pointer-events: none; }
/* 红线值常显：平时淡灰悬停可读，交互中才变红 */
.nv-tlg-phv { position: absolute; top: 1px; left: 3px; font-size: 10px; line-height: 1.4;
  color: var(--nv-secondary-text); background: var(--nv-surface);
  border: 0.5px solid var(--nv-divider); border-radius: 3px; padding: 1px 5px;
  white-space: nowrap; opacity: .65; transition: opacity var(--nv-dur-ui), background var(--nv-dur-micro), color var(--nv-dur-micro); }
.nv-tlg-phv-on { opacity: 1; color: #fff; background: var(--nv-danger); border-color: var(--nv-danger); }
/* 锚点标签：事件起点/纪元边界处直接印日期，密集时按像素去重 */
.nv-tlg-anchorlab { position: absolute; top: 17px; transform: translateX(-50%);
  font-size: 9px; color: var(--nv-secondary-text); opacity: .75; white-space: nowrap; cursor: pointer; }
.nv-tlg-anchorlab:hover { color: var(--nv-accent-deep); opacity: 1; }
/* 史前/未来分界线：只在有元素延伸进那个方向时才画；线外的粒子尘尾属于各开放端元素 */
.nv-tlg-bound { position: absolute; top: 0; width: 0; border-left: 1.5px solid var(--nv-divider);
  pointer-events: none; }
.nv-tlg-boundlab { position: absolute; top: 2px; font-size: 9.5px; font-style: italic;
  color: var(--nv-secondary-text); opacity: .7; white-space: nowrap; }
.nv-tlg-bound .nv-tlg-boundlab { left: 7px; }
.nv-tlg-bound-past .nv-tlg-boundlab { left: auto; right: 7px; }
.nv-tlg-evbar { position: absolute; height: 6px; border-radius: 999px; pointer-events: none; }
.nv-tlg-mist { position: absolute; pointer-events: none; }
.nv-tlg-mist-near { filter: blur(1.2px); }
.nv-tlg-mist-far { filter: blur(5px); opacity: .5; }
.nv-tlg-snapline { position: absolute; top: 0; width: 0; border-left: 1.5px solid var(--nv-accent);
  opacity: .85; pointer-events: none; }
/* 图内悬停 ×：事件药丸/纪元色带/刻度标记的快捷删除，平时隐身避免干扰视觉 */
.nv-tlg-del { position: absolute; display: flex; align-items: center; justify-content: center;
  width: 14px; height: 14px; border-radius: 50%; background: rgba(20,25,22,.55); color: #fff;
  font-size: 9px; line-height: 1; cursor: pointer; opacity: 0; transition: opacity var(--nv-dur-micro); z-index: 3; }
.nv-tlg-ev:hover .nv-tlg-del, .nv-tlg-era:hover .nv-tlg-del, .nv-tlg-mark:hover .nv-tlg-del { opacity: 1; }
.nv-tlg-ev .nv-tlg-del { top: 4px; right: 3px; }
.nv-tlg-era .nv-tlg-del { top: 3px; right: 3px; }
.nv-tlg-mark .nv-tlg-del { top: 20px; left: 2px; }
.nv-wg-color-inherit { background: none; border-style: dashed; border-color: var(--nv-divider);
  color: var(--nv-secondary-text); font-size: 11px; line-height: 1;
  display: inline-flex; align-items: center; justify-content: center; }
.nv-wg-color-inherit.nv-wg-color-on { border-color: var(--nv-accent-deep); color: var(--nv-accent-deep); }
.nv-ed-menucolors { display: flex; gap: 6px; padding: 6px 10px; }
.nv-ed-menucolors .nv-wg-color { width: 16px; height: 16px; }

/* 时间线文档面：纪元分段 + 事件文章（正文是主信息，时间是灰字附属） */
.nv-tld { max-width: 780px; padding: 6px 0 24px; }
.nv-tld-sec { margin-bottom: 10px; }
.nv-tld-era { display: flex; align-items: center; gap: 9px; width: 100%; border: none;
  background: none; padding: 10px 0 6px; cursor: pointer; text-align: left; }
.nv-tld-era b { font-size: 14.5px; color: var(--nv-primary-text); }
.nv-tld-eradot { width: 9px; height: 9px; border-radius: 3px; flex: none; }
.nv-tld-erange { font-size: 12px; color: var(--nv-secondary-text); }
.nv-tld-eraline { flex: 1; height: 1px; background: var(--nv-divider); }
.nv-tld-era-edit { cursor: default; flex-wrap: wrap; row-gap: 8px; }
.nv-tld-era-plain { cursor: default; }
.nv-tld-eranamein { border: none; border-bottom: 1.5px solid var(--nv-accent); outline: none;
  font-size: 14.5px; font-weight: 700; color: var(--nv-primary-text); padding: 0 0 2px; width: 140px;
  background: none; font-family: inherit; }
.nv-tld-num { width: 72px; border: 0.5px solid var(--nv-divider); border-radius: 7px;
  padding: 4px 8px; font-size: 12px; color: var(--nv-primary-text); outline: none;
  font-family: inherit; }
.nv-tld-num:focus { border-color: var(--nv-accent); }
.nv-tld-range { color: var(--nv-secondary-text); }
.nv-tld-unit { font-size: 12px; color: var(--nv-secondary-text); }
.nv-tld-del { border: none; background: none; color: var(--nv-secondary-text); font-size: 12px;
  cursor: pointer; padding: 4px 6px; }
.nv-tld-del:hover { color: var(--nv-danger); }
.nv-tld-done { border: none; background: none; color: var(--nv-accent-deep); font-size: 12px;
  font-weight: 600; cursor: pointer; padding: 4px 6px; }
.nv-tld-art { position: relative; padding: 8px 0 20px 16px; }
.nv-tld-art-on::before { content: ""; position: absolute; left: 0; top: 12px; bottom: 22px;
  width: 3px; border-radius: 2px; background: var(--nv-accent); }
.nv-tld-art-near::before { content: ""; position: absolute; left: 0; top: 12px; bottom: 22px;
  width: 3px; border-radius: 2px; background: rgba(229,72,77,0.45); }
.nv-tld-title { display: block; width: 100%; border: none; outline: none; background: none;
  font-family: inherit; font-size: 18px; font-weight: 700; color: var(--nv-accent-deep);
  padding: 0; margin: 0 0 2px; }
.nv-tld-title::placeholder { color: var(--nv-secondary-text); }
.nv-tld-meta { margin: 0 0 9px; min-height: 20px; }
.nv-tld-metatext { border: none; background: none; padding: 0; font-size: 12.5px;
  color: #A2A7AB; cursor: text; }
.nv-tld-metatext:hover { color: var(--nv-secondary-text); }
.nv-tld-metarow { display: inline-flex; align-items: center; gap: 6px; flex-wrap: wrap; }
.nv-tld-unitnum { display: inline-flex; align-items: center; gap: 4px; }
.nv-tld-unitsel { border: 0.5px solid var(--nv-divider); border-radius: 6px; background: none;
  font-size: 11.5px; color: var(--nv-secondary-text); padding: 3px 4px; font-family: inherit; }
.nv-tld-openend { font-size: 12px; color: var(--nv-secondary-text); font-style: italic; }
.nv-tld-ongoing { border: 0.5px solid var(--nv-divider); border-radius: 999px; background: none;
  font-size: 11px; color: var(--nv-secondary-text); padding: 2px 9px; cursor: pointer; }
.nv-tld-ongoing:hover { border-color: var(--nv-secondary-text); }
.nv-tld-ongoing-on { color: var(--nv-accent-deep); border-color: var(--nv-accent-deep); }
.nv-tld-body { font-size: 15.5px; line-height: 1.9; color: var(--nv-primary-text); cursor: text; }
.nv-tld-body p { margin: 0 0 0.85em; }
.nv-tld-body-clamp { display: -webkit-box; -webkit-box-orient: vertical; overflow: hidden; }
.nv-tld-bodyedit { width: 100%; border: none; outline: none; resize: none; background: none;
  font-family: inherit; font-size: 15.5px; line-height: 1.9; color: var(--nv-primary-text);
  padding: 0; }
.nv-tld-empty { color: var(--nv-secondary-text); font-size: 14px; }
.nv-tld-add { border: none; background: none; padding: 2px 0 14px 16px; font-size: 12.5px;
  color: var(--nv-secondary-text); cursor: pointer; }
.nv-tld-add:hover { color: var(--nv-accent-deep); }
.nv-tld-emptyhint { padding: 26px 0; text-align: center; color: var(--nv-secondary-text); font-size: 13px; }

/* 总览页 + 模块分页 */
.nv-page-back { display: inline-flex; align-items: center; gap: 4px; border: none; background: none;
  padding: 0 0 8px; font-size: 12.5px; color: var(--nv-secondary-text); cursor: pointer; }
.nv-page-back:hover { color: var(--nv-accent-deep); }
.nv-page-children { margin-top: 12px; border-top: 0.5px solid var(--nv-divider); padding-top: 8px; }
.nv-page-childlink { display: flex; align-items: center; gap: 8px; width: 100%; border: none;
  background: none; padding: 7px 4px; font-size: 13px; color: var(--nv-primary-text);
  cursor: pointer; border-radius: 7px; text-align: left; }
.nv-page-childlink:hover { background: var(--nv-hover); }
.nv-ov-intro { max-width: 820px; margin-bottom: 32px; font-size: 16px; line-height: 26px; }
.nv-ov-intro .md, .nv-ov-intro p { font-size: 16px; line-height: 26px; }
.nv-ov-cover { display: block; width: 100%; max-height: 280px; object-fit: cover; border-radius: 16px; margin-bottom: 18px; }
.nv-ov-grid { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 16px; margin-bottom: 24px; }
.nv-ov-tile { display: flex; flex-direction: column; gap: 20px; min-height: 206px; text-align: left;
  padding: 22px 24px 24px; border: 1px solid #ececec; border-radius: 16px; background: var(--nv-surface);
  cursor: pointer; transition: border-color var(--nv-dur-micro), background var(--nv-dur-micro); }
.nv-ov-tile:hover { border-color: #dcdedd; background: #fafafa; }
.nv-ov-tile:focus-visible { outline: 2px solid var(--nv-accent); outline-offset: 2px; }
.nv-ov-tile-ai { position: relative; overflow: hidden; border-radius: 16px;
  box-shadow: inset 0 0 0 1px rgba(14, 159, 110, .35); }
.nv-ov-tile-ai::after { content: ''; position: absolute; inset: 0; pointer-events: none; border-radius: inherit;
  background: linear-gradient(110deg, transparent 30%, rgba(52, 211, 153, .16) 50%, transparent 70%);
  background-size: 220% 100%; animation: nv-ai-flow 1.9s linear infinite; }
.nv-ov-tile-art { display: flex; flex-direction: column; gap: 9px; min-height: 0; padding: 0; border: 0;
  border-radius: 0; background: transparent; }
.nv-ov-tile-art:hover { background: transparent; }
.nv-ov-art { display: block; width: 100%; aspect-ratio: 3 / 2; object-fit: cover; border-radius: 12px; background: #F3F7F4; }
.nv-ov-tile-art .nv-ov-info { gap: 8px; padding: 0 2px; }
.nv-ov-tile-art .nv-ov-name { font-size: 16px; line-height: 22px; font-weight: 600; }
.nv-ov-tile-art .nv-ov-arrow { font-size: 16px; }
.nv-ov-info { display: flex; align-items: center; gap: 12px; }
.nv-ov-glyph { width: 36px; height: 36px; border-radius: 10px; display: inline-flex; align-items: center;
  justify-content: center; background: var(--nv-accent-soft); color: var(--nv-accent-deep); flex: none; }
.nv-ov-name { flex: 1; min-width: 0; font-size: 20px; line-height: 28px; font-weight: 600; color: var(--nv-primary-text); }
.nv-ov-arrow { font-size: 20px; line-height: 1; color: #b9bdbc; }
.nv-ov-mini { flex: 1; min-height: 110px; display: flex; flex-direction: column; justify-content: flex-start; }
.nv-ov-state { flex: none; font-size: 11px; color: var(--nv-secondary-text); white-space: nowrap; }
.nv-ov-ghost { width: 100%; min-height: 118px; display: flex; align-items: center; gap: 16px; color: #e5e7e3; }
.nv-ov-ghost b { display: block; height: 10px; border-radius: 999px; background: #f0f1ee; }
.nv-ov-ghost > span, .nv-ov-ghost > span > span { flex: 1; min-width: 0; display: flex; flex-direction: column; gap: 10px; }
.nv-ov-ghost-avatar { position: relative; flex: none !important; width: 66px; height: 82px; border-radius: 10px; background: #eff1ee; overflow: hidden; }
.nv-ov-ghost-avatar::before { content: ''; position: absolute; left: 50%; top: 16px; width: 24px; height: 24px;
  margin-left: -12px; border-radius: 50%; background: #d9ddd8; }
.nv-ov-ghost-avatar::after { content: ''; position: absolute; left: 50%; bottom: -12px; width: 50px; height: 36px;
  margin-left: -25px; border-radius: 50% 50% 0 0; background: #d9ddd8; }
.nv-ov-ghost-image > i { flex: none; width: 54%; height: 96px; border-radius: 10px; background: #eff1ee; }
.nv-ov-ghost-square > i { flex: none; width: 68px; height: 68px; border-radius: 10px; background: #eff1ee; }
.nv-ov-ghost-portrait > i { flex: none; width: 58px; height: 86px; border-radius: 10px; background: #eff1ee; }
.nv-ov-ghost-gallery { align-items: stretch; gap: 8px; }
.nv-ov-ghost-gallery > i { position: relative; flex: 1; border-radius: 9px; background: #f0f1ee; }
.nv-ov-ghost-gallery > i::after { content: '▧'; position: absolute; inset: 0; display: grid; place-items: center; color: #d9ddd8; font-size: 18px; }
.nv-ov-ghost-multiForm { align-items: stretch; gap: 8px; }
.nv-ov-ghost-multiForm > i { flex: none; width: 76px; border-radius: 9px; background: #f0f1ee; }
.nv-ov-ghost-map { position: relative; min-height: 118px; border-radius: 10px;
  background-image: linear-gradient(rgba(120,124,118,.12) 1px, transparent 1px), linear-gradient(90deg, rgba(120,124,118,.12) 1px, transparent 1px);
  background-size: 26px 26px; }
.nv-ov-ghost-map i { position: absolute; width: 7px; height: 7px; border-radius: 50%; background: #d6ded9; border: 2px solid #fbfcfb; }
.nv-ov-ghost-map i:nth-child(1) { left: 24%; top: 38%; }
.nv-ov-ghost-map i:nth-child(2) { left: 55%; top: 58%; }
.nv-ov-ghost-map i:nth-child(3) { left: 76%; top: 31%; }
.nv-ov-ghost-timeline { position: relative; align-items: center; }
.nv-ov-ghost-timeline::before { content: ''; position: absolute; left: 2%; right: 2%; top: 50%; height: 2px; background: #eceeeb; }
.nv-ov-ghost-timeline i { position: relative; z-index: 1; width: 9px; height: 9px; flex: none; border-radius: 50%; background: #dfe4df; }
.nv-ov-ghost-relation { position: relative; justify-content: center; }
.nv-ov-ghost-relation::before, .nv-ov-ghost-relation::after { content: ''; position: absolute; height: 1px; width: 34%; background: #dfe4df; top: 50%; }
.nv-ov-ghost-relation::before { left: 14%; transform: rotate(9deg); }
.nv-ov-ghost-relation::after { right: 14%; transform: rotate(-10deg); }
.nv-ov-ghost-relation i { position: relative; z-index: 1; width: 29px; height: 29px; flex: none; border-radius: 50%; background: #eceeeb; }
.nv-ov-ghost-relation i:nth-child(2) { width: 34px; height: 34px; background: #e5e9e4; }
.nv-ov-ghost-rulebook { align-items: stretch; gap: 14px; }
.nv-ov-ghost-rulebook > span { flex: none !important; width: 34px; border-radius: 8px; background: #f4f5f2; }
.nv-ov-ghost-rulebook b { flex: 1; }
.nv-ov-ghost-quotes { flex-direction: column; align-items: flex-start; gap: 11px; }
.nv-ov-ghost-quotes strong { font-size: 42px; line-height: .8; color: #eceeeb; font-family: var(--nv-serif, "Songti SC", serif); font-weight: 600; }
.nv-ov-ghost-quotes b { width: 86%; }
.nv-ov-ghost-quotes b:last-child { width: 62%; }
.nv-ov-ghost-skill { flex-direction: column; align-items: flex-start; gap: 10px; }
.nv-ov-ghost-skill b { width: 74%; }
.nv-ov-ghost-skill i { width: 52px; height: 16px; border-radius: 999px; background: #f3f4f1; }
.nv-ov-ghost-collection, .nv-ov-ghost-document { flex-direction: column; align-items: stretch; justify-content: center; gap: 12px; }
.nv-ov-ghost-collection b:nth-child(1), .nv-ov-ghost-document b:nth-child(1) { width: 44%; height: 13px; }
.nv-ov-ghost-collection b:nth-child(2), .nv-ov-ghost-document b:nth-child(2) { width: 78%; }
.nv-ov-ghost-document b:nth-child(3) { width: 66%; }
.nv-ov-ghost-document b:nth-child(4) { width: 48%; }
.nv-ov-ghost-runtime { justify-content: center; color: #dfe4df; }
.nv-ov-excerpt { font-size: 15px; line-height: 25px; color: var(--nv-secondary-text);
  display: -webkit-box; -webkit-line-clamp: 4; -webkit-box-orient: vertical; overflow: hidden; }
.nv-ov-htmlglyph { color: var(--nv-secondary-text); }
.nv-ov-sum, .nv-ov-go { display: none; }
.nv-mini-tl { display: flex; flex-direction: column; gap: 8px; width: 100%; }
.nv-mini-tl-row { display: flex; align-items: center; gap: 10px; min-width: 0; font-size: 14px; line-height: 20px; }
.nv-mini-tl-dot { width: 6px; height: 6px; border-radius: 50%; background: var(--nv-accent); flex: none; }
.nv-mini-tl-row b { flex: 1; min-width: 0; font-weight: 500; color: var(--nv-primary-text);
  overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.nv-mini-tl-row > span { flex: none; font-size: 13px; color: var(--nv-secondary-text); }
.nv-mini-rel { display: flex; flex-direction: column; gap: 8px; width: 100%; }
.nv-mini-relrow { display: flex; align-items: center; gap: 8px; min-width: 0; font-size: 14px; line-height: 20px; }
.nv-mini-relrow b { font-weight: 500; color: var(--nv-primary-text); }
.nv-mini-relrow i { flex: 1; min-width: 0; font-style: normal; font-size: 13px; text-align: center;
  color: var(--nv-secondary-text); border-bottom: 1px dashed #e3e6e3; }
.nv-mini-relrow > span { flex: none; color: var(--nv-secondary-text); }

/* 人物关系图 */
/* 关系图节点卡片化：圆角卡片承载姓名与身份 */
.nv-rel-card { fill: #ffffff; stroke: #dfe3df; stroke-width: 1; }
.nv-rel-node:hover .nv-rel-card { stroke: rgba(14,159,110,.45); }
.nv-rel-node-on .nv-rel-card { stroke: #34d399; stroke-width: 1.6; }
.nv-rel-note { font-size: 14px; fill: #8a8f8a; }
.nv-rel-name { fill: #1f2421; }

.nv-rel-canvas { display: block; width: 100%; aspect-ratio: 760 / 680; border-radius: 8px;
  background: var(--nv-pane, #F7F8F9); }
.nv-rel-line { stroke: var(--nv-divider); stroke-width: 1.5; }
.nv-rel-linehit { stroke: transparent; stroke-width: 18; }
.nv-rel-edge { cursor: pointer; }
.nv-rel-edge:hover .nv-rel-line { stroke: var(--nv-accent); }
.nv-rel-edgelabel { font-size: 13px; fill: var(--nv-secondary-text); paint-order: stroke;
  stroke: var(--nv-pane, #F7F8F9); stroke-width: 4; }
.nv-rel-node { cursor: grab; }
.nv-rel-node:active { cursor: grabbing; }
.nv-rel-circle { fill: var(--nv-surface); stroke: var(--nv-divider); stroke-width: 2; }
.nv-rel-node:hover .nv-rel-circle { stroke: var(--nv-accent); }
.nv-rel-node-on .nv-rel-circle { stroke: var(--nv-accent-deep); stroke-width: 2.5; }
.nv-rel-node-linkable .nv-rel-circle { stroke: var(--nv-accent); stroke-dasharray: 4 3; }
.nv-rel-name { font-size: 20px; font-weight: 600; fill: var(--nv-primary-text); pointer-events: none; }
.nv-rel-empty { font-size: 14px; fill: var(--nv-secondary-text); }

/* 地图 */
.nv-map-empty { display: flex; flex-direction: column; align-items: center; gap: 10px;
  padding: 34px 16px; color: var(--nv-secondary-text); font-size: 13px; text-align: center; }
.nv-map-emptyicon { color: var(--nv-divider); }
.nv-map-barecanvas { position: relative; min-height: 430px; border: 1px solid var(--nv-divider); border-radius: 14px;
  overflow: hidden; background: #faf9f4; }
.nv-map-baregrid { position: absolute; inset: 0;
  background-image: linear-gradient(rgba(120,124,118,.075) 1px, transparent 1px),
    linear-gradient(90deg, rgba(120,124,118,.075) 1px, transparent 1px);
  background-size: 64px 64px; }
.nv-map-baretop { position: absolute; left: 16px; top: 56px; z-index: 2; display: flex; flex-wrap: wrap; gap: 8px; }
.nv-map-barebtn { height: 34px; padding: 0 14px; border: 1px solid var(--nv-divider); border-radius: 999px;
  background: rgba(255,255,255,.94); color: var(--nv-secondary-text); font: inherit; font-size: 12.5px; cursor: pointer; }
.nv-map-barebtn:hover:not(:disabled) { border-color: var(--nv-accent); color: var(--nv-accent-deep); }
.nv-map-barebtn:disabled { opacity: .42; cursor: default; }
.nv-map-barebtn-primary { background: var(--nv-accent); border-color: var(--nv-accent); color: #fff; }
.nv-map-barebtn-primary:hover:not(:disabled) { background: var(--nv-accent-deep); color: #fff; }
.nv-map-baremarker { position: absolute; left: 50%; top: 52%; transform: translate(-50%, -50%); z-index: 2;
  display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 7px;
  width: 150px; height: 112px; border: 1px dashed #c8ccc5; border-radius: 12px; background: rgba(255,255,255,.46);
  color: var(--nv-secondary-text); font: inherit; font-size: 12.5px; cursor: pointer; }
.nv-map-baremarker span { color: var(--nv-accent); font-size: 24px; line-height: 1; }
.nv-map-baremarker b { font-weight: 500; }
.nv-map-baremarker:hover { border-color: var(--nv-accent); color: var(--nv-accent-deep); background: rgba(255,255,255,.7); }
.nv-map-baretools { position: absolute; left: 16px; bottom: 12px; z-index: 2; display: flex; align-items: center; gap: 12px;
  color: var(--nv-secondary-text); font-size: 11.5px; }
.nv-map-baretools button { height: 28px; padding: 0 9px; border: 1px solid var(--nv-divider); border-radius: 7px;
  background: rgba(255,255,255,.9); color: var(--nv-secondary-text); font: inherit; font-size: 11.5px; cursor: pointer; }
.nv-map-baretools button:hover { border-color: var(--nv-accent); color: var(--nv-accent-deep); }
.nv-map-barehint { position: absolute; left: 50%; bottom: 14px; transform: translateX(-50%); color: var(--nv-accent-deep); font-size: 11.5px; }
.nv-map-picker { display: grid; grid-template-columns: repeat(4, 1fr); gap: 8px; margin-top: 10px; }
.nv-map-pick { border: 1px solid var(--nv-divider); border-radius: 8px; padding: 0; overflow: hidden;
  cursor: pointer; background: none; }
.nv-map-pick:hover { border-color: var(--nv-accent); }
.nv-map-pick img { width: 100%; aspect-ratio: 4/3; object-fit: cover; display: block; }
.nv-map-entries { display: flex; gap: 10px; margin-top: 4px; }
.nv-map-entry { display: flex; flex-direction: column; align-items: center; gap: 5px;
  width: 128px; padding: 14px 12px; border: 1px solid var(--nv-divider); border-radius: 12px;
  background: var(--nv-surface); color: var(--nv-primary-text); cursor: pointer; }
.nv-map-entry:hover { border-color: var(--nv-accent); }
.nv-map-entryicon { color: var(--nv-accent-deep); }
.nv-map-entryname { font-size: 13px; }
.nv-map-entrydesc { font-size: 11px; color: var(--nv-secondary-text); line-height: 1.5; }

/* 集合 / 档案 / 关系 / 时间线 / 资料：2026-10-22 地图合并时误删的样式恢复。 */
.nv-coll { margin-top: 0; }
.nv-coll-bar { display: flex; align-items: center; justify-content: flex-end; gap: 20px; margin-bottom: 28px; min-height: 40px; }
.nv-coll-views { display: inline-flex; gap: 2px; border-radius: 10px; padding: 2px; }
.nv-coll-view { border: 0; background: none; border-radius: 8px; padding: 8px 16px; font: inherit;
  font-size: 14px; line-height: 20px; color: var(--nv-secondary-text); cursor: pointer; }
.nv-coll-view:hover { color: var(--nv-primary-text); background: #f4f5f4; }
.nv-coll-view-on { background: #f0f2f1; color: var(--nv-primary-text); font-weight: 500; }
.nv-coll-empty { padding: 40px 0; text-align: center; color: var(--nv-secondary-text); font-size: 15px; }
.nv-coll-sec { margin-bottom: 40px; }
.nv-coll-sec:last-child { margin-bottom: 0; }
.nv-coll-secname { display: flex; align-items: center; gap: 12px; margin: 0 0 20px; font-size: 20px;
  line-height: 28px; font-weight: 600; color: var(--nv-primary-text); }
.nv-coll-secname::before { content: ''; width: 4px; height: 20px; border-radius: 2px; background: var(--nv-accent); }
.nv-coll-dot { display: none; }
.nv-coll-card { display: flex; flex-direction: column; text-align: left; border: 0; border-radius: 12px;
  background: transparent; padding: 0; overflow: hidden; cursor: pointer; }
.nv-coll-card-on .nv-coll-cardimg { outline: 2px solid var(--nv-accent); outline-offset: 2px; }
.nv-coll-cardimg { width: 100%; aspect-ratio: 4/3; object-fit: cover; display: block; border-radius: 12px; }
.nv-coll-cardimg-empty { display: flex; align-items: center; justify-content: center; aspect-ratio: 3/4;
  background: #f4f5f4; color: var(--nv-secondary-text); border-radius: 12px; }
.nv-coll-cardname { font-size: 19px; line-height: 27px; font-weight: 600; padding: 14px 0 0; }
.nv-coll-cardstat { font-size: 16px; font-weight: 700; padding: 2px 0 0; }
.nv-coll-cardname.is-ph, .nv-coll-openitem.is-ph { color: var(--nv-secondary-text); font-weight: 400; }
.nv-coll-openitem { border: 0; background: none; padding: 0; font: inherit; font-weight: 600; color: inherit; cursor: pointer; text-align: left; }
.nv-coll-setprimary { position: absolute; top: 12px; right: 12px; z-index: 2; opacity: 0; border: 0;
  padding: 4px 9px; border-radius: 999px; background: rgba(255,255,255,.94); color: var(--nv-secondary-text);
  font: inherit; font-size: 11px; cursor: pointer; transition: opacity var(--nv-dur-micro), color var(--nv-dur-micro); }
.nv-coll-card:hover .nv-coll-setprimary, .nv-coll-setprimary:focus { opacity: 1; }
.nv-coll-setprimary:hover { color: var(--nv-accent-deep); }
.nv-coll-addtile { display: flex; flex-direction: column; font: inherit; align-items: center; justify-content: center; gap: 4px;
  width: 100%; max-width: 100%; aspect-ratio: 3 / 4; min-height: 0; margin-top: 0; align-self: start;
  border: 1px dashed #d8d6cd; border-radius: 12px; background: transparent;
  color: var(--nv-secondary-text); cursor: pointer; }
.nv-coll-addtile input { display: none; }
.nv-coll-addtile:hover { border-color: var(--nv-accent); color: var(--nv-accent-deep); }
.nv-coll-addtile-plus { font-size: 22px; line-height: 1; }
.nv-coll-addtile b { font-size: 13px; font-weight: 500; }
.nv-coll-addtile small { font-size: 11px; }
.nv-coll-cardsum { font-size: 14px; line-height: 22px; color: var(--nv-secondary-text); padding: 6px 0 0;
  display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical; overflow: hidden; }
.nv-coll-card { position: relative; }
.nv-coll-primary { position: absolute; top: 12px; left: 12px; z-index: 2; display: inline-flex; align-items: center;
  height: 28px; padding: 0 12px; border-radius: 999px; background: var(--nv-accent); color: #fff;
  font-size: 13px; font-weight: 500; box-shadow: 0 1px 6px rgba(20,60,45,.18); }
.nv-coll-chip { display: inline-block; padding: 3px 12px; border-radius: 999px; font-size: 13px;
  line-height: 20px; white-space: nowrap; }
.nv-coll-chip-green { background: rgba(14,159,110,.14); color: #0b7a55; }
.nv-coll-chip-red { background: rgba(214,69,69,.12); color: #b23a3a; }
.nv-coll-chip-gray { background: rgba(120,124,128,.12); color: var(--nv-secondary-text); }
.nv-coll-chip-neutral { background: rgba(52,120,211,.10); color: #2f6cb3; }
.nv-coll-reftd { min-width: 150px; padding: 6px 8px; font-size: 15px; }
.nv-coll-formavatar { width: 216px; height: 210px; object-fit: cover; border-radius: 12px; margin: 0; display: block; }
.nv-coll-chips { display: inline-flex; flex-wrap: wrap; align-items: center; gap: 6px; }
.nv-coll-chipx { border: 0; background: none; cursor: pointer; color: inherit; opacity: .55; font-size: 10px; padding: 0 0 0 4px; }
.nv-coll-chipx:hover { opacity: 1; }
.nv-coll-chipinput { min-width: 110px; border: 1px dashed var(--nv-divider); border-radius: 999px; padding: 3px 10px;
  font: inherit; font-size: 11.5px; background: transparent; color: var(--nv-primary-text); outline: none; }
.nv-coll-chipinput:focus { border-color: var(--nv-accent); }
.nv-wg.nv-relation { position: relative; }
.nv-rel-zoom { position: absolute; top: 14px; right: 14px; display: flex; align-items: center; gap: 2px;
  background: rgba(255,255,255,.94); border: 1px solid var(--nv-divider); border-radius: 10px; padding: 4px 6px; }
.nv-rel-zoomb { width: 28px; height: 28px; border: 0; border-radius: 7px; background: none; cursor: pointer;
  font-size: 16px; line-height: 1; color: var(--nv-primary-text); }
.nv-rel-zoomb:hover { background: var(--nv-hover); }
.nv-rel-zoomval { font-size: 12px; color: var(--nv-secondary-text); min-width: 38px; text-align: center; }
.nv-rel-zoomfit { font-size: 13px; padding: 6px 10px; border-radius: 7px; }
.nv-rel-pill { fill: #ffffff; stroke: #e3e6e3; }
.nv-rel-legend { position: absolute; bottom: 16px; left: 16px; top: auto; display: flex; gap: 16px;
  padding: 7px 14px; border: 1px solid var(--nv-divider); border-radius: 999px; background: rgba(255,255,255,.94);
  font-size: 13px; color: var(--nv-secondary-text); }
.nv-rel-legend span { display: inline-flex; align-items: center; gap: 6px; }
.nv-rel-dot { width: 8px; height: 8px; border-radius: 50%; display: inline-block; }
.nv-rel-dot-person { background: #34d399; }
.nv-rel-dot-faction { background: #8b93a1; }
.nv-cardpage-bleed .nv-wg-actions { position: absolute; right: 24px; bottom: 24px; z-index: 6; }
.nv-cardpage-bleed .nv-wg-add { height: 40px; min-width: 112px; padding: 0 18px; border: 0; border-radius: 10px;
  background: var(--nv-accent); color: #fff; font: inherit; font-size: 14px; font-weight: 500; cursor: pointer;
  box-shadow: 0 4px 14px rgba(20,60,45,.16); }
.nv-cardpage-bleed .nv-wg-add:hover { background: var(--nv-accent-deep); color: #fff; }
.nv-cardpage-bleed .nv-modbox { flex: 1; min-height: 0; display: flex; flex-direction: column; }
.nv-cardpage-bleed .nv-relation { flex: 1; min-height: 0; display: flex; }
.nv-cardpage-bleed .nv-rel-canvas { flex: 1; width: 100%; height: 100%; aspect-ratio: auto; border-radius: 0; }
.nv-coll-formmain { display: flex; gap: 32px; padding: 0; align-items: flex-start; }
.nv-coll-formmain .nv-coll-formavatar { width: 216px; height: 210px; margin: 0; flex: none; aspect-ratio: auto;
  object-fit: cover; border-radius: 12px; }
.nv-coll-formmain .nv-coll-formrows { flex: 1; min-width: 0; }
.nv-coll-formmain .nv-coll-formrow:first-child { border-top: 0; }
.nv-coll-formquote { margin-top: 28px; min-height: 110px; padding: 26px 28px; border-radius: 12px;
  background: #f4faf7; display: flex; align-items: center; font-size: 18px; line-height: 30px;
  color: var(--nv-primary-text); }
.nv-coll-barright { display: inline-flex; align-items: center; gap: 10px; }
.nv-coll-add { height: 40px; padding: 0 20px; border: 0; border-radius: 10px; background: var(--nv-accent);
  color: #fff; font: inherit; font-size: 14px; font-weight: 500; cursor: pointer; }
.nv-coll-add:hover { background: var(--nv-accent-deep); }
.nv-coll-add:focus-visible { outline: 2px solid var(--nv-accent); outline-offset: 2px; }
.nv-coll-cardimg { aspect-ratio: 3 / 4; height: auto; object-fit: cover; }
.nv-coll-cardimg.nv-coll-cardimg-landscape { aspect-ratio: 3 / 2; }
.nv-coll-cardimg.nv-coll-cardimg-square { aspect-ratio: 1 / 1; }
.nv-prof.is-rendered { cursor: pointer; }
.nv-prof.is-editing { cursor: default; }
.nv-prof.is-saving { opacity: .72; }
.nv-prof-portrait input { display: none; }
.nv-prof-fact { display: inline-flex; align-items: baseline; gap: 6px; font-size: 14px; }
.nv-prof-fact > span { color: var(--nv-secondary-text); font-size: 12px; }
.nv-prof-fact b { color: var(--nv-primary-text); font-weight: 500; }
.nv-prof-factedit { display: flex; flex-direction: column; gap: 3px; min-width: 0; }
.nv-prof.is-editing .nv-prof-facts { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 10px 16px; }
.nv-prof-factedit > span { flex: none; color: var(--nv-secondary-text); font-size: 12px; }
.nv-prof-editinput { width: 100%; box-sizing: border-box; min-width: 0; padding: 6px 8px; border: 1px solid var(--nv-divider); border-radius: 7px; background: var(--nv-surface); color: var(--nv-primary-text); font: inherit; font-size: 14px; font-weight: 500; outline: none; }
.nv-prof-editinput:focus { border-color: var(--nv-accent); }
.nv-prof-editinput::placeholder { color: var(--nv-faint); font-weight: 400; }
.nv-prof-editbody::placeholder { color: var(--nv-faint); }
.nv-prof { display: flex; flex-direction: column; gap: 22px; }
.nv-prof-head { display: flex; flex-wrap: wrap; gap: 24px; align-items: flex-start; }
.nv-prof-portrait { flex: 0 1 216px; width: 216px; max-width: 100%; height: 270px; margin: 0; border-radius: 10px; overflow: hidden;
  background: #f4f5f4; display: flex; align-items: center; justify-content: center;
  font-size: 13px; color: var(--nv-secondary-text); cursor: pointer; }
.nv-prof-portrait.is-empty { border: 1px solid #DDEBE3; background: linear-gradient(160deg, #F6FBF7, #EAF4EE); color: var(--nv-accent-deep); }
.nv-prof-portrait:hover, .nv-prof-portrait.is-empty:hover { background: #eef2ee; color: var(--nv-accent-deep); }
.nv-prof-portrait img { width: 100%; height: 100%; object-fit: cover; display: block; }
.nv-prof-main { flex: 1 1 260px; min-width: 0; }
.nv-prof-main > .nv-coll-chips { margin-top: 12px; }
.nv-prof-world .nv-prof-head { display: block; }
.nv-prof-world .nv-prof-main { margin-top: 18px; }
.nv-prof-world .nv-prof-quote { margin-top: 12px; }
@container (max-width: 560px) {
.nv-prof-head { gap: 16px; }
.nv-prof-portrait { flex-basis: 100%; width: 100%; height: 220px; }
}
.nv-prof-kicker { margin-bottom: 8px; font-size: 12px; letter-spacing: .12em; color: var(--nv-accent-deep); }
.nv-prof-hint { margin-left: 10px; font-size: 11px; letter-spacing: 0; color: var(--nv-secondary-text); }
.nv-prof-value { flex: 1; min-width: 0; border: 0; background: none; padding: 2px 4px; margin: -2px -4px; border-radius: 5px;
  font: inherit; font-size: 14px; font-weight: 500; color: var(--nv-primary-text); text-align: left; cursor: text; }
.nv-prof-value:hover { background: #f4f5f4; }
.nv-prof-input { flex: 1; min-width: 0; height: 28px; border: 1px solid var(--nv-accent); border-radius: 6px;
  padding: 0 7px; font: inherit; font-size: 14px; color: var(--nv-primary-text); outline: none; background: var(--nv-surface); }
.nv-coll-chipname { border: 0; background: none; padding: 0; font: inherit; color: inherit; cursor: text; }
.nv-coll-chip-edit { width: 7.5em; height: 26px; border: 1px solid var(--nv-accent); border-radius: 7px; padding: 0 8px;
  background: var(--nv-surface); color: var(--nv-primary-text); font: inherit; font-size: 12px; outline: none; }
.nv-coll-chipadd { width: 24px; height: 24px; border: 1px dashed #d8d6cd; border-radius: 999px; background: transparent;
  color: var(--nv-secondary-text); font: inherit; font-size: 13px; line-height: 1; cursor: pointer; }
.nv-coll-chipadd:hover { border-color: var(--nv-accent); color: var(--nv-accent-deep); }
.nv-prof-chips { display: flex; flex-wrap: wrap; align-items: center; gap: 6px; margin-top: 12px; padding: 3px 4px;
  border: 0; border-radius: 8px; background: none; font: inherit; cursor: text; }
.nv-prof-chips:hover { background: #f4f5f4; }
.nv-prof-chipsadd { color: var(--nv-secondary-text); font-size: 14px; padding: 0 4px; }
.nv-prof-chipinput { width: 100%; height: 34px; margin-top: 10px; border: 1px solid var(--nv-accent); border-radius: 8px;
  padding: 0 10px; font: inherit; font-size: 13px; color: var(--nv-primary-text); outline: none; background: var(--nv-surface); }
.nv-prof-facts { display: flex; flex-wrap: wrap; gap: 9px 18px; padding: 2px 0 0; }
.nv-prof-facts .nv-prof-field { display: inline-flex; align-items: baseline; gap: 6px; padding: 0; border: 0; font-size: 14px; }
.nv-prof-facts .nv-prof-field > span { flex: none; font-size: 12px; }
.nv-prof-facts .nv-prof-value { flex: none; width: auto; padding: 0; margin: 0; }
.nv-prof-facts .nv-prof-input { flex: none; width: 140px; }
.nv-prof-intro { margin-top: 8px; padding-top: 16px; border-top: 1px solid var(--nv-divider);
  min-height: 120px; font-size: 15px; line-height: 1.9; color: #4d534c; outline: none; white-space: pre-wrap; }
.nv-prof-intro:empty::before { content: attr(data-placeholder); color: var(--nv-secondary-text); }
.nv-prof-intro:focus { background: #f7f8f7; border-radius: 4px; }
.nv-prof-fields { display: grid; grid-template-columns: 1fr; border-top: 1px solid var(--nv-divider); }
.nv-prof-field { display: flex; align-items: baseline; gap: 12px; padding: 11px 0; border-bottom: 1px solid #f0f0f0; font-size: 14px; }
.nv-prof-field span { flex: 0 0 44px; font-size: 13px; color: var(--nv-secondary-text); }
.nv-prof-field b { font-weight: 500; color: var(--nv-primary-text); }
.nv-prof-chips { display: flex; flex-wrap: wrap; gap: 6px; margin-top: 12px; }
.nv-prof-quote { margin-top: 10px; padding: 0; border: 0; border-radius: 0; background: none;
  font-family: var(--nv-serif, "Songti SC", serif); font-size: 18px; line-height: 1.75; color: #444A46; }
.nv-prof-sections { display: flex; flex-direction: column; gap: 20px; max-width: 820px; padding-top: 22px; border-top: 0; }
.nv-prof-section h3 { margin: 0 0 7px; padding: 0; border: 0; color: var(--nv-accent-deep);
  font-family: inherit; font-size: 10.5px; font-weight: 500; letter-spacing: .15em; outline: none; }
.nv-prof-section p { margin: 0; color: #444A46; font-size: 14.5px; line-height: 1.95; outline: none; white-space: pre-wrap; }
.nv-prof-section h3:empty::after, .nv-prof-section h3:has(> br:only-child)::after { content: attr(data-placeholder); color: var(--nv-secondary-text); font-weight: 400; }
.nv-prof-section h3:focus::after, .nv-prof-section h3:has(> br:only-child):focus::after { content: none; }
.nv-prof-section p:empty::before, .nv-prof-section p:has(> br:only-child)::before { content: attr(data-placeholder); color: var(--nv-secondary-text); }
.nv-prof-section p:focus::before, .nv-prof-section p:has(> br:only-child):focus::before { content: none; }
.nv-prof-quote.is-empty:empty::before, .nv-prof-quote.is-empty:has(> br:only-child)::before { content: attr(data-placeholder); font-family: var(--sans); font-size: 14px; color: var(--nv-secondary-text); }
.nv-prof-quote.is-empty:focus::before, .nv-prof-quote.is-empty:has(> br:only-child):focus::before { content: none; }
.nv-tldiary-body h3:empty::before, .nv-tldiary-body h3:has(> br:only-child)::before { content: attr(data-placeholder); color: var(--nv-secondary-text); font-weight: 400; }
.nv-tldiary-body h3:focus::before, .nv-tldiary-body h3:has(> br:only-child):focus::before { content: none; }
.nv-tldiary-body p:empty::before, .nv-tldiary-body p:has(> br:only-child)::before { content: attr(data-placeholder); color: var(--nv-secondary-text); }
.nv-tldiary-body p:focus::before, .nv-tldiary-body p:has(> br:only-child):focus::before { content: none; }
.nv-prof-section h3:focus, .nv-prof-section p:focus { background: #f7f8f7; border-radius: 4px; }
.nv-prof-add { width: 100%; min-height: 42px; border: 1px dashed #d8d6cd; border-radius: 10px; background: transparent;
  color: var(--nv-secondary-text); font: inherit; font-size: 12px; cursor: pointer; }
.nv-prof-add:hover { border-color: var(--nv-accent); color: var(--nv-accent-deep); }
.nv-graphview { display: grid; grid-template-columns: minmax(0, 1fr); gap: 14px; }
.nv-graphview-list { display: flex; flex-direction: column; gap: 8px; }
.nv-graphview-note { margin: 0 2px 4px; font-size: 12px; line-height: 1.7; color: var(--nv-secondary-text); }
.nv-graphview-row { display: flex; flex-direction: column; align-items: stretch; gap: 4px; width: 100%;
  padding: 10px 12px; border: 1px solid var(--nv-divider); border-radius: 11px; background: var(--nv-surface);
  text-align: left; cursor: pointer; font: inherit; }
.nv-graphview-row:hover, .nv-graphview-row.is-hot { border-color: rgba(14,159,110,.45); box-shadow: 0 0 0 3px rgba(14,159,110,.06); }
.nv-graphview-pair { display: flex; align-items: center; gap: 7px; min-width: 0; }
.nv-graphview-pair b { font-size: 13px; font-weight: 500; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.nv-graphview-pair b.is-ph { color: var(--nv-secondary-text); font-weight: 400; }
.nv-graphview-row .nv-graphview-pair i { flex: none; font-style: normal; padding: 1px 7px; border-radius: 999px; background: #f3f2ec; color: var(--nv-secondary-text); font-size: 10.5px; }
.nv-graphview-row small { display: block; min-width: 0; font-size: 11px; color: var(--nv-secondary-text); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.nv-graphview-row b { display: block; font-size: 13px; font-weight: 500; }
.nv-graphview-chev { margin-left: auto; color: var(--faint); font-size: 15px; line-height: 1; }
.nv-graphview-row:hover .nv-graphview-chev, .nv-graphview-row.is-hot .nv-graphview-chev { color: var(--nv-accent); }
.nv-graphview-row small { display: block; margin-top: 2px; font-size: 11px; color: var(--nv-secondary-text);
  overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.nv-graphview-row i { flex: none; font-style: normal; padding: 2px 8px; border-radius: 999px; background: #f3f2ec;
  color: var(--nv-secondary-text); font-size: 11px; }
.nv-graphview-row.is-hot i { background: var(--nv-accent-soft); color: var(--nv-accent-deep); }
.nv-graphview-add { margin-top: 4px; min-height: 40px; border: 1px dashed #d8d6cd; border-radius: 10px; background: transparent;
  color: var(--nv-secondary-text); font: inherit; font-size: 12px; cursor: pointer; }
.nv-graphview-add:hover { border-color: var(--nv-accent); color: var(--nv-accent-deep); }
.nv-graphview-editor { min-width: 0; display: grid; grid-template-columns: 1fr 1fr; gap: 8px 12px;
  padding: 12px; border: 1px solid rgba(14,159,110,.3); border-radius: 11px; background: #fbfdfb; }
.nv-graphview-input { display: flex; flex-direction: column; gap: 4px; min-width: 0; }
.nv-graphview-input span { font-size: 10.5px; color: var(--nv-secondary-text); }
.nv-graphview-person { display: flex; flex-direction: column; gap: 4px; min-width: 0; }
.nv-graphview-picksel { width: 100%; box-sizing: border-box; height: 26px; border: 1px solid #e3e6e1; border-radius: 6px;
  padding: 0 6px; background: var(--nv-surface); color: var(--nv-secondary-text); font: inherit; font-size: 11px; outline: none; }
.nv-graphview-picksel:focus { border-color: var(--nv-accent); }
.nv-personpick { position: relative; min-width: 0; }
.nv-personpick-menu { position: fixed; z-index: 80; max-height: 190px; overflow: auto;
  padding: 4px; border: 1px solid var(--nv-divider); border-radius: 8px; background: var(--nv-surface); box-shadow: 0 10px 28px rgba(22,24,26,.14); }
.nv-personpick-option { display: flex; align-items: center; justify-content: space-between; gap: 8px; width: 100%;
  padding: 6px 8px; border: 0; border-radius: 6px; background: none; color: var(--nv-primary-text);
  font: inherit; font-size: 12px; text-align: left; cursor: pointer; }
.nv-personpick-option small { color: var(--faint); font-size: 10px; white-space: nowrap; }
.nv-personpick-option.is-active { background: var(--nv-accent-soft); color: var(--nv-accent-deep); }
.nv-graphview-dir { flex: none; margin-left: -3px; color: var(--faint); font-size: 11px; }
.nv-rel-arrowshape { fill: #cfd3ca; }
.nv-graphview-input input, .nv-graphview-input textarea { width: 100%; box-sizing: border-box; border: 1px solid #dfe4df; border-radius: 7px;
  padding: 7px 9px; font: inherit; font-size: 12px; color: var(--nv-primary-text); background: var(--nv-surface); outline: none; resize: vertical; }
.nv-graphview-input input:focus, .nv-graphview-input textarea:focus { border-color: var(--nv-accent); }
.nv-graphview-input:last-of-type { grid-column: 1 / -1; }
.nv-graphview-tip { grid-column: 1 / -1; margin: 0; font-size: 10.5px; line-height: 1.6; color: var(--faint); }
.nv-graphview-done { grid-column: 1 / -1; align-self: end; justify-self: end; min-height: 30px; padding: 0 12px; border: 1px solid var(--nv-divider);
  border-radius: 7px; background: var(--nv-surface); color: var(--nv-primary-text); font: inherit; font-size: 11px; cursor: pointer; }
.nv-graphview-done:hover { border-color: var(--nv-accent); color: var(--nv-accent-deep); }
.nv-graphview-canvas { position: relative; min-height: 390px; border: 1px solid var(--nv-divider); border-radius: 16px; overflow: hidden;
  background: radial-gradient(circle at 50% 48%, rgba(14,159,110,.06), transparent 34%), linear-gradient(#f7f6f0, #fbfaf6); }
.nv-graphview-canvas svg { position: absolute; inset: 0; width: 100%; height: 100%; }
.nv-graphview-stage { position: absolute; inset: 0; transform-origin: 50% 50%; transition: transform .18s ease; }
.nv-graphview-zoom { position: absolute; top: 10px; right: 10px; z-index: 4; display: flex; align-items: center; gap: 2px;
  padding: 3px; border: 1px solid var(--nv-divider); border-radius: 9px; background: rgba(255,255,255,.94); backdrop-filter: blur(4px); }
.nv-graphview-zoom button { width: 24px; height: 24px; border: 0; border-radius: 6px; background: transparent; color: var(--nv-secondary-text);
  font-size: 14px; cursor: pointer; }
.nv-graphview-zoom button:hover { background: var(--nv-hover); color: var(--nv-text); }
.nv-graphview-zoom .nv-graphview-fit { width: auto; padding: 0 7px; font-size: 10.5px; }
.nv-graphview-zoom span { min-width: 34px; text-align: center; font-size: 10.5px; color: var(--nv-secondary-text); font-variant-numeric: tabular-nums; }
.nv-graphview-clear { position: absolute; right: 12px; bottom: 10px; z-index: 4; height: 24px; padding: 0 9px;
  border: 1px solid rgba(14,159,110,.35); border-radius: 999px; background: rgba(255,255,255,.94); color: var(--nv-accent-deep);
  font: inherit; font-size: 10.5px; cursor: pointer; }
.nv-graphview-node.is-compact { display: flex; flex-direction: row; align-items: center; justify-content: flex-start; gap: 5px;
  width: auto; min-width: 46px; max-width: 88px; padding: 4px 8px 4px 5px; border-radius: 999px; }
.nv-graphview-node.is-compact .nv-graphview-mono { width: 20px; height: 20px; flex: none; font-size: 10px; }
.nv-graphview-node.is-compact b { margin-top: 0; font-size: 11px; font-weight: 500; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.nv-graphview-node.is-dim { opacity: .18; }
.nv-graphview-node.is-focus { border-color: var(--nv-accent); box-shadow: 0 0 0 4px rgba(14,159,110,.12), 0 8px 20px rgba(32,36,31,.1); }
.nv-graphview-edge { fill: none; stroke: #cfd3ca; stroke-width: 1.2; }
.nv-graphview-arrowshape { fill: #b9c0b6; }
.nv-graphview-edge.is-hot { stroke: var(--nv-accent); stroke-width: 2.2; }
.nv-graphview-label { position: absolute; pointer-events: none; transform: translate(-50%, -50%); padding: 2px 8px; border-radius: 999px;
  border: 1px solid #e4e2da; background: var(--nv-surface); color: var(--nv-secondary-text); font-size: 10.5px; }
.nv-graphview-label.is-hot { color: var(--nv-accent-deep); border-color: rgba(14,159,110,.4); }
.nv-graphview-node { position: absolute; transform: translate(-50%, -50%); width: 78px; z-index: 2;
  display: flex; flex-direction: column; align-items: center; padding: 9px 7px 8px; border: 1px solid #e3e1d9;
  border-radius: 12px; background: rgba(255,255,255,.97); box-shadow: 0 6px 16px rgba(32,36,31,.07);
  font: inherit; cursor: pointer; }
.nv-graphview-node:hover { border-color: var(--nv-accent); box-shadow: 0 0 0 4px rgba(14,159,110,.08), 0 8px 20px rgba(32,36,31,.1); }
.nv-graphview-node.is-self { border-color: rgba(14,159,110,.45); }
.nv-graphview-hint { position: absolute; left: 14px; right: 140px; bottom: 10px; font-size: 10.5px; line-height: 1.5; color: var(--faint); }
.nv-graphview-center { width: 100px; cursor: default; border-color: rgba(14,159,110,.4); }
.nv-graphview-mono { width: 28px; height: 28px; border-radius: 50%; display: flex; align-items: center; justify-content: center;
  background: var(--nv-accent-soft); color: var(--nv-accent-deep); font-family: var(--nv-serif, "Songti SC", serif); font-size: 15px; }
.nv-graphview-node b { margin-top: 6px; font-size: 12px; font-weight: 600; }
.nv-graphview-node small { margin-top: 2px; font-size: 10px; color: var(--nv-secondary-text); }
.nv-graphview-ghost { position: absolute; inset: 0; display: flex; align-items: center; justify-content: center; gap: 30px; pointer-events: none; }
.nv-graphview-ghostnode { display: flex; flex-direction: column; align-items: center; gap: 8px; color: var(--nv-secondary-text); font-size: 12px; }
.nv-graphview-ghostnode i { display: grid; place-items: center; width: 58px; height: 58px; border-radius: 50%;
  background: #eceeeb; color: #a5aaa5; font: 600 22px/1 var(--nv-serif, "Songti SC", serif); }
.nv-graphview-ghostnode b { font-weight: 500; }
.nv-graphview-ghostline { width: 86px; border-top: 1px dashed #cfd3ca; }
.nv-graphview-ghostadd { display: grid; place-items: center; width: 72px; height: 72px; border: 1px dashed #cfd3ca;
  border-radius: 50%; color: var(--nv-accent-deep); font-size: 22px; background: rgba(255,255,255,.4); }
.nv-graphview-quick { display: flex; align-items: center; gap: 8px; }
.nv-graphview-quick select, .nv-graphview-quick input { height: 40px; min-width: 0; border: 1px solid var(--nv-divider);
  border-radius: 999px; background: var(--nv-surface); color: var(--nv-primary-text); font: inherit; font-size: 13px; outline: none; }
.nv-graphview-quick select { flex: 0 1 150px; padding: 0 10px; }
.nv-graphview-quick input { flex: 1 1 180px; padding: 0 12px; }
.nv-graphview-quick { gap: 7px; }
.nv-graphview-quick select:focus, .nv-graphview-quick input:focus { border-color: var(--nv-accent); }
.nv-graphview-quick > span { color: var(--faint); font-size: 12px; }
.nv-graphview-quicksave { flex: none; height: 40px; padding: 0 14px; border: 0; border-radius: 999px;
  background: var(--nv-accent); color: #fff; font: inherit; font-size: 13px; font-weight: 500; cursor: pointer; }
.nv-graphview-quicksave:disabled { opacity: .4; cursor: default; }
.nv-tldiary { padding: 2px 0 18px; }
.nv-tldiary-head { display: flex; align-items: center; justify-content: space-between; gap: 12px; margin-bottom: 20px;
  font-size: 12px; color: var(--nv-secondary-text); }
.nv-tldiary-add { min-height: 36px; padding: 0 13px; border: 1px solid var(--nv-divider); border-radius: 9px;
  background: var(--nv-surface); color: var(--nv-primary-text); font: inherit; font-size: 12px; cursor: pointer; }
.nv-tldiary-add:hover { border-color: var(--nv-accent); color: var(--nv-accent-deep); }
.nv-tldiary-list { position: relative; padding-left: 110px; }
.nv-tldiary-list::before { content: ''; position: absolute; left: 88px; top: 4px; bottom: 4px; width: 1px;
  background: linear-gradient(transparent, #d8c9ac 6%, #d8c9ac 94%, transparent); }
.nv-tldiary-entry { position: relative; padding-bottom: 26px; }
.nv-tldiary-entry::before { content: ''; position: absolute; left: -27px; top: 7px; width: 9px; height: 9px;
  border-radius: 50%; background: var(--nv-accent); border: 3px solid var(--nv-surface); box-shadow: 0 0 0 1px rgba(14,159,110,.35); }
.nv-tldiary-date { position: absolute; left: -110px; top: 0; width: 80px; text-align: right; }
.nv-tldiary-date b { display: block; font-family: var(--nv-serif, "Songti SC", serif); font-size: 18px; font-weight: 600; color: var(--nv-primary-text); }
.nv-tldiary-first { padding-bottom: 14px; }
.nv-tldiary-first .nv-tldiary-body { display: flex; flex-direction: column; gap: 9px; }
.nv-tldiary-firsthead { display: flex; align-items: center; gap: 7px; min-width: 0; }
.nv-tldiary-firsthead > span { flex: none; color: var(--nv-secondary-text); font-size: 12px; }
.nv-tldiary-firstage { width: 58px; height: 30px; border: 0; border-bottom: 1px solid var(--nv-divider);
  background: transparent; color: var(--nv-primary-text); font: 600 18px/1 var(--nv-serif, "Songti SC", serif); text-align: right; outline: none; }
.nv-tldiary-firstage:focus { border-color: var(--nv-accent); }
.nv-tldiary-firsttitle { flex: 1; min-width: 0; height: 34px; border: 0; border-bottom: 1px solid var(--nv-divider); background: transparent;
  color: var(--nv-primary-text); font: 600 18px/1.4 var(--nv-serif, "Songti SC", serif); outline: none; }
.nv-tldiary-firsttitle:focus { border-color: var(--nv-accent); }
.nv-tldiary-first textarea { width: 100%; box-sizing: border-box; border: 1px solid var(--nv-divider); border-radius: 8px;
  padding: 9px 10px; background: transparent; color: var(--nv-primary-text); font: inherit; font-size: 14px; line-height: 1.7; outline: none; resize: vertical; }
.nv-tldiary-first textarea:focus { border-color: var(--nv-accent); }
.nv-tldiary-firstlinks { display: flex; align-items: flex-end; gap: 10px; flex-wrap: wrap; }
.nv-tldiary-firstlinks label { display: flex; flex-direction: column; gap: 4px; min-width: 160px; }
.nv-tldiary-firstlinks label span { color: var(--nv-secondary-text); font-size: 11px; }
.nv-tldiary-firstlinks select { height: 30px; border: 0; border-bottom: 1px solid var(--nv-divider);
  background: transparent; color: var(--nv-primary-text); font: inherit; font-size: 13px; outline: none; }
.nv-tldiary-firstlinks select:focus { border-color: var(--nv-accent); }
.nv-tldiary-firstlinks > button { height: 30px; padding: 0 10px; border: 0; background: none;
  color: var(--nv-accent-deep); font: inherit; font-size: 12px; cursor: pointer; }
.nv-tldiary-firstsave { align-self: flex-end; height: 32px; padding: 0 16px; border: 0; border-radius: 999px;
  background: var(--nv-accent); color: #fff; font: inherit; font-size: 12px; cursor: pointer; }
.nv-tldiary-firstsave:disabled { opacity: .4; cursor: default; }
.nv-tldiary-body h3 { margin: 0 0 6px; font-family: var(--nv-serif, "Songti SC", serif); font-size: 18px; font-weight: 600; outline: none; }
.nv-tl-first { display: grid; grid-template-columns: 120px minmax(0, 1fr) 190px; gap: 12px 16px; align-items: end; margin-top: 16px;
  padding: 14px 0 2px; border-top: 1px solid var(--nv-divider); }
.nv-tl-first label { display: flex; flex-direction: column; gap: 6px; min-width: 0; }
.nv-tl-first label > span { font-size: 12px; color: var(--nv-secondary-text); }
.nv-tl-first input, .nv-tl-first select, .nv-tl-first textarea { width: 100%; box-sizing: border-box; border: 0; border-bottom: 1px solid var(--nv-divider);
  border-radius: 0; background: transparent; color: var(--nv-primary-text); font: inherit; font-size: 14px; outline: none; }
.nv-tl-first textarea { border: 1px solid var(--nv-divider); border-radius: 8px; padding: 9px 10px; resize: vertical; }
.nv-tl-first input:focus, .nv-tl-first select:focus, .nv-tl-first textarea:focus { border-color: var(--nv-accent); }
.nv-tl-firstbody { grid-column: 1 / 3; }
.nv-tl-firstsave { grid-column: 3; align-self: end; justify-self: end; height: 36px; padding: 0 18px; border: 0; border-radius: 999px;
  background: var(--nv-accent); color: #fff; font: inherit; font-size: 13px; font-weight: 500; cursor: pointer; }
.nv-tl-firstsave:disabled { opacity: .4; cursor: default; }
@container (max-width: 560px) {
.nv-tl-first { grid-template-columns: 1fr; }
.nv-tl-firstbody, .nv-tl-firstsave { grid-column: 1; }
.nv-tl-firstsave { justify-self: start; }
}
.nv-tldiary-body p { margin: 0; font-size: 14px; line-height: 1.95; color: #4d534c; outline: none; white-space: pre-wrap; }
.nv-tldiary-body h3:focus, .nv-tldiary-body p:focus { background: #f7f8f7; border-radius: 4px; }
.nv-tldiary-chips { display: flex; flex-wrap: wrap; gap: 5px; margin-top: 8px; }
.nv-tldiary-empty { padding: 30px 0; text-align: center; font-size: 13px; color: var(--nv-secondary-text); }
.nv-ov-collpreview { display: flex; flex-direction: column; gap: 10px; width: 100%; }
.nv-ov-rows { display: flex; flex-direction: column; gap: 10px; }
.nv-ov-prow { display: flex; gap: 16px; font-size: 15px; line-height: 23px; }
.nv-ov-plabel { flex: none; width: 64px; font-size: 14px; color: var(--nv-secondary-text); }
.nv-ov-pvalue { flex: 1; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; color: var(--nv-primary-text); }
.nv-ov-itemrow { display: flex; align-items: center; justify-content: space-between; gap: 12px; font-size: 15px; line-height: 23px; }
.nv-ov-itemname { font-weight: 500; color: var(--nv-primary-text); }
.nv-ov-itemmeta { min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;
  font-size: 14px; color: var(--nv-secondary-text); }
.nv-ov-pchips { display: flex; gap: 6px; flex-wrap: wrap; }
.nv-ov-pchips .nv-coll-chip, .nv-ov-itemrow .nv-coll-chip { font-size: 13px; padding: 3px 11px; }
.nv-ov-thumbs { display: flex; gap: 10px; }
.nv-ov-thumbs img { width: 74px; height: 100px; object-fit: cover; border-radius: 8px; }
.nv-coll-table select.nv-coll-ref { border-color: transparent; background: transparent; padding: 4px 6px; font-size: 16px; }
.nv-coll-table select.nv-coll-ref:hover, .nv-coll-table select.nv-coll-ref:focus { border-color: var(--nv-divider); background: var(--nv-surface); }
table.nv-coll-table { width: 100%; border-collapse: collapse; font-size: 16px; }
.nv-coll-table th { height: 48px; text-align: left; font-weight: 500; font-size: 15px; color: var(--nv-secondary-text);
  padding: 0 14px; border-bottom: 1px solid var(--nv-divider); }
.nv-coll-table td { height: 58px; padding: 8px 14px; border-bottom: 1px solid #f0f0f0; vertical-align: middle; font-size: 16px; }
.nv-coll-table .nv-coll-chip { font-size: 14px; line-height: 22px; padding: 4px 14px; }
.nv-coll-source { display: inline-flex; align-items: center; gap: 4px; margin: 0 0 12px; padding: 3px 9px;
  border: 1px solid rgba(14,159,110,.22); border-radius: 999px; background: rgba(244,250,247,.9);
  color: var(--nv-accent-deep); font-size: 11px; }
.nv-coll-cell { display: block; width: 100%; margin: -3px -4px; padding: 3px 4px; border: 0; border-radius: 5px;
  background: none; color: inherit; font: inherit; text-align: left; cursor: text; }
.nv-coll-cell:hover { background: #f6f7f6; }
.nv-coll-cell.is-ph { color: var(--nv-secondary-text); }
.nv-coll-cellinput { width: 100%; box-sizing: border-box; border: 1px solid var(--nv-accent); border-radius: 6px;
  padding: 3px 6px; background: var(--nv-surface); color: var(--nv-primary-text); font: inherit; outline: none; }
.nv-coll-cellarea { resize: vertical; min-height: 44px; }
.nv-coll-nameline { display: flex; align-items: center; gap: 6px; min-width: 0; }
.nv-coll-cellname { font-weight: 500; }
.nv-coll-nameinput { flex: 1; min-width: 0; }
.nv-coll-rowopen { flex: none; width: 24px; height: 24px; border: 1px solid transparent; border-radius: 6px; background: none;
  color: var(--nv-secondary-text); font: inherit; font-size: 16px; line-height: 1; cursor: pointer; }
.nv-coll-rowopen:hover { border-color: var(--nv-divider); color: var(--nv-accent-deep); }
.nv-coll-cellref { width: 100%; }
.nv-coll-formquote .nv-coll-cell { font: inherit; line-height: inherit; color: inherit; }
.nv-coll-draftrow td { padding: 10px 0; }
.nv-coll-draft { display: flex; align-items: center; gap: 8px; }
.nv-coll-draft input { flex: 1; min-width: 0; height: 36px; border: 1px solid var(--nv-accent); border-radius: 8px;
  padding: 0 10px; font: inherit; font-size: 13px; color: var(--nv-primary-text); outline: none; background: var(--nv-surface); }
.nv-coll-draft button { height: 32px; padding: 0 11px; border: 1px solid var(--nv-divider); border-radius: 8px;
  background: var(--nv-surface); color: var(--nv-secondary-text); font: inherit; font-size: 12px; cursor: pointer; }
.nv-coll-draft .nv-coll-draftsave { border-color: var(--nv-accent); background: var(--nv-accent); color: #fff; }
.nv-coll-draft button:hover { border-color: var(--nv-accent); color: var(--nv-accent-deep); }
.nv-coll-draft .nv-coll-draftsave:hover { background: var(--nv-accent-deep); color: #fff; }
@container (max-width: 560px) {
table.nv-coll-table { display: block; font-size: 14px; }
.nv-coll-table thead { display: none; }
.nv-coll-table tbody { display: block; }
.nv-coll-table tbody tr { display: block; padding: 14px 0 12px; border-bottom: 1px solid #f0f0f0; }
.nv-coll-table td { display: inline; height: auto; padding: 0; border: 0; vertical-align: baseline;
    font-size: 12px; color: var(--nv-secondary-text); }
.nv-coll-table td.nv-coll-tdname { display: block; margin-bottom: 6px; }
.nv-coll-table td.nv-coll-tdname .nv-coll-openitem { font-size: 15px; line-height: 1.65; color: var(--nv-primary-text); }
.nv-coll-table td[data-label] { display: inline-flex; align-items: baseline; gap: 3px; margin-right: 12px; white-space: nowrap; vertical-align: baseline; }
.nv-coll-table td[data-label] .nv-coll-cell { display: inline; width: auto; margin: 0; padding: 0; }
.nv-coll-table td[data-label] .nv-coll-cell:hover { background: none; text-decoration: underline; }
.nv-coll-table td[data-label] .nv-coll-cellinput { width: 8em; }
.nv-coll-table td[data-label] .nv-coll-chips { display: inline-flex; }
.nv-coll-table td[data-label] .nv-coll-cellref { width: auto; max-width: 10em; }
.nv-coll-table td[data-label]::before { content: attr(data-label) ' '; color: var(--faint); font-size: 10.5px; }
.nv-coll-table .nv-coll-draftrow td { display: block; white-space: normal; }
.nv-coll-table .nv-coll-draftrow { display: block; }
.nv-coll-table td.nv-coll-tdsum { display: block; margin-top: 6px; white-space: normal; }
.nv-coll-table .nv-coll-chip { font-size: 11px; line-height: 18px; padding: 2px 8px; }
.nv-coll-table select.nv-coll-ref { font-size: 12px; padding: 2px 4px; }
.nv-tlp-bar .nv-wg-add { min-height: 32px; padding: 0 9px; font-size: 11px; }
.nv-tlp-bar .nv-tlp-cal { height: 28px; }
}
.nv-coll-tdname { font-weight: 600; }
.nv-coll-tdsum { color: var(--nv-secondary-text); }
.nv-coll-scroll { position: relative; padding-top: 8px; }
.nv-coll-axis { position: relative; height: 22px; border-bottom: 1px solid var(--nv-divider); margin-bottom: 8px; }
.nv-coll-tick { position: absolute; bottom: -1px; transform: translateX(-50%); }
.nv-coll-tick::after { content: ''; display: block; width: 1px; height: 6px; background: var(--nv-secondary-text); margin: 0 auto; }
.nv-coll-ticklab { display: block; margin-bottom: 2px; font-size: 11px; color: var(--nv-secondary-text); }
.nv-coll-hang { position: relative; min-height: 110px; }
.nv-coll-hangcard { position: absolute; top: 9px; transform: translateX(-50%); width: 128px; border: 1px solid var(--nv-divider); border-radius: 10px; background: var(--nv-surface); padding: 6px; font-size: 11.5px; cursor: pointer; text-align: left; }
.nv-coll-hangcard::before { content: ''; position: absolute; top: -9px; left: 50%; width: 1px; height: 9px; background: var(--nv-divider); }
.nv-coll-hangimg { display: block; width: 100%; aspect-ratio: 16/10; object-fit: cover; border-radius: 6px; margin-bottom: 5px; }
.nv-coll-hangname { font-weight: 600; }
.nv-coll-curve { width: 100%; height: 44px; margin-top: 14px; }
.nv-coll-curvefill { fill: var(--nv-accent-soft); }
.nv-coll-curveline { fill: none; stroke: var(--nv-accent); stroke-width: 1.5; }
.nv-coll-curvelab { font-size: 11px; color: var(--nv-secondary-text); }
.nv-coll-unplaced { display: flex; flex-wrap: wrap; gap: 6px; align-items: center; margin-top: 12px; }
.nv-coll-unplacedlab { font-size: 11px; color: var(--nv-secondary-text); }
.nv-coll-minirow { border: 1px solid var(--nv-divider); border-radius: 999px; padding: 3px 10px; font-size: 11.5px; background: var(--nv-surface); cursor: pointer; }
.nv-coll-detail { margin-top: 14px; border: 1px solid var(--nv-divider); border-radius: 12px; padding: 14px; background: var(--nv-surface); }
.nv-coll-detailclose { flex: none; width: 28px; height: 28px; border: 1px solid var(--nv-divider); border-radius: 8px;
  background: var(--nv-surface); color: var(--nv-primary-text); font: inherit; font-size: 16px; line-height: 1;
  display: inline-flex; align-items: center; justify-content: center; cursor: pointer; }
.nv-coll-detailclose:hover { border-color: var(--nv-accent); color: var(--nv-accent-deep); }
.nv-coll-detailhead { display: flex; align-items: center; justify-content: space-between; }
.nv-coll-detailname { margin: 0; font-size: 15px; cursor: text; }
.nv-coll-detailimg { width: 100%; max-height: 220px; object-fit: cover; border-radius: 10px; margin: 10px 0; }
.nv-coll-detailgrid { display: grid; grid-template-columns: 1fr 1fr; gap: 10px 14px; margin-top: 10px; }
.nv-coll-field { display: flex; flex-direction: column; gap: 4px; }
.nv-coll-fieldname { font-size: 11.5px; color: var(--nv-secondary-text); }
.nv-quote-pop { position: fixed; z-index: 60; transform: translate(-50%, calc(-100% - 8px)); padding: 5px 12px; border-radius: 999px; border: 1px solid var(--nv-divider); background: var(--nv-surface); color: var(--nv-accent); font-size: 12px; font-weight: 600; cursor: pointer; box-shadow: 0 4px 14px rgba(0,0,0,.10); white-space: nowrap; }
.nv-quote-pop:hover { border-color: var(--nv-accent); }
.nv-msgact { display: inline-flex; align-items: center; justify-content: center; width: 20px; height: 20px; padding: 0; border: 0; border-radius: 4px; background: transparent; color: var(--nv-secondary-text); cursor: pointer; }
.nv-msgact:hover { color: var(--nv-accent-deep); background: var(--nv-hover); }
.nv-rewind-editor { box-sizing: border-box; display: flex; flex-direction: column; gap: 6px; width: calc(100% - var(--dsh-composer-side-clearance) - var(--dsh-composer-side-clearance)); max-width: var(--dsh-composer-card-max-width); margin: 0 auto; padding: 10px 14px 12px; border: 0; --dsw-elevation-stroke-color: var(--dsw-alias-border-l2); border-radius: var(--dsw-radius-panel); background: var(--dsw-specific-input-major); box-shadow: var(--dsw-elevation-soft); color: var(--nv-primary-text); font-size: var(--dsh-content-font-size, 14px); line-height: calc(24px + var(--dsh-content-font-delta, 0px)); }
.nv-rewind-head { color: var(--dsw-alias-label-secondary); font-size: 12px; line-height: 18px; }
.nv-rewind-input { width: 100%; min-height: 56px; max-height: 180px; padding: 0; border: 0; background: transparent; color: inherit; font: inherit; line-height: inherit; resize: none; overflow-y: auto; outline: none; }
.nv-rewind-input::placeholder { color: var(--dsw-alias-label-tertiary); }
.nv-rewind-actions { display: flex; justify-content: flex-end; gap: 8px; margin-top: 2px; }
.nv-rewind-actions button { height: 30px; padding: 0 14px; border: 1px solid var(--nv-divider); border-radius: 8px; background: transparent; color: var(--nv-secondary-text); font: inherit; font-size: 12px; cursor: pointer; }
.nv-rewind-actions button:hover:not(:disabled) { color: var(--nv-primary-text); background: var(--nv-hover); }
.nv-rewind-actions .nv-rewind-send { border-color: var(--nv-accent); background: var(--nv-accent); color: #fff; }
.nv-rewind-actions .nv-rewind-send:hover:not(:disabled) { border-color: var(--nv-accent-deep); background: var(--nv-accent-deep); color: #fff; }
.nv-rewind-actions .nv-rewind-send:disabled { opacity: .4; cursor: default; }

/* ---------- 浮窗（撕下来的页签=前台工作面） + conv 页体 ---------- */
.nv-float { position: fixed; z-index: 70; display: flex; flex-direction: column; background: var(--nv-surface); border: 1px solid var(--nv-divider); border-radius: 10px; box-shadow: 0 12px 40px rgba(23,32,51,.18); overflow: hidden; }
.nv-float-head { display: flex; align-items: center; gap: 6px; padding: 0 6px 0 12px; height: 32px; flex: none; cursor: grab; user-select: none; border-bottom: 1px solid var(--nv-divider); background: var(--nv-canvas); }
.nv-float-head:active { cursor: grabbing; }
.nv-float-title { flex: 1; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; font-size: 12px; font-weight: 600; color: var(--nv-primary-text); }
.nv-float-x { display: inline-flex; align-items: center; justify-content: center; width: 22px; height: 22px; padding: 0; border: 0; border-radius: 5px; background: transparent; color: var(--nv-secondary-text); font-size: 15px; cursor: pointer; }
.nv-float-x:hover { background: var(--nv-hover); color: var(--nv-primary-text); }
.nv-float-body { flex: 1; min-height: 0; display: flex; flex-direction: column; }
.nv-float-body > * { flex: 1; min-height: 0; }
.nv-float-size { position: absolute; z-index: 2; }
.nv-float-size-e { top: 0; right: -3px; width: 7px; height: 100%; cursor: ew-resize; }
.nv-float-size-s { bottom: -3px; left: 0; width: 100%; height: 7px; cursor: ns-resize; }
.nv-float-size-se { bottom: -3px; right: -3px; width: 14px; height: 14px; cursor: nwse-resize; }
/* 浮窗拖到页签条上的绿色归位特效。 */
.nv-canvas-strip[data-floatdrop] { background: var(--nv-accent-soft); box-shadow: inset 0 0 0 2px var(--nv-accent); border-radius: 8px 8px 0 0; }

.nv-conv { display: flex; flex-direction: column; height: 100%; min-height: 0; background: var(--nv-surface); }
.nv-conv-body { flex: 1; min-height: 0; overflow-y: auto; padding: 12px 12px 8px; display: flex; flex-direction: column; gap: 8px; }
.nv-conv-empty { margin: auto; padding: 18px 14px; color: var(--nv-secondary-text); font-size: 12px; text-align: center; }
.nv-conv-msg { max-width: 88%; padding: 8px 11px; border-radius: 10px; font-size: 12.5px; line-height: 1.6; }
.nv-conv-msg.user { align-self: flex-end; background: var(--nv-accent-soft); color: var(--nv-primary-text); white-space: pre-wrap; word-break: break-word; }
.nv-conv-msg.assistant { align-self: flex-start; background: var(--nv-canvas); color: var(--nv-primary-text); }
.nv-conv-foot { display: flex; gap: 8px; padding: 8px 10px 10px; border-top: 1px solid var(--nv-divider); flex: none; }
.nv-conv-input { flex: 1; min-width: 0; padding: 7px 10px; border: 1px solid var(--nv-divider); border-radius: 8px; background: var(--nv-canvas); color: var(--nv-primary-text); font-size: 12.5px; outline: none; }
.nv-conv-input:focus { border-color: var(--nv-accent); }
.nv-conv-send { padding: 7px 14px; border: 0; border-radius: 8px; background: var(--nv-accent); color: #fff; font-size: 12.5px; font-weight: 600; cursor: pointer; }
.nv-conv-send:disabled { opacity: .5; cursor: default; }

/* ===== 选中态唯一规则 =====
   凡带"当前项"钩子的控件——ARIA 选中属性（aria-current/aria-selected/
   aria-checked/aria-pressed）、data-active/data-current/data-on、上游菜单
   selectedFill、以及我们自己的 -on 类——文字+图标一律走 --nv-select。
   color 用 !important：按压期间不许被各自组件刷回灰字。
   background:none 只限非悬停：悬停/按压让各自的灰底照常生效，松手即回。
   换选中色改 --nv-select 一行；上游以后新出的选中态靠 ARIA 钩子自动命中。 */
[aria-current]:not([aria-current='false']),
[aria-selected='true'],
[aria-checked='true'],
[aria-pressed='true'],
[data-active='true'],
[data-current='true'],
[data-selected='true'],
[data-on],
[class*='selectedFill'],
.nv-canvas-tab-on,
.nv-sim-size-on,
.nv-seg-on,
.nv-work-ver-on,
.nv-tlp-calview-on,
.nv-tree-eye-on,
.nv-modelrow-on,
.nv-create-starter-on .nv-create-starter-icon {
  color: var(--nv-select) !important;
}
[aria-current]:not([aria-current='false']):not(:hover),
[aria-selected='true']:not(:hover),
[aria-checked='true']:not(:hover),
[aria-pressed='true']:not(:hover),
[data-active='true']:not(:hover),
[data-current='true']:not(:hover),
[data-selected='true']:not(:hover),
[data-on]:not(:hover),
[class*='selectedFill']:not(:hover),
.nv-canvas-tab-on:not(:hover),
.nv-sim-size-on:not(:hover),
.nv-seg-on:not(:hover),
.nv-work-ver-on:not(:hover),
.nv-tlp-calview-on:not(:hover),
.nv-tree-eye-on:not(:hover),
.nv-modelrow-on:not(:hover) {
  background: none;
}
/* 自带色的行内图标跟文字一起转绿（菜单 itemIcon、树行 glyph）。 */
.nv-tree-newmenu [class*='selectedFill'] [class*='itemIcon'],
.nv-tree-row[data-current='true'] .nv-tree-glyph,
.nv-tree-row[data-current='true'] .nv-tree-cardicon { color: var(--nv-select); }
/* 行级 color !important 只染继承者；自带显式色的标题（如上游工作区列表
   归档行标题的 caption 灰）要按后代点名，才跟上行本身的当前项绿。 */
[aria-selected='true'] [class*='title'],
[aria-current]:not([aria-current='false']) [class*='title'] { color: var(--nv-select) !important; }


/* IDE 排布（导航收轨 + unitSide left）：中列就是副对话。
   - hero 态不再垂直居中：品牌/引导变小上置，输入卡自然贴到底部；
   - 输入卡宽度收窄、内边距压紧，符合副窗体量；
   - active 态沿用上游 sticky 贴底，这里只收宽度。 */
[data-unit-side='left'] [data-center-col] [data-conversation-region='chat'] {
  background: transparent;
}
[data-unit-side='left'] [data-center-col] [data-content-phase='hero'] [data-conversation-scroll] {
  justify-content: flex-start;
  padding-top: clamp(36px, 8vh, 84px);
}
[data-unit-side='left'] [data-center-col] [data-content-phase='hero'] [data-composer-seat] {
  position: sticky;
  bottom: 0;
  margin-top: auto;
}
[data-unit-side='left'] [data-center-col] [class*='composerHero'] {
  padding-bottom: 14px;
  gap: 6px;
}
[data-unit-side='left'] [data-center-col] [class*='headline'] {
  transform: scale(.72);
  transform-origin: center top;
  margin-bottom: 2px;
}
[data-unit-side='left'] [data-center-col] [data-composer-card] {
  border-radius: 14px;
}
/* 副对话卸妆（IDE 侧翼）：只留消息流与输入卡——品牌、标语、工作区行、点子卡退出。 */
[data-unit-side='left'] [data-center-col] [data-conversation-hero-shell],
[data-unit-side='left'] [data-center-col] [class*='heroWorkspaceRow'] { display: none; }

/* Fullscreen HTML game shell */
.nv-game-shell { position: fixed; inset: 0; z-index: 1200; display: flex; flex-direction: column; background: #11150f; color: #f4f6f1; }
.nv-game-shell-head { display: flex; align-items: center; gap: 8px; padding: 10px 14px; border-bottom: 1px solid rgba(255,255,255,.12); font-size: 12.5px; }
.nv-game-shell-head b { font-weight: 600; letter-spacing: .02em; }
.nv-game-shell-status { color: rgba(244,246,241,.62); font-size: 11.5px; }
.nv-game-shell-spacer { flex: 1; }
.nv-game-shell-head button { height: 30px; padding: 0 12px; border: 1px solid rgba(255,255,255,.18); border-radius: 999px;
  background: transparent; color: inherit; font: inherit; font-size: 12px; cursor: pointer; }
.nv-game-shell-head button:hover { border-color: rgba(255,255,255,.45); background: rgba(255,255,255,.06); }
.nv-game-shell-head .nv-game-shell-close { background: #f4f6f1; color: #11150f; border-color: #f4f6f1; }
.nv-game-shell-stage { position: relative; flex: 1; min-height: 0; display: flex; }
.nv-game-shell-stage > * { flex: 1; min-height: 0; }
.nv-game-shell-stage iframe { width: 100%; height: 100%; border: 0; }
.nv-game-shell .nv-isl-srcbtn { display: none; }
.nv-scene:fullscreen { padding: 16px; background: var(--nv-bg, #f6f4ef); }
.nv-scene:fullscreen .nv-scene-canvas { flex: 1; min-height: 0; height: auto; }.nv-htmlfile-diag { border: 1px solid var(--nv-divider); border-radius: 10px; background: var(--nv-surface); padding: 10px 12px; font-size: 11.5px; }
.nv-htmlfile-diaghead { display: flex; align-items: center; justify-content: space-between; margin-bottom: 6px; }
.nv-htmlfile-diaghead button { border: 0; background: none; color: var(--nv-secondary-text); font: inherit; font-size: 11px; cursor: pointer; }
.nv-htmlfile-diag p { margin: 0; color: var(--nv-secondary-text); }
.nv-htmlfile-diag > div:not(.nv-htmlfile-diaghead) { display: flex; gap: 8px; padding: 3px 0; border-top: 1px solid color-mix(in srgb, var(--nv-divider) 55%, transparent); font-family: ui-monospace, monospace; color: var(--nv-primary-text); }
.nv-htmlfile-diag > div[data-level="error"] { color: var(--nv-danger); }
.nv-htmlfile-diag > div[data-level="warn"] { color: #b7791f; }
.nv-htmlfile-diag span { flex: none; width: 38px; color: var(--nv-secondary-text); text-transform: uppercase; }

.nv-game-shell-stage.nv-game-covered { visibility: hidden; }
.nv-game-start { position: absolute; inset: 0; z-index: 5; display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 22px; padding: 32px; text-align: center; background: radial-gradient(circle at 50% 30%, rgba(52,211,153,.16), transparent 58%), #0b100d; color: #f4f6f1; }
.nv-game-start-cover { width: min(360px, 46vw); aspect-ratio: 16 / 9; display: grid; place-items: center; overflow: hidden; border-radius: 18px; border: 1px solid rgba(255,255,255,.14); background: rgba(255,255,255,.05); font-size: 52px; font-weight: 700; color: #9cf5cf; }
.nv-game-start-cover img { width: 100%; height: 100%; object-fit: cover; }
.nv-game-start-story { max-width: 560px; }
.nv-game-start-story small { color: #7fe6bd; letter-spacing: .18em; font-size: 10px; text-transform: uppercase; }
.nv-game-start-story h1 { margin: 8px 0 10px; font-size: 32px; letter-spacing: .02em; }
.nv-game-start-story p { margin: 0; color: rgba(244,246,241,.66); font-size: 13.5px; line-height: 1.75; }
.nv-game-start-actions { display: flex; align-items: center; gap: 10px; }
.nv-game-start-actions button { height: 38px; padding: 0 18px; border-radius: 999px; border: 1px solid rgba(255,255,255,.18); background: transparent; color: inherit; font: inherit; font-size: 13px; cursor: pointer; }
.nv-game-start-actions .nv-game-start-primary { background: #34D399; border-color: #34D399; color: #07100d; font-weight: 600; }
.nv-game-slots { position: absolute; top: 50px; right: 14px; z-index: 7; width: 330px; padding: 10px; border: 1px solid rgba(255,255,255,.16); border-radius: 12px; background: #141a16; box-shadow: 0 18px 48px rgba(0,0,0,.35); }
.nv-game-slot { display: grid; grid-template-columns: 1fr auto auto; align-items: center; gap: 8px; padding: 8px 6px; border-top: 1px solid rgba(255,255,255,.08); font-size: 11.5px; }
.nv-game-slot:first-child { border-top: 0; }
.nv-game-slot b { grid-column: 1 / -1; font-size: 12px; }
.nv-game-slot span { color: rgba(244,246,241,.55); }
.nv-game-slot button { height: 26px; padding: 0 9px; border-radius: 6px; border: 1px solid rgba(255,255,255,.18); background: transparent; color: inherit; font: inherit; font-size: 11px; cursor: pointer; }
.nv-game-slot button:disabled { opacity: .35; cursor: not-allowed; }
.nv-game-pause { position: absolute; inset: 0; z-index: 6; display: grid; place-items: center; background: rgba(5,10,8,.62); backdrop-filter: blur(8px); color: #f4f6f1; text-align: center; }
.nv-game-pause small { color: #7fe6bd; letter-spacing: .18em; text-transform: uppercase; }
.nv-game-pause h2 { margin: 8px 0 20px; font-size: 28px; }
.nv-game-pause button { height: 36px; margin: 0 5px; padding: 0 16px; border-radius: 999px; border: 1px solid rgba(255,255,255,.18); background: transparent; color: inherit; font: inherit; font-size: 12.5px; cursor: pointer; }
.nv-game-pause .nv-game-start-primary { background: #34D399; border-color: #34D399; color: #07100d; }
.nv-surface-launch { display: flex; flex-direction: column; align-items: stretch; gap: 14px; padding: 16px; border: 1px solid var(--nv-divider); border-radius: 16px; background: var(--nv-surface); }
.nv-surface-launch figure { margin: 0; width: 100%; aspect-ratio: 16 / 9; display: grid; place-items: center; overflow: hidden; border-radius: 12px; background: color-mix(in srgb, var(--nv-accent) 12%, var(--nv-surface)); color: var(--nv-accent-deep); font-size: 30px; font-weight: 700; }
.nv-surface-launch figure img { width: 100%; height: 100%; object-fit: cover; }
.nv-surface-story h3 { margin: 0 0 6px; font-size: 18px; }
.nv-surface-story p { margin: 0; color: var(--nv-secondary-text); font-size: 12.5px; line-height: 1.65; }
.nv-surface-launch > button { align-self: flex-start; height: 34px; padding: 0 16px; border: 0; border-radius: 999px; background: var(--nv-accent); color: #fff; font: inherit; font-size: 12.5px; cursor: pointer; }

.nv-coll-layout-rulebook { display: grid; grid-template-columns: 96px minmax(0, 1fr); gap: 14px; align-items: start; }
.nv-coll-layout-rulebook .nv-coll-rulebar { flex-direction: column; gap: 3px; margin: 0; position: sticky; top: 12px; }
.nv-coll-layout-rulebook .nv-coll-rulebar button { width: 100%; height: 30px; justify-content: flex-start; text-align: left; border: 0; border-radius: 7px; }
.nv-coll-layout-rulebook .nv-coll-rulebar button.is-on { border: 0; background: var(--nv-accent-soft); }
.nv-coll-layout-rulebook .nv-coll-main { min-width: 0; }
.nv-coll-rulebar { display: flex; flex-wrap: wrap; gap: 5px; margin: 0 0 12px; }
.nv-coll-rulebar button { height: 26px; padding: 0 10px; border: 1px solid var(--nv-divider); border-radius: 999px; background: transparent; color: var(--nv-secondary-text); font: inherit; font-size: 11.5px; cursor: pointer; }
.nv-coll-rulebar button.is-on { border-color: var(--nv-accent); background: color-mix(in srgb, var(--nv-accent) 14%, transparent); color: var(--nv-accent-deep); }
.nv-coll-optionaltoggle { margin: 4px 0 12px; border: 0; background: none; color: var(--nv-accent-deep); font: inherit; font-size: 11.5px; cursor: pointer; }
.nv-coll-fieldbar { display: flex; justify-content: flex-end; margin: -4px 0 8px; }
.nv-coll-fieldtoggle { border: 0; background: none; color: var(--nv-faint); font: inherit; font-size: 11px; cursor: pointer; }
.nv-coll-fieldtoggle:hover { color: var(--nv-accent-deep); }
.nv-coll-fieldspanel { display: flex; flex-direction: column; gap: 6px; margin: 0 0 12px; padding: 10px; border: 1px dashed var(--nv-divider); border-radius: 10px; }
.nv-coll-fieldrow { display: grid; grid-template-columns: 1fr 110px auto; gap: 6px; align-items: center; }
.nv-coll-fieldrow input, .nv-coll-fieldrow select { height: 28px; box-sizing: border-box; border: 1px solid var(--nv-divider); border-radius: 6px; background: var(--nv-surface); color: var(--nv-primary-text); font: inherit; font-size: 11.5px; }
.nv-coll-fieldacts { display: flex; gap: 3px; }
.nv-coll-fieldacts button { width: 26px; }
.nv-coll-fieldrow button { height: 28px; border: 1px solid var(--nv-divider); border-radius: 6px; background: transparent; color: var(--nv-secondary-text); font: inherit; cursor: pointer; }
.nv-coll-placebind { align-self: flex-start; margin-top: 8px; max-width: 100%; height: 26px; padding: 0 8px; border: 1px solid color-mix(in srgb, var(--nv-accent) 35%, var(--nv-divider)); border-radius: 999px; background: transparent; color: var(--nv-accent-deep); font: inherit; font-size: 11px; }
.nv-coll-detail .nv-coll-placelink { margin: 0 0 14px; }
.nv-coll-placelink { align-self: flex-start; margin-top: 8px; height: 26px; padding: 0 10px; border: 1px solid color-mix(in srgb, var(--nv-accent) 35%, var(--nv-divider)); border-radius: 999px; background: transparent; color: var(--nv-accent-deep); font: inherit; font-size: 11.5px; cursor: pointer; }
.nv-tldiary-chips button.nv-coll-chip { cursor: pointer; }
.nv-tld-links { display: flex; flex-wrap: wrap; gap: 5px; margin-top: 6px; }
.nv-tld-links button { height: 22px; padding: 0 8px; border: 1px solid var(--nv-divider); border-radius: 999px; background: transparent; color: var(--nv-secondary-text); font: inherit; font-size: 10.5px; cursor: pointer; }
.nv-tld-links button:hover { border-color: var(--nv-accent); color: var(--nv-accent-deep); }
.nv-coll-backlink { margin: 0 0 10px; }
.nv-coll-backlink button { border: 0; background: none; color: var(--nv-accent-deep); font: inherit; font-size: 11.5px; cursor: pointer; }
.nv-coll-link.is-missing { border-style: dashed; color: var(--nv-danger); }
.nv-coll-links { display: flex; flex-wrap: wrap; gap: 6px; margin: 0 0 12px; }
.nv-coll-link { height: 26px; padding: 0 10px; border: 1px solid var(--nv-divider); border-radius: 999px; background: transparent; color: var(--nv-secondary-text); font: inherit; font-size: 11.5px; cursor: pointer; }
.nv-coll-link:hover { border-color: var(--nv-accent); color: var(--nv-accent-deep); }
.nv-coll-detailsec { margin: 0 0 16px; }
.nv-coll-detailsec h4 { margin: 0 0 8px; font-size: 11px; letter-spacing: .12em; text-transform: uppercase; color: var(--nv-secondary-text); }
.nv-coll-layout-quoteWall .nv-coll-grid { grid-template-columns: repeat(2, minmax(0, 1fr)); }
.nv-coll-layout-quoteWall .nv-coll-card { min-height: 150px; padding: 18px 20px; background: linear-gradient(180deg, var(--nv-surface), color-mix(in srgb, var(--nv-accent) 4%, var(--nv-surface))); }
.nv-coll-layout-quoteWall .nv-coll-card::before { content: '“'; display: block; height: 22px; color: color-mix(in srgb, var(--nv-accent) 55%, transparent); font-size: 30px; line-height: 1; }
.nv-coll-layout-quoteWall .nv-coll-cardname { font-size: 17px; line-height: 1.65; font-weight: 500; }
.nv-coll-layout-skillSheet .nv-coll-grid { grid-template-columns: repeat(2, minmax(0, 1fr)); }
.nv-coll-layout-gallery .nv-coll-grid { grid-template-columns: repeat(3, minmax(0, 1fr)); }
.nv-coll-layout-rulebook .nv-coll-listrow { padding-block: 14px; }
.nv-coll-addtile-landscape { aspect-ratio: 16 / 9; min-height: 0; justify-content: center; }
.nv-coll-addtile-square { aspect-ratio: 1 / 1; min-height: 0; justify-content: center; }
.nv-coll-addtile-portrait { aspect-ratio: 3 / 4; min-height: 0; justify-content: center; }
.nv-coll-addtile-quoteWall, .nv-coll-addtile-rulebook { min-height: 160px; }
@media (max-width: 720px) {
  .nv-coll-layout-quoteWall .nv-coll-grid, .nv-coll-layout-skillSheet .nv-coll-grid { grid-template-columns: 1fr; }
  .nv-coll-layout-rulebook { grid-template-columns: 1fr; gap: 8px; }
  .nv-coll-layout-rulebook .nv-coll-rulebar { position: static; flex-direction: row; overflow-x: auto; }
  .nv-coll-layout-rulebook .nv-coll-rulebar button { width: auto; }
}

.nv-coll-listdraft { margin: 0 0 12px; }.nv-coll-drafts { display: block; }
.nv-coll-drafts .nv-draft-form { width: 210px; }
.nv-rule-drafts { display: block; min-width: 0; }
.nv-rule-drafts .nv-rule-draft { width: 100%; box-sizing: border-box; }
.nv-quote-drafts { display: block; min-width: 0; }
.nv-quote-drafts .nv-quote-draft { width: 100%; box-sizing: border-box; }

.nv-draftcard { position: relative; cursor: default; border-style: dashed !important; border-color: color-mix(in srgb, var(--nv-accent) 32%, var(--nv-divider)) !important; }
.nv-draft-media { display: grid; place-items: center; overflow: hidden; cursor: pointer; background: color-mix(in srgb, var(--nv-accent) 9%, var(--nv-surface)); color: var(--nv-accent-deep); font-size: 11px; }
.nv-draft-media input { display: none; }
.nv-draft-media img { width: 100%; height: 100%; object-fit: cover; }.nv-heraldry-emblem.nv-draft-media, .nv-bestiary-portrait.nv-draft-media, .nv-magazine-cover.nv-draft-media, .nv-armory-visual.nv-draft-media { font-size: 10px; }
.nv-heraldry-emblem.nv-draft-media span, .nv-bestiary-portrait.nv-draft-media span, .nv-magazine-cover.nv-draft-media span, .nv-armory-visual.nv-draft-media span { white-space: nowrap; }

.nv-draft-title { display: block; width: 100%; box-sizing: border-box; padding: 0 0 5px; border: 0; border-bottom: 1px solid var(--nv-divider); background: transparent; color: var(--nv-primary-text); font: inherit; font-size: 15px; font-weight: 600; outline: none; }
.nv-draft-title::placeholder { color: var(--nv-secondary-text); font-weight: 500; }
.nv-draft-input { min-width: 0; width: 100%; box-sizing: border-box; padding: 0 0 3px; border: 0; border-bottom: 1px solid var(--nv-divider); background: transparent; color: var(--nv-secondary-text); font: inherit; font-size: 12px; outline: none; }
.nv-draft-input:focus { border-bottom-color: var(--nv-accent); }
.nv-draft-input::placeholder { color: var(--nv-faint); }
.nv-draft-small { font-size: 11px; }
.nv-draft-num { color: var(--nv-accent-deep); font-size: 15px; text-align: right; }
.nv-draft-center { text-align: center; }
.nv-draft-kicker { color: var(--nv-accent-deep); font-size: 10px; letter-spacing: .12em; text-transform: uppercase; }
.nv-draft-note { display: block; width: 100%; box-sizing: border-box; min-height: 34px; padding: 6px 7px; border: 1px solid var(--nv-divider); border-radius: 8px; background: #FBFCFB; color: var(--nv-secondary-text); font: inherit; font-size: 11.5px; line-height: 1.55; resize: none; outline: none; }
.nv-draft-note-inline { margin-top: 8px; }
.nv-draft-cancel { position: absolute; top: 6px; right: 6px; z-index: 2; width: 24px; height: 24px; border: 0; border-radius: 999px; background: rgba(255,255,255,.86); color: var(--nv-secondary-text); font: inherit; font-size: 16px; line-height: 1; cursor: pointer; }
.nv-heraldry-card .nv-draft-title { margin-top: 7px; text-align: center; }
.nv-heraldry-card .nv-draft-input { text-align: center; }
.nv-heraldry-card .nv-draft-note { margin-top: 8px; text-align: center; }.nv-heraldry-card .nv-draft-title { text-align: center; }
.nv-draft-rows { display: flex; flex-direction: column; gap: 5px; margin-top: 9px; }
.nv-draft-row { display: flex; align-items: center; gap: 8px; min-width: 0; }
.nv-draft-row > span { width: 38px; flex: none; color: var(--nv-secondary-text); font-size: 10.5px; }
.nv-draft-row .nv-draft-input { flex: 1; text-align: left; }
.nv-draft-row .nv-draft-num { max-width: 54px; text-align: right; }
.nv-draft-noterow { display: flex; flex-direction: column; gap: 3px; margin-top: 8px; }
.nv-draft-noterow > span { color: var(--nv-secondary-text); font-size: 10.5px; }
.nv-draft-noterow .nv-draft-note { margin-top: 0; text-align: left; }

.nv-heraldry-stat .nv-draft-input { max-width: 52px; }
.nv-bestiary-card .nv-draft-title, .nv-magazine-card .nv-draft-title, .nv-armory-card .nv-draft-title, .nv-skill-card .nv-draft-title { font-size: 15px; }
.nv-bestiary-facts .nv-draft-input, .nv-skill-facts .nv-draft-input { width: auto; }
.nv-magazine-body .nv-draft-kicker { margin-bottom: 4px; }
.nv-skill-head .nv-draft-input { width: auto; max-width: 72px; text-align: right; }
.nv-quote-draft { padding: 18px 20px; border: 1px solid var(--nv-divider); border-radius: 14px; background: linear-gradient(180deg, var(--nv-surface), color-mix(in srgb, var(--nv-accent) 4%, var(--nv-surface))); }
.nv-draft-quote { display: block; width: 100%; box-sizing: border-box; min-height: 96px; padding: 0; border: 0; background: transparent; color: var(--nv-primary-text); font: inherit; font-size: 17px; line-height: 1.65; resize: none; outline: none; }
.nv-draft-quote::placeholder { color: var(--nv-secondary-text); }
.nv-draft-metarow { display: flex; flex-wrap: wrap; gap: 8px; margin-top: 8px; }
.nv-draft-metarow .nv-draft-input { flex: 1 1 60px; width: auto; }
.nv-rule-draft { padding: 14px 16px; border: 1px solid var(--nv-divider); border-radius: 12px; background: var(--nv-surface); }
.nv-rule-draft .nv-draft-title { font-size: 15px; }
.nv-draft-cover { aspect-ratio: 3 / 4; }
.nv-draft-body { padding: 11px 12px 13px; }
.nv-draft-form .nv-draft-title { padding-top: 10px; font-size: 18px; }
.nv-draft-inherited { display: flex; flex-direction: column; gap: 4px; margin-top: 10px; padding-top: 8px; border-top: 1px solid var(--nv-divider); }
.nv-draft-inherited span { display: flex; justify-content: space-between; gap: 8px; color: var(--nv-secondary-text); font-size: 10.5px; }
.nv-draft-inherited b { color: var(--nv-primary-text); font-weight: 500; }
.nv-draft-overrides { display: grid; grid-template-columns: 1fr 1fr; gap: 5px 10px; margin-top: 9px; padding-top: 8px; border-top: 1px solid var(--nv-divider); }

.nv-gallery { columns: 3 220px; column-gap: 12px; }
.nv-gallery.is-drag { outline: 2px dashed var(--nv-accent); outline-offset: 6px; border-radius: 14px; }
.nv-gallery-card { break-inside: avoid; margin: 0 0 12px; overflow: hidden; border: 1px solid var(--nv-divider); border-radius: 12px; background: var(--nv-surface); cursor: zoom-in; }
.nv-gallery-card img { display: block; width: 100%; height: auto; }
.nv-gallery-card figcaption { display: flex; flex-direction: column; gap: 3px; padding: 8px 10px 10px; }
.nv-gallery-card b { font-size: 12px; font-weight: 500; }
.nv-gallery-card span { color: var(--nv-secondary-text); font-size: 11px; line-height: 1.5; }
.nv-gallery-upload { display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 5px; width: 100%; min-height: 180px; aspect-ratio: 3 / 4; margin: 0 0 12px; border: 1px dashed var(--nv-divider); border-radius: 12px; background: transparent; color: var(--nv-secondary-text); font: inherit; cursor: pointer; }
.nv-gallery-upload span { font-size: 22px; color: var(--nv-accent); }
.nv-gallery-upload b { font-size: 12px; font-weight: 500; }
.nv-gallery-upload small { font-size: 10.5px; color: var(--nv-faint); }
.nv-gallery-upload:hover { border-color: var(--nv-accent); color: var(--nv-accent-deep); }
.nv-gallery-ghost { position: relative; display: block; break-inside: avoid; width: 100%; aspect-ratio: 3 / 4; margin: 0 0 12px;
  border-radius: 12px; background: #f7f8f6; }
.nv-gallery-ghost::after { content: '▧'; position: absolute; inset: 0; display: grid; place-items: center; color: #e1e4df; font-size: 22px; }
.nv-lightbox { position: fixed; inset: 0; z-index: 1200; display: grid; place-items: center; padding: 32px; background: rgba(8,12,10,.78); backdrop-filter: blur(10px); }
.nv-lightbox-inner { position: relative; display: flex; flex-direction: column; width: min(900px, 92vw); max-height: 90vh; background: var(--nv-surface); border-radius: 16px; overflow: hidden; box-shadow: 0 30px 90px rgba(0,0,0,.35); }
.nv-lightbox-img { display: block; width: 100%; height: auto; max-height: 72vh; object-fit: contain; background: #0b100d; }
.nv-lightbox-bar { display: flex; align-items: flex-end; justify-content: space-between; gap: 14px; padding: 12px 14px; }
.nv-lightbox-bar b { font-size: 13px; }
.nv-lightbox-bar p { margin: 4px 0 0; color: var(--nv-secondary-text); font-size: 11.5px; }
.nv-lightbox-actions { display: flex; gap: 4px; flex: none; }
.nv-lightbox-actions button { height: 28px; min-width: 28px; padding: 0 9px; border: 1px solid var(--nv-divider); border-radius: 6px; background: transparent; color: var(--nv-secondary-text); font: inherit; cursor: pointer; }
.nv-lightbox-close { position: absolute; top: 8px; right: 8px; z-index: 2; width: 30px; height: 30px; border: 0; border-radius: 999px; background: rgba(8,12,10,.5); color: #fff; font-size: 18px; cursor: pointer; }
@media (max-width: 720px) { .nv-gallery { columns: 2 140px; } }

.nv-read-add { display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 6px; min-height: 150px; border: 1px dashed var(--nv-divider); border-radius: 14px; background: transparent; color: var(--nv-secondary-text); font: inherit; cursor: pointer; }
.nv-read-add span { color: var(--nv-accent); font-size: 22px; }
.nv-read-add b { font-size: 12px; font-weight: 500; }
.nv-read-add:hover { border-color: var(--nv-accent); color: var(--nv-accent-deep); }
.nv-geo-banner { position: relative; display: flex; align-items: center; justify-content: space-between; gap: 12px; min-height: 92px; margin: 0 0 14px; padding: 0 16px; overflow: hidden; border: 1px solid #DFEAE2; border-radius: 14px; background: linear-gradient(135deg, #EDF6F0, #E5F1E9); }
.nv-geo-banner-grid { position: absolute; inset: 0; background-image: linear-gradient(rgba(80,125,99,.06) 1px, transparent 1px), linear-gradient(90deg, rgba(80,125,99,.06) 1px, transparent 1px); background-size: 28px 28px; mask-image: linear-gradient(to bottom, rgba(0,0,0,.75), rgba(0,0,0,.18)); pointer-events: none; }
.nv-geo-banner-info { position: relative; display: flex; align-items: center; gap: 10px; min-width: 0; }
.nv-geo-banner-icon { display: grid; place-items: center; width: 30px; height: 30px; flex: none; border-radius: 9px; background: rgba(255,255,255,.7); color: var(--nv-accent-deep); }
.nv-geo-banner-info > span:last-child { display: flex; flex-direction: column; gap: 3px; min-width: 0; }
.nv-geo-banner-info b { overflow: hidden; color: var(--nv-primary-text); font-size: 13px; font-weight: 600; text-overflow: ellipsis; white-space: nowrap; }
.nv-geo-banner-info small { color: var(--nv-secondary-text); font-size: 10.5px; }
.nv-geo-banner-open { position: relative; flex: none; height: 28px; padding: 0 10px; border: 1px solid rgba(14,159,110,.22); border-radius: 999px; background: rgba(255,255,255,.68); color: var(--nv-accent-deep); font: inherit; font-size: 11px; cursor: pointer; }
.nv-geo-banner-open:hover { background: var(--nv-surface); border-color: var(--nv-accent); }
.nv-atlas-grid .nv-read-add { aspect-ratio: 16 / 9; min-height: 0; }
.nv-heraldry-grid .nv-read-add { aspect-ratio: 1 / 1; min-height: 0; }
.nv-bestiary-grid .nv-read-add { aspect-ratio: 3 / 4; min-height: 0; }
.nv-magazine-grid .nv-read-add { aspect-ratio: 16 / 9; min-height: 0; }
.nv-armory-grid .nv-read-add { aspect-ratio: 1 / 1; min-height: 0; }
.nv-atlas-grid, .nv-heraldry-grid, .nv-bestiary-grid, .nv-armory-grid { display: grid; grid-template-columns: repeat(auto-fill, 210px); gap: 14px; justify-content: start; }
.nv-magazine-grid { display: grid; grid-template-columns: repeat(auto-fill, 250px); gap: 14px; justify-content: start; }
.nv-atlas-card, .nv-heraldry-card, .nv-bestiary-card, .nv-magazine-card, .nv-armory-card, .nv-skill-card { overflow: hidden; border: 1px solid var(--nv-divider); border-radius: 14px; background: var(--nv-surface); cursor: pointer; transition: border-color var(--nv-dur-micro) var(--nv-ease-out), transform var(--nv-dur-micro) var(--nv-ease-out); }
.nv-atlas-card { position: relative; }
.nv-atlas-edit { cursor: default; border-style: dashed; border-color: color-mix(in srgb, var(--nv-accent) 32%, var(--nv-divider)); }
.nv-atlas-edit-visual { cursor: pointer; }
.nv-atlas-edit-visual input { display: none; }
.nv-atlas-edit-visual span { font-size: 11px; }
.nv-atlas-edit-name { display: block; width: 100%; box-sizing: border-box; padding: 0; border: 0; background: transparent; color: var(--nv-primary-text); font: inherit; font-size: 15px; font-weight: 600; outline: none; }
.nv-atlas-edit-name::placeholder { color: var(--nv-secondary-text); font-weight: 500; }
.nv-atlas-edit-meta { gap: 3px; }
.nv-atlas-edit-meta label { display: flex; align-items: baseline; gap: 4px; }
.nv-atlas-edit-meta label > span { flex: none; color: var(--nv-secondary-text); font-size: 11px; }
.nv-atlas-edit-meta input { min-width: 0; flex: 1; padding: 0; border: 0; border-bottom: 1px solid transparent; background: transparent; color: var(--nv-primary-text); font: inherit; font-size: 11px; outline: none; }
.nv-atlas-edit-note { display: block; width: 100%; box-sizing: border-box; min-height: 34px; margin-top: 2px; padding: 0; border: 0; background: transparent; color: var(--nv-secondary-text); font: inherit; font-size: 11.5px; line-height: 1.55; resize: none; outline: none; }
.nv-atlas-edit-note::placeholder { color: var(--nv-faint); }
.nv-atlas-edit-name:focus, .nv-atlas-edit-meta input:focus, .nv-atlas-edit-note:focus { border-color: var(--nv-accent); }
.nv-atlas-edit-meta input:focus { border-bottom-color: var(--nv-accent); }
.nv-atlas-edit-cancel { position: absolute; top: 6px; right: 6px; z-index: 2; width: 24px; height: 24px; border: 0; border-radius: 999px; background: rgba(255,255,255,.86); color: var(--nv-secondary-text); font: inherit; font-size: 16px; line-height: 1; cursor: pointer; }
.nv-atlas-card:hover, .nv-heraldry-card:hover, .nv-bestiary-card:hover, .nv-magazine-card:hover, .nv-armory-card:hover, .nv-skill-card:hover { border-color: var(--nv-accent); }
.nv-atlas-visual, .nv-magazine-cover, .nv-armory-visual { display: grid; place-items: center; aspect-ratio: 16 / 9; overflow: hidden; background: color-mix(in srgb, var(--nv-accent) 10%, var(--nv-surface)); color: var(--nv-accent); font-size: 26px; }
.nv-atlas-visual img, .nv-magazine-cover img, .nv-armory-visual img { width: 100%; height: 100%; object-fit: cover; }
.nv-atlas-body { padding: 11px 12px 13px; }
.nv-atlas-body h3, .nv-heraldry-card h3, .nv-bestiary-body h3, .nv-magazine-body h3, .nv-armory-body h3 { margin: 0; font-size: 15px; }
.nv-atlas-meta { display: flex; flex-direction: column; gap: 3px; margin-top: 7px; color: var(--nv-secondary-text); font-size: 11px; }
.nv-atlas-body p, .nv-magazine-body p, .nv-armory-body p { margin: 8px 0 0; color: var(--nv-secondary-text); font-size: 11.5px; line-height: 1.55; }
.nv-heraldry-card { padding: 14px; }
.nv-heraldry-emblem { display: grid; place-items: center; width: 80px; height: 88px; margin: 0 auto 10px; clip-path: polygon(50% 0,100% 16%,100% 70%,50% 100%,0 70%,0 16%); background: color-mix(in srgb, var(--nv-accent) 14%, var(--nv-surface)); color: var(--nv-accent); font-size: 26px; overflow: hidden; }
.nv-heraldry-emblem img { width: 100%; height: 100%; object-fit: cover; }
.nv-heraldry-card h3 { text-align: center; }
.nv-heraldry-tags { display: flex; flex-wrap: wrap; justify-content: center; gap: 4px; margin-top: 7px; }
.nv-heraldry-tags span { padding: 2px 7px; border-radius: 999px; background: color-mix(in srgb, var(--nv-accent) 9%, transparent); color: var(--nv-secondary-text); font-size: 10.5px; }
.nv-heraldry-stat { display: flex; align-items: baseline; justify-content: space-between; margin-top: 10px; color: var(--nv-secondary-text); font-size: 11px; }
.nv-heraldry-stat b { color: var(--nv-accent-deep); font-size: 16px; }
.nv-heraldry-card small, .nv-armory-body small { display: block; margin-top: 7px; color: var(--nv-faint); font-size: 10.5px; }
.nv-bestiary-card { display: flex; flex-direction: column; }
.nv-bestiary-portrait { display: grid; place-items: center; aspect-ratio: 3 / 4; overflow: hidden; background: color-mix(in srgb, var(--nv-accent) 10%, var(--nv-surface)); color: var(--nv-accent); font-size: 26px; }
.nv-bestiary-portrait img { width: 100%; height: 100%; object-fit: cover; }
.nv-bestiary-body { padding: 11px 12px 13px; }
.nv-bestiary-facts { display: flex; flex-wrap: wrap; gap: 8px; margin-top: 7px; color: var(--nv-secondary-text); font-size: 11px; }
.nv-bestiary-facts span { display: flex; flex-direction: column; gap: 2px; }
.nv-bestiary-facts small { color: var(--nv-faint); font-size: 9.5px; }
.nv-bestiary-body p { margin: 8px 0 0; color: var(--nv-secondary-text); font-size: 11.5px; line-height: 1.5; }
.nv-magazine-body { padding: 11px 13px 14px; }
.nv-magazine-kicker { color: var(--nv-accent-deep); font-size: 10px; letter-spacing: .12em; text-transform: uppercase; }
.nv-magazine-body small { display: block; margin-top: 4px; color: var(--nv-faint); font-size: 10.5px; }
.nv-armory-card { display: grid; grid-template-columns: 96px 1fr; gap: 0; }
.nv-armory-visual { aspect-ratio: 1; height: 100%; }
.nv-armory-body { padding: 12px; }
.nv-armory-kind { display: inline-block; margin-top: 5px; padding: 2px 7px; border-radius: 999px; background: color-mix(in srgb, var(--nv-accent) 9%, transparent); color: var(--nv-secondary-text); font-size: 10.5px; }
.nv-skillsheet { display: grid; grid-template-columns: repeat(auto-fill, 230px); gap: 12px; justify-content: start; }
.nv-skill-card { padding: 14px; }
.nv-skill-head { display: flex; align-items: center; justify-content: space-between; gap: 8px; }
.nv-skill-head h3 { margin: 0; font-size: 15px; }
.nv-skill-head span { padding: 2px 7px; border-radius: 999px; background: color-mix(in srgb, var(--nv-accent) 12%, transparent); color: var(--nv-accent-deep); font-size: 10.5px; }
.nv-skill-card p { margin: 8px 0; color: var(--nv-secondary-text); font-size: 11.5px; line-height: 1.6; }
.nv-skill-facts { display: flex; gap: 10px; padding-top: 8px; border-top: 1px solid var(--nv-divider); color: var(--nv-secondary-text); font-size: 11px; }
.nv-skill-facts span { display: flex; flex-direction: column; gap: 2px; }
.nv-skill-facts small { color: var(--nv-faint); font-size: 9.5px; }
@media (max-width: 640px) { .nv-atlas-grid .nv-read-add { aspect-ratio: 16 / 9; min-height: 0; }
.nv-heraldry-grid .nv-read-add { aspect-ratio: 1 / 1; min-height: 0; }
.nv-bestiary-grid .nv-read-add { aspect-ratio: 3 / 4; min-height: 0; }
.nv-magazine-grid .nv-read-add { aspect-ratio: 16 / 9; min-height: 0; }
.nv-armory-grid .nv-read-add { aspect-ratio: 1 / 1; min-height: 0; }
.nv-atlas-grid, .nv-heraldry-grid, .nv-bestiary-grid, .nv-magazine-grid, .nv-armory-grid, .nv-skillsheet { grid-template-columns: 1fr; } .nv-armory-card { grid-template-columns: 80px 1fr; } }

/* ---------- responsive contract: page measure + container breakpoints ---------- */
/* 画布宽度即版心宽度；阅读页 720，合集页 1120。容器查询落在 page-inner 上。 */
.nv-page-inner { width: min(1120px, calc(100% - 40px)); container-type: inline-size; }
.nv-page-inner-wide { width: calc(100% - 40px); }
.nv-pagehead { flex-wrap: wrap; gap: 12px 24px; }
.nv-pagehead-title { font-size: clamp(24px, 4.6cqi, 32px); line-height: 1.2; }
.nv-pagehead-side { flex-wrap: wrap; }
@container (max-width: 520px) {
  .nv-pagehead { flex-direction: column; align-items: flex-start; gap: 10px; }
  .nv-pagehead-side { padding-bottom: 0; }
  .nv-pagehead-kicker { white-space: normal; }
  .nv-page-inner { width: calc(100% - 32px); }
}

/* 卡片墙按容器列数走：宽 3、中 2、窄 1；轨道铺满，不再用固定上限留右侧空白。 */
.nv-atlas-grid, .nv-heraldry-grid, .nv-bestiary-grid, .nv-magazine-grid, .nv-armory-grid, .nv-skillsheet {
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 16px;
}
.nv-coll-grid { grid-template-columns: repeat(3, minmax(0, 1fr)); row-gap: 24px; column-gap: 18px; }
.nv-formcards { grid-template-columns: repeat(3, minmax(0, 1fr)); }
.nv-quote-wall { grid-template-columns: repeat(2, minmax(0, 1fr)); }

/* 窄画布不再保留 200px 居中留白：卡片通栏，表单形象按常规 3:4 放大到 240。 */
@container (max-width: 520px) {
  .nv-form-visual { width: 240px; max-width: 100%; }
  .nv-atlas-grid, .nv-heraldry-grid, .nv-bestiary-grid, .nv-magazine-grid, .nv-armory-grid, .nv-skillsheet, .nv-coll-grid, .nv-formcards, .nv-quote-wall {
    grid-template-columns: 1fr;
  }
}

/* ---------- curated layouts: one geometry from blank to stored ---------- */
/* 规则页不再借用通用两栏表格；外层保持普通流，rail 在 CollRulebook 内部。 */
.nv-coll-layout-rulebook { display: block; }
.nv-rulebook { display: grid; grid-template-columns: 168px minmax(0, 1fr); gap: 48px; align-items: start; }
.nv-rule-rail { position: sticky; top: 12px; display: flex; flex-direction: column; gap: 2px; }
.nv-rule-raillabel { margin: 0 0 10px; padding-left: 10px; color: var(--nv-faint); font-size: 10px; letter-spacing: .16em; }
.nv-rule-rail button { display: flex; align-items: center; justify-content: space-between; height: 34px; padding: 0 10px; border: 0; border-radius: 8px;
  background: none; color: var(--nv-secondary-text); font: inherit; font-size: 13px; text-align: left; cursor: pointer; }
.nv-rule-rail button small { color: var(--nv-faint); font-size: 10px; }
.nv-rule-rail button:hover { background: var(--nv-hover); }
.nv-rule-rail button.is-on { background: var(--nv-accent-soft); color: var(--nv-accent-deep); font-weight: 600; }
.nv-rule-rail button.is-on small { color: var(--nv-accent-deep); opacity: .65; }
.nv-rule-paper { max-width: 840px; min-width: 0; }
.nv-rule-sectionhead { display: flex; align-items: center; gap: 12px; margin: 6px 0 0; color: var(--nv-accent-deep); font-size: 10.5px; letter-spacing: .15em; }
.nv-rule-sectionhead::after { content: ""; flex: 1; height: 1px; background: var(--nv-divider); }
.nv-rule-group + .nv-rule-group { margin-top: 10px; }
.nv-rule-item { display: grid; grid-template-columns: 34px minmax(0, 1fr); gap: 14px; padding: 22px 0 24px; border-bottom: 1px solid var(--nv-divider); }
.nv-rule-item:last-child { border-bottom: 0; }
.nv-rule-no { padding-top: 4px; color: var(--nv-faint); font-size: 10.5px; font-variant-numeric: tabular-nums; letter-spacing: .06em; }
.nv-rule-main { min-width: 0; }
.nv-rule-title { display: flex; flex-wrap: wrap; align-items: baseline; column-gap: 8px; margin: 0; font-size: 19px; line-height: 1.35; font-weight: 650; letter-spacing: -.01em; }
.nv-rule-title .nv-coll-cell { display: inline; width: auto; font: inherit; line-height: inherit; color: inherit; }
.nv-rule-body { margin-top: 8px; color: #3E443F; font-size: 14.5px; line-height: 1.9; }
.nv-rule-body .nv-coll-cell { display: block; font: inherit; line-height: inherit; color: inherit; text-align: left; }
.nv-rule-detail { margin-top: 10px; padding-left: 12px; border-left: 2px solid #E1EFE7; color: var(--nv-secondary-text); font-size: 12.5px; line-height: 1.8; }
.nv-rule-detail .nv-coll-cell { display: block; font: inherit; line-height: inherit; color: inherit; text-align: left; }
.nv-rule-detailadd { margin-top: 9px; padding: 0; border: 0; background: none; color: var(--nv-faint); font: inherit; font-size: 11px; cursor: pointer; }
.nv-rule-detailadd:hover { color: var(--nv-accent-deep); }
.nv-rule-cat { display: inline-flex; vertical-align: 2px; color: var(--nv-faint); font-size: 10.5px; font-weight: 400; letter-spacing: .08em; opacity: 0; transition: opacity var(--nv-dur-micro) var(--nv-ease-out); }
.nv-rule-item:hover .nv-rule-cat, .nv-rule-item:focus-within .nv-rule-cat { opacity: 1; }
.nv-rule-cat .nv-coll-cell { font: inherit; color: inherit; }
.nv-rule-item.is-new { border-bottom: 0; padding-top: 20px; }
.nv-rule-catline { display: flex; align-items: center; gap: 8px; margin-bottom: 5px; color: var(--nv-faint); font-size: 10.5px; letter-spacing: .08em; }
.nv-rule-catinput { min-width: 90px; padding: 0 0 2px; border: 0; border-bottom: 1px solid var(--nv-divider); background: transparent; color: var(--nv-secondary-text); font: inherit; font-size: 11px; outline: none; }
.nv-rule-catinput:focus { border-bottom-color: var(--nv-accent); }
.nv-rule-titleinput { display: block; width: 100%; box-sizing: border-box; padding: 0 0 5px; border: 0; border-bottom: 1px solid transparent; background: transparent;
  color: var(--nv-primary-text); font: inherit; font-size: 19px; font-weight: 650; letter-spacing: -.01em; outline: none; }
.nv-rule-titleinput:focus { border-bottom-color: var(--nv-accent); }
.nv-rule-titleinput::placeholder { color: var(--nv-faint); font-weight: 500; }
.nv-rule-bodyinput { display: block; width: 100%; box-sizing: border-box; min-height: 40px; margin-top: 9px; padding: 0; border: 0; background: transparent;
  color: #3E443F; font: inherit; font-size: 14.5px; line-height: 1.9; resize: none; outline: none; }
.nv-rule-bodyinput::placeholder { color: var(--nv-faint); }
.nv-rule-detailinput { display: block; width: 100%; box-sizing: border-box; min-height: 28px; margin-top: 8px; padding: 6px 0 0 12px; border: 0; border-left: 2px solid #E1EFE7;
  background: transparent; color: var(--nv-secondary-text); font: inherit; font-size: 12.5px; line-height: 1.8; resize: none; outline: none; }
.nv-rule-detailinput::placeholder { color: var(--nv-faint); }

.nv-quote-wall { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 18px; }
.nv-quote-block { display: flex; flex-direction: column; min-height: 0; padding: 22px 24px 18px; border: 1px solid #E7EBE8; border-radius: 16px; background: var(--nv-surface); box-shadow: 0 8px 26px rgba(26, 52, 38, .04); }
.nv-quote-block.is-new { border-color: #DDEBE3; background: linear-gradient(180deg, #FFFFFF, #FBFDFB); }
.nv-quote-mark { height: 19px; color: #9AD8BA; font-family: Georgia, "Times New Roman", serif; font-size: 30px; line-height: 1; }
.nv-quote-text { margin-top: 3px; color: var(--nv-primary-text); font-family: var(--nv-serif, "Songti SC", serif); font-size: 19px; line-height: 1.8; }
.nv-quote-text .nv-coll-cell { display: block; font: inherit; line-height: inherit; color: inherit; text-align: left; }
.nv-quote-text .nv-coll-cellinput { padding: 0; border: 0; border-bottom: 1px solid var(--nv-accent); border-radius: 0; background: transparent;
  font: inherit; line-height: inherit; color: inherit; resize: none; }
.nv-quote-meta { display: flex; flex-wrap: wrap; align-items: center; gap: 10px 16px; margin-top: 16px; padding-top: 0; color: var(--nv-secondary-text); font-size: 11px; }
.nv-quote-meta span, .nv-quote-meta label { display: inline-flex; flex: none; align-items: baseline; gap: 6px; white-space: nowrap; }
.nv-quote-meta small { flex: none; color: var(--nv-faint); font-size: 10px; letter-spacing: .08em; white-space: nowrap; }
.nv-quote-meta .nv-coll-cell { display: inline; width: auto; font: inherit; color: #5E655F; text-align: left; }
.nv-quote-meta input { min-width: 52px; max-width: 110px; padding: 0 0 1px; border: 0; border-bottom: 1px solid var(--nv-divider); background: transparent;
  color: var(--nv-secondary-text); font: inherit; font-size: 11px; outline: none; }
.nv-quote-meta input:focus { border-bottom-color: var(--nv-accent); }
.nv-quote-meta input::placeholder { color: var(--nv-faint); }
.nv-quote-input { display: block; width: 100%; box-sizing: border-box; min-height: 72px; margin-top: 3px; padding: 0; border: 0; background: transparent;
  color: var(--nv-primary-text); font-family: var(--nv-serif, "Songti SC", serif); font-size: 19px; line-height: 1.8; resize: none; outline: none; }
.nv-quote-input::placeholder { color: var(--nv-faint); }

.nv-formcards { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 18px; }
.nv-form-card { display: grid; grid-template-columns: 200px minmax(0, 1fr); min-height: 0; overflow: hidden; border: 1px solid var(--nv-divider);
  border-radius: 16px; background: var(--nv-surface); box-shadow: 0 8px 26px rgba(26, 52, 38, .045); }
.nv-form-visual { position: relative; display: flex; align-items: center; justify-content: center; width: 200px; aspect-ratio: 3 / 4; align-self: start; overflow: hidden; background: var(--nv-accent-soft);
  color: var(--nv-accent-deep); font-size: 11px; cursor: pointer; }
.nv-form-visual img { position: absolute; inset: 0; width: 100%; height: 100%; object-fit: cover; }
.nv-form-visual input { display: none; }
.nv-form-noimage { position: relative; z-index: 1; }
.nv-form-main { min-width: 0; padding: 20px 22px 18px; }
.nv-form-eyebrow { color: var(--nv-secondary-text); font-size: 9.5px; letter-spacing: .16em; }
.nv-form-name { margin: 3px 0 0; font-size: 21px; font-weight: 650; letter-spacing: -.01em; }
.nv-form-name .nv-coll-cell { font: inherit; line-height: inherit; color: inherit; }
.nv-form-nameinput { display: block; width: 100%; box-sizing: border-box; padding: 0 0 5px; border: 0; border-bottom: 1px solid var(--nv-divider); background: transparent;
  color: var(--nv-primary-text); font: inherit; font-size: 21px; font-weight: 650; outline: none; }
.nv-form-nameinput:focus { border-bottom-color: var(--nv-accent); }
.nv-form-nameinput::placeholder { color: var(--nv-faint); }
.nv-form-base { margin: 4px 0 0; color: var(--nv-secondary-text); font-size: 11px; }
.nv-form-facts { margin-top: 15px; border-top: 1px solid var(--nv-divider); }
.nv-form-fact { display: grid; grid-template-columns: 38px minmax(0, 1fr); gap: 8px; padding: 6.5px 0; border-bottom: 1px solid #F4F6F4; font-size: 11px; line-height: 1.45; }
.nv-form-fact .label { color: var(--nv-secondary-text); }
.nv-form-fact .value { display: flex; flex-wrap: wrap; align-items: baseline; min-width: 0; color: var(--nv-secondary-text); }
.nv-form-fact .old { color: var(--nv-faint); white-space: normal; }
.nv-form-fact .arrow { padding: 0 5px; color: #C9D1CB; }
.nv-form-fact .inherit { margin-left: 5px; color: var(--nv-faint); font-size: 9.5px; }
.nv-form-overrideadd { margin-left: 6px; padding: 0; border: 0; background: none; color: var(--nv-accent-deep); font: inherit; font-size: 9.5px; cursor: pointer; }
.nv-form-fact .nv-coll-cell { display: inline; width: auto; font: inherit; color: var(--nv-primary-text); font-weight: 500; }
.nv-form-fact .nv-coll-cell.is-ph { color: var(--nv-faint); font-weight: 400; }
.nv-form-factinput { flex: 1; min-width: 0; padding: 0 0 1px; border: 0; border-bottom: 1px solid var(--nv-divider); background: transparent;
  color: var(--nv-primary-text); font: inherit; font-size: 11px; font-weight: 500; outline: none; }
.nv-form-factinput:focus { border-bottom-color: var(--nv-accent); }
.nv-form-factinput::placeholder { color: var(--nv-faint); font-weight: 400; }
.nv-form-desc { margin-top: 13px; color: #5E655F; font-family: var(--nv-serif, "Songti SC", serif); font-size: 13px; line-height: 1.8; }
.nv-form-desc .nv-coll-cell { display: block; font: inherit; line-height: inherit; color: inherit; text-align: left; }
.nv-form-desc .nv-coll-cell.is-ph { color: var(--nv-faint); }
.nv-form-descinput { display: block; width: 100%; box-sizing: border-box; min-height: 44px; margin-top: 13px; padding: 0; border: 0; background: transparent;
  color: #5E655F; font-family: var(--nv-serif, "Songti SC", serif); font-size: 13px; line-height: 1.8; resize: none; outline: none; }
.nv-form-descinput::placeholder { color: var(--nv-faint); }
.nv-form-foot { margin-top: 12px; padding: 0; border: 0; background: none; color: var(--nv-accent-deep); font: inherit; font-size: 11px; cursor: pointer; }
.nv-form-card.is-new { border-color: #DDEBE3; }
.nv-form-card.is-new .nv-form-visual { border-right: 1px dashed #CFE3D7; }

.nv-dossier-back { margin: 0 0 16px; padding: 0; border: 0; background: none; color: var(--nv-secondary-text); font: inherit; font-size: 12px; cursor: pointer; }
.nv-dossier-back:hover { color: var(--nv-accent-deep); }
.nv-dossier-grid { display: grid; grid-template-columns: 230px minmax(0, 1fr); gap: 42px; align-items: start; }
.nv-dossier-visual { position: relative; display: flex; align-items: center; justify-content: center; width: 230px; height: 250px; overflow: hidden;
  border: 1px solid #DDEBE3; border-radius: 18px; background: linear-gradient(160deg, #F7FCF9, #E9F5EE); color: var(--nv-accent-deep); font-size: 11px; cursor: pointer; }
.nv-dossier-visual img { position: absolute; inset: 0; width: 100%; height: 100%; object-fit: cover; }
.nv-dossier-visual input { display: none; }
.nv-dossier-noimage { position: relative; z-index: 1; }
.nv-dossier-main { min-width: 0; }
.nv-dossier-kicker { margin: 0 0 6px; color: var(--nv-accent-deep); font-size: 11.5px; letter-spacing: .06em; }
.nv-dossier-name { margin: 0 0 16px; font-size: 30px; letter-spacing: -.02em; }
.nv-dossier-name .nv-coll-cell { font: inherit; line-height: inherit; color: inherit; }
.nv-dossier-facts { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 14px 30px; padding: 17px 0; border-top: 1px solid var(--nv-divider); border-bottom: 1px solid var(--nv-divider); }
.nv-dossier-fact .label { color: var(--nv-faint); font-size: 9.5px; letter-spacing: .12em; }
.nv-dossier-fact .value { margin-top: 3px; color: var(--nv-primary-text); font-size: 13.5px; }
.nv-dossier-fact .value .nv-coll-cell { font: inherit; color: inherit; }
.nv-dossier-body { max-width: 820px; margin-top: 22px; }
.nv-dossier-body h4 { margin: 0 0 6px; color: var(--nv-faint); font-size: 9.5px; letter-spacing: .12em; font-weight: 400; }
.nv-dossier-body .nv-coll-cell { display: block; color: #444A46; font-family: var(--nv-serif, "Songti SC", serif); font-size: 14.5px; line-height: 1.95; text-align: left; }
.nv-dossier-rel { margin-top: 24px; padding-top: 6px; border-top: 1px solid var(--nv-divider); }
.nv-dossier-rel h4 { margin: 0 0 4px; color: var(--nv-faint); font-size: 9.5px; letter-spacing: .12em; font-weight: 400; }
.nv-dossier-rel button { display: flex; align-items: center; justify-content: space-between; width: 100%; padding: 10px 0; border: 0; border-bottom: 1px solid #F3F5F3;
  background: none; color: var(--nv-primary-text); font: inherit; font-size: 12px; text-align: left; cursor: pointer; }
.nv-dossier-rel button span { display: inline-flex; align-items: baseline; gap: 10px; min-width: 0; }
.nv-dossier-rel button small { color: var(--nv-faint); font-size: 9.5px; letter-spacing: .1em; }
.nv-dossier-rel button b { color: var(--nv-accent-deep); font-weight: 500; }

.nv-prof-name { margin: 0 0 10px; font-size: 28px; line-height: 1.2; letter-spacing: -.02em; }
.nv-prof-world .nv-prof-name { font-size: 30px; }
.nv-prof-world .nv-prof-portrait { height: 232px; aspect-ratio: auto; }
.nv-prof-editquote { display: block; width: 100%; max-width: 820px; box-sizing: border-box; min-height: 96px; margin-top: 8px; padding: 10px 12px; border: 1px solid var(--nv-divider); border-radius: 10px; background: var(--nv-surface);
  font-family: var(--nv-serif, "Songti SC", serif); font-size: 18px; line-height: 1.7; resize: vertical; outline: none; }
.nv-prof-editquote:focus { border-color: var(--nv-accent); }
.nv-prof-editbody { display: block; width: 100%; max-width: 820px; box-sizing: border-box; min-height: 320px; margin-top: 12px; padding: 14px 16px; border: 1px solid var(--nv-divider); border-radius: 12px; background: var(--nv-surface); font-size: 15px; line-height: 1.9; resize: vertical; outline: none; }
.nv-prof-editbody:focus { border-color: var(--nv-accent); }
.nv-prof-chips-read { gap: 14px; margin-top: 10px; }
.nv-prof-chip { padding: 0; border-radius: 0; background: none; color: #5E655F; font-size: 12px; }
.nv-heraldry-note { display: -webkit-box; margin: 8px 0 0; overflow: hidden; color: var(--nv-secondary-text); font-size: 11.5px; line-height: 1.6; -webkit-box-orient: vertical; -webkit-line-clamp: 2; }
.nv-magazine-cal { display: block; margin-top: 4px; color: var(--nv-faint); }
.nv-armory-detail, .nv-skill-detail { margin: 6px 0 0; color: var(--nv-faint); font-size: 10.5px; line-height: 1.6; }

@container (max-width: 620px) {
  .nv-rulebook { grid-template-columns: 1fr; gap: 10px; }
  .nv-rule-rail { position: static; flex-direction: row; flex-wrap: wrap; }
  .nv-rule-raillabel { display: none; }
  .nv-quote-wall { grid-template-columns: 1fr; }
  .nv-formcards { grid-template-columns: 1fr; }
  .nv-form-card { grid-template-columns: 1fr; }
  .nv-form-visual { width: 200px; max-width: 100%; height: auto; aspect-ratio: 3 / 4; margin: 16px auto 0; align-self: center; }
  .nv-form-card.is-new .nv-form-visual { border-right: 0; border-bottom: 1px dashed #CFE3D7; }
  .nv-dossier-grid { grid-template-columns: 1fr; gap: 20px; }
  .nv-dossier-visual { width: 230px; max-width: 100%; height: 220px; margin: 0 auto; }
}

/* 画布列数只走 3/2/1：切换前后轨道都铺满容器，不留下右侧空带。 */
@container (max-width: 900px) {
  .nv-ov-grid,
  .nv-atlas-grid, .nv-heraldry-grid, .nv-bestiary-grid, .nv-magazine-grid, .nv-armory-grid, .nv-skillsheet,
  .nv-coll-grid,
  .nv-formcards {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }
  .nv-coll-layout-gallery .nv-coll-grid { grid-template-columns: repeat(2, minmax(0, 1fr)); }
}

@container (max-width: 620px) {
  .nv-ov-grid,
  .nv-atlas-grid, .nv-heraldry-grid, .nv-bestiary-grid, .nv-magazine-grid, .nv-armory-grid, .nv-skillsheet,
  .nv-coll-grid,
  .nv-formcards,
  .nv-quote-wall {
    grid-template-columns: 1fr;
  }
  .nv-coll-layout-quoteWall .nv-coll-grid,
  .nv-coll-layout-skillSheet .nv-coll-grid,
  .nv-coll-layout-gallery .nv-coll-grid { grid-template-columns: 1fr; }
}

/* ---------- 自由模块：整页 / 两级全屏 / 悬浮 chrome ---------- */
/* 卡页 bleed 里的自由模块占满整列，页面本身不再滚。 */
.nv-cardpage-bleed > .nv-modbox { flex: 1; min-height: 0; display: flex; flex-direction: column; }
.nv-cardpage-bleed > .nv-modbox > .nv-modbox-body { flex: 1; min-height: 0; display: flex; flex-direction: column; }
.nv-htmlfile-fill { flex: 1; min-height: 0; height: 100%; gap: 0; position: relative; }
.nv-htmlfile-stage { position: relative; flex: 1; min-height: 0; display: flex; flex-direction: column; }
.nv-htmlfile-stage-fill { height: 100%; }
/* 整页态：工具条浮在作品上，静止时淡出，悬停/聚焦复原。 */
.nv-htmlfile-fill .nv-htmlfile-bar { position: absolute; top: 10px; right: 12px; z-index: 8;
  padding: 4px 6px; border: 1px solid var(--nv-divider); border-radius: 999px;
  background: color-mix(in srgb, var(--nv-surface) 88%, transparent); backdrop-filter: blur(8px);
  box-shadow: 0 2px 10px rgba(20,30,26,.06); opacity: .38; transition: opacity var(--nv-dur-micro) var(--nv-ease-out); }
.nv-htmlfile-fill .nv-htmlfile-bar:hover, .nv-htmlfile-fill .nv-htmlfile-bar:focus-within { opacity: 1; }
.nv-htmlfile-fill .nv-htmlfile-bar .nv-tree-glyph { display: none; }
.nv-htmlfile-bar [data-active] { color: var(--nv-accent-deep); border-color: var(--nv-accent); }
/* 游戏 chrome：底部右侧一条，和页面工具条同一套淡出规则。 */
.nv-surfacebar { position: absolute; right: 12px; bottom: 12px; z-index: 8; display: flex; align-items: center; gap: 4px;
  padding: 4px 6px; border: 1px solid var(--nv-divider); border-radius: 999px;
  background: color-mix(in srgb, var(--nv-surface) 88%, transparent); backdrop-filter: blur(8px);
  box-shadow: 0 2px 10px rgba(20,30,26,.06); font-size: 11.5px; color: var(--nv-secondary-text);
  opacity: .38; transition: opacity var(--nv-dur-micro) var(--nv-ease-out); }
.nv-surfacebar:hover, .nv-surfacebar:focus-within { opacity: 1; }
.nv-surfacebar button { border: 0; background: none; color: inherit; font: inherit; padding: 4px 7px; border-radius: 999px; cursor: pointer; }
.nv-surfacebar button:hover { background: var(--nv-accent-soft); color: var(--nv-accent-deep); }
.nv-surfacebar button:disabled { opacity: .4; cursor: default; }
.nv-surfacebar-status { padding: 0 6px; color: var(--nv-accent-deep); white-space: nowrap; }
.nv-surfacebar-slots { position: absolute; right: 0; bottom: calc(100% + 8px); display: flex; gap: 8px; padding: 10px;
  border: 1px solid var(--nv-divider); border-radius: 12px; background: var(--nv-surface); box-shadow: 0 6px 24px rgba(20,30,26,.12); }
.nv-surfacebar-slot { display: flex; flex-direction: column; gap: 5px; min-width: 120px; font-size: 11.5px; }
.nv-surfacebar-slot b { color: var(--nv-primary-text); }
.nv-surfacebar-slot span { color: var(--nv-secondary-text); }
.nv-surfacebar-slot button { border: 1px solid var(--nv-divider); border-radius: 8px; padding: 3px 8px; }
/* 整页态的诊断抽屉浮在底部，不参与作品布局。 */
.nv-htmlfile-fill .nv-htmlfile-diag { position: absolute; left: 12px; right: 12px; bottom: 12px; z-index: 9;
  max-height: 38%; overflow: auto; background: var(--nv-surface); box-shadow: 0 6px 24px rgba(20,30,26,.12); }
/* 画布全屏：抽屉面板让位，画布宿主铺满工作层。网格只在属性存在时覆盖，
   退出即回原记录。 */
[data-canvas-fullscreen]:not([data-work]) { grid-template-columns: minmax(0px, 1fr) !important; }
[data-work][data-canvas-fullscreen] { grid-template-columns: minmax(0px, 1fr) !important; }
[data-canvas-fullscreen] [data-sidebar-right-panel] { display: none !important; }
[data-canvas-fullscreen] [data-sidebar-right-canvas-host] { left: 0 !important; right: 0 !important; }
/* 窗口级全屏保留原 DOM；浮层菜单和对话框仍在更高的 portal 层。 */
.nv-canvas[data-canvas-fullscreen] { position: fixed; inset: 0; z-index: 900; width: auto; height: auto; background: var(--nv-surface); }
/* 页签条上的画布全屏钮：内容自己的视图动作，留在 leading 组。 */
.nv-canvas-fullscreentoggle { border: 0; background: none; padding: 0; width: 28px; height: 28px; color: var(--nv-secondary-text);
  cursor: pointer; border-radius: 7px; display: inline-flex; align-items: center; justify-content: center; flex: none; }
.nv-canvas-fullscreentoggle:hover { color: var(--nv-accent-deep); background: var(--nv-accent-soft); }
.nv-canvas-fullscreentoggle[data-active] { color: var(--nv-accent-deep); }

/* 侧边上级入口与折叠同一规格；位置和间距由框架的 trailing 行持有。 */
.nv-side-parent {
  width: 28px;
  height: 28px;
  padding: 0;
  border: 0;
  border-radius: 7px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  color: var(--nv-secondary-text);
  background: none;
}
.nv-side-parent:hover { background: var(--nv-hover); color: var(--nv-primary-text); }

/* 空白会话就是创作入口：恢复创作页的薄荷光晕，普通会话保持素底。 */
html[data-noven-subject='conversation'] [data-center-col] [data-phase='hero'] {
  background: radial-gradient(circle at 50% 30%, rgba(52, 211, 153, .12), transparent 42%), var(--nv-surface);
}
html[data-noven-conversation-appearance] [data-center-col] [data-phase='hero'] {
  background-color: transparent;
  background-image: var(--noven-conversation-background-image, none);
  background-position: var(--noven-conversation-background-position, center);
  background-size: cover;
}

/* 空白会话 hero：原生鱼标槽位改渲染创作页同一套 hero；旧品牌、标语和
   引导 dock 不再出现。headline 原本是鱼标 + 标题的横排，这里改成整块。 */
[data-conversation-hero-shell] [class*='headline'] { display: block; }
[data-conversation-hero-shell] [class*='fishHitbox'] { display: block; width: 100%; }
[data-conversation-hero-shell] .nv-create-intro { margin: 0 auto; }

/* ===== 我的：一页四段 + 卡预览 ===== */
.nv-btn-soft {
  display: inline-flex; align-items: center; justify-content: center; gap: 5px;
  border: 0; border-radius: 999px; padding: 8px 17px; font-size: 12.5px; font-weight: 600;
  background: var(--nv-accent-soft); color: var(--nv-accent-deep); cursor: pointer;
  transition: background var(--nv-dur-micro) ease;
}
.nv-btn-soft:hover { background: rgba(52, 211, 153, .2); }
.nv-linkbtn {
  border: 0; background: none; padding: 0; color: var(--nv-accent-deep);
  font-size: 12px; font-weight: 650; cursor: pointer;
}
.nv-linkbtn:hover { text-decoration: underline; text-underline-offset: 3px; }
.nv-btn-danger {
  display: inline-flex; align-items: center; justify-content: center; border: 0;
  border-radius: 999px; padding: 8px 17px; font-size: 12.5px; font-weight: 600;
  background: var(--nv-danger); color: #fff; cursor: pointer;
}
.nv-btn-danger:hover { filter: brightness(1.06); }
.nv-btn-danger:disabled { opacity: .5; cursor: default; filter: none; }
.nv-pick-target { margin-top: 8px; font-size: 11.5px; color: var(--nv-secondary-text); letter-spacing: .02em; }

.nv-mehome { font-size: 13px; }
.nv-me-profile { display: flex; align-items: center; gap: 18px; padding: 6px 0 2px; }
.nv-me-avatar {
  width: 64px; height: 64px; flex: none; border: 0; border-radius: 50%; padding: 0;
  overflow: hidden; cursor: pointer; display: grid; place-items: center;
  color: #fff; font-size: 23px; font-weight: 700;
  background: radial-gradient(circle at 30% 24%, #9DD9C0, #2F6E5A 58%, #163A31);
}
.nv-me-avatar img { width: 100%; height: 100%; object-fit: cover; display: block; }
.nv-me-profile-body { flex: 1; min-width: 0; }
.nv-me-name { display: block; font-size: 22px; font-weight: 750; letter-spacing: -.02em; }
.nv-me-bio { display: block; margin-top: 3px; font-size: 12.5px; color: var(--nv-secondary-text); }
.nv-me-stats { margin-top: 8px; font-size: 11.5px; color: var(--nv-secondary-text); font-variant-numeric: tabular-nums; }
.nv-editable-input.nv-me-name { font-size: 22px; font-weight: 750; }
.nv-editable-input.nv-me-bio { font-size: 12.5px; margin-top: 3px; color: var(--nv-secondary-text); }

.nv-me-gallery { margin-top: 30px; }
.nv-me-gallery-head { display: flex; align-items: center; justify-content: space-between; gap: 16px; margin-bottom: 16px; }
.nv-me-gallery-title { display: flex; align-items: baseline; gap: 9px; min-width: 0; }
.nv-me-gallery-title h2 { font-size: 18px; font-weight: 750; letter-spacing: -.02em; }
.nv-me-gallery-title span { font-size: 12px; color: var(--nv-secondary-text); font-variant-numeric: tabular-nums; }
.nv-me-gallery-actions { display: flex; align-items: center; gap: 14px; }
.nv-me-masonry { column-gap: 22px; }
.nv-me-masonry-worlds { columns: 3; }
.nv-me-masonry-chars { columns: 4; }
.nv-me-card { position: relative; break-inside: avoid; margin: 0 0 26px; }
.nv-me-card-hit {
  display: block; width: 100%; border: 0; background: none; padding: 0;
  text-align: left; font: inherit; color: inherit; cursor: pointer;
}
.nv-me-cover {
  position: relative; display: flex; align-items: center; justify-content: center;
  width: 100%; overflow: hidden; border-radius: 14px; background: var(--nv-accent-soft);
  border: 0.5px solid var(--nv-divider); box-shadow: 0 1px 2px rgba(16, 20, 18, .04);
  transition: transform var(--nv-dur-ui) var(--nv-ease-out), box-shadow var(--nv-dur-ui) var(--nv-ease-out);
}
.nv-me-cover .nv-slot-excerpt { background: var(--nv-surface); }
.nv-me-card[data-kind='WORLD'] .nv-me-cover, .nv-me-card:not([data-kind='CHARACTER']) .nv-me-cover { aspect-ratio: 16 / 10; }
.nv-me-card[data-kind='CHARACTER'] .nv-me-cover { aspect-ratio: 3 / 4; }
.nv-me-card[data-variant='shelf'] .nv-me-cover { border-radius: 12px; }
.nv-me-cover-img { position: absolute; inset: 0; width: 100%; height: 100%; object-fit: cover; }
.nv-me-glyph { display: grid; place-items: center; color: var(--nv-accent-deep); font-size: 34px; font-weight: 750; opacity: .55; }
.nv-me-ph {
  position: absolute; inset: 0; display: grid; place-items: center;
  background: var(--nv-accent-soft); color: var(--nv-accent-deep);
}
.nv-me-ph--char { background: var(--nv-pane); color: var(--nv-secondary-text); }
.nv-me-ph svg { opacity: .62; }
.nv-me-card:hover .nv-me-cover { transform: translateY(-3px); box-shadow: 0 12px 28px rgba(16, 20, 18, .12); }
.nv-me-card[data-leaving] { pointer-events: none; }
.nv-me-draft {
  position: absolute; right: 8px; bottom: 8px; background: rgba(255, 255, 255, .92);
  color: var(--nv-accent-deep); font-size: 10.5px; font-weight: 600; border-radius: 999px; padding: 2px 8px;
}
.nv-me-cap { display: flex; flex-direction: column; gap: 3px; padding: 9px 2px 0; }
.nv-me-cardname { font-size: 14.5px; font-weight: 700; }
.nv-me-ex {
  font-size: 12px; line-height: 1.6; color: var(--nv-secondary-text);
  display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical; overflow: hidden;
}
.nv-me-meta { font-size: 11px; color: var(--nv-secondary-text); }
.nv-me-card-actions {
  position: absolute; top: 8px; right: 8px; z-index: 5;
  display: flex; gap: 4px; opacity: 0; transition: opacity var(--nv-dur-micro) ease;
}
.nv-me-card:hover .nv-me-card-actions, .nv-me-card-actions:focus-within,
.nv-me-card:has(.nv-me-more[open]) .nv-me-card-actions { opacity: 1; }
.nv-me-icon {
  width: 28px; height: 28px; border: 0; border-radius: 50%;
  background: rgba(18, 23, 21, .55); color: #fff; font-size: 12px;
  display: grid; place-items: center; cursor: pointer; backdrop-filter: blur(8px);
}
.nv-me-more { position: relative; }
.nv-me-more summary, .nv-me-libmore summary {
  list-style: none; width: 28px; height: 28px; border-radius: 50%;
  display: grid; place-items: center; background: rgba(18, 23, 21, .55); color: #fff;
  font-size: 16px; line-height: 1; cursor: pointer; backdrop-filter: blur(8px);
}
.nv-me-more summary::-webkit-details-marker, .nv-me-libmore summary::-webkit-details-marker { display: none; }
.nv-me-more[open] summary, .nv-me-libmore[open] summary { background: var(--nv-inverse-surface); color: var(--nv-inverse-text); }
.nv-me-menu {
  position: absolute; right: 0; top: calc(100% + 6px); z-index: 30; min-width: 160px;
  padding: 5px; border-radius: 12px; background: var(--nv-surface);
  border: 0.5px solid var(--nv-divider); box-shadow: 0 18px 48px rgba(16, 20, 18, .14);
}
.nv-me-menu button {
  display: flex; flex-direction: column; gap: 1px; width: 100%; border: 0; background: none;
  padding: 8px 10px; border-radius: 8px; text-align: left; font: inherit; font-size: 12px;
  color: var(--nv-primary-text); cursor: pointer; white-space: nowrap;
}
.nv-me-menu button small { font-size: 10px; color: var(--nv-secondary-text); }
.nv-me-menu button:hover { background: var(--nv-hover); }
.nv-me-menu button.danger { color: var(--nv-danger); }
.nv-me-menu button[data-armed] { color: var(--nv-danger); background: var(--nv-danger-soft); }
.nv-me-menuback { color: var(--nv-secondary-text) !important; }
.nv-me-newtile {
  break-inside: avoid; width: 100%; margin: 0 0 26px; border: 1.5px dashed rgba(52, 211, 153, .55);
  border-radius: 14px; background: var(--nv-accent-soft); color: var(--nv-accent-deep);
  display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 9px;
  font-size: 12.5px; font-weight: 650; cursor: pointer;
}
.nv-me-newtile--world { aspect-ratio: 16 / 10; }
.nv-me-newtile--character { aspect-ratio: 3 / 4; }
.nv-me-newtile:hover { background: rgba(52, 211, 153, .2); border-color: var(--nv-accent); }
.nv-me-plus { font-size: 24px; font-weight: 300; line-height: 1; }
.nv-me-empty { display: flex; flex-direction: column; align-items: center; gap: 4px; padding: 36px 0 8px; color: var(--nv-secondary-text); font-size: 12.5px; }
.nv-me-empty strong { color: var(--nv-primary-text); font-size: 14px; }
.nv-me-skel {
  break-inside: avoid; margin: 0 0 26px; border-radius: 14px; opacity: .8;
  background: linear-gradient(90deg, var(--nv-pane), var(--nv-surface), var(--nv-pane));
  background-size: 200% 100%; animation: nv-me-skel 1.4s linear infinite;
}
.nv-me-skel--world { aspect-ratio: 16 / 10; }
.nv-me-skel--char { aspect-ratio: 3 / 4; }
.nv-me-skel--tape { flex: 0 0 380px; aspect-ratio: 16 / 10; margin: 0; }
@keyframes nv-me-skel { from { background-position: 200% 0; } to { background-position: -200% 0; } }

.nv-me-library { margin-top: 38px; padding-top: 26px; border-top: 1px solid var(--nv-divider); }
.nv-me-libhead { display: flex; align-items: flex-start; justify-content: space-between; gap: 16px; margin-bottom: 16px; }
.nv-me-libhead p { margin-top: 4px; font-size: 12px; color: var(--nv-secondary-text); }
.nv-me-shelf { display: grid; grid-template-columns: repeat(auto-fill, minmax(260px, 1fr)); gap: 18px; }
.nv-me-libbox {
  position: relative; border: 0.5px solid var(--nv-divider); border-radius: 18px;
  background: var(--nv-surface);
  transition: transform var(--nv-dur-ui) var(--nv-ease-out), box-shadow var(--nv-dur-ui) var(--nv-ease-out), border-color var(--nv-dur-ui) ease;
}
.nv-me-libbox:hover { transform: translateY(-3px); box-shadow: 0 14px 34px rgba(16, 20, 18, .1); border-color: transparent; }
.nv-me-libbox.is-active { border-color: var(--nv-accent); box-shadow: 0 0 0 2px var(--nv-accent-soft); }
.nv-me-libbox.is-system { background: var(--nv-pane); }
.nv-me-libbox-hit {
  display: block; width: 100%; border: 0; background: none; padding: 11px;
  text-align: left; font: inherit; color: inherit; cursor: pointer; border-radius: 18px;
}
.nv-me-collage { display: grid; grid-template-columns: 1fr 1fr; gap: 5px; overflow: hidden; border-radius: 12px; }
.nv-me-mini { display: block; aspect-ratio: 1 / 1; background: var(--nv-accent-soft) center / cover no-repeat; }
.nv-me-mini--world { display: grid; place-items: center; background: var(--nv-accent-soft); color: var(--nv-accent-deep); font-size: 18px; font-weight: 750; }
.nv-me-mini--char { display: grid; place-items: center; background: var(--nv-pane); color: var(--nv-secondary-text); font-size: 18px; font-weight: 750; }
.nv-me-mini--empty { background: repeating-linear-gradient(135deg, var(--nv-pane), var(--nv-pane) 9px, var(--nv-divider) 9px, var(--nv-divider) 10px); }
.nv-me-libbody { display: flex; flex-direction: column; gap: 3px; padding: 11px 3px 3px; }
.nv-me-libname { display: flex; align-items: center; gap: 6px; font-size: 14px; font-weight: 700; }
.nv-me-libtag { font-size: 9.5px; font-weight: 600; color: var(--nv-secondary-text); border: 0.5px solid var(--nv-divider); border-radius: 999px; padding: 1px 6px; }
.nv-me-libcounts { font-size: 11.5px; color: var(--nv-secondary-text); }
.nv-me-libtime { font-size: 10.5px; color: var(--nv-secondary-text); opacity: .8; }
.nv-me-libmore { position: absolute; top: 18px; right: 18px; z-index: 4; }
.nv-me-libmore summary { opacity: 0; }
.nv-me-libbox:hover .nv-me-libmore summary, .nv-me-libmore:focus-within summary, .nv-me-libmore[open] summary { opacity: 1; }
.nv-me-newlib {
  min-height: 210px; border: 1.5px dashed var(--nv-divider); border-radius: 18px;
  background: none; color: var(--nv-secondary-text); display: flex; flex-direction: column;
  align-items: center; justify-content: center; gap: 10px; font-size: 12.5px; cursor: pointer;
}
.nv-me-newlib:hover { border-color: var(--nv-accent); color: var(--nv-accent-deep); background: var(--nv-accent-soft); }
.nv-me-syshead {
  display: flex; align-items: baseline; gap: 9px; margin: 26px 0 12px;
  font-size: 11px; font-weight: 650; letter-spacing: .08em; color: var(--nv-secondary-text); text-transform: uppercase;
}
.nv-me-syshead small { font-size: 10.5px; font-weight: 400; letter-spacing: 0; text-transform: none; opacity: .8; }
.nv-me-active { margin-top: 28px; padding-top: 20px; border-top: 1px solid var(--nv-divider); scroll-margin-top: 150px; }
.nv-me-active-head { position: relative; display: flex; align-items: flex-start; justify-content: space-between; gap: 12px; }
.nv-me-active-head h3 { font-size: 19px; font-weight: 750; }
.nv-me-active-head p { margin-top: 3px; font-size: 11.5px; color: var(--nv-secondary-text); }
.nv-me-active-head .nv-me-libmore { position: relative; top: auto; right: auto; }
.nv-me-active-head .nv-me-libmore summary { opacity: 1; }
.nv-me-active-sec { margin-top: 22px; }
.nv-me-active-sechead { display: flex; align-items: baseline; gap: 8px; margin-bottom: 12px; }
.nv-me-active-sechead > span:first-child { font-size: 14px; font-weight: 700; }
.nv-me-count { font-size: 11.5px; color: var(--nv-secondary-text); font-variant-numeric: tabular-nums; }
.nv-me-active-sechead .nv-linkbtn { margin-left: auto; }
.nv-me-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(210px, 1fr)); gap: 18px; }
.nv-me-grid-chars { grid-template-columns: repeat(auto-fill, minmax(160px, 1fr)); }
.nv-me-secempty { padding: 16px 0; font-size: 12px; color: var(--nv-secondary-text); }
.nv-me-libempty { display: flex; flex-direction: column; align-items: center; padding: 46px 0 28px; text-align: center; }
.nv-me-emptyart { width: 56px; height: 56px; border-radius: 16px; display: grid; place-items: center; background: var(--nv-accent-soft); color: var(--nv-accent-deep); font-size: 24px; margin-bottom: 12px; }
.nv-me-libempty strong { font-size: 15px; }
.nv-me-libempty span { margin-top: 4px; font-size: 12px; color: var(--nv-secondary-text); }
.nv-me-emptyacts { display: flex; gap: 8px; margin-top: 16px; }
.nv-me-foot { display: flex; align-items: center; justify-content: space-between; gap: 14px; margin-top: 24px; padding-top: 16px; border-top: 1px solid var(--nv-divider); font-size: 11.5px; color: var(--nv-secondary-text); }

/* Three parallel interfaces inside 我的; the name card and tabs stay put. */
.nv-mehead {
  position: sticky; top: 0; z-index: 20;
  display: flex; flex-direction: column; gap: 10px;
  padding: 0 0 10px; background: var(--nv-surface);
}
.nv-meview-tabs {
  display: flex; align-items: center; gap: 26px; margin: 0;
}
.nv-meview-tab {
  border: 0; background: none; padding: 4px 1px 6px; margin: 0;
  border-bottom: 2px solid transparent; font-size: 14px; font-weight: 700;
  color: var(--nv-secondary-text); cursor: pointer;
}
.nv-meview-tab[data-active] { color: var(--nv-primary-text); border-bottom-color: var(--nv-accent); }
.nv-meview-library .nv-me-library { margin-top: 4px; padding-top: 0; border-top: 0; }
.nv-meview-works { margin-top: 4px; }
.nv-me-workshead { display: flex; align-items: flex-start; justify-content: space-between; gap: 16px; margin-bottom: 18px; }
.nv-me-workshead p { margin-top: 4px; font-size: 12px; color: var(--nv-secondary-text); }
.nv-me-worksgroup { margin-top: 22px; }
.nv-me-worksgrid { display: grid; grid-template-columns: repeat(auto-fill, minmax(220px, 1fr)); gap: 18px; }
.nv-me-work {
  display: flex; flex-direction: column; border: 0.5px solid var(--nv-divider);
  border-radius: 16px; background: var(--nv-surface); overflow: hidden; padding: 0;
  text-align: left; font: inherit; color: inherit; cursor: pointer;
  transition: transform var(--nv-dur-ui) var(--nv-ease-out), box-shadow var(--nv-dur-ui) var(--nv-ease-out);
}
.nv-me-work:hover { transform: translateY(-2px); box-shadow: 0 10px 24px rgba(16, 20, 18, .10); }
.nv-me-workcover { display: block; aspect-ratio: 4 / 3; background: var(--nv-pane) center / cover no-repeat; }
.nv-me-workcover--type { display: grid; place-items: center; color: var(--nv-accent-deep); font-size: 13px; font-weight: 650; background: var(--nv-accent-soft); }
.nv-me-workbody { display: flex; flex-direction: column; gap: 5px; padding: 11px 13px 13px; }
.nv-me-workbody strong { font-size: 13px; }
.nv-me-workmeta { display: flex; flex-wrap: wrap; align-items: center; gap: 6px; font-size: 10.5px; color: var(--nv-secondary-text); }
.nv-me-workproject { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.nv-me-worksempty { display: flex; flex-direction: column; align-items: center; padding: 64px 0 32px; text-align: center; }
.nv-me-worksempty strong { font-size: 15px; }
.nv-me-worksempty span { margin-top: 4px; font-size: 12px; color: var(--nv-secondary-text); }
.nv-me-worksempty button { margin-top: 16px; }

/* Horizontal world rail: plain scrolling cards, no film decoration. */
.nv-me-exhibit-worlds { margin-top: 28px; }
.nv-me-tape {
  display: flex; align-items: flex-start; gap: 18px; overflow-x: auto;
  padding: 0; border-radius: 0; background: transparent;
  scrollbar-width: none; overscroll-behavior-x: contain;
}
.nv-me-tape::-webkit-scrollbar { display: none; }
.nv-me-tape .nv-me-card { flex: 0 0 380px; margin: 0; scroll-snap-align: start; }
.nv-me-tape .nv-me-newtile { flex: 0 0 300px; width: auto; margin: 0; scroll-snap-align: start; }
.nv-me-tape-nav { display: inline-flex; align-items: center; gap: 4px; }
.nv-me-tape-nav button {
  width: 28px; height: 28px; border: 0.5px solid var(--nv-divider); border-radius: 50%;
  background: var(--nv-surface); color: var(--nv-secondary-text); font-size: 16px; cursor: pointer;
}
.nv-me-tape-nav button:hover { color: var(--nv-primary-text); border-color: var(--nv-secondary-text); }

.nv-me-deletecopy p { font-size: 12.5px; line-height: 1.7; }
.nv-me-deletenote { margin-top: 8px; color: var(--nv-secondary-text); }
.nv-me-deleteerror { margin-top: 8px; color: var(--nv-danger); }

/* Card preview */
.nv-cardpreview { display: flex; flex-direction: column; height: 100%; min-height: 0; background: var(--nv-surface); }
.nv-cardpreview-bar {
  display: flex; align-items: center; gap: 11px; padding: 11px 28px; flex: none;
  border-bottom: 0.5px solid var(--nv-divider); background: var(--nv-surface);
}
.nv-cardpreview-bar .nv-back {
  width: 30px; height: 30px; flex: none; border: 0.5px solid var(--nv-divider); border-radius: 50%;
  background: var(--nv-surface); color: var(--nv-secondary-text); font-size: 17px;
  display: grid; place-items: center; cursor: pointer;
}
.nv-cardpreview-bar .nv-back:hover { color: var(--nv-primary-text); border-color: var(--nv-secondary-text); }
.nv-cardpreview-bar .nv-crumb { min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; font-size: 11.5px; color: var(--nv-secondary-text); }
.nv-cardpreview-bar .nv-crumb b { color: var(--nv-primary-text); font-weight: 650; }
.nv-cardpreview-bar .nv-crumb span { padding: 0 5px; opacity: .55; }
.nv-cardpreview-actions { margin-left: auto; display: flex; align-items: center; gap: 8px; }
.nv-cardpreview-more { position: relative; }
.nv-cardpreview-more summary {
  list-style: none; width: 30px; height: 30px; border-radius: 50%;
  border: 0.5px solid var(--nv-divider); display: grid; place-items: center;
  color: var(--nv-secondary-text); cursor: pointer;
}
.nv-cardpreview-more summary::-webkit-details-marker { display: none; }
.nv-cardpreview-more summary:hover { color: var(--nv-primary-text); background: var(--nv-hover); }
.nv-cardpreview-menu {
  position: absolute; right: 0; top: calc(100% + 6px); z-index: 30; min-width: 150px;
  padding: 5px; border-radius: 12px; background: var(--nv-surface);
  border: 0.5px solid var(--nv-divider); box-shadow: 0 18px 48px rgba(16, 20, 18, .14);
}
.nv-cardpreview-menu button {
  display: block; width: 100%; border: 0; background: none; padding: 8px 10px;
  border-radius: 8px; text-align: left; font: inherit; font-size: 12px;
  color: var(--nv-primary-text); cursor: pointer;
}
.nv-cardpreview-menu button:hover { background: var(--nv-hover); }
.nv-cardpreview-menu button[data-armed] { color: var(--nv-danger); background: var(--nv-danger-soft); }
.nv-cardpreview-scroll { flex: 1; min-height: 0; overflow-y: auto; }
.nv-cardpreview-inner { max-width: 1120px; margin: 0 auto; padding: 22px 30px 80px; }
.nv-cardpreview-hero {
  position: relative; min-height: 340px; border-radius: 22px; overflow: hidden;
  display: flex; align-items: flex-end; padding: 36px; color: #fff;
  background: linear-gradient(135deg, #233A35, #7FA997);
}
.nv-cardpreview-cover { position: absolute; inset: 0; width: 100%; height: 100%; object-fit: cover; }
.nv-cardpreview-shade {
  position: absolute; inset: 0;
  background: linear-gradient(180deg, rgba(8, 14, 14, .02) 18%, rgba(8, 14, 14, .34) 56%, rgba(8, 14, 14, .78) 100%);
}
.nv-cardpreview-copy { position: relative; z-index: 2; max-width: 680px; }
.nv-cardpreview-kind {
  display: inline-block; font-size: 10px; font-weight: 700; letter-spacing: .11em;
  text-transform: uppercase; color: #D8FFF0; background: rgba(20, 40, 34, .34);
  border: 1px solid rgba(216, 255, 240, .24); border-radius: 999px; padding: 3px 9px;
}
.nv-cardpreview-hero h1 {
  margin-top: 10px; font-family: "Songti SC", "Noto Serif SC", serif;
  font-size: 46px; line-height: 1.08; font-weight: 600; letter-spacing: .03em;
}
.nv-cardpreview-hero p { margin-top: 9px; font-size: 14px; line-height: 1.7; color: rgba(255, 255, 255, .94); }
.nv-cardpreview-meta { display: block; margin-top: 13px; font-size: 10.5px; color: rgba(255, 255, 255, .72); }
.nv-cardpreview-hero[data-kind='CHARACTER'] {
  display: grid; grid-template-columns: 296px minmax(0, 1fr); gap: 38px;
  align-items: center; min-height: 0; padding: 34px;
  color: var(--nv-primary-text); background: var(--nv-pane);
}
.nv-cardpreview-hero[data-kind='CHARACTER'] .nv-cardpreview-cover {
  position: relative; inset: auto; width: 296px; height: auto; aspect-ratio: 3 / 4;
  border-radius: 18px; object-fit: cover;
}
.nv-cardpreview-hero[data-kind='CHARACTER'] .nv-cardpreview-shade { display: none; }
.nv-cardpreview-hero[data-kind='CHARACTER'] .nv-cardpreview-copy { order: 2; color: var(--nv-primary-text); }
.nv-cardpreview-hero[data-kind='CHARACTER'] h1 { color: var(--nv-primary-text); font-size: 52px; }
.nv-cardpreview-hero[data-kind='CHARACTER'] p { color: var(--nv-secondary-text); }
.nv-cardpreview-hero[data-kind='CHARACTER'] .nv-cardpreview-kind { color: var(--nv-accent-deep); background: var(--nv-accent-soft); border-color: transparent; }
.nv-cardpreview-hero[data-kind='CHARACTER'] .nv-cardpreview-meta { color: var(--nv-secondary-text); }
.nv-cardpreview-hero[data-kind='CHARACTER'].nv-cardpreview-hero--noart { display: block; }
.nv-cardpreview-hero--noart {
  background: linear-gradient(160deg, var(--nv-surface), var(--nv-accent-soft));
  color: var(--nv-primary-text);
}
.nv-cardpreview-hero--noart .nv-cardpreview-shade { display: none; }
.nv-cardpreview-hero--noart .nv-cardpreview-kind { color: var(--nv-accent-deep); background: var(--nv-accent-soft); border-color: transparent; }
.nv-cardpreview-hero--noart h1 { color: var(--nv-primary-text); }
.nv-cardpreview-hero--noart p { color: var(--nv-secondary-text); }
.nv-cardpreview-hero--noart .nv-cardpreview-meta { color: var(--nv-secondary-text); }
.nv-cardpreview-up { display: block; margin-bottom: 9px; border: 0; background: none; padding: 0; color: var(--nv-accent-deep); font-size: 11.5px; cursor: pointer; }
.nv-cardpreview-cast { margin-top: 24px; }
.nv-cardpreview-cast h2 { font-size: 14px; font-weight: 700; margin-bottom: 10px; }
.nv-cardpreview-castrow { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 12px; }
.nv-cardpreview-castcard {
  display: flex; align-items: center; gap: 10px; border: 0.5px solid var(--nv-divider);
  border-radius: 14px; background: var(--nv-surface); padding: 10px;
  text-align: left; font: inherit; color: inherit; cursor: pointer;
}
.nv-cardpreview-castcard:hover { border-color: var(--nv-accent); }
.nv-cardpreview-castart {
  width: 54px; height: 66px; flex: none; border-radius: 9px;
  background: var(--nv-accent-soft) center / cover no-repeat;
  display: grid; place-items: center; color: var(--nv-accent-deep); font-size: 20px; font-weight: 700;
}
.nv-cardpreview-castcopy { min-width: 0; }
.nv-cardpreview-castcopy strong { display: block; font-size: 13px; }
.nv-cardpreview-castcopy small {
  display: -webkit-box; margin-top: 2px; font-size: 10.5px; line-height: 1.45;
  color: var(--nv-secondary-text); -webkit-line-clamp: 2; -webkit-box-orient: vertical; overflow: hidden;
}
.nv-cardpreview-layout { display: grid; grid-template-columns: 168px minmax(0, 1fr); gap: 52px; margin-top: 26px; }
.nv-cardpreview-toc { position: sticky; top: 18px; align-self: start; display: flex; flex-direction: column; gap: 1px; }
.nv-cardpreview-toc button {
  border: 0; background: none; text-align: left; padding: 7px 0 7px 12px;
  border-left: 2px solid transparent; font-size: 12px; color: var(--nv-secondary-text); cursor: pointer;
}
.nv-cardpreview-toc button:hover { color: var(--nv-primary-text); }
.nv-cardpreview-toc button.is-on { color: var(--nv-primary-text); border-left-color: var(--nv-accent); font-weight: 650; }
.nv-cardpreview-content { min-width: 0; }
.nv-cardpreview-section { padding: 26px 0 30px; border-top: 0.5px solid var(--nv-divider); scroll-margin-top: 20px; }
.nv-cardpreview-section:first-child { border-top: 0; padding-top: 4px; }
.nv-cardpreview-section h2 { font-size: 17px; font-weight: 750; margin-bottom: 14px; }
.nv-cardpreview-section--nested { padding-left: 18px; border-left: 0.5px solid var(--nv-divider); }
.nv-cardpreview-section .nv-modbox { border: 0; background: transparent; padding: 0; max-width: none; }
.nv-cardpreview-section .nv-modbox-body { padding: 0; max-width: none; }
.nv-cardpreview-section .nv-modbox-map { min-height: 320px; }
.nv-cardpreview-missing { flex: 1; display: grid; place-items: center; color: var(--nv-secondary-text); font-size: 13px; }
/* Reading mode hides the widgets' write chrome; the card content stays. */
.nv-readonly .nv-tl-first,
.nv-readonly .nv-tldiary-first,
.nv-readonly .nv-tldiary-add,
.nv-readonly .nv-tld-add,
.nv-readonly .nv-wg-add,
.nv-readonly .nv-tlset,
.nv-readonly .nv-tld-done,
.nv-readonly .nv-tld-del,
.nv-readonly .nv-tlg-del,
.nv-readonly .nv-tldiary-actions,
.nv-readonly .nv-coll-add,
.nv-readonly .nv-coll-addtile,
.nv-readonly .nv-coll-chipadd,
.nv-readonly .nv-scene-add { display: none !important; }
.nv-readonly .nv-tld-title,
.nv-readonly .nv-tld-bodyedit,
.nv-readonly .nv-tld-eranamein,
.nv-readonly .nv-tld-meta select,
.nv-readonly .nv-tld-meta input {
  border: 0 !important; background: transparent !important; padding: 0 !important;
  box-shadow: none !important; pointer-events: none !important; resize: none !important;
}

@media (max-width: 1080px) {
  .nv-me-masonry-worlds { columns: 2; }
  .nv-me-masonry-chars { columns: 3; }
  .nv-cardpreview-layout { grid-template-columns: 142px minmax(0, 1fr); gap: 34px; }
}
@media (max-width: 880px) {
  .nv-me-masonry-chars { columns: 2; }
  .nv-me-grid { grid-template-columns: repeat(auto-fill, minmax(180px, 1fr)); }
  .nv-cardpreview-layout { grid-template-columns: 1fr; gap: 0; }
  .nv-cardpreview-toc {
    position: static; flex-direction: row; flex-wrap: wrap; gap: 4px;
    padding-bottom: 8px; border-bottom: 0.5px solid var(--nv-divider);
  }
  .nv-cardpreview-toc button { border-left: 0; border-bottom: 2px solid transparent; padding: 6px 8px; }
  .nv-cardpreview-toc button.is-on { border-left: 0; border-bottom-color: var(--nv-accent); }
  .nv-cardpreview-castrow { grid-template-columns: 1fr 1fr; }
}
@media (max-width: 660px) {
  .nv-me-masonry-worlds, .nv-me-masonry-chars { columns: 1; }
  .nv-me-profile { display: grid; grid-template-columns: 56px minmax(0, 1fr); gap: 12px 14px; align-items: start; }
  .nv-me-active { scroll-margin-top: 220px; }
  .nv-me-profile .nv-btn-ghost { grid-column: 1 / -1; justify-self: start; }
  .nv-me-avatar { width: 56px; height: 56px; font-size: 20px; }
  .nv-me-gallery-head { flex-wrap: wrap; }
  .nv-me-shelf { grid-template-columns: 1fr; }
  .nv-me-grid, .nv-me-grid-chars { grid-template-columns: 1fr 1fr; }
  .nv-cardpreview-bar { padding: 10px 16px; }
  .nv-cardpreview-inner { padding: 16px 18px 56px; }
  .nv-cardpreview-hero { min-height: 280px; padding: 24px; border-radius: 18px; }
  .nv-cardpreview-hero h1 { font-size: 36px; }
  .nv-cardpreview-hero[data-kind='CHARACTER'] { display: block; padding: 24px; }
  .nv-cardpreview-hero[data-kind='CHARACTER'] .nv-cardpreview-cover { width: 180px; margin-bottom: 18px; }
  .nv-cardpreview-hero[data-kind='CHARACTER'] h1 { font-size: 40px; }
  .nv-cardpreview-castrow { grid-template-columns: 1fr; }
}
@media (hover: none) {
  .nv-me-card-actions, .nv-me-libmore summary { opacity: 1; }
}
@media (prefers-reduced-motion: reduce) {
  .nv-me-card, .nv-me-cover, .nv-me-libbox, .nv-cardpreview-cover { transition: none !important; }
  .nv-me-skel { animation: none !important; }
}
/* ===== 设定页：封面 + 身份 + 页签 + 模块成品页 ===== */
.nv-setting { width: min(1120px, calc(100% - 40px)); margin: 0 auto; padding: 16px 0 60px; }
.nv-set-hero { position: relative; height: 320px; border-radius: 26px; overflow: hidden; background: var(--nv-canvas); box-shadow: 0 24px 60px rgba(20, 28, 24, .18); }
.nv-set-cover { position: absolute; inset: 0; width: 100%; height: 100%; object-fit: cover; display: block; }
.nv-set-coverfallback { position: absolute; inset: 0; display: block; overflow: hidden; }
.nv-set-coverfallback[data-kind='WORLD'] {
  background:
    radial-gradient(120% 90% at 72% 10%, rgba(186, 255, 226, .55), transparent 58%),
    linear-gradient(180deg, #193746 0%, #2A5B60 48%, #9ED2BE 100%);
}
.nv-set-coverfallback[data-kind='WORLD']::after {
  content: ''; position: absolute; left: -5%; right: -5%; bottom: -1px; height: 58%;
  background: #0E2226; opacity: .8;
  clip-path: polygon(0 72%, 16% 46%, 31% 64%, 47% 32%, 63% 56%, 79% 38%, 100% 64%, 100% 100%, 0 100%);
}
.nv-set-coverfallback[data-kind='CHARACTER'] {
  background:
    radial-gradient(70% 50% at 50% 34%, rgba(235, 255, 255, .46), transparent 70%),
    linear-gradient(165deg, #B9DCE8 0%, #6FA3B8 45%, #2E5366 100%);
}
.nv-set-heroshade { position: absolute; inset: 0; pointer-events: none; background: linear-gradient(180deg, rgba(6, 14, 12, .1) 18%, rgba(6, 14, 12, .28) 58%, rgba(6, 14, 12, .62) 100%); }
.nv-set-top { position: absolute; top: 12px; left: 14px; right: 14px; z-index: 3; display: flex; align-items: center; gap: 8px; }
.nv-set-back {
  display: inline-flex; align-items: center; gap: 6px; max-width: 60%;
  border: 1px solid rgba(255, 255, 255, .26); border-radius: 999px;
  background: rgba(18, 24, 22, .34); color: #fff; padding: 6px 12px;
  font: inherit; font-size: 11.5px; font-weight: 600; cursor: pointer;
  backdrop-filter: blur(10px); white-space: nowrap; overflow: hidden; text-overflow: ellipsis;
}
.nv-set-back:hover { background: rgba(18, 24, 22, .5); }
.nv-set-topright { margin-left: auto; display: flex; align-items: center; gap: 6px; }
.nv-set-topright .nv-cardpage-more {
  width: 32px; height: 32px; display: grid; place-items: center;
  border: 1px solid rgba(255, 255, 255, .26); border-radius: 50%;
  background: rgba(18, 24, 22, .34); color: #fff; backdrop-filter: blur(10px);
}
.nv-set-topright .nv-cardpage-more:hover { background: rgba(18, 24, 22, .5); color: #fff; }
.nv-set-pill {
  padding: 4px 9px; border-radius: 999px; border: 1px solid rgba(255, 255, 255, .24);
  background: rgba(18, 24, 22, .36); color: #fff; font-size: 10px; font-weight: 600;
  backdrop-filter: blur(10px);
}
.nv-set-identity { position: relative; z-index: 2; display: flex; align-items: flex-end; gap: 18px; margin: -42px 34px 0; }
.nv-set-logo {
  width: 86px; height: 86px; flex: none; border-radius: 20px; overflow: hidden;
  display: grid; place-items: center; border: 3px solid var(--nv-surface);
  background: var(--nv-accent-soft); color: var(--nv-accent-deep);
  font-size: 30px; font-weight: 700; box-shadow: 0 10px 26px rgba(20, 28, 24, .16);
}
.nv-set-logo img { width: 100%; height: 100%; object-fit: cover; display: block; }
.nv-set-id { flex: 1; min-width: 0; padding-bottom: 2px; }
.nv-set-kind { display: block; font-size: 10px; font-weight: 700; letter-spacing: .14em; text-transform: uppercase; color: var(--nv-secondary-text); }
.nv-set-name { margin: 2px 0 0; font-size: 32px; line-height: 1.16; font-weight: 600; letter-spacing: -.02em; }
.nv-set-rename {
  display: block; width: 100%; margin-top: 2px; font-size: 32px; line-height: 1.16;
  font-weight: 600; letter-spacing: -.02em; border: 0; border-bottom: 2px solid var(--nv-accent);
  background: none; color: var(--nv-primary-text); outline: none;
}
.nv-set-meta { margin-top: 4px; font-size: 11.5px; color: var(--nv-secondary-text); }
.nv-set-tags { display: flex; flex-wrap: wrap; gap: 7px; margin: 14px 34px 0; }
.nv-set-tag { padding: 4px 10px; border-radius: 999px; border: 1px solid var(--nv-divider); background: var(--nv-surface); color: var(--nv-secondary-text); font-size: 11px; }
button.nv-set-logo { padding: 0; cursor: pointer; font: inherit; }
.nv-set-imgact {
  border: 1px solid rgba(255, 255, 255, .26); border-radius: 999px; padding: 4px 10px;
  background: rgba(18, 24, 22, .36); color: #fff; font: inherit; font-size: 10px; font-weight: 600;
  cursor: pointer; backdrop-filter: blur(10px);
}
.nv-set-imgact:hover { background: rgba(18, 24, 22, .5); }
.nv-set-tags .nv-set-tag { display: inline-flex; align-items: center; gap: 3px; padding-right: 5px; }
.nv-set-tag button { border: 0; background: none; padding: 0 2px; color: var(--nv-secondary-text); font: inherit; cursor: pointer; }
.nv-set-tag button:hover { color: var(--nv-danger); }
.nv-set-tagadd {
  border: 1px dashed var(--nv-divider); border-radius: 999px; padding: 4px 10px; font: inherit;
  font-size: 11px; color: var(--nv-secondary-text); background: none; cursor: pointer;
}
.nv-set-tagadd:hover { border-color: var(--nv-accent); color: var(--nv-accent-deep); }
.nv-set-taginput {
  width: 104px; border: 1px solid var(--nv-accent); border-radius: 999px; padding: 4px 10px;
  font: inherit; font-size: 11px; background: var(--nv-surface); color: var(--nv-primary-text); outline: none;
}
.nv-set-roleinput {
  margin: 8px 34px 0; border: 1px solid var(--nv-accent); border-radius: 8px; padding: 6px 10px;
  font: inherit; font-size: 12px; background: var(--nv-surface); color: var(--nv-primary-text); outline: none;
}
.nv-set-tabs {
  position: sticky; top: 0; z-index: 5; display: flex; gap: 2px; overflow-x: auto;
  margin-top: 18px; padding: 0 34px;
  background: color-mix(in srgb, var(--nv-surface) 34%, transparent);
  backdrop-filter: blur(14px); border-bottom: 1px solid var(--nv-divider);
  scrollbar-width: none;
}
.nv-set-tabs::-webkit-scrollbar { display: none; }
.nv-set-tab {
  flex: none; border: 0; background: none; padding: 12px 12px 10px;
  font: inherit; font-size: 13px; color: var(--nv-secondary-text);
  border-bottom: 2px solid transparent; margin-bottom: -1px; cursor: pointer;
  transition: color var(--nv-dur-micro), border-color var(--nv-dur-micro);
}
.nv-set-tab:hover { color: var(--nv-primary-text); }
.nv-set-tab[data-active] { color: var(--nv-primary-text); font-weight: 600; border-bottom-color: var(--nv-accent); }
.nv-set-lower { position: relative; border-radius: 0 0 26px 26px; }
.nv-set-lowerbg { position: absolute; inset: 0; overflow: hidden; border-radius: inherit; }
.nv-set-lowercontent { position: relative; z-index: 2; display: flex; flex-direction: column; }
.nv-set-content { position: relative; min-height: 460px; padding: 30px 36px 46px; touch-action: pan-y; }
.nv-set-bg { position: absolute; inset: -9%; background-size: cover; background-position: center; filter: blur(34px) saturate(.9); opacity: .55; transform: scale(1.06); }
.nv-set-bg-fallback { inset: 0; filter: none; opacity: 1; transform: none; }
.nv-set-bg-fallback[data-kind='WORLD'] {
  background:
    radial-gradient(120% 90% at 72% 10%, rgba(186, 255, 226, .45), transparent 58%),
    linear-gradient(180deg, #B9D8CD 0%, #CEE3DB 55%, #E4EEE9 100%);
}
.nv-set-bg-fallback[data-kind='CHARACTER'] {
  background:
    radial-gradient(70% 50% at 50% 34%, rgba(235, 255, 255, .5), transparent 70%),
    linear-gradient(165deg, #B9DCE8 0%, #9BC3D4 45%, #7EA3B8 100%);
}
.nv-set-tint {
  position: absolute; inset: 0; pointer-events: none;
  background: linear-gradient(180deg, rgba(248, 250, 247, .08), rgba(20, 36, 30, .16));
  transition: background var(--nv-dur-ui) ease;
}
.nv-set-lower[data-template='map'] .nv-set-tint { background: linear-gradient(180deg, rgba(216, 238, 228, .3), rgba(30, 80, 62, .16)); }
.nv-set-lower[data-template='timeline'] .nv-set-tint { background: linear-gradient(180deg, rgba(32, 66, 66, .22), rgba(8, 24, 24, .3)); }
.nv-set-lower[data-template='gallery'] .nv-set-tint { background: linear-gradient(180deg, rgba(246, 230, 204, .32), rgba(90, 70, 40, .16)); }
.nv-set-lower[data-template='profile'] .nv-set-tint { background: linear-gradient(180deg, rgba(214, 234, 246, .3), rgba(40, 70, 90, .14)); }
.nv-set-lower[data-template='collection'] .nv-set-tint { background: linear-gradient(180deg, rgba(218, 234, 226, .3), rgba(40, 80, 60, .14)); }
.nv-set-lower[data-template='characters'] .nv-set-tint { background: linear-gradient(180deg, rgba(238, 230, 214, .3), rgba(80, 60, 40, .14)); }
.nv-set-veil { position: absolute; inset: 0; pointer-events: none; background: color-mix(in srgb, var(--nv-surface) 74%, transparent); backdrop-filter: blur(16px) saturate(1.04); }
.nv-set-body { position: relative; z-index: 2; max-width: 980px; margin: 0 auto; animation: nv-set-in var(--nv-dur-ui) var(--nv-ease-out); }
@keyframes nv-set-in { from { opacity: .35; transform: translateY(6px); } to { opacity: 1; transform: none; } }
.nv-set-tabhead { display: flex; align-items: flex-end; justify-content: space-between; gap: 16px; margin-bottom: 16px; }
.nv-set-tabhead h2 { font-size: 22px; font-weight: 600; letter-spacing: -.02em; }
.nv-set-edit {
  flex: none; border: 1px solid var(--nv-divider); border-radius: 999px;
  background: color-mix(in srgb, var(--nv-surface) 80%, transparent); color: var(--nv-primary-text);
  padding: 6px 13px; font: inherit; font-size: 11.5px; font-weight: 600; cursor: pointer;
}
.nv-set-edit:hover { border-color: var(--nv-accent); color: var(--nv-accent-deep); }
.nv-set-count { font-size: 12px; color: var(--nv-secondary-text); }
.nv-set-fields { display: flex; flex-direction: column; gap: 14px; }
.nv-set-field {
  border: 1px solid var(--nv-divider); border-radius: 16px;
  background: color-mix(in srgb, var(--nv-surface) 92%, transparent);
  padding: 16px 20px; box-shadow: 0 8px 24px rgba(16, 24, 20, .05);
}
.nv-set-label { display: block; margin-bottom: 6px; font-size: 10.5px; font-weight: 600; letter-spacing: .04em; color: var(--nv-secondary-text); }
.nv-set-value { font-size: 18px; font-weight: 600; }
.nv-set-field-body { padding-bottom: 10px; }
.nv-set-text { font-size: 14px; line-height: 1.9; }
.nv-set-text .nv-card-bn .bn-editor { padding: 0; max-width: none; min-height: 0; }
.nv-set-module { position: relative; }
.nv-set-module .nv-page-children { display: none; }
.nv-set-module .nv-modbox { margin: 0; }
.nv-set-module .nv-modbox[data-readonly] .nv-wg-actions,
.nv-set-module .nv-modbox[data-readonly] .nv-wg-add,
.nv-set-module .nv-modbox[data-readonly] .nv-tldiary-add,
.nv-set-module .nv-modbox[data-readonly] .nv-tld-add,
.nv-set-module .nv-modbox[data-readonly] .nv-scene-add,
.nv-set-module .nv-modbox[data-readonly] .nv-coll-add,
.nv-set-module .nv-modbox[data-readonly] .nv-coll-chipadd,
.nv-set-module .nv-modbox[data-readonly] .nv-graphview-add,
.nv-set-module .nv-modbox[data-readonly] .nv-read-add { display: none; }
.nv-set-empty {
  padding: 20px; border: 1px dashed var(--nv-divider); border-radius: 14px;
  color: var(--nv-secondary-text); font-size: 12.5px; text-align: center;
  background: color-mix(in srgb, var(--nv-surface) 55%, transparent);
}
.nv-set-timeline { display: flex; flex-direction: column; gap: 14px; }
.nv-set-eras { display: flex; flex-wrap: wrap; gap: 6px; }
.nv-set-era {
  padding: 3px 9px; border-radius: 999px; border: 1px solid var(--nv-divider);
  background: color-mix(in srgb, var(--nv-surface) 70%, transparent);
  font-size: 10px; color: var(--nv-secondary-text);
}
.nv-set-events { position: relative; list-style: none; margin: 0; padding: 2px 0 0 18px; }
.nv-set-events::before { content: ''; position: absolute; left: 5px; top: 6px; bottom: 8px; width: 1px; background: var(--nv-divider); }
.nv-set-event { position: relative; padding: 0 0 18px; }
.nv-set-event:last-child { padding-bottom: 0; }
.nv-set-eventdot {
  position: absolute; left: -18px; top: 5px; width: 9px; height: 9px;
  border-radius: 50%; background: var(--nv-accent); box-shadow: 0 0 0 3px var(--nv-accent-soft);
}
.nv-set-eventbody { min-width: 0; }
.nv-set-eventtop { display: flex; align-items: baseline; justify-content: space-between; gap: 12px; }
.nv-set-eventtop b { font-size: 13.5px; font-weight: 600; }
.nv-set-eventtop time { flex: none; font-size: 10px; color: var(--nv-secondary-text); font-variant-numeric: tabular-nums; }
.nv-set-event p { margin: 5px 0 0; font-size: 12px; line-height: 1.7; color: var(--nv-secondary-text); }
.nv-set-eventmeta { display: flex; flex-wrap: wrap; gap: 5px; margin-top: 6px; }
.nv-set-eventmeta span { padding: 2px 7px; border-radius: 999px; background: var(--nv-accent-soft); color: var(--nv-accent-deep); font-size: 9.5px; }
.nv-set-profile {
  display: flex; align-items: flex-start; gap: 18px; padding: 18px;
  border: 1px solid var(--nv-divider); border-radius: 16px;
  background: color-mix(in srgb, var(--nv-surface) 90%, transparent);
  box-shadow: 0 8px 24px rgba(16, 24, 20, .05);
}
.nv-set-profileart { width: 178px; max-width: 40%; flex: none; aspect-ratio: 3 / 4; object-fit: cover; border-radius: 12px; }
.nv-set-profilebody { flex: 1; min-width: 0; }
.nv-set-profilebody h3 { font-size: 20px; font-weight: 600; letter-spacing: -.02em; }
.nv-set-profilebody p { margin-top: 6px; font-size: 12px; line-height: 1.75; color: var(--nv-secondary-text); }
.nv-set-facts { display: grid; grid-template-columns: 74px minmax(0, 1fr); gap: 7px 12px; margin: 14px 0 0; }
.nv-set-facts div { display: contents; }
.nv-set-facts dt { font-size: 10.5px; color: var(--nv-secondary-text); }
.nv-set-facts dd { font-size: 12.5px; }
.nv-set-gallery { display: grid; grid-template-columns: repeat(2, 1fr); gap: 10px; }
.nv-set-galleryitem { margin: 0; }
.nv-set-galleryitem img, .nv-set-galleryph {
  display: block; width: 100%; aspect-ratio: 4 / 3; object-fit: cover;
  border-radius: 12px; background: var(--nv-accent-soft);
}
.nv-set-galleryph { display: grid; place-items: center; color: var(--nv-accent-deep); font-size: 22px; font-weight: 700; }
.nv-set-galleryitem figcaption { margin-top: 5px; font-size: 10px; color: var(--nv-secondary-text); }
.nv-set-items { display: grid; grid-template-columns: repeat(2, 1fr); gap: 10px; }
.nv-set-item {
  display: flex; align-items: flex-start; gap: 10px; padding: 10px;
  border: 1px solid var(--nv-divider); border-radius: 14px;
  background: color-mix(in srgb, var(--nv-surface) 90%, transparent);
}
.nv-set-item > img { width: 56px; height: 70px; flex: none; object-fit: cover; border-radius: 9px; }
.nv-set-itembody { min-width: 0; }
.nv-set-itembody b { font-size: 12.5px; }
.nv-set-itembody p { margin-top: 4px; font-size: 10.5px; line-height: 1.6; color: var(--nv-secondary-text); display: -webkit-box; -webkit-line-clamp: 3; -webkit-box-orient: vertical; overflow: hidden; }
.nv-set-itemfacts { display: flex; flex-direction: column; gap: 2px; margin-top: 5px; font-size: 10px; color: var(--nv-secondary-text); }
.nv-set-itemfacts span { display: flex; gap: 5px; min-width: 0; }
.nv-set-itemfacts em { flex: none; font-style: normal; opacity: .68; }
.nv-set-chars { display: grid; grid-template-columns: repeat(3, 1fr); gap: 12px; }
.nv-set-char {
  display: flex; align-items: center; gap: 12px; padding: 10px;
  border: 1px solid var(--nv-divider); border-radius: 14px;
  background: color-mix(in srgb, var(--nv-surface) 90%, transparent);
  text-align: left; font: inherit; color: inherit; cursor: pointer;
  transition: transform var(--nv-dur-micro) var(--nv-ease-out), border-color var(--nv-dur-micro);
}
.nv-set-char:hover { transform: translateY(-2px); border-color: color-mix(in srgb, var(--nv-accent) 45%, transparent); }
.nv-set-charart {
  width: 62px; height: 78px; flex: none; border-radius: 10px; overflow: hidden;
  display: grid; place-items: center; background: var(--nv-accent-soft);
  color: var(--nv-accent-deep); font-size: 22px; font-weight: 700;
}
.nv-set-charart img { width: 100%; height: 100%; object-fit: cover; display: block; }
.nv-set-charinfo { min-width: 0; display: flex; flex-direction: column; gap: 3px; }
.nv-set-charinfo b { font-size: 13px; }
.nv-set-charinfo small { font-size: 10.5px; line-height: 1.55; color: var(--nv-secondary-text); display: -webkit-box; -webkit-line-clamp: 3; -webkit-box-orient: vertical; overflow: hidden; }
.nv-set-charmeta { font-size: 9.5px; color: var(--nv-secondary-text); opacity: .8; }
@media (max-width: 900px) {
  .nv-setting { width: calc(100% - 24px); padding-top: 8px; }
  .nv-set-hero { height: 260px; border-radius: 20px; }
  .nv-set-lower { border-radius: 0 0 20px 20px; }
  .nv-set-identity { margin: -36px 20px 0; gap: 13px; }
  .nv-set-logo { width: 72px; height: 72px; border-radius: 16px; font-size: 24px; }
  .nv-set-name, .nv-set-rename { font-size: 26px; }
  .nv-set-tags { margin-left: 20px; margin-right: 20px; }
  .nv-set-tabs { padding: 0 20px; }
  .nv-set-content { padding: 24px 20px 40px; }
  .nv-set-chars { grid-template-columns: 1fr 1fr; }
}
@media (max-width: 620px) {
  .nv-setting { width: calc(100% - 16px); padding-top: 6px; }
  .nv-set-hero { height: 220px; border-radius: 18px; }
  .nv-set-lower { border-radius: 0 0 18px 18px; }
  .nv-set-identity { margin: -30px 14px 0; gap: 10px; }
  .nv-set-logo { width: 62px; height: 62px; border-radius: 14px; font-size: 20px; border-width: 2px; }
  .nv-set-name, .nv-set-rename { font-size: 22px; }
  .nv-set-tags { margin-left: 14px; margin-right: 14px; }
  .nv-set-tabs { padding: 0 14px; }
  .nv-set-content { padding: 20px 14px 32px; }
  .nv-set-tabhead h2 { font-size: 19px; }
  .nv-set-profile { flex-direction: column; }
  .nv-set-profileart { width: 100%; max-width: none; aspect-ratio: 16 / 9; }
  .nv-set-chars { grid-template-columns: 1fr; }
  .nv-set-text .nv-card-bn .bn-editor { padding: 0; }
}
@media (prefers-reduced-motion: reduce) {
  .nv-set-body, .nv-set-tint { animation: none !important; transition: none !important; }
}

/* 关于与更新：版本、渠道、检查结果，保持设置页的单列阅读宽度。 */
.nv-upd { max-width: 720px; padding: 8px 0 40px; color: var(--nv-primary-text); }
.nv-upd-head { margin-bottom: 20px; }
.nv-upd-title { margin: 0 0 6px; font-size: 22px; line-height: 30px; font-weight: 650; }
.nv-upd-lead { margin: 0; font-size: 13px; line-height: 1.7; color: var(--nv-secondary-text); }
.nv-upd-card { border: 1px solid var(--nv-divider); border-radius: 14px; background: var(--nv-surface); padding: 16px 18px; margin-bottom: 14px; }
.nv-upd-row { display: flex; align-items: baseline; justify-content: space-between; gap: 16px; padding-bottom: 12px; }
.nv-upd-label { font-size: 12.5px; font-weight: 600; color: var(--nv-secondary-text); }
.nv-upd-value { font: 13px/1.4 ui-monospace, SFMono-Regular, Menlo, monospace; }
.nv-upd-field { padding: 12px 0; border-top: .5px solid var(--nv-divider); }
.nv-upd-channels { display: grid; grid-template-columns: 1fr 1fr; gap: 10px; margin-top: 8px; }
.nv-upd-channel { display: flex; flex-direction: column; gap: 3px; text-align: left; padding: 10px 12px; cursor: pointer;
  border: 1px solid var(--nv-divider); border-radius: 11px; background: var(--nv-surface); color: var(--nv-primary-text); font: inherit; }
.nv-upd-channel small { font-size: 11.5px; line-height: 1.55; color: var(--nv-secondary-text); }
.nv-upd-channel[data-on] { border-color: var(--nv-accent); background: var(--nv-accent-soft); }
.nv-upd-actions { display: flex; align-items: center; gap: 14px; padding-top: 12px; border-top: .5px solid var(--nv-divider); }
.nv-upd-check { display: inline-flex; align-items: center; justify-content: center; border: 0; border-radius: 9px;
  padding: 7px 14px; font: inherit; font-size: 12.5px; cursor: pointer; text-decoration: none;
  background: var(--nv-accent); color: #fff; }
.nv-upd-check:disabled { opacity: .6; cursor: default; }
.nv-upd-link { font-size: 12.5px; color: var(--nv-accent-deep); text-decoration: none; }
.nv-upd-link:hover { text-decoration: underline; }
.nv-upd-status { margin: 10px 0 0; font-size: 12.5px; line-height: 1.6; color: var(--nv-secondary-text); }
.nv-upd-status[data-status='error'] { color: var(--nv-danger); }
.nv-upd-status[data-status='available'] { color: var(--nv-accent-deep); font-weight: 600; }
.nv-upd-last { margin: 4px 0 0; font-size: 11.5px; color: var(--nv-secondary-text); }
.nv-upd-releasehead { display: flex; align-items: baseline; justify-content: space-between; gap: 12px; margin-bottom: 8px; }
.nv-upd-releasehead strong { font-size: 16px; }
.nv-upd-releasehead span { font-size: 11.5px; color: var(--nv-secondary-text); }
.nv-upd-notes { margin: 0 0 12px; font-size: 12.5px; line-height: 1.7; white-space: pre-wrap; color: var(--nv-secondary-text); }
.nv-upd-note { margin: 10px 0 18px; font-size: 11.5px; line-height: 1.7; color: var(--nv-secondary-text); }
.nv-upd-advanced { border-top: .5px solid var(--nv-divider); padding-top: 12px; font-size: 12.5px; color: var(--nv-secondary-text); }
.nv-upd-advanced summary { cursor: pointer; font-weight: 600; color: var(--nv-primary-text); }
.nv-upd-hint { margin: 8px 0; font-size: 11.5px; line-height: 1.65; }
.nv-upd-base { display: flex; gap: 8px; }
.nv-upd-base input { flex: 1; min-width: 0; border: 1px solid var(--nv-divider); border-radius: 8px;
  padding: 7px 9px; font: inherit; font-size: 12.5px; background: var(--nv-surface); color: var(--nv-primary-text); }
.nv-upd-base input:focus { outline: none; border-color: var(--nv-accent); }
.nv-upd-base button { border: 1px solid var(--nv-accent); border-radius: 8px; padding: 0 12px; background: var(--nv-surface);
  color: var(--nv-accent-deep); font: inherit; font-size: 12.5px; cursor: pointer; }

/* 外观设置沿用通用设置的 14/12px 字阶、16px 行距、细分隔线和轻选择器。 */
.nv-appearance { display: flex; flex-direction: column; width: 100%; max-width: 720px; max-height: calc(100vh - 96px); overflow-y: auto; color: var(--dsw-alias-label-primary); }
.nv-canvas-appearance { width: min(760px, calc(100vw - 32px)); max-height: calc(100vh - 64px); overflow-y: auto; }
.nv-ap-row { display: flex; align-items: center; gap: 24px; padding: 16px 0; border-bottom: .5px solid var(--dsw-alias-border-l2); }
.nv-ap-row-text { flex: 1; min-width: 0; display: flex; flex-direction: column; gap: 4px; padding-right: 24px; }
.nv-ap-title { overflow: hidden; text-overflow: ellipsis; font-size: 14px; font-weight: 400; line-height: 22px; color: var(--dsw-alias-label-primary); }
.nv-ap-description { font-size: 12px; font-weight: 400; line-height: 18px; color: var(--dsw-alias-label-tertiary); }
.nv-ap-control { flex: none; display: flex; align-items: center; justify-content: flex-end; max-width: 62%; }
.nv-ap-head .nv-ap-title { white-space: nowrap; }
.nv-ap-preview-row { padding: 0 0 16px; border-bottom: .5px solid var(--dsw-alias-border-l2); }
.nv-ap-scope-controls, .nv-ap-background-control, .nv-ap-avatar-controls { display: flex; align-items: center; justify-content: flex-end; flex-wrap: wrap; gap: 8px 12px; }
.nv-ap-select { min-width: 128px; max-width: 220px; height: 36px; padding: 0 12px; border: 0; border-radius: var(--dsw-radius-md);
  background: var(--dsw-alias-bg-module-platform); color: var(--dsw-alias-label-primary); font: inherit; font-size: 14px; line-height: 22px; cursor: pointer; }
.nv-ap-background-scope { min-width: 132px; }
.nv-ap-choice-list { display: flex; flex: none; gap: 10px; }
.nv-ap-choice { box-sizing: border-box; display: grid; place-items: center; width: 56px; height: 56px; padding: 0; border: .5px solid var(--nv-divider); border-radius: 12px; background: var(--nv-surface); color: var(--nv-primary-text); font: inherit; cursor: pointer; }
.nv-ap-choice[aria-pressed='true'] { background: var(--nv-surface); color: var(--nv-select); }
.nv-ap-default { background: #FFFFFF; color: #16181A; font-size: 12px; }
.nv-ap-default[aria-pressed='true'] { background: #FFFFFF; color: var(--nv-select); }
.nv-ap-add { font-size: 24px; line-height: 1; }
.nv-ap-select:hover { background: var(--dsw-alias-interactive-bg-hover); }
.nv-ap-quiet { border: 0; padding: 0; background: transparent; color: var(--dsw-alias-label-primary); font: inherit; font-size: 14px; line-height: 22px; cursor: pointer; }
.nv-ap-quiet:hover { color: var(--nv-accent-deep); }
.nv-ap-range-control { display: flex; align-items: center; gap: 12px; width: 240px; }
.nv-ap-range-control output { width: 42px; flex: none; text-align: right; color: var(--dsw-alias-label-secondary); font-size: 14px; line-height: 22px; font-variant-numeric: tabular-nums; }
.nv-ap-input { width: 240px; min-width: 0; height: 36px; padding: 0 12px; border: 0; border-radius: var(--dsw-radius-md);
  background: var(--dsw-alias-bg-module-platform); color: var(--dsw-alias-label-primary); font: inherit; font-size: 14px; line-height: 22px; }
.nv-ap-input::placeholder { color: var(--dsw-alias-label-caption); }
.nv-ap-inline-actions { display: flex; gap: 12px; }
.nv-ap-track-preferences { display: flex; align-items: center; justify-content: flex-end; flex-wrap: wrap; gap: 8px 12px; }
.nv-ap-track-preferences .nv-ap-range-control { flex: 1; min-width: 160px; }
.nv-ap-inline-check { display: inline-flex; align-items: center; gap: 6px; white-space: nowrap; }
.nv-ap-preset-list { display: flex; flex-wrap: wrap; gap: 8px 18px; padding: 0 0 16px; border-bottom: .5px solid var(--dsw-alias-border-l2); }
.nv-ap-preset-list:empty { display: none; }
.nv-ap-preset-list button { border: 0; padding: 0; background: transparent; color: var(--dsw-alias-label-primary); font: inherit; font-size: 14px; line-height: 22px; cursor: pointer; }
.nv-ap-preset-list button[aria-pressed='true'] { color: var(--nv-select); }
.nv-ap-error { margin: 0; padding: 16px 0; color: var(--nv-danger); font-size: 12px; line-height: 18px; }

/* 光缝：轨道只有一条细线，值的位置由短光晕表达，不画圆形滑块。 */
.nv-ap-light-range { width: 100%; height: 30px; margin: 0; appearance: none; -webkit-appearance: none; background: transparent; accent-color: var(--nv-accent); cursor: pointer; }
.nv-ap-light-range::-webkit-slider-runnable-track { height: 1px; background: linear-gradient(90deg, transparent, var(--nv-divider) 12%, var(--nv-divider) 88%, transparent); }
.nv-ap-light-range::-webkit-slider-thumb { width: 34px; height: 34px; margin-top: -16.5px; appearance: none; -webkit-appearance: none; border: 0; border-radius: 0;
  background: radial-gradient(ellipse at center, #f4fff9 0, var(--nv-accent) 2px, color-mix(in srgb, var(--nv-accent) 48%, transparent) 4px, color-mix(in srgb, var(--nv-accent) 12%, transparent) 9px, transparent 68%); }
.nv-ap-light-range::-moz-range-track { height: 1px; background: linear-gradient(90deg, transparent, var(--nv-divider) 12%, var(--nv-divider) 88%, transparent); }
.nv-ap-light-range::-moz-range-thumb { width: 34px; height: 34px; border: 0; border-radius: 0;
  background: radial-gradient(ellipse at center, #f4fff9 0, var(--nv-accent) 2px, color-mix(in srgb, var(--nv-accent) 48%, transparent) 4px, color-mix(in srgb, var(--nv-accent) 12%, transparent) 9px, transparent 68%); }

/* 当前效果：预览是辅助媒体，背景和模糊仍只作用于伪层。 */
.nv-ap-preview { position: relative; isolation: isolate; min-height: 184px; overflow: hidden; border-radius: 10px;
  background: var(--nv-canvas); color: var(--nv-primary-text); }
.nv-ap-preview::before { content: ''; position: absolute; z-index: -1; inset: calc(-1 * var(--nv-ap-blur));
  background-image: var(--nv-ap-image); background-position: var(--nv-ap-focus); background-size: cover; filter: blur(var(--nv-ap-blur)); }
.nv-ap-preview-top { display: flex; align-items: center; justify-content: space-between; padding: 10px 14px 4px; font-size: 12px; font-weight: 500; }
.nv-ap-preview-body { display: grid; grid-template-columns: 64px minmax(0, 1fr); gap: 10px; padding: 8px 14px 12px; }
.nv-ap-preview-nav { display: flex; flex-direction: column; gap: 6px; color: var(--nv-secondary-text); font-size: 11px; }
.nv-ap-preview-nav span:first-child { color: var(--nv-select); }
.nv-ap-preview-main { min-width: 0; }
.nv-ap-preview-card, .nv-ap-preview-input { display: flex; flex-direction: column; gap: 2px; margin-bottom: 6px; padding: 7px 10px; border-radius: 8px;
  background: rgb(255 255 255 / var(--nv-ap-alpha)); box-shadow: 0 4px 14px rgb(0 0 0 / .08); backdrop-filter: blur(14px); }
.nv-ap-preview[data-view='dark'] .nv-ap-preview-card, .nv-ap-preview[data-view='dark'] .nv-ap-preview-input { background: rgb(12 18 15 / var(--nv-ap-alpha)); }
.nv-ap-preview-card strong { font-size: 12px; font-weight: 500; }
.nv-ap-preview-card span, .nv-ap-preview-input { color: var(--nv-secondary-text); font-size: 11px; line-height: 16px; }
.nv-ap-preview-input { flex-direction: row; align-items: center; justify-content: space-between; margin: 8px 0 0; }
.nv-ap-preview-input b { display: grid; place-items: center; width: 20px; height: 20px; border-radius: 50%; background: var(--nv-accent); color: #10251c; font-weight: 400; }
@media (max-width: 560px) {
  .nv-ap-row { align-items: flex-start; flex-direction: column; gap: 10px; }
  .nv-ap-row-text { padding-right: 0; }
  .nv-ap-control { justify-content: flex-start; max-width: none; width: 100%; }
  .nv-ap-scope-controls, .nv-ap-background-control, .nv-ap-avatar-controls { justify-content: flex-start; }
  .nv-ap-select { max-width: 100%; }
  .nv-ap-range-control, .nv-ap-input { width: 100%; }
  .nv-ap-preview-body { grid-template-columns: 48px minmax(0, 1fr); }
}


/* WindowScene 独占外框材质；导航、品牌头、工作层和列宿主只暴露这一场景。
   内容列拥有唯一的圆角、细描边与裁切，叶只负责自己的文件背景。 */
html[data-noven-shell] [data-product-frame] { border-radius: 16px; }
html[data-noven-shell]:not(:is([data-platform='darwin'], [data-chrome-platform='darwin'])) [data-product-frame],
html[data-noven-shell][data-noven-shell-appearance] [data-product-frame] {
  background-color: var(--noven-shell-background-color, var(--dsw-specific-sidebar-fill));
}
html[data-noven-shell]:not(:is([data-platform='darwin'], [data-chrome-platform='darwin'])) [data-product-frame] [data-sidebar-col],
html[data-noven-shell]:not(:is([data-platform='darwin'], [data-chrome-platform='darwin'])) [data-product-frame] [data-work][data-mode-scene],
html[data-noven-shell][data-noven-shell-foreground] [data-product-frame] [data-sidebar-col],
html[data-noven-shell][data-noven-shell-foreground] [data-product-frame] [data-work][data-mode-scene] { background-color: transparent; }
html[data-noven-shell] [data-product-frame] [data-work],
html[data-noven-shell] [data-product-frame] [data-center-col],
html[data-noven-shell] [data-product-frame] [data-rightbar-col] { background-color: transparent; }
/* Foreground changes only recolor text; without a custom shell image or color,
   macOS keeps the native window material in every view and visibility. */
html[data-noven-shell]:is([data-platform='darwin'], [data-chrome-platform='darwin']):not([data-noven-shell-appearance]) [data-product-frame] {
  background-color: var(--dsh-window-material-tint);
}
html[data-noven-shell]:not(:is([data-platform='darwin'], [data-chrome-platform='darwin'])) [data-product-frame] [data-sidebar-col],
html[data-noven-shell][data-noven-shell-foreground] [data-product-frame] [data-sidebar-col] {
  background-image: none;
  box-shadow: none;
  backdrop-filter: none;
}
html[data-noven-shell] [data-product-frame] [data-work],
html[data-noven-shell] [data-product-frame] [data-sidebar-right-canvas-host],
html[data-noven-shell] [data-product-frame] [data-sidebar-right-canvas],
html[data-noven-shell] [data-product-frame] [data-sidebar-right-panel],
html[data-noven-shell] [data-product-frame] .nv-canvas { background-color: transparent; }
html[data-noven-shell] [data-product-frame] [data-work],
html[data-noven-shell] [data-product-frame] [data-sidebar-right-canvas-host],
html[data-noven-shell] [data-product-frame] [data-sidebar-right-canvas],
html[data-noven-shell] [data-product-frame] [data-sidebar-right-panel],
html[data-noven-shell] [data-product-frame] [data-sidebar-col],
html[data-noven-shell] [data-product-frame] [data-center-col],
html[data-noven-shell] [data-product-frame] [data-rightbar-col] { border: 0; }
html[data-noven-shell] [data-product-frame] .nv-leaf { background-color: var(--nv-surface); }
html[data-noven-shell] [data-product-frame] [data-conversation-root] {
  background-color: var(--noven-conversation-background-color, var(--nv-surface));
}
html[data-noven-shell] [data-product-frame] [data-conversation-root] header { border-bottom-color: transparent; }
/* 4px 外框缝与 4px 列间缝只计算一次；工具行和正文同属完整内容列。 */
html[data-noven-shell] [data-product-frame] [data-conversation-root],
html[data-noven-shell] [data-product-frame] .nv-create-page {
  box-sizing: border-box;
  overflow: hidden;
  margin: var(--dsh-product-content-inset, 4px);
  width: calc(100% - var(--dsh-product-content-inset, 4px) - var(--dsh-product-content-inset, 4px));
  height: calc(100% - var(--dsh-product-content-inset, 4px) - var(--dsh-product-content-inset, 4px));
  border: .5px solid var(--nv-divider);
  border-radius: 12px;
}
html[data-noven-shell] [data-product-frame] [data-unit-side='left'] [data-conversation-root],
html[data-noven-shell] [data-product-frame] [data-unit-side='left'] .nv-create-page {
  margin-left: 0;
  width: calc(100% - var(--dsh-product-content-inset, 4px));
}
html[data-noven-shell] [data-product-frame] .nv-canvas:not([data-canvas-fullscreen]) {
  box-sizing: border-box;
  overflow: hidden;
  margin: 0 var(--dsh-product-content-inset, 4px) var(--dsh-product-content-inset, 4px) 0;
  width: calc(100% - var(--dsh-product-content-inset, 4px));
  height: calc(100% - var(--dsh-product-content-inset, 4px));
  border: .5px solid var(--nv-divider);
  border-radius: 12px;
}
html[data-noven-shell] [data-product-frame] [data-unit-side='left'] .nv-canvas:not([data-canvas-fullscreen]) {
  margin-left: var(--dsh-product-content-inset, 4px);
  width: calc(100% - var(--dsh-product-content-inset, 4px) - var(--dsh-product-content-inset, 4px));
}
html[data-noven-shell] [data-product-frame] .nv-canvas[data-canvas-fullscreen] { border: 0; border-radius: 0; }
html[data-noven-shell] [data-product-frame] .nv-canvas:has(> .nv-leaf[data-noven-canvas-background='asset']),
html[data-noven-shell][data-noven-conversation-image] [data-product-frame] [data-conversation-root] { border-color: transparent; }
.nv-leaf { box-sizing: border-box; overflow: hidden; border: 0; border-radius: 0; }
.nv-split-bar { background: transparent; }
.nv-split-bar:hover { background: var(--nv-accent); }
.nv-leaf[data-noven-canvas-background] { --bn-colors-editor-background: transparent; }
.nv-leaf[data-noven-canvas-background] .nv-canvas-body,
.nv-leaf[data-noven-canvas-background] .nv-canvas-cardbody,
.nv-leaf[data-noven-canvas-background] .nv-doc-bn { background-color: transparent; }
.nv-leaf[data-noven-canvas-background] .nv-doc-bn .bn-editor { background-color: transparent !important; }
.nv-leaf[data-noven-canvas-blur] { position: relative; isolation: isolate; }
.nv-leaf[data-noven-canvas-blur]::before {
  content: ''; position: absolute; z-index: -1; inset: calc(-1 * var(--noven-canvas-background-blur, 0px));
  pointer-events: none; background-image: var(--noven-canvas-background-layer);
  background-position: var(--noven-canvas-background-position, center); background-size: cover;
  filter: blur(var(--noven-canvas-background-blur));
}

/* 外观作用域：只换 token，不重写控件。选中态继续走唯一的 --nv-select 规则。 */
html[data-noven-shell-skin] [data-product-frame] {
  --nv-surface: var(--noven-shell-skin-surface);
  --nv-pane: var(--noven-shell-skin-pane);
  --nv-canvas: var(--noven-shell-skin-canvas);
  --dsw-alias-bg-layer-1: var(--noven-shell-skin-bgLayer1);
  --dsw-alias-bg-layer-2: var(--noven-shell-skin-bgLayer2);
  --dsw-alias-button-floating-fill: var(--noven-shell-skin-floating);
  --dsw-alias-markdown-code-block: var(--noven-shell-skin-codeBlock);
  --dsl-code-block-background: var(--noven-shell-skin-codeBlockAlt);
}
html[data-noven-conversation-skin] [data-conversation-root] {
  --nv-surface: var(--noven-conversation-skin-surface);
  --nv-pane: var(--noven-conversation-skin-pane);
  --nv-canvas: var(--noven-conversation-skin-canvas);
  --dsw-alias-bg-layer-1: var(--noven-conversation-skin-bgLayer1);
  --dsw-alias-bg-layer-2: var(--noven-conversation-skin-bgLayer2);
  --dsw-alias-button-floating-fill: var(--noven-conversation-skin-floating);
  --dsw-alias-markdown-code-block: var(--noven-conversation-skin-codeBlock);
  --dsl-code-block-background: var(--noven-conversation-skin-codeBlockAlt);
}
html[data-noven-shell-skin] [data-product-frame] [data-center-col],
html[data-noven-shell-skin] [data-product-frame] [data-rightbar-col],
html[data-noven-shell-skin] [data-product-frame] [data-sidebar-right-canvas-host] {
  background: transparent;
  border-color: transparent;
}
html[data-noven-shell-foreground] [data-product-frame] {
  --nv-hover: var(--noven-shell-skin-hover);
  --nv-divider: var(--noven-shell-skin-divider);
  --nv-primary-text: var(--noven-shell-skin-primary);
  --nv-secondary-text: var(--noven-shell-skin-secondary);
  --nv-select: var(--noven-shell-skin-select);
  --nv-accent: var(--noven-shell-skin-accent);
  --nv-accent-deep: var(--noven-shell-skin-accentDeep);
  --nv-accent-soft: var(--noven-shell-skin-accentSoft);
  --dsw-alias-label-primary: var(--noven-shell-skin-labelPrimary);
  --dsw-alias-label-secondary: var(--noven-shell-skin-labelSecondary);
  --dsw-alias-label-caption: var(--noven-shell-skin-labelCaption);
  --dsw-alias-label-tertiary: var(--noven-shell-skin-labelTertiary);
  --dsw-alias-menu-icon: var(--noven-shell-skin-menuIcon);
  --dsw-alias-interactive-bg-hover: var(--noven-shell-skin-interactiveHover);
  --dsw-alias-border-l3: var(--noven-shell-skin-border);
  --dsw-focus-ring-color: var(--noven-shell-skin-focus);
  --dsw-alias-state-business-primary: var(--noven-shell-skin-business);
}
html[data-noven-conversation-foreground] [data-conversation-root] {
  --nv-hover: var(--noven-conversation-skin-hover);
  --nv-divider: var(--noven-conversation-skin-divider);
  --nv-primary-text: var(--noven-conversation-skin-primary);
  --nv-secondary-text: var(--noven-conversation-skin-secondary);
  --nv-select: var(--noven-conversation-skin-select);
  --nv-accent: var(--noven-conversation-skin-accent);
  --nv-accent-deep: var(--noven-conversation-skin-accentDeep);
  --nv-accent-soft: var(--noven-conversation-skin-accentSoft);
  --dsw-alias-label-primary: var(--noven-conversation-skin-labelPrimary);
  --dsw-alias-label-secondary: var(--noven-conversation-skin-labelSecondary);
  --dsw-alias-label-caption: var(--noven-conversation-skin-labelCaption);
  --dsw-alias-label-tertiary: var(--noven-conversation-skin-labelTertiary);
  --dsw-alias-menu-icon: var(--noven-conversation-skin-menuIcon);
  --dsw-alias-interactive-bg-hover: var(--noven-conversation-skin-interactiveHover);
  --dsw-alias-border-l3: var(--noven-conversation-skin-border);
  --dsw-focus-ring-color: var(--noven-conversation-skin-focus);
  --dsw-alias-state-business-primary: var(--noven-conversation-skin-business);
}

/* 外壳导航与品牌头共享连续背景；只有真实内容表面承担一次护化。 */
html[data-noven-shell-skin] [data-product-frame] [data-sidebar-col] {
  background: transparent;
  box-shadow: none;
  backdrop-filter: none;
}
html[data-noven-conversation-skin='frosted'] [data-conversation-root] [data-conversation-scroll] {
  border-radius: 18px;
  background: var(--noven-conversation-skin-island);
  box-shadow: var(--noven-conversation-skin-islandShadow);
  backdrop-filter: blur(20px) saturate(1.15);
}
html[data-noven-conversation-skin='frosted'] [data-conversation-root] [data-composer-card] {
  background: var(--noven-conversation-skin-island);
  box-shadow: var(--noven-conversation-skin-islandShadow);
  backdrop-filter: blur(20px) saturate(1.15);
}
.nv-leaf[data-noven-canvas-skin='frosted'] .nv-desk-tile,
.nv-leaf[data-noven-canvas-skin='frosted'] .nv-ed-main,
.nv-leaf[data-noven-canvas-skin='frosted'] .nv-cardpage,
.nv-leaf[data-noven-canvas-skin='frosted'] .nv-canvas-library,
.nv-leaf[data-noven-canvas-skin='frosted'] .nv-code-root {
  border-radius: 16px;
  background: var(--noven-skin-island);
  box-shadow: var(--noven-skin-island-shadow);
  backdrop-filter: blur(20px) saturate(1.15);
}
.nv-leaf[data-noven-canvas-skin='frosted'] .nv-code-root { box-sizing: border-box; padding: 12px; }

/* AI 头像只在配置后出现；默认不增加消息列宽或占位。 */
html[data-noven-assistant-avatar] [data-noven-assistant-answer] { position: relative; padding-left: 38px; }
html[data-noven-assistant-avatar] [data-noven-assistant-answer]::before {
  content: ''; position: absolute; left: 0; top: 2px; width: 28px; height: 28px; border-radius: 50%;
  background: var(--noven-assistant-avatar-image) center / cover no-repeat, var(--nv-surface);
  box-shadow: 0 0 0 1px var(--nv-divider);
}

`

/** Inject the Noven stylesheet once per document. */
export function injectNovenStyles(): void {
  if (typeof document === 'undefined') return
  if (document.documentElement.dataset.platform === undefined) {
    document.documentElement.dataset.chromePlatform = 'darwin'
  }
  document.documentElement.dataset.novenShell = 'true'
  const el = document.getElementById('noven-shell-css') ?? document.head.appendChild(
    Object.assign(document.createElement('style'), { id: 'noven-shell-css' }),
  )
  // Always refresh the payload: bundle hot-swaps otherwise keep the stale
  // sheet and newly added selectors render with raw platform chrome.
  if (el.textContent !== CSS) el.textContent = CSS
}
