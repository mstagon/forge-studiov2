/**
 * SettingsErrorLog — error log viewer surfaced as the 6th Settings section.
 *
 * Reads from the in-memory `useErrorLogStore` (populated by both renderer-side
 * `record()` calls and main-process `error-log:push` IPC events). The store is
 * a 200-entry ring buffer so we never block on disk.
 *
 * UI:
 *   • Filter row: category dropdown + search input
 *   • Table: time / category / code / message / [copy] [details]
 *   • Header: `Clear all` button (wipes the store)
 *
 * Copy button puts a JSON-formatted single-record blob on the clipboard so
 * users can paste into a bug report verbatim.
 */

import { useMemo, useState } from 'react'
import { t } from '@/i18n'
import { Icon } from './icons'
import { Pill } from './primitives'
import { useErrorLogStore, type ErrorLogEntry } from '@/stores/errorLog'

// Icon → category map for the leading column glyph.
function categoryColor(cat: string): string {
  switch (cat) {
    case 'IPC':
      return 'var(--info)'
    case 'GIT':
      return 'var(--accent)'
    case 'PTY':
      return 'var(--warning)'
    case 'FS':
      return 'var(--warning)'
    case 'HOOK':
      return 'var(--accent)'
    case 'MCP':
      return 'var(--info)'
    case 'VALIDATION':
      return 'var(--warning)'
    default:
      return 'var(--text-3)'
  }
}

function formatTime(iso: string): string {
  try {
    const d = new Date(iso)
    if (Number.isNaN(d.getTime())) return iso
    const hh = String(d.getHours()).padStart(2, '0')
    const mm = String(d.getMinutes()).padStart(2, '0')
    const ss = String(d.getSeconds()).padStart(2, '0')
    return `${hh}:${mm}:${ss}`
  } catch {
    return iso
  }
}

async function copyToClipboard(text: string): Promise<void> {
  if (typeof navigator !== 'undefined' && navigator.clipboard?.writeText) {
    try {
      await navigator.clipboard.writeText(text)
      return
    } catch {
      // fall through to legacy path
    }
  }
  // Fallback: textarea + execCommand. Best-effort.
  if (typeof document !== 'undefined') {
    const ta = document.createElement('textarea')
    ta.value = text
    ta.setAttribute('readonly', '')
    ta.style.position = 'absolute'
    ta.style.left = '-9999px'
    document.body.appendChild(ta)
    ta.select()
    try {
      document.execCommand('copy')
    } finally {
      document.body.removeChild(ta)
    }
  }
}

