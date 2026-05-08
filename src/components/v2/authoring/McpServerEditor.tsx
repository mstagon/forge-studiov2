/**
 * McpServerEditor — modal form for adding / editing an MCP server entry inside
 * `.claude/mcp.json` under `mcpServers[<name>]`.
 *
 * Supports the three Claude Code transports:
 *   - stdio  — `command` + `args[]` + `env{}` (default)
 *   - http   — `url` + optional `env{}`
 *   - sse    — `url` + optional `env{}`
 *
 * Validation:
 *   - name: required, slug-shaped, unique vs existingNames (create only)
 *   - command: required for stdio
 *   - url: required for http / sse, must be a parseable URL
 */

import { useEffect, useState, type CSSProperties } from 'react'
import {
  Field,
  Modal,
  PrimaryButton,
  SelectInput,
  TextInput,
} from './EditorShell'
import { Btn, Pill } from '../primitives'
import { Icon } from '../icons'

const NAME_RE = /^[A-Za-z0-9._-]+$/

type TransportType = 'stdio' | 'http' | 'sse'

export interface McpServerSpec {
  command?: string
  args?: string[]
  env?: Record<string, string>
  type?: TransportType
  url?: string
  disabled?: boolean
}

export interface McpServerEditorProps {
  workspacePath: string
  /** Existing server name when editing; absent → create mode. */
  editing?: { name: string; spec: McpServerSpec }
  /** Lowercased existing names for collision detection (create mode only). */
  existingNames: string[]
  onClose: () => void
  onSaved: (name: string) => void
}

interface McpFormState {
  name: string
  type: TransportType
  command: string
  args: string[]
  env: Array<{ key: string; value: string }>
  url: string
  disabled: boolean
}

const EMPTY: McpFormState = {
  name: '',
  type: 'stdio',
  command: '',
  args: [],
  env: [],
  url: '',
  disabled: false,
}

