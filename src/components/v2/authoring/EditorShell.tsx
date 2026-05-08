/**
 * Shared modal shell + form primitives for the authoring editors.
 *
 * Each editor (AgentEditor / SkillEditor / CommandEditor / HookEditor /
 * McpServerEditor / PermissionsEditor) opens inside this <Modal>. The shell
 * is intentionally small: a centred panel, header (title + close), scrollable
 * body, sticky footer for actions. Style follows the v2 token palette so the
 * editors blend with the rest of Library / Settings.
 *
 * Validation:
 *  - Editors call <FieldError> below the offending input — kept inline rather
 *    than a banner so users see the field that needs fixing.
 *  - Save buttons accept `disabled` to grey out when validation fails.
 */

import {
  type CSSProperties,
  type ReactNode,
  useEffect,
  useRef,
} from 'react'
import { Btn } from '../primitives'
import { Icon } from '../icons'

export interface ModalProps {
  title: string
  subtitle?: string
  onClose: () => void
  children: ReactNode
  footer?: ReactNode
  /** Width hint — defaults to 640. Editors can grow up to 920 for big bodies. */
  width?: number
}

export function Modal({ title, subtitle, onClose, children, footer, width = 640 }: ModalProps) {
  const dialogRef = useRef<HTMLDivElement>(null)

  // Esc to close + focus trap (lightweight — first focusable on open).
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') onClose()
    }
    document.addEventListener('keydown', onKey)
    const first = dialogRef.current?.querySelector<HTMLElement>(
      'input, textarea, select, button'
    )
    first?.focus()
    return () => document.removeEventListener('keydown', onKey)
  }, [onClose])

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label={title}
      style={{
        position: 'fixed',
        inset: 0,
        background: 'color-mix(in oklab, #000 60%, transparent)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        zIndex: 1000,
      }}
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onClose()
      }}
    >
      <div
        ref={dialogRef}
        style={{
          width: Math.min(width, 1080),
          maxWidth: 'calc(100vw - 48px)',
          maxHeight: 'calc(100vh - 64px)',
          background: 'var(--bg-1)',
          border: '1px solid var(--line-2)',
          borderRadius: 10,
          boxShadow: '0 24px 64px rgba(0,0,0,0.45)',
          display: 'flex',
          flexDirection: 'column',
          overflow: 'hidden',
        }}
      >
        <div
          style={{
            padding: '14px 18px',
            borderBottom: '1px solid var(--line-1)',
            display: 'flex',
            alignItems: 'center',
            gap: 10,
          }}
        >
          <div style={{ flex: 1, minWidth: 0 }}>
            <div
              style={{
                fontSize: 14,
                fontWeight: 600,
                color: 'var(--text-1)',
                letterSpacing: -0.2,
              }}
            >
              {title}
            </div>
            {subtitle && (
              <div style={{ fontSize: 11, color: 'var(--text-3)', marginTop: 2 }}>
                {subtitle}
              </div>
            )}
          </div>
          <button
            onClick={onClose}
            aria-label="Close"
            style={{
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
            }}
          >
            <Icon.X size={13} />
          </button>
        </div>
        <div style={{ flex: 1, overflow: 'auto', padding: '16px 20px' }}>{children}</div>
        {footer && (
          <div
            style={{
              padding: '12px 18px',
              borderTop: '1px solid var(--line-1)',
              display: 'flex',
              gap: 8,
              alignItems: 'center',
              justifyContent: 'flex-end',
              background: 'var(--bg-2)',
            }}
          >
            {footer}
          </div>
        )}
      </div>
    </div>
  )
}

interface FieldProps {
  label: string
  hint?: ReactNode
  required?: boolean
  children: ReactNode
  error?: string | null
  htmlFor?: string
}

export function Field({ label, hint, required, children, error, htmlFor }: FieldProps) {
  return (
    <label
      htmlFor={htmlFor}
      style={{
        display: 'flex',
        flexDirection: 'column',
        gap: 6,
        marginBottom: 14,
      }}
    >
      <div
        style={{
          display: 'flex',
          alignItems: 'baseline',
          gap: 6,
        }}
      >
        <span style={{ fontSize: 12, color: 'var(--text-1)', fontWeight: 500 }}>
          {label}
          {required && <span style={{ color: 'var(--danger)', marginLeft: 4 }}>*</span>}
        </span>
        {hint && (
          <span style={{ fontSize: 10.5, color: 'var(--text-4)', marginLeft: 'auto' }}>
            {hint}
          </span>
        )}
      </div>
      {children}
      {error && (
        <span style={{ fontSize: 11, color: 'var(--danger)', marginTop: 2 }}>{error}</span>
      )}
    </label>
  )
}

const inputBase: CSSProperties = {
  width: '100%',
  height: 32,
  padding: '0 10px',
  background: 'var(--bg-2)',
  border: '1px solid var(--line-2)',
  borderRadius: 5,
  color: 'var(--text-1)',
  fontSize: 12,
  fontFamily: 'inherit',
  outline: 'none',
}

export function TextInput(props: React.InputHTMLAttributes<HTMLInputElement> & { error?: boolean }) {
  const { error, style, ...rest } = props
  return (
    <input
      {...rest}
      style={{
        ...inputBase,
        borderColor: error ? 'var(--danger)' : 'var(--line-2)',
        ...style,
      }}
    />
  )
}

export function TextArea(
  props: React.TextareaHTMLAttributes<HTMLTextAreaElement> & {
    rows?: number
    mono?: boolean
    error?: boolean
  }
) {
  const { rows = 8, mono, error, style, ...rest } = props
  return (
    <textarea
      rows={rows}
      {...rest}
      style={{
        ...inputBase,
        height: 'auto',
        padding: '8px 10px',
        lineHeight: 1.5,
        fontFamily: mono ? 'var(--font-mono)' : 'inherit',
        fontSize: mono ? 12 : 12.5,
        resize: 'vertical',
        borderColor: error ? 'var(--danger)' : 'var(--line-2)',
        ...style,
      }}
    />
  )
}

export function SelectInput(
  props: React.SelectHTMLAttributes<HTMLSelectElement>
) {
  const { style, children, ...rest } = props
  return (
    <select
      {...rest}
      style={{
        ...inputBase,
        appearance: 'none',
        cursor: 'pointer',
        ...style,
      }}
    >
      {children}
    </select>
  )
}

export function PrimaryButton({
  children,
  ...rest
}: Omit<Parameters<typeof Btn>[0], 'variant'>) {
  return (
    <Btn variant="primary" {...rest}>
      {children}
    </Btn>
  )
}
