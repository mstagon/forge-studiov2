import { useEffect } from 'react'
import { useAgentTeamStore } from '@/stores/agentTeam'
import { useTerminalStore } from '@/stores/terminal'
import { VscOrganization, VscPerson, VscTerminalBash, VscCircleFilled, VscMail } from 'react-icons/vsc'
import type { Team, TeamMember, AgentStatus } from '@/types'

const STATUS_COLOR: Record<AgentStatus, string> = {
  running: 'text-blue-400',
  idle: 'text-status-success',
  shutdown: 'text-text-muted',
}

const STATUS_LABEL: Record<AgentStatus, string> = {
  running: 'Running',
  idle: 'Idle',
  shutdown: 'Shutdown',
}

function formatRelative(iso: string | null): string {
  if (!iso) return '—'
  const ts = new Date(iso).getTime()
  if (Number.isNaN(ts)) return '—'
  const seconds = Math.max(1, Math.round((Date.now() - ts) / 1000))
  if (seconds < 60) return `${seconds}s ago`
  const minutes = Math.round(seconds / 60)
  if (minutes < 60) return `${minutes}m ago`
  const hours = Math.round(minutes / 60)
  if (hours < 24) return `${hours}h ago`
  const days = Math.round(hours / 24)
  return `${days}d ago`
}

export function TeamsPanel() {
  const { teams, loaded, load, subscribe, unsubscribeAll } = useAgentTeamStore()

  useEffect(() => {
    load()
    subscribe()
    return () => unsubscribeAll()
  }, [load, subscribe, unsubscribeAll])

  if (!loaded) {
    return <div className="px-3 py-3 text-xs text-text-muted">Loading teams…</div>
  }
  if (teams.length === 0) {
    return (
      <div className="px-3 py-3 text-xs text-text-muted leading-relaxed">
        No agent teams yet.
        <br />
        <span className="text-text-secondary">
          When Claude Code spawns a team (CLAUDE_CODE_EXPERIMENTAL_AGENT_TEAMS=1), members will appear here.
        </span>
      </div>
    )
  }

  return (
    <div className="flex flex-col">
      {teams.map((team) => (
        <TeamCard key={team.id} team={team} />
      ))}
    </div>
  )
}

function TeamCard({ team }: { team: Team }) {
  const running = team.members.filter((m) => m.status === 'running').length
  const idle = team.members.filter((m) => m.status === 'idle').length
  return (
    <div className="border-b border-border">
      <div className="px-3 py-2 bg-surface-2/40">
        <div className="flex items-center gap-2">
          <VscOrganization size={14} className="text-text-secondary shrink-0" />
          <span className="text-xs font-semibold text-text-primary truncate">{team.name}</span>
          <span className="ml-auto text-2xs text-text-muted shrink-0">
            {running}▶ {idle}◉ / {team.members.length}
          </span>
        </div>
        {team.description && (
          <div className="mt-1 text-2xs text-text-muted leading-relaxed line-clamp-2">{team.description}</div>
        )}
      </div>
      <div className="flex flex-col">
        {team.members.map((m) => (
          <MemberRow key={m.agentId} member={m} />
        ))}
      </div>
    </div>
  )
}

function MemberRow({ member }: { member: TeamMember }) {
  const addTab = useTerminalStore((s) => s.addTab)

  const openTerminal = () => {
    if (!member.cwd) return
    addTab(member.cwd)
  }

  return (
    <div className="group px-3 py-2 hover:bg-surface-2 transition-colors">
      <div className="flex items-center gap-2">
        <VscCircleFilled size={8} className={`${STATUS_COLOR[member.status]} shrink-0`} title={STATUS_LABEL[member.status]} />
        {member.isLead ? (
          <VscOrganization size={12} className="text-accent shrink-0" />
        ) : (
          <VscPerson size={12} className="text-text-muted shrink-0" />
        )}
        <span className="text-xs font-medium text-text-primary truncate flex-1">{member.name}</span>
        {member.cwd && (
          <button
            className="opacity-0 group-hover:opacity-100 p-0.5 rounded hover:bg-surface-3 text-text-muted hover:text-text-primary"
            onClick={openTerminal}
            title={`Open terminal at ${member.cwd}`}
          >
            <VscTerminalBash size={12} />
          </button>
        )}
      </div>
      <div className="ml-5 mt-0.5 flex items-center gap-2 text-2xs text-text-muted">
        <span className="font-mono">{member.model}</span>
        <span>·</span>
        <span>{member.agentType}</span>
        {member.unreadCount > 0 && (
          <>
            <span>·</span>
            <span className="flex items-center gap-0.5 text-status-warning">
              <VscMail size={10} /> {member.unreadCount}
            </span>
          </>
        )}
        <span className="ml-auto">{formatRelative(member.lastActivityAt)}</span>
      </div>
      {member.lastSummary && (
        <div className="ml-5 mt-1 text-2xs text-text-secondary line-clamp-2 leading-relaxed">
          {member.lastSummary}
        </div>
      )}
    </div>
  )
}
