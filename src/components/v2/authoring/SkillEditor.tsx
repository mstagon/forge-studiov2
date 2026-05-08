/**
 * SkillEditor — modal form for creating / editing a Claude Code skill.
 *
 * On disk this writes `<wsPath>/.claude/skills/<name>/SKILL.md` (the directory
 * is the unit, hence rename = mv on the directory). Frontmatter mirrors the
 * scanner shape: name, description, globs (or files).
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

export interface SkillEditorProps {
  workspacePath: string
  editing?: string
  existingNames: string[]
  onClose: () => void
  onSaved: (skillName: string) => void
}

interface SkillFormState {
  name: string
  description: string
  globs: string
  body: string
  syncRouting: boolean
}

const EMPTY: SkillFormState = {
  name: '',
  description: '',
  globs: '',
  body: '# Description\n\n자동 적용 패턴과 핵심 가이드를 정리한다.\n',
  syncRouting: false,
}

export function SkillEditor({
  workspacePath,
  editing,
  existingNames,
  onClose,
  onSaved,
}: SkillEditorProps) {
  const isEdit = !!editing
  const [form, setForm] = useState<SkillFormState>(EMPTY)
  const [loading, setLoading] = useState(isEdit)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!isEdit || !editing) return
    let cancelled = false
    ;(async () => {
      try {
        const file = `${workspacePath}/.claude/skills/${editing}/SKILL.md`
        const raw = await window.api.harness.readFile(file)
        if (cancelled) return
        const parsed = parseFrontmatter(raw)
        setForm({
          name: editing,
          description: parsed.data.description ?? '',
          globs: parsed.data.globs ?? parsed.data.files ?? '',
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
        ? '이미 같은 이름의 스킬이 있습니다'
        : null

  async function handleSave() {
    if (!canSave) return
    setSaving(true)
    setError(null)
    try {
      if (isEdit && editing) {
        const composed = composeSkillFile(form)
        await window.api.harness.updateSkill(workspacePath, editing, composed)
        if (form.name !== editing) {
          await window.api.harness.renameSkill(workspacePath, editing, form.name)
        }
      } else {
        await window.api.harness.createSkill(workspacePath, {
          name: form.name,
          description: form.description,
          globs: form.globs || undefined,
          body: form.body || undefined,
        })
        if (form.syncRouting) {
          await window.api.harness
            .syncRouting(workspacePath, 'skill', {
              name: form.name,
              description: form.description,
              pattern: form.globs,
            })
            .catch(() => {})
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
      title={isEdit ? `Skill · ${editing}` : 'New Skill'}
      subtitle="Claude Code skill (.claude/skills/<name>/SKILL.md)"
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
          <Field
            label="Name"
            required
            hint="디렉터리명이 됩니다"
            error={nameError}
            htmlFor="skill-name"
          >
            <TextInput
              id="skill-name"
              value={form.name}
              onChange={(e) => setForm({ ...form, name: e.target.value })}
              placeholder="api-contract"
              error={!!nameError}
            />
          </Field>
          <Field label="Description" required>
            <TextInput
              value={form.description}
              onChange={(e) => setForm({ ...form, description: e.target.value })}
              placeholder="API 계약 동기화 가이드"
              error={form.description.trim() === '' && form.name !== ''}
            />
          </Field>
          <Field label="Glob 패턴" hint="자동 트리거되는 파일 패턴">
            <TextInput
              value={form.globs}
              onChange={(e) => setForm({ ...form, globs: e.target.value })}
              placeholder="server/src/**/dto/**, client/data/**/dto/**"
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
              CLAUDE.md의 Skill Routing 표에 자동 추가
            </label>
          )}
        </>
      )}
    </Modal>
  )
}

function parseFrontmatter(raw: string): { data: Record<string, string>; body: string } {
  const lines = raw.split(/\r?\n/)
  if (lines[0]?.trim() !== '---') return { data: {}, body: raw }
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

function composeSkillFile(form: SkillFormState): string {
  const fm: Record<string, string | undefined> = {
    name: form.name,
    description: form.description,
    globs: form.globs || undefined,
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
