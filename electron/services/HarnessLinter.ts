import fs from 'fs-extra'
import path from 'path'

/**
 * HarnessLinter — sanity checks for a workspace's `.claude/` harness.
 *
 * The harness is a hand-edited convention (frontmatter + Markdown + scripts +
 * JSON config). It's easy to break references: rename an agent, delete a hook
 * script, drop a frontmatter field, etc. This linter walks the harness and
 * reports problems the renderer can surface in Settings → Harness.
 *
 * Severity legend:
 *  - `error`   — broken: file missing, JSON invalid, required field absent.
 *  - `warning` — suspicious: duplicate name, hook command refers to missing script.
 *  - `info`    — heads-up: empty body, no description, etc.
 */

export type LintSeverity = 'error' | 'warning' | 'info'

export interface LintItem {
  /** Absolute file path the issue lives in. May be empty for cross-file issues. */
  file: string
  /** 1-based line number when known. */
  line?: number
  severity: LintSeverity
  /** Human-readable single-line message. */
  message: string
  /** Optional remediation hint. */
  fix?: string
}

export interface LintResult {
  errors: LintItem[]
  warnings: LintItem[]
  info: LintItem[]
  /** ISO timestamp the lint completed at — useful for the "last checked at" UI. */
  checkedAt: string
}

interface ParsedFrontmatter {
  data: Record<string, string>
  /** Line number (1-based) where the closing `---` appears, when present. */
  endLine: number | null
  body: string
}

/**
 * Same flat key/value frontmatter parser as HarnessScanner uses, but it also
 * reports the closing `---` line so we can attach `line` numbers to lint hits.
 */
function parseFrontmatter(raw: string): ParsedFrontmatter {
  const lines = raw.split(/\r?\n/)
  if (lines[0]?.trim() !== '---') {
    return { data: {}, endLine: null, body: raw }
  }
  const data: Record<string, string> = {}
  let i = 1
  let endLine: number | null = null
  for (; i < lines.length; i++) {
    if (lines[i].trim() === '---') {
      endLine = i + 1
      i++
      break
    }
    const colon = lines[i].indexOf(':')
    if (colon === -1) continue
    const key = lines[i].slice(0, colon).trim()
    let value = lines[i].slice(colon + 1).trim()
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1)
    }
    if (key) data[key] = value
  }
  return { data, endLine, body: lines.slice(i).join('\n') }
}

export class HarnessLinter {
  async lint(workspacePath: string): Promise<LintResult> {
    const result: LintResult = {
      errors: [],
      warnings: [],
      info: [],
      checkedAt: new Date().toISOString(),
    }
    const claudeDir = path.join(workspacePath, '.claude')
    if (!(await fs.pathExists(claudeDir))) {
      result.errors.push({
        file: claudeDir,
        severity: 'error',
        message: '.claude directory not found',
        fix: 'Create the workspace via Forge Studio New Workspace, or run Update Harness.',
      })
      return this.sort(result)
    }

    await this.lintAgents(claudeDir, result)
    await this.lintSkills(claudeDir, result)
    await this.lintCommands(claudeDir, result)
    await this.lintMcpJson(claudeDir, result)
    await this.lintSettingsHooks(claudeDir, result)
    await this.lintClaudeMdReferences(workspacePath, claudeDir, result)
    await this.lintAgentRoutingTable(workspacePath, claudeDir, result)
    await this.lintSkillInjector(claudeDir, result)

    return this.sort(result)
  }

  private push(result: LintResult, item: LintItem): void {
    if (item.severity === 'error') result.errors.push(item)
    else if (item.severity === 'warning') result.warnings.push(item)
    else result.info.push(item)
  }

  /** Stable sort by (file, line) to keep the UI deterministic. */
  private sort(result: LintResult): LintResult {
    const cmp = (a: LintItem, b: LintItem) => {
      const f = a.file.localeCompare(b.file)
      if (f !== 0) return f
      return (a.line ?? 0) - (b.line ?? 0)
    }
    result.errors.sort(cmp)
    result.warnings.sort(cmp)
    result.info.sort(cmp)
    return result
  }

  // ─── Agents ────────────────────────────────────────────────────────

