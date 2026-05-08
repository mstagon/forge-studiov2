import path from 'path'
import os from 'os'
import fs from 'fs'
import { app } from 'electron'

/**
 * PathManager — single source of truth for locating the *bundled* toolchain
 * that ships inside the Forge Studio DMG (tmux, uv, python-build-standalone,
 * and the pre-built code-review-graph venv).
 *
 * Why a service:
 *   - The packaged path (`process.resourcesPath/bundled-tools/`) and the dev
 *     path (`<repo>/resources/bundled-tools/darwin-arm64/`) differ.
 *   - Multiple managers (PtyManager, CodeReviewGraphManager, AgentTeamWatcher's
 *     tmux callers) all need to (a) find specific bundled binaries and
 *     (b) prepend the bundle bin/ directories to PATH so users' own shells
 *     also see the tools.
 *   - Centralizing the path-resolution lets each tool fall back gracefully:
 *     bundled-first, then user-installed (Homebrew / pipx / uv / cargo).
 *
 * macOS arm64 is the only build target right now (see README + package.json).
 * The platform-folder ('darwin-arm64') is hard-coded; when we add x64 / Linux
 * we'll swap that to a runtime lookup keyed on process.platform + process.arch.
 */
export class PathManager {
  /** Resolved root, computed lazily and memoised. `null` when no bundle was shipped. */
  private rootCache: string | null | undefined = undefined

  /**
   * Absolute path to `resources/bundled-tools/darwin-arm64/` in dev or
   * `Contents/Resources/bundled-tools/` in a packaged build.
   *
   * Returns `null` if the directory is absent (developer hasn't run
   * `scripts/download-bundled-tools.sh` yet, or running on an unsupported
   * platform). All callers MUST handle null and fall back to PATH-based
   * lookup so Forge stays usable on hosts without the pre-bundle.
   */
  getBundledToolsRoot(): string | null {
    if (this.rootCache !== undefined) return this.rootCache

    if (os.platform() !== 'darwin' || os.arch() !== 'arm64') {
      this.rootCache = null
      return null
    }

    const candidate = app.isPackaged
      ? path.join(process.resourcesPath, 'bundled-tools')
      : path.resolve(__dirname, '..', '..', 'resources', 'bundled-tools', 'darwin-arm64')

    if (!fs.existsSync(candidate)) {
      this.rootCache = null
      return null
    }
    this.rootCache = candidate
    return candidate
  }

  /** Absolute path to bundled tmux binary, or null if not bundled. */
  getTmux(): string | null {
    return this.binIfExecutable('bin/tmux')
  }

  /** Absolute path to bundled uv binary, or null if not bundled. */
  getUv(): string | null {
    return this.binIfExecutable('bin/uv')
  }

  /**
   * Absolute path to the bundled Python interpreter, or null if not bundled.
   * Prefers `python3.12` (the pinned version) but falls back to `python3` for
   * future-proofing.
   */
  getPython(): string | null {
    const root = this.getBundledToolsRoot()
    if (!root) return null
    for (const rel of ['python/bin/python3.12', 'python/bin/python3']) {
      const p = path.join(root, rel)
      if (this.isExecutable(p)) return p
    }
    return null
  }

  /**
   * Absolute path to the pre-built code-review-graph CLI inside the bundled
   * venv, or null if the venv is missing. Use this as the *first* resolver
   * in CodeReviewGraphManager.isInstalled — falling back to PATH only when
   * the bundle is absent.
   */
  getCrGraphCli(): string | null {
    return this.binIfExecutable('cr-graph-venv/bin/code-review-graph')
  }

  /**
   * Augment a `PATH`-bearing env so child processes can resolve every bundled
   * binary by name. Order matters: bundled bin > cr-graph venv bin > python
   * bin > the original PATH. This way a user with their own homebrew tmux
   * still gets the bundled one (predictability), and the cr-graph venv's
   * `python` shim takes precedence over the system interpreter for any
   * `code-review-graph` subshell.
   */
  augmentEnv<E extends NodeJS.ProcessEnv>(env: E): E {
    const root = this.getBundledToolsRoot()
    if (!root) return env

    const prepend: string[] = []
    const tryAdd = (rel: string) => {
      const dir = path.join(root, rel)
      if (fs.existsSync(dir)) prepend.push(dir)
    }
    tryAdd('bin')
    tryAdd('cr-graph-venv/bin')
    tryAdd('python/bin')

    if (prepend.length === 0) return env

    const basePath = env.PATH || process.env.PATH || ''
    const merged = [...prepend, basePath].filter(Boolean).join(path.delimiter)
    return { ...env, PATH: merged }
  }

  /**
   * Returns the version stamp written by scripts/download-bundled-tools.sh,
   * or null if the bundle is absent. Useful for the Settings panel + crash
   * reports — lets us tell whether a user is running with the pre-bundled
   * toolchain or fell back to PATH discovery.
   */
  getStampInfo(): { path: string; raw: string } | null {
    const root = this.getBundledToolsRoot()
    if (!root) return null
    const stampPath = path.join(root, '.download-stamp.json')
    try {
      const raw = fs.readFileSync(stampPath, 'utf-8')
      return { path: stampPath, raw }
    } catch {
      return null
    }
  }

  // ─── Internals ─────────────────────────────────────────────────────────

  private binIfExecutable(rel: string): string | null {
    const root = this.getBundledToolsRoot()
    if (!root) return null
    const p = path.join(root, rel)
    return this.isExecutable(p) ? p : null
  }

  private isExecutable(p: string): boolean {
    try {
      fs.accessSync(p, fs.constants.X_OK)
      return true
    } catch {
      return false
    }
  }
}

/**
 * Single shared instance — every manager that needs bundled-tools awareness
 * imports `pathManager` instead of constructing its own. Keeps the cache
 * coherent across services.
 */
export const pathManager = new PathManager()
