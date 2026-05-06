/**
 * Settings — full implementation, 5 sections.
 *
 *   General      — workspaces, defaults, UI toggles
 *   Harness      — version, telemetry, repo policies
 *   Agents       — pool defaults, concurrency, models per role
 *   Integrations — connections + MCP servers
 *   Account      — profile, plan & usage, API keys
 *
 * Source: /tmp/forge_design/forge/project/src/settings_full.jsx
 */

import { useState, type ReactNode } from 'react'
// TODO: foundation import
import { Btn, Pill, Dot, AvatarStack } from './primitives'
import { Icon } from './icons'
import type { WorkspaceSummary } from './types'

export interface SettingsFullProps {
  workspaces: WorkspaceSummary[]
  /** The currently active workspace, used for header context where applicable. */
  workspace?: WorkspaceSummary
}

type SectionId = 'general' | 'harness' | 'agents' | 'integrations' | 'account'

interface SectionSpec {
  id: SectionId
  label: string
  icon: (p: { size?: number; style?: React.CSSProperties }) => ReactNode
}

export function SettingsFull({ workspaces, workspace }: SettingsFullProps) {
  const [section, setSection] = useState<SectionId>('general')
  const sections: SectionSpec[] = [
    { id: 'general',      label: 'General',      icon: Icon.Cog },
    { id: 'harness',      label: 'Harness',      icon: Icon.Bolt },
    { id: 'agents',       label: 'Agents',       icon: Icon.Users },
    { id: 'integrations', label: 'Integrations', icon: Icon.Layers },
    { id: 'account',      label: 'Account',      icon: Icon.Lock },
  ]

  return (
    <div
      data-screen-label="Settings"
      style={{
        flex: 1,
        display: 'flex',
        overflow: 'hidden',
        background: 'var(--bg-1)',
      }}
    >
      <div
        style={{
          width: 220,
          flexShrink: 0,
          borderRight: '1px solid var(--line-1)',
          padding: '18px 0',
          display: 'flex',
          flexDirection: 'column',
        }}
      >
        <div
          className="ns mono"
          style={{
            padding: '0 16px 8px',
            fontSize: 9.5,
            letterSpacing: 1,
            color: 'var(--text-4)',
            fontWeight: 600,
            textTransform: 'uppercase',
          }}
        >
          Settings
        </div>
        {sections.map((s) => {
          const SIcon = s.icon
          const a = section === s.id
          return (
            <button
              key={s.id}
              onClick={() => setSection(s.id)}
              style={{
                width: '100%',
                textAlign: 'left',
                padding: '8px 16px',
                background: a ? 'var(--bg-2)' : 'transparent',
                border: 'none',
                borderLeft: `2px solid ${a ? 'var(--accent)' : 'transparent'}`,
                color: a ? 'var(--text-1)' : 'var(--text-2)',
                fontSize: 12.5,
                display: 'inline-flex',
                alignItems: 'center',
                gap: 8,
                cursor: 'pointer',
              }}
            >
              <SIcon size={13} style={{ opacity: a ? 1 : 0.7 }} />
              {s.label}
            </button>
          )
        })}
      </div>
      <div style={{ flex: 1, overflow: 'auto', padding: '32px 40px' }}>
        {section === 'general' && (
          <SettingsGeneral workspaces={workspaces} workspace={workspace} />
        )}
        {section === 'harness' && <SettingsHarness />}
        {section === 'agents' && <SettingsAgents />}
        {section === 'integrations' && <SettingsIntegrations />}
        {section === 'account' && <SettingsAccount />}
      </div>
    </div>
  )
}

// ─── shared bits ──────────────────────────────────────────────────

function SectionHeader({ title, sub }: { title: string; sub: string }) {
  return (
    <div style={{ marginBottom: 24 }}>
      <div
        style={{
          fontSize: 22,
          fontWeight: 600,
          color: 'var(--text-1)',
          letterSpacing: -0.4,
        }}
      >
        {title}
      </div>
      <div style={{ fontSize: 12.5, color: 'var(--text-3)', marginTop: 4 }}>{sub}</div>
    </div>
  )
}

interface SettingsCardProps {
  title: string
  right?: ReactNode
  children: ReactNode
}

