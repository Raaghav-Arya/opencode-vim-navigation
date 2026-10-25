import { Plugin } from "@opencode/plugin/tui"
import { InputRenderable, TextareaRenderable } from "@opentui/core"
import { createEffect, createRoot, createSignal } from "solid-js"
import { navigation } from "./navigation.mjs"

export default Plugin.define({
  id: "opencode-vim-navigation",
  setup(context) {
    const { renderer, keymap, ui } = context
    if (!renderer.keyInput?.prependListener || !keymap.mode?.push) {
      throw new Error("Transcript navigation requires the OpenCode 2.1.4 TUI API")
    }
    const [nav, setNav] = createSignal(false)
    const session = () => {
      const route = ui.router.current()
      return route.type === "session" ? route.sessionID : undefined
    }
    const required = ["session.line.up", "session.line.down", "session.page.up", "session.page.down", "session.first", "session.last"]
    const controller = navigation({
      session,
      mode: keymap.mode,
      promptFocused: () => renderer.currentFocusedEditor instanceof TextareaRenderable
        && !(renderer.currentFocusedEditor instanceof InputRenderable),
      ready: () => {
        const commands = new Set(keymap.commands().map((command) => command.id))
        if (required.every((id) => commands.has(id))) return true
        ui.toast.show({ message: "Transcript navigation: this OpenCode version lacks the expected scrolling commands", variant: "error" })
        return false
      },
      dispatch: (id) => keymap.dispatch(id),
      changed: setNav,
    })
    // OpenTUI's public global input listeners run before the focused editor.
    // Prepending also precedes OpenCode's own keymap, so NAV cannot submit or edit a draft.
    renderer.keyInput.prependListener("keypress", controller.key)
    renderer.keyInput.prependListener("paste", controller.paste)
    const dispose = createRoot((dispose) => {
      createEffect(() => {
        controller.sync()
        const id = session()
        // Never trap an incoming permission request or interactive form in NAV.
        if (id && (context.data.session.permission.list(id)?.length || context.data.session.form.list(id)?.length)) {
          controller.leave()
        }
      })
      return dispose
    })
    const removeStatus = ui.slot({
      append: "session.composer.top",
      render: () => <box
        height={1}
        width="100%"
        border={["top"]}
        borderColor={context.theme.border.base}
        title={nav() ? " NAV · i: input " : " INPUT · Ctrl+Q: navigate "}
        titleColor={nav() ? context.theme.text.base : context.theme.text.muted}
        titleAlignment="right"
      />,
    })
    return () => {
      renderer.keyInput.removeListener("keypress", controller.key)
      renderer.keyInput.removeListener("paste", controller.paste)
      controller.leave()
      removeStatus()
      dispose()
    }
  },
})
