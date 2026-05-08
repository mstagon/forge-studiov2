/**
 * PermissionsEditor — modal for editing Claude Code's `permissions.allow` and
 * `permissions.deny` arrays inside `.claude/settings.json`.
 *
 * Each rule is a string like `Bash(npm run *)` or `Read(./.env*)` — we don't
 * validate the inner syntax (Claude does that at runtime), only basic shape:
 *   - non-empty, no embedded newlines
 *   - dedupe within the same column
 *
 * UX: two columns of rule chips with inline `+ add` input + `×` remove button.
 */

import { useEffect, useState, type CSSProperties } from 'react'
import { Field, Modal, PrimaryButton, TextInput } from './EditorShell'
import { Btn, Dot, Pill } from '../primitives'
import { Icon } from '../icons'

export interface PermissionsEditorProps {
  workspacePath: string
  onClose: () => void
  onSaved: (next: { allow: string[]; deny: string[] }) => void
}

export function PermissionsEditor({
  workspacePath,
  onClose,
  onSaved,
}: PermissionsEditorProps) {
  const [allow, setAllow] = useState<string[]>([])
  const [deny, setDeny] = useState<string[]>([])
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false
    ;(async () => {
      try {
        const perms = await window.api.harness.getPermissions(workspacePath)
        if (cancelled) return
        setAllow(perms.allow)
        setDeny(perms.deny)
      } catch (err) {
        if (!cancelled) setError(err instanceof Error ? err.message : String(err))
      } finally {
        if (!cancelled) setLoading(false)
      }
    })()
    return () => {
      cancelled = true
    }
  }, [workspacePath])

  async function handleSave() {
    setSaving(true)
    setError(null)
    try {
      // Final dedupe + trim before persisting.
      const clean = (xs: string[]) =>
        Array.from(new Set(xs.map((s) => s.trim()).filter(Boolean)))
      const next = { allow: clean(allow), deny: clean(deny) }
      await window.api.harness.setPermissions(workspacePath, next)
      onSaved(next)
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    } finally {
      setSaving(false)
    }
  }

  return (
    <Modal
      title="Permissions"
      subtitle=".claude/settings.json · permissions.allow / permissions.deny"
      onClose={onClose}
      width={820}
      footer={
        <>
          <span style={{ color: 'var(--danger)', fontSize: 11, marginRight: 'auto' }}>
            {error || ''}
          </span>
          <Btn variant="ghost" onClick={onClose} disabled={saving}>
            취소
          </Btn>
          <PrimaryButton
            icon={<Icon.Check size={11} />}
            onClick={handleSave}
            disabled={loading || saving}
          >
            {saving ? '저장 중…' : '저장'}
          </PrimaryButton>
        </>
      }
    >
      {loading ? (
        <div style={{ color: 'var(--text-3)', fontSize: 12 }}>불러오는 중…</div>
      ) : (
        <>
          <Field
            label="Rule format"
            hint={
              <span>
                예: <code style={syntaxCode}>Bash(npm run *)</code> ·{' '}
                <code style={syntaxCode}>Read(./.env*)</code> ·{' '}
                <code style={syntaxCode}>WebFetch(domain:github.com)</code>
              </span>
            }
          >
            <div style={{ display: 'none' }} />
          </Field>
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: '1fr 1fr',
              gap: 14,
              marginTop: -8,
            }}
          >
            <PermissionColumn
              title="Allow"
              color="var(--success)"
              rules={allow}
              other={deny}
              onChange={setAllow}
            />
            <PermissionColumn
              title="Deny"
              color="var(--danger)"
              rules={deny}
              other={allow}
              onChange={setDeny}
            />
          </div>
        </>
      )}
    </Modal>
  )
}

interface PermissionColumnProps {
  title: string
  color: string
  rules: string[]
  /** The opposite list — used to flag a rule that exists in both columns. */
  other: string[]
  onChange: (next: string[]) => void
}

