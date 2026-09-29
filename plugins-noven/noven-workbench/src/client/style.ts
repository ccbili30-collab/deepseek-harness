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
.noven-wb-launcher-list { display: flex; flex-direction: column; gap: 2px; }
.noven-wb-launcher-main { display: flex; align-items: center; gap: 8px; width: 100%; border: 0; border-radius: 8px; padding: 6px 8px; background: transparent; color: inherit; cursor: pointer; text-align: left; }
.noven-wb-launcher-main:hover { background: rgba(128,128,128,.12); }
.noven-wb-launcher-main[data-active='true'] { background: rgba(128,128,128,.2); }
.noven-wb-launcher-main > span:first-of-type { display: flex; flex-direction: column; gap: 1px; flex: 1; min-width: 0; }
.noven-wb-launcher-main strong { font-size: 13px; font-weight: 600; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.noven-wb-launcher-main small { font-size: 11px; opacity: .6; }
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
.noven-wb-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(120px, 1fr)); gap: 8px; align-content: start; }
.noven-wb-thumb { position: relative; aspect-ratio: 1; border-radius: 8px; overflow: hidden; border: 1px solid rgba(128,128,128,.3); background: rgba(128,128,128,.08); cursor: zoom-in; padding: 0; }
.noven-wb-thumb img { width: 100%; height: 100%; object-fit: cover; display: block; }
.noven-wb-thumb[data-pinned='true']::after { content: '★'; position: absolute; top: 2px; right: 5px; font-size: 11px; color: #e0b04c; text-shadow: 0 0 3px rgba(0,0,0,.8); }
.noven-wb-docs { display: flex; flex-wrap: wrap; gap: 4px; flex: none; }
.noven-wb-doc { border: 1px solid rgba(128,128,128,.35); border-radius: 6px; padding: 2px 8px; font-size: 12px; background: transparent; color: inherit; cursor: pointer; max-width: 160px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
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
`

let injected = false

/** Append the gallery stylesheet to the document head, once. */
export function injectGalleryStyles(): void {
  if (injected || typeof document === 'undefined') return
  injected = true
  const element = document.createElement('style')
  element.dataset.novenWorkbench = ''
  element.textContent = CSS
  document.head.append(element)
}
