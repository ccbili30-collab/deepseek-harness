import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import {
  NOVEN_PLUGIN_PACKAGES,
  NOVEN_PROFILE_BUNDLES,
  finalizeNovenProfile,
  verifyNovenProfileImports,
  verifyNovenProfileLockfile,
  verifyNovenProfileResolution,
  writeNovenProfileBuild,
} from '../scripts/noven-profile.ts'
import type { PackedDesktopPackage } from '../scripts/prepare-package-set.ts'
import { assertNovenPluginActivation } from '../scripts/smoke-noven-profile.ts'

const roots: string[] = []
function temporaryRoot(): string {
  const root = mkdtempSync(join(tmpdir(), 'noven-profile-test-'))
  roots.push(root)
  return root
}

afterEach(() => {
  for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true })
})

function packageFile(root: string, name: string, filename: string, body = name): PackedDesktopPackage {
  const tarball = join(root, filename)
  writeFileSync(tarball, body)
  return { tarball, manifest: { name, version: '0.1.0' } }
}

function selectedPackages(root: string): PackedDesktopPackage[] {
  return [
    packageFile(root, '@deepseek-ai/dsh', 'deepseek-ai-dsh-0.1.0.tgz'),
    packageFile(root, '@deepseek-ai/dsh-desktop-host', 'deepseek-ai-dsh-desktop-host-0.1.0.tgz'),
    ...NOVEN_PLUGIN_PACKAGES.map(name => packageFile(root, name, `${name}-0.1.0.tgz`)),
  ]
}

function writePackage(dir: string, name: string, bundle = false, peerDependencies: readonly string[] = []): void {
  mkdirSync(join(dir, 'lib'), { recursive: true })
  writeFileSync(join(dir, 'package.json'), JSON.stringify({
    name,
    version: '0.1.0',
    type: 'module',
    main: 'lib/index.js',
    exports: { '.': './lib/index.js', './package.json': './package.json' },
    peerDependencies: Object.fromEntries(peerDependencies.map(peer => [peer, '0.1.0'])),
    ...(bundle ? { dsh: { bundle: { patch: 'bundle.yml' } } } : {}),
  }))
  writeFileSync(join(dir, 'lib', 'index.js'), '')
  if (bundle) writeFileSync(join(dir, 'bundle.yml'), '[]\n')
}

function seedNovenPackages(profile: string): void {
  for (const name of NOVEN_PLUGIN_PACKAGES) writePackage(join(profile, 'node_modules', name), name, true)
}

function seedInstallAnchor(root: string): string {
  const anchor = join(root, 'dsh', 'node_modules', '@deepseek-ai', 'dsh', 'package.json')
  mkdirSync(join(anchor, '..'), { recursive: true })
  writeFileSync(anchor, JSON.stringify({
    name: '@deepseek-ai/dsh',
    version: '0.1.0',
    dependencies: { '@deepseek-ai/dsh-base': '0.1.0', '@deepseek-ai/dsh-web-app': '0.1.0' },
  }))
  for (const name of ['@deepseek-ai/dsh-base', '@deepseek-ai/dsh-web-app']) {
    writePackage(join(root, 'dsh', 'node_modules', name), name, true)
  }
  return anchor
}