function SettingsCard({ title, right, children }: SettingsCardProps) {
  return (
    <div
      style={{
        background: 'var(--bg-2)',
        border: '1px solid var(--line-1)',
        borderRadius: 8,
        marginBottom: 16,
        overflow: 'hidden',
      }}
    >
      <div
        style={{
          padding: '12px 16px',
          borderBottom: '1px solid var(--line-1)',
          display: 'flex',
          alignItems: 'center',
        }}
      >
        <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-1)' }}>{title}</div>
        {right && <div style={{ marginLeft: 'auto' }}>{right}</div>}
      </div>
      <div>{children}</div>
    </div>
  )
}

interface RowProps {
  label: ReactNode
  sub?: ReactNode
  right?: ReactNode
  last?: boolean
}

function Row({ label, sub, right, last }: RowProps) {
  return (
    <div
      style={{
        padding: '12px 16px',
        display: 'flex',
        alignItems: 'center',
        gap: 14,
        borderBottom: last ? 'none' : '1px solid var(--line-1)',
      }}
    >
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: 12.5, color: 'var(--text-1)', fontWeight: 500 }}>{label}</div>
        {sub && (
          <div
            style={{
              fontSize: 11,
              color: 'var(--text-3)',
              marginTop: 2,
              textWrap: 'pretty',
            } as React.CSSProperties}
          >
            {sub}
          </div>
        )}
      </div>
      {right}
    </div>
  )
}

interface ToggleProps {
  value: boolean
  onChange: (v: boolean) => void
}

function Toggle({ value, onChange }: ToggleProps) {
  return (
    <span
      onClick={() => onChange(!value)}
      style={{
        width: 30,
        height: 16,
        borderRadius: 999,
        flexShrink: 0,
        background: value ? 'var(--success)' : 'var(--bg-1)',
        border: `1px solid ${value ? 'var(--success)' : 'var(--line-2)'}`,
        position: 'relative',
        transition: 'all 120ms',
        cursor: 'pointer',
      }}
    >
      <span
        style={{
          position: 'absolute',
          top: 1,
          left: value ? 15 : 1,
          width: 12,
          height: 12,
          borderRadius: '50%',
          background: value ? '#0b0e13' : 'var(--text-3)',
          transition: 'left 140ms',
        }}
      />
    </span>
  )
}

function Select({ value }: { value: string }) {
  return (
    <div
      style={{
        height: 26,
        padding: '0 8px',
        borderRadius: 5,
        background: 'var(--bg-3)',
        border: '1px solid var(--line-2)',
        display: 'inline-flex',
        alignItems: 'center',
        gap: 6,
        fontSize: 12,
        color: 'var(--text-1)',
        cursor: 'pointer',
        fontFamily: 'var(--font-mono)',
      }}
    >
      {value} <Icon.ChevronD size={11} style={{ color: 'var(--text-3)' }} />
    </div>
  )
}

// ─── General ──────────────────────────────────────────────────────

interface SettingsGeneralProps {
  workspaces: WorkspaceSummary[]
  workspace?: WorkspaceSummary
}

export function SettingsGeneral({ workspaces }: SettingsGeneralProps) {
  const [autoFocus, setAutoFocus] = useState(true)
  const [confirmDestructive, setConfirmDestructive] = useState(true)
  return (
    <>
      <SectionHeader title="General" sub="기본 워크스페이스, 모델, UI 동작" />
      <SettingsCard
        title="Workspaces"
        right={
          <Btn variant="ghost" icon={<Icon.Plus size={11} />}>
            Add workspace
          </Btn>
        }
      >
        {workspaces.map((w, i) => (
          <div
            key={w.id}
            style={{
              padding: '12px 16px',
              display: 'flex',
              alignItems: 'center',
              gap: 12,
              borderBottom:
                i < workspaces.length - 1 ? '1px solid var(--line-1)' : 'none',
            }}
          >
            <Icon.Folder size={14} style={{ color: 'var(--text-3)' }} />
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontSize: 12.5, color: 'var(--text-1)', fontWeight: 500 }}>
                {w.name}
              </div>
              <div
                className="mono"
                style={{ fontSize: 11, color: 'var(--text-3)', marginTop: 2 }}
              >
                {w.path} · harness {w.harness}
              </div>
            </div>
            {w.current && <Pill color="var(--accent)">CURRENT</Pill>}
            <Btn variant="ghost" icon={<Icon.Cog size={11} />}>
              Configure
            </Btn>
          </div>
        ))}
      </SettingsCard>

      <SettingsCard title="Defaults">
        <Row
          label="Default model"
          sub="새 Run 생성 시 멤버에 적용되는 모델"
          right={<Select value="sonnet-4.5" />}
        />
        <Row
          label="Default effort"
          sub="thinking budget. high는 대형 변경에만 권장"
          right={<Select value="medium" />}
        />
        <Row
          label="Worktree root"
          sub="격리 워크트리가 만들어지는 경로"
          right={
            <code
              className="mono"
              style={{
                fontSize: 11,
                color: 'var(--text-2)',
                background: 'var(--bg-3)',
                padding: '3px 8px',
                borderRadius: 3,
              }}
            >
              ~/.forge/worktrees/
            </code>
          }
        />
        <Row
          label="Max parallel runs"
          sub="동시에 활성화할 수 있는 Run 수 (resource bar 기준)"
          right={<Select value="8" />}
          last
        />
      </SettingsCard>

      <SettingsCard title="UI">
        <Row
          label="Auto focus next blocked agent"
          sub="머지 충돌·승인 대기시 해당 패널로 자동 점프"
          right={<Toggle value={autoFocus} onChange={setAutoFocus} />}
        />
        <Row
          label="Confirm destructive commands"
          sub="rm -rf, migrate reset 등 사용자 확인"
          right={<Toggle value={confirmDestructive} onChange={setConfirmDestructive} />}
          last
        />
      </SettingsCard>
    </>
  )
}

