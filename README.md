# opencode-vim-navigation

Modal Vim-style transcript navigation for the **OpenCode terminal UI**.
Scroll the conversation inside OpenCode itself—not your terminal emulator's,
Neovim's, or tmux's scrollback—while keeping your prompt draft safe.

Press **Ctrl+Q** to switch between INPUT and NAV. A compact, right-aligned
mode label appears on a divider just above the prompt.

## Compatibility

Tested with **OpenCode 2.1.4**. This uses OpenCode V2's TUI plugin API and is
not a server plugin or a plugin for the desktop/web UI. Older releases and
future API changes may require adaptation.

No build step is needed: OpenCode supplies `@opencode/plugin/tui`, OpenTUI,
and `solid-js`, and loads the TSX entrypoint. OpenTUI and Solid are declared
as peer dependencies so the package documents its host compatibility.
Do not run this entrypoint directly with Node.js.

## Install

### From a local checkout (available now)

Clone the repository:

```sh
git clone https://github.com/Raaghav-Arya/opencode-vim-navigation.git
```

Then add its **absolute directory path** to the `plugins` array in
`~/.config/opencode/cli.json`:

```json
{
  "plugins": ["/absolute/path/to/opencode-vim-navigation"]
}
```

Merge this into any existing TUI config; do not overwrite other settings.
Restart OpenCode. No `npm install` is needed for this local package.

Alternatively, symlink the package directory into
`~/.config/opencode/plugins/opencode-vim-navigation` for automatic discovery.
Use **one installation method**, not both.

### From npm (after publication)

Once the package has been published as `opencode-vim-navigation`, use:

```json
{
  "plugins": ["opencode-vim-navigation@0.1.0"]
}
```

