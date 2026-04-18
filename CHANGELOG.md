# Changelog

All notable changes to Forge Studio are documented here. The format follows
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/) and this project adheres
to [Semantic Versioning](https://semver.org/).

## [0.2.9] — 2026-04-18

### Fixed (critical — please upgrade)
- **0.2.8 also crashed at startup** with `Cannot find module 'node-pty'`.
  Removing the explicit `return false` from beforeBuild was not enough —
  providing a beforeBuild hook at all overrides electron-builder's
  default `install-app-deps` step, which is what runs `@electron/rebuild`
  on native modules (node-pty) and decides which deps land in
  `app.asar.unpacked`. Both 0.2.7 and 0.2.8 shipped with no
  `app.asar.unpacked` directory at all.
- `scripts/before-build.js` now explicitly invokes
  `electron-builder install-app-deps` after the `vite build` step. Verified
  the 0.2.9 DMG contains
  `app.asar.unpacked/node_modules/node-pty/build/Release/spawn-helper`.

If you installed 0.2.7 or 0.2.8 and saw "A JavaScript error occurred in
the main process: Cannot find module 'node-pty'" — install 0.2.9 to fix.

## [0.2.8] — 2026-04-18

### Fixed (critical — please upgrade)
- **0.2.7 startup crash:** `Error: Cannot find module 'node-pty'`. Fix to
  the build pipeline introduced a `beforeBuild` hook that returned `false`
  to tell electron-builder "we already ran our build step, skip your dep
  install". Per electron-builder docs, that return value also skips packing
  `node_modules` into `app.asar.unpacked`, which is exactly where native
  modules like node-pty live. Result: `app.asar.unpacked` was empty and
  the main process crashed before the window even appeared.
- `scripts/before-build.js` now returns `undefined` so electron-builder
  performs its normal native-module detection and packaging after our
  vite build step. The 0.2.8 DMG is verified to contain
  `app.asar.unpacked/node_modules/node-pty/` again.

## [0.2.7] — 2026-04-18

### Fixed (critical — please upgrade)
- **Releases 0.2.0 → 0.2.6 silently shipped stale renderer + main bundles.**
  The dev shortcut of invoking `npx electron-builder` directly skipped the
  `tsc && vite build` chain, so electron-builder packaged whatever was last in
  `dist/` and `dist-electron/` — which happened to be the pre-0.2.3 build.
  Symptoms users saw:
  - In-app update notifier (added in 0.2.3) never appeared in any installed
    DMG, including 0.2.6.
  - Terminal scroll wheel handler (added in 0.2.6) never reached users.
  - Harness `update` IPC handler shape variations (0.2.5 `.mcp.json` symlink
    logic, etc.) likewise weren't actually inside the installed app.
  - The Info.plist / `app.getVersion()` was correctly bumped, masking the bug.
- `electron-builder` now runs `scripts/before-build.js`, which executes
  `npx vite build` before packaging. This guarantees `dist/` + `dist-electron/`
  are fresh no matter how the build is invoked (full npm script chain or
  direct `electron-builder`).

If you're on **anything 0.2.0 through 0.2.6**, install 0.2.7 manually — the
in-app update notifier in those builds doesn't actually exist to tell you.

## [0.2.6] — 2026-04-18

### Fixed
- **Terminal didn't scroll.** xterm.js + the WebGL renderer on macOS
  trackpads occasionally swallow wheel events at the canvas layer, so the
  viewport stays pinned at the bottom no matter how much you scroll.
  XTerminal now installs an explicit `wheel` listener on the container that
  normalises pixel / line / page deltas into line counts and feeds them
  straight into `terminal.scrollLines()`. Shift-wheel scrolls 5× faster
  (matches xterm's "fast scroll" convention).
- Bumped `scrollSensitivity` to 3 and `fastScrollSensitivity` to 5 so even
  the built-in xterm wheel handler — when it does fire — moves a useful
  amount per tick.

## [0.2.5] — 2026-04-17

### Fixed
- **Project MCP servers now actually load.** Claude Code only auto-discovers
  MCP from `<project>/.mcp.json` (root), but our harness convention puts it at
  `<project>/.claude/mcp.json` — so workspaces silently lost every project-
  scoped server (serena, context7, supabase, …) defined in the bundled
  harness. `WorkspaceManager.create` and `.updateHarness` now drop a relative
  symlink at `<project>/.mcp.json -> .claude/mcp.json` so the harness file
  becomes the single source of truth, and Claude Code picks the servers up
  with no manual wiring.
- The symlink is idempotent: a regular file at `.mcp.json` is left alone
  (user-authored), a stale symlink is re-pointed.

### Workaround for existing workspaces (one-liner)
```bash
cd <workspace>
ln -sf .claude/mcp.json .mcp.json
```
Or just hit *Update* on the harness banner after installing 0.2.5 — the
symlink will be created during the update flow.

## [0.2.4] — 2026-04-17

### Fixed
- **"App is damaged and can't be opened" Gatekeeper error.** macOS Sequoia +
  Apple Silicon refuses to load entirely-unsigned bundles and surfaces the
  failure as a damaged-app dialog that not even right-click → Open recovers
  from. `scripts/after-pack.js` now invokes `codesign --sign - --deep --force`
  on the bundle when no Developer ID is configured, so installed `.app`s carry
  an ad-hoc signature. Gatekeeper will still show "unidentified developer" on
  first launch, but right-click → Open works as expected.
- The ad-hoc signing step is skipped automatically when `CSC_LINK`, `CSC_NAME`,
  or `CSC_IDENTITY_AUTO_DISCOVERY=true` is set — those builds get real
  Developer ID signing from electron-builder later in the pipeline.

### Workaround for 0.2.0 – 0.2.3 installs
If you already installed an earlier release and hit the damaged-app dialog,
run once and the app is healthy again:
```bash
xattr -cr "/Applications/Forge Studio.app"
codesign --sign - --deep --force "/Applications/Forge Studio.app"
```

## [0.2.3] — 2026-04-17

### Added
- **In-app update notifier.** A tiny amber pill in the TopBar (`v0.2.4` etc.)
  appears whenever GitHub has a newer release than the running app. Click it to
  open the release notes in the default browser. The check runs once on
  startup and every 60 minutes thereafter.
- New IPC: `api.updates.check()` returns `{ current, latest, hasUpdate,
  releaseUrl, publishedAt, notes, checkedAt, error }` and is backed by a
  dedicated `UpdateChecker` service hitting GitHub's `/releases/latest`
  endpoint with an 8s timeout.

### Notes
- This is the lightweight half of auto-update: surface the new release, let
  the user grab the DMG. Fully background install via `electron-updater` is
  blocked on restoring code signing + adding notarization, tracked
  separately.

## [0.2.2] — 2026-04-17

### Added
- **Bundled `mobile-design` skill** (vendored from
  [sickn33/antigravity-awesome-skills](https://github.com/sickn33/antigravity-awesome-skills),
  MIT). Mobile-first / touch-first / platform-respectful design discipline,
  including the Mobile Feasibility & Risk Index (MFRI) decision framework and
  per-platform / color / typography / navigation / performance / testing
  references.
- **Bundled `mobile-touch` skill** (vendored from
  [dylantarre/animation-principles](https://github.com/dylantarre/animation-principles),
  MIT). Disney's 12 animation principles applied to mobile gestures, haptics,
  spring/ease curves, and overscroll behavior.
- Skill Routing wired in `CLAUDE.md`: `lib/presentation/**` now auto-attaches
  both new skills, and dedicated rows for "모바일 화면/UX" and "제스처/햅틱/모션"
  trigger them by intent. Agent routing for UI requests now flows
  `pencil → mobile-design (MFRI) → flutter-ui → riverpod-logic`, with a
  separate motion-specific path through `mobile-touch → flutter-ui`.

### Notes
- Both upstream LICENSE files are vendored alongside each skill as
  `LICENSE.upstream` to preserve attribution under MIT.

## [0.2.1] — 2026-04-17

### Fixed
- **`sync-harness.sh` no longer wipes the bundled template on machines without a
  parent harness mono-repo.** The 0.2.0 DMG shipped with an empty
  `Contents/Resources/harness-template/`, so the in-app *Update Harness* button
  failed with `Bundled harness template not found`. The script now checks for
  `$HARNESS_ROOT/.claude/` and exits 0 (keeping the committed template) if it is
  absent.

### Docs
- README rewritten to lead with the harness-as-a-product story and drop
  references to the unrelated bkit plugin ecosystem.

## [0.2.0] — 2026-04-17

### Added
- **Harness auto-update**: per-workspace `.claude/.harness-version` marker, in-app
  banner, and one-click update that backs up the previous harness while preserving
  `agent-memory/`, `settings.local.json`, and `.pdca-*` files.
- **PATH augmentation in PTY**: macOS PTYs now prepend `/opt/homebrew/bin` and
  `/usr/local/bin` so GUI-launched shells find rbenv / nvm / pyenv / fvm without
  requiring `~/.zshrc` workarounds.
- **MesloLGS NF font** as the default xterm font so Powerlevel10k Nerd Font
  glyphs render correctly.
- **`afterPack` hook** (`scripts/after-pack.js`) restores the executable bit on
  `node-pty`'s `spawn-helper` after packaging — fixes `posix_spawnp failed` on
  installed builds.
- GPL-3.0-or-later LICENSE.

### Changed
- `WorkspaceManager.create` now writes a version marker into the freshly copied
  harness so future updates can compare cleanly.

## [0.1.0] — 2026-04

### Added
- Initial release: Electron shell, xterm.js terminal with split panes and tabs,
  workspace manager with bundled harness template, git integration, harness and
  MCP inspector, command palette, dashboard.
