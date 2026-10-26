import { test } from 'node:test'
import assert from 'node:assert/strict'
import { createSetup } from '../src/adapter.mjs'

// This is a mocked host, not a real OpenTUI/Solid UI integration test. Events
// actually traverse the registered listeners and then a spy default editor.
// Effects run immediately on creation, but subsequent updates require flush(),
// so input arriving before Solid's next effect turn is independently exercised.
class TextareaRenderable {
  constructor() {
    this.traits = { owner: 'opencode', role: 'prompt' }
    this.status = undefined
  }
}
class InputRenderable extends TextareaRenderable {}

function fixture(options = {}) {
  const effects = new Set(), roots = new Set(), slots = new Set()
  const listeners = { keypress: [], paste: [] }
  const layers = [], commands = [], editorEvents = []
  const sessions = [{ id: 'root', location: 'root-location' }, { id: 'child', parentID: 'root' }, { id: 'grandchild', parentID: 'child' }]
  const permissions = new Map(), forms = new Map()
  let route = { type: 'session', sessionID: 'root' }
  let owner, registrations = 0, disposeCount = 0, slotRemovals = 0
  let draft = 'draft', submits = 0
  const dependencies = {
    InputRenderable, TextareaRenderable,
    createSignal(initial) { let value = initial; return [() => value, next => { value = next }] },
    createRoot(callback) {
      const root = { effects: new Set() }; roots.add(root)
      const previous = owner; owner = root
      const dispose = () => {
        if (!roots.delete(root)) return
        disposeCount++
        for (const effect of root.effects) effects.delete(effect)
      }
      try { return callback(dispose) } finally { owner = previous }
    },
    createEffect(effect) {
      effects.add(effect); owner?.effects.add(effect)
      effect()
    },
    createElement(type) { return { type } },
    spread(element, props) { Object.defineProperties(element, Object.getOwnPropertyDescriptors(props)) },
  }
  const context = {
    location: 'context-location',
    renderer: {
      currentFocusedEditor: new TextareaRenderable(),
      keyInput: {
        prependListener(type, callback) {
          listeners[type].unshift(callback)
          if (++registrations === options.failListener) throw new Error('listener failure')
        },
        removeListener(type, callback) {
          const index = listeners[type].indexOf(callback)
          if (index !== -1) listeners[type].splice(index, 1)
        },
      },
    },
    keymap: {
      mode: {
        current: () => layers.at(-1)?.name ?? 'base',
        push(name) {
          const layer = { name }; layers.push(layer)
          return () => { const index = layers.indexOf(layer); if (index !== -1) layers.splice(index, 1) }
        },
      },
      commands: () => ['line.up', 'line.down', 'page.up', 'page.down', 'first', 'last'].map(id => ({ id: `session.${id}` })),
      dispatch: id => commands.push(id),
    },
    ui: {
      router: { current: () => route },
      toast: { show() {} },
      slot(definition) {
        if (options.failSlot) throw new Error('slot failure')
        const slot = { definition, element: definition.render() }; slots.add(slot)
        return () => { if (slots.delete(slot)) slotRemovals++ }
      },
    },
    theme: { border: { base: 'border-a' }, text: { base: 'text-a', muted: 'muted-a' } },
    data: { session: {
      list: () => sessions,
      get: id => sessions.find(session => session.id === id),
      family: id => {
        // Like OpenCode, return the whole root family even for a child ID.
        while (sessions.find(session => session.id === id)?.parentID) {
          id = sessions.find(session => session.id === id).parentID
        }
        const descendants = [id]
        const visit = parent => {
          for (const session of sessions.filter(session => session.parentID === parent)) {
            descendants.push(session.id); visit(session.id)
          }
        }
        visit(id)
        return descendants
      },
      permission: { list: id => {
        if (options.failEffect) throw new Error('data failure')
        return permissions.get(id) ?? []
      } },
      form: { list: (id, location) => forms.get(id === 'global' ? `global:${location}` : id) ?? [] },
    } },
  }
  function dispatch(type, name, modifiers = {}) {
    const event = { name, ...modifiers, prevented: false, stopped: false,
      preventDefault() { this.prevented = true }, stopPropagation() { this.stopped = true } }
    for (const callback of [...listeners[type]]) {
      callback(event)
      if (event.stopped) break
    }
    if (!event.stopped && !event.prevented) {
      editorEvents.push({ type, name })
      if (type === 'paste') draft += name
      else if (name === 'return' || name === 'enter') submits++
      else if (!event.ctrl && !event.meta && name.length === 1) draft += name
    }
    return event
  }
  return {
    context, dependencies, commands, permissions, forms, sessions, roots, slots, layers, listeners, editorEvents,
    start: () => createSetup(dependencies)(context),
    flush: () => { for (const effect of [...effects]) effect() },
    key: (name, modifiers) => dispatch('keypress', name, modifiers),
    paste: text => dispatch('paste', text),
    toggle: () => dispatch('keypress', 'q', { ctrl: true }),
    route: value => { route = value },
    get mode() { return context.keymap.mode.current() },
    get draft() { return draft }, get submits() { return submits },
    get disposeCount() { return disposeCount }, get slotRemovals() { return slotRemovals },
    get status() { return [...slots][0]?.element },
    assertClean() {
      assert.equal(listeners.keypress.length, 0)
      assert.equal(listeners.paste.length, 0)
      assert.equal(roots.size, 0)
      assert.equal(effects.size, 0)
      assert.equal(slots.size, 0)
    },
  }
}

