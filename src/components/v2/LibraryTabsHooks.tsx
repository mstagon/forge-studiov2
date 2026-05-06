/**
 * Library → Hooks tab.
 *
 * Two-pane: list with toggle switches (left) + script preview pane (right).
 * Local state mutates the `enabled` flag — the harness binding will live in
 * the parent store later.
 *
 * Source: /tmp/forge_design/forge/project/src/library_tabs.jsx :: LibHooks
 */

import { useEffect, useState } from 'react'
// TODO: foundation import
import { AvatarStack } from './primitives'
import { Icon } from './icons'
import { HOOKS_LIB, type LibHook } from './LibraryData'
import { useLibraryStore } from '@/stores/library'

export function HooksTab() {
  const real = useLibraryStore((s) => s.hooks)
  const initial = real ?? HOOKS_LIB
  const [hooks, setHooks] = useState<LibHook[]>(initial)
  const [openId, setOpenId] = useState<string>(initial[0]?.id ?? '')
  // When the store toggles between null/real (e.g. on workspace switch), keep
  // the local state in sync — otherwise the tab can show stale hooks.
  useEffect(() => {
    setHooks(initial)
    if (initial.length > 0) setOpenId(initial[0].id)
  }, [real]) // eslint-disable-line react-hooks/exhaustive-deps
  const open = hooks.find((h) => h.id === openId)
  const toggle = (id: string) =>
    setHooks((hs) => hs.map((h) => (h.id === id ? { ...h, enabled: !h.enabled } : h)))

  return (
    <div style={{ flex: 1, overflow: 'hidden', display: 'flex', minHeight: 0 }}>
      <div style={{ flex: 1, overflow: 'auto', padding: '16px 24px' }}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {hooks.map((h) => {
            const active = openId === h.id
            return (
              <div
                key={h.id}
                onClick={() => setOpenId(h.id)}
                style={{
                  padding: '12px 14px',
                  background: active ? 'var(--bg-3)' : 'var(--bg-2)',
                  border: `1px solid ${active ? 'var(--line-3)' : 'var(--line-1)'}`,
                  borderRadius: 6,
                  cursor: 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  gap: 12,
                }}
              >
                <span
                  onClick={(e) => {
                    e.stopPropagation()
                    toggle(h.id)
                  }}
                  style={{
                    width: 30,
                    height: 16,
                    borderRadius: 999,
                    flexShrink: 0,
                    background: h.enabled ? 'var(--success)' : 'var(--bg-1)',
                    border: `1px solid ${h.enabled ? 'var(--success)' : 'var(--line-2)'}`,
                    position: 'relative',
                    transition: 'all 120ms',
                    cursor: 'pointer',
                  }}
                >
                  <span
                    style={{
                      position: 'absolute',
                      top: 1,
                      left: h.enabled ? 15 : 1,
                      width: 12,
                      height: 12,
                      borderRadius: '50%',
                      background: h.enabled ? '#0b0e13' : 'var(--text-3)',
                      transition: 'left 140ms',
                    }}
                  />
                </span>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <span
                      className="mono"
                      style={{ fontSize: 12.5, color: 'var(--text-1)', fontWeight: 600 }}
                    >
                      {h.name}
                    </span>
                    <span
                      style={{
                        padding: '2px 6px',
                        borderRadius: 3,
                        background: 'var(--bg-3)',
                        border: '1px solid var(--line-2)',
                        color: 'var(--text-2)',
                        fontSize: 10,
                        fontFamily: 'var(--font-mono)',
                      }}
                    >
                      {h.trigger}
                    </span>
                  </div>
                  <div
                    style={{
                      fontSize: 11.5,
                      color: 'var(--text-3)',
                      marginTop: 4,
                      textWrap: 'pretty',
                    } as React.CSSProperties}
                  >
                    {h.desc}
                  </div>
                </div>
                <div
                  style={{
                    display: 'flex',
                    flexDirection: 'column',
                    alignItems: 'flex-end',
                    gap: 2,
                    flexShrink: 0,
                  }}
                >
                  <span
                    className="mono tabular"
                    style={{ fontSize: 11, color: 'var(--text-2)' }}
                  >
                    {h.fires}×
                  </span>
                  <span style={{ fontSize: 10, color: 'var(--text-4)' }}>{h.lastFire}</span>
                </div>
              </div>
            )
          })}
        </div>
      </div>

      {/* Script preview */}
      {open && (
        <div
          style={{
            width: 380,
            flexShrink: 0,
            borderLeft: '1px solid var(--line-2)',
            background: 'var(--bg-2)',
            display: 'flex',
            flexDirection: 'column',
          }}
        >
          <div
            className="ns"
            style={{
              padding: '12px 16px',
              borderBottom: '1px solid var(--line-1)',
              display: 'flex',
              alignItems: 'center',
              gap: 8,
            }}
          >
            <Icon.Code size={13} style={{ color: 'var(--text-3)' }} />
            <span
              className="mono"
              style={{ fontSize: 12, color: 'var(--text-1)', fontWeight: 600 }}
            >
              {open.name}.sh
            </span>
            <div style={{ flex: 1 }} />
            <button
              style={{
                width: 22,
                height: 22,
                borderRadius: 4,
                background: 'transparent',
                border: '1px solid var(--line-2)',
                color: 'var(--text-3)',
              }}
            >
              <Icon.Code size={11} />
            </button>
          </div>
          <pre
            style={{
              flex: 1,
              margin: 0,
              padding: 16,
              overflow: 'auto',
              fontFamily: 'var(--font-mono)',
              fontSize: 11.5,
              lineHeight: 1.6,
              color: 'var(--text-2)',
              background: '#06080b',
              whiteSpace: 'pre-wrap',
            }}
          >{`#!/usr/bin/env bash
# trigger: ${open.trigger}
# fires:   ${open.fires}× lifetime

${open.script}`}</pre>
          <div
            style={{
              padding: '10px 16px',
              borderTop: '1px solid var(--line-1)',
              display: 'flex',
              gap: 6,
              alignItems: 'center',
            }}
          >
            <span className="mono" style={{ fontSize: 10.5, color: 'var(--text-4)' }}>
              적용 agents
            </span>
            <AvatarStack ids={open.agents} max={4} size={16} />
          </div>
        </div>
      )}
    </div>
  )
}