describe('Noven profile build metadata', () => {
  it('writes exact local package records and removes every install-only residue', () => {
    const root = temporaryRoot()
    const profile = join(root, 'profile')
    const selected = selectedPackages(root)
    const packageSet = writeNovenProfileBuild(profile, selected)
    expect(packageSet.packages).toHaveLength(selected.length)
    expect(packageSet.packages.map(entry => entry.name)).toContain('@deepseek-ai/dsh')
    expect(packageSet.packages.map(entry => entry.name)).toContain('@deepseek-ai/dsh-desktop-host')
    const manifest = JSON.parse(readFileSync(join(profile, 'package.json'), 'utf8')) as {
      dependencies: Record<string, string>
      devDependencies: Record<string, string>
      dsh: { profile: { bundles: string[] } }
    }
    expect(manifest.dependencies).toEqual(Object.fromEntries(
      NOVEN_PLUGIN_PACKAGES.map(name => [name, '0.1.0']),
    ))
    expect(manifest.devDependencies).toEqual({
      '@deepseek-ai/dsh': '0.1.0',
      '@deepseek-ai/dsh-desktop-host': '0.1.0',
    })
    expect(manifest.dsh.profile.bundles).toEqual(NOVEN_PROFILE_BUNDLES)
    expect(manifest.dsh.profile.bundles).not.toContain('dsh-better-sidebar')
    expect(readFileSync(join(profile, 'pnpm-workspace.yaml'), 'utf8')).toContain('file:./desktop-packages/')
    expect(readFileSync(join(profile, 'cordis.patch.yml'), 'utf8')).toContain('apiKeyEnv: GMN_API_KEY')
    expect(readFileSync(join(profile, 'cordis.patch.yml'), 'utf8')).toContain('baseURL: https://proxy.qianc.ltd/v1')
    expect(readFileSync(join(profile, 'cordis.patch.yml'), 'utf8')).toContain('model: gpt-image-2.5')
    expect(readFileSync(join(profile, 'cordis.patch.yml'), 'utf8')).toContain('apiKeyEnv: NOVEN_IMAGE_API_KEY')
    expect(readFileSync(join(profile, 'cordis.patch.yml'), 'utf8')).toContain('defaultWorkspaceDirectory:')
    expect(readFileSync(join(profile, 'cordis.patch.yml'), 'utf8')).toContain('NOVEN_PROJECTS_ROOT')
    expect(readFileSync(join(profile, 'cordis.patch.yml'), 'utf8')).not.toContain('apiKey:')
    writeFileSync(join(profile, 'pnpm-lock.yaml'), 'lockfileVersion: 9.0\n')
    finalizeNovenProfile(profile)
    expect(existsSync(join(profile, 'desktop-packages'))).toBe(false)
    expect(existsSync(join(profile, 'pnpm-lock.yaml'))).toBe(false)
    expect(readFileSync(join(profile, 'pnpm-workspace.yaml'), 'utf8')).not.toContain('file:./desktop-packages/')
  })

  it('rejects a lockfile that resolves a first-party package from a registry', () => {
    const root = temporaryRoot()
    const profile = join(root, 'profile')
    const selected = selectedPackages(root)
    writeNovenProfileBuild(profile, selected)
    writeFileSync(join(profile, 'pnpm-lock.yaml'), '  "@deepseek-ai/dsh@0.1.0":\n')
    expect(() => verifyNovenProfileLockfile(profile)).toThrow('outside the local package set')
  })
})

