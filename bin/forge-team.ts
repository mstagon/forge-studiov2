#!/usr/bin/env node
/**
 * forge-team — headless CLI bridge for the Forge Studio team registry.
 *
 * Lets the main Claude Code session (which has no IPC channel into a running
 * Electron GUI) provision exactly the same on-disk state the GUI's
 * AgentTeamWatcher would produce: per-team config.json under
 * `<workspace>/.claude/teams/<teamId>/`, isolated git worktrees, optional
 * tmux sessions. When the GUI is running it discovers the new team via its
 * own chokidar watcher — so this CLI is consciously *write-only* with respect
 * to runtime IPC.
 *
 * Implementation note: imports `TeamOperations` directly. PathManager is
 * skipped because it depends on `electron`; the CLI falls back to system
 * `tmux` on PATH. If you launch this from inside the packaged Forge.app and
 * want the bundled tmux, prepend `<Forge.app>/Contents/Resources/bundled-tools/bin`
 * to your PATH manually before invoking.
 */

import path from 'path'
import { TeamOperations } from '../electron/services/TeamOperations.ts'
import type {
  TeamCreateMember,
  WorktreeStrategy,
  MergeStrategy,
} from '../electron/services/TeamOperations.ts'

// Pure system fallbacks — no electron, no PathManager. Callers running inside
// Forge.app can override PATH externally to pick up the bundled tmux.
const ops = new TeamOperations({
  tmuxBin: () => 'tmux',
  tmuxEnv: () => ({ ...process.env }),
})

interface ParsedArgs {
  command: string
  flags: Map<string, string>
}

function parseArgs(argv: string[]): ParsedArgs {
  const [command, ...rest] = argv
  const flags = new Map<string, string>()
  for (let i = 0; i < rest.length; i++) {
    const tok = rest[i]
    if (!tok.startsWith('--')) continue
    const key = tok.slice(2)
    const next = rest[i + 1]
    if (next !== undefined && !next.startsWith('--')) {
      flags.set(key, next)
      i++
    } else {
      flags.set(key, 'true')
    }
  }
  return { command: command ?? '', flags }
}

function requireFlag(flags: Map<string, string>, name: string): string {
  const v = flags.get(name)
  if (!v) {
    fail(`missing required flag: --${name}`)
  }
  return v as string
}

function emit(payload: unknown): void {
  process.stdout.write(JSON.stringify(payload) + '\n')
}

function fail(msg: string, code = 1): never {
  process.stderr.write(`forge-team: ${msg}\n`)
  process.exit(code)
}

/**
 * Members syntax (CLI-friendly, JSON-friendly, both supported):
 *   --members "agentId1:task1,agentId2:task2"
 *   --members '[{"agentId":"x","task":"y"}, ...]'
 *
 * Commas inside tasks aren't supported in the simple form; switch to JSON
 * if a task description contains a comma.
 */
function parseMembers(raw: string): TeamCreateMember[] {
  const trimmed = raw.trim()
  if (trimmed.startsWith('[')) {
    try {
      const arr = JSON.parse(trimmed)
      if (!Array.isArray(arr)) throw new Error('expected JSON array')
      return arr.map((m: { agentId: string; task?: string }) => ({
        agentId: String(m.agentId),
        task: m.task ? String(m.task) : undefined,
      }))
    } catch (err) {
      fail(`--members JSON parse failed: ${(err as Error).message}`)
    }
  }
  return trimmed
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean)
    .map((entry) => {
      const colonIdx = entry.indexOf(':')
      if (colonIdx < 0) return { agentId: entry }
      return {
        agentId: entry.slice(0, colonIdx).trim(),
        task: entry.slice(colonIdx + 1).trim() || undefined,
      }
    })
}

function asWorktreeStrategy(v: string | undefined): WorktreeStrategy {
  if (v === 'isolated' || v === 'shared') return v
  if (v === undefined) return 'isolated'
  fail(`--worktree-strategy must be 'isolated' or 'shared' (got: ${v})`)
}

function asMergeStrategy(v: string | undefined): MergeStrategy {
  if (v === 'squash' || v === 'sequential') return v
  if (v === undefined) return 'squash'
  fail(`--merge-strategy must be 'squash' or 'sequential' (got: ${v})`)
}

function resolveWorkspace(flags: Map<string, string>): string {
  const ws = flags.get('workspace')
  if (!ws) fail('missing required flag: --workspace')
  return path.resolve(ws as string)
}

