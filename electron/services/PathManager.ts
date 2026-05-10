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
   * Tracks whether ensureVenvUsable has run successfully in this process so
   * the (cheap but non-trivial) repair check fires at most once per launch
   * regardless of how many callers ask for getCrGraphCli.
   */
  private venvFixupChecked = false

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
   *
   * As a side-effect on the *first* call per process, runs ensureVenvUsable
   * to repair stale absolute paths shipped by older builds. Subsequent calls
   * are O(1) thanks to the memoised flag.
   */
  getCrGraphCli(): string | null {
    if (!this.venvFixupChecked) {
      this.venvFixupChecked = true
      try {
        this.ensureVenvUsable()
      } catch (err) {
        // Repair is best-effort — never block CLI lookup. The fallback path
        // (manager probes --version and surfaces a friendly error) still
        // works even if we couldn't fix anything.
        console.warn('[PathManager] ensureVenvUsable failed:', err)
      }
    }
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

    // forge-team CLI — packaged 환경에서 bundled-tools 의 sibling 경로
    // (Resources/forge-cli/bin). 메인 세션이 shell 에서 forge-team 호출
    // 가능하려면 이 경로가 PATH 에 들어가야 함. v0.9.2 fix — 이전엔
    // PATH 에 없어서 "command not found" 으로 핵심 시나리오가 막혔음.
    try {
      const cliBin = path.resolve(root, '..', 'forge-cli', 'bin')
      if (fs.existsSync(cliBin)) prepend.push(cliBin)
    } catch {
      // ignore — dev 환경 등에서는 root 가 없거나 layout 다름
    }

    // dev 환경 (npm run dev / electron:dev) 의 forge-cli/bin — 레포의 bin/
    try {
      const repoBin = path.resolve(__dirname, '..', '..', 'bin')
      if (fs.existsSync(path.join(repoBin, 'forge-team'))) prepend.push(repoBin)
    } catch {
      // ignore
    }

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

  /**
   * First-run / per-version repair of the bundled cr-graph venv.
   *
   * Why we need this:
   *   The DMG ships a venv whose console scripts (`code-review-graph`, etc.)
   *   may have been built with absolute paths baked in by older builds of
   *   `scripts/build-cr-graph-venv.sh`. Specifically:
   *     1. `bin/python` may be an absolute symlink pointing at the build-host
   *        path (e.g. `/Users/<ci-runner>/.../python/bin/python3.12`).
   *     2. The polyglot bash exec line in console scripts may reference the
   *        same dead absolute path.
   *   Both cause every `code-review-graph` invocation to die with
   *   "no such file or directory" once the user installs Forge Studio.
   *
   * What we do:
   *   - Detect (a) absolute python symlinks, (b) absolute polyglot exec
   *     paths in console scripts.
   *   - Rewrite them to the *runtime* layout: relative symlink
   *     `../../python/bin/python3.12` and a bash wrapper that derives
   *     `bin/python` from `$(dirname "$0")`.
   *   - Persist a flag file in Application Support so we don't redo the work
   *     on every launch.
   *
   * Idempotent: safe to call repeatedly; a no-op when the venv is already
   * portable. Returns true when at least one file was repaired.
   */
  ensureVenvUsable(workspacePath?: string): boolean {
    void workspacePath
    const root = this.getBundledToolsRoot()
    if (!root) return false

    const venvDir = path.join(root, 'cr-graph-venv')
    const binDir = path.join(venvDir, 'bin')
    if (!fs.existsSync(binDir)) return false

    // Cache key: bundled-tools mtime + Forge version. If either changes
    // (e.g. user installs a new Forge build) we re-run the repair.
    const flagPath = this.repairFlagPath()
    const cacheKey = this.venvCacheKey(venvDir)
    if (flagPath && cacheKey) {
      try {
        const prev = fs.readFileSync(flagPath, 'utf-8').trim()
        if (prev === cacheKey) return false
      } catch {
        // Missing/corrupt flag — fall through and re-run repair.
      }
    }

    let repaired = false

    // ─── (a) Repair python / python3 / python3.12 symlinks ──────────────
    // We unconditionally point the python symlink at the sibling
    // `python/bin/python3.12`. If the link target is already a relative
    // path of that form we skip the rewrite to avoid touching the inode.
    const pythonReal = '../../python/bin/python3.12'
    for (const name of ['python3.12', 'python3', 'python']) {
      const linkPath = path.join(binDir, name)
      let needsRewrite = true
      try {
        const st = fs.lstatSync(linkPath)
        if (st.isSymbolicLink()) {
          const tgt = fs.readlinkSync(linkPath)
          // Anything starting with `/` is an absolute path → broken in DMG.
          // The relative `../../python/bin/python3.12` (or its aliases) is
          // what we want.
          if (!path.isAbsolute(tgt) && tgt.length > 0) {
            needsRewrite = false
          }
        }
      } catch {
        // Missing link — we'll create one fresh.
      }
      if (!needsRewrite) continue
      try {
        // The actual interpreter lives at python3.12; aliases are local.
        const target = name === 'python3.12' ? pythonReal : 'python3.12'
        try {
          fs.unlinkSync(linkPath)
        } catch {
          // ignore — link may not exist yet
        }
        fs.symlinkSync(target, linkPath)
        repaired = true
      } catch (err) {
        console.warn(`[PathManager] failed to relink ${linkPath}:`, err)
      }
    }

    // ─── (b) Repair console-script polyglot exec lines ──────────────────
    // Scan every executable file in bin/ that begins with `#!`. If line 2
    // is the uv-style polyglot `'''exec' '<abs path>' "$0" "$@"`, rewrite
    // it to derive `bin/python` from $(dirname "$0"). We *must not* touch
    // scripts that already have the portable form — repeated rewrites
    // would inflate the file with stacked headers.
    let entries: string[] = []
    try {
      entries = fs.readdirSync(binDir)
    } catch {
      entries = []
    }
    const portableHeader =
      '#!/usr/bin/env bash\n' +
      '\'\'\'exec\' "$(cd "$(dirname "$0")" && pwd)/python" "$0" "$@"\n' +
      '\' \'\'\'\n'

    for (const name of entries) {
      const p = path.join(binDir, name)
      let st: fs.Stats
      try {
        st = fs.lstatSync(p)
      } catch {
        continue
      }
      if (st.isSymbolicLink() || !st.isFile()) continue

      let data: Buffer
      try {
        data = fs.readFileSync(p)
      } catch {
        continue
      }
      if (!data.length || data[0] !== 0x23 /* '#' */ || data[1] !== 0x21 /* '!' */) continue

      // Decode the head conservatively (latin-1 keeps byte fidelity).
      const head = data.toString('latin1').split('\n', 4)
      if (head.length < 3) continue

      const line0 = head[0]
      const line1 = head[1] ?? ''
      const line2 = head[2] ?? ''

      // Already portable? Bash shebang + relative bash exec? skip.
      const alreadyPortable =
        line0 === '#!/usr/bin/env bash' &&
        line1.includes('$(dirname "$0")') &&
        line1.includes('/python')
      if (alreadyPortable) continue

      // uv polyglot pattern: `'''exec' '<abs>' "$0" "$@"` then `' '''`
      const polyglotExecAbs =
        /^\s*'''exec'\s+'\/[^']+'\s+"\$0"\s+"\$@"\s*$/.test(line1) &&
        /^'\s+'''\s*$/.test(line2)

      // Plain absolute shebang `#!/abs/.../python`
      const plainAbsShebang =
        line0.startsWith('#!') &&
        line0.length > 2 &&
        line0[2] === '/' &&
        !line0.includes('/usr/bin/env')

      if (!polyglotExecAbs && !plainAbsShebang) continue

      const lines = data.toString('latin1').split('\n')
      let body: string
      if (polyglotExecAbs) {
        body = lines.slice(3).join('\n')
      } else {
        // Strip the absolute shebang only; keep the rest of the body so the
        // python interpreter still parses its module. The bash wrapper will
        // re-exec into bin/python with this same file as $0, and python's
        // own parser will skip the leading bash polyglot lines (they're a
        // triple-quoted string from python's POV).
        body = lines.slice(1).join('\n')
      }
      const next = Buffer.from(portableHeader + body, 'latin1')
      try {
        fs.writeFileSync(p, next)
        fs.chmodSync(p, 0o755)
        repaired = true
      } catch (err) {
        console.warn(`[PathManager] failed to rewrite ${p}:`, err)
      }
    }

    // ─── Persist cache key so we don't repeat work next launch ──────────
    if (flagPath && cacheKey) {
      try {
        fs.mkdirSync(path.dirname(flagPath), { recursive: true })
        fs.writeFileSync(flagPath, cacheKey, 'utf-8')
      } catch (err) {
        console.warn('[PathManager] could not persist repair flag:', err)
      }
    }

    return repaired
  }

  // ─── Internals ─────────────────────────────────────────────────────────

  /**
   * Path to the per-user flag file recording the last repaired venv version.
   * Stored under Electron's userData (Application Support on macOS) so a
   * fresh install of Forge wipes it and re-runs the repair on first launch.
   */
  private repairFlagPath(): string | null {
    try {
      const userData = app.getPath('userData')
      return path.join(userData, 'cr-graph-venv-repair.flag')
    } catch {
      // app.getPath fails before app is ready in tests — caller treats null
      // as "no caching, re-run on every call" which is still correct.
      return null
    }
  }

  /**
   * Build a stable cache key that changes whenever the venv contents
   * change (i.e. a new Forge build was installed). We use the mtime of
   * `cr-graph-venv/bin/code-review-graph` because every fresh build
   * regenerates that file — combined with Forge's own version string this
   * is enough to detect "new install, re-run repair".
   */
  private venvCacheKey(venvDir: string): string | null {
    try {
      const cli = path.join(venvDir, 'bin', 'code-review-graph')
      const st = fs.statSync(cli)
      const ver = app.getVersion?.() ?? 'unknown'
      return `${ver}:${Math.floor(st.mtimeMs)}:${st.size}`
    } catch {
      return null
    }
  }

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
