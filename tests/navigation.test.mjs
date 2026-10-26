import { test } from 'node:test'
import assert from 'node:assert/strict'
import { navigation } from '../src/navigation.mjs'

function setup() {
  let mode = 'base', session = 'session-1', focused = true, ready = true, review = false, blocked = false
  const commands = [], changes = []
  const controller = navigation({
    session: () => session,
    mode: { current: () => mode, push: value => { const old = mode; mode = value; return () => { mode = old } } },
    promptFocused: () => focused,
    planReviewForm: () => review,
    blocked: () => blocked,
    ready: () => ready,
    dispatch: id => commands.push(id), changed: value => changes.push(value),
  })
  function event(name, modifiers = {}) {
    return { name, ...modifiers, prevented: false, stopped: false,
      preventDefault() { this.prevented = true }, stopPropagation() { this.stopped = true } }
  }
  function key(name, modifiers) { const e = event(name, modifiers); controller.key(e); return e }
  return { controller, commands, changes, event, key, toggle: () => key('q', { ctrl: true }),
    mode: value => { mode = value }, session: value => { session = value },
    focused: value => { focused = value }, ready: value => { ready = value },
    review: value => { review = value }, blocked: value => { blocked = value }, contextMode: () => mode }
}

test('cleanup resets controller state even if the host mode release throws', () => {
  let mode = 'base', releases = 0
  const changes = []
  const controller = navigation({
    session: () => 'session-1',
    mode: { current: () => mode, push: value => {
      mode = value
      return () => { releases++; throw new Error('host mode failure') }
    } },
    promptFocused: () => true, ready: () => true,
    changed: value => changes.push(value), dispatch: () => {},
  })
  controller.key({ name: 'q', ctrl: true, preventDefault() {}, stopPropagation() {} })
  assert.equal(controller.active(), true)
  assert.throws(() => controller.leave(), /host mode failure/)
  assert.equal(controller.active(), false)
  assert.deepEqual(changes, [true, false])
  assert.doesNotThrow(() => controller.leave())
  assert.equal(releases, 1)
})

