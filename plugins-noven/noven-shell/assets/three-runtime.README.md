# three-runtime.js

Bundled from the local `three` dependency (0.180.0) with esbuild, including
`GLTFLoader`:

```sh
cat > .three-entry.mjs <<'JS'
export * from 'three'
export { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js'
JS
npx esbuild .three-entry.mjs --bundle --format=esm --minify \
  --legal-comments=none --outfile=assets/three-runtime.js
rm .three-entry.mjs
```

The sandbox and the standalone export both use this single file. It is shipped
as a package asset, not rebuilt on every app launch. Regenerate it when bumping
`three`.
