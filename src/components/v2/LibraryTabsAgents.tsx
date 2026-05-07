/**
 * Library → Agents tab.
 *
 * Two-pane: searchable agent list (left) + detail w/ stats, skills, hooks,
 * permissions (right).
 *
 * Source: /tmp/forge_design/forge/project/src/library_tabs.jsx :: LibAgents
 */

import { useState, type ReactNode } from 'react'
// TODO: foundation import
import { Btn, Pill, Dot } from './primitives'
import { Icon } from './icons'
import {
  AGENTS_LIB,
  HOOKS_LIB_BY_ID,
  SKILLS_LIB_BY_ID,
  type LibAgent,
} from './LibraryData'
import { SectionLabel } from './Library'
import { useLibraryStore } from '@/stores/library'

type OwnerFilter = 'all' | 'team' | 'you'

export function AgentsTab() {
  // Real scanner-backed list when available, design seed otherwise — keeps
  // the tab demo-able even when no .claude/agents directory exists yet.
  const real = useLibraryStore((s) => s.agents)
  const items: LibAgent[] = real ?? AGENTS_LIB
  const [selectedId, setSelectedId] = useState<string>(items[0]?.id ?? '')
  const [filter, setFilter] = useState<OwnerFilter>('all')
  const [q, setQ] = useState('')

  const filtered = items.filter((a) => {
    if (filter !== 'all' && a.owner !== filter) return false
    if (q && !(a.name + ' ' + a.role + ' ' + a.desc).toLowerCase().includes(q.toLowerCase())) {
      return false
    }
    return true
  })
  const selected = items.find((a) => a.id === selectedId) ?? items[0]
  if (!selected) {
    return (
      <div style={{ padding: 24, color: 'var(--text-3)', fontSize: 12 }}>
        No agents available.
      </div>
    )
  }

  return (
    <div style={{ flex: 1, overflow: 'hidden', display: 'flex', minHeight: 0 }}>
      <div
        style={{
          width: 320,
          flexShrink: 0,
          borderRight: '1px solid var(--line-1)',
          display: 'flex',
          flexDirection: 'column',
        }}
      >
        <div
          style={{
            padding: '12px 14px 8px',
            display: 'flex',
            flexDirection: 'column',
            gap: 8,
          }}
        >
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 8,
              padding: '6px 10px',
              background: 'var(--bg-2)',
              border: '1px solid var(--line-1)',
              borderRadius: 6,
            }}
          >
            <Icon.Search size={12} style={{ color: 'var(--text-4)' }} />
            <input
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="Search agents..."
              style={{
                flex: 1,
                background: 'transparent',
                border: 'none',
                outline: 'none',
                color: 'var(--text-1)',
                fontSize: 12,
              }}
            />
          </div>
          <div style={{ display: 'flex', gap: 4 }}>
            {(
              [
                { id: 'all', label: '전체' },
                { id: 'team', label: '팀' },
                { id: 'you', label: '나' },
              ] as { id: OwnerFilter; label: string }[]
            ).map((f) => {
              const a = filter === f.id
              return (
                <button
                  key={f.id}
                  onClick={() => setFilter(f.id)}
                  style={{
                    flex: 1,
                    height: 22,
                    borderRadius: 4,
                    background: a ? 'var(--bg-3)' : 'transparent',
                    border: `1px solid ${a ? 'var(--line-3)' : 'var(--line-1)'}`,
                    color: a ? 'var(--text-1)' : 'var(--text-3)',
                    fontSize: 11,
                    fontWeight: a ? 600 : 500,
                  }}
                >
                  {f.label}
                </button>
              )
            })}
          </div>
        </div>
        <div style={{ flex: 1, overflow: 'auto' }}>
          {filtered.map((a) => {
            const sel = a.id === selectedId
            return (
              <button
                key={a.id}
                onClick={() => setSelectedId(a.id)}
                style={{
                  width: '100%',
                  textAlign: 'left',
                  padding: '10px 14px',
                  background: sel ? 'var(--bg-3)' : 'transparent',
                  border: 'none',
                  borderLeft: `2px solid ${sel ? a.color : 'transparent'}`,
                  display: 'flex',
                  alignItems: 'center',
                  gap: 10,
                  cursor: 'pointer',
                }}
              >
                <span
                  style={{
                    width: 28,
                    height: 28,
                    borderRadius: 5,
                    flexShrink: 0,
                    background: a.color,
                    color: '#0b0e13',
                    display: 'inline-flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    fontSize: 11,
                    fontWeight: 700,
                    fontFamily: 'var(--font-mono)',
                  }}
                >
                  {a.name.slice(0, 2).toUpperCase()}
                </span>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div
                    style={{
                      fontSize: 12.5,
                      color: 'var(--text-1)',
                      fontWeight: 500,
                      overflow: 'hidden',
                      textOverflow: 'ellipsis',
                      whiteSpace: 'nowrap',
                    }}
                  >
                    {a.name}
                  </div>
                  <div
                    style={{
                      fontSize: 10.5,
                      color: 'var(--text-4)',
                      overflow: 'hidden',
                      textOverflow: 'ellipsis',
                      whiteSpace: 'nowrap',
                    }}
                  >
                    {a.role}
                  </div>
                </div>
                <span className="mono" style={{ fontSize: 10, color: 'var(--text-3)' }}>
                  {a.runs}
                </span>
              </button>
            )
          })}
        </div>
      </div>

      {/* Detail */}
      <div style={{ flex: 1, overflow: 'auto', padding: '20px 28px' }}>
        <AgentDetail agent={selected} />
      </div>
    </div>
  )
}

