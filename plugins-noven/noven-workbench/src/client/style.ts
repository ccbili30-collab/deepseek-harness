/**
 * The gallery's stylesheet, injected once per document load. The plugin
 * bundle carries no CSS module pipeline, so the styles ship as one scoped
 * `<style>` element with `noven-wb-` class names and neutral translucent
 * surfaces that sit on either theme.
 * @module noven-workbench/client/style
 */

const CSS = `
.noven-wb-root { display: flex; flex-direction: column; gap: 8px; height: 100%; min-height: 0; padding: 8px; }
.noven-wb-chips { display: flex; flex-wrap: wrap; gap: 4px; flex: none; }
.noven-wb-chip { border: 1px solid rgba(128,128,128,.4); border-radius: 999px; padding: 2px 10px; font-size: 12px; background: transparent; color: inherit; cursor: pointer; }
.noven-wb-chip[data-active='true'] { background: rgba(128,128,128,.25); border-color: rgba(128,128,128,.8); }
.noven-wb-toolbar { display: flex; align-items: center; gap: 6px; flex: none; flex-wrap: wrap; }
.noven-wb-btn { border: 1px solid rgba(128,128,128,.4); border-radius: 6px; padding: 2px 10px; font-size: 12px; background: transparent; color: inherit; cursor: pointer; }
.noven-wb-btn[data-active='true'] { background: rgba(128,128,128,.25); }
.noven-wb-note { font-size: 12px; opacity: .75; }
.noven-wb-error { font-size: 12px; color: #e06c75; }
.noven-wb-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(96px, 1fr)); gap: 6px; overflow-y: auto; min-height: 0; flex: 1; align-content: start; }
.noven-wb-thumb { position: relative; aspect-ratio: 1; border-radius: 8px; overflow: hidden; border: 1px solid rgba(128,128,128,.3); background: rgba(128,128,128,.08); cursor: zoom-in; padding: 0; }
.noven-wb-thumb img { width: 100%; height: 100%; object-fit: cover; display: block; }
.noven-wb-thumb[data-pinned='true']::after { content: '★'; position: absolute; top: 2px; right: 5px; font-size: 11px; color: #e0b04c; text-shadow: 0 0 3px rgba(0,0,0,.8); }
.noven-wb-docs { display: flex; flex-wrap: wrap; gap: 4px; flex: none; }
.noven-wb-doc { border: 1px solid rgba(128,128,128,.35); border-radius: 6px; padding: 2px 8px; font-size: 12px; background: transparent; color: inherit; cursor: pointer; max-width: 160px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.noven-wb-stage { display: flex; flex-direction: column; gap: 8px; height: 100%; min-height: 0; padding: 8px; }
.noven-wb-figure { position: relative; align-self: flex-start; max-width: 100%; margin: 0; line-height: 0; }
.noven-wb-figure img { max-width: 100%; max-height: 60vh; display: block; border-radius: 6px; }
.noven-wb-overlay { position: absolute; inset: 0; }
.noven-wb-overlay[data-mode='annotate'] { cursor: crosshair; }
.noven-wb-overlay[data-mode='pick'] { cursor: crosshair; }
.noven-wb-anno { position: absolute; border: 1.5px solid #4cc2ff; background: rgba(76,194,255,.12); border-radius: 2px; }
.noven-wb-anno[data-selected='true'] { border-color: #ff8a4c; background: rgba(255,138,76,.15); }
.noven-wb-anno-label { position: absolute; top: 100%; left: 0; font-size: 11px; line-height: 1.3; color: inherit; background: rgba(20,20,20,.75); color: #fff; border-radius: 4px; padding: 2px 6px; max-width: 240px; white-space: normal; }
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
