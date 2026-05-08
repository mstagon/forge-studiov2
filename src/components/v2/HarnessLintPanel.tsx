/**
 * HarnessLintPanel — Settings → Harness lint summary card + full-screen modal.
 *
 * The card sits at the top of the Harness section and shows:
 *   - Last-checked relative time
 *   - error / warning / info counts (color-coded)
 *   - [Run lint] button
 * Clicking the card (or the "View details" hint) opens a modal that lists every
 * lint item grouped by file, severity-colored. Auto-fix is intentionally not
 * wired here — items show their `fix` hint only.
 *
 * Backed by `window.api.harness.lint(workspacePath)`. Until the IPC bridge is
 * present the card degrades to "lint unavailable" without crashing.
 */

import {
  useCallback,
  useEffect,
  useMemo,
  useState,
  type CSSProperties,
  type ReactNode,
} from 'react'
import { Btn, Pill } from './primitives'
import { Icon } from './icons'

export type LintSeverity = 'error' | 'warning' | 'info'

export interface LintItem {
  file: string
  line?: number
  severity: LintSeverity
  message: string
  fix?: string
}

export interface LintResult {
  errors: LintItem[]
  warnings: LintItem[]
  info: LintItem[]
  checkedAt: string
}

export interface HarnessLintPanelProps {
  workspacePath?: string | null
}

interface HarnessApi {
  lint?: (workspacePath: string) => Promise<LintResult>
}

function getHarnessApi(): HarnessApi | undefined {
  if (typeof window === 'undefined') return undefined
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const w = window as any
  return w?.api?.harness as HarnessApi | undefined
}

function formatRelative(iso: string | null): string {
  if (!iso) return '한 번도 검사 안 함'
  const t = Date.parse(iso)
  if (Number.isNaN(t)) return '한 번도 검사 안 함'
  const diffSec = Math.max(0, Math.round((Date.now() - t) / 1000))
  if (diffSec < 60) return `${diffSec}초 전`
  const min = Math.round(diffSec / 60)
  if (min < 60) return `${min}분 전`
  const hr = Math.round(min / 60)
  if (hr < 24) return `${hr}시간 전`
  return `${Math.round(hr / 24)}일 전`
}

function severityColor(s: LintSeverity): string {
  if (s === 'error') return 'var(--danger)'
  if (s === 'warning') return 'var(--warning)'
  return 'var(--accent)'
}

export function HarnessLintPanel({ workspacePath }: HarnessLintPanelProps) {
  const [result, setResult] = useState<LintResult | null>(null)
  const [running, setRunning] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [open, setOpen] = useState(false)

  const api = getHarnessApi()
  const apiAvailable = Boolean(api?.lint)

  const runLint = useCallback(async () => {
    if (!api?.lint || !workspacePath) {
      setError('lint IPC bridge not available — workspace 가 활성 상태인지 확인하세요.')
      return
    }
    setRunning(true)
    setError(null)
    try {
      const next = await api.lint(workspacePath)
      setResult(next)
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    } finally {
      setRunning(false)
    }
  }, [api, workspacePath])

  // Best-effort: auto-run once when the workspace becomes available.
  useEffect(() => {
    if (apiAvailable && workspacePath && !result && !running) {
      void runLint()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [apiAvailable, workspacePath])

  const errorCount = result?.errors.length ?? 0
  const warningCount = result?.warnings.length ?? 0
  const infoCount = result?.info.length ?? 0
  const total = errorCount + warningCount + infoCount

  return (
    <>
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
            gap: 10,
          }}
        >
          <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-1)' }}>
            Harness lint
          </div>
          <Pill color={errorCount > 0 ? 'var(--danger)' : warningCount > 0 ? 'var(--warning)' : 'var(--success)'}>
            {errorCount > 0 ? 'BROKEN' : warningCount > 0 ? 'NEEDS REVIEW' : 'OK'}
          </Pill>
          <div style={{ flex: 1 }} />
          {!apiAvailable && (
            <span
              style={{ fontSize: 10, color: 'var(--text-4)', fontFamily: 'var(--font-mono)' }}
            >
              ipc pending
            </span>
          )}
          <Btn
            variant="default"
            icon={<Icon.Refresh size={11} />}
            onClick={runLint}
            disabled={running || !workspacePath}
          >
            {running ? 'Linting…' : 'Run lint'}
          </Btn>
        </div>

        <div
          onClick={() => total > 0 && setOpen(true)}
          style={{
            padding: '14px 16px',
            display: 'grid',
            gridTemplateColumns: '1fr 1fr 1fr',
            gap: 10,
            cursor: total > 0 ? 'pointer' : 'default',
          }}
        >
          <Stat label="errors" count={errorCount} color="var(--danger)" />
          <Stat label="warnings" count={warningCount} color="var(--warning)" />
          <Stat label="info" count={infoCount} color="var(--accent)" />
        </div>

        <div
          style={{
            padding: '10px 16px',
            borderTop: '1px solid var(--line-1)',
            display: 'flex',
            alignItems: 'center',
            gap: 8,
            fontSize: 11.5,
            color: 'var(--text-3)',
          }}
        >
          <Icon.Activity size={11} />
          <span>마지막 검사: {formatRelative(result?.checkedAt ?? null)}</span>
          <div style={{ flex: 1 }} />
          {total > 0 && (
            <button
              onClick={() => setOpen(true)}
              style={{
                height: 22,
                padding: '0 10px',
                borderRadius: 4,
                background: 'transparent',
                border: '1px solid var(--line-2)',
                color: 'var(--text-2)',
                fontSize: 11.5,
                cursor: 'pointer',
              }}
            >
              View details ({total})
            </button>
          )}
        </div>

        {error && (
          <div
            style={{
              padding: '10px 16px',
              borderTop: '1px solid var(--line-1)',
              fontSize: 11.5,
              color: 'var(--danger)',
              background: 'color-mix(in oklab, var(--danger) 8%, transparent)',
            }}
          >
            {error}
          </div>
        )}
      </div>

      {open && result && (
        <LintDetailModal result={result} onClose={() => setOpen(false)} />
      )}
    </>
  )
}