async function cmdCreate(flags: Map<string, string>): Promise<void> {
  const workspacePath = resolveWorkspace(flags)
  const name = requireFlag(flags, 'name')
  const goal = flags.get('goal')
  const membersRaw = requireFlag(flags, 'members')
  const members = parseMembers(membersRaw)
  if (members.length === 0) fail('--members must list at least one entry')
  const worktreeStrategy = asWorktreeStrategy(flags.get('worktree-strategy'))
  const mergeStrategy = asMergeStrategy(flags.get('merge-strategy'))
  const workspaceId = flags.get('workspace-id') ?? path.basename(workspacePath)
  // Default to NOT auto-running `claude` from the headless CLI — the main
  // session is the orchestrator and probably wants to wire the prompt itself.
  // Pass --auto-start to opt in.
  const autoStartClaude = flags.get('auto-start') === 'true'

  const result = await ops.create({
    workspaceId,
    workspacePath,
    name,
    goal,
    members,
    worktreeStrategy,
    mergeStrategy,
    autoStartClaude,
  })
  emit(result)
}

async function cmdList(flags: Map<string, string>): Promise<void> {
  const workspacePath = resolveWorkspace(flags)
  const teams = await ops.list(workspacePath)
  emit(teams)
}

async function cmdRemove(flags: Map<string, string>): Promise<void> {
  const workspacePath = resolveWorkspace(flags)
  const teamId = requireFlag(flags, 'team-id')
  await ops.remove(workspacePath, teamId)
  emit({ ok: true, teamId })
}

async function cmdMerge(flags: Map<string, string>): Promise<void> {
  const workspacePath = resolveWorkspace(flags)
  const teamId = requireFlag(flags, 'team-id')
  const strategyFlag = flags.get('merge-strategy')
  const opts = strategyFlag ? { mergeStrategy: asMergeStrategy(strategyFlag) } : {}
  const result = await ops.merge(workspacePath, teamId, opts)
  emit(result)
  if (!result.ok) process.exit(2)
}

async function cmdPause(flags: Map<string, string>): Promise<void> {
  const workspacePath = resolveWorkspace(flags)
  const teamId = requireFlag(flags, 'team-id')
  const agentId = flags.get('agent-id')
  const result = agentId
    ? await ops.pauseMember(workspacePath, teamId, agentId)
    : await ops.pause(workspacePath, teamId)
  emit(result)
}

async function cmdResume(flags: Map<string, string>): Promise<void> {
  const workspacePath = resolveWorkspace(flags)
  const teamId = requireFlag(flags, 'team-id')
  const agentId = flags.get('agent-id')
  const result = agentId
    ? await ops.resumeMember(workspacePath, teamId, agentId)
    : await ops.resume(workspacePath, teamId)
  emit(result)
}

function printHelp(): void {
  process.stdout.write(
    [
      'forge-team — headless team registry for Forge Studio',
      '',
      'Usage:',
      '  forge-team <command> [flags]',
      '',
      'Commands:',
      '  create   Provision a new team (worktrees + tmux + config.json)',
      '  list     List teams under a workspace',
      '  remove   Tear down a team (worktrees + tmux + branches + config)',
      '  merge    Merge member branches back into the team base branch',
      '  pause    Pause an entire team or a single member (--agent-id)',
      '  resume   Resume an entire team or a single member (--agent-id)',
      '',
      'Common flags:',
      '  --workspace <path>          Workspace root (required)',
      '  --team-id <id>              Existing team id (required for ops)',
      '',
      'create flags:',
      '  --name <text>               Team display name (required)',
      '  --goal <text>               Team goal / description',
      '  --members <spec>            "agentId:task,agentId:task" or JSON array',
      '  --worktree-strategy         isolated (default) | shared',
      '  --merge-strategy            squash (default) | sequential',
      '  --workspace-id <id>         Override workspace id (default: dir name)',
      '  --auto-start                Auto-run `claude` inside each tmux pane',
      '',
      'merge flags:',
      '  --merge-strategy            squash | sequential (overrides team default)',
      '',
      'pause/resume flags:',
      '  --agent-id <id>             Pause/resume just this member',
      '',
      'Examples:',
      '  forge-team create --workspace . --name auth --goal "OAuth" \\',
      '    --members "nestjs-backend:auth API,flutter-ui:로그인 화면"',
      '  forge-team list --workspace .',
      '  forge-team merge --workspace . --team-id team-1234',
      '  forge-team remove --workspace . --team-id team-1234',
      '',
    ].join('\n')
  )
}

async function main(): Promise<void> {
  const argv = process.argv.slice(2)
  if (argv.length === 0 || argv[0] === '-h' || argv[0] === '--help' || argv[0] === 'help') {
    printHelp()
    return
  }
  const { command, flags } = parseArgs(argv)
  try {
    switch (command) {
      case 'create':
        await cmdCreate(flags)
        break
      case 'list':
        await cmdList(flags)
        break
      case 'remove':
      case 'rm':
      case 'delete':
        await cmdRemove(flags)
        break
      case 'merge':
        await cmdMerge(flags)
        break
      case 'pause':
        await cmdPause(flags)
        break
      case 'resume':
        await cmdResume(flags)
        break
      default:
        fail(`unknown command: ${command} (try \`forge-team help\`)`)
    }
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    fail(msg)
  }
}

main().catch((err: unknown) => {
  const msg = err instanceof Error ? err.message : String(err)
  fail(msg)
})