export function SettingsErrorLog() {
  const entries = useErrorLogStore((s) => s.entries)
  const clear = useErrorLogStore((s) => s.clear)
  const [filterCat, setFilterCat] = useState<string>('all')
  const [query, setQuery] = useState('')
  const [openId, setOpenId] = useState<string | null>(null)

  const categories = useMemo(() => {
    const seen = new Set<string>()
    for (const e of entries) seen.add(e.category)
    return Array.from(seen).sort()
  }, [entries])

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase()
    return entries.filter((e) => {
      if (filterCat !== 'all' && e.category !== filterCat) return false
      if (!q) return true
      const hay = `${e.code} ${e.category} ${e.message}`.toLowerCase()
      return q.split(/\s+/).every((tok) => !tok || hay.includes(tok))
    })
  }, [entries, filterCat, query])

  return (
    <>
      <div style={{ marginBottom: 16 }}>
        <div
          style={{
            fontSize: 22,
            fontWeight: 600,
            color: 'var(--text-1)',
            letterSpacing: -0.4,
          }}
        >
          {t('settings.errorLog')}
        </div>
        <div style={{ fontSize: 12.5, color: 'var(--text-3)', marginTop: 4 }}>
          {t('settings.errorLogSub')}
        </div>
      </div>

      {/* Filter / actions row */}
      <div
        style={{
          background: 'var(--bg-2)',
          border: '1px solid var(--line-1)',
          borderRadius: 8,
          padding: '10px 12px',
          marginBottom: 12,
          display: 'flex',
          alignItems: 'center',
          gap: 8,
          flexWrap: 'wrap',
        }}
      >
        <span
          style={{
            fontSize: 11,
            letterSpacing: 0.4,
            textTransform: 'uppercase',
            color: 'var(--text-3)',
            fontFamily: 'var(--font-mono)',
          }}
        >
          {t('errorLog.filterByCategory')}
        </span>
        <select
          value={filterCat}
          onChange={(e) => setFilterCat(e.target.value)}
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
          <option value="all">{t('errorLog.filterAll')}</option>
          {categories.map((c) => (
            <option key={c} value={c}>
              {c}
            </option>
          ))}
        </select>

        <div style={{ position: 'relative', flex: 1, minWidth: 180 }}>
          <Icon.Search
            size={12}
            style={{
              position: 'absolute',
              left: 8,
              top: '50%',
              transform: 'translateY(-50%)',
              color: 'var(--text-3)',
            }}
          />
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder={t('errorLog.searchPlaceholder')}
            style={{
              width: '100%',
              padding: '5px 8px 5px 26px',
              background: 'var(--bg-3)',
              border: '1px solid var(--line-2)',
              borderRadius: 5,
              color: 'var(--text-1)',
              fontSize: 12,
              outline: 'none',
            }}
          />
        </div>

        <Pill color="var(--text-3)">{filtered.length} / {entries.length}</Pill>

        <button
          onClick={clear}
          disabled={entries.length === 0}
          style={{
            background: 'transparent',
            border: '1px solid var(--line-2)',
            color: entries.length === 0 ? 'var(--text-4)' : 'var(--text-2)',
            borderRadius: 5,
            padding: '4px 10px',
            fontSize: 11.5,
            cursor: entries.length === 0 ? 'not-allowed' : 'pointer',
            display: 'inline-flex',
            alignItems: 'center',
            gap: 4,
          }}
        >
          <Icon.X size={11} /> {t('common.clearAll')}
        </button>
      </div>

      {/* Table */}
      <div
        style={{
          background: 'var(--bg-2)',
          border: '1px solid var(--line-1)',
          borderRadius: 8,
          overflow: 'hidden',
        }}
      >
        {filtered.length === 0 ? (
          <div
            style={{
              padding: '32px 16px',
              textAlign: 'center',
              color: 'var(--text-3)',
              fontSize: 12.5,
            }}
          >
            {t('errorLog.empty')}
          </div>
        ) : (
          <div style={{ maxHeight: '60vh', overflow: 'auto' }}>
            <table
              className="mono"
              style={{
                width: '100%',
                borderCollapse: 'collapse',
                fontSize: 11.5,
                tableLayout: 'fixed',
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
                  <th style={{ ...th, width: 70 }}>{t('errorLog.time')}</th>
                  <th style={{ ...th, width: 90 }}>{t('errorLog.category')}</th>
                  <th style={{ ...th, width: 200 }}>{t('errorLog.code')}</th>
                  <th style={th}>{t('errorLog.message')}</th>
                  <th style={{ ...th, width: 110, textAlign: 'right' }} />
                </tr>
              </thead>
              <tbody>
                {filtered.map((entry) => (
                  <ErrorRow
                    key={entry.id}
                    entry={entry}
                    open={openId === entry.id}
                    onToggle={() =>
                      setOpenId((cur) => (cur === entry.id ? null : entry.id))
                    }
                  />
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </>
  )
}

interface ErrorRowProps {
  entry: ErrorLogEntry
  open: boolean
  onToggle: () => void
}

function ErrorRow({ entry, open, onToggle }: ErrorRowProps) {
  const [copied, setCopied] = useState(false)

  const copyEntry = async () => {
    const blob = JSON.stringify(
      {
        ts: entry.ts,
        category: entry.category,
        code: entry.code,
        message: entry.message,
        context: entry.context,
      },
      null,
      2,
    )
    await copyToClipboard(blob)
    setCopied(true)
    window.setTimeout(() => setCopied(false), 1500)
  }

  return (
    <>
      <tr
        style={{
          borderTop: '1px solid var(--line-1)',
          background: open ? 'var(--bg-1)' : undefined,
        }}
      >
        <td style={{ ...td, color: 'var(--text-3)' }}>{formatTime(entry.ts)}</td>
        <td style={td}>
          <span
            style={{
              display: 'inline-block',
              padding: '1px 6px',
              borderRadius: 3,
              background: 'color-mix(in oklab, ' + categoryColor(entry.category) + ' 12%, transparent)',
              border: '1px solid color-mix(in oklab, ' + categoryColor(entry.category) + ' 35%, transparent)',
              color: categoryColor(entry.category),
              fontSize: 10.5,
              letterSpacing: 0.3,
            }}
          >
            {entry.category}
          </span>
        </td>
        <td style={{ ...td, color: 'var(--text-1)', fontWeight: 600 }}>{entry.code}</td>
        <td
          style={{
            ...td,
            color: 'var(--text-2)',
            fontFamily: 'var(--font-ui)',
            overflow: 'hidden',
            textOverflow: 'ellipsis',
            whiteSpace: 'nowrap',
          }}
          title={entry.message}
        >
          {entry.message}
        </td>
        <td style={{ ...td, textAlign: 'right', whiteSpace: 'nowrap' }}>
          <button
            onClick={copyEntry}
            title={t('errorLog.copyOne')}
            style={miniBtnStyle}
          >
            {copied ? t('common.copied') : t('common.copy')}
          </button>
          <button
            onClick={onToggle}
            title={t('errorLog.details')}
            style={{ ...miniBtnStyle, marginLeft: 4 }}
          >
            {open ? '−' : '+'} {t('errorLog.details')}
          </button>
        </td>
      </tr>
      {open && (
        <tr>
          <td colSpan={5} style={{ padding: 0, background: 'var(--bg-1)' }}>
            <div
              style={{
                padding: '8px 12px 12px 12px',
                fontSize: 11,
                color: 'var(--text-2)',
                lineHeight: 1.5,
              }}
            >
              <div
                style={{
                  marginBottom: 4,
                  color: 'var(--text-3)',
                  fontFamily: 'var(--font-mono)',
                  fontSize: 10.5,
                }}
              >
                {entry.ts}
              </div>
              <div style={{ marginBottom: 8, color: 'var(--text-1)' }}>{entry.message}</div>
              {entry.context && Object.keys(entry.context).length > 0 && (
                <pre
                  className="mono"
                  style={{
                    margin: 0,
                    padding: '6px 8px',
                    background: 'var(--bg-3)',
                    borderRadius: 4,
                    fontSize: 11,
                    color: 'var(--text-2)',
                    whiteSpace: 'pre-wrap',
                    wordBreak: 'break-word',
                    maxHeight: 200,
                    overflow: 'auto',
                  }}
                >
                  {JSON.stringify(entry.context, null, 2)}
                </pre>
              )}
            </div>
          </td>
        </tr>
      )}
    </>
  )
}

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

const miniBtnStyle: React.CSSProperties = {
  background: 'transparent',
  border: '1px solid var(--line-2)',
  color: 'var(--text-2)',
  borderRadius: 4,
  padding: '2px 6px',
  fontSize: 10.5,
  cursor: 'pointer',
  fontFamily: 'var(--font-mono)',
}