// ─── Harness ──────────────────────────────────────────────────────

export function SettingsHarness() {
  const [autoUpdate, setAutoUpdate] = useState(true)
  const [telemetry, setTelemetry] = useState(false)
  const [betaChannel, setBetaChannel] = useState(false)
  return (
    <>
      <SectionHeader title="Harness" sub="forge 자체의 업데이트와 정책" />

      <SettingsCard title="Version">
        <Row
          label="Current version"
          sub="모든 Run이 이 버전에서 실행됩니다"
          right={
            <span className="mono" style={{ fontSize: 12, color: 'var(--text-1)' }}>
              0.3.9
            </span>
          }
        />
        <Row
          label="Update channel"
          sub="stable / beta / nightly"
          right={<Select value="stable" />}
        />
        <Row
          label="Auto-update"
          sub="새 stable 빌드를 자동 적용"
          right={<Toggle value={autoUpdate} onChange={setAutoUpdate} />}
        />
        <Row
          label="Beta channel"
          sub="실험 기능 미리보기 (안정성 보증 없음)"
          right={<Toggle value={betaChannel} onChange={setBetaChannel} />}
          last
        />
      </SettingsCard>

      <SettingsCard title="Telemetry">
        <Row
          label="Send anonymous usage"
          sub="런 통계 + 충돌 리포트. 코드 내용은 전송하지 않음"
          right={<Toggle value={telemetry} onChange={setTelemetry} />}
          last
        />
      </SettingsCard>

      <SettingsCard title="Repository policies">
        <Row
          label="Block force pushes"
          sub="모든 agent가 --force 푸시 차단"
          right={<Toggle value={true} onChange={() => {}} />}
        />
        <Row
          label="Require reviewer"
          sub="머지 게이트에 reviewer agent 의무 통과"
          right={<Toggle value={true} onChange={() => {}} />}
        />
        <Row
          label="Branch prefix"
          sub="새 Run이 만들 브랜치 접두어"
          right={
            <code
              className="mono"
              style={{
                fontSize: 11,
                color: 'var(--text-2)',
                background: 'var(--bg-3)',
                padding: '3px 8px',
                borderRadius: 3,
              }}
            >
              feature/forge-
            </code>
          }
          last
        />
      </SettingsCard>
    </>
  )
}

// ─── Agents ───────────────────────────────────────────────────────

