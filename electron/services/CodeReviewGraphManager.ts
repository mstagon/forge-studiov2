import { execFile, spawn, type ChildProcess } from 'child_process'
import { promisify } from 'util'
import fs from 'fs-extra'
import path from 'path'
import os from 'os'
import net from 'net'

const execFileAsync = promisify(execFile)

/**
 * `code-review-graph` is a Python CLI shipped via PyPI. Users may install via
 * pipx, uv tool, or `pip install --user`. This manager:
 *   1. Detects whether the CLI is on PATH (and which install method is most
 *      likely available).
 *   2. Runs a one-shot install when asked (auto-picking pipx > uv > pip).
 *   3. Spawns `build`, `stats`, and `viz` against a workspace and surfaces
 *      progress / output / pid back through IPC.
 *
 * Failure mode: every operation must be graceful. The renderer relies on
 * `installed: false` / null returns / `ok: false` to drive the UI — we never
 * throw across the IPC boundary unless the input is invalid.
 */

export type InstallMethod = 'pipx' | 'pip' | 'uv'

export interface InstallStatus {
  installed: boolean
  version?: string
  method?: InstallMethod
}

export interface InstallResult {
  ok: boolean
  output: string
}

export interface BuildResult {
  ok: boolean
  durationMs: number
  output: string
}

export interface StatsResult {
  nodes: number
  edges: number
  files: number
  languages: string[]
  lastBuiltAt: string | null
}

export interface VizHandle {
  url: string
  pid: number
}

/**
 * Electron apps launched from Finder/Dock on macOS get a stripped PATH that
 * misses Homebrew, pyenv, pipx, uv, etc. Mirror the augmentation
 * HarnessScanner uses so `which code-review-graph` actually finds binaries
 * installed via `pipx install` (`~/.local/bin`) or `uv tool install`
 * (`~/.local/bin` as well).
 */
function augmentedPathEnv(): NodeJS.ProcessEnv {
  const basePath = process.env.PATH || ''
  const extras: string[] = []
  if (os.platform() === 'darwin') {
    extras.push('/opt/homebrew/bin', '/usr/local/bin')
  }
  const home = process.env.HOME || ''
  if (home) {
    extras.push(`${home}/.local/bin`, `${home}/.cargo/bin`)
  }
  const augmented = [...extras, basePath].filter(Boolean).join(path.delimiter)
  return { ...process.env, PATH: augmented }
}

const CLI = 'code-review-graph'
const WHICH = os.platform() === 'win32' ? 'where' : 'which'

/** Pick a free port in [3000, 9000) to avoid stomping on common dev servers. */
async function pickFreePort(): Promise<number> {
  return new Promise((resolve) => {
    const srv = net.createServer()
    srv.unref()
    srv.on('error', () => {
      // Retry once with explicit port — fall back to letting OS pick.
      const fallback = 3000 + Math.floor(Math.random() * 6000)
      resolve(fallback)
    })
    srv.listen(0, '127.0.0.1', () => {
      const addr = srv.address()
      if (addr && typeof addr === 'object') {
        const p = addr.port
        srv.close(() => resolve(p))
      } else {
        srv.close(() => resolve(3000 + Math.floor(Math.random() * 6000)))
      }
    })
  })
}

export class CodeReviewGraphManager {
  /** Active viz spawn handles keyed by pid for stop-by-pid. */
  private vizProcs = new Map<number, ChildProcess>()

  /**
   * Probe `code-review-graph --version`. If the CLI is missing, return
   * `installed: false`. The `method` field is best-effort: we look at the
   * resolved binary path to guess pipx (`/pipx/`) or uv (`/uv/`) — otherwise
   * fall back to `pip`.
   */
  async isInstalled(): Promise<InstallStatus> {
    const env = augmentedPathEnv()
    let resolvedPath: string | null = null
    try {
      const { stdout } = await execFileAsync(WHICH, [CLI], {
        encoding: 'utf-8',
        timeout: 3000,
        env,
      })
      resolvedPath = stdout.split(/\r?\n/).map((s) => s.trim()).find(Boolean) ?? null
    } catch {
      return { installed: false }
    }

    let version: string | undefined
    try {
      const { stdout } = await execFileAsync(CLI, ['--version'], {
        encoding: 'utf-8',
        timeout: 5000,
        env,
      })
      version = stdout.trim() || undefined
    } catch {
      // CLI exists but `--version` failed — still mark as installed so the UI
      // can offer rebuild/upgrade actions.
    }

    let method: InstallMethod | undefined
    if (resolvedPath) {
      if (resolvedPath.includes('/pipx/') || resolvedPath.includes('\\pipx\\')) method = 'pipx'
      else if (resolvedPath.includes('/uv/') || resolvedPath.includes('\\uv\\')) method = 'uv'
      else method = 'pip'
    }

    return { installed: true, version, method }
  }

