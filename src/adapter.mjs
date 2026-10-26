import { navigation } from "./navigation.mjs"

// Inject host-provided rendering/reactivity APIs so tests exercise the real adapter
// without rewriting its imports or depending on OpenCode's runtime module loader.
export function createSetup({ InputRenderable, TextareaRenderable, createElement, spread, createEffect, createRoot, createSignal }) {
  return function setup(context) {
    const { renderer, keymap, ui, data } = context
    if (!renderer.keyInput?.prependListener || !renderer.keyInput?.removeListener
      || !keymap.mode?.push || !keymap.mode?.current
      || !data.session?.get || !data.session?.family
      || !data.session?.permission?.list || !data.session?.form?.list) {
      throw new Error("Vim navigation requires the OpenCode 2.1.4 TUI API")
    }
    const [nav, setNav] = createSignal(false)
    const session = () => {
      const route = ui.router.current()
      return route.type === "session" ? route.sessionID : undefined
    }
    const promptFocused = () => {
      const editor = renderer.currentFocusedEditor
      const traits = editor?.traits
      return editor instanceof TextareaRenderable && !(editor instanceof InputRenderable)
        && traits?.owner === "opencode" && traits?.role === "prompt"
        && !traits.status
        && !traits.capture?.includes("navigate") && !traits.capture?.includes("submit")
        && !traits.capture?.includes("autocomplete")
    }
    const visibleForms = () => {
      const id = session()
      if (!id) return []
      const info = data.session.get(id)
      const location = info?.location ?? context.location
      // Match the host's visible request set: root sessions aggregate their
      // descendants; child sessions show global/location forms only.
      const forms = [...(data.session.form.list("global", location) ?? [])]
      if (info?.parentID) return forms
      const ids = new Set([id, ...data.session.family(id)])
      for (const sessionID of ids) forms.push(...(data.session.form.list(sessionID) ?? []))
      return forms
    }
    const planReviewForm = () => {
      const forms = visibleForms()
      return forms.length > 0 && forms.every((form) => form.metadata?.plugin === "raaghav.plan-review")
    }
    const blocked = () => {
      const id = session()
      if (!id) return false
      const info = data.session.get(id)
      if (info?.parentID) return visibleForms().some((form) => form.metadata?.plugin !== "raaghav.plan-review")
      const location = info?.location ?? context.location
      if (data.session.permission.list(id)?.length) return true
      if (data.session.family(id).some((sessionID) => data.session.permission.list(sessionID)?.length)) return true
      return visibleForms().some((form) => form.metadata?.plugin !== "raaghav.plan-review")
    }
    const required = ["session.line.up", "session.line.down", "session.page.up", "session.page.down", "session.first", "session.last"]
    const controller = navigation({
      session,
      mode: keymap.mode,
      promptFocused,
      blocked,
      planReviewForm,
      ready: () => {
        const commands = new Set(keymap.commands().map((command) => command.id))
        if (required.every((id) => commands.has(id))) return true
        ui.toast.show({ message: "Vim navigation: this OpenCode version lacks the expected scrolling commands", variant: "error" })
        return false
      },
      dispatch: (id) => keymap.dispatch(id),
      changed: setNav,
    })
    const cleanups = [() => controller.leave()]
    let cleaned = false
    const cleanup = () => {
      if (cleaned) return
      cleaned = true
      const errors = []
      for (const release of cleanups.reverse()) {
        try { release() } catch (error) { errors.push(error) }
      }
      if (errors.length) throw new AggregateError(errors, "Vim navigation cleanup failed")
    }
    try {
      // Register rollback BEFORE each acquisition: even a partially failing
      // listener registration must not leave a failed generation intercepting keys.
      cleanups.push(() => renderer.keyInput.removeListener("keypress", controller.key))
      renderer.keyInput.prependListener("keypress", controller.key)
      cleanups.push(() => renderer.keyInput.removeListener("paste", controller.paste))
      renderer.keyInput.prependListener("paste", controller.paste)
      createRoot((dispose) => {
        cleanups.push(dispose)
        createEffect(() => {
          nav()
          session()
          blocked()
          planReviewForm()
          promptFocused()
          controller.sync()
        })
      })
      cleanups.push(ui.slot({
        append: "session.composer.top",
        render: () => {
          const element = createElement("box")
          spread(element, {
            height: 1,
            width: "100%",
            border: ["top"],
            get borderColor() { return context.theme.border.base },
            get title() { return nav() ? " NAV · i: input " : " INPUT · Ctrl+Q: navigate " },
            get titleColor() { return nav() ? context.theme.text.base : context.theme.text.muted },
            titleAlignment: "right",
          })
          return element
        },
      }))
      return cleanup
    } catch (error) {
      try { cleanup() } catch (rollbackError) {
        throw new AggregateError([error, rollbackError], "Vim navigation setup and rollback failed")
      }
      throw error
    }
  }
}
