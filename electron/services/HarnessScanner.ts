import fs from 'fs-extra'
import path from 'path'
import os from 'os'
import { execFileSync, spawn } from 'child_process'
import type { HookProfiler } from './HookProfiler'

/**
 * Electron apps launched from Finder / Dock on macOS inherit a minimal PATH
 * (roughly `/usr/bin:/bin:/usr/sbin:/sbin`), which misses Homebrew, pyenv,
 * nvm, uv, fvm, etc. MCP servers almost always use `npx`/`uvx`/`python3`/etc,
 * so every `which` probe reports "unavailable" unless we augment PATH the
 * same way PtyManager does before spawning the shell.
 */
function augmentedPathEnv(): NodeJS.ProcessEnv {
  const basePath = process.env.PATH || ''
  const extras: string[] = []
  if (os.platform() === 'darwin') {
    extras.push('/opt/homebrew/bin', '/usr/local/bin')
    const home = process.env.HOME || ''
    if (home) {
      extras.push(`${home}/.local/bin`, `${home}/.cargo/bin`)
    }
  }
  const augmented = [...extras, basePath].filter(Boolean).join(':')
  return { ...process.env, PATH: augmented }
}

export interface HarnessInfo {
  agents: { name: string; file: string }[]
  skills: { name: string; file: string }[]
  commands: { name: string; file: string }[]
  scripts: { name: string; file: string }[]
  rules: { name: string; file: string }[]
  mcpServers: { name: string; enabled: boolean; type: string }[]
  hooks: Record<string, number>
}

// ─── Detail item shapes for the Library tabs ──────────────────────────
//
// Kept loose intentionally — the renderer's LibraryData seed types carry many
// extra UI-only fields (color, runs, lastUsed, etc.). The wired adapter
// (src/components/v2/wired/LibraryWired.tsx) maps these scanner shapes onto
// LibAgent / LibSkill / LibCommand / LibHook with sensible UI defaults.

export interface ScannedAgent {
  /** Filename stem (e.g. `code-reviewer`). */
  id: string
  /** YAML frontmatter `name`, falls back to id. */
  name: string
  /** YAML frontmatter `description`. */
  description: string
  /** YAML frontmatter `tools` (raw string — comma-separated). */
  tools: string
  /** YAML frontmatter `model`. */
  model: string
  /** First ~200 chars of the body (after the closing `---`). */
  preview: string
  file: string
}

export interface ScannedSkill {
  /** Directory name (e.g. `api-contract`). */
  id: string
  name: string
  description: string
  /** YAML frontmatter `globs` / `files` (raw string). */
  globs: string
  /** Body line count (excluding frontmatter). */
  lines: number
  file: string
}

export interface ScannedCommand {
  /** Filename stem (e.g. `agent-team`). */
  id: string
  name: string
  description: string
  /** First non-empty body line — useful as a one-liner summary. */
  firstLine: string
  file: string
}

export interface ScannedHook {
  /** Stable id for renderer keys: `<event>:<index>`. */
  id: string
  /** Hook event (SessionStart, PreToolUse, PostToolUse, Stop, ...). */
  event: string
  /** Optional matcher string from settings.json (Bash, Write|Edit, ...). */
  matcher: string
  /** Single-line summary of the command (first 200 chars). */
  command: string
  /** The full command (may be multi-line). */
  fullCommand: string
  /** Best-effort enabled flag — true unless explicitly `disabled: true`. */
  enabled: boolean
}

export interface ScannedComposition {
  id: string
  name: string
  description: string
  members: string[]
  file: string
}

interface Frontmatter {
  data: Record<string, string>
  body: string
}

/**
 * Minimal frontmatter parser. Reads the first `---` ... `---` block and splits
 * each line on the first `:`. Avoids a gray-matter dep — Claude Code agent /
 * skill files use a flat key/value structure that line-splitting handles
 * correctly.
 */
function parseFrontmatter(raw: string): Frontmatter {
  const lines = raw.split(/\r?\n/)
  if (lines[0]?.trim() !== '---') {
    return { data: {}, body: raw }
  }
  const data: Record<string, string> = {}
  let i = 1
  for (; i < lines.length; i++) {
    const line = lines[i]
    if (line.trim() === '---') {
      i++
      break
    }
    const colon = line.indexOf(':')
    if (colon === -1) continue
    const key = line.slice(0, colon).trim()
    let value = line.slice(colon + 1).trim()
    // Strip surrounding quotes if present.
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1)
    }
    if (key) data[key] = value
  }
  return { data, body: lines.slice(i).join('\n') }
}

function previewBody(body: string, max = 200): string {
  const trimmed = body.trim().replace(/\s+/g, ' ')
  return trimmed.length > max ? trimmed.slice(0, max) + '…' : trimmed
}

function firstNonEmptyLine(body: string): string {
  for (const line of body.split(/\r?\n/)) {
    const t = line.trim()
    if (t) return t
  }
  return ''
}

// ─── Path-traversal defence ───────────────────────────────────────────
//
// All write operations route through `assertWithinClaude` to make sure the
// resolved target stays inside `<workspacePath>/.claude`. We rely on `path.resolve`
// + a prefix check; fs.realpath isn't usable for not-yet-existent files.

function isPathInside(child: string, parent: string): boolean {
  const c = path.resolve(child)
  const p = path.resolve(parent)
  if (c === p) return true
  return c.startsWith(p + path.sep)
}

