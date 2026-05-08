/**
 * HookProfiler — append-only profiling log for harness hook executions.
 *
 * Every hook script invocation (skill-injector, mcp-health, learn,
 * cost-tracker, etc.) flows through `recordExecution` which:
 *   1. Appends a single JSONL row to `~/.claude-forge/hook-profiles.jsonl`.
 *   2. Keeps the last N rows in memory for fast `getRecent` / `getStats`.
 *
 * Wrapping helper: `wrap(event, script, fn)` runs `fn`, times it, captures
 * exit code, and forwards the original return value. Use it from electron
 * services that spawn hook scripts so the dashboard gets fresh data
 * without extra plumbing.
 *
 * The JSONL format keeps the on-disk file trivially tail-able from a
 * terminal — each line is a self-contained record:
 *
 *   {"ts":"2025-...","event":"PreToolUse","script":"skill-injector.sh",
 *    "durationMs":42,"exitCode":0,"output":"...truncated..."}
 *
 * Output is truncated to 4 KB per record to avoid runaway files. Older rows
 * are pruned in-memory once the buffer exceeds MAX_BUFFER; the on-disk file
 * is not auto-pruned (operators can rotate manually via `mv`).
 */
import fs from 'fs'
import path from 'path'
import os from 'os'
import { EventEmitter } from 'events'

export interface HookExecutionRecord {
  /** ISO timestamp at which the hook *finished*. */
  ts: string
  /** The hook event name (e.g. `PreToolUse`, `Stop`). */
  event: string
  /** Script path or short name (e.g. `skill-injector.sh`). */
  script: string
  /** Wall-clock execution time in milliseconds. */
  durationMs: number
  /** Process exit code. 0 = success. -1 = failed to spawn. */
  exitCode: number
  /** Trailing stdout/stderr (truncated). */
  output?: string
}

export interface HookStats {
  script: string
  event: string
  calls: number
  successCount: number
  failureCount: number
  avgMs: number
  p95Ms: number
  successRate: number
  lastRunTs: string | null
  lastFailure: HookExecutionRecord | null
}

const MAX_BUFFER = 1000
const MAX_OUTPUT_BYTES = 4 * 1024

function truncateOutput(out: string | undefined): string | undefined {
  if (!out) return undefined
  if (Buffer.byteLength(out, 'utf-8') <= MAX_OUTPUT_BYTES) return out
  return out.slice(0, MAX_OUTPUT_BYTES) + '…[truncated]'
}

function percentile(sorted: number[], p: number): number {
  if (sorted.length === 0) return 0
  const idx = Math.min(sorted.length - 1, Math.ceil((p / 100) * sorted.length) - 1)
  return sorted[Math.max(0, idx)]
}

export class HookProfiler extends EventEmitter {
  private readonly logFile: string
  private buffer: HookExecutionRecord[] = []
  private writeTail: Promise<void> = Promise.resolve()

  constructor(logFile?: string) {
    super()
    this.logFile = logFile ?? path.join(os.homedir(), '.claude-forge', 'hook-profiles.jsonl')
    // Best-effort: pre-load tail of existing log so a freshly launched
    // renderer immediately sees recent history.
    void this.loadTailFromDisk().catch((err) => {
      console.error('[HookProfiler] failed to preload tail:', err)
    })
  }

  /** Read the last N records from disk into the in-memory buffer. */
  private async loadTailFromDisk(): Promise<void> {
    try {
      if (!fs.existsSync(this.logFile)) return
      const raw = await fs.promises.readFile(this.logFile, 'utf-8')
      const lines = raw.split(/\r?\n/).filter((l) => l.trim().length > 0)
      const tail = lines.slice(-MAX_BUFFER)
      const parsed: HookExecutionRecord[] = []
      for (const line of tail) {
        try {
          parsed.push(JSON.parse(line) as HookExecutionRecord)
        } catch {
          // skip corrupt line
        }
      }
      this.buffer = parsed
    } catch {
      // ignore
    }
  }

  recordExecution(record: Omit<HookExecutionRecord, 'ts'> & { ts?: string }): HookExecutionRecord {
    const finalRecord: HookExecutionRecord = {
      ts: record.ts ?? new Date().toISOString(),
      event: record.event,
      script: record.script,
      durationMs: record.durationMs,
      exitCode: record.exitCode,
      output: truncateOutput(record.output),
    }
    this.buffer.push(finalRecord)
    if (this.buffer.length > MAX_BUFFER) {
      this.buffer.splice(0, this.buffer.length - MAX_BUFFER)
    }
    // Append asynchronously, serialized to avoid interleaved writes.
    this.writeTail = this.writeTail.then(() => this.appendToDisk(finalRecord))
    this.emit('record', finalRecord)
    return finalRecord
  }

  private async appendToDisk(record: HookExecutionRecord): Promise<void> {
    try {
      const dir = path.dirname(this.logFile)
      if (!fs.existsSync(dir)) {
        await fs.promises.mkdir(dir, { recursive: true })
      }
      await fs.promises.appendFile(this.logFile, JSON.stringify(record) + '\n', 'utf-8')
    } catch (err) {
      console.error('[HookProfiler] append failed:', err)
    }
  }

  /** Last `limit` records, newest-first. */
  getRecent(limit = 100): HookExecutionRecord[] {
    const slice = this.buffer.slice(-limit)
    return slice.slice().reverse()
  }

  /**
   * Aggregate stats grouped by `script + event`. `window` limits the records
   * considered (newest-first); pass 0 / undefined for all in-memory records.
   */
  getStats(window?: number): HookStats[] {
    const records = window && window > 0 ? this.buffer.slice(-window) : this.buffer.slice()
    const groups = new Map<string, HookExecutionRecord[]>()
    for (const r of records) {
      const key = `${r.script}::${r.event}`
      const arr = groups.get(key)
      if (arr) arr.push(r)
      else groups.set(key, [r])
    }
    const out: HookStats[] = []
    for (const [, list] of groups) {
      if (list.length === 0) continue
      const durations = list.map((r) => r.durationMs).sort((a, b) => a - b)
      const successList = list.filter((r) => r.exitCode === 0)
      const failureList = list.filter((r) => r.exitCode !== 0)
      const avg = durations.reduce((a, b) => a + b, 0) / durations.length
      const lastFailure = failureList.length > 0 ? failureList[failureList.length - 1] : null
      const last = list[list.length - 1]
      out.push({
        script: last.script,
        event: last.event,
        calls: list.length,
        successCount: successList.length,
        failureCount: failureList.length,
        avgMs: Math.round(avg),
        p95Ms: percentile(durations, 95),
        successRate: list.length === 0 ? 0 : successList.length / list.length,
        lastRunTs: last.ts,
        lastFailure,
      })
    }
    // Sort: most-called first.
    return out.sort((a, b) => b.calls - a.calls)
  }

  /**
   * Wrap a hook execution. The provided `runner` returns an exit code (and
   * optional output); this method records the duration plus the exit code.
   * Errors thrown by `runner` are recorded with exitCode = -1 and re-thrown.
   */
  async wrap(
    event: string,
    script: string,
    runner: () => Promise<{ exitCode: number; output?: string }>,
  ): Promise<{ exitCode: number; output?: string }> {
    const started = Date.now()
    try {
      const res = await runner()
      this.recordExecution({
        event,
        script,
        durationMs: Date.now() - started,
        exitCode: res.exitCode,
        output: res.output,
      })
      return res
    } catch (err) {
      this.recordExecution({
        event,
        script,
        durationMs: Date.now() - started,
        exitCode: -1,
        output: err instanceof Error ? err.message : String(err),
      })
      throw err
    }
  }
}
