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

import { useEffect, useState, type ReactNode } from 'react'
// TODO: foundation import
import { Btn, Pill, Dot, AvatarStack } from './primitives'
import { Icon } from './icons'
import type { WorkspaceSummary } from './types'
import { useWorkspaceStore } from '@/stores/workspace'
import { useModelPolicyStore, type ModelRole } from '@/stores/modelPolicy'
import { CodeGraphViz } from './CodeGraphViz'
import { HarnessLintPanel } from './HarnessLintPanel'
import { SessionPreview } from './SessionPreview'
import { useOnboardingStore } from '@/stores/onboarding'
import { HookProfileDashboard } from './HookProfileDashboard'
import { SettingsErrorLog } from './SettingsErrorLog'
import { McpServerEditor } from './authoring/McpServerEditor'
import { PermissionsEditor } from './authoring/PermissionsEditor'
import { HookEditor } from './authoring/HookEditor'
import {
  DeleteConfirmModal,
  UndoToast,
} from './authoring/LibraryRowMenu'
import {
  getLanguage,
  setLanguage,
  SUPPORTED_LANGUAGES,
  t,
  type SupportedLanguage,
} from '@/i18n'

export interface SettingsFullProps {
  workspaces: WorkspaceSummary[]
  /** The currently active workspace, used for header context where applicable. */
  workspace?: WorkspaceSummary
}

type SectionId = 'general' | 'harness' | 'agents' | 'integrations' | 'account' | 'error-log'

interface SectionSpec {
  id: SectionId
  label: string
  icon: (p: { size?: number; style?: React.CSSProperties }) => ReactNode
}

