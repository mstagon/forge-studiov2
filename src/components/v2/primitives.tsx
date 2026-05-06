/**
 * Primitive UI components for Forge Studio v2: Btn, Pill, Kbd, Dot, StateDot,
 * AgentBadge, AvatarStack, SectionHead, Progress.
 *
 * Mirrors /tmp/forge_design/forge/project/src/primitives.jsx — same API.
 *
 * NOTE: this is a placeholder while the foundation is being assembled by the
 * main session.
 */
import { useState, type CSSProperties, type ReactNode, type ButtonHTMLAttributes } from 'react'
import { AGENT_BY_ID } from './data'

// ─── helpers ─────────────────────────────────────────────────────────
export const cx = (...xs: Array<string | false | null | undefined>): string =>
  xs.filter(Boolean).join(' ')

const styles = {
  btn: {
    display: 'inline-flex', alignItems: 'center', gap: 6,
    height: 28, padding: '0 10px', borderRadius: 6,
    fontSize: 12.5, fontWeight: 500,
    background: 'var(--bg-3)', color: 'var(--text-1)',
    border: '1px solid var(--line-2)',
    transition: 'background 120ms, border-color 120ms',
    whiteSpace: 'nowrap',
    cursor: 'pointer',
  } as CSSProperties,
  btnGhost: {
    background: 'transparent', border: '1px solid transparent',
    color: 'var(--text-2)',
  } as CSSProperties,
  btnPrimary: {
    background: 'var(--accent)', color: '#0b0e13',
    border: '1px solid var(--accent)', fontWeight: 600,
  } as CSSProperties,
  btnDanger: {
    background: 'transparent', color: 'var(--danger)',
    border: '1px solid var(--line-2)',
  } as CSSProperties,
  pill: {
    display: 'inline-flex', alignItems: 'center', gap: 4,
    height: 18, padding: '0 6px', borderRadius: 4,
    fontSize: 10.5, fontWeight: 500, letterSpacing: 0.2,
    textTransform: 'uppercase' as const,
    background: 'var(--bg-3)', color: 'var(--text-2)',
    border: '1px solid var(--line-2)',
    fontFamily: 'var(--font-mono)',
  } as CSSProperties,
  kbd: {
    display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
    minWidth: 18, height: 18, padding: '0 4px',
    borderRadius: 3, fontSize: 10.5, fontFamily: 'var(--font-mono)',
    background: 'var(--bg-2)', border: '1px solid var(--line-2)',
    color: 'var(--text-2)', boxShadow: '0 1px 0 var(--line-1)',
  } as CSSProperties,
  dot: {
    borderRadius: 999, display: 'inline-block',
  } as CSSProperties,
}

// ─── Btn ─────────────────────────────────────────────────────────────
export type BtnVariant = 'default' | 'ghost' | 'primary' | 'danger'

export interface BtnProps extends Omit<ButtonHTMLAttributes<HTMLButtonElement>, 'style'> {
  variant?: BtnVariant
  icon?: ReactNode
  kbd?: ReactNode
  active?: boolean
  style?: CSSProperties
}

export function Btn({
  children, variant = 'default', icon, kbd, onClick, style, active, ...rest
}: BtnProps) {
  const base: CSSProperties = { ...styles.btn }
  if (variant === 'ghost')   Object.assign(base, styles.btnGhost)
  if (variant === 'primary') Object.assign(base, styles.btnPrimary)
  if (variant === 'danger')  Object.assign(base, styles.btnDanger)
  if (active) {
    base.background = 'var(--bg-4)'
    base.borderColor = 'var(--line-3)'
    base.color = 'var(--text-1)'
  }
  const [hover, setHover] = useState(false)
  if (hover && variant === 'ghost')   base.background = 'var(--bg-3)'
  if (hover && variant === 'default') base.background = 'var(--bg-4)'
  if (hover && variant === 'primary') base.background = 'var(--accent-2)'
  return (
    <button
      {...rest}
      onClick={onClick}
      style={{ ...base, ...style }}
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
    >
      {icon}
      {children}
      {kbd && <Kbd style={{ marginLeft: 4, opacity: 0.7 }}>{kbd}</Kbd>}
    </button>
  )
}

// ─── Pill ────────────────────────────────────────────────────────────
export interface PillProps {
  children: ReactNode
  color?: string
  style?: CSSProperties
}

export function Pill({ children, color, style }: PillProps) {
  const s: CSSProperties = { ...styles.pill, ...style }
  if (color) {
    s.color = color
    s.borderColor = `color-mix(in oklab, ${color} 30%, transparent)`
    s.background = `color-mix(in oklab, ${color} 10%, transparent)`
  }
  return <span style={s}>{children}</span>
}

// ─── Kbd ─────────────────────────────────────────────────────────────
export interface KbdProps {
  children: ReactNode
  style?: CSSProperties
}

export function Kbd({ children, style }: KbdProps) {
  return <span style={{ ...styles.kbd, ...style }}>{children}</span>
}