This belongs in **`cli.json`**, not the server plugin list in `opencode.json`.
OpenCode V1-era documentation may mention `tui.json`; these instructions target V2.
OpenCode installs the package. Pin a version for reproducible configuration.
Until the first npm release, use the local-checkout installation above.
Check [npm](https://www.npmjs.com/package/opencode-vim-navigation) for availability.

## Keys

| Key | INPUT mode | NAV mode |
| --- | --- | --- |
| **Ctrl+Q** | Enter NAV | Return to INPUT and follow latest output |
| **j / k**, **Down / Up** | OpenCode default | One transcript line down/up |
| **gg / G** | OpenCode default | Jump to beginning/end |
| **Ctrl+U / Ctrl+D** | OpenCode default | Half a viewport up/down |
| **PageUp / PageDown** | OpenCode default | Half a viewport up/down |
| **Ctrl+Home / Ctrl+End** | OpenCode default | Jump to beginning/end |
| **i** | Type normally | Return to INPUT, follow latest output, preserve draft |
| **Escape / Ctrl+C** | OpenCode default | Leave NAV without moving the viewport, then perform OpenCode's normal interrupt/clear action |

Only Ctrl+Q is intercepted in INPUT. In particular, Ctrl+U/D retain their
normal prompt-editing/exit behavior until you enter NAV.

In NAV, other keys, Enter, and pasted text are ignored to protect your draft
and prevent accidental submissions. This is **transcript navigation**, not
Vim editing, cursor selection, or visual mode.

Dialogs, autocomplete, composer panels, and other non-base modes keep their
own keyboard handling. Incoming permission/form requests and session changes
exit NAV. Existing mouse behavior is unchanged. The home screen is unchanged.

### Neovim / Sidekick

Stay in Neovim **terminal mode**. OpenCode draws its own transcript, so normal
terminal-buffer scrollback cannot reliably navigate the conversation.

Let OpenCode receive Ctrl+Q and handle scrolling:

```lua
cli = {
  tools = {
    opencode = { native_scroll = true },
  },
  win = {
    keys = { stopinsert = false },
  },
}
```

Merge these options into your existing Sidekick configuration. Terminal or
multiplexer mappings that intercept these keys must also be disabled.

## Development

Use Node.js 22 or newer for the development commands:

```sh
npm test
npm run check
npm pack --dry-run
```

There are no development dependencies to install. `npm run check` checks the
JavaScript controller and tests; it is **not** a TSX typecheck. OpenCode itself
loads and compiles the TUI adapter.

```text
tui.ts                    Conventional local/package entrypoint
src/
  navigation.mjs          Mode state and input routing
  tui.tsx                 OpenCode adapter and mode indicator
tests/
  navigation.test.mjs     Controller tests using node:test
```

The 13 tests mock the host and cover toggling, navigation, INPUT passthrough,
paste/draft protection, dialog isolation, route cleanup, and missing commands.
They do not replace interactive rendering tests.

The initial implementation also passed a live pseudo-terminal smoke test
against OpenCode 2.1.4: INPUT/NAV switched, navigation changed the viewport,
and returning to INPUT preserved the draft, without submitting any prompt.
Recheck the same behavior after changing the adapter or upgrading OpenCode.

### Implementation details

The root `tui.ts` re-exports `src/tui.tsx`. OpenCode 2.1.4's local-directory
loader looks for a conventional root `tui` entrypoint; npm packages also
expose it via the `./tui` package export. Keep both when reorganizing source.

See the [OpenCode V2 CLI plugin guide](https://opencode.ai/v2/docs/build/plugins/cli)
for the host API and package conventions.

The plugin uses OpenTUI's public prepended key/paste listeners to stop NAV
input before it reaches the prompt. A named OpenCode keymap mode isolates
normal prompt shortcuts. Host transcript commands scroll the actual
conversation, including virtualized history/backfill; the plugin does not
scrape a terminal buffer. Listeners, mode, effects, and the mode indicator
are cleaned up when the plugin deactivates.

In **2.1.4**, `session.page.up/down` move by half of `scroll.height`, whereas
`session.half.page.up/down` move by a quarter. The plugin deliberately uses
the former. It checks for expected commands before entering NAV, but future
releases could retain names while changing semantics.

## Disable / uninstall

Remove the package entry from `cli.json`, then restart OpenCode. If installed
via automatic discovery instead, remove the symlink from `plugins/`.
Merely renaming a package directory within `plugins/` does not disable it.

The plugin ID in OpenCode's TUI plugin manager is `opencode-vim-navigation`.

## Maintainer: publishing to npm

GitHub hosts the source; npm distributes the installable package. Publishing
to GitHub does not automatically publish to npm. Public unscoped packages
can be published with a free npm account.

### First release

1. Create an account at [npmjs.com/signup](https://www.npmjs.com/signup) if
   needed, verify your email, and enable two-factor authentication in your
   account settings. GitHub CLI authentication does **not** log you into npm.
   Save your recovery codes privately; never commit tokens or recovery codes.
2. From your checkout, log in using the browser flow:

   ```sh
   npm login --registry=https://registry.npmjs.org/
   npm whoami --registry=https://registry.npmjs.org/
   ```

3. Check the package name:

   ```sh
   npm view opencode-vim-navigation name version --registry=https://registry.npmjs.org/
   ```

   An E404 means no public package was found; it is not a reservation or a
   guarantee that npm will accept the name. If someone else owns it, choose
   a scoped name such as `@YOUR_NPM_USERNAME/opencode-vim-navigation` and
   update `package.json` and the installation examples before publishing.
4. Review the release from the repository root:

   ```sh
   npm test
   npm run check
   npm pack --dry-run
   npm publish --dry-run
   ```

   The package should include `LICENSE`, `README.md`, `package.json`, `tui.ts`,
   and `src/`. Tests and GitHub workflows stay on GitHub, not in the tarball.
   Dry runs do not upload the package and do not prove your account has
   permission to publish. The `prepublishOnly` script reruns tests and
   JavaScript syntax checks before publication.
5. Publish version **0.1.0**:

   ```sh
   npm publish --access public
   ```

   Complete npm's browser / two-factor prompts. Do not paste authentication
   codes or tokens into issues or chat. A successful publish ends with
   `+ opencode-vim-navigation@0.1.0`.
6. Verify the release:

   ```sh
   npm view opencode-vim-navigation@0.1.0 version dist.tarball
   ```

   Replace the local path in your OpenCode `cli.json` with
   `opencode-vim-navigation@0.1.0` and restart OpenCode. Remove the
   "after publication" wording in this README once the package is live.
7. Optionally mark the published source on GitHub:

   ```sh
   git tag v0.1.0
   git push origin v0.1.0
   ```

   Tag the exact commit used for publication; commit any release changes first.

### Later releases

npm versions cannot be overwritten or reused. For a compatible bug fix,
start from a clean checkout, update the changelog/README as appropriate, run
checks, then:

```sh
npm version patch
npm publish --access public
git push origin main --follow-tags
```

`npm version patch` updates the version and creates a commit and tag. Use a
minor or major bump when appropriate instead. Publish manually initially;
if automated releases are added later, prefer npm trusted publishing rather
than storing a long-lived npm token in the repository.

## License

[MIT](LICENSE) © 2026 Raaghav Arya.
