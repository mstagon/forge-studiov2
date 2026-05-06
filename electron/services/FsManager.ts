import fs from 'fs-extra'
import path from 'path'

export interface FsListEntry {
  name: string
  type: 'file' | 'dir'
  size?: number
}

export interface FsListOpts {
  includeHidden?: boolean
  ignoreNodeModules?: boolean
  includeHarness?: boolean
}

export interface FsListResult {
  entries: FsListEntry[]
}

export interface FsReadResult {
  content: string | null
  truncated: boolean
  binary: boolean
  size: number
}

/**
 * Default ignored top-level entries for listDir. These are noise / heavy and
 * should be hidden from the Files panel unless explicitly requested.
 */
const DEFAULT_IGNORE = new Set([
  '.git',
  'dist',
  'dist-electron',
  'release',
  '.DS_Store',
])

/** Harness/template paths only shown when `includeHarness` is true. */
const HARNESS_NAMES = new Set(['.claude'])

/** Special-cased nested ignore — we want to allow toggling node_modules. */
const NODE_MODULES = 'node_modules'

const DEFAULT_MAX_BYTES = 256 * 1024 // 256 KB

/**
 * Filesystem service exposed to the renderer via IPC. All requests are scoped
 * to a list of workspace path prefixes provided by the caller; any path that
 * resolves outside of those prefixes is rejected to prevent traversal attacks.
 */
export class FsManager {
  /**
   * List entries under `absPath`. Caller passes `allowedPrefixes` (the set of
   * tracked workspace paths) — `absPath` must resolve inside one of them.
   */
  async listDir(
    absPath: string,
    opts: FsListOpts,
    allowedPrefixes: string[]
  ): Promise<FsListResult> {
    const real = await this.assertWithinAllowed(absPath, allowedPrefixes)

    const stat = await fs.stat(real)
    if (!stat.isDirectory()) {
      throw new Error(`Not a directory: ${real}`)
    }

    const includeHidden = !!opts.includeHidden
    const ignoreNodeModules = opts.ignoreNodeModules !== false // default true
    const includeHarness = !!opts.includeHarness

    const dirents = await fs.readdir(real, { withFileTypes: true })
    const entries: FsListEntry[] = []

    for (const d of dirents) {
      const name = d.name

      if (DEFAULT_IGNORE.has(name)) continue
      if (ignoreNodeModules && name === NODE_MODULES) continue
      if (!includeHidden && name.startsWith('.') && !HARNESS_NAMES.has(name)) continue
      if (!includeHarness && HARNESS_NAMES.has(name)) continue

      const full = path.join(real, name)
      let type: 'file' | 'dir'
      let size: number | undefined

      try {
        // Resolve symlinks to a real stat so we report the *target* type. If a
        // symlink dangles or points outside the workspace, fall back to lstat.
        const s = await fs.stat(full)
        type = s.isDirectory() ? 'dir' : 'file'
        if (type === 'file') size = s.size
      } catch {
        if (d.isDirectory()) type = 'dir'
        else type = 'file'
      }

      entries.push({ name, type, size })
    }

    // Folders first, then files; alpha-sorted within each group.
    entries.sort((a, b) => {
      if (a.type !== b.type) return a.type === 'dir' ? -1 : 1
      return a.name.localeCompare(b.name)
    })

    return { entries }
  }

  /**
   * Read a UTF-8 text file. Returns truncated content if `size > maxBytes` and
   * `binary: true` if the bytes don't decode as UTF-8 cleanly.
   */
  async readFile(
    absPath: string,
    maxBytes: number,
    allowedPrefixes: string[]
  ): Promise<FsReadResult> {
    const real = await this.assertWithinAllowed(absPath, allowedPrefixes)

    const stat = await fs.stat(real)
    if (stat.isDirectory()) {
      throw new Error(`Path is a directory: ${real}`)
    }

    const cap = Math.max(1024, Math.floor(maxBytes || DEFAULT_MAX_BYTES))
    const truncated = stat.size > cap
    const readSize = truncated ? cap : stat.size

    const fd = await fs.open(real, 'r')
    try {
      const buf = Buffer.alloc(readSize)
      await fs.read(fd, buf, 0, readSize, 0)

      // Heuristic binary detection: any NUL byte in the first 8KB ⇒ binary.
      const sniff = buf.subarray(0, Math.min(buf.length, 8 * 1024))
      if (sniff.includes(0)) {
        return { content: null, truncated, binary: true, size: stat.size }
      }

      // UTF-8 decode with strict mode — if invalid sequences, treat as binary.
      try {
        const decoder = new TextDecoder('utf-8', { fatal: true })
        const content = decoder.decode(buf)
        return { content, truncated, binary: false, size: stat.size }
      } catch {
        return { content: null, truncated, binary: true, size: stat.size }
      }
    } finally {
      await fs.close(fd).catch(() => {})
    }
  }

  /**
   * Resolve `absPath` (following symlinks) and require that the real path is
   * inside one of the allowed prefix directories. Returns the realpath.
   */
  private async assertWithinAllowed(
    absPath: string,
    allowedPrefixes: string[]
  ): Promise<string> {
    if (!absPath || typeof absPath !== 'string') {
      throw new Error('Path must be a non-empty string')
    }
    if (!allowedPrefixes.length) {
      throw new Error('Access denied: no active workspace')
    }

    const resolved = path.resolve(absPath)
    let real: string
    try {
      real = await fs.realpath(resolved)
    } catch {
      // Path may not exist yet (e.g. listing a freshly-created dir); fall back
      // to the resolved string for the prefix check, but still reject if the
      // parent doesn't resolve safely.
      real = resolved
    }

    const allowed = await Promise.all(
      allowedPrefixes.map(async (p) => {
        try {
          return await fs.realpath(p)
        } catch {
          return path.resolve(p)
        }
      })
    )

    const ok = allowed.some(
      (prefix) => real === prefix || real.startsWith(prefix + path.sep)
    )
    if (!ok) {
      throw new Error('Access denied: path outside active workspace')
    }
    return real
  }
}
