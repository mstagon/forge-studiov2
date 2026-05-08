/**
 * AgentEditor — modal form for creating / editing a Claude Code agent file.
 *
 * On disk this writes `<wsPath>/.claude/agents/<name>.md` with YAML
 * frontmatter (name / description / tools / model) followed by a Markdown body.
 *
 * Modes:
 *   - create: blank fields, save → harness:createAgent (+ optional CLAUDE.md sync)
 *   - edit:   loads existing file via harness:readFile, save → harness:updateAgent
 *
 * Validation:
 *   - name: required, slug-shaped (`[A-Za-z0-9._-]+`), unique vs `existingNames`
 *   - description: required (frontmatter must not be empty)
 *   - body: optional but recommended
 */

import { useEffect, useState } from 'react'
import {
  Field,
  Modal,
  PrimaryButton,
  SelectInput,
  TextArea,
  TextInput,
} from './EditorShell'
import { Btn } from '../primitives'
import { Icon } from '../icons'

const NAME_RE = /^[A-Za-z0-9._-]+$/

export interface AgentEditorProps {
  workspacePath: string
  /** Existing agent name when editing; absent → create mode. */
  editing?: string
  /** Lowercased existing names for collision detection. */
  existingNames: string[]
  onClose: () => void
  onSaved: (agentName: string) => void
}

interface AgentFormState {
  name: string
  description: string
  tools: string
  model: string
  body: string
  syncRouting: boolean
}

const EMPTY: AgentFormState = {
  name: '',
  description: '',
  tools: '',
  model: '',
  body: '# Description\n\n주요 책임과 트리거 조건을 적는다.\n',
  syncRouting: false,
}