function AgentDetail({ agent }: { agent: LibAgent }) {
  return (
    <>
      <div style={{ display: 'flex', alignItems: 'flex-start', gap: 14, marginBottom: 18 }}>
        <span
          style={{
            width: 48,
            height: 48,
            borderRadius: 8,
            flexShrink: 0,
            background: agent.color,
            color: '#0b0e13',
            display: 'inline-flex',
            alignItems: 'center',
            justifyContent: 'center',
            fontSize: 18,
            fontWeight: 700,
            fontFamily: 'var(--font-mono)',
          }}
        >
          {agent.name.slice(0, 2).toUpperCase()}
        </span>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <h2
              style={{
                margin: 0,
                fontSize: 20,
                fontWeight: 600,
                color: 'var(--text-1)',
                letterSpacing: -0.3,
              }}
            >
              {agent.name}
            </h2>
            <Pill color={agent.owner === 'team' ? 'var(--info)' : 'var(--accent)'}>
              {agent.owner === 'team' ? 'TEAM' : 'YOURS'}
            </Pill>
          </div>
          <div style={{ fontSize: 12.5, color: 'var(--text-3)', marginTop: 2 }}>{agent.role}</div>
          <div
            style={{
              fontSize: 13,
              color: 'var(--text-2)',
              marginTop: 10,
              lineHeight: 1.5,
              textWrap: 'pretty',
            } as React.CSSProperties}
          >
            {agent.desc}
          </div>
        </div>
        <Btn variant="ghost" icon={<Icon.Code size={11} />}>
          Edit YAML
        </Btn>
        <Btn variant="primary" icon={<Icon.Plus size={11} />}>
          Add to run
        </Btn>
      </div>

      {/* Stats row */}
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(4, 1fr)',
          gap: 10,
          marginBottom: 18,
        }}
      >
        <StatCell label="model" value={agent.model} mono />
        <StatCell label="effort" value={agent.effort} />
        <StatCell label="runs" value={agent.runs} mono />
        <StatCell label="last used" value={agent.lastUsed} />
      </div>

      <SectionLabel>Skills ({agent.skills.length})</SectionLabel>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
        {agent.skills.map((s) => {
          const sk = SKILLS_LIB_BY_ID[s]
          return (
            <span
              key={s}
              style={{
                padding: '4px 8px',
                background: 'var(--bg-2)',
                border: '1px solid var(--line-2)',
                borderRadius: 4,
                fontFamily: 'var(--font-mono)',
                fontSize: 11,
                color: 'var(--text-2)',
                display: 'inline-flex',
                alignItems: 'center',
                gap: 5,
              }}
            >
              <Icon.Sparkle size={10} style={{ color: 'var(--text-4)' }} />
              {s}
              {sk && <span style={{ color: 'var(--text-4)' }}>· {sk.lines}L</span>}
            </span>
          )
        })}
      </div>

      <SectionLabel>Hooks ({agent.hooks.length})</SectionLabel>
      {agent.hooks.length === 0 ? (
        <div style={{ fontSize: 12, color: 'var(--text-4)' }}>등록된 훅 없음</div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
          {agent.hooks.map((h) => {
            const hk = HOOKS_LIB_BY_ID[h]
            return (
              <div
                key={h}
                style={{
                  padding: '8px 10px',
                  background: 'var(--bg-2)',
                  border: '1px solid var(--line-1)',
                  borderRadius: 5,
                  display: 'flex',
                  alignItems: 'center',
                  gap: 10,
                  fontSize: 12,
                }}
              >
                <Icon.Bolt
                  size={11}
                  style={{ color: hk?.enabled ? 'var(--success)' : 'var(--text-4)' }}
                />
                <span className="mono" style={{ color: 'var(--text-1)' }}>
                  {h}
                </span>
                <span style={{ color: 'var(--text-4)' }}>· {hk?.trigger ?? '—'}</span>
                <div style={{ flex: 1 }} />
                <span
                  className="mono"
                  style={{ fontSize: 10.5, color: 'var(--text-3)' }}
                >
                  {hk?.fires ?? 0}× fired
                </span>
              </div>
            )
          })}
        </div>
      )}

      <SectionLabel>Permissions</SectionLabel>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
        <PermBlock title="Allow" color="var(--success)" items={agent.cmdAllow} />
        <PermBlock title="Deny" color="var(--danger)" items={agent.cmdDeny} />
      </div>
    </>
  )
}

