/**
 * LibraryRowMenu — shared "⋯" dropdown attached to each Library row.
 *
 * Renders the trailing icon button on tab rows (Agents / Skills / Commands /
 * Hooks). When clicked it opens an absolute-positioned menu with
 *   - 편집  (Edit)
 *   - 복제  (Duplicate)
 *   - 삭제  (Delete)
 *
 * Click-outside / Esc close, focus return to the trigger. Item handlers are
 * supplied by the parent — this component is purely presentational.
 *
 * Also exports `<DeleteConfirmModal>` and `<UndoToast>` used by the same tabs
 * so the trash → restore flow stays consistent across surfaces.
 */

import { useEffect, useRef, useState, type CSSProperties, type ReactNode } from 'react'
import { Btn } from '../primitives'
import { Icon } from '../icons'
import { Modal, PrimaryButton } from './EditorShell'

export interface LibraryRowMenuProps {
  onEdit: () => void
  onDuplicate: () => void
  onDelete: () => void
}

export function LibraryRowMenu({ onEdit, onDuplicate, onDelete }: LibraryRowMenuProps) {
  const [open, setOpen] = useState(false)
  const triggerRef = useRef<HTMLButtonElement>(null)
  const menuRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!open) return
    function onDocClick(e: MouseEvent) {
      if (
        !menuRef.current?.contains(e.target as Node) &&
        !triggerRef.current?.contains(e.target as Node)
      ) {
        setOpen(false)
      }
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') {
        setOpen(false)
        triggerRef.current?.focus()
      }
    }
    document.addEventListener('mousedown', onDocClick)
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('mousedown', onDocClick)
      document.removeEventListener('keydown', onKey)
    }
  }, [open])

  return (
    <span style={{ position: 'relative', display: 'inline-flex' }}>
      <button
        ref={triggerRef}
        onClick={(e) => {
          e.stopPropagation()
          setOpen((v) => !v)
        }}
        aria-label="More actions"
        aria-haspopup="menu"
        aria-expanded={open}
        style={triggerBtn}
      >
        <Icon.More size={13} />
      </button>
      {open && (
        <div ref={menuRef} role="menu" style={menuBox}>
          <MenuItem
            onClick={() => {
              setOpen(false)
              onEdit()
            }}
            icon={<Icon.Code size={11} />}
          >
            편집
          </MenuItem>
          <MenuItem
            onClick={() => {
              setOpen(false)
              onDuplicate()
            }}
            icon={<Icon.Plus size={11} />}
          >
            복제
          </MenuItem>
          <div style={menuDivider} />
          <MenuItem
            onClick={() => {
              setOpen(false)
              onDelete()
            }}
            icon={<Icon.X size={11} />}
            danger
          >
            삭제
          </MenuItem>
        </div>
      )}
    </span>
  )
}

interface MenuItemProps {
  onClick: () => void
  icon: ReactNode
  danger?: boolean
  children: ReactNode
}

function MenuItem({ onClick, icon, danger, children }: MenuItemProps) {
  const [hover, setHover] = useState(false)
  return (
    <button
      role="menuitem"
      onClick={(e) => {
        e.stopPropagation()
        onClick()
      }}
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
      style={{
        ...menuItemBase,
        background: hover ? 'var(--bg-3)' : 'transparent',
        color: danger ? 'var(--danger)' : 'var(--text-1)',
      }}
    >
      <span style={{ width: 14, display: 'inline-flex', alignItems: 'center' }}>{icon}</span>
      <span style={{ flex: 1, textAlign: 'left' }}>{children}</span>
    </button>
  )
}

// ─── Delete confirmation modal ────────────────────────────────────────

export interface DeleteConfirmModalProps {
  kind: 'agent' | 'skill' | 'command' | 'hook' | 'mcp-server' | 'composition'
  name: string
  /** Extra warning to show under the prompt — e.g. files routed to it. */
  warning?: ReactNode
  onCancel: () => void
  onConfirm: () => Promise<void> | void
}

const KIND_LABEL: Record<DeleteConfirmModalProps['kind'], string> = {
  agent: '에이전트',
  skill: '스킬',
  command: '커맨드',
  hook: '훅',
  'mcp-server': 'MCP 서버',
  composition: '컴포지션',
}

export function DeleteConfirmModal({
  kind,
  name,
  warning,
  onCancel,
  onConfirm,
}: DeleteConfirmModalProps) {
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function handleConfirm() {
    setBusy(true)
    setError(null)
    try {
      await onConfirm()
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
      setBusy(false)
    }
  }

  return (
    <Modal
      title={`${KIND_LABEL[kind]} 삭제`}
      subtitle="휴지통(.claude/.trash)으로 이동합니다 — 5초 안에 되돌릴 수 있습니다."
      onClose={onCancel}
      width={480}
      footer={
        <>
          <span style={{ color: 'var(--danger)', fontSize: 11, marginRight: 'auto' }}>
            {error || ''}
          </span>
          <Btn variant="ghost" onClick={onCancel} disabled={busy}>
            취소
          </Btn>
          <PrimaryButton
            icon={<Icon.X size={11} />}
            onClick={handleConfirm}
            disabled={busy}
            style={{
              background: 'var(--danger)',
              borderColor: 'var(--danger)',
              color: '#0b0e13',
            }}
          >
            {busy ? '삭제 중…' : '삭제'}
          </PrimaryButton>
        </>
      }
    >
      <div style={{ fontSize: 13, color: 'var(--text-1)', marginBottom: 8 }}>
        <code style={inlineCode}>{name}</code> {KIND_LABEL[kind]}을(를) 삭제할까요?
      </div>
      {warning && (
        <div style={warningBox}>
          <Icon.Bell size={12} style={{ color: 'var(--warning)', flexShrink: 0 }} />
          <div>{warning}</div>
        </div>
      )}
    </Modal>
  )
}

