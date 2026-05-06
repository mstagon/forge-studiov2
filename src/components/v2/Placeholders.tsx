// Placeholders — GitPanel + DashboardPanel from panels.jsx.
// Visual-only mocks; actual data integration is wired by main session via stores.

import { useState } from 'react'
// TODO: foundation import — provided by main session
import { Icon } from './icons'
import { Btn, Pill, Kbd, Dot, SectionHead } from './primitives'

// ─── Git Panel ──────────────────────────────────────────────────────

interface GitFileEntry {
  p: string
  s: 'M' | 'A' | 'D'
  a: number
  d: number
}

interface GitCommitEntry {
  h: string
  a: string
  t: string
  time: string
  stash: number
}

const GIT_FILES: GitFileEntry[] = [
  { p: 'lib/features/auth/widgets/signup_form.dart', s: 'M', a: 124, d: 8 },
  { p: 'lib/features/auth/widgets/terms_modal.dart', s: 'A', a: 88, d: 0 },
  { p: 'lib/features/auth/providers/auth_provider.dart', s: 'M', a: 12, d: 0 },
  { p: 'lib/theme/spacing.dart', s: 'M', a: 12, d: 2 },
  { p: 'l10n/ko.arb', s: 'M', a: 6, d: 0 },
  { p: 'l10n/en.arb', s: 'M', a: 6, d: 0 },
  { p: 'test/auth/signup_test.dart', s: 'M', a: 14, d: 4 },
]

const GIT_COMMITS: GitCommitEntry[] = [
  { h: 'a8f2c91', a: 'claude (flutter-ui)', t: 'feat(auth): add TermsModal widget', time: '방금 전', stash: 4 },
  { h: '2c14e8d', a: 'claude (nestjs-auth)', t: 'feat(auth): bcrypt + jwt issuance', time: '1m 전', stash: 4 },
  { h: '7d319ab', a: 'claude (architect)', t: 'docs: ADR-0007 refresh token strategy', time: '3m 전', stash: 3 },
  { h: '4b29f02', a: 'you', t: 'chore: bump deps', time: '2h 전', stash: 0 },
  { h: '9e1c773', a: 'you', t: 'fix: profile route guard', time: '어제', stash: 0 },
  { h: '6f88a14', a: 'claude (reviewer)', t: 'refactor: extract auth helpers', time: '어제', stash: 2 },
]

export interface GitPanelProps {
  density?: 'compact' | 'normal' | 'spacious'
}

