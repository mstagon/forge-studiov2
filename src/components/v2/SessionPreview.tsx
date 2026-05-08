/**
 * SessionPreview — modal that shows what Claude Code sees on session start.
 *
 * Surfaced from Settings → Harness via a "Preview session context" button so
 * authors can sanity-check CLAUDE.md + every @-loaded rule without booting an
 * actual session. Each section is collapsible; we precompute total chars and a
 * rough token estimate (chars / 4) for quick cost intuition.
 *
 * Backed by `window.api.harness.previewSessionContext(workspacePath)`.
 */

import { useEffect, useState } from 'react'
import { Btn, Pill } from './primitives'
import { Icon } from './icons'
import { ModalHeader, ModalOverlay } from './HarnessLintPanel'

type SectionKind = 'claude-md' | 'rule' | 'hook'

export interface SessionPreviewSection {
  kind: SectionKind
  label: string
  file: string
  content: string
  missing?: boolean
}

export interface SessionPreviewData {
  sections: SessionPreviewSection[]
  totalChars: number
  tokenEstimate: number
}

interface HarnessApi {
  previewSessionContext?: (workspacePath: string) => Promise<SessionPreviewData>
}

function getHarnessApi(): HarnessApi | undefined {
  if (typeof window === 'undefined') return undefined
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const w = window as any
  return w?.api?.harness as HarnessApi | undefined
}

export interface SessionPreviewProps {
  workspacePath?: string | null
}

export function SessionPreview({ workspacePath }: SessionPreviewProps) {
  const [open, setOpen] = useState(false)
  const [data, setData] = useState<SessionPreviewData | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!open) return
    let cancelled = false
    async function load() {
      const api = getHarnessApi()
      if (!api?.previewSessionContext || !workspacePath) {
        if (!cancelled) {
          setError('previewSessionContext IPC bridge not available.')
          setLoading(false)
        }
        return
      }
      setLoading(true)
      setError(null)
      try {
        const next = await api.previewSessionContext(workspacePath)
        if (!cancelled) setData(next)
      } catch (err) {
        if (!cancelled) setError(err instanceof Error ? err.message : String(err))
      } finally {
        if (!cancelled) setLoading(false)
      }
    }
    void load()
    return () => {
      cancelled = true
    }
  }, [open, workspacePath])

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
            display: 'flex',
            alignItems: 'center',
            gap: 12,
          }}
        >
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-1)' }}>
              Preview session context
            </div>
            <div
              style={{
                fontSize: 11.5,
                color: 'var(--text-3)',
                marginTop: 2,
              }}
            >
              What Claude sees on session start — CLAUDE.md + @-loaded rules + hooks
            </div>
          </div>
          <Btn
            variant="default"
            icon={<Icon.Activity size={11} />}
            onClick={() => setOpen(true)}
            disabled={!workspacePath}
          >
            Preview
          </Btn>
        </div>
      </div>

      {open && (
        <ModalOverlay onClose={() => setOpen(false)}>
          <div
            style={{
              width: '90vw',
              maxWidth: 1080,
              height: '90vh',
              background: 'var(--bg-1)',
              border: '1px solid var(--line-2)',
              borderRadius: 10,
              display: 'flex',
              flexDirection: 'column',
              overflow: 'hidden',
              boxShadow: '0 24px 80px rgba(0,0,0,0.5)',
            }}
            onClick={(e) => e.stopPropagation()}
          >
            <ModalHeader
              title="Session context preview"
              subtitle={
                data ? (
                  <>
                    {data.sections.length} sections ·{' '}
                    <span style={{ color: 'var(--text-2)' }}>
                      {data.totalChars.toLocaleString()} chars
                    </span>{' '}
                    ·{' '}
                    <span style={{ color: 'var(--accent)' }}>
                      ~{data.tokenEstimate.toLocaleString()} tokens
                    </span>
                  </>
                ) : (
                  'Loading…'
                )
              }
              onClose={() => setOpen(false)}
            />

            <div style={{ flex: 1, overflow: 'auto', padding: '14px 18px' }}>
              {loading && (
                <div style={{ color: 'var(--text-3)', fontSize: 12 }}>Loading…</div>
              )}
              {error && (
                <div
                  style={{
                    padding: 12,
                    background: 'color-mix(in oklab, var(--danger) 8%, transparent)',
                    color: 'var(--danger)',
                    fontSize: 12,
                    borderRadius: 6,
                    border: '1px solid var(--danger)',
                  }}
                >
                  {error}
                </div>
              )}
              {data?.sections.map((section, i) => (
                <Section key={i} section={section} />
              ))}
              {data && data.sections.length === 0 && (
                <div
                  style={{
                    padding: 24,
                    textAlign: 'center',
                    color: 'var(--text-3)',
                    fontSize: 13,
                  }}
                >
                  CLAUDE.md not found at the workspace root — Claude Code will start without
                  project context.
                </div>
              )}
            </div>
          </div>
        </ModalOverlay>
      )}
    </>
  )
}

