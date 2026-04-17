<div align="center">

# Forge Studio

**A native macOS GUI for [Claude Code](https://claude.com/claude-code) — terminals, workspaces, git, and a first-class harness manager in one window.**

[![License: GPL v3](https://img.shields.io/badge/License-GPL_v3-blue.svg)](https://www.gnu.org/licenses/gpl-3.0)
[![Electron](https://img.shields.io/badge/Electron-35-47848F?logo=electron&logoColor=white)](https://www.electronjs.org/)
[![React](https://img.shields.io/badge/React-19-61DAFB?logo=react&logoColor=black)](https://react.dev/)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.8-3178C6?logo=typescript&logoColor=white)](https://www.typescriptlang.org/)
[![Vite](https://img.shields.io/badge/Vite-6-646CFF?logo=vite&logoColor=white)](https://vitejs.dev/)

</div>

---

## What is this

Forge Studio is a desktop wrapper that turns Claude Code into an IDE-style workspace.
It ships a **bundled `.claude/` harness** (agents, skills, commands, rules, hooks, MCP
config) inside the app, treats that harness as a versioned upgradable artifact, and
gives you the surrounding chrome — workspaces, real terminals, git, and an in-app
update notifier — so a fresh project is one click away from a fully wired Claude Code
environment.

```
┌─────────────────────────────────────────────────────────────────┐
│  TopBar — workspace · harness badge · v0.2.4 ↑ · settings       │
├──────────┬──────────────────────────────────────────────────────┤
│          │  Harness update available · 0.2.0 → 0.2.3  [Update]  │
│ Sidebar  ├──────────────────────────────────────────────────────┤
│          │                                                      │
│ • WS     │              xterm-256color · split panes            │
│ • Git    │              ╭─ tab 1 ─╮ ╭─ tab 2 ─╮                 │
│ • Dash   │              │  zsh ▌  │ │ claude  │                 │
│ • Set    │              ╰─────────╯ ╰─────────╯                 │
│          │                                                      │
└──────────┴──────────────────────────────────────────────────────┘
```

---

## Harness Manager (the headline feature)

Most Claude Code setups treat `.claude/` as a one-time copy: scaffold a project,
paste your agents/skills, watch each workspace drift to its own slightly stale
snapshot. Forge Studio fixes that — the harness is a **versioned product** that
ships with the app and updates safely in place.

### Lifecycle

1. **Bundled at build time.** Every release packages a vetted `.claude/` +
   `CLAUDE.md` into `Contents/Resources/harness-template/`. `npm run sync-harness`
   pulls fresh content from the parent harness mono-repo before packaging; on
   clean builds the script is a safe no-op so the committed template is the
   source of truth.
2. **Stamped on workspace create.** When you spin up a new workspace,
   `WorkspaceManager.create` copies the bundled template and writes
   `.claude/.harness-version` containing the app version that produced it.
3. **Diffed on workspace open.** The renderer fires
   `api.harness.getInstalledVersion(ws)` and `api.harness.getBundledVersion()`
   in parallel, compares them, and surfaces an amber banner above the terminal
   if they differ (or if the marker is missing — i.e. legacy workspaces).
4. **One-click safe update.** Clicking *Update* calls `api.harness.update(ws)`
   which performs an atomic-ish swap inside `WorkspaceManager.updateHarness`:
   - **Preserve list** — `agent-memory/`, `settings.local.json`, every
     `.pdca-*` file is snapshotted into a temp dir.
   - **Backup** — the existing `.claude/` is moved to
     `.claude.bak.<ISO timestamp>` (never deleted).
   - **Replace** — the bundled template is copied in (excluding upstream
     `settings.local.json` / `.pdca-*` so we don't reintroduce stale state).
   - **Restore** — preserved files are layered back on top.
   - **Re-stamp** — a fresh `.harness-version` matching the new app version.
   - **Re-mark** — `harnessApplied=true` flushed to `workspaces.json`.
5. **Visible inspector.** `HarnessScanner` walks `.claude/` and reports per-slot
   counts (agents, skills, commands, scripts, rules, MCP servers, hooks) plus
   live MCP status, surfaced in the dashboard panel.

### What lives in the bundled harness

| Slot | What's in it | Auto-attached when |
|---|---|---|
| `agents/` | Sub-agent definitions Claude Code can spawn (e.g. `flutter-ui`, `nestjs-backend`, `prisma-data`, `code-reviewer`, `security-auditor`) | Claude routes a request matching the agent description |
| `skills/` | SKILL.md files including the bundled `mobile-design` (MFRI + per-platform refs) and `mobile-touch` (Disney 12 principles for gestures/haptics) | File pattern in SKILL frontmatter matches the file you're editing |
| `commands/` | Slash commands (`/implement`, `/verify`, `/review`, `/checkpoint`, `/api-sync`, …) | You type `/<name>` or the workflow auto-fires it (most are wired into the verify/review pipeline) |
| `rules/` | Project-wide rules: `architecture.md`, `coding-style.md`, `git-workflow.md` (granular commit rule lives here), `security.md`, `testing.md` | Always loaded into Claude's project context |
| `scripts/` | Hook scripts: `gateguard.sh` (PreToolUse), `skill-injector.sh` (file-pattern → skill auto-attach), `learn.sh` + `evaluate-session.sh` (Stop), `mcp-health.sh` (SessionStart), `pre-compact.sh` | Triggered by Claude Code's hook engine |
| `contexts/` | Long-form domain context Claude pulls in on demand | Referenced from CLAUDE.md or pulled by an agent |
| `mcp.json` | Project MCP server config (context7, dart, serena, sequential-thinking, supabase, playwright, …) | Loaded on Claude Code session start |
| `settings.json` | Per-project Claude Code settings — hooks wiring, permissions, env | Loaded on Claude Code session start |
| `.harness-version` | Version marker written by Forge Studio | Read by the update banner; never edit by hand |

### IPC surface (renderer → main)

```ts
api.harness.getBundledVersion()             // → '0.2.3'
api.harness.getInstalledVersion(workspace)  // → '0.2.0' | null (no marker)
api.harness.update(workspace)               // → { backupPath, version }
api.harness.scan(workspace)                 // counts agents/skills/commands/etc.
api.harness.getMcpStatus(workspace)         // live MCP server states per project
api.harness.readFile(absPath)               // sandboxed: only inside .claude/ of a tracked workspace
```

---

## Other features

### Real terminal, done right
- **node-pty** backend, full xterm-256color, true colors, **MesloLGS NF** Nerd Font
  out of the box (Powerlevel10k icons render correctly without extra config).
- **Split panes** (horizontal / vertical), tabs, in-terminal search, 10k scrollback.
- **PATH auto-augmentation** on macOS: spawned PTYs prepend `/opt/homebrew/bin`
  and `/usr/local/bin` so GUI-launched shells find rbenv / nvm / pyenv / fvm
  without `~/.zshrc` workarounds.
- **`spawn-helper` permission fix** baked into the build (`scripts/after-pack.js`)
  so installed `.app`s never hit the classic `posix_spawnp failed`.

### Workspace management
- New / open / remove workspaces with a recents list backed by
  `~/Library/Application Support/Forge Studio/workspaces.json`.
- New-workspace flow scaffolds standard directories (`lib/`, `server/`, `cms/`,
  `docs/`), runs `git init`, copies the bundled harness, and stamps the version
  marker.
- Auto-discovers `.claude/` on opens of pre-existing folders so they slot in
  cleanly with the harness inspector and update banner.

### Git integration
- Status, log, branches, diffs, stage / unstage, commit, push, pull, fetch,
  branch create / checkout / delete, discard.
- Per-commit file list and diff viewer; visual commit graph in the dedicated
  Git panel.
- Real-time status reflected in the StatusBar.

### In-app update notifier (since 0.2.3)
- A small amber `vX.Y.Z` pill appears in the TopBar when GitHub has a newer
  release. Click → opens the release notes in the default browser. Dismiss → hides
  it for that version only.
- Backed by `UpdateChecker` (Electron `net` against
  `/repos/mstagon/forge-studiov2/releases/latest`, 8s timeout) and a zustand
  store. Initial check on mount, then every 60 minutes.

### Inspector dashboard
- Live counts of harness items per workspace.
- MCP server status panel (running / errored / not configured).
- Command palette (⌘⇧P).

---

## Installation

### Pre-built (recommended)

Grab the latest DMG from
[Releases](https://github.com/mstagon/forge-studiov2/releases/latest):

```bash
open ~/Downloads/Forge\ Studio-*.dmg
# Drag into /Applications, then right-click → Open the first time
# (current builds are unsigned; right-click → Open is a one-time Gatekeeper bypass)
```

### From source

```bash
git clone https://github.com/mstagon/forge-studiov2.git
cd forge-studiov2
npm install                  # runs @electron/rebuild + the isbinaryfile patch
npm run electron:build       # → release/Forge Studio-<version>-arm64.dmg
```

### Requirements
- macOS 12+ (Apple Silicon or Intel)
- Node 20+
- Xcode Command Line Tools (for the native node-pty rebuild)

---

## Development

```bash
npm install
npm run electron:dev   # vite dev server + electron with HMR
npm run typecheck      # tsc --noEmit
npm run lint
```

`npm run sync-harness` pulls the harness from the parent mono-repo into
`resources/harness-template/`. On clean checkouts (no parent harness) the script
no-ops and keeps the committed template — safe to run anywhere.

### Project structure

```
electron/
├── main.ts                    # IPC handlers + app lifecycle
├── preload.ts                 # contextBridge API surface
└── services/
    ├── PtyManager.ts          # node-pty + macOS PATH augmentation
    ├── WorkspaceManager.ts    # workspaces, harness versioning, updateHarness
    ├── HarnessScanner.ts      # .claude/ inspector + MCP status
    ├── GitManager.ts          # git plumbing
    └── UpdateChecker.ts       # GitHub Releases polling

src/
├── App.tsx                    # layout shell + global hotkeys + update polling
├── components/
│   ├── layout/                # TopBar (+ AppUpdateBadge), Sidebar, StatusBar
│   ├── terminal/              # XTerminal + TerminalPanel (split panes)
│   ├── git/                   # status, log, diff, branch picker, GitGraph
│   ├── dashboard/             # DashboardPanel + CommandPalette
│   └── workspace/             # NewWorkspaceDialog + HarnessUpdateBanner
├── stores/                    # zustand: workspace + terminal + appUpdate
└── types/

scripts/
├── after-pack.js              # restores +x on node-pty spawn-helper post-build
├── patch-isbinaryfile.js      # postinstall patch for @electron/osx-sign's isbinaryfile
└── sync-harness.sh            # pulls harness into resources/ (safe no-op fallback)

resources/
└── harness-template/          # bundled .claude/ + CLAUDE.md (committed)
```

---

## Versioning

Forge Studio uses [SemVer](https://semver.org/). The bundled harness inherits
the app version: opening a workspace whose `.claude/.harness-version` differs
from `app.getVersion()` triggers the update banner. The in-app update notifier
(0.2.3+) keeps the app itself in sync with GitHub Releases.

See [CHANGELOG](CHANGELOG.md) for release notes.

---

## Tech stack

| Layer | What |
|---|---|
| Shell | Electron 35, contextIsolation on, sandbox off (PTY needs Node), preload IPC bridge |
| Renderer | React 19, Vite 6, Tailwind 3, Zustand |
| Terminal | xterm.js 5.5 (+ webgl, fit, search, web-links, unicode11, serialize) |
| PTY | node-pty 1.0 (rebuilt against Electron via @electron/rebuild) |
| Build | electron-builder 25 (DMG + ZIP, asarUnpack for native modules, `afterPack` chmod fix, `postinstall` isbinaryfile patch) |

---

## Roadmap / TODO

Larger pieces being considered. Order is rough; PRs welcome.

- [ ] **Framework presets** — pluggable bundled harnesses beyond the current
      Flutter + NestJS + Prisma + Next.js mono-repo template. Targets:
      Next.js-only, Vite-React-only, SvelteKit, FastAPI + Next, Tauri + Rust,
      Expo + Convex, Go + Templ, Rails 8. Each preset lives under
      `resources/presets/<name>/.claude/` and is picked at workspace create
      time (the New Workspace dialog gains a "Preset" dropdown).
- [ ] **Team workspaces** — multi-machine, multi-user shared workspace state.
      Real shapes:
      - workspace metadata syncs (workspaces.json → server) so opening on a
        new laptop pulls the same recents and harness expectations
      - per-workspace shared `agent-memory/` so the team's agents accumulate
        institutional context together
      - presence + lock indicators when a teammate is editing the same
        `.claude/` slot
- [ ] **Harness management UI** — first-class editor for the bundled template,
      not just the inspector. Add / remove / edit agents, skills, commands,
      rules, hooks from inside Forge Studio; diff against upstream; publish
      back to the harness mono-repo or to a team's private harness registry.
      Lays the groundwork for letting teams maintain their own harness fork
      without leaving the app.
- [ ] **CI/CD flow** — GitHub Actions wiring shipped in the bundled scripts:
      lint + typecheck + electron-builder per push, signed + notarized DMG on
      tag, release notes generated from CHANGELOG, latest-mac.yml published so
      `electron-updater` can do background installs once signing is restored.
- [ ] **Team agent visualization** — live graph of which sub-agents are
      currently running (across the team's machines), what they're working on,
      tokens consumed, recent decisions. Backed by the same telemetry stream
      Claude Code already emits; the GUI is the missing piece. Useful for
      "who is touching what" and for after-the-fact review of an
      agent-team-driven feature.

Earlier wins (already shipped, kept here for context):
- Bundled harness with version markers + one-click in-app update (0.2.0–0.2.1)
- macOS PTY PATH augmentation + Powerlevel10k Nerd Font support (0.2.0)
- `mobile-design` + `mobile-touch` skills bundled (0.2.2)
- In-app update notifier polling GitHub Releases (0.2.3)

---

## License

[GPL-3.0-or-later](LICENSE) © Forge Studio contributors.

This program is free software: you can redistribute it and/or modify it under
the terms of the GNU General Public License as published by the Free Software
Foundation, either version 3 of the License, or (at your option) any later
version.