export function GitPanel({ density: _density }: GitPanelProps = {}) {
  const [selected, setSelected] = useState<GitFileEntry>(GIT_FILES[0])

  return (
    <div
      data-screen-label="Git"
      style={{
        flex: 1,
        display: 'flex',
        overflow: 'hidden',
        background: 'var(--bg-1)',
      }}
    >
      {/* Status / Commits column */}
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
            padding: '10px 12px',
            borderBottom: '1px solid var(--line-1)',
            display: 'flex',
            alignItems: 'center',
            gap: 8,
          }}
        >
          <Icon.Branch size={13} style={{ color: 'var(--text-2)' }} />
          <span
            className="mono"
            style={{ fontSize: 12, color: 'var(--text-1)', fontWeight: 600 }}
          >
            feature/auth-signup
          </span>
          <span className="mono" style={{ fontSize: 11, color: 'var(--success)' }}>
            ↑12
          </span>
          <div style={{ flex: 1 }} />
          <button
            style={{
              width: 22,
              height: 22,
              borderRadius: 4,
              background: 'transparent',
              border: '1px solid var(--line-2)',
              color: 'var(--text-3)',
              display: 'inline-flex',
              alignItems: 'center',
              justifyContent: 'center',
              cursor: 'pointer',
            }}
          >
            <Icon.ChevronD size={12} />
          </button>
        </div>
        <SectionHead
          title="Changes"
          sub={`${GIT_FILES.length} files · +${GIT_FILES.reduce(
            (a, f) => a + f.a,
            0,
          )} -${GIT_FILES.reduce((a, f) => a + f.d, 0)}`}
          right={
            <Btn variant="ghost" style={{ height: 22, fontSize: 11 }}>
              Stage all
            </Btn>
          }
        />
        <div style={{ flex: 1, overflowY: 'auto', padding: '4px 0', maxHeight: 280 }}>
          {GIT_FILES.map((f) => {
            const sel = selected.p === f.p
            const cs = { M: 'var(--warning)', A: 'var(--success)', D: 'var(--danger)' }[f.s]
            return (
              <button
                key={f.p}
                onClick={() => setSelected(f)}
                style={{
                  width: '100%',
                  display: 'flex',
                  alignItems: 'center',
                  gap: 8,
                  padding: '5px 12px',
                  textAlign: 'left',
                  background: sel ? 'var(--bg-3)' : 'transparent',
                  border: 'none',
                  borderLeft: `2px solid ${sel ? 'var(--accent)' : 'transparent'}`,
                  color: 'var(--text-2)',
                  fontSize: 12,
                  fontFamily: 'var(--font-mono)',
                  cursor: 'pointer',
                }}
              >
                <span style={{ width: 14, color: cs, fontWeight: 700, fontSize: 11 }}>{f.s}</span>
                <span
                  style={{
                    flex: 1,
                    overflow: 'hidden',
                    textOverflow: 'ellipsis',
                    whiteSpace: 'nowrap',
                    color: sel ? 'var(--text-1)' : 'var(--text-2)',
                  }}
                >
                  {f.p}
                </span>
                <span style={{ color: 'var(--success)', fontSize: 10 }}>+{f.a}</span>
                <span style={{ color: 'var(--danger)', fontSize: 10 }}>-{f.d}</span>
              </button>
            )
          })}
        </div>
        <SectionHead title="Recent commits" />
        <div style={{ flex: 1, overflowY: 'auto' }}>
          {GIT_COMMITS.map((c) => (
            <div
              key={c.h}
              style={{
                padding: '8px 12px',
                borderBottom: '1px solid var(--line-1)',
              }}
            >
              <div
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 6,
                  fontSize: 11.5,
                  color: 'var(--text-1)',
                }}
              >
                <span
                  className="mono"
                  style={{ color: 'var(--accent)', fontSize: 11 }}
                >
                  {c.h}
                </span>
                <span
                  style={{
                    flex: 1,
                    overflow: 'hidden',
                    textOverflow: 'ellipsis',
                    whiteSpace: 'nowrap',
                  }}
                >
                  {c.t}
                </span>
              </div>
              <div
                style={{
                  fontSize: 10.5,
                  color: 'var(--text-3)',
                  marginTop: 2,
                  display: 'flex',
                  gap: 8,
                }}
              >
                <span>{c.a}</span>
                <span>·</span>
                <span>{c.time}</span>
              </div>
            </div>
          ))}
        </div>
        <div style={{ padding: 10, borderTop: '1px solid var(--line-1)' }}>
          <textarea
            placeholder="commit message…"
            style={{
              padding: '6px 8px',
              borderRadius: 5,
              background: 'var(--bg-2)',
              border: '1px solid var(--line-2)',
              color: 'var(--text-1)',
              fontSize: 12,
              fontFamily: 'var(--font-mono)',
              outline: 'none',
              width: '100%',
              minHeight: 56,
              resize: 'vertical',
            }}
          />
          <div style={{ display: 'flex', gap: 6, marginTop: 6 }}>
            <Btn style={{ flex: 1 }} variant="primary" icon={<Icon.Check size={12} />}>
              Commit
            </Btn>
            <Btn icon={<Icon.Sparkle size={12} />}>AI msg</Btn>
          </div>
        </div>
      </div>

      {/* Diff viewer */}
      <div
        style={{
          flex: 1,
          minWidth: 0,
          display: 'flex',
          flexDirection: 'column',
          background: '#06080b',
        }}
      >
        <div
          style={{
            padding: '10px 14px',
            borderBottom: '1px solid var(--line-1)',
            background: 'var(--bg-1)',
            display: 'flex',
            alignItems: 'center',
            gap: 10,
          }}
        >
          <Icon.File size={13} style={{ color: 'var(--text-3)' }} />
          <span className="mono" style={{ fontSize: 12, color: 'var(--text-1)' }}>
            {selected.p}
          </span>
          <Pill color="var(--success)">+{selected.a}</Pill>
          <Pill color="var(--danger)">-{selected.d}</Pill>
          <div style={{ flex: 1 }} />
          <Btn variant="ghost" style={{ height: 22, fontSize: 11 }}>
            Discard
          </Btn>
          <Btn style={{ height: 22, fontSize: 11 }}>Stage hunk</Btn>
        </div>
        <div
          style={{
            flex: 1,
            overflow: 'auto',
            padding: 14,
            fontFamily: 'var(--font-mono)',
            fontSize: 12,
            lineHeight: 1.55,
          }}
        >
          <DiffSample />
        </div>
      </div>
    </div>
  )
}