export function SettingsFull({ workspaces, workspace }: SettingsFullProps) {
  const [section, setSection] = useState<SectionId>('general')
  const sections: SectionSpec[] = [
    { id: 'general',      label: t('settings.general'),      icon: Icon.Cog },
    { id: 'harness',      label: t('settings.harness'),      icon: Icon.Bolt },
    { id: 'agents',       label: t('settings.agents'),       icon: Icon.Users },
    { id: 'integrations', label: t('settings.integrations'), icon: Icon.Layers },
    { id: 'account',      label: t('settings.account'),      icon: Icon.Lock },
    { id: 'error-log',    label: t('settings.errorLog'),     icon: Icon.Activity },
  ]

  // ── Listen for forge:settings-target events (from Dashboard quick actions
  // and TopBar bell) → switch the section so deep-link nav lands on the right
  // card. The optional `card` payload is rebroadcast so child components can
  // scroll into view.
  useEffect(() => {
    const handler = (e: Event) => {
      const detail = (e as CustomEvent<{ section?: string; card?: string }>).detail
      if (!detail?.section) return
      const valid: SectionId[] = ['general', 'harness', 'agents', 'integrations', 'account', 'error-log']
      if ((valid as string[]).includes(detail.section)) {
        setSection(detail.section as SectionId)
        if (detail.card) {
          // Defer so the child cards have mounted under the new section.
          setTimeout(() => {
            const el = document.querySelector(
              `[data-settings-card="${detail.card}"]`,
            ) as HTMLElement | null
            if (el) {
              el.scrollIntoView({ behavior: 'smooth', block: 'start' })
              el.style.transition = 'box-shadow 240ms'
              el.style.boxShadow = '0 0 0 2px var(--accent)'
              window.setTimeout(() => {
                el.style.boxShadow = ''
              }, 1400)
            }
          }, 60)
        }
      }
    }
    window.addEventListener('forge:settings-target', handler)
    return () => window.removeEventListener('forge:settings-target', handler)
  }, [])

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
          {t('settings.title')}
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
        {section === 'harness' && <SettingsHarness workspace={workspace} />}
        {section === 'agents' && <SettingsAgents />}
        {section === 'integrations' && <SettingsIntegrations />}
        {section === 'account' && <SettingsAccount />}
        {section === 'error-log' && <SettingsErrorLog />}
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
  // Slugify the title so deep-link targeting (forge:settings-target with
  // `card`) can scroll the matching SettingsCard into view. Lowercase, ASCII,
  // hyphenated — keeps the data-attribute predictable.
  const cardKey = title
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/(^-|-$)/g, '')
  return (
    <div
      data-settings-card={cardKey}
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

/**
 * 팀 동작 설정 — ~/.forge-studio/config.json (ForgeConfig).
 * forge-team CLI 와 같은 파일을 공유: 여기서 바꾸면 메인 세션이 만드는
 * 팀에도 즉시 반영된다. 기존 하드코딩 값들의 단일 편집 지점 (v0.13.0).
 */
function TeamBehaviorCard() {
  const [cfg, setCfg] = useState<Record<string, unknown> | null>(null)
  const [flash, setFlash] = useState(false)

  useEffect(() => {
    void window.api.forgeConfig.get().then((c) => setCfg(c))
  }, [])

  const save = (partial: Record<string, unknown>) => {
    setCfg((prev) => (prev ? { ...prev, ...partial } : prev))
    void window.api.forgeConfig.set(partial).then((res) => {
      if (res.ok && res.config) {
        setCfg(res.config)
        setFlash(true)
        setTimeout(() => setFlash(false), 1200)
      }
    })
  }

  if (!cfg) return null
  const num = (k: string): number => Number(cfg[k] ?? 0)
  const bool = (k: string): boolean => cfg[k] === true

  const numInput = (key: string, width = 72) => (
    <input
      type="number"
      defaultValue={num(key)}
      key={`${key}-${num(key)}`}
      onBlur={(e) => {
        const v = parseInt(e.target.value, 10)
        if (Number.isFinite(v) && v !== num(key)) save({ [key]: v })
      }}
      style={{
        width,
        background: 'var(--bg-1)',
        color: 'var(--text-1)',
        border: '1px solid var(--line-2)',
        borderRadius: 4,
        padding: '4px 6px',
        fontSize: 11.5,
        fontFamily: 'var(--font-mono)',
        textAlign: 'right',
      }}
    />
  )

  return (
    <SettingsCard
      title="팀 동작"
      right={
        flash ? (
          <span style={{ fontSize: 10, padding: '2px 6px', background: 'var(--success)', color: 'var(--bg-1)', borderRadius: 3, fontWeight: 600 }}>
            저장됨
          </span>
        ) : (
          <span style={{ fontSize: 10, color: 'var(--text-3)', fontFamily: 'var(--font-mono)' }}>
            ~/.forge-studio/config.json
          </span>
        )
      }
    >
      <Row
        label="기본 멤버 모델"
        sub="멤버 spawn 시 model 미지정이면 사용. forge-team CLI 도 동일 적용"
        right={
          <input
            type="text"
            defaultValue={String(cfg.defaultMemberModel ?? '')}
            key={`model-${String(cfg.defaultMemberModel)}`}
            onBlur={(e) => {
              const v = e.target.value.trim()
              if (v && v !== cfg.defaultMemberModel) save({ defaultMemberModel: v })
            }}
            style={{
              width: 170,
              background: 'var(--bg-1)',
              color: 'var(--text-1)',
              border: '1px solid var(--line-2)',
              borderRadius: 4,
              padding: '4px 6px',
              fontSize: 11.5,
              fontFamily: 'var(--font-mono)',
            }}
          />
        }
      />
      <Row
        label="멤버 부팅 대기 (ms)"
        sub="claude/codex 부팅 후 task prompt 주입까지 대기. codex auto-update 가 느리면 늘릴 것"
        right={numInput('memberBootWaitMs')}
      />
      <Row
        label="tmux 스크롤백 (줄)"
        sub="멤버 터미널 history-limit"
        right={numInput('tmuxHistoryLimit', 84)}
      />
      <Row
        label="완료 후 tmux 정리 지연 (초)"
        sub="모든 멤버 완료 후 멤버 세션 자동 kill 까지의 유예"
        right={numInput('tmuxCleanupDelaySec')}
      />
      <Row
        label="1인팀 가드"
        sub="CLI 의 단일 멤버 팀 생성 거부 (--solo 로만 허용)"
        right={<Toggle value={bool('soloTeamGuard')} onChange={(v) => save({ soloTeamGuard: v })} />}
      />
      <Row
        label="활성 팀 경고 임계치"
        sub="활성 팀이 이 수 이상이면 create 시 경고"
        right={numInput('activeTeamWarnThreshold', 56)}
      />
      <Row
        label="merge 후 자동 archive"
        sub="merge 성공 시 worktree/tmux/브랜치 자동 정리 (config 는 history 보존)"
        right={<Toggle value={bool('autoArchiveOnMerge')} onChange={(v) => save({ autoArchiveOnMerge: v })} />}
        last
      />
    </SettingsCard>
  )
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

/**
 * 진짜 native select. onChange 가 있으면 controlled, 없으면 read-only
 * (마이그레이션 호환 — onChange 안 단 옛 호출은 그대로 표시만).
 *
 * 기본값으로 Anthropic + OpenAI 의 자주 쓰는 모델 list 를 옵션 으로 제공.
 * 호출자가 options 를 명시하면 그것 우선.
 */
const DEFAULT_MODEL_OPTIONS = [
  'claude-opus-4-8',
  'claude-sonnet-4-6',
  'claude-haiku-4-5',
  'opus-4',
  'sonnet-4.5',
  'haiku-4.5',
  'gpt-5.5',
  'o1-preview',
  'o3',
]

function Select({
  value,
  options,
  onChange,
  disabled,
}: {
  value: string
  options?: readonly string[]
  onChange?: (v: string) => void
  disabled?: boolean
}) {
  const opts = options ?? (DEFAULT_MODEL_OPTIONS.includes(value) ? DEFAULT_MODEL_OPTIONS : [value, ...DEFAULT_MODEL_OPTIONS])
  if (!onChange) {
    // 호출자가 onChange 안 줬으면 read-only 라벨 (옛 코드 호환)
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
          color: 'var(--text-3)',
          cursor: 'not-allowed',
          fontFamily: 'var(--font-mono)',
          opacity: 0.7,
        }}
        title="이 항목은 아직 read-only — onChange 미구현"
      >
        {value} <Icon.ChevronD size={11} />
      </div>
    )
  }
  return (
    <select
      value={value}
      disabled={disabled}
      onChange={(e) => onChange(e.target.value)}
      style={{
        height: 26,
        padding: '0 8px',
        borderRadius: 5,
        background: 'var(--bg-3)',
        border: '1px solid var(--line-2)',
        fontSize: 12,
        color: 'var(--text-1)',
        cursor: disabled ? 'not-allowed' : 'pointer',
        fontFamily: 'var(--font-mono)',
        appearance: 'auto',
      }}
    >
      {opts.map((o) => (
        <option key={o} value={o}>
          {o}
        </option>
      ))}
    </select>
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
  const setNewWorkspaceDialog = useWorkspaceStore((s) => s.setNewWorkspaceDialog)
  const setActiveWorkspace = useWorkspaceStore((s) => s.setActiveWorkspace)
  const allWorkspaces = useWorkspaceStore((s) => s.workspaces)
  return (
    <>
      <SectionHeader title={t('settings.general')} sub={t('settings.generalSub')} />
      <SettingsCard
        title={t('settings.workspaces')}
        right={
          <Btn
            variant="ghost"
            icon={<Icon.Plus size={11} />}
            onClick={() => setNewWorkspaceDialog(true)}
          >
            {t('settings.addWorkspace')}
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
            {w.current && <Pill color="var(--accent)">{t('settings.current')}</Pill>}
            <Btn
              variant="ghost"
              icon={<Icon.Cog size={11} />}
              onClick={() => {
                // "Configure" on the workspaces row → set this workspace as
                // active so the rest of Settings (Harness / Agents / etc.)
                // operates against it. The path stored in the summary is the
                // canonical lookup key.
                const ws = allWorkspaces.find((x) => x.id === w.id)
                if (ws) void setActiveWorkspace(ws)
              }}
              title={w.current ? '이미 활성 워크스페이스입니다' : '이 워크스페이스로 전환'}
              disabled={!!w.current}
            >
              {t('common.configure')}
            </Btn>
          </div>
        ))}
      </SettingsCard>

      <SettingsCard title="Defaults">
        <Row
          label={t('settings.defaultModel')}
          sub={t('settings.defaultModelSub')}
          right={<Select value="sonnet-4.5" />}
        />
        <Row
          label={t('settings.defaultEffort')}
          sub={t('settings.defaultEffortSub')}
          right={<Select value="medium" />}
        />
        <Row
          label={t('settings.worktreeRoot')}
          sub={t('settings.worktreeRootSub')}
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
          label={t('settings.maxParallelRuns')}
          sub={t('settings.maxParallelRunsSub')}
          right={<Select value="8" />}
          last
        />
      </SettingsCard>

      <SettingsCard title="UI">
        <LanguageRow />
        <Row
          label={t('settings.autoFocusBlocked')}
          sub={t('settings.autoFocusBlockedSub')}
          right={<Toggle value={autoFocus} onChange={setAutoFocus} />}
        />
        <Row
          label={t('settings.confirmDestructive')}
          sub={t('settings.confirmDestructiveSub')}
          right={<Toggle value={confirmDestructive} onChange={setConfirmDestructive} />}
        />
        <OnboardingResetRow />
      </SettingsCard>
    </>
  )
}

