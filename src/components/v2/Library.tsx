/**
 * Library — top-level view with 5 tabs.
 *
 * Tabs:
 *  - compositions  → grid of composition cards + preview drawer (rendered here)
 *  - agents        → LibraryTabsAgents
 *  - skills        → LibraryTabsSkills
 *  - commands      → LibraryTabsCommands
 *  - hooks         → LibraryTabsHooks
 *
 * Source: design handoff at /tmp/forge_design/forge/project/src/library.jsx
 */

import { useState, type CSSProperties, type ReactNode } from 'react'
// TODO: foundation import — adjust if foundation barrels things differently.
import { Btn, Pill, AvatarStack } from './primitives'
import { Icon } from './icons'
import {
  AGENTS_LIB,
  AGENTS_LIB_BY_ID,
  COMMANDS_LIB,
  COMPOSITIONS,
  HOOKS_LIB,
  SKILLS_LIB,
  type CompositionSeed,
} from './LibraryData'
import { AgentsTab } from './LibraryTabsAgents'
import { SkillsTab } from './LibraryTabsSkills'
import { CommandsTab } from './LibraryTabsCommands'
import { HooksTab } from './LibraryTabsHooks'
import { useLibraryStore } from '@/stores/library'

export interface LibraryWorkspace {
  id?: string
  name: string
  path: string
  branch: string
}

export interface LibraryProps {
  workspace: LibraryWorkspace
  /** Apply a single agent / skill / command / hook to the run (sub-tab actions). */
  onApply?: (kind: 'agent' | 'skill' | 'command' | 'hook', id: string) => void
  /** Apply a composition (Compositions tab). */
  onApplyComposition: (comp: CompositionSeed) => void
  density?: 'compact' | 'comfortable'
}

type TabId = 'compositions' | 'agents' | 'skills' | 'commands' | 'hooks'

interface TabSpec {
  id: TabId
  label: string
  count: number
  icon: (p: { size?: number; style?: CSSProperties }) => ReactNode
}

export function Library({ workspace, onApplyComposition }: LibraryProps) {
  const [tab, setTab] = useState<TabId>('compositions')
  // Counts reflect real scanner data when present; seed otherwise.
  const realComps = useLibraryStore((s) => s.compositions)
  const realAgents = useLibraryStore((s) => s.agents)
  const realSkills = useLibraryStore((s) => s.skills)
  const realCommands = useLibraryStore((s) => s.commands)
  const realHooks = useLibraryStore((s) => s.hooks)

  const tabs: TabSpec[] = [
    { id: 'compositions', label: 'Compositions', count: (realComps ?? COMPOSITIONS).length, icon: Icon.Cube },
    { id: 'agents',       label: 'Agents',       count: (realAgents ?? AGENTS_LIB).length,   icon: Icon.Users },
    { id: 'skills',       label: 'Skills',       count: (realSkills ?? SKILLS_LIB).length,   icon: Icon.Sparkle },
    { id: 'commands',     label: 'Commands',     count: (realCommands ?? COMMANDS_LIB).length, icon: Icon.Terminal },
    { id: 'hooks',        label: 'Hooks',        count: (realHooks ?? HOOKS_LIB).length,    icon: Icon.Bolt },
  ]

  return (
    <div
      data-screen-label="Library"
      style={{
        flex: 1,
        display: 'flex',
        flexDirection: 'column',
        overflow: 'hidden',
        background: 'var(--bg-1)',
      }}
    >
      <div
        style={{
          padding: '20px 24px 0',
          borderBottom: '1px solid var(--line-1)',
          flexShrink: 0,
        }}
      >
        <div style={{ display: 'flex', alignItems: 'flex-end', gap: 12 }}>
          <div style={{ minWidth: 0 }}>
            <div
              style={{
                fontSize: 22,
                fontWeight: 600,
                letterSpacing: -0.4,
                color: 'var(--text-1)',
                lineHeight: 1.1,
              }}
            >
              Library
            </div>
            <div style={{ fontSize: 12.5, color: 'var(--text-3)', marginTop: 4 }}>
              재사용 가능한 팀 구성 · 에이전트 · 스킬 · 커맨드 · 훅
            </div>
          </div>
          <div style={{ flex: 1 }} />
          <Btn variant="ghost" icon={<Icon.Search size={13} />}>
            Search library
          </Btn>
          <Btn variant="primary" icon={<Icon.Plus size={13} />}>
            New {tab === 'compositions' ? 'composition' : tab.slice(0, -1)}
          </Btn>
        </div>
        <div style={{ display: 'flex', gap: 0, marginTop: 18, marginBottom: -1 }}>
          {tabs.map((t) => {
            const active = tab === t.id
            const TIcon = t.icon
            return (
              <button
                key={t.id}
                onClick={() => setTab(t.id)}
                style={{
                  padding: '8px 14px',
                  background: 'transparent',
                  border: 'none',
                  borderBottom: `2px solid ${active ? 'var(--accent)' : 'transparent'}`,
                  color: active ? 'var(--text-1)' : 'var(--text-3)',
                  fontSize: 12.5,
                  fontWeight: active ? 600 : 500,
                  cursor: 'pointer',
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: 6,
                }}
              >
                <TIcon size={13} style={{ opacity: active ? 1 : 0.6 }} />
                <span>{t.label}</span>
                <span
                  className="mono"
                  style={{
                    fontSize: 10,
                    color: active ? 'var(--text-2)' : 'var(--text-4)',
                    background: active ? 'var(--bg-3)' : 'var(--bg-2)',
                    padding: '1px 6px',
                    borderRadius: 999,
                    border: '1px solid var(--line-1)',
                  }}
                >
                  {t.count}
                </span>
              </button>
            )
          })}
        </div>
      </div>

      {tab === 'compositions' && (
        <CompositionsTab workspace={workspace} onApply={onApplyComposition} />
      )}
      {tab === 'agents' && <AgentsTab />}
      {tab === 'skills' && <SkillsTab />}
      {tab === 'commands' && <CommandsTab />}
      {tab === 'hooks' && <HooksTab />}
    </div>
  )
}