// ─── Undo toast (5s window after a delete) ────────────────────────────

export interface UndoToastProps {
  message: string
  /** Renderer-supplied undo handler — when null we just show "수동 복원 안내". */
  onUndo?: (() => void) | null
  onClose: () => void
  /** Duration in ms before the toast auto-dismisses. Default 5000. */
  duration?: number
}

export function UndoToast({ message, onUndo, onClose, duration = 5000 }: UndoToastProps) {
  const [remaining, setRemaining] = useState(duration)

  useEffect(() => {
    const start = Date.now()
    const id = window.setInterval(() => {
      const left = Math.max(0, duration - (Date.now() - start))
      setRemaining(left)
      if (left <= 0) {
        window.clearInterval(id)
        onClose()
      }
    }, 100)
    return () => window.clearInterval(id)
  }, [duration, onClose])

  const seconds = Math.ceil(remaining / 1000)

  return (
    <div style={undoToastBox} role="status" aria-live="polite">
      <Icon.Check size={13} style={{ color: 'var(--success)' }} />
      <span style={{ fontSize: 12.5, color: 'var(--text-1)' }}>{message}</span>
      {onUndo ? (
        <button
          onClick={() => {
            onUndo()
            onClose()
          }}
          style={undoBtn}
        >
          되돌리기
        </button>
      ) : (
        <span style={{ fontSize: 11, color: 'var(--text-3)' }}>
          (수동 복원: .claude/.trash)
        </span>
      )}
      <span
        style={{
          fontFamily: 'var(--font-mono)',
          fontSize: 10,
          color: 'var(--text-4)',
          minWidth: 20,
          textAlign: 'right',
        }}
      >
        {seconds}s
      </span>
      <button
        onClick={onClose}
        aria-label="Dismiss"
        style={{
          width: 18,
          height: 18,
          borderRadius: 4,
          background: 'transparent',
          border: '1px solid transparent',
          color: 'var(--text-3)',
          cursor: 'pointer',
          display: 'inline-flex',
          alignItems: 'center',
          justifyContent: 'center',
        }}
      >
        <Icon.X size={11} />
      </button>
    </div>
  )
}

// ─── styles ───────────────────────────────────────────────────────────

const triggerBtn: CSSProperties = {
  width: 26,
  height: 26,
  borderRadius: 5,
  background: 'transparent',
  border: '1px solid var(--line-2)',
  color: 'var(--text-3)',
  display: 'inline-flex',
  alignItems: 'center',
  justifyContent: 'center',
  cursor: 'pointer',
  flexShrink: 0,
}

const menuBox: CSSProperties = {
  position: 'absolute',
  top: '100%',
  right: 0,
  marginTop: 4,
  minWidth: 140,
  background: 'var(--bg-1)',
  border: '1px solid var(--line-2)',
  borderRadius: 6,
  boxShadow: '0 12px 32px rgba(0,0,0,0.45)',
  zIndex: 80,
  padding: 4,
  display: 'flex',
  flexDirection: 'column',
  gap: 2,
}

const menuItemBase: CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  gap: 8,
  height: 28,
  padding: '0 8px',
  borderRadius: 4,
  background: 'transparent',
  border: 'none',
  fontSize: 12,
  cursor: 'pointer',
  width: '100%',
}

const menuDivider: CSSProperties = {
  height: 1,
  background: 'var(--line-1)',
  margin: '2px 0',
}

const inlineCode: CSSProperties = {
  fontFamily: 'var(--font-mono)',
  fontSize: 12,
  color: 'var(--text-1)',
  background: 'var(--bg-3)',
  padding: '1px 6px',
  borderRadius: 3,
}

const warningBox: CSSProperties = {
  display: 'flex',
  gap: 8,
  alignItems: 'flex-start',
  padding: 10,
  borderRadius: 5,
  background: 'color-mix(in oklab, var(--warning) 8%, transparent)',
  border: '1px solid color-mix(in oklab, var(--warning) 30%, transparent)',
  color: 'var(--text-2)',
  fontSize: 12,
  lineHeight: 1.4,
}

const undoToastBox: CSSProperties = {
  position: 'fixed',
  bottom: 56,
  left: '50%',
  transform: 'translateX(-50%)',
  padding: '10px 14px',
  background: 'var(--bg-3)',
  border: '1px solid var(--line-3)',
  borderRadius: 8,
  boxShadow: '0 12px 32px rgba(0,0,0,0.45)',
  zIndex: 1100,
  display: 'inline-flex',
  alignItems: 'center',
  gap: 10,
}

const undoBtn: CSSProperties = {
  height: 22,
  padding: '0 8px',
  borderRadius: 4,
  background: 'var(--bg-2)',
  border: '1px solid var(--line-2)',
  color: 'var(--accent)',
  fontSize: 11.5,
  fontWeight: 600,
  cursor: 'pointer',
}
