/**
 * Library → My Presets tab.
 *
 * Lists bundled + user-saved harness presets and lets the user:
 *   - Apply a preset to the active workspace's `.claude/`
 *   - Save the active workspace's `.claude/` as a new user preset
 *   - Delete user presets (bundled presets are read-only)
 *
 * Preset metadata (name / description) comes from `<preset>/preset.json` when
 * present; otherwise the directory id is used as a fallback name.
 */

import { useCallback, useEffect, useMemo, useState } from 'react'
import { Btn, Pill } from './primitives'
import { Icon } from './icons'
import { ModalHeader, ModalOverlay } from './HarnessLintPanel'
import type { LibraryWorkspace } from './Library'

export interface PresetInfo {
  id: string
  name: string
  description?: string
  source: 'bundled' | 'user'
  templatePath: string
  claudeMdPath?: string
}

interface PresetApi {
  list?: () => Promise<PresetInfo[]>
  apply?: (
    workspacePath: string,
    presetId: string,
  ) => Promise<{ ok: true; preset: PresetInfo }>
  save?: (
    workspacePath: string,
    options: { id: string; name?: string; description?: string },
  ) => Promise<PresetInfo>
  delete?: (presetId: string) => Promise<void>
}

interface HarnessApi {
  scan?: (workspacePath: string) => Promise<{
    agents?: { name: string }[]
    skills?: { name: string }[]
    commands?: { name: string }[]
    hooks?: Record<string, number>
  }>
}

function getPresetApi(): PresetApi | undefined {
  if (typeof window === 'undefined') return undefined
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const w = window as any
  return w?.api?.preset as PresetApi | undefined
}

function getHarnessApi(): HarnessApi | undefined {
  if (typeof window === 'undefined') return undefined
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const w = window as any
  return w?.api?.harness as HarnessApi | undefined
}

export interface PresetsTabProps {
  workspace: LibraryWorkspace
}

interface PresetWithCounts extends PresetInfo {
  agents?: number
  skills?: number
  commands?: number
}