describe('Noven runtime import gate', () => {
  it('resolves ESM, dynamic, and CommonJS imports in built JavaScript', async () => {
    const root = temporaryRoot()
    const profile = join(root, 'profile')
    seedNovenPackages(profile)
    writePackage(join(profile, 'node_modules', 'trash'), 'trash')
    writePackage(join(profile, 'node_modules', '@deepseek-ai', 'dsh-tools'), '@deepseek-ai/dsh-tools')
    writeFileSync(join(profile, 'node_modules', 'noven-library', 'lib', 'index.js'), [
      "import 'noven-ledger'",
      "await import('trash')",
      "const tools = require('@deepseek-ai/dsh-tools')",
      '// import "not-a-real-package"',
    ].join('\n'))
    await expect(verifyNovenProfileImports(profile, join(profile, 'package.json'))).resolves.toMatchObject({ imports: 3 })
  })

  it('resolves core-runtime imports without duplicating them in the Noven profile', async () => {
    const root = temporaryRoot()
    const anchor = seedInstallAnchor(root)
    const profile = join(root, 'profile')
    seedNovenPackages(profile)
    writePackage(join(root, 'dsh', 'node_modules', '@deepseek-ai', 'dsh-tools'), '@deepseek-ai/dsh-tools')
    writePackage(join(profile, 'node_modules', 'noven-docs'), 'noven-docs', true, ['@deepseek-ai/dsh-tools'])
    writeFileSync(join(profile, 'node_modules', 'noven-docs', 'lib', 'index.js'),
      "import tools from '@deepseek-ai/dsh-tools'\n")
    await expect(verifyNovenProfileImports(profile, anchor)).resolves.toMatchObject({ imports: 1 })
    expect(existsSync(join(profile, 'node_modules', '@deepseek-ai', 'dsh-tools'))).toBe(false)
  })

  it('rejects a Host import that only works while the checkout supplies an undeclared peer', async () => {
    const root = temporaryRoot()
    const anchor = seedInstallAnchor(root)
    const profile = join(root, 'profile')
    seedNovenPackages(profile)
    writePackage(join(root, 'dsh', 'node_modules', '@deepseek-ai', 'dsh-llm'), '@deepseek-ai/dsh-llm')
    writeFileSync(join(profile, 'node_modules', 'noven-shell', 'lib', 'index.js'),
      "import { createUserMessage } from '@deepseek-ai/dsh-llm'\n")

    await expect(verifyNovenProfileImports(profile, anchor)).rejects.toThrow('noven-shell peerDependencies')
  })

  it('allows declared browser platform externals without Node packages', async () => {
    const root = temporaryRoot()
    const anchor = seedInstallAnchor(root)
    const profile = join(root, 'profile')
    seedNovenPackages(profile)
    mkdirSync(join(profile, 'node_modules', 'noven-image', 'lib', 'client'), { recursive: true })
    writeFileSync(join(profile, 'node_modules', 'noven-image', 'lib', 'client', 'settings.js'),
      "import { jsx } from 'react/jsx-runtime'\n")

    await expect(verifyNovenProfileImports(profile, anchor)).resolves.toMatchObject({ imports: 1 })
  })

  it('still rejects an unresolvable non-platform browser dependency', async () => {
    const root = temporaryRoot()
    const profile = join(root, 'profile')
    seedNovenPackages(profile)
    writeFileSync(join(profile, 'node_modules', 'noven-image', 'lib', 'client.js'),
      "import missing from 'missing-client-dependency'\n")

    await expect(verifyNovenProfileImports(profile, join(profile, 'package.json')))
      .rejects.toThrow('missing-client-dependency')
  })

  it('fails closed when a built import has no installed package', async () => {
    const root = temporaryRoot()
    const profile = join(root, 'profile')
    seedNovenPackages(profile)
    writeFileSync(join(profile, 'node_modules', 'noven-library', 'lib', 'index.js'),
      "import trash from 'trash'\nimport tools from '@deepseek-ai/dsh-tools'\n")
    const failure = await verifyNovenProfileImports(profile, join(profile, 'package.json')).catch((error: unknown) => error)
    expect(String(failure)).toContain('trash')
    expect(String(failure)).toContain('@deepseek-ai/dsh-tools')
  })
})

describe('Noven app-boot resolution gate', () => {
  it('rejects inactive plugins and duplicate registrations in Host diagnostics', () => {
    expect(() => assertNovenPluginActivation('')).not.toThrow()
    for (const diagnostic of [
      'dsh: warning: 1 entry did not activate',
      'service "subprocess" has been registered',
      'typert: Remote package "fixture" is already registered',
    ]) {
      expect(() => assertNovenPluginActivation(diagnostic)).toThrow('Host plugin activation audit failed')
    }
  })

  it('loads every enabled bundle without skipped bundles or duplicate runtime entries', async () => {
    const root = temporaryRoot()
    const anchor = seedInstallAnchor(root)
    const profile = join(root, 'profile')
    mkdirSync(profile, { recursive: true })
    writeFileSync(join(profile, 'package.json'), JSON.stringify({
      name: 'noven-desktop-profile', version: '0.1.0', dsh: { profile: { bundles: NOVEN_PROFILE_BUNDLES } },
    }))
    seedNovenPackages(profile)
    await expect(verifyNovenProfileResolution(profile, anchor)).resolves.toMatchObject({
      bundles: NOVEN_PROFILE_BUNDLES.length,
    })
  })

  it('fails when any enabled bundle is skipped', async () => {
    const root = temporaryRoot()
    const anchor = seedInstallAnchor(root)
    const profile = join(root, 'profile')
    mkdirSync(profile, { recursive: true })
    writeFileSync(join(profile, 'package.json'), JSON.stringify({
      name: 'noven-desktop-profile', version: '0.1.0', dsh: { profile: { bundles: NOVEN_PROFILE_BUNDLES } },
    }))
    seedNovenPackages(profile)
    writeFileSync(join(profile, 'node_modules', 'noven-cards', 'package.json'), JSON.stringify({
      name: 'noven-cards', version: '0.1.0', type: 'module',
    }))
    await expect(verifyNovenProfileResolution(profile, anchor)).rejects.toThrow('skipped bundles')
  })
})
