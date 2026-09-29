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
}
.nv-page { height: 100%; min-height: 0; overflow-y: auto; background: var(--nv-canvas); color: var(--nv-primary-text); font-size: 13px; }
.nv-page-inner { max-width: 1180px; margin: 0 auto; padding: 20px 28px 48px; display: flex; flex-direction: column; gap: 16px; }
.nv-h1 { font-size: 18px; font-weight: 700; }
.nv-h2 { font-size: 13px; font-weight: 600; color: var(--nv-secondary-text); }
.nv-card { background: var(--nv-surface); border: 0.5px solid var(--nv-divider); border-radius: var(--nv-radius); }
.nv-chip { display: inline-flex; align-items: center; gap: 4px; border: 0.5px solid var(--nv-divider); border-radius: 999px; padding: 2px 10px; font-size: 12px; color: var(--nv-secondary-text); background: var(--nv-surface); }
.nv-chip[data-active='true'] { background: var(--nv-primary-text); border-color: var(--nv-primary-text); color: #fff; }
.nv-btn-primary { display: inline-flex; align-items: center; gap: 6px; border: 0; border-radius: 999px; padding: 8px 18px; font-size: 13px; font-weight: 600; background: var(--nv-accent); color: #fff; cursor: pointer; }
.nv-btn-primary:hover { background: var(--nv-accent-deep); }
.nv-btn-ghost { display: inline-flex; align-items: center; gap: 6px; border: 0.5px solid var(--nv-divider); border-radius: 999px; padding: 7px 16px; font-size: 13px; background: var(--nv-surface); color: var(--nv-primary-text); cursor: pointer; }
.nv-btn-ghost:hover { border-color: var(--nv-secondary-text); }
.nv-input { width: 100%; border: 0; outline: none; background: transparent; color: var(--nv-primary-text); font-size: 14px; resize: none; font-family: inherit; }
.nv-input::placeholder { color: var(--nv-secondary-text); }
.nv-empty { display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 8px; padding: 64px 0; color: var(--nv-secondary-text); font-size: 13px; }

/* 首页 feed */
.nv-feed-tabs { display: flex; align-items: center; gap: 18px; }
.nv-feed-tab { border: 0; background: none; padding: 4px 0; font-size: 15px; font-weight: 600; color: var(--nv-secondary-text); cursor: pointer; border-bottom: 2px solid transparent; }
.nv-feed-tab[data-active='true'] { color: var(--nv-primary-text); border-bottom-color: var(--nv-accent); }
.nv-feed-pills { display: flex; gap: 8px; }
.nv-masonry { columns: 3; column-gap: 14px; }
@media (max-width: 1500px) { .nv-masonry { columns: 2; } }
.nv-workcard { break-inside: avoid; margin-bottom: 14px; overflow: hidden; cursor: pointer; display: block; width: 100%; text-align: left; padding: 0; }
.nv-workcard-cover { width: 100%; display: block; aspect-ratio: var(--nv-ar, 4/3); object-fit: cover; }
.nv-workcard-body { padding: 10px 12px 12px; display: flex; flex-direction: column; gap: 6px; }
.nv-workcard-title { font-size: 14px; font-weight: 600; }
.nv-workcard-desc { font-size: 12px; color: var(--nv-secondary-text); display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical; overflow: hidden; }
.nv-workcard-meta { display: flex; align-items: center; gap: 6px; font-size: 11px; color: var(--nv-secondary-text); }
.nv-workcard-author { display: flex; align-items: center; gap: 6px; margin-top: 2px; font-size: 12px; color: var(--nv-secondary-text); }
.nv-avatar { width: 18px; height: 18px; border-radius: 50%; background: var(--nv-accent-soft); color: var(--nv-accent-deep); display: inline-flex; align-items: center; justify-content: center; font-size: 10px; font-weight: 700; flex: none; }
.nv-tag { display: inline-flex; align-items: center; border-radius: 6px; padding: 1px 7px; font-size: 11px; background: var(--nv-accent-soft); color: var(--nv-accent-deep); }
.nv-tag[data-outline='true'] { background: transparent; border: 0.5px solid var(--nv-divider); color: var(--nv-secondary-text); }

/* 落地页抽屉 */
.nv-drawer-wrap { position: fixed; inset: 0; z-index: 60; display: flex; justify-content: flex-end; }
.nv-drawer-mask { position: absolute; inset: 0; background: rgba(0,0,0,.18); }
.nv-drawer { position: relative; width: min(560px, 92%); height: 100%; background: var(--nv-surface); border-left: 0.5px solid var(--nv-divider); display: flex; flex-direction: column; animation: nv-slide-in .18s ease; }
@keyframes nv-slide-in { from { transform: translateX(40px); opacity: 0; } to { transform: none; opacity: 1; } }
.nv-drawer-scroll { flex: 1; overflow-y: auto; }
.nv-drawer-cover { width: 100%; aspect-ratio: 16/9; object-fit: cover; display: block; }
.nv-drawer-body { padding: 18px 22px; display: flex; flex-direction: column; gap: 14px; }
.nv-drawer-close { position: absolute; top: 12px; right: 12px; width: 30px; height: 30px; border-radius: 50%; border: 0; background: rgba(255,255,255,.9); cursor: pointer; font-size: 15px; color: var(--nv-primary-text); }
.nv-drawer-foot { display: flex; gap: 10px; padding: 14px 22px; border-top: 0.5px solid var(--nv-divider); }
.nv-drawer-foot .nv-btn-primary { flex: 1; justify-content: center; }
.nv-drawer-foot .nv-btn-ghost { flex: 1; justify-content: center; }
.nv-mod-list { display: flex; flex-direction: column; gap: 10px; }
.nv-mod-item { display: flex; gap: 10px; padding: 10px 12px; border: 0.5px solid var(--nv-divider); border-radius: 10px; }
.nv-mod-item h4 { margin: 0 0 4px; font-size: 13px; }
.nv-mod-item p { margin: 0; font-size: 12px; color: var(--nv-secondary-text); line-height: 1.5; }
.nv-role-row { display: flex; gap: 10px; flex-wrap: wrap; }
.nv-role { display: flex; flex-direction: column; align-items: center; gap: 5px; width: 64px; }
.nv-role .nv-avatar { width: 40px; height: 40px; font-size: 14px; }
.nv-role span { font-size: 11px; color: var(--nv-secondary-text); }

/* 创作 */
.nv-create-hero { display: flex; flex-direction: column; gap: 10px; padding: 18px 20px; }
.nv-create-hero-foot { display: flex; justify-content: space-between; align-items: center; }
.nv-tiles { display: grid; grid-template-columns: repeat(3, 1fr); gap: 12px; }
.nv-tile { display: flex; align-items: center; gap: 12px; padding: 16px; text-align: left; cursor: pointer; }
.nv-tile-icon { width: 38px; height: 38px; border-radius: 10px; background: var(--nv-accent-soft); color: var(--nv-accent-deep); display: flex; align-items: center; justify-content: center; flex: none; }
.nv-tile strong { display: block; font-size: 13px; }
.nv-tile small { color: var(--nv-secondary-text); font-size: 11px; }
.nv-tools { display: flex; gap: 10px; }
.nv-tool { flex: 1; display: flex; align-items: center; justify-content: center; gap: 6px; padding: 10px; border: 0.5px solid var(--nv-divider); border-radius: 10px; background: var(--nv-surface); font-size: 12px; color: var(--nv-primary-text); cursor: pointer; }
.nv-draft { display: flex; gap: 12px; padding: 12px 14px; align-items: center; }
.nv-draft-thumb { width: 44px; height: 44px; border-radius: 8px; background: var(--nv-accent-soft); flex: none; display: flex; align-items: center; justify-content: center; color: var(--nv-accent-deep); font-size: 15px; font-weight: 700; }

/* 我的 */
.nv-profile { display: flex; align-items: center; gap: 16px; padding: 18px 20px; }
.nv-profile .nv-avatar { width: 56px; height: 56px; font-size: 22px; }
.nv-profile-stats { display: flex; gap: 22px; font-size: 12px; color: var(--nv-secondary-text); }
.nv-profile-stats b { display: block; font-size: 15px; color: var(--nv-primary-text); }
.nv-profile-actions { margin-left: auto; display: flex; gap: 8px; }
.nv-me-tabs { display: flex; gap: 4px; border-bottom: 0.5px solid var(--nv-divider); }
.nv-me-tab { border: 0; background: none; padding: 8px 14px; font-size: 13px; font-weight: 600; color: var(--nv-secondary-text); cursor: pointer; border-bottom: 2px solid transparent; }
.nv-me-tab[data-active='true'] { color: var(--nv-primary-text); border-bottom-color: var(--nv-accent); }
.nv-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(170px, 1fr)); gap: 14px; }
.nv-card-item { overflow: hidden; cursor: pointer; text-align: left; padding: 0; display: block; }
.nv-card-item-cover { aspect-ratio: 1; width: 100%; display: block; object-fit: cover; }
.nv-card-item-body { padding: 9px 11px; display: flex; flex-direction: column; gap: 4px; }
.nv-card-item-title { font-size: 13px; font-weight: 600; }
.nv-card-item-meta { font-size: 11px; color: var(--nv-secondary-text); display: flex; align-items: center; gap: 6px; }
.nv-wb-card { display: flex; flex-direction: column; }
.nv-recent-row { display: flex; align-items: center; gap: 10px; padding: 9px 12px; font-size: 12px; }
.nv-recent-row small { color: var(--nv-secondary-text); margin-left: auto; }