// ─── Dot ─────────────────────────────────────────────────────────────
export interface DotProps {
  color: string
  pulse?: boolean
  size?: number
  style?: CSSProperties
}

export function Dot({ color, pulse, size = 6, style }: DotProps) {
  return (
    <span
      className={pulse ? 'pulse' : ''}
      style={{
        ...styles.dot,
        width: size, height: size,
        background: color, color, ...style,
      }}
    />
  )
}

// ─── StateDot ────────────────────────────────────────────────────────
export type AgentState = 'active' | 'done' | 'blocked' | 'queued' | 'idle'

export const STATE_COLOR: Record<AgentState, string> = {
  active:  'var(--success)',
  done:    'var(--text-3)',
  blocked: 'var(--danger)',
  queued:  'var(--text-3)',
  idle:    'var(--text-3)',
}
export const STATE_LABEL: Record<AgentState, string> = {
  active:  'ACTIVE',
  done:    'DONE',
  blocked: 'BLOCKED',
  queued:  'QUEUED',
  idle:    'IDLE',
}

export interface StateDotProps {
  state: AgentState
  label?: boolean
}

export function StateDot({ state, label }: StateDotProps) {
  const c = STATE_COLOR[state] || 'var(--text-3)'
  return (
    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
      <Dot color={c} pulse={state === 'active' || state === 'blocked'} />
      {label !== false && (
        <span className="mono" style={{
          fontSize: 10, color: c, letterSpacing: 0.3, fontWeight: 600,
        }}>
          {STATE_LABEL[state]}
        </span>
      )}
    </span>
  )
}

// ─── AgentBadge ──────────────────────────────────────────────────────
export interface AgentBadgeProps {
  agentId: string
  size?: number
  glow?: boolean
}

export function AgentBadge({ agentId, size = 22, glow }: AgentBadgeProps) {
  const a = AGENT_BY_ID[agentId]
  if (!a) return null
  return (
    <div
      title={a.role}
      style={{
        width: size, height: size, borderRadius: 5,
        background: `color-mix(in oklab, ${a.color} 18%, var(--bg-3))`,
        border: `1px solid color-mix(in oklab, ${a.color} 40%, var(--line-2))`,
        color: a.color, fontFamily: 'var(--font-mono)',
        fontSize: size <= 22 ? 10 : 12, fontWeight: 700,
        display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
        flexShrink: 0,
        boxShadow: glow ? `0 0 0 2px color-mix(in oklab, ${a.color} 18%, transparent)` : 'none',
      }}
    >
      {a.icon}
    </div>
  )
}

// ─── AvatarStack ─────────────────────────────────────────────────────
export interface AvatarStackProps {
  ids: string[]
  max?: number
  size?: number
}

export function AvatarStack({ ids, max = 5, size = 22 }: AvatarStackProps) {
  const shown = ids.slice(0, max)
  const more = ids.length - max
  return (
    <div style={{ display: 'inline-flex', alignItems: 'center' }}>
      {shown.map((id, i) => (
        <div key={id} style={{ marginLeft: i === 0 ? 0 : -6 }}>
          <AgentBadge agentId={id} size={size} />
        </div>
      ))}
      {more > 0 && (
        <div style={{
          marginLeft: -6, width: size, height: size, borderRadius: 5,
          background: 'var(--bg-3)', border: '1px solid var(--line-2)',
          color: 'var(--text-2)', fontFamily: 'var(--font-mono)',
          fontSize: 10, fontWeight: 600,
          display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
        }}>+{more}</div>
      )}
    </div>
  )
}

// ─── SectionHead ─────────────────────────────────────────────────────
export interface SectionHeadProps {
  title: string
  sub?: ReactNode
  right?: ReactNode
  style?: CSSProperties
}

export function SectionHead({ title, sub, right, style }: SectionHeadProps) {
  return (
    <div style={{
      display: 'flex', alignItems: 'center', justifyContent: 'space-between',
      padding: '10px 12px', borderBottom: '1px solid var(--line-1)',
      ...style,
    }}>
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 8 }}>
        <div className="mono ns" style={{
          fontSize: 10.5, letterSpacing: 1.2, color: 'var(--text-3)',
          textTransform: 'uppercase', fontWeight: 600,
        }}>{title}</div>
        {sub && <div style={{ fontSize: 11, color: 'var(--text-3)' }}>{sub}</div>}
      </div>
      {right}
    </div>
  )
}

// ─── Progress ────────────────────────────────────────────────────────
export interface ProgressProps {
  value: number
  color?: string
  height?: number
}

export function Progress({ value, color = 'var(--accent)', height = 3 }: ProgressProps) {
  return (
    <div style={{ height, background: 'var(--bg-2)', borderRadius: 999, overflow: 'hidden' }}>
      <div style={{
        width: `${Math.round(value * 100)}%`, height: '100%',
        background: color, borderRadius: 999,
        transition: 'width 600ms cubic-bezier(.2,.7,.2,1)',
      }} />
    </div>
  )
}
