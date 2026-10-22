import test from 'node:test'
import assert from 'node:assert/strict'
import {
  ASK_TOOL, NUDGE, beginTurn, canRunTool, denyReason, initialState,
  noteAnswered, noteAsk, noteSteer, shouldNudge,
} from '../lib/state.js'

test('new sessions start with a clean turn budget', () => {
  const state = initialState()
  assert.equal(state.turn, -1)
  assert.equal(state.asked, false)
  assert.equal(state.steers, 0)
})

test('reads and the ask tool pass; every write or execution is denied', () => {
  for (const name of ['read_card', 'list_cards', 'collection_describe', 'timeline_describe', 'read', 'grep', 'skill', ASK_TOOL]) {
    assert.equal(canRunTool(name), true, name)
  }
  for (const name of ['create_card', 'create_card_from_preset', 'add_module_preset', 'write_module_text', 'collection_add_item', 'timeline_add_event', 'import_card', 'generate_image', 'bash', 'write', 'edit', 'unknown_tool']) {
    assert.equal(canRunTool(name), false, name)
  }
})

test('the deny reason points at the standard mode and does not leak internal phrasing', () => {
  const reason = denyReason('create_card')
  assert.match(reason, /创作模式/)
  assert.doesNotMatch(reason, /握笔的是人|你是笔/)
})

test('the nudge text does not contain slogan phrasing', () => {
  assert.doesNotMatch(NUDGE, /握笔的是人|你是笔/)
})

test('turns reset the ask flag and steer budget', () => {
  const state = initialState()
  beginTurn(state, 1)
  noteAsk(state)
  noteSteer(state)
  assert.equal(shouldNudge(state), false)
  beginTurn(state, 2)
  assert.equal(state.asked, false)
  assert.equal(state.steers, 0)
  assert.equal(shouldNudge(state), true)
})

test('an answer consumes the ask: the next output must ask again', () => {
  const state = initialState()
  beginTurn(state, 1)
  noteAsk(state)
  assert.equal(shouldNudge(state), false)
  noteAnswered(state)
  assert.equal(shouldNudge(state), true)
})

test('the mouth gate nudges at most twice per turn', () => {
  const state = initialState()
  beginTurn(state, 1)
  assert.equal(noteSteer(state), true)
  assert.equal(noteSteer(state), true)
  assert.equal(noteSteer(state), false)
  assert.equal(shouldNudge(state), false)
})
