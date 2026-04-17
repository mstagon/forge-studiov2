import fs from 'fs-extra'
import path from 'path'
import { execFileSync } from 'child_process'

export interface HarnessInfo {
  agents: { name: string; file: string }[]
  skills: { name: string; file: string }[]
  commands: { name: string; file: string }[]
  scripts: { name: string; file: string }[]
  rules: { name: string; file: string }[]
  mcpServers: { name: string; enabled: boolean; type: string }[]
  hooks: Record<string, number>
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

  async getMcpStatus(workspacePath: string): Promise<{ name: string; status: string; command?: string }[]> {
    const mcpFile = path.join(workspacePath, '.claude', 'mcp.json')
    if (!await fs.pathExists(mcpFile)) return []

    try {
      const mcpConfig = JSON.parse(await fs.readFile(mcpFile, 'utf-8'))
      const servers = mcpConfig.mcpServers || {}
      const results: { name: string; status: string; command?: string }[] = []

      for (const [name, config] of Object.entries(servers) as [string, any][]) {
        const command = config.command
        if (config.type === 'http') {
          results.push({ name, status: 'http', command: config.url })
        } else if (command) {
          // Check if command exists
          try {
            execFileSync('which', [command], { encoding: 'utf-8', timeout: 2000 })
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