export function McpServerEditor({
  workspacePath,
  editing,
  existingNames,
  onClose,
  onSaved,
}: McpServerEditorProps) {
  const isEdit = !!editing
  const [form, setForm] = useState<McpFormState>(() => {
    if (!editing) return EMPTY
    return {
      name: editing.name,
      type: editing.spec.type ?? 'stdio',
      command: editing.spec.command ?? '',
      args: editing.spec.args ? [...editing.spec.args] : [],
      env: editing.spec.env
        ? Object.entries(editing.spec.env).map(([key, value]) => ({ key, value }))
        : [],
      url: editing.spec.url ?? '',
      disabled: !!editing.spec.disabled,
    }
  })
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // ─── Test connection state ───────────────────────────────────────
  const [testing, setTesting] = useState(false)
  const [testResult, setTestResult] = useState<{ ok: boolean; message: string } | null>(null)

  // ─── Args row helpers ────────────────────────────────────────────
  const [argDraft, setArgDraft] = useState('')
  function addArg() {
    const trimmed = argDraft.trim()
    if (!trimmed) return
    setForm((f) => ({ ...f, args: [...f.args, trimmed] }))
    setArgDraft('')
  }
  function removeArg(i: number) {
    setForm((f) => ({ ...f, args: f.args.filter((_, idx) => idx !== i) }))
  }

  // ─── Env row helpers ─────────────────────────────────────────────
  function addEnvRow() {
    setForm((f) => ({ ...f, env: [...f.env, { key: '', value: '' }] }))
  }
  function updateEnvRow(i: number, patch: Partial<{ key: string; value: string }>) {
    setForm((f) => ({
      ...f,
      env: f.env.map((row, idx) => (idx === i ? { ...row, ...patch } : row)),
    }))
  }
  function removeEnvRow(i: number) {
    setForm((f) => ({ ...f, env: f.env.filter((_, idx) => idx !== i) }))
  }

  // Reset test result whenever the user touches the form (stale otherwise).
  useEffect(() => {
    setTestResult(null)
  }, [form.command, form.args, form.url, form.type, form.env])

  // ─── Validation ──────────────────────────────────────────────────
  const nameLower = form.name.trim().toLowerCase()
  const nameValid = nameLower !== '' && NAME_RE.test(form.name.trim())
  const nameCollides =
    !isEdit &&
    nameValid &&
    existingNames.map((n) => n.toLowerCase()).includes(nameLower)
  const nameError = !form.name.trim()
    ? null
    : !nameValid
      ? '이름은 영문/숫자/._- 만 허용됩니다'
      : nameCollides
        ? '이미 같은 이름의 서버가 있습니다'
        : null

  const commandValid = form.type !== 'stdio' || form.command.trim().length > 0
  const commandError =
    form.type === 'stdio' && form.command !== '' && !commandValid
      ? 'stdio 서버는 command 가 필요합니다'
      : null

  const urlValid =
    form.type === 'stdio' ||
    (form.url.trim().length > 0 && /^https?:\/\//i.test(form.url.trim()))
  const urlError =
    (form.type === 'http' || form.type === 'sse') && form.url !== '' && !urlValid
      ? '`http://` 또는 `https://` URL 이어야 합니다'
      : null

  const envValid = form.env.every((row) => {
    if (row.key === '' && row.value === '') return true
    return /^[A-Z_][A-Z0-9_]*$/i.test(row.key)
  })
  const envError = !envValid ? '환경 변수 키는 영문/숫자/_ 만 허용됩니다' : null

  const canSave =
    nameValid &&
    !nameCollides &&
    commandValid &&
    urlValid &&
    envValid &&
    !saving

  // ─── Build spec ──────────────────────────────────────────────────
  function buildSpec(): McpServerSpec {
    const env = Object.fromEntries(
      form.env.filter((r) => r.key.trim() !== '').map((r) => [r.key.trim(), r.value])
    )
    if (form.type === 'stdio') {
      return {
        type: 'stdio',
        command: form.command.trim(),
        args: form.args.length > 0 ? form.args : undefined,
        env: Object.keys(env).length > 0 ? env : undefined,
        disabled: form.disabled || undefined,
      }
    }
    return {
      type: form.type,
      url: form.url.trim(),
      env: Object.keys(env).length > 0 ? env : undefined,
      disabled: form.disabled || undefined,
    }
  }

  async function handleSave() {
    if (!canSave) return
    setSaving(true)
    setError(null)
    try {
      const spec = buildSpec()
      if (isEdit && editing) {
        await window.api.harness.updateMcpServer(workspacePath, editing.name, spec)
      } else {
        await window.api.harness.addMcpServer(workspacePath, form.name, spec)
      }
      onSaved(form.name)
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    } finally {
      setSaving(false)
    }
  }

  async function handleTest() {
    if (!isEdit) {
      setTestResult({
        ok: false,
        message: '먼저 저장한 뒤 테스트하세요 (저장된 설정을 사용합니다).',
      })
      return
    }
    setTesting(true)
    setTestResult(null)
    try {
      const result = await window.api.harness.testMcpConnection(
        workspacePath,
        editing!.name
      )
      setTestResult(result)
    } catch (err) {
      setTestResult({
        ok: false,
        message: err instanceof Error ? err.message : String(err),
      })
    } finally {
      setTesting(false)
    }
  }

  return (
    <Modal
      title={isEdit ? `MCP server · ${editing!.name}` : 'New MCP server'}
      subtitle=".claude/mcp.json · mcpServers[<name>]"
      onClose={onClose}
      width={760}
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
            disabled={!canSave}
          >
            {saving ? '저장 중…' : isEdit ? '저장' : '추가'}
          </PrimaryButton>
        </>
      }
    >
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
        <Field
          label="Name"
          required
          hint="MCP 서버 식별자"
          error={nameError}
          htmlFor="mcp-name"
        >
          <TextInput
            id="mcp-name"
            value={form.name}
            onChange={(e) => setForm({ ...form, name: e.target.value })}
            placeholder="filesystem"
            disabled={isEdit}
            error={!!nameError}
          />
        </Field>
        <Field label="Transport" required htmlFor="mcp-type">
          <SelectInput
            id="mcp-type"
            value={form.type}
            onChange={(e) => setForm({ ...form, type: e.target.value as TransportType })}
          >
            <option value="stdio">stdio</option>
            <option value="http">http</option>
            <option value="sse">sse</option>
          </SelectInput>
        </Field>
      </div>

      {form.type === 'stdio' ? (
        <>
          <Field
            label="Command"
            required
            hint="실행 가능한 바이너리 경로 또는 PATH 의 명령"
            error={commandError}
          >
            <TextInput
              value={form.command}
              onChange={(e) => setForm({ ...form, command: e.target.value })}
              placeholder="npx"
              error={!!commandError}
            />
          </Field>

          <Field label="Args" hint="enter 또는 + 로 추가">
            <div style={chipsRow}>
              {form.args.map((a, i) => (
                <span key={i} style={chip}>
                  <code style={{ fontFamily: 'var(--font-mono)', fontSize: 11 }}>{a}</code>
                  <button
                    onClick={() => removeArg(i)}
                    aria-label={`${a} 삭제`}
                    style={chipRemoveBtn}
                  >
                    <Icon.X size={9} />
                  </button>
                </span>
              ))}
              <input
                value={argDraft}
                onChange={(e) => setArgDraft(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    e.preventDefault()
                    addArg()
                  } else if (e.key === 'Backspace' && argDraft === '' && form.args.length > 0) {
                    removeArg(form.args.length - 1)
                  }
                }}
                placeholder="-y @modelcontextprotocol/server-filesystem"
                style={chipInput}
              />
              <button
                onClick={addArg}
                aria-label="Add arg"
                style={chipAddBtn}
                disabled={argDraft.trim() === ''}
              >
                <Icon.Plus size={11} />
              </button>
            </div>
          </Field>
        </>
      ) : (
        <Field label="URL" required hint="http(s):// 으로 시작" error={urlError}>
          <TextInput
            value={form.url}
            onChange={(e) => setForm({ ...form, url: e.target.value })}
            placeholder="https://mcp.example.com/sse"
            error={!!urlError}
          />
        </Field>
      )}

      <Field label="Env" hint="key=value · 비밀값은 ENV 변수로 분리 권장" error={envError}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
          {form.env.map((row, i) => (
            <div key={i} style={envRow}>
              <TextInput
                value={row.key}
                onChange={(e) => updateEnvRow(i, { key: e.target.value })}
                placeholder="API_KEY"
                style={{ flex: '0 0 180px', fontFamily: 'var(--font-mono)' }}
              />
              <TextInput
                value={row.value}
                onChange={(e) => updateEnvRow(i, { value: e.target.value })}
                placeholder="sk-..."
                style={{ flex: 1 }}
              />
              <button
                onClick={() => removeEnvRow(i)}
                aria-label="Remove env"
                style={envRemoveBtn}
              >
                <Icon.X size={11} />
              </button>
            </div>
          ))}
          <Btn variant="ghost" icon={<Icon.Plus size={11} />} onClick={addEnvRow}>
            환경 변수 추가
          </Btn>
        </div>
      </Field>

      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 12,
          marginTop: 4,
          flexWrap: 'wrap',
        }}
      >
        <label style={checkboxRow}>
          <input
            type="checkbox"
            checked={form.disabled}
            onChange={(e) => setForm({ ...form, disabled: e.target.checked })}
          />
          비활성화 (Claude 가 MCP 등록 시 무시)
        </label>
        <div style={{ flex: 1 }} />
        <Btn
          variant="default"
          icon={<Icon.Activity size={11} />}
          onClick={handleTest}
          disabled={testing}
          title={isEdit ? '저장된 설정으로 연결 테스트' : '저장 후 테스트 가능'}
        >
          {testing ? 'Testing…' : 'Test connection'}
        </Btn>
        {testResult && (
          <Pill color={testResult.ok ? 'var(--success)' : 'var(--danger)'}>
            {testResult.ok ? 'OK' : 'FAIL'}
            <span
              style={{
                marginLeft: 6,
                fontFamily: 'var(--font-mono)',
                fontSize: 10,
                color: 'var(--text-3)',
                textTransform: 'none',
              }}
            >
              {testResult.message}
            </span>
          </Pill>
        )}
      </div>
    </Modal>
  )
}

