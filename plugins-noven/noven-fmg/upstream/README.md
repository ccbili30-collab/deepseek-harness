# Fantasy Map Generator · Noven vendored editor

Upstream: [Azgaar/Fantasy-Map-Generator](https://github.com/Azgaar/Fantasy-Map-Generator)
Pinned version: **v1.154.2** (`4305a1a`), MIT — see `LICENSE`.

This is the complete upstream editor source, vendored so the Noven map module
can use it as the only map surface. It is not the same thing as
`plugins-noven/noven-fmg/src/world` (our deterministic generation kernel);
this directory is the editor application.

## Noven additions

- `public/noven-shell.js` / `public/noven-shell.css` — the Noven workspace,
  mounted inside the editor document. It owns the stage bar, world inspector,
  layers, AI history and the styled native dialogs.
- `index.html` loads `noven-i18n.js` and `noven-shell.js` before `</body>`.
  The editor, shell, dialogs and overlays share one document and one stacking
  context; there is no parent host page.
- `public/noven-host.html` / `public/noven-theme.css` — legacy v1 host pair,
  kept only for reference and the service-worker precache. The card no longer
  loads them.
- `src/noven-bridge.ts` — `window.novenMap` bridge:
  - `load(mapData: string): Promise<void>` loads a `.map` payload.
  - `save(): string` returns the current `.map` payload.
  - `window.novenMapReady` / `noven:ready` signal when boot is complete.
- `src/services/io/load.ts` — exports `loadMapData` for the bridge.
- `src/components/lifecycle.ts` — publishes `novenMapReady`.

## Build / run

Requires Node >= 24.

```sh
npm ci
npm run build
npx vite preview --host 127.0.0.1 --port 8101
# open http://127.0.0.1:8101/Fantasy-Map-Generator/index.html?noven=blank
```

The embedded shell talks to its card through `postMessage`; the card-side host
is `plugins-noven/noven-shell/src/client/fmg-map-host.tsx`.

## Known limits

- Native editor tables keep their upstream layout; the shell styles the dialog
  chrome, title and common headers, not every deep help string.
- Map rendering style is upstream. The Noven palette covers the workspace and
  dialog chrome; it does not replace the cartographic style presets.
- `地理` / `时间线` marker links still bind to the old custom markers, not FMG
  burgs/markers.
- AI instructions run in the card conversation; the map's AI panel only lists
  applied batches and undoes them.
- The legacy `noven-host.html` pair remains in `public/` for the standalone
  service-worker precache; the card loads `index.html` directly.
## License

MIT. Keep `LICENSE` and this README with the vendored source. The upstream
project requests attribution; do not strip its notices.
