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
.nv-page { height: 100%; min-height: 0; overflow-y: auto; background: var(--nv-canvas); color: var(--nv-primary-text); font-size: 13px; }
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
.nv-masonry { columns: 2; column-gap: 16px; }
.nv-fcard { break-inside: avoid; margin-bottom: 16px; overflow: hidden; display: block; width: 100%; text-align: left; padding: 0; cursor: pointer; }
.nv-fcard-cover { position: relative; display: block; }
.nv-fcard-cover img { width: 100%; display: block; }
.nv-fcard-body { padding: 14px 16px 14px; display: flex; flex-direction: column; gap: 8px; }
.nv-fcard-title { font-size: 15px; font-weight: 700; }
.nv-fcard-desc { font-size: 12.5px; color: var(--nv-secondary-text); line-height: 1.65; }
.nv-fcard-actions { display: flex; align-items: center; gap: 14px; border-top: 0.5px solid var(--nv-divider); padding-top: 10px; }
.nv-fcard-actions .enter { color: var(--nv-accent-deep); font-weight: 600; font-size: 13px; }
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
.nv-create-hero { display: flex; flex-direction: column; gap: 6px; padding: 20px 22px; }
.nv-create-hero .title { font-size: 15px; font-weight: 700; }
.nv-create-hero .sub { font-size: 12.5px; color: var(--nv-secondary-text); }
.nv-create-input { display: flex; align-items: center; gap: 10px; margin-top: 10px; background: var(--nv-canvas); border-radius: 12px; padding: 10px 12px 10px 16px; }
.nv-create-input input { flex: 1; border: 0; outline: none; background: none; font-size: 13px; font-family: inherit; color: var(--nv-primary-text); }
.nv-create-input input::placeholder { color: var(--nv-secondary-text); }
.nv-send { width: 36px; height: 36px; border-radius: 50%; border: 0; background: var(--nv-accent); color: #fff; display: flex; align-items: center; justify-content: center; cursor: pointer; flex: none; }
.nv-send:disabled { opacity: .45; cursor: default; }
.nv-segment { display: flex; }
.nv-segment > button { flex: 1; display: flex; align-items: center; justify-content: center; gap: 10px; padding: 20px 10px; border: 0; background: none; font-size: 13.5px; font-weight: 600; color: var(--nv-primary-text); cursor: pointer; }
.nv-segment > button + button { border-left: 0.5px solid var(--nv-divider); }
.nv-segment .nv-ic { color: var(--nv-secondary-text); display: inline-flex; }
.nv-tools-head { display: flex; align-items: center; gap: 10px; }
.nv-tools { display: grid; grid-template-columns: repeat(3, 1fr); gap: 12px; }
.nv-tool-card { display: flex; align-items: flex-start; gap: 12px; padding: 16px; text-align: left; cursor: pointer; }
.nv-tool-card .nv-ic { width: 36px; height: 36px; border-radius: 10px; background: var(--nv-accent-soft); color: var(--nv-accent-deep); display: flex; align-items: center; justify-content: center; flex: none; }
.nv-tool-card strong { display: block; font-size: 13px; margin-bottom: 3px; }
.nv-tool-card small { color: var(--nv-secondary-text); font-size: 11.5px; line-height: 1.5; }
.nv-drafts-head { display: flex; align-items: baseline; justify-content: space-between; }
.nv-draft { display: flex; gap: 14px; padding: 14px 16px; align-items: center; }
.nv-draft + .nv-draft { border-top: 0.5px solid var(--nv-divider); }
.nv-draft-cover { width: 52px; height: 52px; border-radius: 10px; object-fit: cover; flex: none; }
.nv-draft-cover.ph { display: flex; align-items: center; justify-content: center; background: var(--nv-accent-soft); color: var(--nv-accent-deep); }
.nv-draft-body { flex: 1; min-width: 0; }
.nv-draft-body strong { font-size: 13.5px; }
.nv-draft-body small { display: block; margin-top: 3px; font-size: 12px; color: var(--nv-secondary-text); }
.nv-draft--dashed { border: 1px dashed var(--nv-accent); border-radius: var(--nv-radius); }

/* ===== 我的 ===== */
.nv-profile { display: flex; align-items: center; gap: 18px; padding: 6px 4px; }
.nv-profile .nv-avatar { width: 68px; height: 68px; font-size: 26px; }
.nv-profile-name { font-size: 20px; font-weight: 700; }
.nv-profile-bio { font-size: 13px; color: var(--nv-secondary-text); margin-top: 3px; }
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
.nv-ccard { overflow: hidden; text-align: left; padding: 0; cursor: pointer; display: block; }
.nv-ccard-cover { position: relative; display: block; }
.nv-ccard-cover img { width: 100%; display: block; }
.nv-ccard-body { padding: 12px 14px 14px; display: flex; flex-direction: column; gap: 5px; }
.nv-ccard-body .nv-tag { align-self: flex-start; margin-bottom: 2px; }
.nv-ccard-title { font-size: 14.5px; font-weight: 700; }
.nv-ccard-desc { font-size: 12px; color: var(--nv-secondary-text); line-height: 1.55; }
.nv-ccard-meta { font-size: 12px; color: var(--nv-secondary-text); display: flex; align-items: center; gap: 8px; flex-wrap: wrap; }
.nv-dirty { display: inline-flex; align-items: center; gap: 5px; font-size: 11.5px; color: var(--nv-accent-deep); }
.nv-dirty::before { content: ''; width: 6px; height: 6px; border-radius: 50%; background: var(--nv-accent); }
.nv-newcard { border: 1.5px dashed var(--nv-divider); border-radius: var(--nv-radius); display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 10px; min-height: 190px; color: var(--nv-secondary-text); background: none; cursor: pointer; font-size: 13px; }
.nv-newcard:hover { border-color: var(--nv-accent); color: var(--nv-accent-deep); }
.nv-newcard .plus { font-size: 26px; font-weight: 300; }

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
.nv-tree-chev { width: 12px; font-size: 10px; color: var(--nv-secondary-text); flex: none; }
.nv-tree-role { display: flex; align-items: center; gap: 9px; padding: 6px 16px 6px 34px; font-size: 13px; }
.nv-tree-role .nv-avatar { width: 24px; height: 24px; font-size: 10px; }
.nv-tree-role small { margin-left: auto; color: var(--nv-secondary-text); font-size: 11px; }
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

/* ===== 本会话侧栏 ===== */
.nv-ctx { display: flex; flex-direction: column; gap: 14px; padding: 14px; overflow-y: auto; height: 100%; min-height: 0; background: var(--nv-canvas); }
.nv-ctx-section { padding: 13px 15px; display: flex; flex-direction: column; gap: 9px; }
.nv-ctx-section h4 { margin: 0; font-size: 11.5px; color: var(--nv-secondary-text); font-weight: 600; }
.nv-ctx-row { display: flex; align-items: center; gap: 9px; font-size: 13px; }
.nv-ctx-row small { margin-left: auto; color: var(--nv-secondary-text); font-size: 11px; }
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
.nv-sessions { display: flex; flex-direction: column; flex: 1; min-height: 0; height: 100%; }
.nv-sessions-head { display: flex; align-items: center; gap: 2px; padding: 8px 12px 4px; }
.nv-sessions-title { flex: 1; font-size: 12px; font-weight: 600; color: var(--nv-secondary-text); padding: 0 4px; }
.nv-sessions-head .nv-iconbtn { width: 24px; height: 24px; border: 0; background: transparent; border-radius: 6px; }
.nv-sessions-head .nv-iconbtn:hover { background: var(--nv-accent-soft); color: var(--nv-accent-deep); }
.nv-sessions-search { margin: 2px 12px 6px; height: 30px; border: 0.5px solid var(--nv-divider); border-radius: 8px; padding: 0 10px; font-size: 12.5px; background: var(--nv-surface); color: var(--nv-primary-text); outline: none; }
.nv-sessions-search:focus { border-color: var(--nv-accent); }
.nv-sessions-list { flex: 1; overflow-y: auto; padding: 2px 8px 10px; display: flex; flex-direction: column; gap: 2px; }
.nv-sessions-row { display: flex; align-items: center; gap: 10px; padding: 6px 8px; border: 0; border-radius: 10px; background: transparent; cursor: pointer; text-align: left; }
.nv-sessions-row:hover { background: var(--nv-accent-soft); }
.nv-sessions-row[data-active] { background: var(--nv-accent-soft); }
.nv-sessions-thumb { width: 36px; height: 36px; border-radius: 8px; object-fit: cover; flex: none; }
.nv-sessions-tile { display: inline-flex; align-items: center; justify-content: center; background: var(--nv-accent-soft); color: var(--nv-accent-deep); font-size: 14px; font-weight: 600; }
.nv-sessions-texts { display: flex; flex-direction: column; gap: 1px; min-width: 0; }
.nv-sessions-name { font-size: 13px; font-weight: 500; color: var(--nv-primary-text); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.nv-sessions-sub { font-size: 11.5px; color: var(--nv-secondary-text); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.nv-sessions-empty { margin: 0; padding: 8px 14px; font-size: 12px; color: var(--nv-secondary-text); }
.nv-side-railbtn { display: flex; align-items: center; justify-content: center; width: 36px; height: 36px; margin: 6px auto; border: 0; border-radius: 9px; background: transparent; color: var(--nv-secondary-text); cursor: pointer; }
.nv-side-railbtn:hover { background: var(--nv-accent-soft); color: var(--nv-accent-deep); }
.nv-foot { display: flex; align-items: center; gap: 6px; width: 100%; padding: 2px 4px; }
.nv-foot-user { display: flex; align-items: center; gap: 8px; flex: 1; min-width: 0; border: 0; background: transparent; border-radius: 9px; padding: 5px 6px; cursor: pointer; text-align: left; }
.nv-foot-user:hover { background: var(--nv-accent-soft); }
.nv-foot-avatar { width: 26px; height: 26px; border-radius: 50%; object-fit: cover; display: block; }
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

.nv-slash-chips { display: flex; gap: 8px; padding: 0 4px 8px; }
.nv-slash-chip { display: inline-flex; align-items: center; height: 26px; padding: 0 12px; border-radius: 999px; border: 0.5px solid var(--nv-divider); background: var(--nv-surface); font-size: 12.5px; color: var(--nv-primary-text); cursor: pointer; }
.nv-slash-chip:hover { border-color: var(--nv-accent); color: var(--nv-accent-deep); background: var(--nv-accent-soft); }

/* 统计行收进 hover 才展开的设计不需要——产品形态里不显示 */
[data-composer-stats] { display: none !important; }
`

/** Inject the Noven stylesheet once per document. */
export function injectNovenStyles(): void {
  if (typeof document === 'undefined' || document.getElementById('noven-shell-css')) return
  const el = document.createElement('style')
  el.id = 'noven-shell-css'
  el.textContent = CSS
  document.head.appendChild(el)
}
