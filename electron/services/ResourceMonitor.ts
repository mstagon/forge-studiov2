/**
 * ResourceMonitor — system-level snapshot used by the WorkspaceV2 ResourceBar.
 *
 * Collects four numbers, all best-effort:
 *   - cpu        : aggregate %CPU summed across all processes (macOS: ps)
 *   - memUsed    : GB of memory in use (macOS: vm_stat * pagesize)
 *   - memTotal   : GB of installed memory (macOS: sysctl hw.memsize)
 *   - diskDeltaGb: GB consumed by the workspace path since baseline (du)
 *   - ptyCount   : live PTY instances tracked by PtyManager
 *
 * Snapshots are cached for `cacheMs` (default 5s) to keep the IPC cheap when
 * multiple components subscribe. Every numeric is finite — failures degrade
 * to 0 so the renderer never has to defend against NaN.
 *
 * Non-darwin platforms get zeros (we still return a well-formed snapshot).
 */
import os from 'os'
import path from 'path'
import { execFile } from 'child_process'
import { promisify } from 'util'

const execFileAsync = promisify(execFile)

export interface ResourceSnapshot {
  cpu: number
  memUsed: number
  memTotal: number
  diskDeltaGb: number
  ptyCount: number
  /** Unix ms when the snapshot was assembled. */
  ts: number
}

export interface ResourceMonitorOptions {
  /** ms a snapshot stays cached before the next full poll. */
  cacheMs?: number
  /** PTY count provider — wired to PtyManager.activeCount() in main. */
  getPtyCount: () => number
  /** Workspace path used for `du -sk` measurement (optional). */
  getWorkspacePath?: () => string | null
}

export class ResourceMonitor {
  private cache: ResourceSnapshot | null = null
  private inflight: Promise<ResourceSnapshot> | null = null
  private cacheMs: number
  private getPtyCount: () => number
  private getWorkspacePath?: () => string | null
  /**
   * First measured "du" of the workspace path — diskDeltaGb is reported as
   * `current - baseline` so the bar shows growth attributable to runs, not
   * the absolute repo size which is noisy.
   */
  private duBaselineKb: number | null = null

  constructor(opts: ResourceMonitorOptions) {
    this.cacheMs = opts.cacheMs ?? 5000
    this.getPtyCount = opts.getPtyCount
    this.getWorkspacePath = opts.getWorkspacePath
  }

  async getSnapshot(): Promise<ResourceSnapshot> {
    const now = Date.now()
    if (this.cache && now - this.cache.ts < this.cacheMs) {
      return this.cache
    }
    if (this.inflight) return this.inflight
    this.inflight = this.collect()
      .then((snap) => {
        this.cache = snap
        this.inflight = null
        return snap
      })
      .catch((err) => {
        this.inflight = null
        throw err
      })
    return this.inflight
  }

  private async collect(): Promise<ResourceSnapshot> {
    const [cpu, mem, diskDeltaGb] = await Promise.all([
      this.cpuPercent(),
      this.memSnapshot(),
      this.workspaceDiskDeltaGb(),
    ])
    let ptyCount = 0
    try {
      const n = this.getPtyCount()
      if (Number.isFinite(n)) ptyCount = n
    } catch {
      ptyCount = 0
    }
    return {
      cpu: Number.isFinite(cpu) ? cpu : 0,
      memUsed: Number.isFinite(mem.used) ? mem.used : 0,
      memTotal: Number.isFinite(mem.total) ? mem.total : 0,
      diskDeltaGb: Number.isFinite(diskDeltaGb) ? diskDeltaGb : 0,
      ptyCount,
      ts: Date.now(),
    }
  }

  /**
   * Aggregate %CPU across all user processes via `ps`. macOS-friendly. On
   * non-darwin we read os.loadavg() / cpus().length as a coarse proxy so the
   * bar still moves rather than sitting at 0.
   */
  private async cpuPercent(): Promise<number> {
    if (os.platform() !== 'darwin') {
      const [load1] = os.loadavg()
      const n = os.cpus().length || 1
      return Math.min(100, Math.max(0, (load1 / n) * 100))
    }
    try {
      const { stdout } = await execFileAsync(
        '/bin/sh',
        ['-c', "ps -A -o %cpu | awk 'NR>1 {s+=$1} END {print s+0}'"],
        { timeout: 4000 },
      )
      const v = Number(stdout.trim())
      if (!Number.isFinite(v)) return 0
      // ps reports per-core (so a 4-core box can hit 400%). Normalise to a
      // 0..100 scale by dividing by core count — matches what users expect
      // from Activity Monitor's "CPU usage" line.
      const cores = os.cpus().length || 1
      return Math.min(100, Math.max(0, v / cores))
    } catch {
      return 0
    }
  }

  /** Returns { used, total } in GB. */
  private async memSnapshot(): Promise<{ used: number; total: number }> {
    const total = os.totalmem() / 1024 ** 3
    if (os.platform() !== 'darwin') {
      const used = (os.totalmem() - os.freemem()) / 1024 ** 3
      return { used, total }
    }
    try {
      // vm_stat reports pages; pagesize is in the header line.
      const { stdout } = await execFileAsync('/usr/bin/vm_stat', [], { timeout: 3000 })
      const lines = stdout.split('\n')
      const header = lines[0] ?? ''
      const pageSizeMatch = header.match(/page size of (\d+) bytes/)
      const pageSize = pageSizeMatch ? Number(pageSizeMatch[1]) : 4096
      const stats = new Map<string, number>()
      for (const line of lines.slice(1)) {
        const m = line.match(/^"?([^"]+?)"?:\s+(\d+)\.?\s*$/)
        if (m) stats.set(m[1].trim(), Number(m[2]))
      }
      const wired = stats.get('Pages wired down') ?? 0
      const active = stats.get('Pages active') ?? 0
      const compressed = stats.get('Pages occupied by compressor') ?? 0
      // App memory ≈ wired + active + compressed (matches Activity Monitor).
      const usedBytes = (wired + active + compressed) * pageSize
      return { used: usedBytes / 1024 ** 3, total }
    } catch {
      const used = (os.totalmem() - os.freemem()) / 1024 ** 3
      return { used, total }
    }
  }

  /**
   * Disk growth (GB) of the active workspace path since first poll. Uses
   * `du -sk` — fast on warm caches, capped with a generous timeout. When no
   * workspace is set we return 0.
   */
  private async workspaceDiskDeltaGb(): Promise<number> {
    if (!this.getWorkspacePath) return 0
    let p: string | null
    try {
      p = this.getWorkspacePath()
    } catch {
      return 0
    }
    if (!p) return 0
    try {
      const safe = path.resolve(p)
      const { stdout } = await execFileAsync('/usr/bin/du', ['-sk', safe], { timeout: 8000 })
      const kb = Number(stdout.split(/\s+/)[0])
      if (!Number.isFinite(kb)) return 0
      if (this.duBaselineKb === null) {
        this.duBaselineKb = kb
        return 0
      }
      const deltaKb = Math.max(0, kb - this.duBaselineKb)
      return deltaKb / 1024 / 1024 // KB → GB
    } catch {
      return 0
    }
  }

  /** Reset the disk baseline — useful when the active workspace switches. */
  resetDiskBaseline(): void {
    this.duBaselineKb = null
    this.cache = null
  }
}
