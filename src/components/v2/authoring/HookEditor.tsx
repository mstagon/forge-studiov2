/**
 * HookEditor — modal form for adding / editing a Claude Code hook entry inside
 * `.claude/settings.json` under `hooks[event][index]`.
 *
 * The settings.json hook shape we mutate is:
 *   {
 *     "hooks": {
 *       "<EventName>": [
 *         { "matcher": "<regex|tool|empty>", "hooks": [
 *             { "type": "command", "command": "<sh>", "timeout": 60, "disabled"?: true }
 *         ] }
 *       ]
 *     }
 *   }
 *
 * Modes:
 *   - create:  index undefined → addHook IPC
 *   - edit:    pre-existing event + index → updateHook IPC (full replacement)
 *
 * Validation:
 *   - command: required (the actual shell command)
 *   - matcher: optional, but we surface event-specific examples inline
 *   - timeout: optional integer ≥ 1 second
 */

import { useState, type CSSProperties } from 'react'
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

const EVENTS = [
  'SessionStart',
  'PreToolUse',
  'PostToolUse',
  'Stop',
  'PreCompact',
  'Notification',
] as const

type EventName = (typeof EVENTS)[number]

const MATCHER_HINTS: Record<EventName, string> = {
  SessionStart: '보통 빈 값. 매처는 이벤트에 의미 없음 — 항상 실행됩니다.',
  PreToolUse:
    '도구 이름 매처. 예: `Write|Edit`, `Bash`, `Bash(npm run *)`, `mcp__filesystem__.*`',
  PostToolUse:
    '도구 이름 매처. 예: `Write|Edit` (편집 후 자동 포맷), `Bash` (명령 끝나면 로그 기록)',
  Stop: '보통 빈 값. 세션 종료 시 항상 실행됩니다.',
  PreCompact: '보통 빈 값. 컴팩션 직전에 항상 실행됩니다.',
  Notification: '알림 종류 매처. 예: `*`, `permission-required`',
}

const MATCHER_PLACEHOLDER: Record<EventName, string> = {
  SessionStart: '',
  PreToolUse: 'Write|Edit',
  PostToolUse: 'Write|Edit',
  Stop: '',
  PreCompact: '',
  Notification: '*',
}

export interface HookEditorProps {
  workspacePath: string
  /** When editing, the original event name + index in the array. */
  editing?: {
    event: EventName | string
    index: number
    initial: {
      matcher?: string
      command: string
      type?: string
      timeout?: number
      disabled?: boolean
    }
  }
  /** When duplicating an existing hook, supply pre-fill values without an
   *  index — the editor stays in *create* mode but starts with the values
   *  copied from the source hook. */
  duplicateFrom?: {
    matcher?: string
    command: string
    timeout?: number
    disabled?: boolean
    event?: EventName | string
  }
  onClose: () => void
  onSaved: (event: string) => void
}

interface HookFormState {
  event: EventName
  matcher: string
  command: string
  timeoutStr: string
  disabled: boolean
}

const EMPTY: HookFormState = {
  event: 'PostToolUse',
  matcher: '',
  command: '',
  timeoutStr: '',
  disabled: false,
}

