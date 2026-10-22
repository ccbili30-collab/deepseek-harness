# three-runtime.js

Bundled from the local `three` dependency (0.180.0) with esbuild. It exports
the core plus the addons free surfaces can rely on without a CDN:

- `GLTFLoader`
- `RGBELoader`
- `OrbitControls`
- `PointerLockControls`
- `TransformControls`

```sh
cat > .three-entry.mjs <<'JS'
export * from 'three'
export { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js'
export { RGBELoader } from 'three/examples/jsm/loaders/RGBELoader.js'
export { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js'
export { PointerLockControls } from 'three/examples/jsm/controls/PointerLockControls.js'
export { TransformControls } from 'three/examples/jsm/controls/TransformControls.js'
JS
npx esbuild .three-entry.mjs --bundle --format=esm --minify \
  --legal-comments=none --outfile=assets/three-runtime.js
rm .three-entry.mjs
```

Addons outside this list can still be vendored as surface files; a bare
`from 'three'` inside them is not resolvable in the sandbox, so import the
runtime through `NOVEN_THREE` instead.

The sandbox and the standalone export both use this single file. It is shipped
as a package asset, not rebuilt on every app launch. Regenerate it when bumping
`three`.