/* 卡片编辑器 */
.nv-editor { display: grid; grid-template-columns: 220px 1fr 300px; height: 100%; min-height: 0; background: var(--nv-canvas); }
.nv-editor-col { border-right: 0.5px solid var(--nv-divider); overflow-y: auto; display: flex; flex-direction: column; min-height: 0; }
.nv-editor-col:last-child { border-right: 0; }
.nv-editor-col-head { padding: 12px 14px; font-size: 12px; font-weight: 600; color: var(--nv-secondary-text); border-bottom: 0.5px solid var(--nv-divider); flex: none; }
.nv-tree-row { display: flex; align-items: center; gap: 7px; width: 100%; border: 0; background: none; padding: 7px 14px; font-size: 13px; color: var(--nv-primary-text); cursor: pointer; text-align: left; }
.nv-tree-row:hover { background: rgba(128,128,128,.1); }
.nv-tree-row[data-active='true'] { background: var(--nv-accent-soft); border-left: 2px solid var(--nv-accent); }
.nv-tree-row small { margin-left: auto; color: var(--nv-secondary-text); font-size: 11px; }
.nv-editor-doc { padding: 20px 24px; flex: 1; overflow-y: auto; }
.nv-editor-doc textarea { width: 100%; min-height: 55vh; border: 0; outline: none; resize: none; background: transparent; font-family: ui-monospace, SFMono-Regular, Menlo, monospace; font-size: 13px; line-height: 1.7; color: var(--nv-primary-text); }
.nv-editor-chat { padding: 14px; display: flex; flex-direction: column; gap: 10px; flex: 1; }
.nv-bubble { max-width: 88%; padding: 9px 12px; border-radius: 12px; font-size: 12px; line-height: 1.55; }
.nv-bubble[data-me='true'] { align-self: flex-end; background: var(--nv-accent); color: #fff; border-bottom-right-radius: 4px; }
.nv-bubble[data-me='false'] { align-self: flex-start; background: var(--nv-surface); border: 0.5px solid var(--nv-divider); border-bottom-left-radius: 4px; }
.nv-receipt { border: 0.5px solid var(--nv-divider); border-radius: 10px; padding: 9px 12px; font-size: 12px; background: var(--nv-surface); display: flex; align-items: center; gap: 8px; }
.nv-receipt .ok { color: var(--nv-accent-deep); font-weight: 700; }

/* 本会话侧栏 */
.nv-ctx { display: flex; flex-direction: column; gap: 12px; padding: 12px; overflow-y: auto; height: 100%; min-height: 0; }
.nv-ctx-section { padding: 12px 14px; display: flex; flex-direction: column; gap: 8px; }
.nv-ctx-section h4 { margin: 0; font-size: 12px; color: var(--nv-secondary-text); font-weight: 600; }
.nv-ctx-row { display: flex; align-items: center; gap: 8px; font-size: 13px; }
.nv-ctx-row small { margin-left: auto; color: var(--nv-secondary-text); font-size: 11px; }
.nv-ctx-thumb { width: 32px; height: 32px; border-radius: 8px; object-fit: cover; background: var(--nv-accent-soft); flex: none; }
`

/** Inject the Noven stylesheet once per document. */
export function injectNovenStyles(): void {
  if (typeof document === 'undefined' || document.getElementById('noven-shell-css')) return
  const el = document.createElement('style')
  el.id = 'noven-shell-css'
  el.textContent = CSS
  document.head.appendChild(el)
}
