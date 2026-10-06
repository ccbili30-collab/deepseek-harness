/**
 * Noven product stylesheet, injected once per document load. The plugin
 * bundle carries no CSS module pipeline, so the styles ship as one scoped
 * `<style>` element with `nv-` class names plus a small set of `--nv-*`
 * design tokens that mirror the approved design system.
 * @module noven-shell/client/style
 */

const CSS = `
:root {
  --nv-canvas: #F4F5F4;
  --nv-surface: #FFFFFF;
  --nv-divider: #ECEEEF;
  --nv-primary-text: #16181A;
  --nv-secondary-text: #8A8F94;
  --nv-accent: #34D399;
  --nv-accent-deep: #0E9F6E;
  --nv-accent-soft: rgba(52, 211, 153, 0.12);
  --nv-radius: 12px;
  --nv-badge-dark: rgba(20, 24, 22, 0.72);

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
.nv-page { height: 100%; min-height: 0; overflow-y: auto; background: var(--nv-surface); color: var(--nv-primary-text); font-size: 13px;
  animation: nv-page-in 340ms cubic-bezier(0.25, 0.6, 0.3, 1); }
/* Focus-in, not slide-in: the page resolves from a soft blur rather than
   flashing in from nothing. */
@keyframes nv-page-in {
  from { opacity: 0.45; filter: blur(4px); }
  to { opacity: 1; filter: blur(0); }
}
/* Outgoing-page clone: covers the swap frame, then lifts away so the old
   page exits instead of vanishing. Inner animations freeze so the ghost
   doesn't replay the entrance it already played. */
.nv-ghost { z-index: 60; }
.nv-ghost * { animation: none !important; }
.nv-ghost-out { opacity: 0; transform: translateY(-6px); transition: opacity 300ms ease-out, transform 300ms ease-out; }
.nv-inner { max-width: 1080px; margin: 0 auto; padding: 26px 32px 56px; display: flex; flex-direction: column; gap: 18px; }
.nv-inner--narrow { max-width: 760px; }
.nv-h1 { font-size: 20px; font-weight: 700; letter-spacing: -0.01em; }
.nv-sub { font-size: 13px; color: var(--nv-secondary-text); margin-top: 4px; }
.nv-h2 { font-size: 15px; font-weight: 700; }
.nv-card { background: var(--nv-surface); border: 0.5px solid var(--nv-divider); border-radius: var(--nv-radius); }
.nv-pill { display: inline-flex; align-items: center; gap: 5px; border: 0; border-radius: 999px; padding: 6px 16px; font-size: 13px; color: var(--nv-secondary-text); background: transparent; cursor: pointer; }
.nv-pill[data-active='true'] { background: var(--nv-primary-text); color: #fff; }
.nv-btn-primary { display: inline-flex; align-items: center; justify-content: center; gap: 6px; border: 0; border-radius: 999px; padding: 9px 20px; font-size: 13px; font-weight: 600; background: var(--nv-accent); color: #fff; cursor: pointer; }
.nv-btn-primary:hover { background: var(--nv-accent-deep); }
.nv-btn-primary:disabled { opacity: .5; cursor: default; }
.nv-btn-ghost { display: inline-flex; align-items: center; justify-content: center; gap: 6px; border: 1px solid var(--nv-divider); border-radius: 999px; padding: 8px 18px; font-size: 13px; background: var(--nv-surface); color: var(--nv-primary-text); cursor: pointer; }
.nv-btn-ghost:hover { border-color: var(--nv-secondary-text); }
.nv-btn-dark { display: inline-flex; align-items: center; justify-content: center; border: 0; border-radius: 999px; padding: 8px 20px; font-size: 13px; font-weight: 600; background: var(--nv-primary-text); color: #fff; cursor: pointer; }
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
.nv-feed-tab[data-active='true'] { color: var(--nv-primary-text); border-bottom-color: var(--nv-accent); }
.nv-feed-pills { display: flex; gap: 4px; background: var(--nv-surface); border: 0.5px solid var(--nv-divider); border-radius: 999px; padding: 3px; }
.nv-masonry { columns: 2; column-gap: 18px; }
/* Feed cards are objects: pure tiles with captions floating in the page air. */
.nv-tcard { break-inside: avoid; margin-bottom: 22px; display: flex; flex-direction: column; gap: 9px; width: 100%; padding: 0; border: 0; background: none; text-align: left; cursor: pointer; }
.nv-tcard-tile { position: relative; display: block; border-radius: 14px; overflow: hidden; transition: transform .18s ease, box-shadow .18s ease; }
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
.nv-landing { position: absolute; top: 0; right: 0; bottom: 0; width: 400px; background: var(--nv-surface); border-left: 0.5px solid var(--nv-divider); display: flex; flex-direction: column; animation: nv-slide-in .18s ease; z-index: 5; }
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

/* ===== 创作 ===== */
/* Creation slot shelf: pure artwork tiles, captions live in the page air below. */
.nv-slots { display: flex; gap: 18px; }
.nv-slot { display: flex; flex-direction: column; gap: 10px; width: 170px; padding: 0; border: 0; background: none; text-align: left; cursor: pointer;
  transition: width 300ms cubic-bezier(0.4, 0, 0.2, 1), opacity 240ms ease, transform 240ms ease, margin-right 300ms cubic-bezier(0.4, 0, 0.2, 1); }
/* Delete: dissolve.ts erodes the face pixel by pixel; the column collapses
   underneath the last sparks so neighbours drift into the gap. */
.nv-slot[data-leaving] { animation: none; pointer-events: none; }
.nv-slot[data-leaving] .nv-slot-tile { box-shadow: none; }
.nv-slot[data-leaving][data-collapse] { width: 0; margin-right: -18px; }
.nv-slot-tile { position: relative; display: flex; align-items: center; justify-content: center; aspect-ratio: 3/4; border-radius: 14px; overflow: hidden; background: var(--nv-surface); transition: transform .18s ease, box-shadow .18s ease; border: 0; padding: 0; cursor: pointer; width: 100%; appearance: none; -webkit-appearance: none; font: inherit; color: inherit; }
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
  border-radius: 5px; opacity: 0; transition: opacity 150ms ease;
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

/* Composer card — mirrors the conversation composer's card form. */
.nv-composer { display: flex; flex-direction: column; gap: 10px; background: var(--nv-surface); border: 0.5px solid var(--nv-divider); border-radius: 16px; padding: 12px 14px 8px; box-shadow: 0 6px 24px rgba(0,0,0,.05); }
.nv-composer-input { width: 100%; box-sizing: border-box; border: 0; outline: none; resize: none; background: none; font-family: inherit; font-size: 13.5px; line-height: 22px; color: var(--nv-primary-text); min-height: 44px; }
.nv-composer-input::placeholder { color: var(--nv-secondary-text); }
.nv-composer-bar { display: flex; align-items: center; justify-content: space-between; gap: 12px; }
.nv-composer-chips { display: flex; gap: 8px; }
.nv-composer-chip { display: inline-flex; align-items: center; gap: 5px; border: 0; border-radius: 999px; padding: 5px 12px; font-size: 12px; background: var(--nv-canvas); color: var(--nv-secondary-text); cursor: pointer; }
.nv-composer-chip:hover { background: var(--nv-accent-soft); color: var(--nv-accent-deep); }
.nv-send { width: 36px; height: 36px; border-radius: 50%; border: 0; background: var(--nv-accent); color: #fff; display: flex; align-items: center; justify-content: center; cursor: pointer; flex: none; }
.nv-send:disabled { opacity: .45; cursor: default; }

/* Bottom pair: quiet section labels over template tiles and the tools list. */
.nv-create-bottom { display: grid; grid-template-columns: 1.35fr 1fr; gap: 48px; margin-top: 6px; }
.nv-sec-label { font-size: 12px; font-weight: 600; color: var(--nv-secondary-text); margin-bottom: 10px; }
.nv-tpls { display: flex; gap: 14px; }
.nv-tpl { display: flex; flex-direction: column; gap: 7px; width: 132px; padding: 0; border: 0; background: none; text-align: left; cursor: pointer; }
.nv-tpl-cover { width: 100%; aspect-ratio: 16/10; border-radius: 10px; object-fit: cover; display: block; transition: transform .18s ease, box-shadow .18s ease; }
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
.nv-me-tab[data-active='true'] { color: var(--nv-primary-text); border-bottom-color: var(--nv-accent); }
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
.nv-profile-avatar { width: 68px; height: 68px; border-radius: 50%; overflow: hidden; border: 0; padding: 0; cursor: pointer; flex: none; }
.nv-profile-avatar img { width: 100%; height: 100%; object-fit: cover; display: block; }
.nv-profedit { display: flex; flex-direction: column; gap: 16px; }
.nv-profedit-field { display: flex; flex-direction: column; gap: 7px; }
.nv-profedit-label { font-size: 12px; font-weight: 600; color: var(--nv-secondary-text); }
.nv-profedit-avatars { display: flex; gap: 12px; }
.nv-profedit-avatar { width: 44px; height: 44px; border-radius: 50%; overflow: hidden; border: 2px solid transparent; padding: 0; cursor: pointer; }
.nv-profedit-avatar[data-active='true'] { border-color: var(--nv-accent); }
.nv-profedit-avatar img { width: 100%; height: 100%; object-fit: cover; display: block; }
.nv-profedit-input { border: 0.5px solid var(--nv-divider); border-radius: 9px; padding: 8px 12px; font-size: 13px; font-family: inherit; outline: none; background: var(--nv-surface); color: var(--nv-primary-text); }
.nv-profedit-input:focus { border-color: var(--nv-accent); }
.nv-profedit-area { resize: none; line-height: 1.6; }

/* 创作库 */
.nv-proj-pills { display: flex; gap: 8px; }
.nv-proj-pills .nv-pill { background: var(--nv-surface); border: 0.5px solid var(--nv-divider); color: var(--nv-primary-text); }
.nv-proj-pills .nv-pill[data-active='true'] { background: var(--nv-primary-text); border-color: var(--nv-primary-text); color: #fff; }
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
  border-radius: 6px; transition: color 150ms ease, background 150ms ease;
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
.nv-tree-chev { width: 16px; flex: none; border: 0; background: none; padding: 0; font-size: 11px; color: var(--nv-secondary-text); cursor: pointer; transition: transform .12s ease; }
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
.nv-doc p { font-size: 13.5px; line-height: 1.8; color: #3A3F3C; margin: 0 0 6px; }
.nv-doc img { width: 100%; border-radius: 10px; margin: 14px 0; display: block; }
.nv-side-tabs { display: flex; gap: 18px; padding: 14px 16px 0; }
.nv-side-tab { border: 0; background: none; padding: 0 0 8px; font-size: 13px; font-weight: 600; color: var(--nv-secondary-text); cursor: pointer; border-bottom: 2px solid transparent; }
.nv-side-tab[data-active='true'] { color: var(--nv-primary-text); border-bottom-color: var(--nv-accent); }
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
.nv-ed-menuitem[data-danger='true'] { color: #B3402E; }
.nv-ed-pick { position: fixed; z-index: 61; width: 264px; background: var(--nv-surface); border: 0.5px solid var(--nv-divider); border-radius: 12px; box-shadow: 0 10px 30px rgba(30,40,35,.14); padding: 10px; }
.nv-ed-pickgrid { display: grid; grid-template-columns: repeat(3, 1fr); gap: 6px; max-height: 220px; overflow-y: auto; }
.nv-ed-pickitem { padding: 0; border: 2px solid transparent; border-radius: 8px; overflow: hidden; cursor: pointer; aspect-ratio: 1; background: var(--nv-canvas); }
.nv-ed-pickitem img { width: 100%; height: 100%; object-fit: cover; display: block; }
.nv-ed-pickitem:hover { border-color: var(--nv-accent); }
.nv-ed-pickitem[data-active='true'] { border-color: var(--nv-accent); }
.nv-ed-pickempty { grid-column: 1 / -1; padding: 14px 8px; font-size: 12px; color: var(--nv-secondary-text); text-align: center; }
.nv-ed-pickclear { margin-top: 8px; width: 100%; border: 0.5px solid var(--nv-divider); border-radius: 8px; background: none; padding: 6px; font-size: 12.5px; color: #B3402E; cursor: pointer; }
.nv-ed-facebtn { position: absolute; right: 12px; bottom: 12px; width: 30px; height: 30px; border: 0; border-radius: 8px; background: rgba(255,255,255,.92); color: var(--nv-primary-text); font-size: 13px; cursor: pointer; box-shadow: 0 2px 8px rgba(30,40,35,.18); }
.nv-ed-facebtn:hover { background: #fff; }

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
.nv-ed-addpara { display: block; border: 0; background: none; padding: 2px 8px; margin: 0 -8px; border-radius: 6px; color: var(--nv-secondary-text); opacity: 0; cursor: pointer; font-size: 12px; transition: opacity .12s; }
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
.nv-ed-mrow[data-active='true'] { background: var(--nv-accent-soft); }
.nv-ed-mrow[data-active='true'] .nv-ed-mname { color: var(--nv-accent-deep); font-weight: 600; }
.nv-ed-mrow[data-dragging='true'] { opacity: .38; }
.nv-ed-mrow[data-inside='true'] { background: var(--nv-accent-soft); box-shadow: inset 0 0 0 1.5px var(--nv-accent); }
.nv-ed-mrow[data-drop='before']::before { content: ''; position: absolute; left: 8px; right: 8px; top: -1px; height: 2px; border-radius: 1px; background: var(--nv-accent); }
.nv-ed-mrow[data-drop='after']::after { content: ''; position: absolute; left: 8px; right: 8px; bottom: -1px; height: 2px; border-radius: 1px; background: var(--nv-accent); }
.nv-ed-dropline { height: 2px; border-radius: 1px; background: var(--nv-accent); margin: 2px 10px; }
.nv-ed-lift { position: fixed; left: 0; top: 0; z-index: 120; pointer-events: none; background: var(--nv-surface); border-radius: 10px; box-shadow: 0 14px 30px rgba(30,40,35,.22), 0 0 0 0.5px var(--nv-divider); opacity: .95; overflow: hidden; will-change: transform; }
.nv-ed-lift .nv-ed-sec { padding-left: 14px; padding-right: 14px; margin-top: 0; border-top: 0; }
.nv-ed-gap { flex: none; margin: 3px 12px; border-radius: 8px; background: var(--nv-accent-soft); animation: nv-ed-gapin .16s ease-out; }
.nv-ed-hgap { flex: none; align-self: stretch; margin: 4px 0; border-radius: 8px; background: var(--nv-accent-soft); animation: nv-ed-hgapin .16s ease-out; }
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
.nv-ed-wedit { position: absolute; top: 8px; right: 8px; width: 26px; height: 26px; border: 0.5px solid var(--nv-divider); border-radius: 7px; background: var(--nv-surface); color: var(--nv-secondary-text); cursor: pointer; opacity: 0; transition: opacity .12s; }
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
.nv-ed-tab[data-active='true'] { color: var(--nv-accent-deep); font-weight: 600; }
.nv-ed-tab[data-active='true']::after { content: ''; position: absolute; left: 13px; right: 13px; bottom: 2px; height: 2.5px; border-radius: 2px; background: var(--nv-accent); }
.nv-ed-tab[data-dragging='true'] { opacity: 0.4; }
.nv-ed-rail button[data-active='true'] { color: var(--nv-accent-deep); font-weight: 600; }
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
.nv-iconbtn[data-active='true'] { border-color: var(--nv-accent); color: var(--nv-accent-deep); background: var(--nv-accent-soft); }
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
.nv-wb-doc p { font-size: 13.5px; line-height: 1.85; color: #3A3F3C; }

/* ===== 会话顶栏卡片标签 ===== */
.nv-hchips { position: relative; display: inline-flex; align-items: center; gap: 6px; margin-left: 8px; }
.nv-hchips .nv-tag { vertical-align: middle; }
.nv-hchips-btn { border: 0; cursor: pointer; }
.nv-hchips-btn[data-active='true'] { border-color: var(--nv-accent); color: var(--nv-accent-deep); }
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

/* 设定 sidecar — 上半工件区 */
.nv-sidecar { display: flex; flex-direction: column; gap: 4px; padding: 4px 10px 20px; }
.nv-sidecar-status { display: flex; align-items: center; gap: 6px; padding: 8px 10px; font-size: 11.5px; color: var(--nv-secondary-text); }
.nv-sidecar-status[data-live] { color: var(--nv-accent); }
.nv-sidecar-touched { opacity: .75; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.nv-sidecar-empty { padding: 18px 10px; font-size: 12px; line-height: 1.7; color: var(--nv-secondary-text); }
.nv-sidecar-section h4 { display: flex; align-items: baseline; gap: 6px; margin: 10px 0 4px; padding: 0 2px; font-size: 11.5px; font-weight: 600; color: var(--nv-secondary-text); }
.nv-sidecar-count { font-weight: 400; opacity: .6; }
.nv-sidecar-entity { padding: 7px 10px; border-radius: 8px; }
.nv-sidecar-entity[data-draft] { background: color-mix(in srgb, var(--nv-accent) 7%, transparent); box-shadow: inset 0 0 0 1px color-mix(in srgb, var(--nv-accent) 22%, transparent); }
.nv-sidecar-entityhead { display: flex; align-items: center; gap: 8px; }
.nv-sidecar-name { font-size: 12.5px; font-weight: 600; }
.nv-sidecar-actions { margin-left: auto; display: flex; gap: 2px; }
.nv-sidecar-act { padding: 1px 8px; font-size: 11px; }
.nv-sidecar-note { margin-top: 2px; font-size: 11.5px; line-height: 1.55; color: var(--nv-secondary-text); }
.nv-sidecar-rel { padding: 3px 10px; font-size: 11.5px; color: var(--nv-secondary-text); }
.nv-sidecar-rel em { font-style: normal; margin: 0 4px; color: var(--nv-accent); }

/* 上下两段：实体区淡出，雾化过渡缝，下面就是平铺对话 */
.nv-sidecar { height: 100%; padding: 0; }
.nv-sidecar-topbar { display: flex; align-items: center; justify-content: space-between; padding: 2px 0 6px; }
.nv-sidecar-topbar-label { font-size: 11px; color: var(--nv-secondary-text); }
.nv-sidecar-top { flex: 0 1 auto; max-height: 54%; overflow-y: auto; padding: 4px 14px 40px;
  -webkit-mask-image: linear-gradient(#000 82%, transparent);
  mask-image: linear-gradient(#000 82%, transparent); }
.nv-sidecar-seam { flex: none; height: 30px; margin: -30px 0 0; position: relative; z-index: 2;
  backdrop-filter: blur(8px); -webkit-backdrop-filter: blur(8px);
  background: linear-gradient(rgba(249,250,251,0), rgba(249,250,251,.92) 55%, rgba(249,250,251,0)); }
.nv-sidecar-stream { flex: 1; min-height: 0; overflow-y: auto; padding: 6px 14px; display: flex; flex-direction: column; }
.nv-sidecar-msg { display: flex; align-items: baseline; gap: 6px; padding: 5px 0; }
.nv-sidecar-msgmark { color: var(--nv-accent); flex: none; transform: translateY(1.5px); }
.nv-sidecar-msgtext { font-size: 12.5px; line-height: 1.7; white-space: pre-wrap; color: var(--nv-primary-text); }
.nv-sidecar-msg[data-role="user"] { justify-content: flex-end; }
.nv-sidecar-msg[data-role="user"] .nv-sidecar-msgtext { color: var(--nv-secondary-text); font-size: 12px; }
.nv-sidecar-task { justify-content: flex-start; }
.nv-sidecar-task .nv-sidecar-msgtext { color: var(--nv-secondary-text); font-size: 11.5px; letter-spacing: .02em; }
.nv-sidecar-error { padding: 4px 14px 0; font-size: 11.5px; color: var(--nv-danger, #c0392b); }
.nv-sidecar-composer { display: flex; align-items: flex-end; gap: 6px; padding: 4px 14px 12px; }
.nv-sidecar-input { flex: 1; resize: none; border: 0; outline: none; background: #fff; border-radius: 10px; padding: 8px 11px; font-size: 12.5px; line-height: 1.5; font-family: inherit; box-shadow: 0 1px 3px rgba(0,0,0,.05); }
.nv-sidecar-input:focus { box-shadow: 0 0 0 1.5px color-mix(in srgb, var(--nv-accent) 45%, transparent); }
.nv-sidecar-send { flex: none; width: 30px; height: 30px; border-radius: 9px; color: var(--nv-secondary-text); }
.nv-sidecar-send:not(:disabled) { color: var(--nv-accent-deep); }
.nv-sidecar-send:disabled { opacity: .4; }
.nv-side-railbtn { display: flex; align-items: center; justify-content: center; width: 36px; height: 36px; margin: 6px auto; border: 0; border-radius: 9px; background: transparent; color: var(--nv-secondary-text); cursor: pointer; }
.nv-side-railbtn:hover { background: var(--nv-accent-soft); color: var(--nv-accent-deep); }
.nv-foot { display: flex; align-items: center; gap: 6px; width: 100%; padding: 2px 4px; }
.nv-foot-user { display: flex; align-items: center; gap: 8px; flex: 1; min-width: 0; border: 0; background: transparent; border-radius: 9px; padding: 5px 6px; cursor: pointer; text-align: left; }
.nv-foot-user:hover { background: var(--nv-accent-soft); }
.nv-foot-avatar { width: 26px; height: 26px; border-radius: 50%; object-fit: cover; display: block; background: var(--nv-accent-soft); flex: none; }
.nv-foot-avatar-fallback { display: inline-flex; align-items: center; justify-content: center; color: var(--nv-accent-deep); font-size: 12px; font-weight: 600; }
.nv-foot-name { font-size: 13px; font-weight: 500; color: var(--nv-primary-text); }
.nv-foot-gear { flex: none; }
.nv-foot-rail { display: block; margin: 4px auto; border: 0; background: transparent; padding: 3px; cursor: pointer; border-radius: 50%; }

/* 会话页：工具行 / 保存回执 / 斜杠胶囊 */
.nv-toolrow { display: inline-flex; align-items: center; gap: 6px; max-width: 100%; padding: 3px 10px; border-radius: 999px; background: var(--nv-surface); border: 0.5px solid var(--nv-divider); font-size: 12px; color: var(--nv-secondary-text); }
.nv-toolrow-icon { display: inline-flex; color: var(--nv-secondary-text); }
.nv-toolrow[data-tone="run"] .nv-toolrow-icon { color: var(--nv-accent-deep); animation: nv-spin 1s linear infinite; }
.nv-toolrow[data-tone="done"] .nv-toolrow-icon { color: var(--nv-accent-deep); }
.nv-toolrow[data-tone="error"] { border-color: #E8A0A0; color: #C0504D; }
.nv-toolrow[data-tone="error"] .nv-toolrow-icon { color: #C0504D; }
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

.nv-slash-chips { display: flex; flex: none; gap: 8px; padding: 0 4px; }
@keyframes nv-chip-in { from { opacity: 0; transform: translateX(-10px); } to { opacity: 1; transform: none; } }
.nv-slash-chip { display: inline-flex; align-items: center; flex: none; height: 26px; padding: 0 12px; border-radius: 999px; border: 0.5px solid var(--nv-divider); background: var(--nv-surface); font-size: 12.5px; white-space: nowrap; color: var(--nv-primary-text); cursor: pointer; animation: nv-chip-in .24s ease both; }
.nv-slash-chip:hover { border-color: var(--nv-accent); color: var(--nv-accent-deep); background: var(--nv-accent-soft); }

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
.nv-ctx-perm[data-on] { border-color: var(--nv-accent); color: var(--nv-accent-deep); background: var(--nv-accent-soft); }
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
.nv-stagechips .nv-pill[data-active='true'] { background: var(--nv-primary-text); border-color: var(--nv-primary-text); color: #fff; }
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

.nv-wdrawer { position: fixed; top: 0; right: 0; bottom: 0; width: 460px; max-width: 72%; background: var(--nv-surface); border-left: 0.5px solid var(--nv-divider); display: flex; flex-direction: column; animation: nv-slide-in .18s ease; z-index: 6; }
.nv-wdrawer-head { position: relative; display: flex; align-items: center; gap: 8px; padding: 16px 46px 12px 20px; border-bottom: 0.5px solid var(--nv-divider); }
.nv-wdrawer-head strong { font-size: 15px; }
.nv-wdrawer-scroll { flex: 1; min-height: 0; display: grid; grid-template-columns: 1fr 150px; }
.nv-wdrawer-preview { padding: 18px 20px; overflow-y: auto; border-right: 0.5px solid var(--nv-divider); }
.nv-wdrawer-preview img { width: 100%; border-radius: 10px; display: block; }
.nv-wdrawer-text { font-size: 13px; line-height: 1.8; color: #3A3F3C; white-space: pre-wrap; }
.nv-wdrawer-side { padding: 16px 14px; overflow-y: auto; display: flex; flex-direction: column; gap: 8px; }
.nv-wdrawer-side h4 { margin: 6px 0 2px; font-size: 11.5px; font-weight: 600; color: var(--nv-secondary-text); }
.nv-rev { display: flex; flex-direction: column; gap: 2px; padding: 8px 10px; border-radius: 9px; border: 0.5px solid var(--nv-divider); }
.nv-rev[data-current='true'] { border-color: var(--nv-accent); background: var(--nv-accent-soft); }
.nv-rev strong { font-size: 12.5px; }
.nv-rev small { font-size: 11px; color: var(--nv-secondary-text); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.nv-rev .nv-link { align-self: flex-start; font-size: 11.5px; }
.nv-wdrawer-links { display: flex; gap: 6px; flex-wrap: wrap; }
.nv-wdrawer-links .nv-tag { cursor: pointer; }
.nv-rev-src { font-size: 12px; color: var(--nv-secondary-text); line-height: 1.6; }
.nv-wdrawer-foot { display: flex; gap: 10px; padding: 12px 20px; border-top: 0.5px solid var(--nv-divider); }
.nv-wdrawer-foot .nv-btn-ghost { flex: 1; padding: 8px 10px; font-size: 12.5px; }
.nv-btn-ghost.nv-danger { color: #C0504D; }

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
.nv-pick-title, .nv-pick-namer { transition: opacity 220ms ease; }
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
  transition: opacity 200ms ease;
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
  transition: color 180ms ease;
}
.nv-pick-namer-go:hover { color: #A7F3D0; }
.nv-pick-namer-cancel {
  position: absolute; left: 50%; bottom: 56px; transform: translateX(-50%);
  appearance: none; -webkit-appearance: none;
  border: 0; padding: 4px; cursor: pointer;
  background: none; color: rgba(255, 255, 255, 0.4);
  font-size: 12px; font-weight: 400; letter-spacing: 0.18em;
  text-shadow: 0 0 10px rgba(255, 255, 255, 0.25);
  transition: color 180ms ease;
}
.nv-pick-namer-cancel:hover { color: rgba(255, 255, 255, 0.8); }

/* 功能台 zone label + enclosure — the upstream feature list owns no heading
   slot, so the product names the zone through the injected sheet. The zone
   carries its own border so reordering with the workbench zone never merges
   the two into one box. */
[data-zone='features'] { margin: 6px 8px; border: 0.5px solid var(--nv-divider); border-radius: var(--nv-radius); overflow: hidden; }
[data-zone='features']::before { content: '功能台'; display: block; padding: 8px 12px 2px; font-size: 11px; font-weight: 600; letter-spacing: .04em; color: var(--nv-secondary-text); }
/* Each zone carries its own enclosure, so the host hairline under the top
   zone would double the box edge — drop it. */
[data-zone='top']:not(:empty) { border-bottom: none; }

/* ---------- 新工作台外壳：左列内容树 / 中列画布标签页 / 右列对话 ---------- */

/* 左列内容树 */
.nv-tree { display: flex; flex-direction: column; height: 100%; min-height: 0; color: var(--nv-primary-text); }
.nv-tree-rail { align-items: center; padding-top: 8px; gap: 6px; }
.nv-tree-railbtn { display: flex; align-items: center; justify-content: center; width: 36px; height: 36px;
  border: 0; border-radius: 10px; background: none; color: var(--nv-primary-text);
  font-size: 13px; font-weight: 600; cursor: pointer; overflow: hidden; }
.nv-tree-railbtn:hover { background: var(--nv-hover); }
.nv-tree-head { padding: 10px 12px 6px; }
.nv-tree-project { display: flex; align-items: center; gap: 6px; width: 100%; border: 0; background: none;
  padding: 4px 6px; font-size: 14px; font-weight: 600; color: var(--nv-primary-text); cursor: pointer; border-radius: 8px; }
.nv-tree-project:hover { background: var(--nv-accent-soft); }
.nv-tree-projectname { flex: 1; text-align: left; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.nv-tree-caret { color: var(--nv-secondary-text); }
.nv-tree-search { padding: 0 12px 8px; }
.nv-tree-searchbox { width: 100%; border: 1px solid var(--nv-divider); border-radius: 8px; padding: 6px 10px;
  font-size: 12px; background: var(--dsw-alias-bg-layer-2, #F7F8F8); color: var(--nv-primary-text); outline: none; }
.nv-tree-searchbox:focus { border-color: var(--nv-accent); }
.nv-tree-scroll { flex: 1; min-height: 0; overflow-y: auto; padding: 0 6px 8px; }
.nv-tree-empty { padding: 40px 12px; text-align: center; color: var(--nv-secondary-text); font-size: 12px; }
.nv-tree-grouprow { display: flex; align-items: center; gap: 4px; width: 100%; border: 0; background: none;
  padding: 8px 6px 4px; font-size: 11px; color: var(--nv-secondary-text); cursor: pointer; }
.nv-tree-grouptitle { flex: 1; text-align: left; letter-spacing: 0.04em; }
.nv-tree-count { font-size: 10px; color: var(--nv-secondary-text); }
.nv-tree-fold { display: inline-block; width: 14px; color: var(--nv-secondary-text); transition: transform 120ms; }
.nv-tree-fold-on { transform: rotate(90deg); }
.nv-tree-row { display: flex; align-items: center; gap: 6px; width: 100%; border: 0; background: none;
  padding: 5px 8px; font-size: 13px; color: var(--nv-primary-text); cursor: pointer; border-radius: 8px; text-align: left; }
.nv-tree-row:hover { background: var(--nv-accent-soft); }
.nv-tree-card { padding-left: 4px; }
.nv-tree-main { display: flex; align-items: center; gap: 6px; flex: 1; min-width: 0; border: 0; background: none;
  padding: 0; font-size: 13px; color: inherit; cursor: pointer; text-align: left; }
.nv-tree-glyph { width: 16px; flex: none; color: var(--nv-secondary-text); font-size: 11px; }
.nv-tree-name { flex: 1; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.nv-tree-pending { width: 6px; height: 6px; border-radius: 50%; background: var(--nv-accent-deep); flex: none; }
.nv-tree-foot { padding: 8px 10px 10px; border-top: 1px solid var(--nv-divider); display: flex; flex-direction: column; gap: 4px; }
.nv-tree-new { display: flex; align-items: center; justify-content: center; gap: 6px; width: 100%;
  border: 1px solid var(--nv-divider); border-radius: 10px; padding: 8px 0; font-size: 13px;
  background: var(--nv-surface); color: var(--nv-primary-text); cursor: pointer; }
.nv-tree-new:hover { border-color: var(--nv-accent); color: var(--nv-accent-deep); }
.nv-tree-files { display: flex; align-items: center; gap: 6px; width: 100%; border: 0; background: none;
  padding: 6px 4px; font-size: 12px; color: var(--nv-secondary-text); cursor: pointer; border-radius: 8px; }
.nv-tree-files:hover { color: var(--nv-primary-text); }
.nv-tree-files span:first-child { flex: 1; text-align: left; }

/* 中列画布：标签条 + 体 */
.nv-canvas { position: relative; display: flex; flex-direction: column; height: 100%; min-height: 0; background: var(--nv-surface); }
.nv-canvas-strip { display: flex; align-items: center; gap: 2px; padding: 6px 10px 0; border-bottom: 1px solid var(--nv-divider); overflow-x: auto; flex: none; }
.nv-canvas-tab { display: flex; align-items: center; gap: 6px; padding: 7px 12px; font-size: 12.5px; cursor: pointer;
  color: var(--nv-secondary-text); border-radius: 8px 8px 0 0; border-bottom: 2px solid transparent; white-space: nowrap; }
.nv-canvas-tab:hover { color: var(--nv-primary-text); }
.nv-canvas-tab-on { color: var(--nv-primary-text); border-bottom-color: var(--nv-accent-deep); background: var(--nv-accent-soft); }
.nv-canvas-tabtitle { max-width: 160px; overflow: hidden; text-overflow: ellipsis; }
.nv-canvas-tabx { border: 0; background: none; padding: 0 2px; font-size: 13px; color: var(--nv-secondary-text); cursor: pointer; border-radius: 4px; }
.nv-canvas-tabx:hover { color: var(--nv-primary-text); background: var(--nv-accent-soft); }
.nv-canvas-plus { border: 0; background: none; padding: 4px 8px; font-size: 15px; color: var(--nv-secondary-text); cursor: pointer; }
.nv-canvas-plus:hover { color: var(--nv-accent-deep); }
.nv-canvas-body { flex: 1; min-height: 0; overflow: hidden; display: flex; flex-direction: column; }
.nv-canvas-cardbody { flex: 1; min-height: 0; overflow-y: auto; }
/* 画布里的卡页：模块导航由抽屉树承担（树行深链到模块），卡内大纲栏不再重复出现。 */
.nv-canvas-cardbody .nv-ed-rail { display: none; }
.nv-canvas-missing { padding: 40px; text-align: center; color: var(--nv-secondary-text); }

/* 起点页 */
.nv-canvas-start { flex: 1; display: flex; align-items: center; justify-content: center; }
.nv-start-center { max-width: 460px; text-align: center; padding: 24px; }
.nv-start-title { font-size: 20px; font-weight: 600; margin-bottom: 8px; }
.nv-start-sub { font-size: 13px; color: var(--nv-secondary-text); margin-bottom: 28px; }
.nv-start-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 12px; }
.nv-start-card { display: flex; flex-direction: column; align-items: center; gap: 10px; padding: 22px 12px;
  border: 1px solid var(--nv-divider); border-radius: 14px; background: var(--nv-surface); cursor: pointer;
  font-size: 13px; color: var(--nv-primary-text); }
.nv-start-card:hover { border-color: var(--nv-accent); box-shadow: 0 4px 14px rgba(14, 159, 110, 0.10); }
.nv-start-glyph { font-size: 22px; color: var(--nv-accent-deep); }
.nv-start-hint { margin-top: 26px; font-size: 12px; color: var(--nv-secondary-text); }

/* 文稿体 */
.nv-canvas-docbody { flex: 1; min-height: 0; display: flex; flex-direction: column; }
.nv-canvas-docedit { flex: 1; min-height: 0; border: 0; resize: none; padding: 24px 28px; font-size: 14px; line-height: 1.8;
  font-family: inherit; background: var(--nv-surface); color: var(--nv-primary-text); outline: none; }
.nv-canvas-docstatus { padding: 6px 14px; font-size: 11px; color: var(--nv-secondary-text); border-top: 1px solid var(--nv-divider); }
.nv-canvas-conflict { padding: 8px 14px; font-size: 12px; color: #B45309; background: #FEF3C7; }

/* 通用编辑器：标题 + meta + 正文 + 底状态条（文稿与卡模块共用） */
.nv-ed { flex: 1; min-height: 0; display: flex; flex-direction: column; }
.nv-ed .nv-ed-head { padding: 20px 28px 10px; }
.nv-ed-title { margin: 0; font-size: 22px; font-weight: 700; color: var(--nv-primary-text); }
.nv-ed-meta { margin-top: 5px; font-size: 12px; color: var(--nv-secondary-text); }

/* 卡页：头栏 + 模块竖排堆叠（设计稿 J02），模块导航归抽屉树 */
.nv-cardpage { height: 100%; display: flex; flex-direction: column; }
.nv-cardpage-head { display: flex; align-items: center; gap: 8px; padding: 10px 18px; border-bottom: 1px solid var(--nv-divider); }
.nv-cardpage-kind { font-size: 11px; color: var(--nv-accent-deep); background: var(--nv-accent-soft); padding: 2px 8px; border-radius: 999px; }
.nv-cardpage-name { font-size: 14px; font-weight: 600; color: var(--nv-primary-text); }
.nv-cardpage-draft { font-size: 11px; color: #B45309; background: #FEF3C7; padding: 2px 8px; border-radius: 999px; }
.nv-cardpage-admin { margin-left: auto; border: 1px solid var(--nv-divider); background: var(--nv-surface); color: var(--nv-primary-text);
  font-size: 12px; padding: 4px 12px; border-radius: 8px; cursor: pointer; }
.nv-cardpage-admin:hover { border-color: var(--nv-accent); color: var(--nv-accent-deep); }
.nv-cardpage-scroll { flex: 1; min-height: 0; overflow-y: auto; padding: 14px 22px 40px; }
.nv-cardpage-back { border: 0; background: none; text-align: left; font-size: 12px; color: var(--nv-secondary-text); padding: 4px 8px; cursor: pointer; border-radius: 6px; margin-bottom: 6px; }
.nv-cardpage-back:hover { background: var(--nv-accent-soft); color: var(--nv-primary-text); }

/* 模块盒：标题 + 正文（块级点编） */
.nv-modbox { border: 1px solid var(--nv-divider); border-radius: 12px; background: var(--nv-surface);
  margin-bottom: 14px; padding: 14px 18px 12px; }
.nv-modbox[data-depth='1'], .nv-modbox[data-depth='2'], .nv-modbox[data-depth='3'], .nv-modbox[data-depth='4'] { border-radius: 8px; background: transparent; }
.nv-modbox-title { margin: 0 0 8px; font-size: 16px; font-weight: 700; color: var(--nv-primary-text); }
.nv-modbox[data-depth='1'] .nv-modbox-title, .nv-modbox[data-depth='2'] .nv-modbox-title { font-size: 13.5px; }
.nv-modbox-children { margin-top: 10px; margin-left: 10px; }
.nv-modbox-children .nv-modbox { margin-bottom: 8px; padding: 10px 12px 8px; }
.nv-modbox-widget { font-size: 12.5px; color: var(--nv-secondary-text); padding: 8px 0; }
.nv-modbox-html { min-height: 120px; font-family: ui-monospace, monospace; }

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
.nv-blk-add { align-self: flex-start; border: 0; background: none; font-size: 12px; color: var(--nv-secondary-text);
  padding: 5px 8px; margin-top: 4px; border-radius: 6px; cursor: pointer; }
.nv-blk-add:hover { background: var(--nv-accent-soft); color: var(--nv-accent-deep); }
.nv-blk-figure { margin: 6px 0; }
.nv-blk-figure img { max-width: 100%; border-radius: 10px; display: block; }
.nv-blk-figure figcaption { font-size: 12px; color: var(--nv-secondary-text); margin-top: 6px; }

/* 添加模块虚线区（与模块盒同宽）+ J03 模块库 */
.nv-cardpage-addzone { width: 100%; border: 1.5px dashed var(--nv-divider); border-radius: 12px; background: none;
  display: flex; flex-direction: column; align-items: center; gap: 8px; padding: 20px 0 16px; cursor: pointer; color: var(--nv-secondary-text); }
.nv-cardpage-addzone:hover { border-color: var(--nv-accent); color: var(--nv-accent-deep); }
.nv-cardpage-addplus { font-size: 20px; color: var(--nv-accent); line-height: 1; }
.nv-cardpage-addlabel { font-size: 13px; }
.nv-cardpage-chips { display: flex; gap: 8px; flex-wrap: wrap; justify-content: center; }
.nv-cardpage-chip { font-size: 12px; border: 1px solid var(--nv-divider); border-radius: 999px; padding: 4px 12px;
  color: var(--nv-primary-text); background: var(--nv-surface); cursor: pointer; }
.nv-cardpage-chip:hover { border-color: var(--nv-accent); color: var(--nv-accent-deep); }
.nv-cardpage-chip-soon { opacity: .45; cursor: not-allowed; }
.nv-cardpage-rolesbox { padding-bottom: 6px; }
.nv-cardpage-roleshead { display: flex; align-items: center; gap: 4px; width: 100%; border: 0; background: none;
  font-size: 13px; font-weight: 600; color: var(--nv-primary-text); padding: 2px 0 6px; cursor: pointer; text-align: left; }
.nv-cardpage-roleshead .nv-tree-fold { border: 0; background: none; font-size: 11px; transition: transform .15s; color: var(--nv-secondary-text); }
.nv-cardpage-roleshead .nv-tree-fold-on { transform: rotate(90deg); }

.nv-modlib { width: 560px; max-width: 92%; background: var(--nv-surface); border-radius: 14px; box-shadow: 0 18px 50px rgba(20,24,22,.18);
  padding: 18px 22px 14px; }
.nv-modlib-head { display: flex; align-items: center; justify-content: space-between; margin-bottom: 14px; }
.nv-modlib-title { font-size: 16px; font-weight: 700; color: var(--nv-primary-text); }
.nv-modlib-grid { display: grid; grid-template-columns: repeat(4, 1fr); gap: 10px; }
.nv-modlib-tile { border: 1px solid var(--nv-divider); border-radius: 10px; background: var(--nv-surface); padding: 14px 8px;
  display: flex; flex-direction: column; align-items: center; gap: 4px; cursor: pointer; }
.nv-modlib-tile:hover:not(:disabled) { border-color: var(--nv-accent); box-shadow: 0 4px 14px rgba(14,159,110,.10); }
.nv-modlib-tile:disabled { opacity: .45; cursor: not-allowed; }
.nv-modlib-tilename { font-size: 13px; font-weight: 600; color: var(--nv-primary-text); }
.nv-modlib-tilesub { font-size: 11px; color: var(--nv-secondary-text); }
.nv-modlib-foot { margin-top: 14px; font-size: 11.5px; color: var(--nv-secondary-text); }

/* 素材列表 */
.nv-canvas-files { flex: 1; min-height: 0; overflow-y: auto; padding: 12px 16px; }
.nv-canvas-workframe { width: 100%; height: 100%; border: 0; display: block; background: var(--nv-bg); }
.nv-canvas-filerow { display: flex; align-items: center; gap: 8px; width: 100%; border: 0; background: none;
  padding: 7px 8px; font-size: 13px; color: var(--nv-primary-text); cursor: pointer; border-radius: 8px; text-align: left; }
.nv-canvas-filerow:hover { background: var(--nv-accent-soft); }
.nv-canvas-fileicon { width: 16px; color: var(--nv-secondary-text); }

/* 新建面板 */
.nv-create-veil { position: absolute; inset: 0; background: rgba(20, 24, 22, 0.28); display: flex;
  align-items: center; justify-content: center; z-index: 40; }
.nv-create { width: 340px; background: var(--nv-surface); border: 1px solid var(--nv-divider); border-radius: 16px;
  padding: 20px; box-shadow: 0 18px 48px rgba(0, 0, 0, 0.16); }
.nv-create-title { font-size: 15px; font-weight: 600; margin-bottom: 12px; }
.nv-create-name { width: 100%; border: 1px solid var(--nv-divider); border-radius: 10px; padding: 9px 12px;
  font-size: 13px; outline: none; background: var(--nv-surface); color: var(--nv-primary-text); }
.nv-create-name:focus { border-color: var(--nv-accent); }
.nv-create-world { width: 100%; margin-top: 10px; border: 1px solid var(--nv-divider); border-radius: 10px;
  padding: 8px 10px; font-size: 13px; background: var(--nv-surface); color: var(--nv-primary-text); }
.nv-create-starters { display: flex; flex-direction: column; gap: 8px; margin-top: 12px; }
.nv-create-starter { display: flex; flex-direction: column; gap: 2px; text-align: left; border: 1px solid var(--nv-divider);
  border-radius: 10px; padding: 9px 12px; background: var(--nv-surface); cursor: pointer; }
.nv-create-starter:hover:not(:disabled) { border-color: var(--nv-accent); }
.nv-create-starter-on { border-color: var(--nv-accent-deep); background: var(--nv-accent-soft); }
.nv-create-starter:disabled { opacity: 0.45; cursor: not-allowed; }
.nv-create-starter-label { font-size: 13px; color: var(--nv-primary-text); }
.nv-create-starter-hint { font-size: 11px; color: var(--nv-secondary-text); }
.nv-create-actions { display: flex; justify-content: flex-end; gap: 8px; margin-top: 16px; }
.nv-create-cancel { border: 1px solid var(--nv-divider); background: var(--nv-surface); border-radius: 10px;
  padding: 7px 16px; font-size: 13px; color: var(--nv-secondary-text); cursor: pointer; }
.nv-create-ok { border: 0; background: var(--nv-accent-deep); color: #fff; border-radius: 10px;
  padding: 7px 18px; font-size: 13px; cursor: pointer; }
.nv-create-ok:disabled { opacity: 0.45; cursor: not-allowed; }

/* 抽屉底区：功能台收成一排小图标（设计稿 02 底部的紧凑图标行）。
   上游类名带 CSS-module 哈希前缀，按后缀子串匹配。 */
[class*='featureNav'] { margin-top: auto; padding: 6px 8px 10px; }
[class*='featureList'] { display: flex; flex-wrap: wrap; gap: 2px; }
[class*='featureRow'] { display: inline-flex; align-items: center; justify-content: center;
  width: 32px; height: 32px; padding: 0; border-radius: 9px; }
[class*='featureRow']:hover { background: var(--nv-hover); }
[class*='featureLabel'] { position: absolute; width: 1px; height: 1px;
  overflow: hidden; clip: rect(0 0 0 0); white-space: nowrap; }
`

/** Inject the Noven stylesheet once per document. */
export function injectNovenStyles(): void {
  if (typeof document === 'undefined') return
  const el = document.getElementById('noven-shell-css') ?? document.head.appendChild(
    Object.assign(document.createElement('style'), { id: 'noven-shell-css' }),
  )
  // Always refresh the payload: bundle hot-swaps otherwise keep the stale
  // sheet and newly added selectors render with raw platform chrome.
  if (el.textContent !== CSS) el.textContent = CSS
}