function assertSafeName(name: string): void {
  if (!name || typeof name !== 'string') {
    throw new Error('Name is required')
  }
  if (name.length > 80) throw new Error('Name too long')
  // Conservative slug: letters, digits, dash, underscore, dot. No path separators.
  if (!/^[a-zA-Z0-9._-]+$/.test(name)) {
    throw new Error(`Invalid name "${name}" — only [A-Za-z0-9._-] allowed`)
  }
  if (name === '.' || name === '..' || name.startsWith('.')) {
    // Allow normal dots in middle but disallow leading dot (no hidden files)
    if (name.startsWith('.')) {
      throw new Error('Name cannot start with "."')
    }
  }
}

function assertClaudeChild(workspacePath: string, target: string): string {
  const claudeDir = path.resolve(workspacePath, '.claude')
  const resolved = path.resolve(target)
  if (!isPathInside(resolved, claudeDir)) {
    throw new Error('Access denied: target is outside the workspace .claude directory')
  }
  return resolved
}

// ─── Frontmatter writer ────────────────────────────────────────────────
//
// Mirrors the tiny parser above. We escape only the values that contain a
// colon, hash, or quote — everything else is written raw to keep diffs small
// and human-readable.

function writeFrontmatter(data: Record<string, string | undefined>, body: string): string {
  const lines: string[] = ['---']
  for (const [key, value] of Object.entries(data)) {
    if (value === undefined || value === null) continue
    const v = String(value)
    if (!v) continue
    const needsQuote = /[:#"']/.test(v) || v.startsWith(' ') || v.endsWith(' ')
    lines.push(`${key}: ${needsQuote ? JSON.stringify(v) : v}`)
  }
  lines.push('---')
  lines.push('')
  return lines.join('\n') + (body.startsWith('\n') ? body : '\n' + body)
}

// ─── Trash policy ──────────────────────────────────────────────────────
//
// Soft-delete moves files under `.claude/.trash/<kind>/<name>.<ts>.<ext>`.
// The user can restore manually. We do NOT auto-purge — that's an explicit
// user action.

async function moveToTrash(
  workspacePath: string,
  kind: 'agents' | 'skills' | 'commands',
  source: string,
  displayName: string
): Promise<string> {
  const trashDir = assertClaudeChild(
    workspacePath,
    path.join(workspacePath, '.claude', '.trash', kind)
  )
  await fs.ensureDir(trashDir)
  const ts = new Date().toISOString().replace(/[:.]/g, '-')
  const ext = path.extname(source) || ''
  const target = path.join(trashDir, `${displayName}.${ts}${ext}`)
  await fs.move(source, target, { overwrite: false })
  return target
}

// ─── settings.json / mcp.json read-modify-write helpers ────────────────

async function readJsonSafe<T>(file: string, fallback: T): Promise<T> {
  if (!(await fs.pathExists(file))) return fallback
  try {
    const raw = await fs.readFile(file, 'utf-8')
    return JSON.parse(raw) as T
  } catch {
    return fallback
  }
}

async function writeJsonAtomic(file: string, data: unknown): Promise<void> {
  await fs.ensureDir(path.dirname(file))
  const tmp = file + '.tmp'
  await fs.writeFile(tmp, JSON.stringify(data, null, 2) + '\n', 'utf-8')
  await fs.move(tmp, file, { overwrite: true })
}

// ─── Authoring shapes (input/output for IPC) ──────────────────────────

export interface AgentCreateOpts {
  name: string
  description?: string
  tools?: string
  model?: string
  body?: string
}

export interface SkillCreateOpts {
  name: string
  description?: string
  globs?: string
  body?: string
}

export interface CommandCreateOpts {
  name: string
  description?: string
  argHint?: string
  body?: string
}

export interface HookSpec {
  matcher?: string
  command: string
  type?: string
  timeout?: number
  disabled?: boolean
}

export interface McpServerSpec {
  command?: string
  args?: string[]
  env?: Record<string, string>
  type?: 'stdio' | 'http' | 'sse'
  url?: string
  disabled?: boolean
}

/**
 * Drop empty / undefined fields from a server spec so the on-disk JSON stays
 * tidy. We never write an empty object — the IPC layer rejects malformed
 * input upstream.
 */
function sanitizeMcp(spec: McpServerSpec): Record<string, unknown> {
  const out: Record<string, unknown> = {}
  if (spec.type) out.type = spec.type
  if (spec.command) out.command = spec.command
  if (Array.isArray(spec.args) && spec.args.length > 0) out.args = spec.args.slice()
  if (spec.env && Object.keys(spec.env).length > 0) {
    out.env = { ...spec.env }
  }
  if (spec.url) out.url = spec.url
  if (spec.disabled) out.disabled = true
  return out
}

/** A single concatenated chunk of the preview session context. */
export interface SessionPreviewSection {
  kind: 'claude-md' | 'rule' | 'hook'
  /** Human-readable label rendered in the UI accordion header. */
  label: string
  /** Absolute file path the section was sourced from. */
  file: string
  /** Verbatim text — the renderer is in charge of any code-block styling. */
  content: string
  /** True when the section is a placeholder for a missing file. */
  missing?: boolean
}

export interface SessionPreview {
  sections: SessionPreviewSection[]
  /** Sum of `content.length` across all sections — quick cost proxy. */
  totalChars: number
  /** Rough token estimate (chars / 4) — Anthropic's documented heuristic. */
  tokenEstimate: number
}

export class HarnessScanner {
  /**
   * Optional profiler — when present, MCP `which` probes are timed and
   * recorded so the Hook profiling dashboard can show per-server liveness
   * latency. Wired from electron/main via `setProfiler()`.
   */
  private profiler: HookProfiler | null = null

  setProfiler(profiler: HookProfiler | null): void {
    this.profiler = profiler
  }

  async scan(workspacePath: string): Promise<HarnessInfo> {
    const claudeDir = path.join(workspacePath, '.claude')
    const info: HarnessInfo = {
      agents: [],
      skills: [],
      commands: [],
      scripts: [],
      rules: [],
      mcpServers: [],
      hooks: {},
    }

    if (!await fs.pathExists(claudeDir)) return info

    // Scan agents
    const agentsDir = path.join(claudeDir, 'agents')
    if (await fs.pathExists(agentsDir)) {
      const files = await fs.readdir(agentsDir)
      info.agents = files
        .filter((f) => f.endsWith('.md'))
        .map((f) => ({ name: f.replace('.md', ''), file: path.join(agentsDir, f) }))
    }

    // Scan skills
    const skillsDir = path.join(claudeDir, 'skills')
    if (await fs.pathExists(skillsDir)) {
      const dirs = await fs.readdir(skillsDir)
      for (const d of dirs) {
        const skillFile = path.join(skillsDir, d, 'SKILL.md')
        if (await fs.pathExists(skillFile)) {
          info.skills.push({ name: d, file: skillFile })
        }
      }
    }

    // Scan commands
    const commandsDir = path.join(claudeDir, 'commands')
    if (await fs.pathExists(commandsDir)) {
      const files = await fs.readdir(commandsDir)
      info.commands = files
        .filter((f) => f.endsWith('.md'))
        .map((f) => ({ name: f.replace('.md', ''), file: path.join(commandsDir, f) }))
    }

    // Scan scripts
    const scriptsDir = path.join(claudeDir, 'scripts')
    if (await fs.pathExists(scriptsDir)) {
      const files = await fs.readdir(scriptsDir)
      info.scripts = files
        .filter((f) => f.endsWith('.sh'))
        .map((f) => ({ name: f.replace('.sh', ''), file: path.join(scriptsDir, f) }))
    }

    // Scan rules
    const rulesDir = path.join(claudeDir, 'rules')
    if (await fs.pathExists(rulesDir)) {
      const scanRules = async (dir: string): Promise<{ name: string; file: string }[]> => {
        const results: { name: string; file: string }[] = []
        const entries = await fs.readdir(dir, { withFileTypes: true })
        for (const entry of entries) {
          const full = path.join(dir, entry.name)
          if (entry.isDirectory()) {
            results.push(...await scanRules(full))
          } else if (entry.name.endsWith('.md')) {
            results.push({ name: entry.name.replace('.md', ''), file: full })
          }
        }
        return results
      }
      info.rules = await scanRules(rulesDir)
    }

    // Scan MCP servers
    const mcpFile = path.join(claudeDir, 'mcp.json')
    if (await fs.pathExists(mcpFile)) {
      try {
        const mcpConfig = JSON.parse(await fs.readFile(mcpFile, 'utf-8'))
        const servers = mcpConfig.mcpServers || {}
        info.mcpServers = Object.entries(servers).map(([name, config]: [string, any]) => ({
          name,
          enabled: !(config.disabled),
          type: config.type || 'stdio',
        }))
      } catch {
        // Invalid JSON
      }
    }

    // Scan hooks from settings.json
    const settingsFile = path.join(claudeDir, 'settings.json')
    if (await fs.pathExists(settingsFile)) {
      try {
        const settings = JSON.parse(await fs.readFile(settingsFile, 'utf-8'))
        const hooks = settings.hooks || {}
        for (const [event, rules] of Object.entries(hooks)) {
          info.hooks[event] = Array.isArray(rules) ? rules.length : 0
        }
      } catch {
        // Invalid JSON
      }
    }

    return info
  }

  async readFile(filePath: string): Promise<string> {
    try {
      return await fs.readFile(filePath, 'utf-8')
    } catch {
      return ''
    }
  }

  // ─── Detail listings (Library tabs) ────────────────────────────────

  async listAgents(workspacePath: string): Promise<ScannedAgent[]> {
    const dir = path.join(workspacePath, '.claude', 'agents')
    if (!await fs.pathExists(dir)) return []
    const files = (await fs.readdir(dir)).filter((f) => f.endsWith('.md'))
    const out: ScannedAgent[] = []
    for (const f of files) {
      const file = path.join(dir, f)
      try {
        const raw = await fs.readFile(file, 'utf-8')
        const { data, body } = parseFrontmatter(raw)
        const id = f.replace(/\.md$/, '')
        out.push({
          id,
          name: data.name || id,
          description: data.description || '',
          tools: data.tools || '',
          model: data.model || '',
          preview: previewBody(body),
          file,
        })
      } catch {
        // Skip unreadable files — keep the rest of the list usable.
      }
    }
    return out.sort((a, b) => a.name.localeCompare(b.name))
  }

  async listSkills(workspacePath: string): Promise<ScannedSkill[]> {
    const dir = path.join(workspacePath, '.claude', 'skills')
    if (!await fs.pathExists(dir)) return []
    const dirs = await fs.readdir(dir)
    const out: ScannedSkill[] = []
    for (const d of dirs) {
      const file = path.join(dir, d, 'SKILL.md')
      if (!await fs.pathExists(file)) continue
      try {
        const raw = await fs.readFile(file, 'utf-8')
        const { data, body } = parseFrontmatter(raw)
        const lines = body.split(/\r?\n/).filter((l) => l.trim().length > 0).length
        out.push({
          id: d,
          name: data.name || d,
          description: data.description || '',
          // Skills use either `globs` or `files` for the pattern list.
          globs: data.globs || data.files || '',
          lines,
          file,
        })
      } catch {
        // Skip
      }
    }
    return out.sort((a, b) => a.name.localeCompare(b.name))
  }

  async listCommands(workspacePath: string): Promise<ScannedCommand[]> {
    const dir = path.join(workspacePath, '.claude', 'commands')
    if (!await fs.pathExists(dir)) return []
    const files = (await fs.readdir(dir)).filter((f) => f.endsWith('.md'))
    const out: ScannedCommand[] = []
    for (const f of files) {
      const file = path.join(dir, f)
      try {
        const raw = await fs.readFile(file, 'utf-8')
        const { data, body } = parseFrontmatter(raw)
        const id = f.replace(/\.md$/, '')
        out.push({
          id,
          name: data.name || id,
          description: data.description || '',
          firstLine: firstNonEmptyLine(body),
          file,
        })
      } catch {
        // Skip
      }
    }
    return out.sort((a, b) => a.name.localeCompare(b.name))
  }

  /**
   * Parse `.claude/settings.json` `hooks` block. Claude Code's schema is:
   *   hooks: {
   *     <event>: [
   *       { matcher?: string, hooks: [{ type: 'command', command: string, ... }] }
   *     ]
   *   }
   * Each leaf command becomes one ScannedHook so the Library can list and
   * preview them individually.
   */
  async listHooks(workspacePath: string): Promise<ScannedHook[]> {
    const settingsFile = path.join(workspacePath, '.claude', 'settings.json')
    if (!await fs.pathExists(settingsFile)) return []
    let settings: { hooks?: Record<string, unknown> } = {}
    try {
      settings = JSON.parse(await fs.readFile(settingsFile, 'utf-8'))
    } catch {
      return []
    }
    const hooksMap = settings.hooks || {}
    const out: ScannedHook[] = []
    let counter = 0
    for (const [event, rules] of Object.entries(hooksMap)) {
      if (!Array.isArray(rules)) continue
      for (const rule of rules as Array<Record<string, unknown>>) {
        const matcher = typeof rule.matcher === 'string' ? rule.matcher : ''
        const hooksArr = Array.isArray(rule.hooks) ? rule.hooks : []
        for (const h of hooksArr as Array<Record<string, unknown>>) {
          const cmd = typeof h.command === 'string' ? h.command : ''
          if (!cmd) continue
          // `disabled: true` is a non-standard convention some teams use to
          // soft-disable a hook without removing it from settings.json.
          const enabled = !(h.disabled === true)
          out.push({
            id: `${event}:${counter++}`,
            event,
            matcher,
            command: cmd.length > 200 ? cmd.slice(0, 200) + '…' : cmd,
            fullCommand: cmd,
            enabled,
          })
        }
      }
    }
    return out
  }

  /**
   * Compositions live globally under `~/.claude/team-compositions/*.json`.
   * Workspace-agnostic on purpose — a team composition is reusable across
   * workspaces.
   */
  async listCompositions(): Promise<ScannedComposition[]> {
    const dir = path.join(os.homedir(), '.claude', 'team-compositions')
    if (!await fs.pathExists(dir)) return []
    const files = (await fs.readdir(dir)).filter((f) => f.endsWith('.json'))
    const out: ScannedComposition[] = []
    for (const f of files) {
      const file = path.join(dir, f)
      try {
        const raw = await fs.readFile(file, 'utf-8')
        const json = JSON.parse(raw)
        const id = (typeof json.id === 'string' && json.id) || f.replace(/\.json$/, '')
        const name = (typeof json.name === 'string' && json.name) || id
        const description =
          (typeof json.description === 'string' && json.description) ||
          (typeof json.desc === 'string' && json.desc) ||
          ''
        // Members can be either an array of strings (agent ids) or an array of
        // objects with `name` / `agentName`. Normalise to string[].
        let members: string[] = []
        if (Array.isArray(json.members)) {
          members = json.members.map((m: unknown): string => {
            if (typeof m === 'string') return m
            if (m && typeof m === 'object') {
              const o = m as Record<string, unknown>
              return (
                (typeof o.name === 'string' && o.name) ||
                (typeof o.agentName === 'string' && o.agentName) ||
                ''
              )
            }
            return ''
          }).filter(Boolean)
        }
        out.push({ id, name, description, members, file })
      } catch {
        // Skip malformed JSON
      }
    }
    return out.sort((a, b) => a.name.localeCompare(b.name))
  }

  // ─── Authoring: Agents (file = .claude/agents/<name>.md) ───────────

  async createAgent(workspacePath: string, opts: AgentCreateOpts): Promise<{ file: string }> {
    assertSafeName(opts.name)
    const dir = assertClaudeChild(workspacePath, path.join(workspacePath, '.claude', 'agents'))
    await fs.ensureDir(dir)
    const file = path.join(dir, `${opts.name}.md`)
    if (await fs.pathExists(file)) {
      throw new Error(`Agent "${opts.name}" already exists`)
    }
    const body = opts.body ?? `# ${opts.name}\n\n${opts.description ?? ''}\n`
    const content = writeFrontmatter(
      {
        name: opts.name,
        description: opts.description,
        tools: opts.tools,
        model: opts.model,
      },
      body
    )
    await fs.writeFile(file, content, 'utf-8')
    return { file }
  }

  async updateAgent(workspacePath: string, name: string, body: string): Promise<{ file: string }> {
    assertSafeName(name)
    const file = assertClaudeChild(
      workspacePath,
      path.join(workspacePath, '.claude', 'agents', `${name}.md`)
    )
    if (!(await fs.pathExists(file))) {
      throw new Error(`Agent "${name}" not found`)
    }
    await fs.writeFile(file, body, 'utf-8')
    return { file }
  }

  async deleteAgent(workspacePath: string, name: string): Promise<{ trash: string }> {
    assertSafeName(name)
    const file = assertClaudeChild(
      workspacePath,
      path.join(workspacePath, '.claude', 'agents', `${name}.md`)
    )
    if (!(await fs.pathExists(file))) throw new Error(`Agent "${name}" not found`)
    const trash = await moveToTrash(workspacePath, 'agents', file, name)
    return { trash }
  }

  async renameAgent(
    workspacePath: string,
    oldName: string,
    newName: string
  ): Promise<{ file: string }> {
    assertSafeName(oldName)
    assertSafeName(newName)
    if (oldName === newName) {
      return {
        file: assertClaudeChild(
          workspacePath,
          path.join(workspacePath, '.claude', 'agents', `${oldName}.md`)
        ),
      }
    }
    const src = assertClaudeChild(
      workspacePath,
      path.join(workspacePath, '.claude', 'agents', `${oldName}.md`)
    )
    const dst = assertClaudeChild(
      workspacePath,
      path.join(workspacePath, '.claude', 'agents', `${newName}.md`)
    )
    if (!(await fs.pathExists(src))) throw new Error(`Agent "${oldName}" not found`)
    if (await fs.pathExists(dst)) throw new Error(`Agent "${newName}" already exists`)
    await fs.move(src, dst)
    return { file: dst }
  }

  // ─── Authoring: Skills (dir = .claude/skills/<name>/SKILL.md) ──────

  async createSkill(workspacePath: string, opts: SkillCreateOpts): Promise<{ file: string }> {
    assertSafeName(opts.name)
    const dir = assertClaudeChild(
      workspacePath,
      path.join(workspacePath, '.claude', 'skills', opts.name)
    )
    if (await fs.pathExists(dir)) {
      throw new Error(`Skill "${opts.name}" already exists`)
    }
    await fs.ensureDir(dir)
    const file = path.join(dir, 'SKILL.md')
    const body = opts.body ?? `# ${opts.name}\n\n${opts.description ?? ''}\n`
    const content = writeFrontmatter(
      {
        name: opts.name,
        description: opts.description,
        globs: opts.globs,
      },
      body
    )
    await fs.writeFile(file, content, 'utf-8')
    return { file }
  }

  async updateSkill(workspacePath: string, name: string, body: string): Promise<{ file: string }> {
    assertSafeName(name)
    const file = assertClaudeChild(
      workspacePath,
      path.join(workspacePath, '.claude', 'skills', name, 'SKILL.md')
    )
    if (!(await fs.pathExists(file))) throw new Error(`Skill "${name}" not found`)
    await fs.writeFile(file, body, 'utf-8')
    return { file }
  }

  async deleteSkill(workspacePath: string, name: string): Promise<{ trash: string }> {
    assertSafeName(name)
    const dir = assertClaudeChild(
      workspacePath,
      path.join(workspacePath, '.claude', 'skills', name)
    )
    if (!(await fs.pathExists(dir))) throw new Error(`Skill "${name}" not found`)
    const trashDir = assertClaudeChild(
      workspacePath,
      path.join(workspacePath, '.claude', '.trash', 'skills')
    )
    await fs.ensureDir(trashDir)
    const ts = new Date().toISOString().replace(/[:.]/g, '-')
    const target = path.join(trashDir, `${name}.${ts}`)
    await fs.move(dir, target, { overwrite: false })
    return { trash: target }
  }

  async renameSkill(
    workspacePath: string,
    oldName: string,
    newName: string
  ): Promise<{ file: string }> {
    assertSafeName(oldName)
    assertSafeName(newName)
    if (oldName === newName) {
      return {
        file: assertClaudeChild(
          workspacePath,
          path.join(workspacePath, '.claude', 'skills', oldName, 'SKILL.md')
        ),
      }
    }
    const src = assertClaudeChild(
      workspacePath,
      path.join(workspacePath, '.claude', 'skills', oldName)
    )
    const dst = assertClaudeChild(
      workspacePath,
      path.join(workspacePath, '.claude', 'skills', newName)
    )
    if (!(await fs.pathExists(src))) throw new Error(`Skill "${oldName}" not found`)
    if (await fs.pathExists(dst)) throw new Error(`Skill "${newName}" already exists`)
    await fs.move(src, dst)
    return { file: path.join(dst, 'SKILL.md') }
  }

  // ─── Authoring: Commands (file = .claude/commands/<name>.md) ───────

  async createCommand(
    workspacePath: string,
    opts: CommandCreateOpts
  ): Promise<{ file: string }> {
    assertSafeName(opts.name)
    const dir = assertClaudeChild(
      workspacePath,
      path.join(workspacePath, '.claude', 'commands')
    )
    await fs.ensureDir(dir)
    const file = path.join(dir, `${opts.name}.md`)
    if (await fs.pathExists(file)) {
      throw new Error(`Command "${opts.name}" already exists`)
    }
    const body = opts.body ?? `${opts.description ?? ''}\n`
    const content = writeFrontmatter(
      {
        name: opts.name,
        description: opts.description,
        'argument-hint': opts.argHint,
      },
      body
    )
    await fs.writeFile(file, content, 'utf-8')
    return { file }
  }

  async updateCommand(
    workspacePath: string,
    name: string,
    body: string
  ): Promise<{ file: string }> {
    assertSafeName(name)
    const file = assertClaudeChild(
      workspacePath,
      path.join(workspacePath, '.claude', 'commands', `${name}.md`)
    )
    if (!(await fs.pathExists(file))) throw new Error(`Command "${name}" not found`)
    await fs.writeFile(file, body, 'utf-8')
    return { file }
  }

  async deleteCommand(workspacePath: string, name: string): Promise<{ trash: string }> {
    assertSafeName(name)
    const file = assertClaudeChild(
      workspacePath,
      path.join(workspacePath, '.claude', 'commands', `${name}.md`)
    )
    if (!(await fs.pathExists(file))) throw new Error(`Command "${name}" not found`)
    const trash = await moveToTrash(workspacePath, 'commands', file, name)
    return { trash }
  }

  async renameCommand(
    workspacePath: string,
    oldName: string,
    newName: string
  ): Promise<{ file: string }> {
    assertSafeName(oldName)
    assertSafeName(newName)
    if (oldName === newName) {
      return {
        file: assertClaudeChild(
          workspacePath,
          path.join(workspacePath, '.claude', 'commands', `${oldName}.md`)
        ),
      }
    }
    const src = assertClaudeChild(
      workspacePath,
      path.join(workspacePath, '.claude', 'commands', `${oldName}.md`)
    )
    const dst = assertClaudeChild(
      workspacePath,
      path.join(workspacePath, '.claude', 'commands', `${newName}.md`)
    )
    if (!(await fs.pathExists(src))) throw new Error(`Command "${oldName}" not found`)
    if (await fs.pathExists(dst)) throw new Error(`Command "${newName}" already exists`)
    await fs.move(src, dst)
    return { file: dst }
  }

  // ─── Authoring: Hooks (settings.json hooks[event] array) ───────────

  async addHook(
    workspacePath: string,
    event: string,
    hook: HookSpec
  ): Promise<{ index: number }> {
    if (!event) throw new Error('Hook event is required')
    if (!hook?.command) throw new Error('Hook command is required')
    const file = assertClaudeChild(
      workspacePath,
      path.join(workspacePath, '.claude', 'settings.json')
    )
    const settings = await readJsonSafe<Record<string, unknown>>(file, {})
    const hooks = (settings.hooks as Record<string, unknown[]>) ?? {}
    const arr = Array.isArray(hooks[event]) ? (hooks[event] as Record<string, unknown>[]) : []
    arr.push({
      matcher: hook.matcher ?? '',
      hooks: [
        {
          type: hook.type ?? 'command',
          command: hook.command,
          ...(typeof hook.timeout === 'number' ? { timeout: hook.timeout } : {}),
          ...(hook.disabled ? { disabled: true } : {}),
        },
      ],
    })
    hooks[event] = arr
    settings.hooks = hooks
    await writeJsonAtomic(file, settings)
    return { index: arr.length - 1 }
  }

  async removeHook(workspacePath: string, event: string, index: number): Promise<void> {
    const file = assertClaudeChild(
      workspacePath,
      path.join(workspacePath, '.claude', 'settings.json')
    )
    const settings = await readJsonSafe<Record<string, unknown>>(file, {})
    const hooks = (settings.hooks as Record<string, unknown[]>) ?? {}
    const arr = Array.isArray(hooks[event]) ? (hooks[event] as unknown[]) : []
    if (index < 0 || index >= arr.length) throw new Error('Hook index out of range')
    arr.splice(index, 1)
    if (arr.length === 0) delete hooks[event]
    else hooks[event] = arr
    settings.hooks = hooks
    await writeJsonAtomic(file, settings)
  }

  async updateHook(
    workspacePath: string,
    event: string,
    index: number,
    hook: HookSpec
  ): Promise<void> {
    if (!hook?.command) throw new Error('Hook command is required')
    const file = assertClaudeChild(
      workspacePath,
      path.join(workspacePath, '.claude', 'settings.json')
    )
    const settings = await readJsonSafe<Record<string, unknown>>(file, {})
    const hooks = (settings.hooks as Record<string, unknown[]>) ?? {}
    const arr = Array.isArray(hooks[event])
      ? (hooks[event] as Record<string, unknown>[])
      : []
    if (index < 0 || index >= arr.length) throw new Error('Hook index out of range')
    arr[index] = {
      matcher: hook.matcher ?? '',
      hooks: [
        {
          type: hook.type ?? 'command',
          command: hook.command,
          ...(typeof hook.timeout === 'number' ? { timeout: hook.timeout } : {}),
          ...(hook.disabled ? { disabled: true } : {}),
        },
      ],
    }
    hooks[event] = arr
    settings.hooks = hooks
    await writeJsonAtomic(file, settings)
  }

  // ─── Authoring: MCP servers (mcp.json mcpServers map) ──────────────

  async addMcpServer(
    workspacePath: string,
    name: string,
    spec: McpServerSpec
  ): Promise<void> {
    assertSafeName(name)
    const file = assertClaudeChild(
      workspacePath,
      path.join(workspacePath, '.claude', 'mcp.json')
    )
    const cfg = await readJsonSafe<{ mcpServers?: Record<string, unknown> }>(file, {})
    const servers = cfg.mcpServers ?? {}
    if (servers[name]) throw new Error(`MCP server "${name}" already exists`)
    servers[name] = sanitizeMcp(spec)
    cfg.mcpServers = servers
    await writeJsonAtomic(file, cfg)
  }

  async updateMcpServer(
    workspacePath: string,
    name: string,
    spec: McpServerSpec
  ): Promise<void> {
    assertSafeName(name)
    const file = assertClaudeChild(
      workspacePath,
      path.join(workspacePath, '.claude', 'mcp.json')
    )
    const cfg = await readJsonSafe<{ mcpServers?: Record<string, unknown> }>(file, {})
    const servers = cfg.mcpServers ?? {}
    if (!servers[name]) throw new Error(`MCP server "${name}" not found`)
    servers[name] = sanitizeMcp(spec)
    cfg.mcpServers = servers
    await writeJsonAtomic(file, cfg)
  }

  async removeMcpServer(workspacePath: string, name: string): Promise<void> {
    assertSafeName(name)
    const file = assertClaudeChild(
      workspacePath,
      path.join(workspacePath, '.claude', 'mcp.json')
    )
    const cfg = await readJsonSafe<{ mcpServers?: Record<string, unknown> }>(file, {})
    const servers = cfg.mcpServers ?? {}
    if (!servers[name]) throw new Error(`MCP server "${name}" not found`)
    delete servers[name]
    cfg.mcpServers = servers
    await writeJsonAtomic(file, cfg)
  }

  /**
   * Best-effort connectivity probe. For stdio servers we spawn the command
   * with `--help` (or just `args`) and check it doesn't immediately exit with
   * an error. For http servers we issue a GET (Electron has fetch on the main
   * process). Returns a short status string.
   */
  async testMcpConnection(
    workspacePath: string,
    name: string
  ): Promise<{ ok: boolean; message: string }> {
    assertSafeName(name)
    const file = assertClaudeChild(
      workspacePath,
      path.join(workspacePath, '.claude', 'mcp.json')
    )
    const cfg = await readJsonSafe<{ mcpServers?: Record<string, McpServerSpec> }>(file, {})
    const spec = cfg.mcpServers?.[name]
    if (!spec) return { ok: false, message: `Server "${name}" not configured` }

    if ((spec.type === 'http' || spec.type === 'sse') && spec.url) {
      try {
        const res = await fetch(spec.url, { method: 'HEAD' }).catch(() =>
          fetch(spec.url as string, { method: 'GET' })
        )
        return { ok: res.ok, message: `HTTP ${res.status}` }
      } catch (err) {
        return { ok: false, message: err instanceof Error ? err.message : String(err) }
      }
    }

    if (!spec.command) return { ok: false, message: 'No command configured' }

    return new Promise((resolve) => {
      const env = augmentedPathEnv()
      let resolved = false
      const child = spawn(spec.command as string, spec.args ?? [], {
        env: { ...env, ...(spec.env ?? {}) },
        stdio: 'ignore',
      })
      const timer = setTimeout(() => {
        if (resolved) return
        resolved = true
        try {
          child.kill('SIGTERM')
        } catch {
          // ignore
        }
        // Surviving the timeout = process started successfully (MCP servers
        // run forever).
        resolve({ ok: true, message: 'Process spawned (timeout reached, no early exit)' })
      }, 1500)
      child.on('error', (err) => {
        if (resolved) return
        resolved = true
        clearTimeout(timer)
        resolve({ ok: false, message: err.message })
      })
      child.on('exit', (code) => {
        if (resolved) return
        resolved = true
        clearTimeout(timer)
        // Non-zero exit before timeout = command failed
        resolve({
          ok: code === 0,
          message: code === 0 ? 'Exited cleanly' : `Exited with code ${code}`,
        })
      })
    })
  }

  // ─── Authoring: Permissions (settings.json permissions.allow/deny) ──

  async getPermissions(
    workspacePath: string
  ): Promise<{ allow: string[]; deny: string[] }> {
    const file = assertClaudeChild(
      workspacePath,
      path.join(workspacePath, '.claude', 'settings.json')
    )
    const settings = await readJsonSafe<Record<string, unknown>>(file, {})
    const perms = (settings.permissions as Record<string, unknown>) ?? {}
    const allow = Array.isArray(perms.allow)
      ? (perms.allow as string[]).filter((s) => typeof s === 'string')
      : []
    const deny = Array.isArray(perms.deny)
      ? (perms.deny as string[]).filter((s) => typeof s === 'string')
      : []
    return { allow, deny }
  }

  async setPermissions(
    workspacePath: string,
    next: { allow: string[]; deny: string[] }
  ): Promise<void> {
    const file = assertClaudeChild(
      workspacePath,
      path.join(workspacePath, '.claude', 'settings.json')
    )
    const settings = await readJsonSafe<Record<string, unknown>>(file, {})
    const perms = (settings.permissions as Record<string, unknown>) ?? {}
    perms.allow = (next.allow ?? []).map((s) => String(s)).filter(Boolean)
    perms.deny = (next.deny ?? []).map((s) => String(s)).filter(Boolean)
    settings.permissions = perms
    await writeJsonAtomic(file, settings)
  }

  // ─── CLAUDE.md Routing tables (optional sync) ───────────────────────
  //
  // The project's CLAUDE.md keeps Markdown tables for "Agent Routing" and
  // "Skill Routing". When the user opts in via the editor checkbox, we add a
  // row to the relevant table so the routing index stays in sync with the
  // newly-authored agent/skill.

  async syncRoutingTable(
    workspacePath: string,
    kind: 'agent' | 'skill',
    entry: { name: string; description?: string; pattern?: string }
  ): Promise<{ updated: boolean; file: string }> {
    const file = path.resolve(workspacePath, 'CLAUDE.md')
    if (!(await fs.pathExists(file))) {
      return { updated: false, file }
    }
    const raw = await fs.readFile(file, 'utf-8')
    const heading = kind === 'agent' ? '# Agent Routing' : '# Skill Routing'
    // Find heading line, then the next two lines are header + separator, then rows.
    const lines = raw.split(/\r?\n/)
    const idx = lines.findIndex((l) => l.trim().startsWith(heading))
    if (idx < 0) return { updated: false, file }
    // Find first table row (line starting with "|") after heading.
    let tableStart = -1
    for (let i = idx; i < lines.length; i++) {
      if (lines[i].trimStart().startsWith('|')) {
        tableStart = i
        break
      }
    }
    if (tableStart < 0) return { updated: false, file }
    // Find end of table (first non-pipe / blank line).
    let tableEnd = tableStart
    while (tableEnd < lines.length && lines[tableEnd].trimStart().startsWith('|')) {
      tableEnd++
    }
    // Skip past header + separator (first 2 rows) when checking duplicates.
    const dataStart = tableStart + 2
    for (let i = dataStart; i < tableEnd; i++) {
      if (lines[i].includes(`\`${entry.name}\``)) {
        return { updated: false, file } // already present
      }
    }
    const newRow =
      kind === 'agent'
        ? `| ${entry.description ?? entry.name} | \`${entry.name}\` | Cross |`
        : `| \`${entry.pattern ?? '**'}\` | \`${entry.name}\` |`
    lines.splice(tableEnd, 0, newRow)
    await fs.writeFile(file, lines.join('\n'), 'utf-8')
    return { updated: true, file }
  }

  /**
   * List MCP servers with their full configs so the editor can populate forms
   * without re-parsing JSON in the renderer.
   */
  async listMcpServers(
    workspacePath: string
  ): Promise<Array<{ name: string; spec: McpServerSpec }>> {
    const file = path.join(workspacePath, '.claude', 'mcp.json')
    if (!(await fs.pathExists(file))) return []
    const cfg = await readJsonSafe<{ mcpServers?: Record<string, McpServerSpec> }>(file, {})
    const servers = cfg.mcpServers ?? {}
    return Object.entries(servers).map(([name, spec]) => ({ name, spec }))
  }

  /**
   * Compose a preview of the context Claude sees on session start.
   *
   * We approximate Claude Code's harness loader: project CLAUDE.md verbatim,
   * every `@<.claude/...>.md` reference inlined, then SessionStart hook
   * commands rendered as their settings.json `command` text. We deliberately
   * do not execute hook scripts — preview must stay cheap and side-effect
   * free; their stdout is rendered live in actual sessions only.
   */
  async previewSessionContext(workspacePath: string): Promise<SessionPreview> {
    const claudeMd = path.join(workspacePath, 'CLAUDE.md')
    const sections: SessionPreviewSection[] = []
    let totalChars = 0
    if (await fs.pathExists(claudeMd)) {
      try {
        const raw = await fs.readFile(claudeMd, 'utf-8')
        sections.push({ kind: 'claude-md', label: 'CLAUDE.md', file: claudeMd, content: raw })
        totalChars += raw.length
        const refs = new Set<string>()
        for (const line of raw.split(/\r?\n/)) {
          const m = line.match(/^\s*@(\.claude\/[A-Za-z0-9_./-]+\.md)\s*$/)
          if (m) refs.add(m[1])
        }
        for (const rel of refs) {
          const abs = path.join(workspacePath, rel)
          if (await fs.pathExists(abs)) {
            try {
              const body = await fs.readFile(abs, 'utf-8')
              sections.push({ kind: 'rule', label: rel, file: abs, content: body })
              totalChars += body.length
            } catch {
              // skip
            }
          } else {
            sections.push({
              kind: 'rule',
              label: rel,
              file: abs,
              content: `[missing — referenced from CLAUDE.md but not found on disk]`,
              missing: true,
            })
          }
        }
      } catch {
        // skip — surfaced via lint, not preview
      }
    }
    const settingsFile = path.join(workspacePath, '.claude', 'settings.json')
    if (await fs.pathExists(settingsFile)) {
      try {
        const settings = JSON.parse(await fs.readFile(settingsFile, 'utf-8')) as {
          hooks?: { SessionStart?: Array<{ hooks?: Array<{ command?: string }> }> }
        }
        const sessionStart = settings.hooks?.SessionStart ?? []
        const cmdLines: string[] = []
        for (const rule of sessionStart) {
          for (const h of rule.hooks ?? []) {
            if (typeof h.command === 'string' && h.command.trim()) {
              cmdLines.push('$ ' + h.command)
              cmdLines.push('# (output streamed at real session start)')
              cmdLines.push('')
            }
          }
        }
        if (cmdLines.length > 0) {
          const content = cmdLines.join('\n')
          sections.push({
            kind: 'hook',
            label: 'SessionStart hooks',
            file: settingsFile,
            content,
          })
          totalChars += content.length
        }
      } catch {
        // skip
      }
    }
    const tokenEstimate = Math.round(totalChars / 4)
    return { sections, totalChars, tokenEstimate }
  }

  async getMcpStatus(workspacePath: string): Promise<{ name: string; status: string; command?: string }[]> {
    const mcpFile = path.join(workspacePath, '.claude', 'mcp.json')
    if (!await fs.pathExists(mcpFile)) return []

    try {
      const mcpConfig = JSON.parse(await fs.readFile(mcpFile, 'utf-8'))
      const servers = mcpConfig.mcpServers || {}
      const results: { name: string; status: string; command?: string }[] = []

      const env = augmentedPathEnv()
      for (const [name, config] of Object.entries(servers) as [string, any][]) {
        const command = config.command
        if (config.type === 'http') {
          results.push({ name, status: 'http', command: config.url })
        } else if (command) {
          // Check if command exists on PATH (augmented for GUI launches).
          // Wrapped in profiler so the Hook dashboard can show per-server
          // probe latency / failure rate.
          const started = Date.now()
          let exitCode = 0
          let probeOutput: string | undefined
          try {
            const stdout = execFileSync('/usr/bin/which', [command], {
              encoding: 'utf-8',
              timeout: 2000,
              env,
            })
            probeOutput = stdout
            results.push({ name, status: 'available', command })
          } catch (err) {
            exitCode = 1
            probeOutput = err instanceof Error ? err.message : String(err)
            results.push({ name, status: 'unavailable', command })
          }
          this.profiler?.recordExecution({
            event: 'mcp-probe',
            script: `mcp:${name}`,
            durationMs: Date.now() - started,
            exitCode,
            output: probeOutput,
          })
        }
      }

      return results
    } catch {
      return []
    }
  }
}