// ─── Compositions tab ─────────────────────────────────────────────

interface CompositionsTabProps {
  workspace: LibraryWorkspace
  onApply: (comp: CompositionSeed) => void
}

type OwnerFilter = 'all' | 'team' | 'yours'

function CompositionsTab({ workspace, onApply }: CompositionsTabProps) {
  const [filter, setFilter] = useState<OwnerFilter>('all')
  const [hoverId, setHoverId] = useState<string | null>(null)
  const [previewComp, setPreviewComp] = useState<CompositionSeed | null>(null)

  const real = useLibraryStore((s) => s.compositions)
  const items = real ?? COMPOSITIONS
  const filtered = items.filter((c) =>
    filter === 'all'
      ? true
      : filter === 'yours'
        ? c.owner === 'you'
        : filter === 'team'
          ? c.owner === 'team'
          : true,
  )

  return (
    <div style={{ flex: 1, overflow: 'hidden', display: 'flex', minHeight: 0 }}>
      <div style={{ flex: 1, overflow: 'auto', padding: '16px 24px' }}>
        <div style={{ display: 'flex', gap: 6, marginBottom: 14, alignItems: 'center' }}>
          {(
            [
              { id: 'all', label: '전체' },
              { id: 'team', label: '팀 공유' },
              { id: 'yours', label: '내 것' },
            ] as { id: OwnerFilter; label: string }[]
          ).map((f) => {
            const active = filter === f.id
            return (
              <button
                key={f.id}
                onClick={() => setFilter(f.id)}
                style={{
                  height: 26,
                  padding: '0 10px',
                  borderRadius: 4,
                  background: active ? 'var(--bg-3)' : 'transparent',
                  border: `1px solid ${active ? 'var(--line-3)' : 'var(--line-1)'}`,
                  color: active ? 'var(--text-1)' : 'var(--text-3)',
                  fontSize: 11.5,
                  fontWeight: active ? 600 : 500,
                  cursor: 'pointer',
                }}
              >
                {f.label}
              </button>
            )
          })}
          <div style={{ flex: 1 }} />
          <span className="mono" style={{ fontSize: 11, color: 'var(--text-4)' }}>
            현재 워크스페이스: <span style={{ color: 'var(--text-2)' }}>{workspace.name}</span>
          </span>
        </div>
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fill, minmax(340px, 1fr))',
            gap: 12,
          }}
        >
          {filtered.map((c) => (
            <CompositionCard
              key={c.id}
              comp={c}
              hover={hoverId === c.id}
              onHover={() => setHoverId(c.id)}
              onLeave={() => setHoverId(null)}
              onPreview={() => setPreviewComp(c)}
              onApply={() => onApply(c)}
            />
          ))}
        </div>
      </div>
      {previewComp && (
        <CompositionPreview
          comp={previewComp}
          workspace={workspace}
          onClose={() => setPreviewComp(null)}
          onApply={() => {
            onApply(previewComp)
            setPreviewComp(null)
          }}
        />
      )}
    </div>
  )
}

