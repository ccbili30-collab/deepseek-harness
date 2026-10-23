import assert from 'node:assert/strict'
import { homedir } from 'node:os'
import { join, resolve } from 'node:path'
import { test } from 'node:test'
import { resolveAppHome, resolveMiscProjectRoot, resolveProjectsRoot } from '../lib/index.js'

test('defaults to the historical harness-home layout', () => {
  assert.equal(resolveAppHome({}), join(homedir(), '.noven'))
  assert.equal(resolveProjectsRoot({}), join(homedir(), '诺文'))
  assert.equal(resolveMiscProjectRoot({}), join(homedir(), '诺文', '杂项'))
})

test('NOVEN_HOME moves the ledger and keeps projects inside it', () => {
  const home = resolve('/tmp/noven-web/.data/library')
  const env = { NOVEN_HOME: home }
  assert.equal(resolveAppHome(env), home)
  assert.equal(resolveProjectsRoot(env), join(home, 'projects'))
  assert.equal(resolveMiscProjectRoot(env), join(home, 'projects', '杂项'))
})

test('NOVEN_PROJECTS_ROOT overrides the project root independently', () => {
  const env = { NOVEN_HOME: '/tmp/noven-test/.data/library', NOVEN_PROJECTS_ROOT: '/tmp/noven-test/.data/projects' }
  assert.equal(resolveProjectsRoot(env), resolve('/tmp/noven-test/.data/projects'))
  assert.equal(resolveMiscProjectRoot(env), resolve('/tmp/noven-test/.data/projects', '杂项'))
})

test('empty values fall back instead of resolving to the process cwd', () => {
  assert.equal(resolveAppHome({ NOVEN_HOME: '  ' }), join(homedir(), '.noven'))
  assert.equal(resolveProjectsRoot({ NOVEN_HOME: '', NOVEN_PROJECTS_ROOT: ' ' }), join(homedir(), '诺文'))
})
