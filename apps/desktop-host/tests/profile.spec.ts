import { mkdirSync, mkdtempSync, rmSync, symlinkSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { composeEntries } from '@deepseek-ai/dsh-app-boot'
import { loadDesktopProfile } from '../src/profile.ts'

const roots: string[] = []
function temporaryRoot(): string {
  const root = mkdtempSync(join(tmpdir(), 'desktop-profile-composition-'))
  roots.push(root)
  return root
}

afterEach(() => {
  for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true })
})

function writeBundle(root: string, name: string, id: string): void {
  mkdirSync(join(root, 'lib'), { recursive: true })
  writeFileSync(join(root, 'package.json'), JSON.stringify({
    name, version: '1.0.0', dsh: { bundle: { patch: 'bundle.yml' } },
  }))
  writeFileSync(join(root, 'bundle.yml'), `- insert:\n    - id: ${id}\n      name: ${id}-plugin\n`)
}

function fixture(): { user: string; runtime: string; anchor: string } {
  const root = temporaryRoot()
  const anchor = join(root, 'runtime', 'node_modules', '@deepseek-ai', 'dsh', 'package.json')
  mkdirSync(join(anchor, '..'), { recursive: true })
  writeFileSync(anchor, '{"name":"@deepseek-ai/dsh","version":"1.0.0","dependencies":{}}\n')
  const runtime = join(root, 'resources', 'noven-profile')
  writeBundle(join(runtime, 'node_modules', 'noven-brand'), 'noven-brand', 'shared')
  writeFileSync(join(runtime, 'package.json'), JSON.stringify({
    name: 'noven-profile', dependencies: { 'noven-brand': '1.0.0' }, dsh: { profile: { bundles: ['noven-brand'] } },
  }))
  writeFileSync(join(runtime, 'cordis.patch.yml'), '- id: shared\n  config:\n    value: runtime\n')
  const user = join(root, 'user-profile')
  writeBundle(join(user, 'node_modules', 'custom-plugin'), 'custom-plugin', 'custom')
  mkdirSync(join(user, 'node_modules'), { recursive: true })
  symlinkSync(join(runtime, 'node_modules', 'noven-brand'), join(user, 'node_modules', 'noven-brand'), process.platform === 'win32' ? 'junction' : 'dir')
  writeFileSync(join(user, 'package.json'), JSON.stringify({
    name: 'user-profile', dependencies: { 'noven-brand': '0.0.1', 'custom-plugin': '1.0.0' },
    dsh: { profile: { bundles: ['noven-brand', 'custom-plugin'] } },
  }))
  writeFileSync(join(user, 'cordis.patch.yml'), '- id: shared\n  config:\n    value: user\n')
  return { user, runtime, anchor }
}

describe('Desktop app/user profile composition', () => {
  it('uses app code and defaults before user-only bundles and patches', () => {
    const { user, runtime, anchor } = fixture()

    const profile = loadDesktopProfile(user, anchor, runtime)

    expect(profile.dir).toBe(user)
    expect(profile.layers.map(layer => layer.packageName)).toEqual(['noven-brand', 'custom-plugin'])
    expect(profile.layers[0]?.packageDir).toBe(join(runtime, 'node_modules', 'noven-brand'))
    expect(profile.patches).toHaveLength(2)
    const entries = composeEntries([...profile.layers.map(layer => layer.patches), profile.patches])
    expect(entries).toEqual(expect.arrayContaining([
      expect.objectContaining({ id: 'shared', config: { value: 'user' } }),
      expect.objectContaining({ id: 'custom' }),
    ]))
  })

  it('preserves generic profile behavior without an app runtime profile', () => {
    const { user, anchor } = fixture()

    const profile = loadDesktopProfile(user, anchor, '')

    expect(profile.layers.map(layer => layer.packageName)).toEqual(['noven-brand', 'custom-plugin'])
    expect(profile.patches).toEqual([expect.objectContaining({ config: { value: 'user' } })])
  })

  it('fails loudly when the app runtime cannot load a required bundle', () => {
    const { user, runtime, anchor } = fixture()
    writeFileSync(join(runtime, 'node_modules', 'noven-brand', 'package.json'), '{"name":"noven-brand"}\n')

    expect(() => loadDesktopProfile(user, anchor, runtime)).toThrow('required bundles did not load')
  })
})