interface CompositionCardProps {
  comp: CompositionSeed
  hover: boolean
  onHover: () => void
  onLeave: () => void
  onPreview: () => void
  onApply: () => void
}

function CompositionCard({
  comp,
  hover,
  onHover,
  onLeave,
  onPreview,
  onApply,
}: CompositionCardProps) {
  return (
    <div
      onMouseEnter={onHover}
      onMouseLeave={onLeave}
      onClick={onPreview}
      style={{
        padding: 14,
        borderRadius: 8,
        background: hover ? 'var(--bg-3)' : 'var(--bg-2)',
        border: `1px solid ${hover ? 'var(--line-3)' : 'var(--line-1)'}`,
        display: 'flex',
        flexDirection: 'column',
        gap: 12,
        transition: 'background 120ms, border-color 120ms',
        position: 'relative',
        overflow: 'hidden',
        cursor: 'pointer',
      }}
    >
      {comp.featured && (
        <div
          style={{
            position: 'absolute',
            top: 10,
            right: 10,
            fontSize: 9,
            fontWeight: 700,
            letterSpacing: 0.6,
            color: 'var(--accent)',
            padding: '2px 6px',
            background: 'var(--accent-dim)',
            border: '1px solid var(--accent-line)',
            borderRadius: 3,
            fontFamily: 'var(--font-mono)',
          }}
        >
          FEATURED
        </div>
      )}
      <div>
        <div
          style={{
            fontSize: 14,
            fontWeight: 600,
            color: 'var(--text-1)',
            letterSpacing: -0.1,
          }}
        >
          {comp.name}
        </div>
        <div
          style={{
            fontSize: 12,
            color: 'var(--text-3)',
            marginTop: 4,
            lineHeight: 1.45,
            textWrap: 'pretty',
            display: '-webkit-box',
            WebkitBoxOrient: 'vertical',
            WebkitLineClamp: 2,
            overflow: 'hidden',
          } as CSSProperties}
        >
          {comp.desc}
        </div>
      </div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
        <AvatarStack ids={comp.members} max={5} size={22} />
        <span className="mono" style={{ fontSize: 11, color: 'var(--text-3)' }}>
          {comp.members.length}명
        </span>
      </div>
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 8,
          paddingTop: 10,
          borderTop: '1px solid var(--line-1)',
        }}
      >
        <span className="mono" style={{ fontSize: 10.5, color: 'var(--text-4)' }}>
          {comp.runs} runs · {comp.lastUsed}
        </span>
        <div style={{ flex: 1 }} />
        <button
          onClick={(e) => {
            e.stopPropagation()
            onApply()
          }}
          style={{
            height: 26,
            padding: '0 10px',
            borderRadius: 4,
            background: hover ? 'var(--accent)' : 'var(--bg-3)',
            border: `1px solid ${hover ? 'var(--accent)' : 'var(--line-2)'}`,
            color: hover ? '#0b0e13' : 'var(--text-1)',
            fontSize: 11.5,
            fontWeight: 600,
            cursor: 'pointer',
            display: 'inline-flex',
            alignItems: 'center',
            gap: 5,
            transition: 'all 120ms',
          }}
        >
          <Icon.Play size={10} /> Apply
        </button>
      </div>
    </div>
  )
}

interface CompositionPreviewProps {
  comp: CompositionSeed
  workspace: LibraryWorkspace
  onClose: () => void
  onApply: () => void
}