export function PresetsTab({ workspace }: PresetsTabProps) {
  const [presets, setPresets] = useState<PresetInfo[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [toast, setToast] = useState<string | null>(null)
  const [savingOpen, setSavingOpen] = useState(false)
  const [busyId, setBusyId] = useState<string | null>(null)

  const reload = useCallback(async () => {
    const api = getPresetApi()
    if (!api?.list) {
      setLoading(false)
      setError('preset IPC bridge not available.')
      return
    }
    try {
      setLoading(true)
      const next = await api.list()
      setPresets(next)
      setError(null)
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    void reload()
  }, [reload])

  // Toast auto-dismiss
  useEffect(() => {
    if (!toast) return
    const id = window.setTimeout(() => setToast(null), 2400)
    return () => window.clearTimeout(id)
  }, [toast])

  // Best-effort member counts — scan the bundled / user template's `.claude/`
  // via the harness scanner. Done lazily to keep the initial paint snappy.
  const [counts, setCounts] = useState<Record<string, { agents: number; skills: number; commands: number }>>({})
  useEffect(() => {
    let cancelled = false
    async function load() {
      const api = getHarnessApi()
      if (!api?.scan) return
      const next: Record<string, { agents: number; skills: number; commands: number }> = {}
      for (const p of presets) {
        try {
          // The scanner expects a workspace path (parent of .claude/), so
          // pass the parent of templatePath.
          const wsLike = p.templatePath.replace(/\/\.claude\/?$/, '')
          const info = await api.scan(wsLike)
          next[p.id] = {
            agents: info.agents?.length ?? 0,
            skills: info.skills?.length ?? 0,
            commands: info.commands?.length ?? 0,
          }
        } catch {
          // ignore — preset just won't show counts
        }
      }
      if (!cancelled) setCounts(next)
    }
    if (presets.length > 0) void load()
    return () => {
      cancelled = true
    }
  }, [presets])

  const enriched: PresetWithCounts[] = useMemo(
    () =>
      presets.map((p) => ({
        ...p,
        agents: counts[p.id]?.agents,
        skills: counts[p.id]?.skills,
        commands: counts[p.id]?.commands,
      })),
    [presets, counts],
  )

  const handleApply = async (preset: PresetInfo) => {
    const api = getPresetApi()
    if (!api?.apply || !workspace.path) {
      setError('apply 호출 불가 — 활성 워크스페이스 또는 IPC 미준비')
      return
    }
    if (
      !window.confirm(
        `Apply preset "${preset.name}" to ${workspace.name}?\n` +
          `기존 .claude/ 의 동일 파일은 덮어쓰지 않습니다 (overwrite:false).`,
      )
    ) {
      return
    }
    setBusyId(preset.id)
    try {
      await api.apply(workspace.path, preset.id)
      setToast(`Preset "${preset.name}" applied to ${workspace.name}.`)
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    } finally {
      setBusyId(null)
    }
  }

  const handleDelete = async (preset: PresetInfo) => {
    const api = getPresetApi()
    if (!api?.delete) return
    if (preset.source !== 'user') return
    if (!window.confirm(`Delete user preset "${preset.name}"? This cannot be undone.`)) return
    setBusyId(preset.id)
    try {
      await api.delete(preset.id)
      setToast(`Preset "${preset.name}" deleted.`)
      await reload()
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    } finally {
      setBusyId(null)
    }
  }

  return (
    <div style={{ flex: 1, overflow: 'hidden', display: 'flex', flexDirection: 'column', minHeight: 0 }}>
      <div
        style={{
          padding: '14px 24px 6px',
          display: 'flex',
          alignItems: 'center',
          gap: 10,
        }}
      >
        <span style={{ fontSize: 12.5, color: 'var(--text-3)' }}>
          번들된 프리셋 + 내가 저장한 워크스페이스 설정
        </span>
        <div style={{ flex: 1 }} />
        <Btn
          variant="primary"
          icon={<Icon.Plus size={11} />}
          onClick={() => setSavingOpen(true)}
          disabled={!workspace.path}
        >
          Save current as preset
        </Btn>
      </div>

      <div style={{ flex: 1, overflow: 'auto', padding: '12px 24px 20px' }}>
        {loading && <div style={{ color: 'var(--text-3)', fontSize: 12 }}>Loading presets…</div>}
        {error && (
          <div
            style={{
              padding: 10,
              marginBottom: 10,
              background: 'color-mix(in oklab, var(--danger) 8%, transparent)',
              border: '1px solid var(--danger)',
              borderRadius: 6,
              color: 'var(--danger)',
              fontSize: 12,
            }}
          >
            {error}
          </div>
        )}
        {!loading && enriched.length === 0 && !error && (
          <div
            style={{
              padding: 24,
              textAlign: 'center',
              color: 'var(--text-3)',
              fontSize: 13,
            }}
          >
            No presets yet. Save the current workspace to seed your first preset.
          </div>
        )}
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fill, minmax(320px, 1fr))',
            gap: 12,
          }}
        >
          {enriched.map((p) => (
            <PresetCard
              key={`${p.source}:${p.id}`}
              preset={p}
              busy={busyId === p.id}
              onApply={() => handleApply(p)}
              onDelete={() => handleDelete(p)}
            />
          ))}
        </div>
      </div>

      {toast && (
        <div
          style={{
            position: 'fixed',
            bottom: 28,
            left: '50%',
            transform: 'translateX(-50%)',
            padding: '10px 14px',
            background: 'var(--bg-3)',
            border: '1px solid var(--line-3)',
            borderRadius: 8,
            boxShadow: '0 8px 24px rgba(0,0,0,0.4)',
            zIndex: 70,
            fontSize: 12.5,
            color: 'var(--text-1)',
            display: 'inline-flex',
            alignItems: 'center',
            gap: 8,
          }}
        >
          <Icon.Check size={13} style={{ color: 'var(--success)' }} />
          {toast}
        </div>
      )}

      {savingOpen && workspace.path && (
        <SavePresetDialog
          workspacePath={workspace.path}
          workspaceName={workspace.name}
          onClose={() => setSavingOpen(false)}
          onSaved={() => {
            setSavingOpen(false)
            setToast('Preset saved.')
            void reload()
          }}
        />
      )}
    </div>
  )
}

interface PresetCardProps {
  preset: PresetWithCounts
  busy: boolean
  onApply: () => void
  onDelete: () => void
}