export function AgentEditor({
  workspacePath,
  editing,
  existingNames,
  onClose,
  onSaved,
}: AgentEditorProps) {
  const isEdit = !!editing
  const [form, setForm] = useState<AgentFormState>(EMPTY)
  const [loading, setLoading] = useState(isEdit)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // Load existing file when editing.
  useEffect(() => {
    if (!isEdit || !editing) return
    let cancelled = false
    ;(async () => {
      try {
        const file = `${workspacePath}/.claude/agents/${editing}.md`
        const raw = await window.api.harness.readFile(file)
        if (cancelled) return
        const parsed = parseFrontmatter(raw)
        setForm({
          name: editing,
          description: parsed.data.description ?? '',
          tools: parsed.data.tools ?? '',
          model: parsed.data.model ?? '',
          body: parsed.body || '',
          syncRouting: false,
        })
      } catch (err) {
        if (!cancelled) setError(err instanceof Error ? err.message : String(err))
      } finally {
        if (!cancelled) setLoading(false)
      }
    })()
    return () => {
      cancelled = true
    }
  }, [isEdit, editing, workspacePath])

  const nameLower = form.name.trim().toLowerCase()
  const nameValid = nameLower !== '' && NAME_RE.test(form.name.trim())
  const nameCollides =
    !isEdit &&
    nameValid &&
    existingNames.map((n) => n.toLowerCase()).includes(nameLower)
  const descriptionValid = form.description.trim().length > 0
  const canSave = nameValid && !nameCollides && descriptionValid && !saving && !loading

  const nameError = !form.name.trim()
    ? null
    : !nameValid
      ? '이름은 영문/숫자/._- 만 허용됩니다'
      : nameCollides
        ? '이미 같은 이름의 에이전트가 있습니다'
        : null

  async function handleSave() {
    if (!canSave) return
    setSaving(true)
    setError(null)
    try {
      if (isEdit && editing) {
        // Compose full file body (frontmatter + body) for update.
        const composed = composeAgentFile(form)
        await window.api.harness.updateAgent(workspacePath, editing, composed)
        // Rename if name changed.
        if (form.name !== editing) {
          await window.api.harness.renameAgent(workspacePath, editing, form.name)
        }
      } else {
        await window.api.harness.createAgent(workspacePath, {
          name: form.name,
          description: form.description,
          tools: form.tools || undefined,
          model: form.model || undefined,
          body: form.body || undefined,
        })
        if (form.syncRouting) {
          await window.api.harness
            .syncRouting(workspacePath, 'agent', {
              name: form.name,
              description: form.description,
            })
            .catch(() => {
              // Sync is best-effort — don't fail the create.
            })
        }
      }
      onSaved(form.name)
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    } finally {
      setSaving(false)
    }
  }

  return (
    <Modal
      title={isEdit ? `Agent · ${editing}` : 'New Agent'}
      subtitle="Claude Code agent (.claude/agents/<name>.md)"
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
            {saving ? '저장 중…' : isEdit ? '저장' : '생성'}
          </PrimaryButton>
        </>
      }
    >
      {loading ? (
        <div style={{ color: 'var(--text-3)', fontSize: 12 }}>불러오는 중…</div>
      ) : (
        <>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
            <Field
              label="Name"
              required
              hint="파일명이 됩니다"
              error={nameError}
              htmlFor="agent-name"
            >
              <TextInput
                id="agent-name"
                value={form.name}
                onChange={(e) => setForm({ ...form, name: e.target.value })}
                placeholder="code-reviewer"
                error={!!nameError}
              />
            </Field>
            <Field label="Model" hint="optional" htmlFor="agent-model">
              <SelectInput
                id="agent-model"
                value={form.model}
                onChange={(e) => setForm({ ...form, model: e.target.value })}
              >
                <option value="">기본값</option>
                <option value="haiku">haiku</option>
                <option value="sonnet">sonnet</option>
                <option value="opus">opus</option>
                <option value="inherit">inherit</option>
              </SelectInput>
            </Field>
          </div>
          <Field
            label="Description"
            required
            hint="라우팅에 표시되는 한 줄 설명"
          >
            <TextInput
              value={form.description}
              onChange={(e) => setForm({ ...form, description: e.target.value })}
              placeholder="코드 리뷰를 자동 수행하는 에이전트"
              error={form.description.trim() === '' && form.name !== ''}
            />
          </Field>
          <Field label="Tools" hint="comma-separated (e.g. Read,Edit,Bash)">
            <TextInput
              value={form.tools}
              onChange={(e) => setForm({ ...form, tools: e.target.value })}
              placeholder="Read, Edit, Bash"
            />
          </Field>
          <Field label="Body (Markdown)">
            <TextArea
              value={form.body}
              onChange={(e) => setForm({ ...form, body: e.target.value })}
              rows={14}
              mono
            />
          </Field>
          {!isEdit && (
            <label
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 8,
                fontSize: 12,
                color: 'var(--text-2)',
                marginTop: 4,
              }}
            >
              <input
                type="checkbox"
                checked={form.syncRouting}
                onChange={(e) => setForm({ ...form, syncRouting: e.target.checked })}
              />
              CLAUDE.md의 Agent Routing 표에 자동 추가
            </label>
          )}
        </>
      )}
    </Modal>
  )
}

// ─── helpers ──────────────────────────────────────────────────────────

function parseFrontmatter(raw: string): { data: Record<string, string>; body: string } {
  const lines = raw.split(/\r?\n/)
  if (lines[0]?.trim() !== '---') {
    return { data: {}, body: raw }
  }
  const data: Record<string, string> = {}
  let i = 1
  for (; i < lines.length; i++) {
    if (lines[i].trim() === '---') {
      i++
      break
    }
    const colon = lines[i].indexOf(':')
    if (colon === -1) continue
    const key = lines[i].slice(0, colon).trim()
    let value = lines[i].slice(colon + 1).trim()
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1)
    }
    if (key) data[key] = value
  }
  return { data, body: lines.slice(i).join('\n') }
}

function composeAgentFile(form: AgentFormState): string {
  const fm: Record<string, string | undefined> = {
    name: form.name,
    description: form.description,
    tools: form.tools || undefined,
    model: form.model || undefined,
  }
  const lines = ['---']
  for (const [k, v] of Object.entries(fm)) {
    if (!v) continue
    const needsQuote = /[:#"']/.test(v)
    lines.push(`${k}: ${needsQuote ? JSON.stringify(v) : v}`)
  }
  lines.push('---')
  lines.push('')
  return lines.join('\n') + (form.body.startsWith('\n') ? form.body : '\n' + form.body)
}
