import { create } from 'zustand'
import type {
  LibAgent,
  LibSkill,
  LibCommand,
  LibHook,
  CompositionSeed,
} from '@/components/v2/LibraryData'

/**
 * Raw scanner shapes returned by `window.api.harness.list*`. Mirrored from
 * `electron/services/HarnessScanner.ts`; we don't import them directly because
 * the preload only exposes them via `Promise<unknown>` and a structural copy
 * keeps the store self-contained.
 */
interface ScannedAgent {
  id: string
  name: string
  description: string
  tools: string
  model: string
  preview: string
  file: string
}

interface ScannedSkill {
  id: string
  name: string
  description: string
  globs: string
  lines: number
  file: string
}

interface ScannedCommand {
  id: string
  name: string
  description: string
  firstLine: string
  file: string
}

interface ScannedHook {
  id: string
  event: string
  matcher: string
  command: string
  fullCommand: string
  enabled: boolean
}

interface ScannedComposition {
  id: string
  name: string
  description: string
  members: string[]
  file: string
}

// ─── Adapters: scanner → LibraryData types ────────────────────────────

const ROLE_COLOR_FALLBACK = 'var(--role-fe)'

function adaptAgent(raw: ScannedAgent): LibAgent {
  // The scanner only knows YAML frontmatter. Fill UI-only fields with safe
  // defaults — the renderer's tab will still get meaningful info (name,
  // description, model, command id list).
  const tools = raw.tools
    ? raw.tools
        .split(',')
        .map((t) => t.trim())
        .filter(Boolean)
    : []
  return {
    id: raw.id,
    name: raw.name,
    role: raw.description ? raw.description.slice(0, 60) : 'Agent',
    color: ROLE_COLOR_FALLBACK,
    desc: raw.description || raw.preview,
    skills: [],
    hooks: [],
    runs: 0,
    lastUsed: '—',
    model: raw.model || '—',
    effort: 'medium',
    cmdAllow: tools,
    cmdDeny: [],
    owner: 'team',
  }
}

function adaptSkill(raw: ScannedSkill): LibSkill {
  return {
    id: raw.id,
    name: raw.name,
    desc: raw.description,
    type: 'skill',
    lines: raw.lines,
    used: 0,
    agents: [],
    owner: 'team',
    lastUsed: '—',
  }
}

function adaptCommand(raw: ScannedCommand): LibCommand {
  return {
    id: raw.id,
    name: raw.name.startsWith('/') ? raw.name : `/${raw.name}`,
    desc: raw.description || raw.firstLine,
    args: '',
    builtin: false,
    uses: 0,
    owner: 'team',
  }
}

function adaptHook(raw: ScannedHook): LibHook {
  // Map Claude Code's event names → LibHook trigger taxonomy (best-effort —
  // unknown events fall back to 'pre-tool-use' since that's the most common
  // catch-all in real settings.json files).
  const triggerMap: Record<string, LibHook['trigger']> = {
    PreToolUse: 'pre-tool-use',
    PostToolUse: 'post-write',
    SessionStart: 'pre-write',
    Stop: 'pre-write',
    PreCompact: 'pre-write',
  }
  const trigger = triggerMap[raw.event] ?? 'pre-tool-use'
  return {
    id: raw.id,
    name: raw.matcher ? `${raw.event} (${raw.matcher})` : raw.event,
    trigger,
    desc: raw.command,
    enabled: raw.enabled,
    fires: 0,
    lastFire: '—',
    agents: [],
    owner: 'team',
    script: raw.fullCommand,
  }
}

function adaptComposition(raw: ScannedComposition): CompositionSeed {
  return {
    id: raw.id,
    name: raw.name,
    desc: raw.description,
    members: raw.members,
    runs: 0,
    lastUsed: '—',
    owner: 'team',
  }
}

// ─── Store ────────────────────────────────────────────────────────────

interface LibraryState {
  agents: LibAgent[] | null
  skills: LibSkill[] | null
  commands: LibCommand[] | null
  hooks: LibHook[] | null
  compositions: CompositionSeed[] | null
  loaded: boolean
  loading: boolean
  /** Last workspacePath we loaded for, so callers can avoid redundant fetches. */
  loadedFor: string | null

  loadAll: (workspacePath: string) => Promise<void>
  reset: () => void
}

export const useLibraryStore = create<LibraryState>((set, get) => ({
  agents: null,
  skills: null,
  commands: null,
  hooks: null,
  compositions: null,
  loaded: false,
  loading: false,
  loadedFor: null,

  loadAll: async (workspacePath: string) => {
    if (!workspacePath) return
    if (get().loading && get().loadedFor === workspacePath) return
    set({ loading: true, loadedFor: workspacePath })
    try {
      const [rawAgents, rawSkills, rawCommands, rawHooks, rawComps] = await Promise.all([
        window.api.harness.listAgents(workspacePath) as Promise<ScannedAgent[]>,
        window.api.harness.listSkills(workspacePath) as Promise<ScannedSkill[]>,
        window.api.harness.listCommands(workspacePath) as Promise<ScannedCommand[]>,
        window.api.harness.listHooks(workspacePath) as Promise<ScannedHook[]>,
        window.api.harness.listCompositions() as Promise<ScannedComposition[]>,
      ])
      set({
        agents: rawAgents.length > 0 ? rawAgents.map(adaptAgent) : null,
        skills: rawSkills.length > 0 ? rawSkills.map(adaptSkill) : null,
        commands: rawCommands.length > 0 ? rawCommands.map(adaptCommand) : null,
        hooks: rawHooks.length > 0 ? rawHooks.map(adaptHook) : null,
        compositions: rawComps.length > 0 ? rawComps.map(adaptComposition) : null,
        loaded: true,
        loading: false,
      })
    } catch (err) {
      console.error('[library] loadAll failed:', err)
      set({ loading: false, loaded: true })
    }
  },

  reset: () =>
    set({
      agents: null,
      skills: null,
      commands: null,
      hooks: null,
      compositions: null,
      loaded: false,
      loadedFor: null,
    }),
}))