  /**
   * Install the CLI. When `method` is omitted, auto-pick the best installer
   * present on PATH (pipx > uv > pip). All variants stream stdout+stderr
   * back so the UI can show the install log.
   */
  async install(method?: InstallMethod): Promise<InstallResult> {
    const env = augmentedPathEnv()
    const chosen = method ?? (await this.pickInstallMethod(env))
    if (!chosen) {
      return {
        ok: false,
        output: 'No installer found. Install pipx, uv, or pip first (https://pipx.pypa.io).',
      }
    }

    const [bin, args] = this.installCommand(chosen)
    try {
      const { stdout, stderr } = await execFileAsync(bin, args, {
        encoding: 'utf-8',
        timeout: 5 * 60 * 1000,
        env,
        maxBuffer: 16 * 1024 * 1024,
      })
      return { ok: true, output: `${stdout}\n${stderr}`.trim() }
    } catch (err) {
      const e = err as NodeJS.ErrnoException & { stdout?: string; stderr?: string }
      const out = `${e.stdout ?? ''}\n${e.stderr ?? ''}\n${e.message ?? ''}`.trim()
      return { ok: false, output: out }
    }
  }

  /**
   * Run `code-review-graph build` against `workspacePath`. When `onProgress`
   * is supplied, every line of stdout/stderr is forwarded — useful for the
   * dashboard to show live build logs without polling.
   */
  async build(
    workspacePath: string,
    opts?: { onProgress?: (line: string) => void }
  ): Promise<BuildResult> {
    if (!workspacePath || typeof workspacePath !== 'string') {
      return { ok: false, durationMs: 0, output: 'workspacePath is required' }
    }
    if (!(await fs.pathExists(workspacePath))) {
      return { ok: false, durationMs: 0, output: `workspace not found: ${workspacePath}` }
    }

    const env = augmentedPathEnv()
    const start = Date.now()
    return new Promise<BuildResult>((resolve) => {
      let proc: ChildProcess
      try {
        proc = spawn(CLI, ['build'], { cwd: workspacePath, env })
      } catch (err) {
        resolve({ ok: false, durationMs: 0, output: (err as Error).message })
        return
      }

      const buf: string[] = []
      const onLine = (chunk: Buffer | string) => {
        const text = chunk.toString()
        buf.push(text)
        if (opts?.onProgress) {
          for (const line of text.split(/\r?\n/)) {
            if (line.trim()) opts.onProgress(line)
          }
        }
      }
      proc.stdout?.on('data', onLine)
      proc.stderr?.on('data', onLine)

      proc.on('error', (err) => {
        resolve({
          ok: false,
          durationMs: Date.now() - start,
          output: `${buf.join('')}\n${err.message}`.trim(),
        })
      })
      proc.on('close', (code) => {
        resolve({
          ok: code === 0,
          durationMs: Date.now() - start,
          output: buf.join('').trim(),
        })
      })
    })
  }

  /**
   * Try `code-review-graph stats --json`. If the subcommand doesn't exist
   * (older versions / different schema), fall back to inspecting the on-disk
   * sqlite db's mtime so the UI can at least show "last built at".
   */
  async stats(workspacePath: string): Promise<StatsResult | null> {
    if (!workspacePath || typeof workspacePath !== 'string') return null
    if (!(await fs.pathExists(workspacePath))) return null

    const env = augmentedPathEnv()
    try {
      const { stdout } = await execFileAsync(CLI, ['stats', '--json'], {
        cwd: workspacePath,
        encoding: 'utf-8',
        timeout: 30 * 1000,
        env,
        maxBuffer: 8 * 1024 * 1024,
      })
      const trimmed = stdout.trim()
      if (trimmed) {
        const parsed = JSON.parse(trimmed) as Partial<StatsResult> & Record<string, unknown>
        const built = await this.findDbMtime(workspacePath)
        return {
          nodes: typeof parsed.nodes === 'number' ? parsed.nodes : 0,
          edges: typeof parsed.edges === 'number' ? parsed.edges : 0,
          files: typeof parsed.files === 'number' ? parsed.files : 0,
          languages: Array.isArray(parsed.languages)
            ? parsed.languages.filter((l): l is string => typeof l === 'string')
            : [],
          lastBuiltAt:
            typeof parsed.lastBuiltAt === 'string' ? parsed.lastBuiltAt : built,
        }
      }
    } catch {
      // Either the CLI is missing, the subcommand doesn't exist, or stdout
      // wasn't valid JSON. Fall through to mtime-only fallback below.
    }

    const built = await this.findDbMtime(workspacePath)
    if (!built) return null
    return { nodes: 0, edges: 0, files: 0, languages: [], lastBuiltAt: built }
  }

