/**
 * The gallery's stylesheet, injected once per document load. The plugin
 * bundle carries no CSS module pipeline, so the styles ship as one scoped
 * `<style>` element with `noven-wb-` class names and neutral translucent
 * surfaces that sit on either theme.
 * @module noven-workbench/client/style
 */

const CSS = `
.noven-wb-sidebar { display: flex; flex-direction: column; gap: 6px; height: 100%; min-height: 0; padding: 8px 6px; overflow-y: auto; }
.noven-wb-sidebar-heading { display: flex; align-items: center; justify-content: space-between; font-size: 12px; opacity: .8; padding: 0 2px; flex: none; }

.noven-wb-tree { display: flex; flex-direction: column; gap: 1px; }
.noven-wb-tree-row { display: flex; align-items: center; gap: 5px; width: 100%; border: 0; border-radius: 5px; padding: 2px 6px 2px 7px; background: transparent; color: inherit; cursor: pointer; text-align: left; font-size: 12px; }
.noven-wb-tree-row:hover { background: rgba(128,128,128,.12); }
.noven-wb-tree-file[data-selected='true'] { background: rgba(76,194,255,.18); }
.noven-wb-tree-chevron { display: inline-block; width: 10px; text-align: center; transition: transform .12s ease; font-size: 11px; opacity: .7; }
.noven-wb-tree-chevron[data-open='true'] { transform: rotate(90deg); }
.noven-wb-tree-glyph { width: 13px; height: 13px; flex: none; border-radius: 3px; }
.noven-wb-tree-glyph-dir { background: currentColor; opacity: .45; clip-path: polygon(0 22%, 45% 22%, 60% 6%, 100% 6%, 100% 94%, 0 94%); }
.noven-wb-tree-glyph-file { border: 1.4px solid currentColor; opacity: .6; border-bottom-width: 0; border-radius: 1px; position: relative; }
.noven-wb-tree-glyph-file::after { content: ''; position: absolute; left: 2px; right: 2px; top: 3px; bottom: 0; border-top: 1.2px solid currentColor; box-shadow: 0 3px 0 currentColor; }
.noven-wb-tree-glyph-image { border: 1.4px solid currentColor; opacity: .6; border-radius: 2px; position: relative; }
.noven-wb-tree-glyph-image::after { content: ''; position: absolute; left: 2px; top: 2px; width: 5px; height: 5px; border-radius: 50%; background: currentColor; opacity: .9; box-shadow: 0 4px 0 -1px currentColor; }
.noven-wb-tree-pending, .noven-wb-tree-failed { font-size: 12px; opacity: .6; }
.noven-wb-tree-label { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.noven-wb-canvas { display: flex; flex-direction: column; gap: 8px; height: 100%; min-height: 0; padding: 12px 16px; overflow-y: auto; }
.noven-wb-canvas-header { display: flex; align-items: center; justify-content: space-between; flex: none; }
.noven-wb-canvas-header strong { font-size: 15px; }
.noven-wb-canvas-actions { display: flex; gap: 6px; }
.noven-wb-exhibition { display: flex; flex-direction: column; gap: 12px; }
.noven-wb-exhibition > header { display: flex; align-items: baseline; gap: 8px; }
.noven-wb-exhibition > header span { font-size: 14px; font-weight: 600; }
.noven-wb-exhibition > header small { font-size: 12px; opacity: .65; }
.noven-wb-exhibition h2 { font-size: 12px; font-weight: 600; opacity: .7; margin: 0 0 6px; }
.noven-wb-exhibition section { display: flex; flex-direction: column; }
.noven-wb-exhibition-hero { position: relative; border: 1px solid rgba(128,128,128,.3); border-radius: 10px; overflow: hidden; cursor: zoom-in; padding: 0; background: rgba(128,128,128,.08); max-width: 560px; }
.noven-wb-exhibition-hero img { width: 100%; max-height: 320px; object-fit: cover; display: block; }
.noven-wb-exhibition-hero strong { position: absolute; left: 8px; bottom: 6px; font-size: 12px; background: rgba(20,20,20,.7); color: #fff; border-radius: 5px; padding: 2px 8px; }
.noven-wb-exhibition-groups { display: flex; flex-wrap: wrap; gap: 6px; }
.noven-wb-exhibition-groups span { border: 1px solid rgba(128,128,128,.35); border-radius: 999px; padding: 3px 12px; font-size: 12px; }
.noven-wb-exhibition-cards { display: grid; grid-template-columns: repeat(auto-fill, minmax(150px, 1fr)); gap: 8px; }
.noven-wb-exhibition-cards button { display: flex; flex-direction: column; gap: 3px; align-items: stretch; border: 1px solid rgba(128,128,128,.3); border-radius: 8px; padding: 6px; background: transparent; color: inherit; cursor: pointer; text-align: left; }
.noven-wb-exhibition-cards button:hover { border-color: rgba(128,128,128,.7); }
.noven-wb-exhibition-cards img { width: 100%; aspect-ratio: 4/3; object-fit: cover; border-radius: 5px; }
.noven-wb-exhibition-cards strong { font-size: 12px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.noven-wb-exhibition-cards small { font-size: 10px; opacity: .6; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.noven-wb-stage-empty { display: flex; flex-direction: column; align-items: center; gap: 6px; padding: 48px 0; opacity: .7; }
.noven-wb-stage-empty h1 { font-size: 16px; margin: 0; }
.noven-wb-stage-empty p { font-size: 12px; margin: 0; }
.noven-wb-chips { display: flex; flex-wrap: wrap; gap: 4px; flex: none; }
.noven-wb-chip { border: 1px solid rgba(128,128,128,.4); border-radius: 999px; padding: 2px 10px; font-size: 12px; background: transparent; color: inherit; cursor: pointer; }
.noven-wb-chip[data-active='true'] { background: rgba(128,128,128,.25); border-color: rgba(128,128,128,.8); }
.noven-wb-toolbar { display: flex; align-items: center; gap: 6px; flex: none; flex-wrap: wrap; }
.noven-wb-btn { border: 1px solid rgba(128,128,128,.4); border-radius: 6px; padding: 2px 10px; font-size: 12px; background: transparent; color: inherit; cursor: pointer; }
.noven-wb-btn[data-active='true'] { background: rgba(128,128,128,.25); }
.noven-wb-note { font-size: 12px; opacity: .75; }
.noven-wb-error { font-size: 12px; color: #e06c75; }
.noven-wb-retry { border: 1px solid rgba(128,128,128,.4); border-radius: 6px; padding: 2px 12px; font-size: 12px; background: transparent; color: inherit; cursor: pointer; }
.noven-wb-retry:hover { background: rgba(128,128,128,.15); }
.noven-wb-present-failed { margin: 0; padding: 14px 12px; font-size: 12px; opacity: .75; display: flex; align-items: center; gap: 10px; }
.noven-wb-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(120px, 1fr)); gap: 8px; align-content: start; }
.noven-wb-thumb { position: relative; aspect-ratio: 1; border-radius: 8px; overflow: hidden; border: 1px solid rgba(128,128,128,.3); background: rgba(128,128,128,.08); cursor: zoom-in; padding: 0; }
.noven-wb-thumb img { width: 100%; height: 100%; object-fit: cover; display: block; }
.noven-wb-thumb[data-pinned='true']::after { content: '★'; position: absolute; top: 2px; right: 5px; font-size: 11px; color: #e0b04c; text-shadow: 0 0 3px rgba(0,0,0,.8); }
.noven-wb-stage { display: flex; flex-direction: column; gap: 8px; height: 100%; min-height: 0; padding: 12px; }
.noven-wb-figure { position: relative; align-self: flex-start; max-width: 100%; margin: 0; line-height: 0; }
.noven-wb-figure img { max-width: 100%; max-height: 62vh; display: block; border-radius: 6px; }
.noven-wb-overlay { position: absolute; inset: 0; }
.noven-wb-overlay[data-mode='annotate'] { cursor: crosshair; }
.noven-wb-overlay[data-mode='pick'] { cursor: crosshair; }
.noven-wb-anno { position: absolute; border: 1.5px solid #4cc2ff; background: rgba(76,194,255,.12); border-radius: 2px; }
.noven-wb-anno[data-selected='true'] { border-color: #ff8a4c; background: rgba(255,138,76,.15); }
.noven-wb-anno-label { position: absolute; top: 100%; left: 0; font-size: 11px; line-height: 1.3; background: rgba(20,20,20,.75); color: #fff; border-radius: 4px; padding: 2px 6px; max-width: 240px; white-space: normal; }
.noven-wb-editor { position: absolute; z-index: 2; display: flex; flex-direction: column; gap: 4px; background: rgba(24,24,28,.96); color: #fff; border-radius: 8px; padding: 8px; width: 220px; box-shadow: 0 4px 16px rgba(0,0,0,.4); }
.noven-wb-editor textarea { resize: vertical; min-height: 44px; font: inherit; font-size: 12px; border-radius: 4px; border: 1px solid rgba(255,255,255,.3); background: rgba(255,255,255,.08); color: inherit; padding: 4px; }
.noven-wb-editor-row { display: flex; gap: 6px; justify-content: flex-end; }
.noven-wb-swatch-row { display: flex; align-items: center; gap: 8px; flex-wrap: wrap; flex: none; }
.noven-wb-swatch { width: 40px; height: 40px; border-radius: 8px; border: 1px solid rgba(128,128,128,.5); }
.noven-wb-swatch code { font-size: 13px; }
.noven-wb-recent { display: flex; gap: 4px; align-items: center; }
.noven-wb-recent-dot { width: 16px; height: 16px; border-radius: 4px; border: 1px solid rgba(128,128,128,.5); padding: 0; cursor: pointer; }
.noven-wb-anno-list { display: flex; flex-direction: column; gap: 4px; overflow-y: auto; min-height: 0; flex: 1; }
.noven-wb-anno-item { display: flex; align-items: baseline; gap: 6px; font-size: 12px; border: 1px solid rgba(128,128,128,.25); border-radius: 6px; padding: 4px 8px; }
.noven-wb-anno-item span { flex: 1; overflow-wrap: anywhere; }
.noven-wb-anno-item button { flex: none; }

/* Work-mode stage (06b/06c/06d): the overlay canvas taking the window's
   right share. White surface, hairline chrome, pill segment, mint selection —
   the same token language as noven-shell's pages. */
.noven-stage-main { display: flex; flex-direction: column; flex: 1; min-width: 0; min-height: 0; position: relative; }
.noven-stage-topbar { display: flex; align-items: center; gap: 10px; padding: 7px 16px; flex: none; border-bottom: 0.5px solid var(--nv-divider, rgba(128,128,128,.25)); }
.noven-stage-crumbs { display: flex; align-items: center; gap: 2px; min-width: 0; flex: 1; overflow: hidden; }
.noven-stage-crumb { border: 0; background: transparent; color: var(--nv-secondary-text, inherit); font-size: 12.5px; padding: 3px 6px; border-radius: 6px; cursor: pointer; white-space: nowrap; max-width: 160px; overflow: hidden; text-overflow: ellipsis; flex: none; }
.noven-stage-crumb-pair { display: inline-flex; align-items: center; gap: 2px; min-width: 0; }
.noven-stage-crumb:hover { color: var(--nv-primary-text); background: rgba(128,128,128,.1); }
.noven-stage-crumb-dir { color: var(--nv-secondary-text); cursor: default; }
.noven-stage-crumb-tail { display: inline-flex; align-items: center; gap: 5px; color: var(--nv-primary-text); font-weight: 500; border: 0.5px solid var(--nv-divider); border-radius: 999px; padding: 3px 12px; }
.noven-stage-crumb-tail:hover { border-color: var(--nv-secondary-text); background: transparent; }
.noven-stage-sep { color: var(--nv-secondary-text); font-size: 12px; opacity: .55; }
.noven-stage-card-chip { border: 0.5px solid var(--nv-divider, rgba(128,128,128,.4)); border-radius: 999px; padding: 3px 12px; font-size: 12px; background: var(--nv-surface, transparent); color: var(--nv-primary-text, inherit); cursor: pointer; white-space: nowrap; flex: none; }
.noven-stage-card-chip:hover { border-color: var(--nv-secondary-text); }
.noven-stage-segment { display: flex; gap: 2px; flex: none; }
.noven-stage-segment button { border: 0; background: transparent; color: var(--nv-secondary-text); font-size: 12.5px; padding: 4px 14px; border-radius: 999px; cursor: pointer; }
.noven-stage-segment button:hover { color: var(--nv-primary-text); }
.noven-stage-segment button[data-active='true'] { background: var(--nv-primary-text); color: var(--nv-surface, #fff); }
.noven-stage-actions { display: flex; align-items: center; gap: 4px; flex: none; }
.noven-stage-iconbtn { display: inline-flex; align-items: center; justify-content: center; width: 28px; height: 28px; border: 0; border-radius: 7px; background: transparent; color: var(--nv-secondary-text); cursor: pointer; }
.noven-stage-iconbtn:hover { background: rgba(128,128,128,.12); color: var(--nv-primary-text); }
.noven-stage-iconbtn[data-active='true'] { color: var(--nv-accent-deep); background: var(--nv-accent-soft); }
.noven-stage-canvas { flex: 1; min-height: 0; overflow-y: auto; display: flex; flex-direction: column; padding: 14px 18px; }
.noven-stage-canvas[data-bleed] { padding: 0; }
.noven-stage-tree-pop { position: absolute; top: 42px; left: 14px; z-index: 8; width: 252px; max-height: min(72%, 480px); display: flex; flex-direction: column; border: 0.5px solid var(--nv-divider, rgba(128,128,128,.4)); border-radius: 14px; background: var(--nv-surface, #fff); box-shadow: 0 12px 36px rgba(0,0,0,.14); overflow: hidden; }
.noven-stage-tree-tools { display: flex; align-items: center; gap: 6px; padding: 8px 10px; border-bottom: 0.5px solid var(--nv-divider, rgba(128,128,128,.25)); flex: none; }
.noven-stage-tree-tools input { flex: 1; min-width: 0; border: 0.5px solid var(--nv-divider, rgba(128,128,128,.35)); border-radius: 999px; padding: 5px 12px; font-size: 12px; background: var(--nv-surface); color: var(--nv-primary-text); outline: none; }
.noven-stage-tree-tools input::placeholder { color: var(--nv-secondary-text); }
.noven-stage-tree-scroll { overflow-y: auto; padding: 6px; min-height: 0; }
.noven-stage .noven-wb-tree-row { gap: 7px; padding: 6px 10px; border-radius: 8px; font-size: 12.5px; color: var(--nv-primary-text); }
.noven-stage .noven-wb-tree-row:hover { background: rgba(128,128,128,.1); }
.noven-stage .noven-wb-tree-file[data-selected='true'] { background: var(--nv-accent-soft); color: var(--nv-accent-deep); }
.noven-stage .noven-wb-tree-label { flex: 1; }
.noven-stage .noven-wb-tree-glyph { display: inline-flex; align-items: center; justify-content: center; width: 14px; height: 14px; color: var(--nv-secondary-text); flex: none; }
.noven-stage .noven-wb-tree-file[data-selected='true'] .noven-wb-tree-glyph { color: var(--nv-accent-deep); }
.noven-stage .noven-wb-tree-chevron { color: var(--nv-secondary-text); width: 8px; flex: none; }
.noven-stage .noven-wb-tree-dir { color: var(--nv-primary-text); }
.noven-stage-tree-count { margin-left: auto; flex: none; font-size: 11px; color: var(--nv-secondary-text); }
.noven-stage-all { margin-top: 2px; color: var(--nv-secondary-text); }
.noven-stage-files { overflow-y: auto; min-height: 0; }
/* The drawer's upper zone: the resident workbench directory — one row per
   workbench, each expanding its file tree in place. The zone carries its own
   enclosure so zone reordering never merges it into the feature zone. */
.noven-wbnav { display: flex; flex-direction: column; min-height: 0; background: var(--nv-surface, transparent); margin: 6px 8px; border: 0.5px solid var(--nv-divider, rgba(128,128,128,.25)); border-radius: var(--nv-radius, 10px); overflow: hidden; }
.noven-wbnav-zone { padding: 8px 12px 2px; font-size: 11px; font-weight: 600; letter-spacing: .04em; color: var(--nv-secondary-text); flex: none; }
.noven-wbnav-list { flex: none; padding: 2px 6px 4px; display: flex; flex-direction: column; gap: 1px; }
.noven-wbnav-glyph { display: inline-flex; width: 13px; height: 13px; flex: none; color: var(--nv-secondary-text); }
.noven-wbnav-wb-row { display: flex; align-items: center; gap: 6px; width: 100%; border: 0; background: transparent; padding: 5px 8px; border-radius: 8px; font-size: 12.5px; font-weight: 500; color: var(--nv-primary-text); cursor: pointer; text-align: left; }
.noven-wbnav-wb-row:hover { background: rgba(128,128,128,.1); }
.noven-wbnav-wb-row[data-active='true'] { background: var(--nv-accent-soft); color: var(--nv-accent-deep); }
.noven-wbnav-wb-row[data-active='true'] .noven-wbnav-glyph { color: var(--nv-accent-deep); }
.noven-wbnav-wb-title { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.noven-wbnav-wb-files { padding-left: 6px; flex: 1; min-height: 0; overflow-y: auto; }
.noven-wbnav-wb-files .noven-stage-tree-scroll { padding: 0; }
.noven-wbnav-wb-status { padding: 4px 10px 6px 16px; font-size: 11px; color: var(--nv-secondary-text); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.noven-wbnav-wb-status[data-tone="warn"] { color: var(--nv-warn-text, #b07d2b); }
.noven-wbnav .noven-wb-tree-row { gap: 7px; padding: 5px 10px; border-radius: 8px; font-size: 12.5px; color: var(--nv-primary-text); }
.noven-wbnav .noven-wb-tree-row:hover { background: rgba(128,128,128,.1); }
.noven-wbnav .noven-wb-tree-file[data-selected='true'] { background: var(--nv-accent-soft); color: var(--nv-accent-deep); }
.noven-wbnav .noven-wb-tree-file[data-selected='true'] .noven-wb-tree-glyph { color: var(--nv-accent-deep); }
/* A pick remembered while the canvas is down: muted, never mint. */
.noven-wbnav .noven-wb-tree-file[data-stale='true'] { background: rgba(128,128,128,.1); color: var(--nv-secondary-text); }

/* The zone's rail form: the same rows as an icon column inside the host's
   28px row rhythm. */
.noven-wbnav-rail { display: flex; flex-direction: column; align-items: center; gap: 1px; min-height: 0; }
.noven-wbnav-rail-row { display: inline-flex; align-items: center; justify-content: center; width: 28px; height: 28px; padding: 6px; border: 0; border-radius: 6px; background: transparent; color: var(--nv-secondary-text, rgba(128,128,128,.9)); cursor: pointer; }
.noven-wbnav-rail-row:hover { background: rgba(128,128,128,.12); }
.noven-wbnav-rail-row[data-selected='true'] { background: var(--nv-accent-soft); color: var(--nv-accent-deep); }
.noven-wbnav .noven-wb-tree-file[data-stale='true'] .noven-wb-tree-glyph { color: var(--nv-secondary-text); }
.noven-wbnav .noven-wb-tree-label { flex: 1; }
.noven-wbnav .noven-wb-tree-glyph { display: inline-flex; align-items: center; justify-content: center; width: 14px; height: 14px; color: var(--nv-secondary-text); flex: none; }
.noven-wbnav .noven-wb-tree-chevron { color: var(--nv-secondary-text); width: 8px; flex: none; }
.noven-wb-docview { width: 100%; max-width: 660px; margin: 0 auto; padding: 40px 28px 90px; box-sizing: border-box; }
.noven-wb-html { display: block; width: 100%; height: 100%; border: 0; background: transparent; }
.noven-wb-doc { display: flex; flex-direction: column; flex: 1; min-height: 0; height: 100%; overflow: auto; }
.noven-wb-doc-bar { display: flex; align-items: center; justify-content: space-between; gap: 10px; padding: 6px 12px; border-bottom: 0.5px solid rgba(128,128,128,.3); flex: none; }
.noven-wb-doc-actions { display: flex; align-items: center; gap: 8px; }
.noven-wb-doc-dirty { font-size: 11px; opacity: .65; }
.noven-wb-doc-save { font-size: 12px; padding: 3px 12px; border: 1px solid rgba(128,128,128,.5); border-radius: 6px; background: transparent; color: inherit; cursor: pointer; }
.noven-wb-doc-save:disabled { opacity: .45; cursor: default; }
.noven-wb-doc-conflict { display: flex; align-items: center; gap: 10px; padding: 6px 12px; font-size: 12px; border-bottom: 0.5px solid rgba(200,120,60,.5); background: rgba(200,120,60,.12); flex: none; }
.noven-wb-doc-conflict button { font-size: 12px; padding: 2px 10px; border: 1px solid rgba(128,128,128,.5); border-radius: 6px; background: transparent; color: inherit; cursor: pointer; }
.noven-wb-docedit { flex: 1; min-height: 0; width: 100%; resize: none; border: 0; outline: none; background: transparent; color: inherit; font: 13px/1.7 ui-monospace, SFMono-Regular, Menlo, monospace; padding: 20px 24px 90px; box-sizing: border-box; }
.noven-wb-present-list { display: flex; flex-direction: column; gap: 10px; padding: 8px 0; }
.noven-wb-present { border: 0.5px solid rgba(128,128,128,.35); border-radius: 10px; overflow: hidden; }
.noven-wb-present-head { display: flex; align-items: center; justify-content: space-between; gap: 10px; padding: 6px 12px; border-bottom: 0.5px solid rgba(128,128,128,.3); }
.noven-wb-present-title { font-size: 12px; font-weight: 500; }
.noven-wb-present-open { font-size: 11px; padding: 2px 10px; border: 1px solid rgba(128,128,128,.5); border-radius: 6px; background: transparent; color: inherit; cursor: pointer; }
.noven-wb-present-frame { display: block; width: 100%; height: 340px; border: 0; background: rgba(128,128,128,.06); }
.noven-wb-map { flex: 1; min-height: 0; overflow: auto; }
.noven-wb-map-body { position: relative; display: block; width: 100%; }
.noven-wb-map-body img { display: block; width: 100%; height: auto; }
.noven-wb-map-overlay { position: absolute; inset: 0; width: 100%; height: 100%; pointer-events: none; }
.noven-wb-map-card { position: absolute; z-index: 4; width: 260px; transform: translate(-50%, 12px); background: var(--dsw-alias-bg-base, #f4f5f4); border: 0.5px solid rgba(128,128,128,.45); border-radius: 10px; box-shadow: 0 10px 30px rgba(0,0,0,.22); padding: 10px 12px; font-size: 12px; }
.noven-wb-map-card header { display: flex; align-items: center; justify-content: space-between; }
.noven-wb-map-card header button { border: 0; background: transparent; color: inherit; font-size: 14px; cursor: pointer; opacity: .6; }
.noven-wb-map-card h3 { margin: 2px 0 6px; font-size: 14px; font-weight: 500; }
.noven-wb-map-card p { margin: 0 0 6px; opacity: .85; }
.noven-wb-map-card dl { margin: 0 0 6px; }
.noven-wb-map-card dl div { display: flex; gap: 6px; margin: 2px 0; }
.noven-wb-map-card dt { opacity: .6; flex: none; }
.noven-wb-map-card dd { margin: 0; }
.noven-wb-map-card footer { display: flex; flex-direction: column; gap: 2px; border-top: 0.5px solid rgba(128,128,128,.3); padding-top: 6px; }
.noven-wb-map-card footer span { opacity: .6; }
.noven-wb-map-card footer small { opacity: .7; }
.noven-wb-map-kind { font-size: 11px; opacity: .7; border: 1px solid rgba(128,128,128,.45); border-radius: 999px; padding: 1px 8px; }
`

let injected = false

/**
 * Append the gallery stylesheet to the document head, once.
 * The flag is only a fast path: the DOM itself decides — a module-surviving
 * reload (HMR, plugin recycle) can leave `injected` true with the tag gone,
 * and checking the document is what makes re-entry self-healing.
 */
export function injectGalleryStyles(): void {
  if (typeof document === 'undefined') return
  if (injected && document.querySelector('style[data-noven-workbench]') !== null) return
  injected = true
  const element = document.createElement('style')
  element.dataset.novenWorkbench = ''
  element.textContent = CSS
  document.head.append(element)
}
