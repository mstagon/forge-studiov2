/**
 * SidebarV2 — 48px left rail of the Forge Studio v2 shell.
 *
 * Top stack: Workspace · Git · Dashboard · Library
 * Footer:    Settings (now a real sidebar item, not a corner button)
 *
 * Source: /tmp/forge_design/forge/project/src/sidebar_v2.jsx
 */
import type { ReactNode } from 'react'
import { Icon, type IconProps } from './icons'
import type { ViewKey } from './types'
import { t } from '@/i18n'

interface NavItem {
  id: ViewKey
  label: string
  icon: (p: IconProps) => ReactNode
  kbd: string
  badge?: number
}

// Built lazily so each render picks up the current locale (handy for the
// language toggle which forces a window reload but tests may swap locales
// without one).
function buildNavItems(): NavItem[] {
  return [
    { id: 'workspace', label: t('sidebar.workspace'), icon: Icon.Folder, kbd: '⌘1' },
    { id: 'git',       label: t('sidebar.git'),       icon: Icon.Git,    kbd: '⌘2' },
    { id: 'dashboard', label: t('sidebar.dashboard'), icon: Icon.Grid,   kbd: '⌘3' },
    { id: 'factory',   label: '공장',                  icon: Icon.Layers, kbd: '⌘4' },
  ]
}

export const NAV_ITEMS_V2: NavItem[] = buildNavItems()

export interface SidebarV2Props {
  view: ViewKey
  onView: (id: ViewKey) => void
}

export function SidebarV2({ view, onView }: SidebarV2Props) {
  return (
    <div
      className="ns"
      style={{
        width: 48, flexShrink: 0,
        borderRight: '1px solid var(--line-1)',
        background: 'var(--bg-1)',
        display: 'flex', flexDirection: 'column',
        paddingTop: 8, paddingBottom: 8,
      }}
    >
      {NAV_ITEMS_V2.map((item) => {
        const active = view === item.id
        const ItemIcon = item.icon
        return (
          <button
            key={item.id}
            onClick={() => onView(item.id)}
            title={`${item.label}  ${item.kbd}`}
            style={{
              width: 32, height: 32, margin: '2px auto', borderRadius: 6,
              background: active ? 'var(--bg-3)' : 'transparent',
              border: active ? '1px solid var(--line-2)' : '1px solid transparent',
              color: active ? 'var(--text-1)' : 'var(--text-3)',
              display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
              position: 'relative', cursor: 'pointer',
            }}
          >
            {active && (
              <span style={{
                position: 'absolute', left: -8, top: 6, bottom: 6, width: 2,
                background: 'var(--accent)', borderRadius: 2,
              }} />
            )}
            <ItemIcon size={16} />
            {item.badge ? (
              <span style={{
                position: 'absolute', top: 3, right: 3,
                minWidth: 14, height: 14, borderRadius: 999, padding: '0 3px',
                background: 'var(--accent)', color: '#0b0e13',
                fontSize: 9, fontWeight: 700,
                display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
              }}>{item.badge}</span>
            ) : null}
          </button>
        )
      })}

      <div style={{ flex: 1 }} />

      {/* Settings at the bottom — also a real sidebar item per v2 design */}
      <button
        onClick={() => onView('settings')}
        title={`${t('sidebar.settings')}  ⌘,`}
        style={{
          width: 32, height: 32, margin: '2px auto', borderRadius: 6,
          background: view === 'settings' ? 'var(--bg-3)' : 'transparent',
          border: view === 'settings' ? '1px solid var(--line-2)' : '1px solid transparent',
          color: view === 'settings' ? 'var(--text-1)' : 'var(--text-3)',
          display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
          position: 'relative', cursor: 'pointer',
        }}
      >
        {view === 'settings' && (
          <span style={{
            position: 'absolute', left: -8, top: 6, bottom: 6, width: 2,
            background: 'var(--accent)', borderRadius: 2,
          }} />
        )}
        <Icon.Cog size={16} />
      </button>
    </div>
  )
}