function Section({ section }: { section: SessionPreviewSection }) {
  // Default closed — keeps the modal scannable when many rules are loaded.
  const [open, setOpen] = useState(false)
  const charCount = section.content.length
  const tokenEstimate = Math.round(charCount / 4)
  const lines = section.content.split(/\r?\n/)

  let kindColor = 'var(--text-3)'
  let kindLabel = 'rule'
  if (section.kind === 'claude-md') {
    kindColor = 'var(--accent)'
    kindLabel = 'CLAUDE.md'
  } else if (section.kind === 'hook') {
    kindColor = 'var(--warning)'
    kindLabel = 'hook'
  }

  return (
    <div
      style={{
        marginBottom: 10,
        background: 'var(--bg-2)',
        border: '1px solid var(--line-1)',
        borderRadius: 8,
        overflow: 'hidden',
      }}
    >
      <button
        onClick={() => setOpen((o) => !o)}
        style={{
          width: '100%',
          padding: '10px 14px',
          background: 'transparent',
          border: 'none',
          display: 'flex',
          alignItems: 'center',
          gap: 10,
          cursor: 'pointer',
          textAlign: 'left',
        }}
      >
        <span
          style={{
            transform: open ? 'rotate(90deg)' : 'rotate(0deg)',
            transition: 'transform 120ms',
            color: 'var(--text-3)',
            display: 'inline-flex',
          }}
        >
          <Icon.Chevron size={11} />
        </span>
        <Pill color={kindColor}>{kindLabel}</Pill>
        <code
          className="mono"
          style={{
            flex: 1,
            fontSize: 12,
            color: section.missing ? 'var(--danger)' : 'var(--text-1)',
            overflow: 'hidden',
            textOverflow: 'ellipsis',
            whiteSpace: 'nowrap',
          }}
        >
          {section.label}
        </code>
        <span
          className="mono"
          style={{ fontSize: 10.5, color: 'var(--text-4)' }}
        >
          {charCount.toLocaleString()} chars · ~{tokenEstimate.toLocaleString()} tok
        </span>
        {section.missing && <Pill color="var(--danger)">missing</Pill>}
      </button>
      {open && (
        <div
          style={{
            background: 'var(--bg-1)',
            borderTop: '1px solid var(--line-1)',
            maxHeight: '50vh',
            overflow: 'auto',
          }}
        >
          <pre
            className="mono"
            style={{
              margin: 0,
              padding: 12,
              fontSize: 11.5,
              lineHeight: 1.55,
              fontFamily: 'var(--font-mono)',
              color: 'var(--text-2)',
              whiteSpace: 'pre',
              display: 'grid',
              gridTemplateColumns: 'auto 1fr',
            }}
          >
            {lines.map((line, i) => (
              <span key={i} style={{ display: 'contents' }}>
                <span
                  style={{
                    color: 'var(--text-4)',
                    paddingRight: 12,
                    textAlign: 'right',
                    userSelect: 'none',
                    minWidth: 32,
                  }}
                >
                  {i + 1}
                </span>
                <span style={{ color: 'var(--text-2)' }}>{line || ' '}</span>
              </span>
            ))}
          </pre>
        </div>
      )}
    </div>
  )
}
