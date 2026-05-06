/**
 * Library → Skills tab.
 *
 * Searchable grid of skill cards. Each card shows name, desc, attached agents,
 * line count, usage.
 *
 * Source: /tmp/forge_design/forge/project/src/library_tabs.jsx :: LibSkills
 */

import { useState } from 'react'
// TODO: foundation import
import { Pill, AvatarStack } from './primitives'
import { Icon } from './icons'
import { SKILLS_LIB } from './LibraryData'
import { useLibraryStore } from '@/stores/library'

export function SkillsTab() {
  const real = useLibraryStore((s) => s.skills)
  const items = real ?? SKILLS_LIB
  const [q, setQ] = useState('')
  const [hover, setHover] = useState<string | null>(null)

  const filtered = items.filter(
    (s) => !q || (s.name + ' ' + s.desc).toLowerCase().includes(q.toLowerCase()),
  )

  return (
    <div style={{ flex: 1, overflow: 'auto', padding: '16px 24px' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 14 }}>
        <div
          style={{
            flex: 1,
            maxWidth: 360,
            display: 'flex',
            alignItems: 'center',
            gap: 8,
            padding: '6px 10px',
            background: 'var(--bg-2)',
            border: '1px solid var(--line-1)',
            borderRadius: 6,
          }}
        >
          <Icon.Search size={12} style={{ color: 'var(--text-4)' }} />
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Search skills..."
            style={{
              flex: 1,
              background: 'transparent',
              border: 'none',
              outline: 'none',
              color: 'var(--text-1)',
              fontSize: 12,
            }}
          />
        </div>
        <span className="mono" style={{ fontSize: 11, color: 'var(--text-4)' }}>
          {filtered.length} of {items.length}
        </span>
      </div>
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fill, minmax(260px, 1fr))',
          gap: 10,
        }}
      >
        {filtered.map((s) => (
          <div
            key={s.id}
            onMouseEnter={() => setHover(s.id)}
            onMouseLeave={() => setHover(null)}
            style={{
              padding: 12,
              background: hover === s.id ? 'var(--bg-3)' : 'var(--bg-2)',
              border: `1px solid ${hover === s.id ? 'var(--line-3)' : 'var(--line-1)'}`,
              borderRadius: 6,
              display: 'flex',
              flexDirection: 'column',
              gap: 8,
              cursor: 'pointer',
              transition: 'all 120ms',
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <Icon.Sparkle size={12} style={{ color: 'var(--accent)' }} />
              <span
                className="mono"
                style={{ fontSize: 12.5, color: 'var(--text-1)', fontWeight: 600 }}
              >
                {s.name}
              </span>
              <div style={{ flex: 1 }} />
              {s.owner === 'you' && (
                <Pill color="var(--accent)" style={{ height: 14, fontSize: 9 }}>
                  YOURS
                </Pill>
              )}
            </div>
            <div
              style={{
                fontSize: 11.5,
                color: 'var(--text-3)',
                lineHeight: 1.4,
                display: '-webkit-box',
                WebkitBoxOrient: 'vertical',
                WebkitLineClamp: 2,
                overflow: 'hidden',
                textWrap: 'pretty',
              } as React.CSSProperties}
            >
              {s.desc}
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginTop: 2 }}>
              <AvatarStack ids={s.agents} max={3} size={16} />
              <span
                className="mono"
                style={{
                  fontSize: 10,
                  color: 'var(--text-4)',
                  marginLeft: 'auto',
                }}
              >
                {s.lines}L · {s.used} uses
              </span>
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}
