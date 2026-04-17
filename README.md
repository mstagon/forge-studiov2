<div align="center">

# Forge Studio

**A native macOS GUI for [Claude Code](https://claude.com/claude-code) — terminal, workspaces, git, and harness in one.**

[![License: GPL v3](https://img.shields.io/badge/License-GPL_v3-blue.svg)](https://www.gnu.org/licenses/gpl-3.0)
[![Electron](https://img.shields.io/badge/Electron-35-47848F?logo=electron&logoColor=white)](https://www.electronjs.org/)
[![React](https://img.shields.io/badge/React-19-61DAFB?logo=react&logoColor=black)](https://react.dev/)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.8-3178C6?logo=typescript&logoColor=white)](https://www.typescriptlang.org/)
[![Vite](https://img.shields.io/badge/Vite-6-646CFF?logo=vite&logoColor=white)](https://vitejs.dev/)

</div>

---

## What is this

Forge Studio is a desktop wrapper that turns Claude Code into a full IDE-style workspace:
real PTY terminals (xterm.js + node-pty), per-workspace git, a harness inspector for
agents/skills/commands/MCP, and a one-click bundled harness updater so every project
stays in sync with the latest bkit conventions.

```
┌─────────────────────────────────────────────────────────────┐
│  TopBar — workspace name · harness badge · settings        │
├──────────┬──────────────────────────────────────────────────┤
│          │  Harness update available · v0.1 → v0.2 [Update]│
│ Sidebar  ├──────────────────────────────────────────────────┤
│          │                                                  │
│ • WS     │              xterm-256color · split panes        │
│ • Git    │              ╭─ tab 1 ─╮ ╭─ tab 2 ─╮             │
│ • Dash   │              │  zsh ▌  │ │ claude  │             │
│ • Set    │              ╰─────────╯ ╰─────────╯             │
│          │                                                  │
└──────────┴──────────────────────────────────────────────────┘
```

## Features

### 🖥️ Real Terminal, Done Right
- **node-pty** backend — full xterm-256color, true colors, MesloLGS NF Nerd Font
- **Split panes** (horizontal/vertical), tabs, search, scrollback 10k
- **PATH auto-augmentation** on macOS (Homebrew, /usr/local/bin) so GUI-launched shells
  find rbenv/nvm/pyenv/fvm/etc. without `~/.zshrc` workarounds

### 📦 Workspace + Harness Management
- Spin up a new project with the bundled `.claude/` harness in one click
- Per-workspace `agent-memory/`, `settings.local.json`, `.pdca-*` are preserved
- **Auto-update banner** — when you upgrade the app, every workspace gets a one-click
  refresh to the latest harness, automatic backup included

### 🌿 Git Integration
- Status, log, branches, diffs, stage/unstage, commit, push/pull/fetch
- Visual commit graph

### 🔌 Harness Inspector
- Scans `.claude/agents`, `.claude/skills`, `.claude/commands`, `.claude/scripts`
- Live MCP server status

## Installation

### From Source

```bash
git clone https://github.com/mstagon/forge-studio.git
cd forge-studio
npm install
npm run electron:build
# Open release/mac-arm64/Forge Studio.app
```

### Requirements
- macOS 12+ (Apple Silicon or Intel)
- Node 20+
- Xcode Command Line Tools (for native module rebuild)

## Development

```bash
npm install
npm run electron:dev   # vite dev server + electron with HMR
npm run typecheck      # tsc --noEmit
npm run lint
```

### Project Structure

```
electron/
├── main.ts                    # Main process, IPC handlers, lifecycle
├── preload.ts                 # contextBridge API surface
└── services/
    ├── PtyManager.ts          # node-pty lifecycle + PATH augmentation
    ├── WorkspaceManager.ts    # Workspaces + harness versioning/update
    ├── HarnessScanner.ts      # .claude/ inspector
    └── GitManager.ts          # git plumbing

src/
├── App.tsx                    # Layout shell
├── components/                # TopBar, Sidebar, terminal, git, dashboard, workspace
├── stores/                    # zustand: workspace, terminal
└── types/

scripts/
├── after-pack.js              # Restores +x on node-pty spawn-helper post-build
└── sync-harness.sh            # Pulls bkit harness into resources/ before packaging

resources/
└── harness-template/          # Bundled .claude/ + CLAUDE.md (synced from parent)
```

## Versioning

Forge Studio uses [SemVer](https://semver.org/). The bundled harness is tagged with
the app version on workspace creation, and the in-app update banner triggers when
the bundled version differs from `.claude/.harness-version`.

See [CHANGELOG](CHANGELOG.md) for release notes.

## Tech Stack

| Layer | What |
|---|---|
| Shell | Electron 35, contextIsolation, sandbox-off |
| Renderer | React 19, Vite 6, Tailwind 3, Zustand |
| Terminal | xterm.js 5.5 (+ webgl, fit, search, web-links, unicode11) |
| PTY | node-pty 1.0 (rebuilt against Electron via @electron/rebuild) |
| Build | electron-builder 25 (DMG + ZIP, asarUnpack for native modules) |

## License

[GPL-3.0-or-later](LICENSE) © Forge Studio contributors.

This program is free software: you can redistribute it and/or modify it under the
terms of the GNU General Public License as published by the Free Software Foundation,
either version 3 of the License, or (at your option) any later version.

Built on top of [Claude Code](https://claude.com/claude-code) by Anthropic and the
[bkit](https://github.com/bkend-ai) plugin ecosystem.
