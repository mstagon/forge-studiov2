/**
 * ResourceBar — workspace footer strip showing live machine usage.
 *
 * Renders four metered fields: CPU · MEM · DISK · PTY.
 * Values self-tick every 1.5s when no real metrics are supplied.
 *
 * Source: /tmp/forge_design/forge/project/src/workspace_v2.jsx (ResourceBar).
 */
import { useEffect, useState } from 'react'
import type { ResourceUsage } from './types'

export interface ResourceBarProps {
  /** Number of active runs — used to nudge synthetic CPU/PTY when no real
   *  metrics are supplied. */
  runsActive?: number
  /** Real machine metrics. When supplied, overrides synthetic values. */
  usage?: Partial<ResourceUsage>
  /** Footer hint shown on the right. */
  hint?: string
}

interface MeterItem {
  label: string
  value: string
  pct: number
}

export function ResourceBar({
  runsActive = 0,
  usage,
  hint = '무제한 정책 · 자원 표시는 정직성 위주',
}: ResourceBarProps) {
  const [tick, setTick] = useState(0)

  useEffect(() => {
    if (usage) return // real metrics — no synthetic ticking needed
    const id = setInterval(() => setTick((t) => t + 1), 1500)
    return () => clearInterval(id)
  }, [usage])

  // Synthetic values seeded by tick + runsActive so the bar feels alive even
  // when no IPC metrics provider is wired yet.
  const synth = {
    cpu: 28 + Math.round(Math.sin(tick / 3) * 6 + runsActive * 4),
    memUsed: 6.4 + Math.sin(tick / 5) * 0.3,
    memTotal: 32,
    diskMb: 142,
    ptys: 14 + runsActive * 2,
  }

  const cpu = usage?.cpu ?? synth.cpu
  const memUsed = usage?.memUsed ?? synth.memUsed
  const memTotal = usage?.memTotal ?? synth.memTotal
  const diskMb = usage?.diskDeltaGb != null ? usage.diskDeltaGb * 1024 : synth.diskMb
  const ptys = usage?.ptyCount ?? synth.ptys

  const items: MeterItem[] = [
    { label: 'CPU',  value: `${Math.round(cpu)}%`,                        pct: cpu / 100 },
    { label: 'MEM',  value: `${memUsed.toFixed(1)} / ${memTotal} GB`,     pct: memUsed / memTotal },
    { label: 'DISK', value: `${Math.round(diskMb)} MB worktrees`,         pct: 0.18 },
    { label: 'PTY',  value: `${ptys} sessions`,                           pct: ptys / 64 },
  ]

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
              width: `${Math.min(100, it.pct * 100)}%`,
              background:
                it.pct > 0.85 ? 'var(--danger)'
                : it.pct > 0.65 ? 'var(--warning)'
                : 'var(--success)',
            }} />
          </span>
          <span className="tabular" style={{ color: 'var(--text-2)' }}>
            {it.value}
          </span>
        </span>
      ))}
      <div style={{ flex: 1 }} />
      <span style={{ color: 'var(--text-4)' }}>{hint}</span>
    </div>
  )
}
