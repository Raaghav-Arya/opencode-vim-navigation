# opencode-vim-navigation

Modal Vim-style transcript navigation for the **OpenCode terminal UI**.
Scroll the conversation inside OpenCode—not Neovim, tmux, or terminal-emulator
scrollback—while keeping your prompt draft safe.

Press **Ctrl+Q** to switch between INPUT and NAV. A compact, right-aligned
mode label appears on a divider immediately above the prompt.

## Compatibility

Tested with **OpenCode 2.1.4**. This uses OpenCode V2's TUI plugin API, not the
server plugin API or the desktop/web UI. Future host API changes may require
adaptation, even if the peer dependency ranges still match.

OpenCode supplies the plugin API, OpenTUI, and Solid runtime instances. The
adapter is native JavaScript without JSX: no build step or React dependency
is needed. Do not run the OpenCode entrypoint directly with Node.js.

## Install from npm

Add the package to `~/.config/opencode/cli.json`:

```json
{
  "plugins": ["opencode-vim-navigation"]
}
```

Merge this with your existing settings and restart OpenCode. This belongs in
**`cli.json`**, not `opencode.json` or the V1-era `tui.json`.

For reproducible installations, check the available release and pin that
version instead of using the bare package name:

```sh
npm view opencode-vim-navigation version
```

Use `opencode-vim-navigation@<published-version>` in the plugin array. Do not
assume that an unpinned entry automatically updates an existing installation.
Use OpenCode's plugin update workflow when upgrading.

**Avoid versions 0.1.0 and 0.1.1:** they contain dependency/JSX packaging errors.
Version 0.1.2 fixed loading. Source version **0.1.3** additionally hardens
permission handling, prompt identity checks, and setup rollback. Check npm
availability before pinning 0.1.3; use a local checkout to test changes that
have not been published yet.

