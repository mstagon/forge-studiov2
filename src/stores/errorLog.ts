/**
 * Error log store — in-memory ring buffer of `AppError`-shaped records.
 *
 * Two ingestion paths flow into this store:
 *
 *   1. Renderer-side errors (toasts, IPC failures, validation) call
 *      `record(...)` directly via `useErrorLogStore.getState().record(...)`.
 *   2. Main-process errors are forwarded over the `error-log:push` IPC channel
 *      (preload exposes `window.api.errorLog.onPush`); the subscription is
 *      installed once via `subscribeToMainErrors()` from the App shell.
 *
 * The store keeps the last 200 entries (newest-first) so the SettingsErrorLog
 * view can show a rolling history without unbounded memory growth.
 *
 * The shape mirrors `AppError.toJSON()` so we don't lose category context
 * across IPC. Renderer code can pass an `AppError` directly into `record()`.
 */
import { create } from 'zustand'
import type { AppError } from '@/lib/errors'

const MAX_ENTRIES = 200

export interface ErrorLogEntry {
  /** Stable client-generated id so React keys don't collide on rapid bursts. */
  id: string
  /** ISO timestamp at which the error landed in the store. */
  ts: string
  code: string
  category: string
  message: string
  context?: Record<string, unknown>
}

export interface ErrorLogState {
  entries: ErrorLogEntry[]
  record: (
    err:
      | AppError
      | {
          code: string
          category: string
          message: string
          context?: Record<string, unknown>
          ts?: string
        },
  ) => void
  clear: () => void
}

let nextId = 1
function genId(): string {
  // Date.now + monotonic counter avoids React-key collisions when several
  // errors arrive in the same millisecond (e.g. a burst of FS denials).
  return `${Date.now().toString(36)}-${(nextId++).toString(36)}`
}

function toEntry(
  err:
    | AppError
    | {
        code: string
        category: string
        message: string
        context?: Record<string, unknown>
        ts?: string
      },
): ErrorLogEntry {
  // AppError instance — pull the JSON view.
  if (err instanceof Error && 'toJSON' in err && typeof (err as AppError).toJSON === 'function') {
    const j = (err as AppError).toJSON()
    return {
      id: genId(),
      ts: new Date().toISOString(),
      code: j.code,
      category: j.category,
      message: j.message,
      context: j.context,
    }
  }
  const plain = err as {
    code: string
    category: string
    message: string
    context?: Record<string, unknown>
    ts?: string
  }
  return {
    id: genId(),
    ts: plain.ts ?? new Date().toISOString(),
    code: plain.code,
    category: plain.category,
    message: plain.message,
    context: plain.context,
  }
}

export const useErrorLogStore = create<ErrorLogState>((set) => ({
  entries: [],

  record: (err) => {
    const entry = toEntry(err)
    set((state) => {
      // Prepend newest-first, cap at MAX_ENTRIES.
      const next = [entry, ...state.entries]
      if (next.length > MAX_ENTRIES) next.length = MAX_ENTRIES
      return { entries: next }
    })
  },

  clear: () => set({ entries: [] }),
}))

/**
 * Wire the main-process push channel into the store. Returns an unsubscribe
 * function — call it once per app session (App.tsx mount). Safe to call when
 * the preload bridge is missing (older dev builds): silently no-ops.
 */
export function subscribeToMainErrors(): () => void {
  if (typeof window === 'undefined' || !window.api?.errorLog?.onPush) {
    return () => {}
  }
  const off = window.api.errorLog.onPush((payload) => {
    useErrorLogStore.getState().record({
      code: payload.code,
      category: payload.category,
      message: payload.message,
      context: payload.context,
      ts: payload.ts,
    })
  })
  return off
}