function CompositionPreview({ comp, workspace, onClose, onApply }: CompositionPreviewProps) {
  return (
    <div
      style={{
        width: 380,
        flexShrink: 0,
        borderLeft: '1px solid var(--line-2)',
        background: 'var(--bg-2)',
        display: 'flex',
        flexDirection: 'column',
        overflow: 'hidden',
      }}
    >
      <div
        style={{
          padding: '14px 18px',
          borderBottom: '1px solid var(--line-1)',
          display: 'flex',
          alignItems: 'center',
          gap: 10,
        }}
      >
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontSize: 14, fontWeight: 600, color: 'var(--text-1)' }}>{comp.name}</div>
          <div
            className="mono"
            style={{ fontSize: 10.5, color: 'var(--text-4)', marginTop: 2 }}
          >
            {comp.members.length}명 · {comp.runs} runs · {comp.lastUsed}
          </div>
        </div>
        <button
          onClick={onClose}
          style={{
            width: 24,
            height: 24,
            borderRadius: 5,
            background: 'transparent',
            border: '1px solid var(--line-2)',
            color: 'var(--text-3)',
            display: 'inline-flex',
            alignItems: 'center',
            justifyContent: 'center',
          }}
        >
          <Icon.X size={12} />
        </button>
      </div>
      <div style={{ flex: 1, overflow: 'auto', padding: '14px 18px' }}>
        <div
          style={{
            fontSize: 12.5,
            color: 'var(--text-2)',
            lineHeight: 1.5,
            textWrap: 'pretty',
          } as CSSProperties}
        >
          {comp.desc}
        </div>
        <SectionLabel>Roster</SectionLabel>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {comp.members.map((id) => {
            const a = AGENTS_LIB_BY_ID[id]
            if (!a) return null
            return (
              <div
                key={id}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 10,
                  padding: '8px 10px',
                  background: 'var(--bg-3)',
                  border: '1px solid var(--line-1)',
                  borderRadius: 6,
                }}
              >
                <span
                  style={{
                    width: 26,
                    height: 26,
                    borderRadius: 5,
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
                    style={{ fontSize: 12.5, color: 'var(--text-1)', fontWeight: 500 }}
                  >
                    {a.name}
                  </div>
                  <div style={{ fontSize: 10.5, color: 'var(--text-4)' }}>{a.role}</div>
                </div>
                <span
                  className="mono"
                  style={{ fontSize: 10, color: 'var(--text-3)' }}
                >
                  {a.skills.length} skills
                </span>
              </div>
            )
          })}
        </div>
        <SectionLabel>Workspace target</SectionLabel>
        <div
          style={{
            padding: 10,
            background: 'var(--bg-3)',
            border: '1px solid var(--line-1)',
            borderRadius: 6,
            fontSize: 12,
            color: 'var(--text-2)',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <Icon.Folder size={12} style={{ color: 'var(--text-3)' }} />
            <span style={{ color: 'var(--text-1)', fontWeight: 500 }}>
              {workspace.name}
            </span>
          </div>
          <div
            className="mono"
            style={{ fontSize: 10.5, color: 'var(--text-4)', marginTop: 4 }}
          >
            {workspace.path} · branch {workspace.branch}
          </div>
        </div>
        <SectionLabel>What happens on apply</SectionLabel>
        <ol
          style={{
            margin: 0,
            paddingLeft: 18,
            fontSize: 12,
            color: 'var(--text-2)',
            lineHeight: 1.7,
          }}
        >
          <li>
            {comp.members.length}개 워크트리 생성 →{' '}
            <code
              style={{
                background: 'var(--bg-3)',
                padding: '1px 5px',
                borderRadius: 3,
                fontSize: 11,
              }}
            >
              .forge/wt-*
            </code>
          </li>
          <li>각 agent는 격리 PTY에서 동시 실행</li>
          <li>완료 후 머지 게이트 (squash, merge-by-agent)</li>
          <li>총 토큰/비용은 Run 헤더에 누적</li>
        </ol>
      </div>
      <div
        style={{
          padding: '12px 18px',
          borderTop: '1px solid var(--line-1)',
          display: 'flex',
          gap: 8,
        }}
      >
        <Btn variant="ghost" onClick={onClose} style={{ flex: 1 }}>
          취소
        </Btn>
        <Btn
          variant="primary"
          icon={<Icon.Play size={11} />}
          onClick={onApply}
          style={{ flex: 1 }}
        >
          Apply &amp; start run
        </Btn>
      </div>
    </div>
  )
}

// ─── shared bits ──────────────────────────────────────────────────

export function SectionLabel({ children }: { children: ReactNode }) {
  return (
    <div
      className="ns mono"
      style={{
        fontSize: 9.5,
        letterSpacing: 1,
        color: 'var(--text-4)',
        fontWeight: 600,
        textTransform: 'uppercase',
        margin: '20px 0 8px',
      }}
    >
      {children}
    </div>
  )
}

// Avoid Pill being flagged as unused — kept for parity with v1 imports.
export const _LibraryPillRef = Pill