function assertPassed(event) {
  assert.equal(event.prevented, false)
  assert.equal(event.stopped, false)
}
function assertConsumed(event) {
  assert.equal(event.prevented, true)
  assert.equal(event.stopped, true)
}

test('adapter: only the owned prompt textarea can enter NAV', () => {
  const t = fixture(); const cleanup = t.start()
  const prompt = t.context.renderer.currentFocusedEditor
  for (const editor of [new InputRenderable(), {}, Object.assign(new TextareaRenderable(), { traits: {} }),
    Object.assign(new TextareaRenderable(), { traits: { owner: 'other', role: 'prompt' } }),
    Object.assign(new TextareaRenderable(), { traits: { owner: 'opencode', role: 'permission-reject' } }),
    ...[{ status: 'SHELL' }, { capture: ['navigate'] }, { capture: ['submit'] }, { capture: ['autocomplete'] }, { capture: ['navigate', 'submit'] }]
      .map(extra => Object.assign(new TextareaRenderable(), { traits: { owner: 'opencode', role: 'prompt', ...extra } }))]) {
    t.context.renderer.currentFocusedEditor = editor
    assertPassed(t.toggle()); assert.equal(t.mode, 'base')
  }
  t.context.renderer.currentFocusedEditor = prompt
  assertConsumed(t.toggle()); assert.equal(t.mode, 'transcript-navigation')
  cleanup(); t.assertClean()
})

test('adapter: NAV event routing protects draft and submit; INPUT passes keys and paste', () => {
  const t = fixture(); const cleanup = t.start()
  t.key('x'); t.paste('paste'); t.key('return')
  assert.equal(t.draft, 'draftxpaste'); assert.equal(t.submits, 1)
  assert.equal(t.editorEvents.length, 3)
  assertConsumed(t.toggle())
  for (const [key, mods] of [['x'], ['return'], ['enter'], ['v', { ctrl: true }], ['f12']]) assertConsumed(t.key(key, mods))
  assertConsumed(t.paste('do not insert'))
  assert.equal(t.draft, 'draftxpaste'); assert.equal(t.submits, 1); assert.equal(t.editorEvents.length, 3)
  assertConsumed(t.key('i'))
  assert.equal(t.mode, 'base'); assert.equal(t.editorEvents.length, 3)
  t.key('i'); t.paste('ok'); assert.equal(t.draft, 'draftxpasteiok')
  t.toggle(); assertConsumed(t.toggle()); assert.equal(t.editorEvents.length, 5)
  assert.deepEqual(t.commands, ['session.last', 'session.last'])
  cleanup(); t.assertClean()
})

