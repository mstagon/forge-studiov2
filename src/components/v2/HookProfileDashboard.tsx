/**
 * HookProfileDashboard — Settings → Harness 카드.
 *
 * Shows per-hook execution stats sourced from `electron/services/HookProfiler`
 * via the `hookProfiler` IPC namespace:
 *   • aggregate stats per (script, event): calls, avg ms, p95, success rate.
 *   • the most recent N (10) durations rendered as a CSS bar chart.
 *   • the most recent failure for each hook, expandable for stdout/stderr.
 *
 * Data refreshes automatically every 5 s while the card is mounted. The card
 * gracefully degrades when the IPC bridge is missing (older dev builds): it
 * renders a stub "no recent executions" state without throwing.
 *
 * The component is intentionally self-contained (no external dependencies on
 * the SettingsFull row primitives) so it can be embedded inline OR opened in a
 * modal later. Today it's mounted inline inside SettingsHarness as a card.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { t } from '@/i18n'
import { Icon } from './icons'
import { Pill } from './primitives'

// ─── IPC payload types (mirror electron/preload.ts) ────────────────────

interface HookExecutionRecord {
  ts: string
  event: string
  script: string
  durationMs: number
  exitCode: number
  output?: string
}

interface HookStats {
  script: string
  event: string
  calls: number
  successCount: number
  failureCount: number
  avgMs: number
  p95Ms: number
  successRate: number
  lastRunTs: string | null
  lastFailure: HookExecutionRecord | null
}

interface HookProfilerApi {
  recent?: (limit?: number) => Promise<HookExecutionRecord[]>
  stats?: (window?: number) => Promise<HookStats[]>
}

function getHookProfilerApi(): HookProfilerApi | undefined {
  if (typeof window === 'undefined') return undefined
  return window.api?.hookProfiler as HookProfilerApi | undefined
}

const REFRESH_MS = 5000
const RECENT_LIMIT = 200
// Sparkline window — most-recent N durations per (script,event) pair.
const BAR_COUNT = 10

// ─── Utility: friendly relative-time / ms formatting ───────────────────

function formatRelativeTs(iso: string | null | undefined): string {
  if (!iso) return '—'
  const t = Date.parse(iso)
  if (Number.isNaN(t)) return '—'
  const diffSec = Math.max(0, Math.round((Date.now() - t) / 1000))
  if (diffSec < 60) return `${diffSec}s`
  if (diffSec < 3600) return `${Math.round(diffSec / 60)}m`
  if (diffSec < 86400) return `${Math.round(diffSec / 3600)}h`
  return `${Math.round(diffSec / 86400)}d`
}

function formatMs(n: number): string {
  if (!Number.isFinite(n)) return '—'
  if (n < 10) return n.toFixed(1)
  return Math.round(n).toString()
}

function formatPct(rate: number): string {
  if (!Number.isFinite(rate)) return '—'
  const pct = Math.round(rate * 1000) / 10 // one decimal
  return `${pct}%`
}

// ─── Sparkline (CSS bars) ──────────────────────────────────────────────

interface SparkBarProps {
  /** Most-recent-first durations. Renders left → right oldest → newest. */
  durations: number[]
  failed: boolean[]
  max: number
}

function SparkBar({ durations, failed, max }: SparkBarProps) {
  // Reverse so older bars render on the left, newest on the right.
  const series = useMemo(() => {
    const order: { d: number; f: boolean }[] = []
    for (let i = durations.length - 1; i >= 0; i--) {
      order.push({ d: durations[i], f: failed[i] })
    }
    while (order.length < BAR_COUNT) {
      order.unshift({ d: 0, f: false })
    }
    return order
  }, [durations, failed])
  return (
    <div
      style={{
        display: 'inline-flex',
        alignItems: 'flex-end',
        gap: 2,
        height: 22,
        width: 78,
      }}
      aria-label={t('hookProfile.windowLabel')}
    >
      {series.map((b, i) => {
        const h = max > 0 ? Math.max(2, Math.round((b.d / max) * 22)) : 2
        return (
          <span
            key={i}
            title={b.d > 0 ? `${formatMs(b.d)}ms${b.f ? ' (failed)' : ''}` : 'no data'}
            style={{
              width: 5,
              height: h,
              borderRadius: 1,
              background: b.d === 0
                ? 'var(--line-1)'
                : b.f
                  ? 'var(--danger)'
                  : 'var(--accent)',
              opacity: b.d === 0 ? 0.5 : 1,
            }}
          />
        )
      })}
    </div>
  )
}

// ─── Per-row failure pop-out ───────────────────────────────────────────

interface FailureBlockProps {
  failure: HookExecutionRecord
}

