# Fantasy Map Generator · Noven vendored editor

Upstream: [Azgaar/Fantasy-Map-Generator](https://github.com/Azgaar/Fantasy-Map-Generator)
Pinned version: **v1.154.2** (`4305a1a`), MIT — see `LICENSE`.

This is the complete upstream editor source, vendored so the Noven map module
can use it as the only map surface. It is not the same thing as
`plugins-noven/noven-fmg/src/world` (our deterministic generation kernel);
this directory is the editor application.

## Noven additions

- `public/noven-host.html` — same-origin host page. It embeds the editor in an
  iframe and injects the Noven theme.
- `public/noven-theme.css` — first-pass Noven skin: palette, fonts, radii,
  menu/tabs/layers/dialogs. The map rendering style is still upstream.
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
# open http://127.0.0.1:8101/Fantasy-Map-Generator/noven-host.html
```

The host is same-origin with the app, so it can inject the theme and the
parent page can call `iframe.contentWindow.novenMap`.

## Not wired yet

- Card storage: the `.map` payload is not yet persisted in the map module.
- The map module still renders the old `map-editor.tsx`; the iframe host is
  not mounted there yet.
- `地理` / `时间线` still bind to the old custom markers, not FMG burgs/markers.
- AI tools still read the old `world/edits` payload, not the FMG `.map`.
- The map's own style (paper/ink) is still upstream; the theme currently covers
  the editor chrome only.
- The upstream UI is English; localization is not applied.

## License

MIT. Keep `LICENSE` and this README with the vendored source. The upstream
project requests attribution; do not strip its notices.