function PresetCard({ preset, busy, onApply, onDelete }: PresetCardProps) {
  return (
    <div
      style={{
        padding: 14,
        borderRadius: 8,
        background: 'var(--bg-2)',
        border: '1px solid var(--line-1)',
        display: 'flex',
        flexDirection: 'column',
        gap: 12,
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
        <Pill color={preset.source === 'bundled' ? 'var(--accent)' : 'var(--success)'}>
          {preset.source}
        </Pill>
        <div style={{ fontSize: 14, fontWeight: 600, color: 'var(--text-1)', flex: 1, minWidth: 0 }}>
          {preset.name}
        </div>
      </div>
      <div
        style={{
          fontSize: 11.5,
          color: 'var(--text-3)',
          minHeight: 32,
          lineHeight: 1.45,
        }}
      >
        {preset.description ?? '— no description —'}
      </div>
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 10,
          paddingTop: 10,
          borderTop: '1px solid var(--line-1)',
        }}
      >
        <span className="mono" style={{ fontSize: 10.5, color: 'var(--text-4)' }}>
          {(preset.agents ?? 0)}A · {(preset.skills ?? 0)}S · {(preset.commands ?? 0)}C
        </span>
        <div style={{ flex: 1 }} />
        {preset.source === 'user' && (
          <button
            onClick={onDelete}
            disabled={busy}
            title="Delete user preset"
            style={{
              height: 26,
              padding: '0 8px',
              borderRadius: 4,
              background: 'transparent',
              border: '1px solid var(--line-2)',
              color: 'var(--danger)',
              fontSize: 11,
              cursor: busy ? 'wait' : 'pointer',
            }}
          >
            Delete
          </button>
        )}
        <button
          onClick={onApply}
          disabled={busy}
          style={{
            height: 26,
            padding: '0 10px',
            borderRadius: 4,
            background: 'var(--accent)',
            color: '#0b0e13',
            border: '1px solid var(--accent)',
            fontSize: 11.5,
            fontWeight: 600,
            cursor: busy ? 'wait' : 'pointer',
            display: 'inline-flex',
            alignItems: 'center',
            gap: 4,
          }}
        >
          <Icon.Play size={10} /> {busy ? 'Working…' : 'Apply'}
        </button>
      </div>
    </div>
  )
}

interface SavePresetDialogProps {
  workspacePath: string
  workspaceName: string
  onClose: () => void
  onSaved: () => void
}

function SavePresetDialog({ workspacePath, workspaceName, onClose, onSaved }: SavePresetDialogProps) {
  const [id, setId] = useState('')
  const [name, setName] = useState('')
  const [description, setDescription] = useState('')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const submit = async () => {
    const api = getPresetApi()
    if (!api?.save) {
      setError('preset.save IPC not available.')
      return
    }
    if (!/^[a-z0-9][a-z0-9-]*$/.test(id)) {
      setError('Id 는 소문자/숫자/하이픈만 허용 (예: my-preset).')
      return
    }
    setSaving(true)
    setError(null)
    try {
      await api.save(workspacePath, {
        id,
        name: name.trim() || undefined,
        description: description.trim() || undefined,
      })
      onSaved()
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    } finally {
      setSaving(false)
    }
  }

  return (
    <ModalOverlay onClose={onClose}>
      <div
        style={{
          width: 480,
          background: 'var(--bg-1)',
          border: '1px solid var(--line-2)',
          borderRadius: 10,
          display: 'flex',
          flexDirection: 'column',
          overflow: 'hidden',
        }}
        onClick={(e) => e.stopPropagation()}
      >
        <ModalHeader title="Save current as preset" subtitle={`from ${workspaceName}`} onClose={onClose} />
        <div style={{ padding: '14px 18px', display: 'flex', flexDirection: 'column', gap: 12 }}>
          <Field label="Id" hint="lowercase, hyphens — used as the directory name">
            <input
              autoFocus
              value={id}
              onChange={(e) => setId(e.target.value)}
              placeholder="my-preset"
              style={inputStyle}
            />
          </Field>
          <Field label="Name (optional)">
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="My Preset"
              style={inputStyle}
            />
          </Field>
          <Field label="Description (optional)">
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Short description shown on the card."
              rows={3}
              style={{ ...inputStyle, resize: 'vertical', fontFamily: 'inherit' }}
            />
          </Field>
          {error && (
            <div
              style={{
                padding: 10,
                background: 'color-mix(in oklab, var(--danger) 8%, transparent)',
                border: '1px solid var(--danger)',
                borderRadius: 6,
                color: 'var(--danger)',
                fontSize: 12,
              }}
            >
              {error}
            </div>
          )}
        </div>
        <div
          style={{
            padding: '12px 18px',
            borderTop: '1px solid var(--line-1)',
            display: 'flex',
            gap: 8,
            justifyContent: 'flex-end',
            background: 'var(--bg-2)',
          }}
        >
          <Btn variant="ghost" onClick={onClose} disabled={saving}>
            Cancel
          </Btn>
          <Btn variant="primary" onClick={submit} disabled={saving || !id}>
            {saving ? 'Saving…' : 'Save preset'}
          </Btn>
        </div>
      </div>
    </ModalOverlay>
  )
}

const inputStyle: React.CSSProperties = {
  width: '100%',
  padding: '8px 10px',
  borderRadius: 6,
  background: 'var(--bg-2)',
  border: '1px solid var(--line-2)',
  color: 'var(--text-1)',
  fontSize: 12.5,
  outline: 'none',
}

function Field({ label, hint, children }: { label: string; hint?: string; children: React.ReactNode }) {
  return (
    <div>
      <div
        className="ns mono"
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
      {children}
      {hint && (
        <div style={{ fontSize: 11, color: 'var(--text-4)', marginTop: 4 }}>{hint}</div>
      )}
    </div>
  )
}