/**
 * Language toggle — flips the i18n stub's `currentLanguage` and reloads the
 * window so every component re-renders with the new strings. The full-app
 * reload is intentional: the t() lookups capture the language at render time
 * and there is no global subscription mechanism in the stub.
 */
function LanguageRow() {
  const [lang, setLang] = useState<SupportedLanguage>(() => getLanguage())
  return (
    <Row
      label={t('settings.language')}
      sub={t('settings.languageSub')}
      right={
        <select
          value={lang}
          onChange={(e) => {
            const next = e.target.value as SupportedLanguage
            if (!SUPPORTED_LANGUAGES.includes(next)) return
            setLang(next)
            setLanguage(next)
            // Force a reload so all t() calls re-evaluate. cheap & predictable
            // — we don't have an i18n provider in the stub.
            if (typeof window !== 'undefined') {
              window.location.reload()
            }
          }}
          style={{
            background: 'var(--bg-3)',
            color: 'var(--text-1)',
            border: '1px solid var(--line-2)',
            borderRadius: 5,
            padding: '4px 8px',
            fontSize: 12,
            fontFamily: 'var(--font-mono)',
          }}
        >
          <option value="ko">{t('settings.languageKorean')}</option>
          <option value="en">{t('settings.languageEnglish')}</option>
        </select>
      }
    />
  )
}

function OnboardingResetRow() {
  const show = useOnboardingStore((s) => s.show)
  const reset = useOnboardingStore((s) => s.reset)
  const hasOnboarded = useOnboardingStore((s) => s.hasOnboarded)
  return (
    <Row
      label="Show onboarding again"
      sub={
        hasOnboarded
          ? '5단계 첫 실행 가이드를 다시 띄웁니다.'
          : '첫 실행 가이드가 아직 표시되지 않았습니다.'
      }
      right={
        <span style={{ display: 'inline-flex', gap: 6 }}>
          <Btn variant="ghost" onClick={() => show()}>
            지금 열기
          </Btn>
          {hasOnboarded && (
            <Btn variant="default" icon={<Icon.Refresh size={11} />} onClick={() => reset()}>
              초기화
            </Btn>
          )}
        </span>
      }
      last
    />
  )
}

// ─── Harness ──────────────────────────────────────────────────────

export interface SettingsHarnessProps {
  workspace?: WorkspaceSummary
}