export function SettingsAgents() {
  return (
    <>
      <SectionHeader title="Agents" sub="에이전트 풀 기본값과 동시성" />

      <SettingsCard
        title="Pool defaults"
        right={
          <Btn variant="ghost" onClick={() => {}}>
            Library에서 편집
          </Btn>
        }
      >
        <Row
          label="Default agent set"
          sub="새 Run이 빈 멤버로 시작할 때 추천되는 5명"
          right={
            <AvatarStack
              ids={['flutter-ui', 'nestjs-auth', 'prisma', 'qa-runner', 'reviewer']}
              max={5}
              size={20}
            />
          }
        />
        <Row
          label="Pool size limit"
          sub="머신당 active agent 총합 상한"
          right={<Select value="32" />}
          last
        />
      </SettingsCard>

      <SettingsCard title="Concurrency">
        <Row
          label="Per-Run parallelism"
          sub="한 Run 안에서 동시에 실행되는 agent 수"
          right={<Select value="6" />}
        />
        <Row
          label="Per-machine PTY budget"
          sub="resource bar의 PTY 표시 기준"
          right={<Select value="64" />}
        />
        <Row
          label="Backpressure"
          sub="자원 한도 도달시 동작"
          right={<Select value="queue" />}
          last
        />
      </SettingsCard>

      <SettingsCard title="Models per role">
        {(
          [
            { role: 'Frontend', model: 'sonnet-4.5', count: 1 },
            { role: 'Backend', model: 'sonnet-4.5', count: 1 },
            { role: 'Database', model: 'sonnet-4.5', count: 1 },
            { role: 'Tests', model: 'haiku-4.5', count: 1 },
            { role: 'Review', model: 'opus-4', count: 1 },
            { role: 'Architecture', model: 'opus-4', count: 1 },
          ] as const
        ).map((r, i, arr) => (
          <Row
            key={r.role}
            label={r.role}
            sub={`${r.count} agents`}
            right={<Select value={r.model} />}
            last={i === arr.length - 1}
          />
        ))}
      </SettingsCard>
    </>
  )
}

// ─── Integrations ─────────────────────────────────────────────────

interface IntegrationItem {
  id: string
  name: string
  desc: string
  connected: boolean
  status: string
}

interface McpServerItem {
  name: string
  url: string
  tools: number
  status: 'ok' | 'starting' | 'error'
}

export function SettingsIntegrations() {
  const integrations: IntegrationItem[] = [
    {
      id: 'github',
      name: 'GitHub',
      desc: '리포 연결, PR 자동 생성, 리뷰 코멘트 동기화',
      connected: true,
      status: 'linked as forge-team',
    },
    {
      id: 'linear',
      name: 'Linear',
      desc: 'Run을 Linear 이슈와 연결. 진행 상태 양방향 동기화',
      connected: true,
      status: 'team: forge',
    },
    { id: 'slack', name: 'Slack', desc: 'Run 완료/머지/실패 알림', connected: false, status: '' },
    {
      id: 'figma',
      name: 'Figma',
      desc: '디자인 토큰 → 코드 동기화 (designer agent)',
      connected: false,
      status: '',
    },
    {
      id: 'sentry',
      name: 'Sentry',
      desc: '프로덕션 에러를 Run 컨텍스트에 자동 첨부',
      connected: true,
      status: 'project: forge-app',
    },
    { id: 'vercel', name: 'Vercel', desc: '프리뷰 배포 URL을 Run에 표시', connected: false, status: '' },
  ]
  const mcpServers: McpServerItem[] = [
    { name: 'filesystem', url: 'stdio:///forge-fs', tools: 8, status: 'ok' },
    { name: 'postgres', url: 'stdio:///pg-mcp', tools: 12, status: 'ok' },
    { name: 'playwright', url: 'stdio:///pw-mcp', tools: 6, status: 'starting' },
  ]
  return (
    <>
      <SectionHeader title="Integrations" sub="외부 서비스 연결과 MCP 서버" />

      <SettingsCard
        title="Connections"
        right={
          <Btn variant="ghost" icon={<Icon.Plus size={11} />}>
            Add
          </Btn>
        }
      >
        {integrations.map((it, i) => (
          <div
            key={it.id}
            style={{
              padding: '14px 16px',
              display: 'flex',
              alignItems: 'center',
              gap: 14,
              borderBottom:
                i < integrations.length - 1 ? '1px solid var(--line-1)' : 'none',
            }}
          >
            <span
              style={{
                width: 32,
                height: 32,
                borderRadius: 6,
                flexShrink: 0,
                background: 'var(--bg-3)',
                border: '1px solid var(--line-2)',
                display: 'inline-flex',
                alignItems: 'center',
                justifyContent: 'center',
                fontFamily: 'var(--font-mono)',
                fontSize: 13,
                fontWeight: 600,
                color: 'var(--text-2)',
              }}
            >
              {it.name.slice(0, 2)}
            </span>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <span style={{ fontSize: 13, color: 'var(--text-1)', fontWeight: 600 }}>
                  {it.name}
                </span>
                {it.connected && (
                  <span
                    style={{
                      display: 'inline-flex',
                      alignItems: 'center',
                      gap: 4,
                      color: 'var(--success)',
                      fontSize: 11,
                    }}
                  >
                    <Dot color="var(--success)" /> Connected
                  </span>
                )}
              </div>
              <div
                style={{
                  fontSize: 11.5,
                  color: 'var(--text-3)',
                  marginTop: 3,
                  textWrap: 'pretty',
                } as React.CSSProperties}
              >
                {it.desc}
              </div>
              {it.status && (
                <div
                  className="mono"
                  style={{ fontSize: 10.5, color: 'var(--text-4)', marginTop: 4 }}
                >
                  {it.status}
                </div>
              )}
            </div>
            {it.connected ? (
              <Btn variant="ghost">Configure</Btn>
            ) : (
              <Btn variant="primary" icon={<Icon.Plus size={11} />}>
                Connect
              </Btn>
            )}
          </div>
        ))}
      </SettingsCard>

      <SettingsCard
        title="MCP servers"
        right={
          <Btn variant="ghost" icon={<Icon.Plus size={11} />}>
            Add server
          </Btn>
        }
      >
        {mcpServers.map((s, i, arr) => (
          <div
            key={s.name}
            style={{
              padding: '12px 16px',
              display: 'flex',
              alignItems: 'center',
              gap: 12,
              borderBottom: i < arr.length - 1 ? '1px solid var(--line-1)' : 'none',
            }}
          >
            <Dot
              color={s.status === 'ok' ? 'var(--success)' : 'var(--warning)'}
              pulse={s.status === 'starting'}
            />
            <span
              className="mono"
              style={{ fontSize: 12, color: 'var(--text-1)', fontWeight: 600 }}
            >
              {s.name}
            </span>
            <code
              className="mono"
              style={{
                fontSize: 11,
                color: 'var(--text-3)',
                background: 'var(--bg-3)',
                padding: '2px 6px',
                borderRadius: 3,
              }}
            >
              {s.url}
            </code>
            <div style={{ flex: 1 }} />
            <span className="mono" style={{ fontSize: 10.5, color: 'var(--text-4)' }}>
              {s.tools} tools
            </span>
            <Btn variant="ghost" icon={<Icon.More size={11} />}>
              {' '}
            </Btn>
          </div>
        ))}
      </SettingsCard>
    </>
  )
}