test('Ctrl+Q toggles NAV and restores input following latest output', () => {
  const t = setup(); assert.ok(t.toggle().stopped); assert.ok(t.controller.active())
  t.toggle(); assert.equal(t.controller.active(), false)
  assert.deepEqual(t.changes, [true, false]); assert.deepEqual(t.commands, ['session.last'])
})
test('j/k and arrows navigate lines, gg/G navigate ends', () => {
  const t = setup(); t.toggle()
  for (const name of ['j', 'k', 'down', 'up', 'g', 'g']) t.key(name)
  t.key('g', { shift: true })
  assert.deepEqual(t.commands, ['session.line.down', 'session.line.up', 'session.line.down', 'session.line.up', 'session.first', 'session.last'])
})
test('scrolling shortcuts pass through in INPUT, including after leaving NAV', () => {
  const t = setup()
  for (let i = 0; i < 2; i++) {
    for (const [name, modifiers] of [['u', { ctrl: true }], ['d', { ctrl: true }], ['pageup'], ['pagedown'], ['home', { ctrl: true }], ['end', { ctrl: true }]]) {
      const e = t.key(name, modifiers)
      assert.equal(e.prevented, false); assert.equal(e.stopped, false)
    }
    if (i === 0) { t.toggle(); t.key('i'); t.commands.length = 0 }
  }
  assert.deepEqual(t.commands, [])
})
test('Ctrl+U/D and page keys use actual half-viewport commands only in NAV', () => {
  const t = setup(); t.toggle()
  for (const [name, modifiers] of [['u', { ctrl: true }], ['d', { ctrl: true }], ['pageup'], ['pagedown']]) {
    const e = t.key(name, modifiers); assert.ok(e.prevented && e.stopped)
  }
  assert.deepEqual(t.commands, ['session.page.up', 'session.page.down', 'session.page.up', 'session.page.down'])
})
test('Ctrl+Home/End work in NAV', () => {
  const t = setup(); t.toggle(); t.key('home', { ctrl: true }); t.key('end', { ctrl: true })
  assert.deepEqual(t.commands, ['session.first', 'session.last'])
})
test('NAV swallows Enter, unknown keys and shortcuts without editing/submitting', () => {
  const t = setup(); t.toggle()
  for (const [name, modifiers] of [['return'], ['x'], ['v', { ctrl: true }], ['j', { ctrl: true }]]) {
    const e = t.key(name, modifiers); assert.ok(e.prevented && e.stopped)
  }
  assert.deepEqual(t.commands, [])
})
test('pastes are blocked only in NAV, not input or a modal dialog', () => {
  const t = setup(); let e = t.event(); t.controller.paste(e); assert.equal(e.prevented, false)
  t.toggle(); e = t.event(); t.controller.paste(e); assert.ok(e.stopped)
  t.mode('modal'); e = t.event(); t.controller.paste(e); assert.equal(e.prevented, false)
})
test('i leaves NAV and follows bottom without changing the draft', () => {
  const t = setup(); t.toggle(); assert.ok(t.key('i').stopped)
  assert.equal(t.controller.active(), false); assert.deepEqual(t.commands, ['session.last'])
})
test('Escape/Ctrl+C leave NAV but pass through the normal interrupt/clear action', () => {
  for (const [name, modifiers] of [['escape'], ['c', { ctrl: true }]]) {
    const t = setup(); t.toggle(); const e = t.key(name, modifiers)
    assert.equal(t.controller.active(), false); assert.equal(e.stopped, false); assert.deepEqual(t.commands, [])
  }
})
test('dialogs and other input modes retain their own keyboard handling', () => {
  const t = setup(); t.toggle(); t.mode('modal')
  assert.equal(t.key('j').stopped, false); assert.equal(t.toggle().stopped, false)
  assert.equal(t.key('d', { ctrl: true }).stopped, false); assert.deepEqual(t.commands, [])
})
test('ordinary input keys, home screen and unfocused prompts are untouched', () => {
  const t = setup(); assert.equal(t.key('j').stopped, false)
  t.focused(false); assert.equal(t.toggle().stopped, false)
  t.focused(true); t.session(undefined); assert.equal(t.toggle().stopped, false)
})
test('plan review form can enter NAV without prompt focus and consumes approval keys', () => {
  const t = setup(); t.focused(false); t.review(true); t.mode('form')
  assert.ok(t.toggle().stopped)
  assert.equal(t.controller.active(), true)
  for (const [name, modifiers] of [['j'], ['k'], ['return'], ['enter'], ['a'], ['r'], ['v', { ctrl: true }]]) {
    assert.ok(t.key(name, modifiers).stopped)
  }
  assert.deepEqual(t.commands, ['session.line.down', 'session.line.up'])
  assert.ok(t.key('q', { ctrl: true }).stopped)
  assert.equal(t.controller.active(), false)
  assert.equal(t.contextMode(), 'form')
})
test('plan form disappearance and unrelated blocking requests leave NAV safely', () => {
  const t = setup(); t.focused(false); t.review(true); t.mode('form'); t.toggle()
  t.review(false); t.controller.sync()
  assert.equal(t.controller.active(), false)
  t.review(true); t.blocked(true)
  assert.equal(t.toggle().stopped, false)
})
test('route changes and cleanup reset NAV', () => {
  const t = setup(); t.toggle(); t.session('session-2'); t.controller.sync()
  assert.equal(t.controller.active(), false)
  t.toggle(); t.controller.leave(); t.controller.leave(); assert.equal(t.controller.active(), false)
})
test('a non-g key cancels gg; unsupported hosts do not enter NAV', () => {
  const t = setup(); t.toggle(); t.key('g'); t.key('x'); t.key('g')
  assert.deepEqual(t.commands, [])
  t.controller.leave(); t.ready(false); t.toggle(); assert.equal(t.controller.active(), false)
})
