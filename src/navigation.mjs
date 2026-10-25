// Input routing is separate from the TUI adapter so it can be tested without a server.
export function navigation(context) {
  const MODE = "transcript-navigation"
  let popMode
  let sessionID
  let pendingG = false

  const active = () => popMode !== undefined
  function leave(follow = false) {
    if (!active()) return
    const release = popMode
    popMode = undefined
    pendingG = false
    sessionID = undefined
    try { release() } finally { context.changed(false) }
    if (follow) context.dispatch("session.last")
  }
  function sync() {
    if (active() && (context.session() !== sessionID || context.blocked?.()
      || (context.mode.current() === MODE && !context.promptFocused()))) leave()
  }
  function scroll(id) {
    context.dispatch(id)
  }
  function consume(event) {
    event.preventDefault()
    event.stopPropagation()
  }
  function key(event) {
    sync()
    if (!context.session() || context.blocked?.()) return
    // Dialogs, permission forms, autocomplete, and embedded terminals own their keys.
    const mode = context.mode.current()
    if (mode !== "base" && mode !== MODE) return
    if (!context.promptFocused()) {
      if (active()) leave()
      return
    }
    const plain = !event.ctrl && !event.meta && !event.super && !event.hyper
    const ctrl = event.ctrl && !event.meta && !event.super && !event.hyper && !event.shift
    const name = event.name
    if (ctrl && name === "q") {
      consume(event)
      if (active()) leave(true)
      else {
        if (!context.ready()) return
        sessionID = context.session()
        popMode = context.mode.push(MODE)
        context.changed(true)
      }
      return
    }
    if (!active()) return // INPUT mode retains every default except Ctrl+Q.
    // OpenCode 2.1.4's session.page.* commands move by half the viewport;
    // session.half.page.* surprisingly move by a quarter. Use the actual half-page commands.
    const controlScroll = ctrl && ({ u: "session.page.up", d: "session.page.down" })[name]
    const pageScroll = plain && ({
      pageup: "session.page.up", pagedown: "session.page.down",
    })[name]
    const edgeScroll = ctrl && ({ home: "session.first", end: "session.last" })[name]
    if (controlScroll || pageScroll || edgeScroll) {
      consume(event)
      pendingG = false
      scroll(controlScroll || pageScroll || edgeScroll)
      return
    }
    if ((plain && name === "escape") || (ctrl && name === "c")) {
      // Let OpenCode perform its usual interrupt/clear action after leaving NAV.
      leave()
      return
    }
    consume(event) // Protect the draft, including Enter and unknown shortcuts.
    if (plain && name === "i" && !event.shift) {
      leave(true)
      return
    }
    const upperG = plain && (name === "G" || (name === "g" && event.shift))
    if (upperG) {
      pendingG = false
      scroll("session.last")
      return
    }
    if (plain && name === "g" && !event.shift) {
      if (pendingG) scroll("session.first")
      pendingG = !pendingG
      return
    }
    pendingG = false
    if (!plain || event.shift) return
    const command = ({
      j: "session.line.down", down: "session.line.down",
      k: "session.line.up", up: "session.line.up",
    })[name]
    if (command) scroll(command)
  }
  function paste(event) {
    sync()
    if (active() && context.mode.current() === MODE) {
      if (!context.promptFocused()) leave()
      else consume(event)
    }
  }
  return { key, paste, leave, sync, active }
}