function Stat({ label, count, color }: { label: string; count: number; color: string }) {
  return (
    <div
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
        {label}
      </div>
      <div
        style={{
          fontSize: 18,
          fontWeight: 700,
          color: count > 0 ? color : 'var(--text-2)',
          fontFamily: 'var(--font-mono)',
          letterSpacing: -0.4,
        }}
      >
        {count}
      </div>
    </div>
  )
}

interface LintDetailModalProps {
  result: LintResult
  onClose: () => void
}

function LintDetailModal({ result, onClose }: LintDetailModalProps) {
  // Group by file so the user can scan related issues together.
  const grouped = useMemo(() => {
    const all = [...result.errors, ...result.warnings, ...result.info]
    const map = new Map<string, LintItem[]>()
    for (const item of all) {
      const key = item.file || '(global)'
      const arr = map.get(key) ?? []
      arr.push(item)
      map.set(key, arr)
    }
    // Sort: files with errors first, then alphabetical.
    return Array.from(map.entries()).sort(([fa, ia], [fb, ib]) => {
      const ea = ia.some((i) => i.severity === 'error') ? 0 : 1
      const eb = ib.some((i) => i.severity === 'error') ? 0 : 1
      if (ea !== eb) return ea - eb
      return fa.localeCompare(fb)
    })
  }, [result])

  return (
    <ModalOverlay onClose={onClose}>
      <div
        style={{
          width: '90vw',
          maxWidth: 960,
          height: '85vh',
          background: 'var(--bg-1)',
          border: '1px solid var(--line-2)',
          borderRadius: 10,
          display: 'flex',
          flexDirection: 'column',
          overflow: 'hidden',
          boxShadow: 'var(--shadow-pop, 0 20px 60px rgba(0,0,0,0.4))',
        }}
        onClick={(e) => e.stopPropagation()}
      >
        <ModalHeader title="Harness lint" subtitle={`${result.errors.length + result.warnings.length + result.info.length} issues · checked ${formatRelative(result.checkedAt)}`} onClose={onClose} />
        <div style={{ flex: 1, overflow: 'auto', padding: '14px 18px' }}>
          {grouped.length === 0 && (
            <div
              style={{
                padding: 24,
                textAlign: 'center',
                color: 'var(--text-3)',
                fontSize: 13,
              }}
            >
              No issues found. Harness looks healthy.
            </div>
          )}
          {grouped.map(([file, items]) => (
            <div
              key={file}
              style={{
                marginBottom: 14,
                background: 'var(--bg-2)',
                border: '1px solid var(--line-1)',
                borderRadius: 8,
                overflow: 'hidden',
              }}
            >
              <div
                style={{
                  padding: '10px 14px',
                  borderBottom: '1px solid var(--line-1)',
                  display: 'flex',
                  alignItems: 'center',
                  gap: 8,
                  background: 'var(--bg-3)',
                }}
              >
                <Icon.File size={12} style={{ color: 'var(--text-3)' }} />
                <code
                  className="mono"
                  style={{
                    fontSize: 11.5,
                    color: 'var(--text-1)',
                    overflow: 'hidden',
                    textOverflow: 'ellipsis',
                    whiteSpace: 'nowrap',
                    flex: 1,
                  }}
                  title={file}
                >
                  {file}
                </code>
                <Pill color="var(--text-3)">{items.length}</Pill>
              </div>
              {items.map((item, i) => (
                <LintRow key={i} item={item} last={i === items.length - 1} />
              ))}
            </div>
          ))}
        </div>
      </div>
    </ModalOverlay>
  )
}

