/**
 * ResourceBar — workspace footer strip showing live machine usage.
 *
 * Renders four metered fields: CPU · MEM · DISK · PTY.
 * Pulls real metrics from main via `window.api.system.resourceSnapshot()`
 * every 5s. When the IPC bridge is unavailable (older preload, storybook,
 * etc.) the bar renders zeros so it's visibly inert rather than showing
 * synthetic values.
 *
 * Source: /tmp/forge_design/forge/project/src/workspace_v2.jsx (ResourceBar).
 */
import { useEffect, useState } from 'react'
import type { ResourceUsage } from './types'

export interface ResourceBarProps {
  /** Number of active runs — surfaced in the footer hint. */
  runsActive?: number
  /** Real machine metrics. When supplied, overrides the live snapshot. */
  usage?: Partial<ResourceUsage>
  /** Footer hint shown on the right. */
  hint?: string
}

interface MeterItem {
  label: string
  value: string
  pct: number
}

interface ResourceSnapshot extends ResourceUsage {
  ts: number
}

export function ResourceBar({
  runsActive = 0,
  usage,
  hint = '무제한 정책 · 자원 표시는 정직성 위주',
}: ResourceBarProps) {
  const [snap, setSnap] = useState<ResourceSnapshot | null>(null)

  useEffect(() => {
    if (usage) return // explicit override — skip polling entirely
    let cancelled = false
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const sysApi = (window as any)?.api?.system as
      | { resourceSnapshot?: () => Promise<ResourceSnapshot> }
      | undefined
    if (typeof sysApi?.resourceSnapshot !== 'function') {
      // No IPC — leave snap null so we render zeros.
      return
    }
    const tick = async () => {
      try {
        const next = await sysApi.resourceSnapshot!()
        if (!cancelled) setSnap(next)
      } catch (err) {
        // Defer to the next tick — single failures shouldn't blank the bar.
        console.warn('[ResourceBar] snapshot failed:', err)
      }
    }
    tick()
    const id = setInterval(tick, 5000)
    return () => {
      cancelled = true
      clearInterval(id)
    }
  }, [usage])

  const cpu = usage?.cpu ?? snap?.cpu ?? 0
  const memUsed = usage?.memUsed ?? snap?.memUsed ?? 0
  const memTotal = usage?.memTotal ?? snap?.memTotal ?? 0
  const memTotalSafe = memTotal > 0 ? memTotal : 1
  const diskGb = usage?.diskDeltaGb ?? snap?.diskDeltaGb ?? 0
  const ptys = usage?.ptyCount ?? snap?.ptyCount ?? 0

  const diskLabel =
    diskGb >= 1
      ? `${diskGb.toFixed(1)} GB worktree growth`
      : `${Math.max(0, Math.round(diskGb * 1024))} MB worktree growth`

  const items: MeterItem[] = [
    { label: 'CPU',  value: `${Math.round(cpu)}%`,                        pct: cpu / 100 },
    {
      label: 'MEM',
      value: `${memUsed.toFixed(1)} / ${memTotal > 0 ? memTotal.toFixed(0) : '—'} GB`,
      pct: memUsed / memTotalSafe,
    },
    { label: 'DISK', value: diskLabel,                                    pct: Math.min(0.5, diskGb / 50) },
    { label: 'PTY',  value: `${ptys} sessions`,                           pct: ptys / 64 },
  ]

  // Threshold-aware bar colour. CPU/MEM use the spec'd 80%/85% warn lines.
  function colourFor(label: string, pct: number): string {
    if (label === 'CPU') {
      if (pct > 0.9) return 'var(--danger)'
      if (pct > 0.8) return 'var(--warning)'
      return 'var(--success)'
    }
    if (label === 'MEM') {
      if (pct > 0.95) return 'var(--danger)'
      if (pct > 0.85) return 'var(--warning)'
      return 'var(--success)'
    }
    if (pct > 0.85) return 'var(--danger)'
    if (pct > 0.65) return 'var(--warning)'
    return 'var(--success)'
  }

  const footer = runsActive > 0 ? `${hint} · ${runsActive} runs` : hint

  return (
    <div
      className="ns mono"
      style={{
        flexShrink: 0, height: 26, padding: '0 14px',
        borderTop: '1px solid var(--line-1)', background: 'var(--bg-1)',
        display: 'flex', alignItems: 'center', gap: 18,
        fontSize: 10.5, color: 'var(--text-3)', fontFamily: 'var(--font-mono)',
      }}
    >
      <span style={{ color: 'var(--text-4)', fontWeight: 600, letterSpacing: 0.6 }}>
        RESOURCES
      </span>
      {items.map((it) => (
        <span
          key={it.label}
          style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}
        >
          <span style={{ color: 'var(--text-4)' }}>{it.label}</span>
          <span style={{
            display: 'inline-block', width: 60, height: 4, borderRadius: 2,
            background: 'var(--bg-3)', overflow: 'hidden', position: 'relative',
          }}>
            <span style={{
              display: 'block', height: '100%',
              width: `${Math.min(100, Math.max(0, it.pct * 100))}%`,
              background: colourFor(it.label, it.pct),
            }} />
          </span>
          <span className="tabular" style={{ color: 'var(--text-2)' }}>
            {it.value}
          </span>
        </span>
      ))}
      <div style={{ flex: 1 }} />
      <span style={{ color: 'var(--text-4)' }}>{footer}</span>
    </div>
  )
}