[npm package](https://www.npmjs.com/package/opencode-vim-navigation) ·
[GitHub](https://github.com/Raaghav-Arya/opencode-vim-navigation)

### Install a local checkout

```sh
git clone https://github.com/Raaghav-Arya/opencode-vim-navigation.git
```

Then use its **absolute directory path** in `cli.json`:

```json
{
  "plugins": ["/absolute/path/to/opencode-vim-navigation"]
}
```

No `npm install` is needed for this local package. Alternatively, symlink its
directory into `~/.config/opencode/plugins/opencode-vim-navigation` for automatic
discovery. Use **one installation method**, not both. Restart OpenCode.

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

Only Ctrl+Q is intercepted in INPUT, and only when the actual normal prompt
is focused. Ctrl+U/D keep their default prompt-editing/exit behavior until NAV.
In NAV, other keys, Enter, and pasted text are ignored to protect the draft
and avoid accidental submissions. This is transcript navigation, not Vim
editing, selection, or visual mode.

Dialogs and other non-base modes keep their own keyboard handling. NAV is
not entered from shell mode, autocomplete, unrelated textareas, or permission
rejection editors. Pending permissions/forms prevent NAV entry; incoming
requests exit NAV. Root-session checks include descendant/subagent requests,
and location-scoped global forms are checked as well. Session changes reset
NAV. The home screen and mouse behavior are unchanged.

### Neovim / Sidekick

Stay in Neovim **terminal mode**. OpenCode draws its own transcript, so normal
terminal-buffer scrollback cannot reliably navigate it. Let OpenCode receive
Ctrl+Q and handle scrolling:

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

Merge these options into your existing configuration. Disable terminal or
multiplexer mappings that intercept the same keys.

## Development and verification

Use Node.js 22 or newer:

```sh
npm test
npm run check
npm run test:package
```

- **Unit/adapter tests:** use the real controller and adapter with an injected,
  mocked host. Cover input consumption, draft/submission spies, request
  aggregation, focus identity, modal stacking, cleanup, and failure rollback.
  These tests are not a real OpenCode renderer or Solid reactivity test.
- **Syntax checks:** parse all runtime JavaScript and test files. There is no
  TSX compilation stage; this is not a TypeScript typecheck.
- **Package test:** packs the real archive, checks its contents, installs it
  into a temporary consumer with normal peer resolution and scripts disabled,
  and verifies installed source syntax/relative imports. Requires npm registry
  access. It does not load OpenCode's host-provided runtime modules.

The GitHub workflow runs all three checks. `prepublishOnly` also runs all
three before publication. Package tests leave no dependencies or archives in
the working checkout.

```text
tui.ts                    Conventional local/package entrypoint
src/
  tui.mjs                 Host imports and plugin definition
  adapter.mjs             Host integration, request/focus guards, mode indicator
  navigation.mjs          Mode state and input routing
tests/
  navigation.test.mjs     Controller tests
  adapter.test.mjs        Adapter regression tests with mocked host
scripts/
  test-package.mjs        Packed consumer installation checks
```

### Manual OpenCode runtime check

Test both a checkout **and the packed/published package**, since OpenCode's
local and npm loaders differ. The earlier JSX regression only occurred in
the npm loading path. Validate:

1. The installed package loads without plugin errors; INPUT is visible.
2. Enter a draft without submitting it. Ctrl+Q enters NAV.
3. j/k, gg/G, Ctrl+U/D visibly change the transcript viewport.
4. Unknown keys, Enter, and bracketed paste in NAV do not alter the draft or
   submit a prompt. Test submission-sensitive input only in an isolated session
   without model access; do not risk sending an actual user's draft.
5. `i` returns to INPUT with the **exact final draft** intact, not merely draft
   text appearing somewhere in a terminal recording.
6. Ctrl+U/D behave normally in INPUT.
7. Existing/new permission requests, including subagent requests, remain
   interactive. Ctrl+Q does not capture their rejection-reason editor.
8. Dialogs, forms, shell mode, session switches, and plugin disable/re-enable
   retain correct input ownership, with no duplicate listeners.

A load/keyboard smoke test against the public 0.1.2 package passed. The packed
0.1.3 archive also passed a live OpenCode npm-loader smoke test using a
temporary local registry and isolated package cache. These checks verify
loading, mode indicator changes, and keyboard-driven rendering, not every
permission interaction or a strict no-submission guarantee. Earlier
smoke assertions based only on terminal byte counts or a draft substring
were insufficient to prove exact draft preservation or absence of submission.
Do not describe those checks as a complete end-to-end guarantee.

### Implementation notes

The root `tui.ts` re-exports `src/tui.mjs`. OpenCode 2.1.4's local-directory
loader expects a conventional root `tui` entrypoint; npm packages expose it
through `./tui`. Keep both when reorganizing source.

Prepended OpenTUI key/paste listeners stop NAV input before the editor.
OpenCode keymap modes isolate prompt shortcuts, while host transcript
commands handle scrolling and virtualized history/backfill. The adapter uses
OpenCode's prompt traits to distinguish the main prompt from other textareas.
Blocking requests are checked reactively and again at event dispatch to avoid
races with incoming permissions. Acquired resources are unwound on setup
failure as well as normal plugin teardown.

In **2.1.4**, `session.page.up/down` move by half of `scroll.height`, whereas
`session.half.page.up/down` move by a quarter. This plugin deliberately uses
the former. Required-command checks cannot detect future semantic changes.

See the [OpenCode V2 CLI plugin guide](https://opencode.ai/v2/docs/build/plugins/cli)
for host APIs and package conventions.

## Disable / uninstall

Remove the package entry from `cli.json`, then restart OpenCode. For automatic
discovery, remove its symlink from `plugins/`; merely renaming a package
directory within `plugins/` does not disable it.

The TUI plugin manager ID is `opencode-vim-navigation`.

## Maintainer: publishing to npm

GitHub hosts the source; npm distributes the package. Pushing to GitHub does
not automatically publish to npm. A free npm account can publish this public,
unscoped package.

### Account setup (once)

1. Create an account at [npmjs.com/signup](https://www.npmjs.com/signup), verify
   your email, and enable two-factor authentication. Keep recovery codes private.
   GitHub CLI authentication does not log you into npm.
2. Authenticate using the browser flow:

   ```sh
   npm login --auth-type=web --registry=https://registry.npmjs.org/
   npm whoami --registry=https://registry.npmjs.org/
   ```

If publication returns E403 requiring 2FA, finish account 2FA setup and refresh
your login. Complete npm's browser/OTP prompts privately. Do not share tokens,
authentication codes, or recovery codes in issues or chat.

### Release

1. Review the diff, choose a new version, and run checks. A version already
   published to npm cannot be overwritten or reused. If the working checkout
   has already been bumped for the release, **do not bump it again**.
2. Review the artifact and publication dry run:

   ```sh
   npm test
   npm run check
   npm run test:package
   npm pack --dry-run
   npm publish --dry-run
   ```

   Tests, scripts, and GitHub workflows stay on GitHub, not in the archive.
   Dry runs do not upload a package or prove permission to publish.
3. Commit the reviewed release changes, then publish:

   ```sh
   npm publish --access public
   ```

4. Verify the published version using `npm view opencode-vim-navigation`,
   install that exact version in OpenCode, and run the runtime checklist above.
5. Tag the exact published commit (`git tag v<VERSION>`), push the commit and
   tag, then create the matching GitHub release.

For later fixes from a clean checkout, `npm version patch` updates the version
and creates a commit/tag. Use a minor/major bump when appropriate. Do not use
that command on an already-bumped release. If automating publication later,
prefer npm trusted publishing over long-lived tokens.

## License

[MIT](LICENSE) © 2026 Raaghav Arya.