  /**
   * Spawn `code-review-graph viz --port <port> --no-open` in the background
   * and return the localhost URL + pid. The pid is tracked internally so
   * `stopViz(pid)` can kill it later. If the chosen port is already taken,
   * we retry with a randomly chosen port in 3000-9000.
   */
  async vizUrl(workspacePath: string, port?: number): Promise<VizHandle> {
    if (!workspacePath || typeof workspacePath !== 'string') {
      throw new Error('workspacePath is required')
    }

    const env = augmentedPathEnv()
    const startPort = port && port > 0 ? port : await pickFreePort()

    const proc = spawn(CLI, ['viz', '--port', String(startPort), '--no-open'], {
      cwd: workspacePath,
      env,
      detached: false,
      stdio: ['ignore', 'pipe', 'pipe'],
    })

    if (!proc.pid) {
      throw new Error('Failed to spawn code-review-graph viz')
    }

    this.vizProcs.set(proc.pid, proc)
    proc.on('exit', () => {
      if (proc.pid) this.vizProcs.delete(proc.pid)
    })

    return { url: `http://localhost:${startPort}`, pid: proc.pid }
  }

  /** Best-effort kill — sends SIGTERM. Caller may retry with a new vizUrl. */
  stopViz(pid: number): void {
    if (!Number.isInteger(pid) || pid <= 0) return
    const proc = this.vizProcs.get(pid)
    if (proc) {
      try {
        proc.kill('SIGTERM')
      } catch {
        // Already exited / no permission.
      }
      this.vizProcs.delete(pid)
      return
    }
    // Process not in our tracking map — try anyway (could be a leftover from a
    // previous renderer session) but swallow ESRCH.
    try {
      process.kill(pid, 'SIGTERM')
    } catch {
      // ignore
    }
  }

  /** Disposes every viz process — called on app quit. */
  disposeAll(): void {
    for (const [pid, proc] of this.vizProcs.entries()) {
      try {
        proc.kill('SIGTERM')
      } catch {
        // ignore
      }
      this.vizProcs.delete(pid)
    }
  }

  // ─── Internals ───────────────────────────────────────────────────────

  private async pickInstallMethod(env: NodeJS.ProcessEnv): Promise<InstallMethod | null> {
    const order: InstallMethod[] = ['pipx', 'uv', 'pip']
    for (const m of order) {
      const probe = m === 'pip' ? 'pip3' : m
      try {
        await execFileAsync(WHICH, [probe], { encoding: 'utf-8', timeout: 2000, env })
        return m
      } catch {
        if (m === 'pip') {
          // Fall back to plain `pip` if `pip3` isn't on PATH.
          try {
            await execFileAsync(WHICH, ['pip'], { encoding: 'utf-8', timeout: 2000, env })
            return 'pip'
          } catch {
            // continue
          }
        }
      }
    }
    return null
  }

  private installCommand(method: InstallMethod): [string, string[]] {
    switch (method) {
      case 'pipx':
        return ['pipx', ['install', 'code-review-graph']]
      case 'uv':
        return ['uv', ['tool', 'install', 'code-review-graph']]
      case 'pip':
        // Prefer `pip3 install --user` to avoid touching the system Python.
        return ['pip3', ['install', '--user', 'code-review-graph']]
    }
  }

  /**
   * Locate the build artefact (sqlite db) and return its mtime as ISO. Looks
   * at common locations the CLI uses: `.code-review-graph/db.sqlite`,
   * `.code-review-graph/graph.db`, and a top-level `code-review-graph.db`.
   */
  private async findDbMtime(workspacePath: string): Promise<string | null> {
    const candidates = [
      path.join(workspacePath, '.code-review-graph', 'db.sqlite'),
      path.join(workspacePath, '.code-review-graph', 'graph.db'),
      path.join(workspacePath, '.code-review-graph', 'graph.sqlite'),
      path.join(workspacePath, 'code-review-graph.db'),
    ]
    for (const file of candidates) {
      try {
        const stat = await fs.stat(file)
        return stat.mtime.toISOString()
      } catch {
        // not found — try next
      }
    }
    return null
  }
}
