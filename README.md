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
config) inside the app, and treats that harness as a versioned, upgradable artifact —
not a pile of files you copy by hand into every project.

Open a workspace, work in a real PTY, and let the app keep the harness in sync.

```
┌─────────────────────────────────────────────────────────────┐
│  TopBar — workspace · harness badge · settings              │
├──────────┬──────────────────────────────────────────────────┤
│          │  Harness update available · 0.2.0 → 0.2.1 [Update]
│ Sidebar  ├──────────────────────────────────────────────────┤
│          │                                                  │
│ • WS     │              xterm-256color · split panes        │
│ • Git    │              ╭─ tab 1 ─╮ ╭─ tab 2 ─╮             │
│ • Dash   │              │  zsh ▌  │ │ claude  │             │
│ • Set    │              ╰─────────╯ ╰─────────╯             │
│          │                                                  │
└──────────┴──────────────────────────────────────────────────┘
```

## Harness as a Product (the headline feature)

Most Claude Code setups treat the `.claude/` folder as a one-time copy: you scaffold
a project, paste your agents/skills, and over time every workspace drifts to its own
slightly stale snapshot. Forge Studio fixes that.

### How it works

- **Bundled template**: every release ships a vetted `.claude/` + `CLAUDE.md` inside
  the app bundle (`Contents/Resources/harness-template/`). New workspaces are
  scaffolded from it in one click.
- **Version markers**: when a workspace is created or updated, Forge Studio writes
  `.claude/.harness-version` containing the app version that produced the harness.
- **Diff detection**: opening a workspace compares the marker against the bundled
  version. Different (or missing) → an amber banner appears above the terminal.
- **Safe one-click update**: clicking *Update* moves the existing `.claude/` to
  `.claude.bak.<ISO timestamp>`, copies the bundled template in, then **restores
  the files you actually own**:
  - `agent-memory/` — your per-workspace agent memory
  - `settings.local.json` — local permissions
  - `.pdca-*` — runtime state files
- **Backup-first**: nothing is destroyed. If you don't like the update, the
  timestamped backup is right next to `.claude/`.

### What lives in the harness

The bundled template under `resources/harness-template/.claude/` includes:

| Slot | What's in it |
|---|---|
| `agents/` | Sub-agent definitions Claude Code can spawn |
| `skills/` | SKILL.md files that auto-attach by file pattern |
| `commands/` | Slash commands callable from Claude Code |
| `rules/` | Project-wide rules (architecture, coding-style, git-workflow, security, testing) |
| `scripts/` | Hook scripts (PreToolUse, Stop, SessionStart, …) |
| `contexts/` | Long-form context Claude can pull in |
| `mcp.json` | Project MCP server configuration |
| `settings.json` | Per-project Claude Code settings (hooks, permissions) |

Edit it once in the harness mono-repo, run `npm run sync-harness`, ship a release —
every user gets the update banner the next time they open a workspace.

### IPC surface (renderer → main)

```ts
api.harness.getBundledVersion()             // → '0.2.1'
api.harness.getInstalledVersion(workspace)  // → '0.2.0' | null (no marker)
api.harness.update(workspace)               // → { backupPath, version }
api.harness.scan(workspace)                 // counts agents/skills/commands/etc.
api.harness.getMcpStatus(workspace)         // live MCP server states
```

## Other features

### Real terminal, done right
- **node-pty** backend — full xterm-256color, true colors, MesloLGS NF Nerd Font
  out of the box (Powerlevel10k icons render correctly).
- **Split panes** (horizontal / vertical), tabs, in-terminal search, 10k scrollback.
- **PATH auto-augmentation** on macOS: spawned PTYs prepend `/opt/homebrew/bin` and
  `/usr/local/bin` so GUI-launched shells can find rbenv / nvm / pyenv / fvm
  without `~/.zshrc` workarounds.
- **`spawn-helper` permission fix** baked into the build (`afterPack` script) so
  installed `.app`s never hit the classic `posix_spawnp failed`.

### Workspace management
- New / open / remove workspaces with a recent list.
- Each workspace stores `id`, `path`, `createdAt`, `lastOpened`, `harnessApplied`
  in `~/Library/Application Support/Forge Studio/workspaces.json`.
- Auto `git init` and standard scaffolding directories on create.

### Git integration
- Status, log, branches, diffs, stage / unstage, commit, push / pull / fetch.
- Per-commit file list and diff viewer; visual commit graph.

### Inspector dashboard
- Live counts of harness items per workspace.
- MCP server status panel (running / errored / not configured).
- Command palette (⌘⇧P).

## Installation

### Pre-built (recommended)

Grab the latest signed DMG from
[Releases](https://github.com/mstagon/forge-studiov2/releases):

```bash
open ~/Downloads/Forge\ Studio-*.dmg
# Drag into /Applications, then right-click → Open the first time
# (the build is code-signed but not notarized yet)
```

### From source

```bash
git clone https://github.com/mstagon/forge-studiov2.git
cd forge-studiov2
npm install                  # @electron/rebuild runs node-pty against Electron
npm run electron:build       # release/Forge Studio-<version>-arm64.dmg
```

### Requirements
- macOS 12+ (Apple Silicon or Intel)
- Node 20+
- Xcode Command Line Tools (for the native node-pty rebuild)

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
    └── GitManager.ts          # git plumbing

src/
├── App.tsx                    # layout shell + global hotkeys
├── components/
│   ├── layout/                # TopBar, Sidebar, StatusBar
│   ├── terminal/              # XTerminal + TerminalPanel (split panes)
│   ├── git/                   # Status, log, diff, branch picker
│   ├── dashboard/             # DashboardPanel + CommandPalette
│   └── workspace/             # NewWorkspaceDialog + HarnessUpdateBanner
├── stores/                    # zustand: workspace + terminal
└── types/

scripts/
├── after-pack.js              # restores +x on node-pty spawn-helper post-build
└── sync-harness.sh            # pulls harness into resources/ (safe no-op fallback)

resources/
└── harness-template/          # bundled .claude/ + CLAUDE.md (committed)
```

## Versioning

Forge Studio uses [SemVer](https://semver.org/). The bundled harness inherits the
app version: opening a workspace whose `.claude/.harness-version` differs from
`app.getVersion()` triggers the update banner.

See [CHANGELOG](CHANGELOG.md) for release notes.

## Tech stack

| Layer | What |
|---|---|
| Shell | Electron 35, contextIsolation on, sandbox off (PTY needs Node), preload IPC bridge |
| Renderer | React 19, Vite 6, Tailwind 3, Zustand |
| Terminal | xterm.js 5.5 (+ webgl, fit, search, web-links, unicode11) |
| PTY | node-pty 1.0 (rebuilt against Electron via @electron/rebuild) |
| Build | electron-builder 25 (DMG + ZIP, asarUnpack for native modules, `afterPack` chmod fix) |

## License

[GPL-3.0-or-later](LICENSE) © Forge Studio contributors.

This program is free software: you can redistribute it and/or modify it under the
terms of the GNU General Public License as published by the Free Software Foundation,
either version 3 of the License, or (at your option) any later version.
