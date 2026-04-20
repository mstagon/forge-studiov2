# Changelog

All notable changes to Forge Studio are documented here. The format follows
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/) and this project adheres
to [Semantic Versioning](https://semver.org/).

## [0.3.5] — 2026-04-20

### Fixed
- **Terminals REALLY survive workspace switches now.** 0.3.4 only
  kept tabs mounted for the *current* workspace, so hopping folders
  still unmounted the other workspace's XTerminals and disposed their
  PTYs. Every tab is now rendered unconditionally; visibility is
  gated per-tab (active + belongs-here) with `display:none` hiding
  everything else. Shell history and running processes persist
  across any number of workspace switches.
- **Status bar `MCP N/N` now reports reality.** macOS GUI launches
  inherit a minimal PATH that misses Homebrew, pyenv, uv, cargo.
  `HarnessScanner.getMcpStatus` was `execFileSync`ing `which npx` /
  `which uvx` / `which python3` against that stripped PATH, so every
  MCP was reported "unavailable" and the status bar showed `MCP 0/14`
  even when everything was actually installed. Probe now uses the
  same augmented PATH PtyManager injects (+ `~/.local/bin`,
  `~/.cargo/bin`) and pins `/usr/bin/which` directly.

## [0.3.4] — 2026-04-20

### Added
- **Agent-team terminal attach.** Clicking an agent in the Teams sidebar
  (or its new terminal icon) now opens a terminal tab that attaches to
  that agent's tmux pane via `tmux select-pane + attach-session`, so you
  can watch and drive the agent's session without leaving Forge.
  Re-clicking a running agent re-focuses its existing tab instead of
  spawning a duplicate attach. Splits are disabled on agent tabs (tmux
  already handles panes), and workspace switches no longer steal focus
  from an active agent tab.
- `PtyManager.createTmuxAttach(paneId)` helper + new
  `teams:openAgentTerminal` IPC, reusing the existing `pty:data:*` /
  `pty:exit:*` channels so XTerminal stays uniform.

### Fixed
- **Terminals no longer die when you switch workspaces or tabs.**
  `TerminalPanel` used to render only the active tab, so every other
  XTerminal unmounted and its PTY got disposed — returning to a
  workspace meant fresh shells with no history or running processes.
  All workspace-matching tabs now stay mounted and inactive ones are
  hidden with `display:none`; PTYs survive the switch and xterm refits
  when the tab becomes visible again. Per-tab cwd is frozen at
  creation so hidden tabs don't get rewritten when the user hops
  folders.
- **Dev-mode "hook files not found" at Claude Code startup.**
  `workspace:getTemplatePath` / `getClaudeMdPath` resolved the dev
  template to `<repo>/..`, which doesn't contain `.claude/`. Workspaces
  created via `npm run dev` silently got a partial (or empty) harness,
  so SessionStart / PreToolUse hooks complained about missing
  `auto-profile.sh`, `skill-injector.sh`, `gateguard.sh`, etc. Both
  handlers now point at `resources/harness-template`, matching the
  packaged-build location.

### Changed (harness template)
- **Pinned model/effort to Opus 4.7 at max.** Bundled
  `.claude/settings.json` now sets `model: claude-opus-4-7`,
  `effortLevel: max`. Stripped the per-agent `model:` frontmatter from
  all 18 agents (previously half were pinned to `sonnet`, silently
  downgrading test-writer / flutter-ui / nextjs-cms / etc.) so every
  agent inherits the workspace pin. `CLAUDE_CODE_EFFORT_LEVEL` env var
  still wins if a user wants to temporarily override.

### Migration
Existing workspaces: click **Update Harness** to pick up the settings
pin and any missing hook scripts. No manual steps required — preserved
files (`agent-memory/`, `settings.local.json`, `.pdca-*`) are kept.

## [0.3.3] — 2026-04-18

### Changed (BREAKING for new workspaces — existing workspaces unaffected)
- **Flutter app directory renamed `lib/` → `client/`** across the bundled
  harness so the monorepo tree reads `client/ + server/ + cms/ + docs/`
  instead of the cryptic `lib/` that visually collided with Next.js's
  `lib/` utility folder.
- Renamed everywhere: CLAUDE.md tree + Skill Routing patterns,
  `rules/common/architecture.md` + `orchestration.md` + `git-workflow.md`,
  every `commands/*.md` that referenced Flutter paths, every
  `skills/*/SKILL.md` Flutter pattern, `scripts/skill-injector.sh` regexes,
  `settings.json` Write permission glob and post-edit `flutter analyze`.
- `WorkspaceManager.create` now scaffolds `client/` instead of `lib/`.
- `cms/lib/` (Next.js convention) and `@/lib/...` import paths inside the
  CMS are intentionally preserved.

### Migration for existing workspaces
Update Harness will pull the new template, but **your existing `lib/`
directory keeps its old name** — the rename only changes the docs/rules
that point at it. If you want to align an existing project, do the move
yourself:
```bash
git mv lib client
# then update pubspec.yaml, build.yaml, import paths if any reference lib/
```

## [0.3.2] — 2026-04-18

### Changed
- **Bundled `CLAUDE.md` is now a lean, ROLE-first delegation hub (505 → 146
  lines, 71% shorter).** Prior CLAUDE.md buried the manager directive under
  tech-stack tables and 10-step orchestration flows; model sometimes drifted
  into implementer mode before it ever parsed the routing rules. New layout,
  top to bottom: ROLE: MANAGER → STOP-THE-LINE → YOU MUST DO / MUST NOT DO →
  per-response self-check → Agent/Skill routing tables → pipeline one-liner
  → ask-user list → pointers table.
- Operational detail split into dedicated rule files so the model pulls them
  on demand instead of burning context every turn:
  - `rules/common/orchestration.md` — full dispatch flow, chaining, parallel
    rules, verification automation, TDD loop
  - `rules/common/automation.md` — hooks, profiles, continuous learning,
    verification loop, checkpoint
  - `rules/common/mcp.md` — MCP server inventory + usage rules
  - `contexts/tech-stack.md` — Flutter / NestJS / Prisma / Next.js versions
    + build commands
  - `rules/common/architecture.md` — appended with monorepo + lib/ +
    server/src/ directory layouts

### Upgrade behavior
Existing workspaces see the harness update banner (0.3.1 → 0.3.2). Clicking
*Update* swaps in the lean CLAUDE.md and new rule files; your local
`agent-memory/`, `settings.local.json`, and `.pdca-*` are preserved as
always.

## [0.3.1] — 2026-04-18

### Changed
- **Terminal tabs are now scoped per workspace.** Tabs carry a
  `workspaceId` set when they're created from a workspace context. The
  main terminal panel only shows tabs belonging to the active workspace;
  switching workspaces hides the previous workspace's tabs (kept alive
  in the store) and surfaces the new workspace's group, creating an
  initial tab if it has none. `nextTab` / `prevTab` cycle within the
  same workspace's group.
