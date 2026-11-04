/**
 * Pack candidate shared libraries, install them without source links, and build
 * both Noven consumers against their published declarations. Run after the
 * shared packages, noven-ledger and noven-fmg have emitted their lib outputs.
 */
import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import { webcrypto } from 'node:crypto'
import { cpSync, mkdirSync, mkdtempSync, readFileSync, realpathSync, rmSync, writeFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { runInNewContext } from 'node:vm'
import { JSDOM } from 'jsdom'

const root = fileURLToPath(new URL('../../../', import.meta.url))
const tools = createRequire(join(root, 'package.json'))
const { build } = await import(pathToFileURL(createRequire(tools.resolve('tsx/package.json')).resolve('esbuild')).href)
const artifacts = join(root, '.artifacts')
mkdirSync(artifacts, { recursive: true })
const installedConsumer = process.argv[2] === undefined ? undefined : resolve(process.argv[2])
const consumer = installedConsumer ?? mkdtempSync(join(artifacts, 'packed-runtime-'))
const packs = join(consumer, 'packs')
mkdirSync(packs, { recursive: true })
const libraries = [
  'packages/client/ui-slots', 'packages/client/ui-renderer',
  'packages/client/ui-settings', 'packages/client/ui-settings-general',
  'packages/client/ui-primitives', 'packages/client/store',
  'packages/api/session-controller',
  'packages/util/workspace-path', 'packages/util/code-language',
  'plugins-noven/noven-ledger', 'plugins-noven/noven-fmg',
]
const plugins = ['noven-shell', 'noven-image']
const dependencies = { 'legacy-slots': 'npm:@deepseek-ai/dsh-client-ui-slots@0.1.7-rc.2' }
const packed = {}
const dom = new JSDOM('<!doctype html><div id="root"></div>', { url: 'http://localhost/' })
const browser = {
  window: dom.window, document: dom.window.document, navigator: dom.window.navigator,
  HTMLElement: dom.window.HTMLElement, Element: dom.window.Element, Node: dom.window.Node,
  MutationObserver: dom.window.MutationObserver, console, setTimeout, clearTimeout,
  AbortController, fetch, URL, TextEncoder, TextDecoder, crypto: webcrypto,
}

/** Run one bounded command; failures include its captured diagnostics. */
function command(program, args, cwd = consumer) {
  try {
    return execFileSync(program, args, { cwd, stdio: 'pipe', encoding: 'utf8', timeout: 120_000, maxBuffer: 8 * 1024 * 1024 })
  } catch (error) {
    throw new Error(`${program} ${args.join(' ')}\n${error.stdout ?? ''}\n${error.stderr ?? ''}`, { cause: error })
  }
}

try {
  if (installedConsumer === undefined) {
    for (const relative of libraries) {
      const directory = join(root, relative)
      const manifest = JSON.parse(readFileSync(join(directory, 'package.json'), 'utf8'))
      command('pnpm', ['pack', '--pack-destination', packs], directory)
      const archive = join(packs, `${manifest.name.replace('@', '').replace('/', '-')}-${manifest.version}.tgz`)
      packed[manifest.name] = pathToFileURL(archive).href
      // Static libraries' runtime imports are supplied by the desktop frontend.
      for (const [name, version] of Object.entries(manifest.devDependencies ?? {})) {
        if (!version.startsWith('workspace:')) dependencies[name] = version
      }
    }
    for (const name of plugins) {
      const source = join(root, 'plugins-noven', name)
      const destination = join(consumer, 'plugins', name)
      mkdirSync(destination, { recursive: true })
      cpSync(join(source, 'src'), join(destination, 'src'), { recursive: true })
      for (const file of ['tsconfig.json', 'tsdown.config.ts']) cpSync(join(source, file), join(destination, file))
      if (name === 'noven-shell') cpSync(join(source, 'tsconfig.host.json'), join(destination, 'tsconfig.host.json'))
      const manifest = JSON.parse(readFileSync(join(source, 'package.json'), 'utf8'))
      for (const [dependency, version] of Object.entries({ ...manifest.dependencies, ...manifest.devDependencies })) {
        dependencies[dependency] = packed[dependency] ?? version
      }
      writeFileSync(join(destination, 'package.json'), JSON.stringify({ ...manifest, devDependencies: {}, dependencies: {} }, null, 2) + '\n')
    }
    Object.assign(dependencies, packed)
    writeFileSync(join(consumer, 'package.json'), JSON.stringify({
      name: 'noven-packed-runtime-smoke', private: true, type: 'module',
      version: JSON.parse(readFileSync(join(root, 'package.json'), 'utf8')).version,
      dependencies,
    }, null, 2) + '\n')
    // This throwaway consumer must not join the containing source workspace.
    writeFileSync(join(consumer, 'pnpm-workspace.yaml'), 'packages: []\n')
    command('pnpm', ['install', '--ignore-scripts', '--no-lockfile', '--child-concurrency=1', '--network-concurrency=1'])
    for (const name of Object.keys(packed)) {
      const installed = realpathSync(join(consumer, 'node_modules', name))
      assert.ok(installed.startsWith(join(consumer, 'node_modules')), `source link: ${name} -> ${installed}`)
    }
  }
  const bin = join(consumer, 'node_modules', '.bin')
  for (const name of plugins) {
    const directory = join(consumer, 'plugins', name)
    if (installedConsumer !== undefined) {
      const source = join(root, 'plugins-noven', name)
      rmSync(join(directory, 'src'), { recursive: true, force: true })
      cpSync(join(source, 'src'), join(directory, 'src'), { recursive: true })
      for (const file of ['tsconfig.json', 'tsdown.config.ts']) cpSync(join(source, file), join(directory, file))
      if (name === 'noven-shell') cpSync(join(source, 'tsconfig.host.json'), join(directory, 'tsconfig.host.json'))
    }
    command(join(bin, 'tsc'), ['-p', 'tsconfig.json'], directory)
    if (name === 'noven-shell') command(join(bin, 'tsc'), ['-p', 'tsconfig.host.json'], directory)
    command(join(bin, 'tsdown'), ['--config', 'tsdown.config.ts'], directory)
    console.log(`${name}: installed declarations and client bundle PASS`)
  }
  writeFileSync(join(consumer, 'metadata.ts'), `
import { SlotCore } from '@deepseek-ai/dsh-client-ui-slots'
import type { SettingsSectionMetadata } from '@deepseek-ai/dsh-client-ui-settings/client'
const core = new SlotCore()
const metadata: SettingsSectionMetadata = { icon: 'settings', group: 'noven' }
core.register({ name: 'settings.section', id: 'noven', metadata }, () => null)
const group: string | undefined = core.entries('settings.section')[0]?.options.metadata?.group
// @ts-expect-error icon identifiers are declared by ui-settings
core.register({ name: 'settings.section', id: 'bad', metadata: { icon: 'invalid' } }, () => null)
// @ts-expect-error settings.header declares no metadata
core.register({ name: 'settings.header', metadata }, () => null)
void group
`)
  command(join(consumer, 'node_modules', '.bin', 'tsc'), [
    '--noEmit', '--strict', '--skipLibCheck', '--types', 'node', '--target', 'es2024',
    '--module', 'nodenext', '--moduleResolution', 'nodenext', 'metadata.ts',
  ])
  console.log('installed metadata types and rejection cases PASS')
  const require = createRequire(join(consumer, 'package.json'))
  const imageHost = await import(pathToFileURL(join(consumer, 'plugins', 'noven-image', 'lib', 'index.js')).href)
  assert.equal(typeof imageHost.apply, 'function')
  assert.ok(imageHost.inject.includes('credentials'))
  console.log('image Host runtime imports from installed dependencies PASS')
  const modules = {}
  for (const name of ['react', 'react/jsx-runtime', 'react-dom', 'react-dom/client',
    '@deepseek-ai/cordis', '@deepseek-ai/dsh-client-store', '@deepseek-ai/dsh-client-ui-slots']) {
    modules[name] = await import(pathToFileURL(require.resolve(name)).href)
  }
  // The desktop frontend bundles static libraries and CSS before loading plugins.
  const compiled = await build({
    entryPoints: [require.resolve('@deepseek-ai/dsh-client-ui-primitives')],
    outfile: join(consumer, 'primitives.cjs'), bundle: true, format: 'cjs', platform: 'browser',
    loader: { '.css': 'local-css', '.woff2': 'dataurl', '.woff': 'dataurl', '.ttf': 'dataurl' },
    external: Object.keys(modules), write: false, logLevel: 'silent',
  })
  const primitiveModule = { exports: {} }
  runInNewContext(compiled.outputFiles.find(file => file.path.endsWith('.cjs')).text, {
    ...browser, module: primitiveModule, exports: primitiveModule.exports, require: name => modules[name],
  })
  modules['@deepseek-ai/dsh-client-ui-primitives'] = primitiveModule.exports
  const load = ({ id, factory }) => {
    modules[id] = factory(name => {
      assert.ok(modules[name], `missing installed platform module: ${name}`)
      return modules[name]
    })
  }
  dom.window.__ModuleLoader__ = { load }
  for (const name of ['@deepseek-ai/dsh-client-ui-renderer', '@deepseek-ai/dsh-client-ui-settings-general', ...plugins]) {
    const directory = name.startsWith('noven-') ? join(consumer, 'plugins', name) : dirname(require.resolve(`${name}/package.json`))
    runInNewContext(readFileSync(join(directory, 'lib', 'client.js'), 'utf8'), browser)
    assert.equal(typeof modules[name].apply, 'function')
  }
  const { Context } = modules['@deepseek-ai/cordis']
  const ctx = new Context()
  const registry = new modules['@deepseek-ai/dsh-client-ui-renderer'].SlotRegistry(ctx)
  const frame = registry.register({ name: 'root', children: { 'settings.section': { kind: 'list', scope: 'root' } } }, () => null)
  const metadata = { icon: 'settings', group: 'noven' }
  const release = registry.register({ name: 'settings.section', id: 'noven', metadata }, () => null)
  assert.deepEqual(registry.entries('settings.section')[0].options.metadata, metadata)
  release()
  assert.equal(registry.entries('settings.section').length, 0)
  frame()
  const { SlotCore: LegacyCore } = await import(pathToFileURL(require.resolve('legacy-slots')).href)
  const legacy = new LegacyCore()
  legacy.register({ name: 'root', children: { 'settings.section': { kind: 'list', scope: 'root' } } }, () => null)
  legacy.register({ name: 'settings.section', id: 'noven', label: 'Noven', metadata }, () => null)
  assert.equal(legacy.entries('settings.section')[0].options.id, 'noven')
  assert.equal(legacy.entries('settings.section')[0].options.metadata, undefined)
  console.log('packed factories, Cordis registry lifecycle and rc.2 metadata fallback PASS')
} finally {
  dom.window.close()
  if (installedConsumer !== undefined || process.env.NOVEN_PACK_SMOKE_KEEP === '1') console.log(`Retained consumer: ${consumer}`)
  else rmSync(consumer, { recursive: true, force: true })
}