function LintRow({ item, last }: { item: LintItem; last: boolean }) {
  return (
    <div
      onClick={() => {
        // Auto-fix would land here; for now just show a hint via title.
      }}
      style={{
        padding: '12px 14px',
        borderBottom: last ? 'none' : '1px solid var(--line-1)',
        display: 'flex',
        gap: 12,
        alignItems: 'flex-start',
        cursor: 'default',
      }}
    >
      <span
        style={{
          marginTop: 2,
          width: 8,
          height: 8,
          borderRadius: '50%',
          background: severityColor(item.severity),
          flexShrink: 0,
        }}
      />
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: 12.5, color: 'var(--text-1)', lineHeight: 1.5 }}>
          {item.message}
        </div>
        {item.fix && (
          <div
            style={{
              marginTop: 4,
              fontSize: 11,
              color: 'var(--text-3)',
              lineHeight: 1.5,
              fontStyle: 'italic',
            }}
          >
            제안: {item.fix}
          </div>
        )}
      </div>
      {item.line !== undefined && (
        <span
          className="mono"
          style={{
            fontSize: 10.5,
            color: 'var(--text-4)',
            background: 'var(--bg-3)',
            padding: '2px 6px',
            borderRadius: 3,
            flexShrink: 0,
          }}
        >
          L{item.line}
        </span>
      )}
      <Pill color={severityColor(item.severity)}>{item.severity}</Pill>
    </div>
  )
}

// ─── Shared modal primitives (kept local to avoid foundation churn) ────

export interface ModalOverlayProps {
  children: ReactNode
  onClose: () => void
}

export function ModalOverlay({ children, onClose }: ModalOverlayProps) {
  // Esc closes — hooks live inside ModalOverlay so consumers don't have to wire
  // it themselves (every modal in this file uses the same overlay).
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [onClose])

  return (
    <div
      onClick={onClose}
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 200,
        background: 'rgba(0, 0, 0, 0.55)',
        backdropFilter: 'blur(2px)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
      }}
    >
      {children}
    </div>
  )
}

export interface ModalHeaderProps {
  title: ReactNode
  subtitle?: ReactNode
  onClose: () => void
  right?: ReactNode
}

export function ModalHeader({ title, subtitle, onClose, right }: ModalHeaderProps) {
  return (
    <div
      style={{
        padding: '14px 18px',
        borderBottom: '1px solid var(--line-1)',
        display: 'flex',
        alignItems: 'center',
        gap: 12,
        flexShrink: 0,
      }}
    >
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: 14, fontWeight: 600, color: 'var(--text-1)' }}>{title}</div>
        {subtitle && (
          <div
            className="mono"
            style={{ fontSize: 10.5, color: 'var(--text-4)', marginTop: 2 }}
          >
            {subtitle}
          </div>
        )}
      </div>
      {right}
      <button
        onClick={onClose}
        style={{
          width: 26,
          height: 26,
          borderRadius: 5,
          background: 'transparent',
          border: '1px solid var(--line-2)',
          color: 'var(--text-3)',
          display: 'inline-flex',
          alignItems: 'center',
          justifyContent: 'center',
          cursor: 'pointer',
        }}
      >
        <Icon.X size={12} />
      </button>
    </div>
  )
}

// Suppress unused style import warning — `CSSProperties` reserved for future
// row styling tweaks.
const _StyleRef: CSSProperties = {}
void _StyleRef
