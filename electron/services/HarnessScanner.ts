import fs from 'fs-extra'
import path from 'path'
import os from 'os'
import { execFileSync } from 'child_process'

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

export class HarnessScanner {
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
          // Check if command exists on PATH (augmented for GUI launches)
          try {
            execFileSync('/usr/bin/which', [command], {
              encoding: 'utf-8',
              timeout: 2000,
              env,
            })
            results.push({ name, status: 'available', command })
          } catch {
            results.push({ name, status: 'unavailable', command })
          }
        }
      }

      return results
    } catch {
      return []
    }
  }
}
