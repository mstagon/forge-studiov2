/**
 * Library → Commands tab.
 *
 * Two stacked tables: built-in slash commands and custom (team / personal)
 * commands. Each row is a single grid line (command, description, args, owner,
 * uses).
 *
 * Source: /tmp/forge_design/forge/project/src/library_tabs.jsx :: LibCommands
 */

import { COMMANDS_LIB, type LibCommand } from './LibraryData'
import { SectionLabel } from './Library'
import { useLibraryStore } from '@/stores/library'

export function CommandsTab() {
  const real = useLibraryStore((s) => s.commands)
  const items = real ?? COMMANDS_LIB
  const builtin = items.filter((c) => c.builtin)
  const custom = items.filter((c) => !c.builtin)
  return (
    <div style={{ flex: 1, overflow: 'auto', padding: '16px 24px' }}>
      <div style={{ marginBottom: 18 }}>
        <SectionLabel>Built-in ({builtin.length})</SectionLabel>
        <CommandTable items={builtin} />
      </div>
      <div>
        <SectionLabel>Custom ({custom.length})</SectionLabel>
        <CommandTable items={custom} />
      </div>
    </div>
  )
}

function CommandTable({ items }: { items: LibCommand[] }) {
  return (
    <div
      style={{
        border: '1px solid var(--line-1)',
        borderRadius: 6,
        overflow: 'hidden',
        background: 'var(--bg-2)',
      }}
    >
      <div
        className="ns mono"
        style={{
          display: 'grid',
          gridTemplateColumns: '180px 1fr 120px 80px 100px',
          gap: 10,
          padding: '8px 14px',
          fontSize: 9.5,
          color: 'var(--text-4)',
          fontWeight: 600,
          letterSpacing: 1,
          textTransform: 'uppercase',
          borderBottom: '1px solid var(--line-1)',
        }}
      >
        <span>Command</span>
        <span>Description</span>
        <span>Args</span>
        <span>Owner</span>
        <span style={{ textAlign: 'right' }}>Uses</span>
      </div>
      {items.map((c, i) => (
        <div
          key={c.id}
          style={{
            display: 'grid',
            gridTemplateColumns: '180px 1fr 120px 80px 100px',
            gap: 10,
            padding: '10px 14px',
            fontSize: 12,
            borderBottom: i < items.length - 1 ? '1px solid var(--line-1)' : 'none',
            alignItems: 'center',
          }}
        >
          <code
            style={{
              fontFamily: 'var(--font-mono)',
              color: 'var(--accent)',
              fontWeight: 600,
              background: 'var(--accent-dim)',
              padding: '2px 6px',
              borderRadius: 3,
              justifySelf: 'flex-start',
              fontSize: 11.5,
            }}
          >
            {c.name}
          </code>
          <span style={{ color: 'var(--text-2)', fontSize: 12 }}>{c.desc}</span>
          <code className="mono" style={{ fontSize: 11, color: 'var(--text-4)' }}>
            {c.args || '—'}
          </code>
          <span style={{ fontSize: 11, color: 'var(--text-3)' }}>{c.owner}</span>
          <span
            className="mono tabular"
            style={{ fontSize: 11, color: 'var(--text-2)', textAlign: 'right' }}
          >
            {c.uses}
          </span>
        </div>
      ))}
    </div>
  )
}