// ─── styles ──────────────────────────────────────────────────────────

const chipsRow: CSSProperties = {
  display: 'flex',
  flexWrap: 'wrap',
  gap: 6,
  alignItems: 'center',
  padding: 6,
  background: 'var(--bg-2)',
  border: '1px solid var(--line-2)',
  borderRadius: 5,
  minHeight: 36,
}

const chip: CSSProperties = {
  display: 'inline-flex',
  alignItems: 'center',
  gap: 4,
  padding: '3px 4px 3px 8px',
  background: 'var(--bg-3)',
  border: '1px solid var(--line-2)',
  borderRadius: 4,
  color: 'var(--text-1)',
  fontSize: 11,
}

const chipRemoveBtn: CSSProperties = {
  width: 16,
  height: 16,
  borderRadius: 3,
  background: 'transparent',
  border: '1px solid var(--line-2)',
  color: 'var(--text-3)',
  display: 'inline-flex',
  alignItems: 'center',
  justifyContent: 'center',
  cursor: 'pointer',
}

const chipInput: CSSProperties = {
  flex: 1,
  minWidth: 120,
  height: 24,
  padding: '0 6px',
  background: 'transparent',
  border: 'none',
  outline: 'none',
  color: 'var(--text-1)',
  fontSize: 12,
  fontFamily: 'var(--font-mono)',
}

const chipAddBtn: CSSProperties = {
  width: 22,
  height: 22,
  borderRadius: 4,
  background: 'var(--bg-3)',
  border: '1px solid var(--line-2)',
  color: 'var(--text-2)',
  display: 'inline-flex',
  alignItems: 'center',
  justifyContent: 'center',
  cursor: 'pointer',
}

const envRow: CSSProperties = {
  display: 'flex',
  gap: 6,
  alignItems: 'center',
}

const envRemoveBtn: CSSProperties = {
  width: 26,
  height: 26,
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

const checkboxRow: CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  gap: 8,
  fontSize: 12,
  color: 'var(--text-2)',
}