export function HookEditor({
  workspacePath,
  editing,
  duplicateFrom,
  onClose,
  onSaved,
}: HookEditorProps) {
  const isEdit = !!editing
  const [form, setForm] = useState<HookFormState>(() => {
    if (editing) {
      const ev = (EVENTS as readonly string[]).includes(editing.event)
        ? (editing.event as EventName)
        : 'PostToolUse'
      return {
        event: ev,
        matcher: editing.initial.matcher ?? '',
        command: editing.initial.command ?? '',
        timeoutStr:
          typeof editing.initial.timeout === 'number'
            ? String(editing.initial.timeout)
            : '',
        disabled: !!editing.initial.disabled,
      }
    }
    if (duplicateFrom) {
      const ev =
        duplicateFrom.event &&
        (EVENTS as readonly string[]).includes(duplicateFrom.event)
          ? (duplicateFrom.event as EventName)
          : 'PostToolUse'
      return {
        event: ev,
        matcher: duplicateFrom.matcher ?? '',
        command: duplicateFrom.command ?? '',
        timeoutStr:
          typeof duplicateFrom.timeout === 'number'
            ? String(duplicateFrom.timeout)
            : '',
        disabled: !!duplicateFrom.disabled,
      }
    }
    return EMPTY
  })
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const commandValid = form.command.trim().length > 0
  const timeoutNum = form.timeoutStr.trim() === '' ? undefined : Number(form.timeoutStr)
  const timeoutValid =
    timeoutNum === undefined ||
    (Number.isFinite(timeoutNum) && Number.isInteger(timeoutNum) && timeoutNum >= 1)
  const canSave = commandValid && timeoutValid && !saving

  const commandError = !commandValid && form.command !== '' ? '명령은 비어있을 수 없습니다' : null
  const timeoutError = !timeoutValid ? '양의 정수(초) 또는 빈 값' : null

  async function handleSave() {
    if (!canSave) return
    setSaving(true)
    setError(null)
    try {
      const spec = {
        matcher: form.matcher || undefined,
        command: form.command,
        type: 'command',
        timeout: timeoutNum,
        disabled: form.disabled || undefined,
      }
      if (isEdit && editing) {
        // If the user changed the event, we need to remove from old + add to
        // new so the indices in settings.json stay consistent.
        if (form.event !== editing.event) {
          await window.api.harness.removeHook(workspacePath, editing.event, editing.index)
          await window.api.harness.addHook(workspacePath, form.event, spec)
        } else {
          await window.api.harness.updateHook(
            workspacePath,
            editing.event,
            editing.index,
            spec
          )
        }
      } else {
        await window.api.harness.addHook(workspacePath, form.event, spec)
      }
      onSaved(form.event)
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    } finally {
      setSaving(false)
    }
  }

  return (
    <Modal
      title={isEdit ? `Hook · ${editing!.event}` : 'New Hook'}
      subtitle=".claude/settings.json · hooks[event] 배열에 항목 추가"
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
        <Field label="Event" required htmlFor="hook-event">
          <SelectInput
            id="hook-event"
            value={form.event}
            onChange={(e) => setForm({ ...form, event: e.target.value as EventName })}
          >
            {EVENTS.map((ev) => (
              <option key={ev} value={ev}>
                {ev}
              </option>
            ))}
          </SelectInput>
        </Field>
        <Field
          label="Timeout (seconds)"
          hint="optional · 기본 60"
          error={timeoutError}
        >
          <TextInput
            inputMode="numeric"
            value={form.timeoutStr}
            onChange={(e) => setForm({ ...form, timeoutStr: e.target.value })}
            placeholder="60"
            error={!!timeoutError}
          />
        </Field>
      </div>
      <Field label="Matcher" hint={MATCHER_HINTS[form.event]}>
        <TextInput
          value={form.matcher}
          onChange={(e) => setForm({ ...form, matcher: e.target.value })}
          placeholder={MATCHER_PLACEHOLDER[form.event] || '비워두면 전체 매치'}
        />
      </Field>
      <Field
        label="Command"
        required
        error={commandError}
        hint="셸 스크립트 또는 파일 경로 (예: `bash .claude/hooks/format.sh`)"
      >
        <TextArea
          value={form.command}
          onChange={(e) => setForm({ ...form, command: e.target.value })}
          rows={6}
          mono
          placeholder={'bash .claude/hooks/post-tool-use/format.sh\n# 또는 한 줄: dart format $FILE'}
          error={!!commandError}
        />
      </Field>
      <label style={checkboxRow}>
        <input
          type="checkbox"
          checked={form.disabled}
          onChange={(e) => setForm({ ...form, disabled: e.target.checked })}
        />
        비활성화 (저장은 되지만 트리거되지 않음)
      </label>
    </Modal>
  )
}

const checkboxRow: CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  gap: 8,
  fontSize: 12,
  color: 'var(--text-2)',
  marginTop: 4,
}
