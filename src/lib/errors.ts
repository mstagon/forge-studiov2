/**
 * Centralised error model — `AppError` plus category/code constants.
 *
 * Goals:
 *   • Every renderer-visible error eventually flows through `AppError` so the
 *     in-app error log + toasts get a uniform { code, category, message }
 *     shape.
 *   • IPC responses (electron main → renderer) carry the same shape so we
 *     don't lose category information across the bridge.
 *   • Existing throws can adopt `AppError` incrementally — `fromUnknown`
 *     wraps anything (Error, string, plain object) into a sane fallback.
 *
 * NOTE: this lives under `src/lib` so it can be imported from both renderer
 * components and electron main (electron tsconfig follows the same path
 * resolution). When importing from electron main, prefer the explicit
 * relative path `../../src/lib/errors` to avoid `@/` alias coupling.
 */

export type ErrorCategory =
  | 'IPC'
  | 'PTY'
  | 'GIT'
  | 'MCP'
  | 'FS'
  | 'HOOK'
  | 'VALIDATION'
  | 'UNKNOWN'

/**
 * Conventional error codes. Add to this union as new error sites adopt
 * AppError. Strings are intentionally upper-snake to read well in logs.
 */
export type ErrorCode =
  // IPC
  | 'IPC_TIMEOUT'
  | 'IPC_NOT_AVAILABLE'
  | 'IPC_INVALID_PAYLOAD'
  // PTY
  | 'PTY_SPAWN_FAILED'
  | 'PTY_NOT_FOUND'
  | 'PTY_WRITE_FAILED'
  // Git
  | 'GIT_COMMAND_FAILED'
  | 'GIT_NOT_REPO'
  | 'GIT_MERGE_CONFLICT'
  | 'GIT_AUTH_FAILED'
  // MCP
  | 'MCP_NOT_INSTALLED'
  | 'MCP_PROBE_FAILED'
  | 'MCP_TIMEOUT'
  // FS
  | 'FS_PERMISSION_DENIED'
  | 'FS_NOT_FOUND'
  | 'FS_READ_FAILED'
  | 'FS_WRITE_FAILED'
  | 'FS_PATH_NOT_ALLOWED'
  // Hooks
  | 'HOOK_NON_ZERO_EXIT'
  | 'HOOK_TIMEOUT'
  | 'HOOK_SPAWN_FAILED'
  // Validation
  | 'VALIDATION_REQUIRED_FIELD'
  | 'VALIDATION_BAD_VALUE'
  | 'UNKNOWN'

export interface AppErrorDetails {
  code: ErrorCode
  category: ErrorCategory
  message: string
  cause?: unknown
  /** Optional structured context — exit codes, paths, hostnames, etc. */
  context?: Record<string, unknown>
}

/**
 * The canonical app error. Wraps a category/code and a developer-facing
 * message. `cause` keeps the original object around (Error, string, …) so
 * the log viewer can still show stack traces when available.
 */
export class AppError extends Error {
  readonly code: ErrorCode
  readonly category: ErrorCategory
  readonly cause?: unknown
  readonly context?: Record<string, unknown>

  constructor(details: AppErrorDetails) {
    super(details.message)
    this.name = 'AppError'
    this.code = details.code
    this.category = details.category
    this.cause = details.cause
    this.context = details.context
  }

  /** JSON-friendly view (safe to send across IPC). */
  toJSON(): {
    code: ErrorCode
    category: ErrorCategory
    message: string
    context?: Record<string, unknown>
    causeMessage?: string
  } {
    return {
      code: this.code,
      category: this.category,
      message: this.message,
      context: this.context,
      causeMessage:
        this.cause instanceof Error ? this.cause.message : typeof this.cause === 'string' ? this.cause : undefined,
    }
  }

  /**
   * Best-effort coercion of an arbitrary thrown value into an AppError.
   * Existing services can be migrated incrementally — anything they throw
   * gets wrapped here at the IPC boundary.
   */
  static fromUnknown(
    err: unknown,
    fallback: { code?: ErrorCode; category?: ErrorCategory } = {},
  ): AppError {
    if (err instanceof AppError) return err
    if (err instanceof Error) {
      return new AppError({
        code: fallback.code ?? 'UNKNOWN',
        category: fallback.category ?? 'UNKNOWN',
        message: err.message || 'Unknown error',
        cause: err,
      })
    }
    if (typeof err === 'string') {
      return new AppError({
        code: fallback.code ?? 'UNKNOWN',
        category: fallback.category ?? 'UNKNOWN',
        message: err,
      })
    }
    return new AppError({
      code: fallback.code ?? 'UNKNOWN',
      category: fallback.category ?? 'UNKNOWN',
      message: 'Unknown error',
      cause: err,
    })
  }
}

// ─── Convenience factories — keep call sites short ──────────────────

export const ipcTimeout = (message: string, context?: Record<string, unknown>) =>
  new AppError({ code: 'IPC_TIMEOUT', category: 'IPC', message, context })

export const ptySpawnFailed = (message: string, cause?: unknown) =>
  new AppError({ code: 'PTY_SPAWN_FAILED', category: 'PTY', message, cause })

export const gitCommandFailed = (message: string, context?: Record<string, unknown>) =>
  new AppError({ code: 'GIT_COMMAND_FAILED', category: 'GIT', message, context })

export const fsPathNotAllowed = (message: string, context?: Record<string, unknown>) =>
  new AppError({ code: 'FS_PATH_NOT_ALLOWED', category: 'FS', message, context })

export const validationFailed = (message: string, context?: Record<string, unknown>) =>
  new AppError({ code: 'VALIDATION_BAD_VALUE', category: 'VALIDATION', message, context })

export const hookNonZeroExit = (
  message: string,
  context: { script: string; event: string; exitCode: number; durationMs?: number },
) => new AppError({ code: 'HOOK_NON_ZERO_EXIT', category: 'HOOK', message, context })
