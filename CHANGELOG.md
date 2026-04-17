# Changelog

All notable changes to Forge Studio are documented here. The format follows
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/) and this project adheres
to [Semantic Versioning](https://semver.org/).

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