  private async lintAgents(claudeDir: string, result: LintResult): Promise<void> {
    const dir = path.join(claudeDir, 'agents')
    if (!(await fs.pathExists(dir))) return
    const files = (await fs.readdir(dir)).filter((f) => f.endsWith('.md'))
    const seenNames = new Map<string, string>()
    for (const f of files) {
      const file = path.join(dir, f)
      let raw: string
      try {
        raw = await fs.readFile(file, 'utf-8')
      } catch {
        this.push(result, { file, severity: 'error', message: 'Unable to read agent file' })
        continue
      }
      const { data, endLine } = parseFrontmatter(raw)
      if (endLine === null) {
        this.push(result, {
          file,
          line: 1,
          severity: 'error',
          message: 'Agent missing YAML frontmatter (--- block)',
          fix: 'Add `---\\nname: ...\\ndescription: ...\\n---` at the top.',
        })
        continue
      }
      if (!data.name) {
        this.push(result, {
          file,
          line: 2,
          severity: 'error',
          message: 'Agent frontmatter missing `name`',
          fix: 'Add `name: <agent-id>` to the frontmatter.',
        })
      }
      if (!data.description) {
        this.push(result, {
          file,
          line: 2,
          severity: 'warning',
          message: 'Agent frontmatter missing `description`',
        })
      }
      if (data.name) {
        const prev = seenNames.get(data.name)
        if (prev) {
          this.push(result, {
            file,
            severity: 'warning',
            message: `Duplicate agent name "${data.name}" (also in ${path.basename(prev)})`,
            fix: 'Rename one of the agent files / `name:` fields so they are unique.',
          })
        } else {
          seenNames.set(data.name, file)
        }
      }
    }
  }

  // ─── Skills ────────────────────────────────────────────────────────

  private async lintSkills(claudeDir: string, result: LintResult): Promise<void> {
    const dir = path.join(claudeDir, 'skills')
    if (!(await fs.pathExists(dir))) return
    const dirs = await fs.readdir(dir, { withFileTypes: true })
    const seenNames = new Map<string, string>()
    for (const entry of dirs) {
      if (!entry.isDirectory()) continue
      const skillFile = path.join(dir, entry.name, 'SKILL.md')
      if (!(await fs.pathExists(skillFile))) {
        this.push(result, {
          file: path.join(dir, entry.name),
          severity: 'error',
          message: `Skill directory "${entry.name}" missing SKILL.md`,
          fix: 'Add a SKILL.md with name/description frontmatter.',
        })
        continue
      }
      let raw: string
      try {
        raw = await fs.readFile(skillFile, 'utf-8')
      } catch {
        this.push(result, { file: skillFile, severity: 'error', message: 'Unable to read SKILL.md' })
        continue
      }
      const { data, endLine } = parseFrontmatter(raw)
      if (endLine === null) {
        this.push(result, {
          file: skillFile,
          line: 1,
          severity: 'error',
          message: 'SKILL.md missing YAML frontmatter',
          fix: 'Add `---\\nname: ...\\ndescription: ...\\n---` at the top.',
        })
        continue
      }
      if (!data.name) {
        this.push(result, {
          file: skillFile,
          line: 2,
          severity: 'error',
          message: 'Skill frontmatter missing `name`',
        })
      }
      if (!data.description) {
        this.push(result, {
          file: skillFile,
          line: 2,
          severity: 'warning',
          message: 'Skill frontmatter missing `description`',
        })
      }
      const skillName = data.name || entry.name
      const prev = seenNames.get(skillName)
      if (prev) {
        this.push(result, {
          file: skillFile,
          severity: 'warning',
          message: `Duplicate skill name "${skillName}" (also in ${path.dirname(prev).split(path.sep).pop()})`,
        })
      } else {
        seenNames.set(skillName, skillFile)
      }
    }
  }

  // ─── Commands ─────────────────────────────────────────────────────

  private async lintCommands(claudeDir: string, result: LintResult): Promise<void> {
    const dir = path.join(claudeDir, 'commands')
    if (!(await fs.pathExists(dir))) return
    const files = (await fs.readdir(dir)).filter((f) => f.endsWith('.md'))
    const seenNames = new Map<string, string>()
    for (const f of files) {
      const file = path.join(dir, f)
      let raw: string
      try {
        raw = await fs.readFile(file, 'utf-8')
      } catch {
        this.push(result, { file, severity: 'error', message: 'Unable to read command file' })
        continue
      }
      const { data, endLine } = parseFrontmatter(raw)
      // Commands may legitimately lack frontmatter (some teams keep them as a
      // pure prompt). Demote to info.
      if (endLine === null) {
        this.push(result, {
          file,
          line: 1,
          severity: 'info',
          message: 'Command missing YAML frontmatter',
          fix: 'Optional: add `name`/`description` for nicer Library listings.',
        })
        continue
      }
      if (!data.name) {
        this.push(result, {
          file,
          line: 2,
          severity: 'warning',
          message: 'Command frontmatter missing `name`',
        })
      }
      if (data.name) {
        const prev = seenNames.get(data.name)
        if (prev) {
          this.push(result, {
            file,
            severity: 'warning',
            message: `Duplicate command name "${data.name}" (also in ${path.basename(prev)})`,
          })
        } else {
          seenNames.set(data.name, file)
        }
      }
    }
  }