function FailureBlock({ failure }: FailureBlockProps) {
  return (
    <div
      style={{
        background: 'color-mix(in oklab, var(--danger) 8%, transparent)',
        borderTop: '1px solid color-mix(in oklab, var(--danger) 22%, var(--line-1))',
        padding: '8px 12px 10px',
        fontSize: 11,
        color: 'var(--text-2)',
        lineHeight: 1.45,
      }}
    >
      <div
        style={{
          display: 'flex',
          gap: 8,
          fontFamily: 'var(--font-mono)',
          fontSize: 10.5,
          color: 'var(--text-3)',
          marginBottom: 4,
        }}
      >
        <span>exit {failure.exitCode}</span>
        <span>·</span>
        <span>{formatMs(failure.durationMs)}ms</span>
        <span>·</span>
        <span>{failure.ts}</span>
      </div>
      {failure.output ? (
        <pre
          className="mono"
          style={{
            margin: 0,
            whiteSpace: 'pre-wrap',
            wordBreak: 'break-word',
            color: 'var(--text-1)',
            fontSize: 11,
            maxHeight: 160,
            overflow: 'auto',
          }}
        >
          {failure.output}
        </pre>
      ) : (
        <span style={{ color: 'var(--text-3)' }}>no output captured</span>
      )}
    </div>
  )
}

// ─── Main card ─────────────────────────────────────────────────────────

export interface HookProfileDashboardProps {
  /**
   * Compact mode renders inside an existing settings card (no own header /
   * border). Comfortable mode is the default and renders its own card chrome.
   */
  variant?: 'comfortable' | 'compact'
}