interface StatCellProps {
  label: string
  value: ReactNode
  mono?: boolean
}

function StatCell({ label, value, mono }: StatCellProps) {
  return (
    <div
      style={{
        padding: '10px 12px',
        background: 'var(--bg-2)',
        border: '1px solid var(--line-1)',
        borderRadius: 6,
      }}
    >
      <div
        className="mono ns"
        style={{
          fontSize: 9.5,
          letterSpacing: 1,
          color: 'var(--text-4)',
          textTransform: 'uppercase',
          fontWeight: 600,
        }}
      >
        {label}
      </div>
      <div
        className={mono ? 'mono tabular' : 'tabular'}
        style={{ fontSize: 14, color: 'var(--text-1)', fontWeight: 500, marginTop: 4 }}
      >
        {value}
      </div>
    </div>
  )
}

interface PermBlockProps {
  title: string
  color: string
  items: string[]
}

function PermBlock({ title, color, items }: PermBlockProps) {
  return (
    <div
      style={{
        padding: '10px 12px',
        background: 'var(--bg-2)',
        border: '1px solid var(--line-1)',
        borderRadius: 6,
      }}
    >
      <div
        className="ns"
        style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 8 }}
      >
        <Dot color={color} size={6} />
        <span
          style={{
            fontSize: 11,
            fontWeight: 600,
            color: 'var(--text-2)',
            letterSpacing: 0.4,
          }}
        >
          {title}
        </span>
        <span className="mono" style={{ fontSize: 10, color: 'var(--text-4)' }}>
          {items.length}
        </span>
      </div>
      {items.length === 0 ? (
        <div style={{ fontSize: 11, color: 'var(--text-4)' }}>없음</div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
          {items.map((c, i) => (
            <code
              key={i}
              style={{
                fontSize: 11,
                color: 'var(--text-2)',
                background: 'var(--bg-3)',
                padding: '3px 6px',
                borderRadius: 3,
                fontFamily: 'var(--font-mono)',
              }}
            >
              {c}
            </code>
          ))}
        </div>
      )}
    </div>
  )
}