function PermissionColumn({ title, color, rules, other, onChange }: PermissionColumnProps) {
  const [draft, setDraft] = useState('')
  const [draftError, setDraftError] = useState<string | null>(null)

  function tryAdd() {
    const trimmed = draft.trim()
    if (!trimmed) {
      setDraftError('빈 값입니다')
      return
    }
    if (/[\r\n]/.test(trimmed)) {
      setDraftError('한 줄짜리 룰만 허용됩니다')
      return
    }
    if (rules.includes(trimmed)) {
      setDraftError('이미 존재하는 룰입니다')
      return
    }
    onChange([...rules, trimmed])
    setDraft('')
    setDraftError(null)
  }

  function remove(i: number) {
    onChange(rules.filter((_, idx) => idx !== i))
  }

  return (
    <div style={columnBox}>
      <div style={columnHeader}>
        <Dot color={color} size={6} />
        <span
          style={{
            fontSize: 11,
            fontWeight: 600,
            color: 'var(--text-2)',
            letterSpacing: 0.4,
            textTransform: 'uppercase',
          }}
        >
          {title}
        </span>
        <span className="mono" style={{ fontSize: 10, color: 'var(--text-4)' }}>
          {rules.length}
        </span>
      </div>
      <div style={{ padding: 10, display: 'flex', flexDirection: 'column', gap: 6 }}>
        {rules.length === 0 && (
          <div style={{ fontSize: 11, color: 'var(--text-4)' }}>등록된 룰 없음</div>
        )}
        {rules.map((rule, i) => {
          const conflict = other.includes(rule)
          return (
            <div key={i} style={ruleRow}>
              <code
                style={{
                  flex: 1,
                  fontFamily: 'var(--font-mono)',
                  fontSize: 11.5,
                  color: 'var(--text-1)',
                  background: 'var(--bg-3)',
                  padding: '4px 8px',
                  borderRadius: 3,
                  wordBreak: 'break-all',
                }}
              >
                {rule}
              </code>
              {conflict && (
                <Pill color="var(--warning)" style={{ height: 16, fontSize: 9.5 }}>
                  CONFLICT
                </Pill>
              )}
              <button
                onClick={() => remove(i)}
                aria-label={`${rule} 삭제`}
                style={removeBtn}
              >
                <Icon.X size={11} />
              </button>
            </div>
          )
        })}
        <div style={{ display: 'flex', gap: 6, marginTop: 4 }}>
          <TextInput
            value={draft}
            onChange={(e) => {
              setDraft(e.target.value)
              if (draftError) setDraftError(null)
            }}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                e.preventDefault()
                tryAdd()
              }
            }}
            placeholder="Bash(npm run *)"
            style={{
              fontFamily: 'var(--font-mono)',
              borderColor: draftError ? 'var(--danger)' : undefined,
            }}
            error={!!draftError}
          />
          <Btn variant="default" icon={<Icon.Plus size={11} />} onClick={tryAdd}>
            추가
          </Btn>
        </div>
        {draftError && (
          <div style={{ fontSize: 11, color: 'var(--danger)' }}>{draftError}</div>
        )}
      </div>
    </div>
  )
}

// ─── styles ──────────────────────────────────────────────────────────

const columnBox: CSSProperties = {
  background: 'var(--bg-2)',
  border: '1px solid var(--line-1)',
  borderRadius: 6,
  display: 'flex',
  flexDirection: 'column',
}

const columnHeader: CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  gap: 8,
  padding: '10px 12px',
  borderBottom: '1px solid var(--line-1)',
}

const ruleRow: CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  gap: 6,
}

const removeBtn: CSSProperties = {
  width: 24,
  height: 24,
  borderRadius: 4,
  background: 'transparent',
  border: '1px solid var(--line-2)',
  color: 'var(--text-3)',
  display: 'inline-flex',
  alignItems: 'center',
  justifyContent: 'center',
  cursor: 'pointer',
  flexShrink: 0,
}

const syntaxCode: CSSProperties = {
  fontFamily: 'var(--font-mono)',
  fontSize: 10.5,
  background: 'var(--bg-3)',
  padding: '1px 4px',
  borderRadius: 2,
  color: 'var(--text-2)',
}
