/**
 * Command Palette — ⌘K.
 *
 * Sections: Recent · Workspace · Library · Run actions · Settings.
 * Fuzzy filter (whitespace-split substring match across t + g + action).
 * Keyboard nav (↑↓ Enter Esc).
 *
 * Source: /tmp/forge_design/forge/project/src/palette.jsx
 *
 * Open/close keybindings (⌘K open, Esc close, Enter execute) are wired by the
 * caller via the `open` prop and the dedicated `useCommandPaletteHotkey` hook.
 */

import { useEffect, useRef, useState } from 'react'
// TODO: foundation import
import { Kbd } from './primitives'
import { Icon } from './icons'
import { t } from '@/i18n'

/**
 * Translate a `PaletteGroup` label for display. Group ids stay English in
 * source so seed data + filter / fuzzy-match keep working — only the rendered
 * header gets localized.
 */
function localizeGroup(g: PaletteGroup): string {
  switch (g) {
    case 'Recent':
      return t('commandPalette.groupRecent')
    case 'Workspace':
      return t('commandPalette.groupWorkspace')
    case 'Library':
      return t('commandPalette.groupLibrary')
    case 'Run actions':
      return t('commandPalette.groupRunActions')
    case 'Settings':
      return t('commandPalette.groupSettings')
    default:
      return g
  }
}

export type PaletteGroup = 'Recent' | 'Workspace' | 'Library' | 'Run actions' | 'Settings'

export interface PaletteItem {
  /** group label (Recent / Workspace / ...) */
  g: PaletteGroup
  /** display title */
  t: string
  /** optional keybinding hint (display only) */
  k?: string
  /** stable action id, dispatched via `onAction` */
  action: string
}

export interface CommandPaletteProps {
  open: boolean
  onClose: () => void
  onAction: (action: string) => void
  /** Override default items. If omitted, the seed list below is used. */
  items?: PaletteItem[]
}

export const DEFAULT_PALETTE_ITEMS: PaletteItem[] = [
  // Recent — populated by caller in the real harness (recent runs, files...)
  { g: 'Recent', t: '활성 팀으로 전환', action: 'open-active' },
  { g: 'Recent', t: '마지막 Run 다시 열기', action: 'recent-last-run' },

  // Workspace — navigation across the studio shell
  { g: 'Workspace', t: 'Workspace 보기', k: '⌘1', action: 'go-workspace' },
  { g: 'Workspace', t: 'Git 보기',       k: '⌘2', action: 'go-git' },
  { g: 'Workspace', t: 'Dashboard 보기', k: '⌘3', action: 'go-dashboard' },
  { g: 'Workspace', t: '공장 관제실',    k: '⌘4', action: 'go-factory' },
  { g: 'Workspace', t: 'Flight Recorder', k: '⌘5', action: 'go-recorder' },
  { g: 'Workspace', t: 'Teams 보기',              action: 'go-teams' },
  { g: 'Workspace', t: 'Settings 보기',  k: '⌘,', action: 'go-settings' },

  // Run actions — current run / git / harness ops
  { g: 'Run actions', t: '새 팀 만들기',           k: '⌘N',   action: 'create-team' },
  { g: 'Run actions', t: '현재 브랜치 푸시',        k: '⌘⇧K', action: 'push' },
  { g: 'Run actions', t: 'diff 보기',              k: '⌘D',   action: 'diff' },
  { g: 'Run actions', t: '하네스 업데이트',         k: '⌘⇧U', action: 'harness-update' },
  { g: 'Run actions', t: '/clear',                  action: 'slash-clear' },
  { g: 'Run actions', t: '/compact',                action: 'slash-compact' },
  { g: 'Run actions', t: '/cost',                   action: 'slash-cost' },

  // Settings — preferences
  { g: 'Settings', t: '모델 변경',              action: 'model' },
  { g: 'Settings', t: '테마 토글',              action: 'theme-toggle' },
  { g: 'Settings', t: '키보드 단축키 보기',      action: 'keys' },
]

interface FlatRow {
  kind: 'h' | 'i'
  /** group header label (when kind === 'h') */
  g?: PaletteGroup
  /** filtered item (when kind === 'i') */
  it?: PaletteItem
  /** index within the filtered (selectable) array */
  idx?: number
}

