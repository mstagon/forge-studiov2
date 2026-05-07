/**
 * CodeGraphViz — fullscreen overlay that hosts the code-review-graph D3.js
 * visualization server in an iframe.
 *
 * Lifecycle:
 *   mount    → window.api.crGraph.vizStart(workspacePath)  → { url, pid }
 *   unmount  → window.api.crGraph.vizStop(pid)
 *
 * The IPC surface is not yet exposed by `electron/preload.ts` (a peer worker
 * is wiring it). Until then the component falls back to an instructional empty
 * state so the rest of the UI keeps type-checking and renders gracefully.
 *
 * TODO(crGraph-ipc): replace optional chaining with a typed `window.api.crGraph`
 * import once the preload bridge lands.
 */
import { useEffect, useState } from 'react'

import { Btn } from './primitives'
import { Icon } from './icons'

// ─── window.api.crGraph (TODO: real preload type) ────────────────────
//
// Loose, optional typing so this file compiles regardless of whether the
// renderer's IPC surface has the bridge yet.

interface VizStartResult {
  url: string
  pid: number | string
}

interface CrGraphApi {
  isInstalled?: () => Promise<{ installed: boolean; version?: string }>
  install?: (mode: 'pipx' | string) => Promise<void>
  build?: (workspacePath: string) => Promise<void>
  stats?: (workspacePath: string) => Promise<{
    nodes: number
    edges: number
    files: number
    languages: number
    lastBuiltAt?: string | null
  } | null>
  vizStart?: (workspacePath: string) => Promise<VizStartResult>
  vizStop?: (pid: number | string) => Promise<void>
}

function getCrGraphApi(): CrGraphApi | undefined {
  if (typeof window === 'undefined') return undefined
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const w = window as any
  return w?.api?.crGraph as CrGraphApi | undefined
}

// ─── Component ───────────────────────────────────────────────────────

export interface CodeGraphVizProps {
  workspacePath: string
  onClose: () => void
}

export function CodeGraphViz({ workspacePath, onClose }: CodeGraphVizProps) {
  const [vizUrl, setVizUrl] = useState<string | null>(null)
  const [pid, setPid] = useState<number | string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [starting, setStarting] = useState(true)

  useEffect(() => {
    let cancelled = false
    let activePid: number | string | null = null

    async function start() {
      const api = getCrGraphApi()
      if (!api?.vizStart) {
        if (!cancelled) {
          setError(
            'code-review-graph IPC bridge is not available yet. Install the harness or wait for the peer worker to expose window.api.crGraph.',
          )
          setStarting(false)
        }
        return
      }
      try {
        const res = await api.vizStart(workspacePath)
        if (cancelled) {
          // We were unmounted before the server reported back — clean up.
          if (api.vizStop && res.pid != null) {
            api.vizStop(res.pid).catch(() => {})
          }
          return
        }
        activePid = res.pid
        setPid(res.pid)
        setVizUrl(res.url)
        setStarting(false)
      } catch (err) {
        if (cancelled) return
        setError(err instanceof Error ? err.message : String(err))
        setStarting(false)
      }
    }

    void start()

    return () => {
      cancelled = true
      const api = getCrGraphApi()
      if (api?.vizStop && activePid != null) {
        api.vizStop(activePid).catch(() => {})
      }
    }
    // We intentionally re-run only when the workspace path changes.
  }, [workspacePath])

  return (
    <div
      role="dialog"
      aria-label="Code Review Graph visualization"
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 200,
        background: 'var(--bg-1)',
        display: 'flex',
        flexDirection: 'column',
        fontFamily: 'var(--font-ui)',
      }}
    >
      {/* Header */}
      <div
        style={{
          flex: '0 0 auto',
          height: 44,
          padding: '0 14px',
          display: 'flex',
          alignItems: 'center',
          gap: 12,
          borderBottom: '1px solid var(--line-1)',
          background: 'var(--bg-2)',
        }}
      >
        <div
          style={{
            display: 'flex',
            alignItems: 'baseline',
            gap: 8,
            minWidth: 0,
            flex: 1,
          }}
        >
          <span
            style={{
              fontSize: 13,
              fontWeight: 600,
              color: 'var(--text-1)',
              letterSpacing: -0.2,
            }}
          >
            Code Review Graph
          </span>
          <span
            style={{
              fontSize: 11.5,
              color: 'var(--text-3)',
              overflow: 'hidden',
              textOverflow: 'ellipsis',
              whiteSpace: 'nowrap',
            }}
          >
            {workspacePath} · D3.js force-directed dependency graph
          </span>
        </div>
        <Btn
          variant="ghost"
          icon={<Icon.X size={12} />}
          onClick={onClose}
          aria-label="Close visualization"
        >
          Close
        </Btn>
      </div>

      {/* Body */}
      <div
        style={{
          flex: 1,
          minHeight: 0,
          position: 'relative',
          background: 'var(--bg-1)',
        }}
      >
        {starting && !error && (
          <div
            style={{
              position: 'absolute',
              inset: 0,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              flexDirection: 'column',
              gap: 10,
              color: 'var(--text-3)',
              fontSize: 12.5,
            }}
          >
            <Spinner />
            <span>Starting visualization server…</span>
          </div>
        )}

        {error && (
          <div
            style={{
              position: 'absolute',
              inset: 0,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              flexDirection: 'column',
              gap: 12,
              padding: 32,
              textAlign: 'center',
            }}
          >
            <div style={{ fontSize: 13, color: 'var(--danger)', fontWeight: 600 }}>
              Visualization unavailable
            </div>
            <div
              style={{
                fontSize: 12,
                color: 'var(--text-3)',
                maxWidth: 480,
                lineHeight: 1.5,
              }}
            >
              {error}
            </div>
            <Btn variant="ghost" onClick={onClose}>
              Close
            </Btn>
          </div>
        )}

        {vizUrl && !error && (
          <iframe
            title="Code Review Graph"
            src={vizUrl}
            style={{
              width: '100%',
              height: '100%',
              border: 'none',
              background: 'var(--bg-1)',
            }}
            // The viz server is a local trusted process started by the main
            // process; we still constrain the sandbox to scripts + same-origin
            // so the iframe can run D3 but cannot navigate the parent window.
            sandbox="allow-scripts allow-same-origin allow-forms"
          />
        )}
      </div>

      {/* Footer */}
      {vizUrl && (
        <div
          style={{
            flex: '0 0 auto',
            height: 26,
            padding: '0 14px',
            display: 'flex',
            alignItems: 'center',
            gap: 8,
            borderTop: '1px solid var(--line-1)',
            background: 'var(--bg-2)',
            fontFamily: 'var(--font-mono)',
            fontSize: 10.5,
            color: 'var(--text-4)',
          }}
        >
          <span>{vizUrl}</span>
          <span style={{ flex: 1 }} />
          {pid != null && <span>pid: {String(pid)}</span>}
        </div>
      )}
    </div>
  )
}

// ─── Spinner ─────────────────────────────────────────────────────────

function Spinner({ size = 14 }: { size?: number }) {
  return (
    <span
      aria-hidden
      style={{
        width: size,
        height: size,
        borderRadius: '50%',
        border: '2px solid var(--line-2)',
        borderTopColor: 'var(--accent)',
        display: 'inline-block',
        animation: 'cgv-spin 0.7s linear infinite',
      }}
    >
      <style>{`@keyframes cgv-spin { to { transform: rotate(360deg); } }`}</style>
    </span>
  )
}
