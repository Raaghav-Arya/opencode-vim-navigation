import { Plugin } from "@opencode/plugin/tui"
import { InputRenderable, TextareaRenderable } from "@opentui/core"
import { createElement, spread } from "@opentui/solid"
import { createEffect, createRoot, createSignal } from "solid-js"
import { createSetup } from "./adapter.mjs"

export default Plugin.define({
  id: "opencode-vim-navigation",
  setup: createSetup({ InputRenderable, TextareaRenderable, createElement, spread, createEffect, createRoot, createSignal }),
})
