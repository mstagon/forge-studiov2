/**
 * CommandEditor — modal form for creating / editing a Claude Code slash command.
 *
 * On disk this writes `<wsPath>/.claude/commands/<name>.md` with optional YAML
 * frontmatter (description / argument-hint) followed by the command body
 * markdown that Claude renders when the user runs `/<name>`.
 *
 * Validation:
 *   - name: required, slug-shaped (`[A-Za-z0-9._-]+`), unique vs `existingNames`
 *   - description: optional but recommended (used in the Library / palette)
 *   - body: optional but recommended
 */

import { useEffect, useState } from 'react'
import {
  Field,
  Modal,
  PrimaryButton,
  TextArea,
  TextInput,
} from './EditorShell'
import { Btn } from '../primitives'
import { Icon } from '../icons'

const NAME_RE = /^[A-Za-z0-9._-]+$/

export interface CommandEditorProps {
  workspacePath: string
  /** Existing command name when editing; absent → create mode. */
  editing?: string
  /** Lowercased existing names for collision detection. */
  existingNames: string[]
  /** When duplicating, source command file to copy. */
  duplicateFrom?: string
  /** Suggested new name when duplicating. */
  initialName?: string
  onClose: () => void
  onSaved: (commandName: string) => void
}

interface CommandFormState {
  name: string
  description: string
  argHint: string
  body: string
}

const EMPTY: CommandFormState = {
  name: '',
  description: '',
  argHint: '',
  body: '# Description\n\n사용자가 `/<command>` 를 호출했을 때 Claude 가 수행할 작업을 적습니다.\n',
}

export function CommandEditor({
  workspacePath,
  editing,
  existingNames,
  duplicateFrom,
  initialName,
  onClose,
  onSaved,
}: CommandEditorProps) {
  const isEdit = !!editing
  const isDuplicate = !isEdit && !!duplicateFrom
  const needsLoad = isEdit || isDuplicate
  const [form, setForm] = useState<CommandFormState>({
    ...EMPTY,
    name: initialName ?? '',
  })
  const [loading, setLoading] = useState(needsLoad)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // Load existing file when editing or duplicating.
  useEffect(() => {
    const source = editing ?? duplicateFrom
    if (!source) return
    let cancelled = false
    ;(async () => {
      try {
        const file = `${workspacePath}/.claude/commands/${source}.md`
        const raw = await window.api.harness.readFile(file)
        if (cancelled) return
        const parsed = parseFrontmatter(raw)
        setForm({
          name: isEdit ? source : (initialName ?? `${source}-copy`),
          description: parsed.data.description ?? '',
          argHint:
            parsed.data['argument-hint'] ??
            parsed.data['argHint'] ??
            parsed.data.args ??
            '',
          body: parsed.body || '',
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
  }, [isEdit, editing, duplicateFrom, initialName, workspacePath])

  const nameLower = form.name.trim().toLowerCase()
  const nameValid = nameLower !== '' && NAME_RE.test(form.name.trim())
  const nameCollides =
    !isEdit &&
    nameValid &&
    existingNames.map((n) => n.toLowerCase()).includes(nameLower)
  const canSave = nameValid && !nameCollides && !saving && !loading

  const nameError = !form.name.trim()
    ? null
    : !nameValid
      ? '이름은 영문/숫자/._- 만 허용됩니다'
      : nameCollides
        ? '이미 같은 이름의 커맨드가 있습니다'
        : null

  async function handleSave() {
    if (!canSave) return
    setSaving(true)
    setError(null)
    try {
      if (isEdit && editing) {
        const composed = composeCommandFile(form)
        await window.api.harness.updateCommand(workspacePath, editing, composed)
        if (form.name !== editing) {
          await window.api.harness.renameCommand(workspacePath, editing, form.name)
        }
      } else {
        await window.api.harness.createCommand(workspacePath, {
          name: form.name,
          description: form.description || undefined,
          argHint: form.argHint || undefined,
          body: form.body || undefined,
        })
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
      title={isEdit ? `Command · /${editing}` : 'New Command'}
      subtitle="Claude Code slash command (.claude/commands/<name>.md)"
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
              hint="`/이름` 으로 호출됩니다"
              error={nameError}
              htmlFor="cmd-name"
            >
              <TextInput
                id="cmd-name"
                value={form.name}
                onChange={(e) => setForm({ ...form, name: e.target.value })}
                placeholder="ship"
                error={!!nameError}
              />
            </Field>
            <Field label="Argument hint" hint="optional · 사용자에게 보이는 인자 안내">
              <TextInput
                value={form.argHint}
                onChange={(e) => setForm({ ...form, argHint: e.target.value })}
                placeholder="<title> [--draft]"
              />
            </Field>
          </div>
          <Field
            label="Description"
            hint="Library / Command Palette 에 노출됩니다"
          >
            <TextInput
              value={form.description}
              onChange={(e) => setForm({ ...form, description: e.target.value })}
              placeholder="린트 → 테스트 → 푸시 → PR 생성 일괄"
            />
          </Field>
          <Field
            label="Body (Markdown)"
            hint={
              <span>
                <code style={{ fontFamily: 'var(--font-mono)' }}>$ARGUMENTS</code> 로 인자 참조
              </span>
            }
          >
            <TextArea
              value={form.body}
              onChange={(e) => setForm({ ...form, body: e.target.value })}
              rows={16}
              mono
            />
          </Field>
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

function composeCommandFile(form: CommandFormState): string {
  const fm: Record<string, string | undefined> = {
    description: form.description || undefined,
    'argument-hint': form.argHint || undefined,
  }
  const hasFm = Object.values(fm).some(Boolean)
  if (!hasFm) {
    return form.body.startsWith('\n') ? form.body : '\n' + form.body
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