interface DiffLine {
  n: number | string
  t: string
  k: ' ' | '+' | '-' | '@'
}

function DiffSample() {
  const lines: DiffLine[] = [
    { n: 22, t: " import 'package:flutter/material.dart';", k: ' ' },
    { n: 23, t: " import 'package:riverpod/riverpod.dart';", k: ' ' },
    { n: 24, t: "+import 'package:app/features/auth/widgets/terms_modal.dart';", k: '+' },
    { n: '', t: ' ', k: '@' },
    { n: 41, t: ' class SignupForm extends ConsumerStatefulWidget {', k: ' ' },
    { n: 42, t: '   const SignupForm({super.key});', k: ' ' },
    { n: 43, t: ' ', k: ' ' },
    { n: 44, t: '   @override', k: ' ' },
    { n: 45, t: '   ConsumerState<SignupForm> createState() => _SignupFormState();', k: ' ' },
    { n: 46, t: ' }', k: ' ' },
    { n: '', t: ' ', k: '@' },
    { n: 78, t: '         children: [', k: ' ' },
    { n: 79, t: '-          // TODO: terms checkbox', k: '-' },
    { n: 79, t: '+          TermsCheckbox(', k: '+' },
    { n: 80, t: '+            value: _agreed,', k: '+' },
    { n: 81, t: '+            onChanged: (v) => setState(() => _agreed = v),', k: '+' },
    { n: 82, t: '+            onLinkTap: () => showTermsModal(context),', k: '+' },
    { n: 83, t: '+          ),', k: '+' },
    { n: 84, t: '           const SizedBox(height: 16),', k: ' ' },
    { n: 85, t: '           ElevatedButton(', k: ' ' },
    { n: 86, t: '-            onPressed: _submit,', k: '-' },
    { n: 86, t: '+            onPressed: _agreed ? _submit : null,', k: '+' },
    { n: 87, t: '             child: Text(t.signup.cta),', k: ' ' },
  ]
  return (
    <div>
      {lines.map((l, i) => {
        const bg =
          l.k === '+'
            ? 'color-mix(in oklab, var(--success) 8%, transparent)'
            : l.k === '-'
              ? 'color-mix(in oklab, var(--danger) 9%, transparent)'
              : l.k === '@'
                ? 'var(--bg-2)'
                : 'transparent'
        const tcol =
          l.k === '+'
            ? 'var(--success)'
            : l.k === '-'
              ? 'var(--danger)'
              : l.k === '@'
                ? 'var(--text-3)'
                : 'var(--text-2)'
        const sym = l.k === '@' ? ' @@' : l.k
        return (
          <div
            key={i}
            style={{
              display: 'flex',
              background: bg,
              padding: '0 4px',
              whiteSpace: 'pre',
              color: tcol,
              minHeight: 18,
            }}
          >
            <span
              className="tabular"
              style={{
                width: 36,
                color: 'var(--text-4)',
                textAlign: 'right',
                paddingRight: 8,
              }}
            >
              {l.n}
            </span>
            <span style={{ width: 14, color: tcol, opacity: 0.7 }}>{sym}</span>
            <span style={{ flex: 1 }}>{l.t}</span>
          </div>
        )
      })}
    </div>
  )
}