test('adapter: current and descendant permissions prevent NAV, including before effects flush', () => {
  for (const id of ['root', 'child', 'grandchild']) {
    const t = fixture(); const cleanup = t.start()
    t.permissions.set(id, [{ id: 'permission' }])
    assertPassed(t.toggle()); assert.equal(t.mode, 'base')
    t.permissions.clear(); assertConsumed(t.toggle())
    t.permissions.set(id, [{ id: 'incoming' }])
    assertPassed(t.key('y')); assert.equal(t.mode, 'base')
    t.permissions.clear(); assertConsumed(t.toggle())
    t.permissions.set(id, [{ id: 'incoming-before-paste' }])
    assertPassed(t.paste('response')); assert.equal(t.mode, 'base')
    assert.equal(t.draft, 'draftyresponse')
    assert.equal(t.editorEvents.length, 3) // blocked Ctrl+Q, response, paste
    cleanup(); t.assertClean()
  }
})

test('adapter: root forms include descendants and location-global forms, but not other locations', () => {
  for (const id of ['root', 'child', 'grandchild', 'global:root-location']) {
    const t = fixture(); const cleanup = t.start()
    t.forms.set('global:elsewhere', [{ id: 'not-visible' }])
    assertConsumed(t.toggle()); assertConsumed(t.key('i'))
    t.forms.set(id, [{ id: 'visible' }])
    assertPassed(t.toggle()); assert.equal(t.mode, 'base')
    t.forms.delete(id); t.toggle()
    t.forms.set(id, [{ id: 'incoming' }])
    assertPassed(t.paste('form response')); assert.equal(t.mode, 'base')
    assert.equal(t.draft, 'draftform response')
    t.forms.delete(id); t.toggle(); t.forms.set(id, [{ id: 'effect-visible' }]); t.flush()
    assert.equal(t.mode, 'base')
    cleanup(); t.assertClean()
  }
})

test('adapter: only tagged plan-review forms allow Ctrl+Q navigation', () => {
  const t = fixture(); const cleanup = t.start()
  const planReview = { id: 'plan-review', metadata: { plugin: 'raaghav.plan-review' } }
  t.forms.set('root', [planReview])
  t.context.renderer.currentFocusedEditor = new InputRenderable()
  assertConsumed(t.toggle())
  assert.equal(t.mode, 'transcript-navigation')
  for (const [name, modifiers] of [['j'], ['return'], ['enter'], ['a']]) assertConsumed(t.key(name, modifiers))
  assert.deepEqual(t.commands, ['session.line.down'])
  assertConsumed(t.toggle())
  assert.equal(t.mode, 'base')
  t.forms.set('root', [planReview, { id: 'unrelated', metadata: { plugin: 'other' } }])
  assertPassed(t.toggle())
  t.forms.set('root', [{ id: 'unrelated', metadata: { plugin: 'other' } }])
  assertPassed(t.toggle())
  t.forms.set('root', [planReview]); t.permissions.set('child', [{ id: 'permission' }])
  assertPassed(t.toggle())
  cleanup(); t.assertClean()
})

test('adapter: child sessions do not aggregate requests, but always show location-global forms', () => {
  for (const ownLocation of [false, true]) {
    const t = fixture()
    if (ownLocation) t.sessions.find(session => session.id === 'child').location = 'child-location'
    const location = ownLocation ? 'child-location' : 'context-location'
    t.route({ type: 'session', sessionID: 'child' })
    for (const id of ['root', 'child', 'grandchild']) {
      t.permissions.set(id, [{ id: 'permission' }]); t.forms.set(id, [{ id: 'form' }])
    }
    const cleanup = t.start()
    assertConsumed(t.toggle()); assert.equal(t.mode, 'transcript-navigation')
    t.flush(); assert.equal(t.mode, 'transcript-navigation')
    t.forms.set(`global:${location}`, [{ id: 'global' }])
    assertPassed(t.key('y')); assert.equal(t.mode, 'base')
    assertPassed(t.toggle())
    t.forms.delete(`global:${location}`); assertConsumed(t.toggle())
    t.forms.set(`global:${location}`, [{ id: 'global-again' }]); t.flush()
    assert.equal(t.mode, 'base')
    cleanup(); t.assertClean()
  }
})

