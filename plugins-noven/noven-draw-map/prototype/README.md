# Map editor prototype

Single-file, zero-dependency prototype of the layered map editor. Open
`editor.html` in a browser; no build, no server required.

## Position in the project

This is the **authoring/editing** counterpart of the existing pipeline:

- `noven-draw-map` (read path): model generates base PNG → region plan →
  `derive-region-mask.mjs` → `build-interactive-map.mjs` → `index.html` atlas.
- `noven-workbench/MapStage.tsx`: renders that read-only atlas in place.
- **This prototype**: replaces one-shot watershed masks with human/AI
  co-editable vector objects. Same delivery shape as the atlas (`index.html`).

Migration targets, in order of effort:

1. Bundle asset beside the existing viewer — the skill emits `editor.html`
   plus `map-scene.json` next to `map-manifest.json`.
2. A `EditableMapStage` in noven-workbench, with host tools persisting
   `map-scene.json` and the model reading/writing it via the ops format below.

## Model of the world

- World unit = base-image pixel, origin top-left. All stored coordinates and
  everything the model reads/writes use it; view zoom/pan is display-only.
- One brush primitive (a circle of radius `r`), three record modes:
  - **圈 lasso** — center path only, auto-closed → face outline.
  - **涂抹 smear** — path + radius rasterized, outer contour extracted → face.
  - **线 line** — center path = skeleton, radius = width (per-node, so rivers
    can widen/narrow); endpoints snap to existing skeletons/landmarks and
    store an attach reference that follows the target when it is stretched.
- Objects: `face` (outer contour, no holes — enclosed lakes are kept as area),
  `line` (skeleton + per-node widths), `mark` (point). All clickable.
- Soft stretch: grab the outline, pull with arc-length gaussian falloff;
  interior drag moves the whole object; Alt+drag a line node edits local width.
- Disputes: same-layer face overlaps are a **derived** state (rasterized
  intersection), never stored; they render red and export into the scene doc.
- Draft layer: semantic-color paint; "草稿→底图" promotes it (img2img hook is
  a stub here — the real flow sends palette+description to the provider).

## map-scene.json contract (version 1)

```jsonc
{
  "version": 1,
  "canvas": { "width": 1600, "height": 1000 },
  "coordinateUnit": "base-image pixels, origin top-left",
  "objects": [
    { "id": "f1", "type": "face", "layer": "kingdom", "name": "...", "color": "#d8a94e",
      "outline": [[x, y], "..."],          // full contour
      "keyPoints": [[x, y], "..."],        // DP-simplified, what the model edits
      "centroid": [x, y], "bbox": [x0, y0, x1, y1], "areaPx": 123 },
    { "id": "l1", "type": "line", "layer": "road", "name": "...",
      "skeleton": [[x, y], "..."], "width": 12,
      "attachStart": { "kind": "line", "id": "l0", "t": 0.42 } },
    { "id": "m1", "type": "mark", "layer": "landmark", "name": "...", "pos": [x, y] }
  ],
  "disputes": [{ "a": "f1", "b": "f2", "layer": "kingdom", "bbox": [0, 0, 9, 9] }],
  "palette": [{ "name": "森林", "desc": "forest", "color": "#3f6b3f" }]
}
```

Model writes come back as ops; each op batch is one undo step and the result
is re-rendered on the map for the user to confirm or stretch:

```jsonc
{ "ops": [{ "op": "upsert", "object": { "type": "face", "layer": "faction",
    "name": "北境", "outline": [[x, y], "..."] } }] }
```

The importer accepts either that ops envelope or a full exported scene.
Incoming point lists are re-densified and smoothed into the same editable
"rope" the user draws, so AI output is immediately stretchable.

## Deliberately out of scope for the prototype

- img2img base generation (the `草稿→底图` button promotes the draft bitmap
  directly) and the model round-trip itself — both are host-side concerns.
- Persistence beyond export/import, undo across draft strokes.
- Polygon boolean ops — disputes and add/subtract paint are raster-derived.