// ─── Dashboard ──────────────────────────────────────────────────────

interface StatCard {
  label: string
  value: string | number
  sub: string
  icon: React.ReactNode
  accent: string
}

interface McpEntry {
  n: string
  s: 'ok' | 'down'
  t: string
  err?: string
}

interface QuickAction {
  i: React.ReactNode
  t: string
  k: string
}

export interface DashboardPanelProps {
  onCmdK?: () => void
}

export function DashboardPanel({ onCmdK }: DashboardPanelProps) {
  const stats: StatCard[] = [
    {
      label: 'agents',
      value: 18,
      sub: 'active in pool',
      icon: <Icon.Users size={13} />,
      accent: 'var(--info)',
    },
    {
      label: 'skills',
      value: 24,
      sub: 'loaded',
      icon: <Icon.Sparkle size={13} />,
      accent: 'var(--accent)',
    },
    {
      label: 'commands',
      value: 12,
      sub: 'slash-commands',
      icon: <Icon.Code size={13} />,
      accent: 'var(--violet)',
    },
    {
      label: 'hooks',
      value: 5,
      sub: 'session lifecycle',
      icon: <Icon.Bolt size={13} />,
      accent: 'var(--warning)',
    },
    {
      label: 'MCPs',
      value: '4/5',
      sub: '1 down',
      icon: <Icon.Cube size={13} />,
      accent: 'var(--success)',
    },
    {
      label: 'rules',
      value: 31,
      sub: 'in CLAUDE.md',
      icon: <Icon.File size={13} />,
      accent: 'var(--text-2)',
    },
  ]
  const mcps: McpEntry[] = [
    { n: 'filesystem', s: 'ok', t: '8ms' },
    { n: 'git', s: 'ok', t: '12ms' },
    { n: 'postgres', s: 'ok', t: '24ms' },
    { n: 'playwright', s: 'ok', t: '180ms' },
    { n: 'linear', s: 'down', t: '—', err: 'auth expired' },
  ]
  const actions: QuickAction[] = [
    { i: <Icon.Plus size={13} />, t: '새 팀 만들기', k: '⌘N' },
    { i: <Icon.Bolt size={13} />, t: '하네스 업데이트', k: '⌘⇧U' },
    { i: <Icon.Sparkle size={13} />, t: 'skill 추가', k: '⌘⇧S' },
    { i: <Icon.Cube size={13} />, t: 'MCP 추가', k: '⌘⇧M' },
    { i: <Icon.Code size={13} />, t: 'command 작성', k: '⌘⇧C' },
    { i: <Icon.Folder size={13} />, t: '워크스페이스 추가', k: '⌘O' },
  ]

  return (
    <div
      data-screen-label="Dashboard"
      style={{
        flex: 1,
        overflow: 'auto',
        background: 'var(--bg-1)',
        padding: 22,
      }}
    >
      <div
        style={{
          display: 'flex',
          alignItems: 'flex-end',
          gap: 14,
          marginBottom: 18,
        }}
      >
        <div>
          <div
            style={{
              fontSize: 22,
              fontWeight: 600,
              color: 'var(--text-1)',
              letterSpacing: -0.4,
            }}
          >
            Dashboard
          </div>
          <div
            style={{
              fontSize: 12.5,
              color: 'var(--text-3)',
              marginTop: 4,
            }}
          >
            하네스 인스펙터 · MCP 상태 · 빠른 액션
          </div>
        </div>
        <div style={{ flex: 1 }} />
        <Btn icon={<Icon.Search size={12} />} kbd="⌘K" onClick={onCmdK}>
          Command palette
        </Btn>
      </div>

      {/* Stats */}
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(6, 1fr)',
          gap: 8,
          marginBottom: 18,
        }}
      >
        {stats.map((s) => (
          <div
            key={s.label}
            style={{
              padding: 12,
              borderRadius: 6,
              background: 'var(--bg-2)',
              border: '1px solid var(--line-1)',
            }}
          >
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 6,
                color: s.accent,
                marginBottom: 8,
              }}
            >
              {s.icon}
              <span
                className="mono"
                style={{
                  fontSize: 10,
                  letterSpacing: 1.2,
                  textTransform: 'uppercase',
                  fontWeight: 600,
                }}
              >
                {s.label}
              </span>
            </div>
            <div
              style={{
                fontSize: 24,
                fontWeight: 600,
                color: 'var(--text-1)',
                letterSpacing: -0.5,
                fontFamily: 'var(--font-mono)',
              }}
            >
              {s.value}
            </div>
            <div style={{ fontSize: 11, color: 'var(--text-3)', marginTop: 2 }}>{s.sub}</div>
          </div>
        ))}
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1.4fr 1fr', gap: 12 }}>
        {/* MCP status */}
        <div
          style={{
            background: 'var(--bg-2)',
            border: '1px solid var(--line-1)',
            borderRadius: 6,
            overflow: 'hidden',
          }}
        >
          <SectionHead
            title="MCP servers"
            sub="4/5 healthy"
            right={
              <Btn
                variant="ghost"
                icon={<Icon.Refresh size={11} />}
                style={{ height: 22, fontSize: 11 }}
              >
                Reconnect
              </Btn>
            }
          />
          {mcps.map((m) => (
            <div
              key={m.n}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 10,
                padding: '10px 12px',
                borderBottom: '1px solid var(--line-1)',
              }}
            >
              <Dot
                color={m.s === 'ok' ? 'var(--success)' : 'var(--danger)'}
                pulse={m.s !== 'ok'}
              />
              <span
                className="mono"
                style={{ fontSize: 12, color: 'var(--text-1)', flex: 1 }}
              >
                {m.n}
              </span>
              {m.err && (
                <span style={{ fontSize: 11, color: 'var(--danger)' }}>{m.err}</span>
              )}
              <span
                className="mono tabular"
                style={{ fontSize: 11, color: 'var(--text-3)' }}
              >
                {m.t}
              </span>
            </div>
          ))}
        </div>

        {/* Quick actions */}
        <div
          style={{
            background: 'var(--bg-2)',
            border: '1px solid var(--line-1)',
            borderRadius: 6,
            overflow: 'hidden',
          }}
        >
          <SectionHead title="Quick actions" />
          <div style={{ padding: 8 }}>
            {actions.map((a, i) => (
              <button
                key={i}
                style={{
                  width: '100%',
                  display: 'flex',
                  alignItems: 'center',
                  gap: 10,
                  padding: '8px 10px',
                  borderRadius: 5,
                  background: 'transparent',
                  border: '1px solid transparent',
                  color: 'var(--text-2)',
                  fontSize: 12.5,
                  cursor: 'pointer',
                }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.background = 'var(--bg-3)'
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.background = 'transparent'
                }}
              >
                <span style={{ color: 'var(--accent)' }}>{a.i}</span>
                <span style={{ flex: 1, textAlign: 'left' }}>{a.t}</span>
                <Kbd>{a.k}</Kbd>
              </button>
            ))}
          </div>
        </div>
      </div>
    </div>
  )
}