export function SettingsHarness({ workspace }: SettingsHarnessProps = {}) {
  const [autoUpdate, setAutoUpdate] = useState(true)
  const [telemetry, setTelemetry] = useState(false)
  const [betaChannel, setBetaChannel] = useState(false)
  // Repo policy toggles — kept in renderer state until a backend policy
  // surface exists (today they're documented intent, not enforced rules).
  const [blockForcePush, setBlockForcePush] = useState(true)
  const [requireReviewer, setRequireReviewer] = useState(true)
  return (
    <>
      <SectionHeader title={t('settings.harness')} sub={t('settings.harnessSub')} />

      {/* Lint summary + on-demand re-run, opens a full modal with file groups. */}
      <HarnessLintPanel workspacePath={workspace?.path} />

      {/* What Claude actually sees on session start (CLAUDE.md + @-rules + hooks). */}
      <SessionPreview workspacePath={workspace?.path} />

      <CodeReviewGraphCard workspace={workspace} />

      <McpServersCard workspace={workspace} />
      <PermissionsCard workspace={workspace} />
      <HooksCard workspace={workspace} />

      <HookProfileDashboard />

      <SettingsCard title="Version">
        <Row
          label={t('settings.currentVersion')}
          sub={t('settings.currentVersionSub')}
          right={
            <span className="mono" style={{ fontSize: 12, color: 'var(--text-1)' }}>
              0.3.9
            </span>
          }
        />
        <Row
          label={t('settings.updateChannel')}
          sub={t('settings.updateChannelSub')}
          right={<Select value="stable" />}
        />
        <Row
          label={t('settings.autoUpdate')}
          sub={t('settings.autoUpdateSub')}
          right={<Toggle value={autoUpdate} onChange={setAutoUpdate} />}
        />
        <Row
          label={t('settings.betaChannel')}
          sub={t('settings.betaChannelSub')}
          right={<Toggle value={betaChannel} onChange={setBetaChannel} />}
          last
        />
      </SettingsCard>

      <SettingsCard title="Telemetry">
        <Row
          label={t('settings.telemetry')}
          sub={t('settings.telemetrySub')}
          right={<Toggle value={telemetry} onChange={setTelemetry} />}
          last
        />
      </SettingsCard>

      <SettingsCard title="Repository policies">
        <Row
          label="Block force pushes"
          sub="모든 agent가 --force 푸시 차단. 하네스 settings.json 의 PreToolUse 훅이 이미 차단 중 — 이 토글은 표시 동기화 (v0.9.1+ 에서 GUI ↔ hook 양방향 sync)"
          right={<Toggle value={blockForcePush} onChange={setBlockForcePush} />}
        />
        <Row
          label="Require reviewer"
          sub="머지 게이트에 reviewer agent 의무 통과 (forge-team merge 의 검증 추가는 v0.9.1+)"
          right={<Toggle value={requireReviewer} onChange={setRequireReviewer} />}
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

// ─── Agents — Models per role + per-agent override ────────────────

function ModelsPerRoleCard() {
  const byRole = useModelPolicyStore((s) => s.byRole)
  const setRoleModel = useModelPolicyStore((s) => s.setRoleModel)
  const reset = useModelPolicyStore((s) => s.reset)

  const roles: Array<{ role: ModelRole; description: string }> = [
    { role: 'Frontend', description: 'flutter-ui / riverpod-logic / dio-retrofit / nextjs-cms' },
    { role: 'Backend', description: 'nestjs-backend / nestjs-auth' },
    { role: 'Database', description: 'prisma-data / postgres-patterns (정확성 강점 → GPT 권장)' },
    { role: 'Tests', description: 'test-writer / tdd-guide / flutter-driver-e2e' },
    { role: 'Review', description: 'code-reviewer / security-auditor / spec-verifier / refactor-cleaner' },
    { role: 'Architecture', description: 'tech-architect / planner' },
    { role: 'Other', description: 'doc-updater / build-error-resolver / loop-operator / harness-optimizer / 사용자 정의' },
  ]

  return (
    <SettingsCard
      title="역할별 모델"
      right={
        <button
          onClick={() => reset('all')}
          style={{
            padding: '4px 10px',
            fontSize: 11,
            background: 'transparent',
            border: '1px solid var(--line-2)',
            color: 'var(--text-3)',
            borderRadius: 4,
            cursor: 'pointer',
          }}
          title="모든 역할/에이전트 매핑을 default 로 리셋"
        >
          기본값으로
        </button>
      }
    >
      {roles.map((r, i) => (
        <Row
          key={r.role}
          label={r.role}
          sub={r.description}
          right={
            <Select
              value={byRole[r.role]}
              onChange={(v) => setRoleModel(r.role, v)}
            />
          }
          last={i === roles.length - 1}
        />
      ))}
    </SettingsCard>
  )
}

function AgentOverridesCard() {
  const byAgent = useModelPolicyStore((s) => s.byAgent)
  const setAgentModel = useModelPolicyStore((s) => s.setAgentModel)
  const reset = useModelPolicyStore((s) => s.reset)
  const resolve = useModelPolicyStore((s) => s.resolveModel)

  const allAgents = [
    'planner', 'tech-architect', 'flutter-ui', 'riverpod-logic', 'dio-retrofit',
    'nestjs-backend', 'nestjs-auth', 'prisma-data', 'postgres-patterns', 'nextjs-cms',
    'test-writer', 'tdd-guide', 'flutter-driver-e2e', 'code-reviewer', 'security-auditor',
    'spec-verifier', 'refactor-cleaner', 'doc-updater', 'docs-lookup',
    'build-error-resolver', 'loop-operator', 'harness-optimizer',
  ]

  return (
    <SettingsCard
      title="에이전트별 override"
      right={
        <span style={{ fontSize: 10.5, color: 'var(--text-4)' }}>
          비워두면 역할별 모델 사용
        </span>
      }
    >
      {allAgents.map((agent, i) => {
        const explicit = byAgent[agent]
        const effective = resolve(agent)
        return (
          <div
            key={agent}
            style={{
              padding: '10px 16px',
              borderBottom: i < allAgents.length - 1 ? '1px solid var(--line-1)' : 'none',
              display: 'flex',
              alignItems: 'center',
              gap: 12,
            }}
          >
            <span className="mono" style={{ fontSize: 12, color: 'var(--text-1)', flex: 1 }}>
              {agent}
            </span>
            {!explicit && (
              <span style={{ fontSize: 10, color: 'var(--text-4)' }}>
                자동 ({effective.toLowerCase().startsWith('gpt') ? 'GPT' : effective.toUpperCase().replace('CLAUDE-', '')})
              </span>
            )}
            <Select
              value={explicit ?? '(자동)'}
              options={['(자동)', ...DEFAULT_MODEL_OPTIONS]}
              onChange={(v) => {
                if (v === '(자동)') reset({ agentId: agent })
                else setAgentModel(agent, v)
              }}
            />
          </div>
        )
      })}
    </SettingsCard>
  )
}

// ─── Agents ───────────────────────────────────────────────────────

export function SettingsAgents() {
  return (
    <>
      <SectionHeader title={t('settings.agents')} sub={t('settings.agentsSub')} />

      <TeamBehaviorCard />

      <SettingsCard title="Pool defaults">
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

      <ModelsPerRoleCard />
      <AgentOverridesCard />
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
  // 워크스페이스의 .env 토큰 r/w — Integrations 별 envKey 매핑
  const wsPath = useWorkspaceStore((s) => s.activeWorkspace?.path) ?? null
  const envTokens: Array<{ key: string; label: string; help: string }> = [
    { key: 'GITHUB_TOKEN', label: 'GitHub', help: 'PR 자동 생성, 코멘트 동기화. github.com/settings/tokens 에서 발급' },
    { key: 'LINEAR_API_KEY', label: 'Linear', help: 'Run ↔ 이슈 양방향 동기화. linear.app/settings/api 에서 발급' },
    { key: 'SLACK_WEBHOOK_URL', label: 'Slack', help: 'Run 완료/머지/실패 알림. api.slack.com/apps 에서 webhook 생성' },
    { key: 'FIGMA_ACCESS_TOKEN', label: 'Figma', help: '디자인 토큰 동기화. figma.com/developers/api 에서 발급' },
    { key: 'SENTRY_AUTH_TOKEN', label: 'Sentry', help: '프로덕션 에러 → Run 컨텍스트. sentry.io/settings/auth-tokens 에서 발급' },
    { key: 'VERCEL_TOKEN', label: 'Vercel', help: '프리뷰 배포 URL. vercel.com/account/tokens 에서 발급' },
  ]
  const [savedKeys, setSavedKeys] = useState<Set<string>>(new Set())
  const [drafts, setDrafts] = useState<Record<string, string>>({})
  const [busy, setBusy] = useState<string | null>(null)
  const [feedback, setFeedback] = useState<{ key: string; ok: boolean; msg: string } | null>(null)

  useEffect(() => {
    if (!wsPath) return
    void (async () => {
      try {
        const keys = (await window.api?.settings?.readEnvKeys?.({ workspacePath: wsPath })) as string[] | undefined
        setSavedKeys(new Set(keys ?? []))
      } catch {
        // 무시 — 첫 .env 없으면 빈 set
      }
    })()
  }, [wsPath])

  async function saveToken(key: string) {
    if (!wsPath) return
    const value = (drafts[key] ?? '').trim()
    if (!value) return
    setBusy(key)
    setFeedback(null)
    try {
      const result = await window.api?.settings?.saveEnvVar?.({ workspacePath: wsPath, key, value })
      if (result?.ok) {
        setSavedKeys((prev) => new Set(prev).add(key))
        setDrafts((prev) => ({ ...prev, [key]: '' }))
        setFeedback({ key, ok: true, msg: '저장됨 — .env 파일에 추가됨' })
      } else {
        setFeedback({ key, ok: false, msg: result?.error ?? '저장 실패' })
      }
    } catch (err) {
      setFeedback({ key, ok: false, msg: (err as Error).message })
    } finally {
      setBusy(null)
    }
  }

  async function removeToken(key: string) {
    if (!wsPath) return
    setBusy(key)
    setFeedback(null)
    try {
      const result = await window.api?.settings?.removeEnvVar?.({ workspacePath: wsPath, key })
      if (result?.ok) {
        setSavedKeys((prev) => {
          const next = new Set(prev)
          next.delete(key)
          return next
        })
        setFeedback({ key, ok: true, msg: '제거됨' })
      } else {
        setFeedback({ key, ok: false, msg: result?.error ?? '제거 실패' })
      }
    } catch (err) {
      setFeedback({ key, ok: false, msg: (err as Error).message })
    } finally {
      setBusy(null)
    }
  }

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
      <SectionHeader title={t('settings.integrations')} sub={t('settings.integrationsSub')} />

      <SettingsCard
        title="환경 토큰"
        right={
          <span style={{ fontSize: 11, color: 'var(--text-3)' }}>
            {wsPath ? `<workspace>/.env` : '워크스페이스 없음'}
          </span>
        }
      >
        {!wsPath && (
          <div style={{ padding: 14, fontSize: 11.5, color: 'var(--text-3)' }}>
            워크스페이스를 먼저 활성화하세요 — 토큰은 그 워크스페이스의 .env 파일에 저장됩니다.
          </div>
        )}
        {wsPath && envTokens.map((t, i) => {
          const saved = savedKeys.has(t.key)
          const draft = drafts[t.key] ?? ''
          const isBusy = busy === t.key
          const fb = feedback?.key === t.key ? feedback : null
          return (
            <div
              key={t.key}
              style={{
                padding: '12px 16px',
                borderBottom: i < envTokens.length - 1 ? '1px solid var(--line-1)' : 'none',
                display: 'flex',
                flexDirection: 'column',
                gap: 6,
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <span style={{ fontSize: 12.5, fontWeight: 600, color: 'var(--text-1)' }}>{t.label}</span>
                <span className="mono" style={{ fontSize: 10.5, color: 'var(--text-4)' }}>{t.key}</span>
                <span style={{ flex: 1 }} />
                {saved && (
                  <span style={{ fontSize: 10, padding: '2px 6px', background: 'var(--success)', color: 'var(--bg-1)', borderRadius: 3, fontWeight: 600 }}>
                    저장됨
                  </span>
                )}
              </div>
              <div style={{ fontSize: 11, color: 'var(--text-3)' }}>{t.help}</div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                <input
                  type="password"
                  value={draft}
                  onChange={(e) => setDrafts((prev) => ({ ...prev, [t.key]: e.target.value }))}
                  placeholder={saved ? '저장된 값 (수정하려면 새로 입력)' : '토큰 붙여넣기'}
                  style={{
                    flex: 1,
                    background: 'var(--bg-1)',
                    color: 'var(--text-1)',
                    border: '1px solid var(--line-2)',
                    borderRadius: 4,
                    padding: '6px 8px',
                    fontSize: 11.5,
                    fontFamily: 'var(--font-mono)',
                  }}
                />
                <button
                  disabled={!draft.trim() || isBusy}
                  onClick={() => void saveToken(t.key)}
                  style={{
                    padding: '6px 12px',
                    fontSize: 11,
                    background: draft.trim() ? 'var(--accent)' : 'var(--bg-3)',
                    color: 'var(--text-1)',
                    border: '1px solid var(--line-2)',
                    borderRadius: 4,
                    cursor: draft.trim() ? 'pointer' : 'not-allowed',
                  }}
                >
                  저장
                </button>
                {saved && (
                  <button
                    disabled={isBusy}
                    onClick={() => void removeToken(t.key)}
                    style={{
                      padding: '6px 10px',
                      fontSize: 11,
                      background: 'transparent',
                      color: 'var(--danger)',
                      border: '1px solid var(--line-2)',
                      borderRadius: 4,
                      cursor: 'pointer',
                    }}
                  >
                    삭제
                  </button>
                )}
              </div>
              {fb && (
                <div style={{ fontSize: 10.5, color: fb.ok ? 'var(--success)' : 'var(--danger)' }}>
                  {fb.msg}
                </div>
              )}
            </div>
          )
        })}
      </SettingsCard>

      <SettingsCard
        title="Connections"
        right={
          <Btn
            variant="ghost"
            icon={<Icon.Plus size={11} />}
            onClick={() => {
              // No backend integration registry yet — point users at the
              // GitHub README so they can request the integration they need
              // and stay aware that the list is curated, not configurable.
              void window.api?.system?.openExternal(
                'https://github.com/anthropics/forge-studio#integrations',
              )
            }}
            title="새 통합 요청 — GitHub 이슈로 이동 (자체 추가는 v0.9.1+)"
          >
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
              <Btn
                variant="ghost"
                onClick={() => {
                  // Per-integration config UI is v0.9.1++. Until then point at
                  // the integration's own settings page where the user manages
                  // tokens / org connections.
                  const urls: Record<string, string> = {
                    github: 'https://github.com/settings/tokens',
                    linear: 'https://linear.app/settings/api',
                    sentry: 'https://sentry.io/settings/account/api/auth-tokens/',
                  }
                  const url = urls[it.id] ?? `https://${it.id}.com`
                  void window.api?.system?.openExternal(url)
                }}
                title={`${it.name} 외부 설정 페이지 열기 (in-app 설정은 v0.9.1+)`}
              >
                Configure
              </Btn>
            ) : (
              <Btn
                variant="primary"
                icon={<Icon.Plus size={11} />}
                onClick={() => {
                  const urls: Record<string, string> = {
                    slack: 'https://api.slack.com/apps',
                    figma: 'https://www.figma.com/developers/api',
                    vercel: 'https://vercel.com/account/tokens',
                  }
                  const url = urls[it.id] ?? `https://${it.id}.com`
                  void window.api?.system?.openExternal(url)
                }}
                title={`${it.name} 토큰 발급 페이지 — 발급 후 .env에 추가하세요 (in-app 연결은 v0.9.1+)`}
              >
                Connect
              </Btn>
            )}
          </div>
        ))}
      </SettingsCard>

      <SettingsCard
        title="MCP servers"
        right={
          <Btn
            variant="ghost"
            icon={<Icon.Plus size={11} />}
            onClick={() => {
              // The real authoring UI lives under Settings → Harness → MCP
              // servers (full McpServerEditor). Re-route there instead of
              // shipping a duplicate dialog from this read-only summary.
              window.dispatchEvent(
                new CustomEvent('forge:settings-target', {
                  detail: { section: 'harness', card: 'mcp-servers' },
                }),
              )
            }}
            title="Harness 섹션의 전체 MCP 편집기로 이동"
          >
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
            <Btn
              variant="ghost"
              icon={<Icon.More size={11} />}
              onClick={() => {
                window.dispatchEvent(
                  new CustomEvent('forge:settings-target', {
                    detail: { section: 'harness', card: 'mcp-servers' },
                  }),
                )
              }}
              title="Harness 섹션의 MCP 편집기로 이동 (편집·삭제)"
            >
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
      <SectionHeader title={t('settings.account')} sub={t('settings.accountSub')} />

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
          <Btn
            variant="ghost"
            icon={<Icon.Plus size={11} />}
            onClick={() => {
              // Forge doesn't yet host its own API key issuance — direct the
              // user to the Anthropic console where the upstream key is
              // created. Local CI keys will be issued in v0.9.1+ once the
              // backend service is online.
              void window.api?.system?.openExternal(
                'https://console.anthropic.com/settings/keys',
              )
            }}
            title="Anthropic 콘솔에서 API 키 발급 (Forge CI 키는 v0.9.1+)"
          >
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

// ─── Code Review Graph (Harness add-on) ────────────────────────────
//
// Surface for the optional code-review-graph harness module: install / build /
// open visualization. The IPC bridge (window.api.crGraph.*) is being added by
// a peer worker — until it lands the controls degrade to a "not installed"
// state and the buttons no-op with an informational error.
//
// TODO(crGraph-ipc): replace the loose `any` access with a typed import once
// the preload bridge is committed.

interface CrGraphStats {
  nodes: number
  edges: number
  files: number
  languages: number
  lastBuiltAt?: string | null
}

interface CrGraphInstallStatus {
  installed: boolean
  version?: string
}

interface CrGraphApi {
  isInstalled?: () => Promise<CrGraphInstallStatus>
  install?: (mode: 'pipx' | string) => Promise<void>
  build?: (workspacePath: string) => Promise<void>
  stats?: (workspacePath: string) => Promise<CrGraphStats | null>
  vizStart?: (workspacePath: string) => Promise<{ url: string; pid: number | string }>
  vizStop?: (pid: number | string) => Promise<void>
}

function getCrGraphApi(): CrGraphApi | undefined {
  if (typeof window === 'undefined') return undefined
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const w = window as any
  return w?.api?.crGraph as CrGraphApi | undefined
}

function formatRelative(iso?: string | null): string {
  if (!iso) return '한 번도 빌드 안 함'
  const t = Date.parse(iso)
  if (Number.isNaN(t)) return '한 번도 빌드 안 함'
  const diffSec = Math.max(0, Math.round((Date.now() - t) / 1000))
  if (diffSec < 60) return `${diffSec}초 전`
  const min = Math.round(diffSec / 60)
  if (min < 60) return `${min}분 전`
  const hr = Math.round(min / 60)
  if (hr < 24) return `${hr}시간 전`
  return `${Math.round(hr / 24)}일 전`
}

interface CodeReviewGraphCardProps {
  workspace?: WorkspaceSummary
}

function CodeReviewGraphCard({ workspace }: CodeReviewGraphCardProps) {
  const [status, setStatus] = useState<CrGraphInstallStatus | null>(null)
  const [stats, setStats] = useState<CrGraphStats | null>(null)
  const [installing, setInstalling] = useState(false)
  const [building, setBuilding] = useState(false)
  const [progressSec, setProgressSec] = useState(0)
  const [error, setError] = useState<string | null>(null)
  const [vizOpen, setVizOpen] = useState(false)

  const api = getCrGraphApi()
  const apiAvailable = Boolean(api?.isInstalled)
  const wsPath = workspace?.path

  // Refresh install/stats whenever the workspace changes.
  useEffect(() => {
    let cancelled = false

    async function load() {
      if (!api?.isInstalled) {
        if (!cancelled) {
          setStatus({ installed: false })
          setStats(null)
        }
        return
      }
      try {
        const s = await api.isInstalled()
        if (cancelled) return
        setStatus(s)
        if (s.installed && wsPath && api.stats) {
          const next = await api.stats(wsPath)
          if (!cancelled) setStats(next ?? null)
        } else if (!cancelled) {
          setStats(null)
        }
      } catch (err) {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : String(err))
        }
      }
    }

    void load()
    return () => {
      cancelled = true
    }
  }, [api, wsPath])

  // Drive the "12s" progress counter while a long-running op is in flight.
  useEffect(() => {
    if (!installing && !building) {
      setProgressSec(0)
      return
    }
    setProgressSec(0)
    const start = Date.now()
    const id = window.setInterval(() => {
      setProgressSec(Math.round((Date.now() - start) / 1000))
    }, 1000)
    return () => window.clearInterval(id)
  }, [installing, building])

  const installed = status?.installed ?? false
  const busy = installing || building

  async function handleInstall() {
    if (!api?.install) {
      setError(
        'crGraph IPC bridge not available yet. window.api.crGraph.install will be wired by a peer worker.',
      )
      return
    }
    setError(null)
    setInstalling(true)
    try {
      await api.install('pipx')
      if (api.isInstalled) setStatus(await api.isInstalled())
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    } finally {
      setInstalling(false)
    }
  }

  async function handleBuild() {
    if (!api?.build || !wsPath) {
      setError('build 호출 불가: 활성 워크스페이스 또는 IPC 미준비')
      return
    }
    setError(null)
    setBuilding(true)
    try {
      await api.build(wsPath)
      if (api.stats) setStats(await api.stats(wsPath))
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    } finally {
      setBuilding(false)
    }
  }

  function handleOpenViz() {
    if (!wsPath) {
      setError('활성 워크스페이스 없음 — 시각화를 열 수 없습니다.')
      return
    }
    setError(null)
    setVizOpen(true)
  }

  // ─── Status badge ───
  let badge: ReactNode
  if (building) {
    badge = <Pill color="var(--warning)">빌드 중</Pill>
  } else if (installing) {
    badge = <Pill color="var(--warning)">설치 중</Pill>
  } else if (!installed) {
    badge = <Pill color="var(--text-3)">설치 안 됨</Pill>
  } else {
    badge = (
      <Pill color="var(--success)">
        설치됨{status?.version ? ` · ${status.version}` : ''}
      </Pill>
    )
  }

  const statCells: Array<{ label: string; value: string | number }> = [
    { label: 'nodes', value: stats?.nodes ?? '—' },
    { label: 'edges', value: stats?.edges ?? '—' },
    { label: 'files', value: stats?.files ?? '—' },
    { label: 'languages', value: stats?.languages ?? '—' },
  ]

  return (
    <>
      <SettingsCard
        title="Code Review Graph"
        right={
          <span style={{ display: 'inline-flex', alignItems: 'center', gap: 8 }}>
            {badge}
            {!apiAvailable && (
              <span
                style={{
                  fontSize: 10,
                  color: 'var(--text-4)',
                  fontFamily: 'var(--font-mono)',
                }}
              >
                ipc pending
              </span>
            )}
          </span>
        }
      >
        {/* Description row */}
        <Row
          label="저장소 의존성 + 호출 그래프"
          sub={`마지막 빌드: ${formatRelative(stats?.lastBuiltAt)}${
            busy ? ` · 작업 중… (${progressSec}s)` : ''
          }`}
          right={
            busy ? (
              <span
                aria-hidden
                style={{
                  width: 14,
                  height: 14,
                  borderRadius: '50%',
                  border: '2px solid var(--line-2)',
                  borderTopColor: 'var(--accent)',
                  display: 'inline-block',
                  animation: 'crg-spin 0.7s linear infinite',
                }}
              >
                <style>{`@keyframes crg-spin { to { transform: rotate(360deg); } }`}</style>
              </span>
            ) : (
              <Icon.Layers size={14} style={{ color: 'var(--text-3)' }} />
            )
          }
        />

        {/* Stats grid (only when installed) */}
        {installed && (
          <div
            style={{
              padding: '12px 16px',
              borderBottom: '1px solid var(--line-1)',
              display: 'grid',
              gridTemplateColumns: 'repeat(4, 1fr)',
              gap: 8,
            }}
          >
            {statCells.map((c) => (
              <div
                key={c.label}
                style={{
                  padding: 10,
                  borderRadius: 6,
                  background: 'var(--bg-1)',
                  border: '1px solid var(--line-1)',
                }}
              >
                <div
                  className="mono"
                  style={{
                    fontSize: 9.5,
                    letterSpacing: 1.2,
                    textTransform: 'uppercase',
                    fontWeight: 600,
                    color: 'var(--text-3)',
                    marginBottom: 6,
                  }}
                >
                  {c.label}
                </div>
                <div
                  style={{
                    fontSize: 18,
                    fontWeight: 600,
                    color: 'var(--text-1)',
                    fontFamily: 'var(--font-mono)',
                    letterSpacing: -0.4,
                  }}
                >
                  {c.value}
                </div>
              </div>
            ))}
          </div>
        )}

        {error && (
          <div
            style={{
              padding: '10px 16px',
              borderBottom: '1px solid var(--line-1)',
              fontSize: 11.5,
              color: 'var(--danger)',
              background: 'color-mix(in oklab, var(--danger) 8%, transparent)',
            }}
          >
            {error}
          </div>
        )}

        {/* Actions */}
        <div
          style={{
            padding: '12px 16px',
            display: 'flex',
            alignItems: 'center',
            gap: 8,
            flexWrap: 'wrap',
          }}
        >
          {!installed && (
            <Btn
              variant="primary"
              icon={<Icon.Plus size={11} />}
              onClick={handleInstall}
              disabled={busy}
            >
              Install via pipx
            </Btn>
          )}
          {installed && (
            <Btn
              variant="default"
              icon={<Icon.Refresh size={11} />}
              onClick={handleBuild}
              disabled={busy || !wsPath}
            >
              Rebuild graph
            </Btn>
          )}
          <Btn
            variant="ghost"
            icon={<Icon.Activity size={11} />}
            onClick={handleOpenViz}
            disabled={busy || !wsPath}
          >
            Open Visualization
          </Btn>
          {!wsPath && (
            <span style={{ fontSize: 11, color: 'var(--text-4)', marginLeft: 'auto' }}>
              활성 워크스페이스를 먼저 선택하세요
            </span>
          )}
        </div>
      </SettingsCard>

      {vizOpen && wsPath && (
        <CodeGraphViz workspacePath={wsPath} onClose={() => setVizOpen(false)} />
      )}
    </>
  )
}

// ─── MCP servers card ──────────────────────────────────────────────
//
// Lists every entry in `.claude/mcp.json` with its transport + tool count
// proxy (args length / URL). Each row gets [Edit][Delete]; the card header
// has "+ MCP server" → opens McpServerEditor in create mode.

interface McpServerEntry {
  name: string
  spec: {
    command?: string
    args?: string[]
    env?: Record<string, string>
    type?: 'stdio' | 'http' | 'sse'
    url?: string
    disabled?: boolean
  }
}

interface McpServersCardProps {
  workspace?: WorkspaceSummary
}

function McpServersCard({ workspace }: McpServersCardProps) {
  const wsPath = workspace?.path
  const [servers, setServers] = useState<McpServerEntry[]>([])
  const [loading, setLoading] = useState(true)
  const [editing, setEditing] = useState<McpServerEntry | { create: true } | null>(null)
  const [deleting, setDeleting] = useState<McpServerEntry | null>(null)
  const [toast, setToast] = useState<{ message: string } | null>(null)

  async function refresh() {
    if (!wsPath) {
      setServers([])
      setLoading(false)
      return
    }
    try {
      const list = (await window.api.harness.listMcpServers(wsPath)) as McpServerEntry[]
      setServers(list)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    setLoading(true)
    void refresh()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [wsPath])

  async function handleDelete(entry: McpServerEntry) {
    if (!wsPath) return
    await window.api.harness.removeMcpServer(wsPath, entry.name)
    setDeleting(null)
    setToast({ message: `MCP 서버 ${entry.name} 삭제됨` })
    await refresh()
  }

  return (
    <SettingsCard
      title="MCP servers"
      right={
        <Btn
          variant="ghost"
          icon={<Icon.Plus size={11} />}
          onClick={() => setEditing({ create: true })}
          disabled={!wsPath}
        >
          MCP server
        </Btn>
      }
    >
      {!wsPath ? (
        <Row label="활성 워크스페이스 없음" sub="워크스페이스를 선택하면 MCP 설정을 편집할 수 있습니다." last />
      ) : loading ? (
        <Row label="불러오는 중…" last />
      ) : servers.length === 0 ? (
        <Row
          label="등록된 MCP 서버 없음"
          sub=".claude/mcp.json 의 mcpServers 가 비어 있습니다."
          last
        />
      ) : (
        servers.map((s, i) => {
          const transport = s.spec.type ?? 'stdio'
          const target =
            transport === 'stdio'
              ? `${s.spec.command ?? ''} ${(s.spec.args ?? []).join(' ')}`.trim()
              : (s.spec.url ?? '')
          return (
            <div
              key={s.name}
              style={{
                padding: '12px 16px',
                display: 'flex',
                alignItems: 'center',
                gap: 12,
                borderBottom: i < servers.length - 1 ? '1px solid var(--line-1)' : 'none',
              }}
            >
              <Dot
                color={s.spec.disabled ? 'var(--text-4)' : 'var(--success)'}
                size={6}
              />
              <span
                className="mono"
                style={{ fontSize: 12, color: 'var(--text-1)', fontWeight: 600 }}
              >
                {s.name}
              </span>
              <Pill color="var(--text-3)">{transport}</Pill>
              {s.spec.disabled && <Pill color="var(--warning)">DISABLED</Pill>}
              <code
                className="mono"
                style={{
                  fontSize: 11,
                  color: 'var(--text-3)',
                  background: 'var(--bg-3)',
                  padding: '2px 6px',
                  borderRadius: 3,
                  overflow: 'hidden',
                  textOverflow: 'ellipsis',
                  whiteSpace: 'nowrap',
                  maxWidth: 360,
                }}
              >
                {target || '—'}
              </code>
              <div style={{ flex: 1 }} />
              <Btn variant="ghost" onClick={() => setEditing(s)}>
                Edit
              </Btn>
              <Btn variant="ghost" onClick={() => setDeleting(s)}>
                <Icon.X size={11} />
              </Btn>
            </div>
          )
        })
      )}

      {editing && wsPath && (
        <McpServerEditor
          workspacePath={wsPath}
          editing={'create' in editing ? undefined : editing}
          existingNames={servers.map((s) => s.name)}
          onClose={() => setEditing(null)}
          onSaved={async () => {
            setEditing(null)
            await refresh()
          }}
        />
      )}

      {deleting && wsPath && (
        <DeleteConfirmModal
          kind="mcp-server"
          name={deleting.name}
          onCancel={() => setDeleting(null)}
          onConfirm={() => handleDelete(deleting)}
        />
      )}

      {toast && (
        <UndoToast
          message={toast.message}
          onUndo={null}
          onClose={() => setToast(null)}
        />
      )}
    </SettingsCard>
  )
}

// ─── Permissions card ──────────────────────────────────────────────

interface PermissionsCardProps {
  workspace?: WorkspaceSummary
}

function PermissionsCard({ workspace }: PermissionsCardProps) {
  const wsPath = workspace?.path
  const [perms, setPerms] = useState<{ allow: string[]; deny: string[] }>({
    allow: [],
    deny: [],
  })
  const [loading, setLoading] = useState(true)
  const [open, setOpen] = useState(false)

  async function refresh() {
    if (!wsPath) {
      setPerms({ allow: [], deny: [] })
      setLoading(false)
      return
    }
    try {
      const next = await window.api.harness.getPermissions(wsPath)
      setPerms(next)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    setLoading(true)
    void refresh()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [wsPath])

  return (
    <SettingsCard
      title="Permissions"
      right={
        <Btn
          variant="ghost"
          icon={<Icon.Lock size={11} />}
          onClick={() => setOpen(true)}
          disabled={!wsPath}
        >
          Edit
        </Btn>
      }
    >
      {!wsPath ? (
        <Row label="활성 워크스페이스 없음" last />
      ) : loading ? (
        <Row label="불러오는 중…" last />
      ) : (
        <>
          <Row
            label="Allow rules"
            sub="명시적으로 허용된 명령 / 경로 패턴"
            right={
              <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
                <Dot color="var(--success)" size={6} />
                <span
                  className="mono tabular"
                  style={{ fontSize: 12, color: 'var(--text-1)' }}
                >
                  {perms.allow.length}
                </span>
              </span>
            }
          />
          <Row
            label="Deny rules"
            sub="차단된 명령 / 경로 패턴 (Allow 보다 우선)"
            right={
              <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
                <Dot color="var(--danger)" size={6} />
                <span
                  className="mono tabular"
                  style={{ fontSize: 12, color: 'var(--text-1)' }}
                >
                  {perms.deny.length}
                </span>
              </span>
            }
            last
          />
        </>
      )}

      {open && wsPath && (
        <PermissionsEditor
          workspacePath={wsPath}
          onClose={() => setOpen(false)}
          onSaved={(next) => {
            setPerms(next)
            setOpen(false)
          }}
        />
      )}
    </SettingsCard>
  )
}

// ─── Hooks card ────────────────────────────────────────────────────

interface HooksCardProps {
  workspace?: WorkspaceSummary
}

function HooksCard({ workspace }: HooksCardProps) {
  const wsPath = workspace?.path
  const [eventCounts, setEventCounts] = useState<Record<string, number>>({})
  const [loading, setLoading] = useState(true)
  const [creating, setCreating] = useState(false)

  async function refresh() {
    if (!wsPath) {
      setEventCounts({})
      setLoading(false)
      return
    }
    try {
      const list = (await window.api.harness.listHooks(wsPath)) as Array<{ event: string }>
      const counts: Record<string, number> = {}
      for (const h of list) {
        counts[h.event] = (counts[h.event] ?? 0) + 1
      }
      setEventCounts(counts)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    setLoading(true)
    void refresh()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [wsPath])

  const events = ['SessionStart', 'PreToolUse', 'PostToolUse', 'Stop', 'PreCompact', 'Notification']

  return (
    <SettingsCard
      title="Hooks"
      right={
        <Btn
          variant="ghost"
          icon={<Icon.Plus size={11} />}
          onClick={() => setCreating(true)}
          disabled={!wsPath}
        >
          hook
        </Btn>
      }
    >
      {!wsPath ? (
        <Row label="활성 워크스페이스 없음" last />
      ) : loading ? (
        <Row label="불러오는 중…" last />
      ) : (
        events.map((ev, i) => (
          <Row
            key={ev}
            label={ev}
            sub={`${eventCounts[ev] ?? 0}개 등록됨`}
            right={
              <span
                className="mono tabular"
                style={{ fontSize: 12, color: 'var(--text-1)' }}
              >
                {eventCounts[ev] ?? 0}
              </span>
            }
            last={i === events.length - 1}
          />
        ))
      )}

      {creating && wsPath && (
        <HookEditor
          workspacePath={wsPath}
          onClose={() => setCreating(false)}
          onSaved={async () => {
            setCreating(false)
            await refresh()
          }}
        />
      )}
    </SettingsCard>
  )
}
