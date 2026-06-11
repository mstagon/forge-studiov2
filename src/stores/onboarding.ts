/**
 * Onboarding store — drives the first-run 3-step overlay.
 *
 * Persistence: browser `localStorage` keyed at `forge.hasOnboarded`. We use
 * localStorage rather than going through the electron-store IPC bridge because
 * the renderer already treats local persistence (settings UI toggles, the
 * appUpdate "dismissed" flag) as ephemeral; an in-app "Show onboarding again"
 * button only needs to flip the flag back to false. If we later move other
 * preferences into electron-store this can swap to `window.api.settings.*`
 * without touching consumers.
 *
 * The store also tracks live dependency-check results (Step 2) and the current
 * step index so the overlay can be driven from anywhere (palette / settings).
 */
import { create } from 'zustand'

const STORAGE_KEY = 'forge.hasOnboarded'

export type DependencyKey = 'git' | 'tmux' | 'claude' | 'crGraph'

export interface DependencyStatus {
  key: DependencyKey
  /** Human label rendered in the step. */
  label: string
  /** One-liner shown when missing. */
  hint: string
  /** Install / docs URL surfaced behind the "Install" button. */
  installUrl: string
  /** `null` while a check is in flight, `string` (the resolved path) when found, `false` when missing. */
  resolved: string | false | null
  /**
   * True when the resolved binary lives inside the DMG's bundled-tools tree
   * (Contents/Resources/bundled-tools/...). Drives the green "Bundled" pill in
   * Step 2 — users with a bundled tool should see no install action.
   */
  bundled?: boolean
}

export interface OnboardingState {
  /** True when the first-run overlay should be visible. */
  visible: boolean
  /** Has the user ever finished (or explicitly skipped) onboarding? */
  hasOnboarded: boolean
  /** Current 1-based step index (1..3). */
  step: number
  /** Live dependency-check results, in display order. */
  deps: DependencyStatus[]
  /** True while a `system:which` sweep is in flight. */
  checkingDeps: boolean

  /** Force-show the overlay (used by Settings → "Show onboarding again"). */
  show: () => void
  /** Hide the overlay without marking onboarding complete. */
  hide: () => void
  /** Mark onboarding complete + hide. */
  finish: () => void
  /** Reset persisted flag (so the next mount auto-shows again). */
  reset: () => void
  /** Move to a specific step (clamped 1..3). */
  goTo: (step: number) => void
  /** Re-run the `system:which` sweep for all tracked deps. */
  checkDeps: () => Promise<void>
}

const DEPENDENCY_DEFAULTS: DependencyStatus[] = [
  {
    key: 'git',
    label: 'git',
    // git is intentionally NOT bundled — macOS ships it via Xcode CLT and
    // tracking upstream would balloon the DMG by 40+ MB for no real win.
    hint: 'Xcode Command Line Tools 와 함께 설치됩니다 (xcode-select --install).',
    installUrl: 'https://git-scm.com/downloads',
    resolved: null,
  },
  {
    key: 'tmux',
    label: 'tmux',
    // Bundled in v0.5.1 — Forge Studio.app/Contents/Resources/bundled-tools/bin/tmux
    hint: '격리 워크트리에서 agent별 세션을 띄우는 데 사용됩니다 — Forge Studio 에 번들되어 있습니다.',
    installUrl: 'https://github.com/tmux/tmux/wiki/Installing',
    resolved: null,
  },
  {
    key: 'claude',
    label: 'claude-code',
    // Claude Code is NOT bundled — Anthropic ships frequent updates and the
    // license forbids redistribution. Surface the official install guide.
    hint: '터미널에서 Claude Code agent 를 실행합니다. Anthropic 공식 가이드를 따라 직접 설치해주세요.',
    installUrl: 'https://docs.claude.com/claude-code',
    resolved: null,
  },
  {
    key: 'crGraph',
    label: 'code-review-graph',
    // Bundled in v0.5.1 — pre-built venv at bundled-tools/cr-graph-venv/.
    hint: '저장소 의존성 + 호출 그래프 시각화 — Forge Studio 에 번들되어 있습니다.',
    installUrl: 'https://github.com/anthropics/code-review-graph',
    resolved: null,
  },
]

function readPersistedFlag(): boolean {
  if (typeof window === 'undefined') return false
  try {
    return window.localStorage.getItem(STORAGE_KEY) === '1'
  } catch {
    return false
  }
}

function writePersistedFlag(value: boolean) {
  if (typeof window === 'undefined') return
  try {
    if (value) window.localStorage.setItem(STORAGE_KEY, '1')
    else window.localStorage.removeItem(STORAGE_KEY)
  } catch {
    // localStorage may be disabled in some contexts; failing silently is fine.
  }
}

const initialHasOnboarded = readPersistedFlag()

export const useOnboardingStore = create<OnboardingState>((set, get) => ({
  visible: !initialHasOnboarded,
  hasOnboarded: initialHasOnboarded,
  step: 1,
  deps: DEPENDENCY_DEFAULTS.map((d) => ({ ...d })),
  checkingDeps: false,

  show: () => set({ visible: true, step: 1 }),

  hide: () => set({ visible: false }),

  finish: () => {
    writePersistedFlag(true)
    set({ visible: false, hasOnboarded: true })
  },

  reset: () => {
    writePersistedFlag(false)
    set({ hasOnboarded: false, visible: true, step: 1 })
  },

  goTo: (step: number) => {
    const clamped = Math.min(3, Math.max(1, step))
    set({ step: clamped })
  },

  checkDeps: async () => {
    if (get().checkingDeps) return
    const which = window.api?.system?.which
    if (!which) return
    set({ checkingDeps: true })
    try {
      // Pull the bundled-tools root once so we can flag any resolved path
      // that lives inside it as "Bundled" rather than "Installed". Failures
      // (older app build with no IPC method) collapse to a null root, which
      // makes the bundled-detection a no-op — UI stays correct.
      let bundledRoot: string | null = null
      try {
        const r = await window.api?.system?.bundledToolsRoot?.()
        bundledRoot = typeof r === 'string' && r.length > 0 ? r : null
      } catch {
        bundledRoot = null
      }
      const next = await Promise.all(
        get().deps.map(async (dep) => {
          // The IPC handler maps to `which <dep.label>` but we strip dashes to
          // a canonical bin name where it differs (e.g. `claude-code` →
          // `claude`). Keep this list short and explicit.
          const probe =
            dep.key === 'claude'
              ? 'claude'
              : dep.key === 'crGraph'
                ? 'code-review-graph'
                : dep.label
          let resolved: string | false = false
          try {
            const out = (await which(probe)) as string | null
            resolved = out && out.length > 0 ? out : false
          } catch {
            resolved = false
          }
          const bundled =
            typeof resolved === 'string' &&
            !!bundledRoot &&
            resolved.startsWith(bundledRoot)
          return { ...dep, resolved, bundled }
        }),
      )
      set({ deps: next })
    } finally {
      set({ checkingDeps: false })
    }
  },
}))