export function HookProfileDashboard({ variant = 'comfortable' }: HookProfileDashboardProps) {
  const [stats, setStats] = useState<HookStats[]>([])
  const [recent, setRecent] = useState<HookExecutionRecord[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [expanded, setExpanded] = useState<string | null>(null)
  const apiAvailable = !!getHookProfilerApi()?.stats
  const mountedRef = useRef(true)

  const refresh = useCallback(async () => {
    const api = getHookProfilerApi()
    if (!api?.stats || !api?.recent) {
      setStats([])
      setRecent([])
      return
    }
    setLoading(true)
    try {
      const [s, r] = await Promise.all([api.stats(), api.recent(RECENT_LIMIT)])
      if (!mountedRef.current) return
      setStats(s)
      setRecent(r)
      setError(null)
    } catch (err) {
      if (!mountedRef.current) return
      setError(err instanceof Error ? err.message : String(err))
    } finally {
      if (mountedRef.current) setLoading(false)
    }
  }, [])

  useEffect(() => {
    mountedRef.current = true
    void refresh()
    const id = window.setInterval(() => {
      void refresh()
    }, REFRESH_MS)
    return () => {
      mountedRef.current = false
      window.clearInterval(id)
    }
  }, [refresh])

  // Map (script,event) → recent executions newest-first for sparkline.
  const recentByKey = useMemo(() => {
    const map = new Map<string, HookExecutionRecord[]>()
    for (const r of recent) {
      const key = `${r.script}::${r.event}`
      const arr = map.get(key) ?? []
      if (arr.length < BAR_COUNT) arr.push(r)
      map.set(key, arr)
    }
    return map
  }, [recent])

  const headerControls = (
    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 8 }}>
      {loading && (
        <span
          aria-hidden
          style={{
            width: 10,
            height: 10,
            borderRadius: '50%',
            border: '2px solid var(--line-2)',
            borderTopColor: 'var(--accent)',
            display: 'inline-block',
            animation: 'hpd-spin 0.7s linear infinite',
          }}
        >
          <style>{`@keyframes hpd-spin { to { transform: rotate(360deg); } }`}</style>
        </span>
      )}
      <button
        onClick={() => void refresh()}
        title="Refresh now"
        style={{
          background: 'transparent',
          border: '1px solid var(--line-2)',
          borderRadius: 4,
          padding: '2px 6px',
          color: 'var(--text-2)',
          fontSize: 11,
          cursor: 'pointer',
          display: 'inline-flex',
          alignItems: 'center',
          gap: 4,
        }}
      >
        <Icon.Refresh size={10} /> Refresh
      </button>
    </span>
  )

  const body = (
    <>
      {error && (
        <div
          style={{
            padding: '10px 12px',
            fontSize: 11.5,
            color: 'var(--danger)',
            background: 'color-mix(in oklab, var(--danger) 8%, transparent)',
            borderBottom: '1px solid var(--line-1)',
          }}
        >
          {error}
        </div>
      )}

      {!apiAvailable && (
        <div
          style={{
            padding: '14px 12px',
            fontSize: 11.5,
            color: 'var(--text-3)',
          }}
        >
          hook-profiler IPC bridge unavailable in this build.
        </div>
      )}

      {apiAvailable && stats.length === 0 && (
        <div
          style={{
            padding: '20px 12px',
            fontSize: 12,
            color: 'var(--text-3)',
            textAlign: 'center',
          }}
        >
          {t('settings.noHookExecutions')}
        </div>
      )}

      {apiAvailable && stats.length > 0 && (
        <div style={{ overflow: 'auto' }}>
          <table
            className="mono"
            style={{
              width: '100%',
              borderCollapse: 'collapse',
              fontSize: 11.5,
            }}
          >
            <thead>
              <tr
                style={{
                  textAlign: 'left',
                  color: 'var(--text-3)',
                  fontSize: 10.5,
                  letterSpacing: 0.4,
                  textTransform: 'uppercase',
                  background: 'var(--bg-1)',
                }}
              >
                <th style={th}>{t('hookProfile.script')}</th>
                <th style={th}>{t('hookProfile.event')}</th>
                <th style={th}>{t('hookProfile.calls')}</th>
                <th style={th}>{t('hookProfile.avgMs')}</th>
                <th style={th}>{t('hookProfile.p95Ms')}</th>
                <th style={th}>{t('hookProfile.successRate')}</th>
                <th style={th}>{t('hookProfile.lastRun')}</th>
                <th style={th}>{t('hookProfile.windowLabel')}</th>
                <th style={th} />
              </tr>
            </thead>
            <tbody>
              {stats.map((s) => {
                const key = `${s.script}::${s.event}`
                const open = expanded === key
                const list = recentByKey.get(key) ?? []
                const durations = list.map((r) => r.durationMs)
                const failed = list.map((r) => r.exitCode !== 0)
                const max = durations.length ? Math.max(...durations) : 0
                const successColor =
                  s.successRate >= 0.98
                    ? 'var(--success)'
                    : s.successRate >= 0.9
                      ? 'var(--warning)'
                      : 'var(--danger)'
                return (
                  <>
                    <tr
                      key={key}
                      style={{
                        borderTop: '1px solid var(--line-1)',
                        background: open ? 'var(--bg-1)' : undefined,
                      }}
                    >
                      <td style={td}>
                        <span style={{ color: 'var(--text-1)', fontWeight: 600 }}>
                          {s.script}
                        </span>
                      </td>
                      <td style={td}>
                        <span style={{ color: 'var(--text-2)' }}>{s.event}</span>
                      </td>
                      <td style={tdNum}>{s.calls}</td>
                      <td style={tdNum}>{formatMs(s.avgMs)}</td>
                      <td style={tdNum}>{formatMs(s.p95Ms)}</td>
                      <td style={tdNum}>
                        <span style={{ color: successColor }}>{formatPct(s.successRate)}</span>
                        {s.failureCount > 0 && (
                          <span style={{ color: 'var(--text-3)', marginLeft: 6 }}>
                            ({s.failureCount} fail)
                          </span>
                        )}
                      </td>
                      <td style={tdNum}>{formatRelativeTs(s.lastRunTs)}</td>
                      <td style={td}>
                        <SparkBar durations={durations} failed={failed} max={max} />
                      </td>
                      <td style={td}>
                        {s.lastFailure && (
                          <button
                            onClick={() => setExpanded((cur) => (cur === key ? null : key))}
                            style={{
                              border: '1px solid var(--line-2)',
                              background: open ? 'var(--bg-3)' : 'transparent',
                              color: 'var(--text-2)',
                              borderRadius: 4,
                              padding: '2px 6px',
                              fontSize: 10.5,
                              cursor: 'pointer',
                              display: 'inline-flex',
                              alignItems: 'center',
                              gap: 4,
                            }}
                            title={t('hookProfile.lastFailure')}
                          >
                            {open ? '−' : '+'} {t('hookProfile.lastFailure')}
                          </button>
                        )}
                      </td>
                    </tr>
                    {open && s.lastFailure && (
                      <tr key={`${key}::failure`}>
                        <td colSpan={9} style={{ padding: 0 }}>
                          <FailureBlock failure={s.lastFailure} />
                        </td>
                      </tr>
                    )}
                  </>
                )
              })}
            </tbody>
          </table>
        </div>
      )}
    </>
  )

  if (variant === 'compact') {
    return (
      <div>
        <div
          style={{
            padding: '10px 12px',
            display: 'flex',
            alignItems: 'center',
            gap: 8,
            borderBottom: '1px solid var(--line-1)',
            fontSize: 12,
          }}
        >
          <Pill color="var(--accent)">{stats.length} hooks</Pill>
          <span style={{ color: 'var(--text-3)' }}>{t('settings.hookProfilingSub')}</span>
          <span style={{ flex: 1 }} />
          {headerControls}
        </div>
        {body}
      </div>
    )
  }

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
        <div>
          <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-1)' }}>
            {t('settings.hookProfiling')}
          </div>
          <div style={{ fontSize: 11, color: 'var(--text-3)', marginTop: 2 }}>
            {t('settings.hookProfilingSub')}
          </div>
        </div>
        <div style={{ marginLeft: 'auto' }}>{headerControls}</div>
      </div>
      {body}
    </div>
  )
}

// ─── small style fragments ─────────────────────────────────────────────

const th: React.CSSProperties = {
  padding: '8px 10px',
  borderBottom: '1px solid var(--line-1)',
  fontWeight: 600,
}

const td: React.CSSProperties = {
  padding: '8px 10px',
  verticalAlign: 'middle',
  color: 'var(--text-2)',
}

const tdNum: React.CSSProperties = {
  ...td,
  fontVariantNumeric: 'tabular-nums',
  whiteSpace: 'nowrap',
}