// ─── Account ──────────────────────────────────────────────────────

export function SettingsAccount() {
  const apiKeys = [
    { label: 'CI key — github actions', masked: 'fk_••••••••2bx9', lastUsed: '오늘' },
    { label: 'Local CLI', masked: 'fk_••••••••a7c3', lastUsed: '어제' },
  ]
  return (
    <>
      <SectionHeader title="Account" sub="프로파일, 청구, API 키" />

      <SettingsCard title="Profile">
        <Row
          label="이름"
          sub="팀 멤버에게 표시되는 이름"
          right={
            <code className="mono" style={{ fontSize: 12, color: 'var(--text-1)' }}>
              shsh@forge.dev
            </code>
          }
        />
        <Row
          label="머신"
          sub="이 머신은 mac-mini 라벨로 동기화됨"
          right={
            <code className="mono" style={{ fontSize: 12, color: 'var(--text-1)' }}>
              mac-mini
            </code>
          }
          last
        />
      </SettingsCard>

      <SettingsCard title="Plan & usage">
        <Row
          label="Plan"
          sub="Forge Pro · 무제한 정책 (자원 표시는 정직성 위주)"
          right={<Pill color="var(--accent)">PRO</Pill>}
        />
        <Row
          label="이번 달 토큰"
          sub="모든 Run · 14일 평균 4.1M/일"
          right={
            <span
              className="mono tabular"
              style={{ fontSize: 13, color: 'var(--text-1)', fontWeight: 600 }}
            >
              57.3M
            </span>
          }
        />
        <Row
          label="이번 달 Run 수"
          sub="머지 28 · 폐기 4 · 진행 3"
          right={
            <span
              className="mono tabular"
              style={{ fontSize: 13, color: 'var(--text-1)', fontWeight: 600 }}
            >
              35
            </span>
          }
          last
        />
      </SettingsCard>

      <SettingsCard
        title="API keys"
        right={
          <Btn variant="ghost" icon={<Icon.Plus size={11} />}>
            Generate
          </Btn>
        }
      >
        {apiKeys.map((k, i, arr) => (
          <Row
            key={k.masked}
            label={k.label}
            sub={`마지막 사용 ${k.lastUsed}`}
            right={
              <code
                className="mono"
                style={{
                  fontSize: 11.5,
                  color: 'var(--text-2)',
                  background: 'var(--bg-3)',
                  padding: '3px 8px',
                  borderRadius: 3,
                }}
              >
                {k.masked}
              </code>
            }
            last={i === arr.length - 1}
          />
        ))}
      </SettingsCard>
    </>
  )
}