  // ─── mcp.json ─────────────────────────────────────────────────────

  private async lintMcpJson(claudeDir: string, result: LintResult): Promise<void> {
    const file = path.join(claudeDir, 'mcp.json')
    if (!(await fs.pathExists(file))) return
    let raw: string
    try {
      raw = await fs.readFile(file, 'utf-8')
    } catch {
      this.push(result, { file, severity: 'error', message: 'Unable to read mcp.json' })
      return
    }
    try {
      const parsed = JSON.parse(raw) as { mcpServers?: Record<string, unknown> }
      if (!parsed || typeof parsed !== 'object') {
        this.push(result, { file, severity: 'error', message: 'mcp.json must be a JSON object' })
        return
      }
      if (parsed.mcpServers && typeof parsed.mcpServers !== 'object') {
        this.push(result, {
          file,
          severity: 'error',
          message: 'mcp.json `mcpServers` must be an object',
        })
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err)
      this.push(result, {
        file,
        severity: 'error',
        message: `mcp.json is not valid JSON: ${msg}`,
        fix: 'Validate JSON with `jq . .claude/mcp.json` and fix the syntax.',
      })
    }
  }

  // ─── settings.json hooks → script paths ───────────────────────────

  private async lintSettingsHooks(claudeDir: string, result: LintResult): Promise<void> {
    const file = path.join(claudeDir, 'settings.json')
    if (!(await fs.pathExists(file))) return
    let raw: string
    try {
      raw = await fs.readFile(file, 'utf-8')
    } catch {
      this.push(result, { file, severity: 'error', message: 'Unable to read settings.json' })
      return
    }
    let settings: { hooks?: Record<string, unknown> }
    try {
      settings = JSON.parse(raw)
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err)
      this.push(result, {
        file,
        severity: 'error',
        message: `settings.json is not valid JSON: ${msg}`,
      })
      return
    }
    const hooks = settings.hooks || {}
    const claudeProjectDir = path.dirname(claudeDir) // workspace root
    for (const [event, rules] of Object.entries(hooks)) {
      if (!Array.isArray(rules)) continue
      for (const rule of rules as Array<Record<string, unknown>>) {
        const hooksArr = Array.isArray(rule.hooks) ? rule.hooks : []
        for (const h of hooksArr as Array<Record<string, unknown>>) {
          const cmd = typeof h.command === 'string' ? h.command : ''
          if (!cmd) continue
          // Best-effort: extract `bash "$CLAUDE_PROJECT_DIR/.claude/scripts/<name>.sh"` references.
          const match = cmd.match(/\$CLAUDE_PROJECT_DIR\/(\.claude\/scripts\/[A-Za-z0-9_./-]+\.sh)/)
          if (match) {
            const rel = match[1]
            const abs = path.join(claudeProjectDir, rel)
            if (!(await fs.pathExists(abs))) {
              this.push(result, {
                file,
                severity: 'error',
                message: `Hook (${event}) references missing script: ${rel}`,
                fix: `Create ${rel} or remove the hook entry from settings.json.`,
              })
            }
          }
        }
      }
    }
  }

  // ─── CLAUDE.md @-references → rules/common/*.md ──────────────────

  private async lintClaudeMdReferences(
    workspacePath: string,
    claudeDir: string,
    result: LintResult,
  ): Promise<void> {
    const file = path.join(workspacePath, 'CLAUDE.md')
    if (!(await fs.pathExists(file))) return
    let raw: string
    try {
      raw = await fs.readFile(file, 'utf-8')
    } catch {
      return
    }
    const lines = raw.split(/\r?\n/)
    for (let i = 0; i < lines.length; i++) {
      // Match @.claude/path/to/file.md  (the auto-load convention).
      const m = lines[i].match(/^\s*@(\.claude\/[A-Za-z0-9_./-]+\.md)\s*$/)
      if (!m) continue
      const rel = m[1]
      const abs = path.join(workspacePath, rel)
      if (!(await fs.pathExists(abs))) {
        this.push(result, {
          file,
          line: i + 1,
          severity: 'error',
          message: `CLAUDE.md references missing file: ${rel}`,
          fix: `Create ${rel} or remove the @-reference from CLAUDE.md.`,
        })
      }
    }
    // Also scan inline markdown links of the form (.claude/...).
    for (let i = 0; i < lines.length; i++) {
      const re = /\]\((\.claude\/[A-Za-z0-9_./-]+\.md)\)/g
      let m: RegExpExecArray | null
      while ((m = re.exec(lines[i])) !== null) {
        const rel = m[1]
        const abs = path.join(workspacePath, rel)
        if (!(await fs.pathExists(abs))) {
          this.push(result, {
            file,
            line: i + 1,
            severity: 'warning',
            message: `Broken link in CLAUDE.md: ${rel}`,
          })
        }
      }
    }
    // Suppress the unused-claudeDir noise — it's part of the API for parity
    // with other linters. Reading it allows future cross-checks.
    void claudeDir
  }

  // ─── Agent Routing table → agent files exist ────────────────────

  private async lintAgentRoutingTable(
    workspacePath: string,
    claudeDir: string,
    result: LintResult,
  ): Promise<void> {
    const file = path.join(workspacePath, 'CLAUDE.md')
    if (!(await fs.pathExists(file))) return
    let raw: string
    try {
      raw = await fs.readFile(file, 'utf-8')
    } catch {
      return
    }
    const agentsDir = path.join(claudeDir, 'agents')
    const existing = new Set<string>()
    if (await fs.pathExists(agentsDir)) {
      for (const f of await fs.readdir(agentsDir)) {
        if (f.endsWith('.md')) existing.add(f.replace(/\.md$/, ''))
      }
    }
    // Capture every backticked identifier in the Agent Routing table region.
    // The table is bounded by `# Agent Routing` until a blank line or next H1/H2.
    const lines = raw.split(/\r?\n/)
    let inTable = false
    for (let i = 0; i < lines.length; i++) {
      const t = lines[i].trim()
      if (/^#{1,2}\s+Agent Routing/i.test(t)) {
        inTable = true
        continue
      }
      if (inTable) {
        if (/^#{1,2}\s/.test(t)) break
        // Match `agent-id` patterns inside the row.
        const re = /`([a-z0-9][a-z0-9-]+)`/g
        let m: RegExpExecArray | null
        while ((m = re.exec(lines[i])) !== null) {
          const id = m[1]
          // Skip non-agent tokens that show up in scope columns (Flutter, Cross, …).
          if (/^[A-Z]/.test(id)) continue
          // Heuristic: only flag identifiers with a hyphen (matches our agent
          // naming convention) to reduce false positives on plain English.
          if (!id.includes('-')) continue
          if (!existing.has(id)) {
            this.push(result, {
              file,
              line: i + 1,
              severity: 'warning',
              message: `Agent Routing references missing agent: ${id}`,
              fix: `Create .claude/agents/${id}.md or remove the row.`,
            })
          }
        }
      }
    }
  }

  // ─── skill-injector.sh patterns → SKILL.md exists ────────────────

  private async lintSkillInjector(claudeDir: string, result: LintResult): Promise<void> {
    const file = path.join(claudeDir, 'scripts', 'skill-injector.sh')
    if (!(await fs.pathExists(file))) return
    let raw: string
    try {
      raw = await fs.readFile(file, 'utf-8')
    } catch {
      return
    }
    const skillsDir = path.join(claudeDir, 'skills')
    const existing = new Set<string>()
    if (await fs.pathExists(skillsDir)) {
      for (const entry of await fs.readdir(skillsDir, { withFileTypes: true })) {
        if (entry.isDirectory()) existing.add(entry.name)
      }
    }
    // Each `SKILLS="$SKILLS <name1> <name2>"` line lists candidate skill ids.
    const lines = raw.split(/\r?\n/)
    for (let i = 0; i < lines.length; i++) {
      const m = lines[i].match(/SKILLS="\$SKILLS\s+([^"]+)"/)
      if (!m) continue
      const tokens = m[1].split(/\s+/).filter(Boolean)
      for (const tok of tokens) {
        if (!/^[a-z0-9][a-z0-9-]+$/.test(tok)) continue
        if (!existing.has(tok)) {
          this.push(result, {
            file,
            line: i + 1,
            severity: 'warning',
            message: `skill-injector.sh references missing skill: ${tok}`,
            fix: `Create .claude/skills/${tok}/SKILL.md or remove the reference from skill-injector.sh.`,
          })
        }
      }
    }
  }
}