- **Teams panel is now read-only.** Removed the per-member terminal
  launcher button; Teams is a live status board, terminals belong to
  the main panel. Spawning terminals in an agent's worktree moves to
  Phase 3 (auto-split on member join).

## [0.3.0] — 2026-04-18

### Added
- **Agent Teams panel (Phase 1 of the team-agent visualization roadmap).**
  New 'Teams' sidebar view groups Claude Code Agent Teams metadata
  (`~/.claude/teams/<id>/config.json` + per-member `inboxes/<name>.json`)
  by team, with:
  - Coloured live status (running / idle / shutdown derived from
    `idle_notification` and `shutdown_request` inbox events)
  - Lead vs member distinction
  - Model + agent type
  - Unread message badge
  - Last activity relative timestamp + last summary preview
  - Hover-revealed terminal-launcher button that spawns a new terminal
    tab in the member's worktree (`member.cwd`)
- New `AgentTeamWatcher` service (chokidar) with debounced refresh and
  push updates over `teams:update` IPC.
- New IPC: `api.teams.list()` + `api.teams.onUpdate(callback)`.

### Roadmap progress
This is Phase 1 of the team agent visualization Roadmap item. Phase 2
(inbox viewer + token sparkline from telemetry) and Phase 3 (auto-split
on member spawn + inter-agent comms graph) come next.

## [0.2.9] — 2026-04-18

### Fixed (critical — please upgrade)
- **0.2.7 + 0.2.8 crashed at startup** with `Cannot find module 'node-pty'`.
  Root cause: the `beforeBuild` hook we added in 0.2.7 (to force a fresh
  `vite build` before packaging) silently overrode electron-builder's own
  native-module detection / unpack pipeline. Even after we made the hook
  call `electron-builder install-app-deps` itself, the unpack step that
  creates `app.asar.unpacked/node_modules/node-pty/` never fired.
- Fix: removed the `beforeBuild` hook entirely. Added a
  `npm run release:dmg` script that does
  `npm run build:renderer && CSC_IDENTITY_AUTO_DISCOVERY=false electron-builder ...`
  in one shot. The renderer is rebuilt first via the npm chain (so dist/ +
  dist-electron/ are fresh), then electron-builder runs unmodified and its
  default install-app-deps flow correctly populates app.asar.unpacked.
- Verified the 0.2.9 DMG contains
  `app.asar.unpacked/node_modules/node-pty/build/Release/spawn-helper`
  AND `updates:check` IPC in main.js AND `appUpdate` strings in the
  renderer bundle.

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