export function CommandPalette({
  open,
  onClose,
  onAction,
  items = DEFAULT_PALETTE_ITEMS,
}: CommandPaletteProps) {
  const [q, setQ] = useState('')
  const [idx, setIdx] = useState(0)
  const inputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    if (open) {
      setQ('')
      setIdx(0)
      const t = setTimeout(() => inputRef.current?.focus(), 10)
      return () => clearTimeout(t)
    }
    return
  }, [open])

  if (!open) return null

  // Fuzzy: every whitespace-split token must appear somewhere in the text.
  const filtered = items.filter((i) => {
    const s = (i.t + ' ' + i.g + ' ' + i.action).toLowerCase()
    return !q || q.toLowerCase().split(/\s+/).every((p) => !p || s.includes(p))
  })

  // Group preserving insertion order from `items`.
  const groups = new Map<PaletteGroup, PaletteItem[]>()
  filtered.forEach((it) => {
    const arr = groups.get(it.g) ?? []
    arr.push(it)
    groups.set(it.g, arr)
  })

  const flat: FlatRow[] = []
  let fi = 0
  groups.forEach((groupItems, g) => {
    flat.push({ kind: 'h', g })
    groupItems.forEach((it) => {
      flat.push({ kind: 'i', it, idx: fi++ })
    })
  })

  const handleKey = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'ArrowDown') {
      e.preventDefault()
      setIdx((i) => Math.min(filtered.length - 1, i + 1))
    } else if (e.key === 'ArrowUp') {
      e.preventDefault()
      setIdx((i) => Math.max(0, i - 1))
    } else if (e.key === 'Enter') {
      e.preventDefault()
      const x = filtered[idx]
      if (x) {
        onAction(x.action)
        onClose()
      }
    } else if (e.key === 'Escape') {
      onClose()
    }
  }

  return (
    <div
      style={{
        position: 'absolute',
        inset: 0,
        zIndex: 60,
        background: 'rgba(0,0,0,0.5)',
        backdropFilter: 'blur(6px)',
        paddingTop: 110,
        display: 'flex',
        justifyContent: 'center',
        alignItems: 'flex-start',
      }}
      onClick={onClose}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          width: 600,
          maxHeight: 520,
          display: 'flex',
          flexDirection: 'column',
          background: 'var(--bg-2)',
          border: '1px solid var(--line-2)',
          borderRadius: 10,
          boxShadow: 'var(--shadow-pop)',
          overflow: 'hidden',
        }}
      >
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 10,
            padding: '12px 14px',
            borderBottom: '1px solid var(--line-1)',
          }}
        >
          <Icon.Search size={14} style={{ color: 'var(--text-3)' }} />
          <input
            ref={inputRef}
            value={q}
            onChange={(e) => {
              setQ(e.target.value)
              setIdx(0)
            }}
            onKeyDown={handleKey}
            placeholder="Type a command, file, or agent..."
            style={{
              flex: 1,
              background: 'transparent',
              border: 'none',
              outline: 'none',
              color: 'var(--text-1)',
              fontSize: 14,
              fontFamily: 'var(--font-ui)',
            }}
          />
          <Kbd>esc</Kbd>
        </div>
        <div style={{ flex: 1, overflowY: 'auto', padding: '6px 0' }}>
          {flat.length === 0 && (
            <div
              style={{
                padding: '24px 14px',
                textAlign: 'center',
                color: 'var(--text-4)',
                fontSize: 12,
              }}
            >
              {t('commandPalette.noResults')}
            </div>
          )}
          {flat.map((row, i) => {
            if (row.kind === 'h') {
              return (
                <div
                  key={'h' + i}
                  className="mono ns"
                  style={{
                    padding: '8px 14px 4px',
                    fontSize: 10,
                    letterSpacing: 1.2,
                    textTransform: 'uppercase',
                    color: 'var(--text-4)',
                    fontWeight: 600,
                  }}
                >
                  {localizeGroup(row.g!)}
                </div>
              )
            }
            const sel = row.idx === idx
            const it = row.it!
            return (
              <button
                key={'i' + i}
                onMouseEnter={() => setIdx(row.idx!)}
                onClick={() => {
                  onAction(it.action)
                  onClose()
                }}
                style={{
                  width: '100%',
                  display: 'flex',
                  alignItems: 'center',
                  gap: 10,
                  padding: '8px 14px',
                  textAlign: 'left',
                  background: sel ? 'var(--bg-3)' : 'transparent',
                  border: 'none',
                  borderLeft: `2px solid ${sel ? 'var(--accent)' : 'transparent'}`,
                  color: 'var(--text-1)',
                  fontSize: 13,
                  cursor: 'pointer',
                }}
              >
                <Icon.Hash size={13} style={{ color: sel ? 'var(--accent)' : 'var(--text-3)' }} />
                <span style={{ flex: 1 }}>{it.t}</span>
                {it.k && <Kbd>{it.k}</Kbd>}
              </button>
            )
          })}
        </div>
      </div>
    </div>
  )
}

/**
 * Wires ⌘K (or Ctrl+K) to toggle the palette open. Caller still owns the
 * `open` state — this hook just calls `setOpen(true)` on the chord.
 */
export function useCommandPaletteHotkey(setOpen: (v: boolean) => void) {
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      const mod = e.metaKey || e.ctrlKey
      if (mod && (e.key === 'k' || e.key === 'K')) {
        e.preventDefault()
        setOpen(true)
      }
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [setOpen])
}