test('adapter: losing prompt ownership releases NAV before typing or paste', () => {
  for (const type of ['keypress', 'paste', 'effect']) {
    const t = fixture(); const cleanup = t.start(); t.toggle()
    t.context.renderer.currentFocusedEditor = Object.assign(new TextareaRenderable(), {
      traits: { owner: 'opencode', role: 'permission-reject' },
    })
    if (type === 'keypress') assertPassed(t.key('n'))
    else if (type === 'paste') assertPassed(t.paste('reject reason'))
    else t.flush()
    assert.equal(t.mode, 'base')
    assertPassed(t.toggle())
    cleanup(); t.assertClean()
  }
})

test('adapter: permission effect exits NAV without waiting for another input', () => {
  const t = fixture(); const cleanup = t.start(); t.toggle()
  t.permissions.set('child', [{ id: 'incoming' }]); t.flush()
  assert.equal(t.mode, 'base'); cleanup(); t.assertClean()
})

test('adapter: NAV cleanup leaves an overlaid modal layer intact', () => {
  const t = fixture(); const cleanup = t.start(); t.toggle()
  const popModal = t.context.keymap.mode.push('modal')
  assertPassed(t.key('j')); assertPassed(t.paste('modal text'))
  cleanup(); cleanup()
  assert.equal(t.mode, 'modal'); assert.deepEqual(t.layers.map(layer => layer.name), ['modal'])
  popModal(); assert.equal(t.mode, 'base'); t.assertClean()
})

test('adapter: setup failures roll back listeners, reactive roots, and slots', () => {
  for (const options of [{ failSlot: true }, { failEffect: true }, { failListener: 1 }, { failListener: 2 }]) {
    const t = fixture(options)
    assert.throws(t.start, /failure/)
    t.assertClean(); assert.equal(t.mode, 'base')
  }
})

test('adapter: repeated setup/cleanup and route changes leave no resources', () => {
  const t = fixture()
  for (let i = 0; i < 3; i++) {
    const cleanup = t.start()
    assert.equal(t.listeners.keypress.length, 1); assert.equal(t.listeners.paste.length, 1)
    assertConsumed(t.toggle()); t.route({ type: 'session', sessionID: 'child' }); t.flush()
    assert.equal(t.mode, 'base')
    t.toggle(); t.route({ type: 'home' }); assertPassed(t.key('j'))
    assert.equal(t.mode, 'base')
    cleanup(); cleanup(); t.assertClean()
    t.route({ type: 'session', sessionID: 'root' })
  }
  assert.equal(t.disposeCount, 3); assert.equal(t.slotRemovals, 3)
})

test('adapter: status properties read current navigation and theme values', () => {
  const t = fixture(); const cleanup = t.start(); const status = t.status
  assert.equal(status.title, ' INPUT · Ctrl+Q: navigate ')
  assert.equal(status.titleColor, 'muted-a'); assert.equal(status.borderColor, 'border-a')
  t.toggle(); assert.equal(status.title, ' NAV · i: input '); assert.equal(status.titleColor, 'text-a')
  t.context.theme = { border: { base: 'border-b' }, text: { base: 'text-b', muted: 'muted-b' } }
  assert.equal(status.borderColor, 'border-b'); assert.equal(status.titleColor, 'text-b')
  t.key('i'); assert.equal(status.title, ' INPUT · Ctrl+Q: navigate '); assert.equal(status.titleColor, 'muted-b')
  cleanup(); t.assertClean()
})
