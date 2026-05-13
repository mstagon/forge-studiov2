import { useEffect, useRef } from 'react'
import { Terminal } from '@xterm/xterm'
import { FitAddon } from '@xterm/addon-fit'
import { SearchAddon } from '@xterm/addon-search'
import { WebLinksAddon } from '@xterm/addon-web-links'
import { WebglAddon } from '@xterm/addon-webgl'
import { Unicode11Addon } from '@xterm/addon-unicode11'
import '@xterm/xterm/css/xterm.css'

interface XTerminalProps {
  tabId: string
  paneId: string
  cwd: string
  isActive: boolean
  searchVisible?: boolean
  /** If set, attach to an agent team's tmux pane instead of spawning a shell. */
  agent?: { teamId: string; agentName: string }
  onTitleChange?: (title: string) => void
  onPtyCreated?: (ptyId: string) => void
}

export function XTerminal({ tabId, paneId, cwd, isActive, searchVisible, agent, onTitleChange, onPtyCreated }: XTerminalProps) {
  const containerRef = useRef<HTMLDivElement>(null)
  const terminalRef = useRef<Terminal | null>(null)
  const fitAddonRef = useRef<FitAddon | null>(null)
  const searchAddonRef = useRef<SearchAddon | null>(null)
  const ptyIdRef = useRef<string | null>(null)
  const searchInputRef = useRef<HTMLInputElement>(null)

  // Stable refs for callbacks to avoid re-creating effect
  const onTitleChangeRef = useRef(onTitleChange)
  onTitleChangeRef.current = onTitleChange
  const onPtyCreatedRef = useRef(onPtyCreated)
  onPtyCreatedRef.current = onPtyCreated
  const agentRef = useRef(agent)
  agentRef.current = agent

  useEffect(() => {
    const container = containerRef.current
    if (!container) return

    let disposed = false
    let terminal: Terminal | null = null
    let ptyId: string | null = null
    let cleanupData: (() => void) | null = null
    let cleanupExit: (() => void) | null = null
    let resizeObserver: ResizeObserver | null = null

    const init = async () => {
      terminal = new Terminal({
        cursorBlink: true,
        cursorStyle: 'bar',
        cursorWidth: 2,
        fontSize: 14,
        fontFamily: "'MesloLGS NF', 'SF Mono', 'Fira Code', 'JetBrains Mono', 'Cascadia Code', Menlo, Monaco, monospace",
        fontWeight: '400',
        fontWeightBold: '600',
        lineHeight: 1.35,
        letterSpacing: 0,
        scrollback: 10000,
        scrollSensitivity: 3,
        fastScrollSensitivity: 5,
        allowProposedApi: true,
        macOptionIsMeta: true,
        macOptionClickForcesSelection: true,
        rightClickSelectsWord: true,
        drawBoldTextInBrightColors: true,
        minimumContrastRatio: 4.5,
        theme: {
          background: '#0d1117',
          foreground: '#e6edf3',
          cursor: '#58a6ff',
          cursorAccent: '#0d1117',
          selectionBackground: '#264f78',
          selectionForeground: '#ffffff',
          selectionInactiveBackground: '#264f7866',
          black: '#484f58',
          red: '#ff7b72',
          green: '#3fb950',
          yellow: '#d29922',
          blue: '#58a6ff',
          magenta: '#bc8cff',
          cyan: '#39d353',
          white: '#b1bac4',
          brightBlack: '#6e7681',
          brightRed: '#ffa198',
          brightGreen: '#56d364',
          brightYellow: '#e3b341',
          brightBlue: '#79c0ff',
          brightMagenta: '#d2a8ff',
          brightCyan: '#56d364',
          brightWhite: '#f0f6fc',
        },
      })

      const fitAddon = new FitAddon()
      const searchAddon = new SearchAddon()
      const webLinksAddon = new WebLinksAddon((_event, uri) => {
        window.api.system.openExternal(uri)
      })
      const unicodeAddon = new Unicode11Addon()

      terminal.loadAddon(fitAddon)
      terminal.loadAddon(searchAddon)
      terminal.loadAddon(webLinksAddon)
      terminal.loadAddon(unicodeAddon)
      terminal.unicode.activeVersion = '11'

      terminal.open(container)

      // Try WebGL renderer
      try {
        const webglAddon = new WebglAddon()
        webglAddon.onContextLoss(() => webglAddon.dispose())
        terminal.loadAddon(webglAddon)
      } catch {
        // WebGL not available, canvas fallback
      }

      // Bail if disposed during synchronous setup
      if (disposed) {
        terminal.dispose()
        return
      }

      fitAddonRef.current = fitAddon
      searchAddonRef.current = searchAddon
      terminalRef.current = terminal

      // Fit after a frame to ensure container has dimensions
      requestAnimationFrame(() => {
        if (disposed) return
        try { fitAddon.fit() } catch { /* container might be gone */ }
      })

      // Create PTY — agent tabs attach to a tmux pane, regular tabs spawn a shell.
      try {
        const agentBinding = agentRef.current
        if (agentBinding) {
          ptyId = await window.api.teams.openAgentTerminal({
            teamId: agentBinding.teamId,
            agentName: agentBinding.agentName,
            cols: terminal.cols || 80,
            rows: terminal.rows || 24,
          })
        } else {
          ptyId = await window.api.pty.create({
            cols: terminal.cols || 80,
            rows: terminal.rows || 24,
            cwd: cwd || undefined,
          })
        }
      } catch (err) {
        terminal.write(`\r\n\x1b[31mFailed to create terminal: ${err}\x1b[0m\r\n`)
        return
      }

      // Bail if disposed during async PTY creation. We dispose the renderer
      // but NOT the PTY — same ownership policy as the cleanup return below:
      // if this is an agent terminal, LiveTerminalsRoot owns dispose via
      // host pruning, so we hand the ptyId off via onPtyCreated even when
      // bailing. Without this, a StrictMode double-mount or transient
      // unmount would call pty.dispose() and SIGHUP the agent's claude
      // process — exactly the regression we're guarding against.
      if (disposed || !ptyId) {
        if (ptyId) onPtyCreatedRef.current?.(ptyId)
        terminal.dispose()
        return
      }

      const activePtyId = ptyId
      ptyIdRef.current = activePtyId
      onPtyCreatedRef.current?.(activePtyId)

      // Wire PTY <-> xterm
      cleanupData = window.api.pty.onData(activePtyId, (data: string) => {
        if (!disposed) terminal!.write(data)
      })

      cleanupExit = window.api.pty.onExit(activePtyId, (_exitCode: number) => {
        if (!disposed) terminal!.write('\r\n\x1b[90m[Process exited]\x1b[0m\r\n')
      })

      terminal.onData((data) => {
        window.api.pty.write(activePtyId, data)
      })

      terminal.onResize(({ cols, rows }) => {
        window.api.pty.resize(activePtyId, cols, rows)
      })

      terminal.onTitleChange((title) => {
        onTitleChangeRef.current?.(title)
      })

      // Auto-fit on resize.
      // 두 단계 RAF + scrollToBottom: 첫 RAF 에서 layout 안정 안 됐을 수 있음
      // (특히 window resize 시 flex 컨테이너 height 다음 frame 에 확정).
      // resize 직후 cursor 아래로 자동 따라가게 scrollToBottom — claude TUI 의
      // alt-screen buffer 에선 viewport 가 새 rows 에 맞춰지지만 사용자가 스크롤
      // 위로 올라간 상태였다면 그대로라서 "스크롤 안 되는 듯한 인상" 의 원인.
      resizeObserver = new ResizeObserver(() => {
        requestAnimationFrame(() => {
          if (disposed || !terminal) return
          try { fitAddon.fit() } catch { /* noop */ }
          requestAnimationFrame(() => {
            if (disposed || !terminal) return
            try { fitAddon.fit() } catch { /* noop */ }
            try { terminal.scrollToBottom() } catch { /* noop */ }
          })
        })
      })
      resizeObserver.observe(container)

      // Explicit wheel fallback. WebGL canvas on macOS sometimes fails to
      // forward wheel events to xterm's internal handler (especially with
      // trackpad momentum scroll), so the viewport silently doesn't move.
      //
      // 두 모드:
      //   1. normal buffer — xterm.js 의 scrollback 으로 line scroll
      //   2. alt-screen buffer (claude TUI / tmux 등) — PTY 로 mouse wheel
      //      escape sequence 전달. tmux 가 mouse on 이면 자동으로 copy-mode
      //      진입 + 스크롤. claude code 단독 (no tmux) 면 TUI 가 해석 못 하지만
      //      적어도 wheel 이 무의미하게 사라지진 않음.
      const onWheel = (e: WheelEvent) => {
        if (!terminal) return
        e.preventDefault()
        const inAltBuffer = terminal.buffer.active.type === 'alternate'
        // deltaMode 0 = pixels, 1 = lines, 2 = pages — normalise to lines.
        const lineHeightPx = 14 * 1.35
        let lines: number
        if (e.deltaMode === 1) lines = e.deltaY
        else if (e.deltaMode === 2) lines = e.deltaY * terminal.rows
        else lines = e.deltaY / lineHeightPx
        if (e.shiftKey) lines *= 5
        if (lines === 0) return
        const truncLines = Math.trunc(lines) || (lines > 0 ? 1 : -1)
        if (inAltBuffer) {
          // SGR mouse mode (1006) wheel up = button 64, down = 65.
          // Format: \x1b[<button;col;rowM (press) — tmux/claude 가 처리.
          const button = truncLines > 0 ? 65 : 64
          const count = Math.abs(truncLines)
          const target = e.target as HTMLElement
          const rect = target.getBoundingClientRect()
          const col = Math.max(1, Math.min(terminal.cols, Math.floor((e.clientX - rect.left) / 8) + 1))
          const row = Math.max(1, Math.min(terminal.rows, Math.floor((e.clientY - rect.top) / lineHeightPx) + 1))
          const seq = `\x1b[<${button};${col};${row}M`.repeat(count)
          const pid = ptyIdRef.current
          if (pid) window.api.pty.write(pid, seq)
        } else {
          terminal.scrollLines(truncLines)
        }
      }
      container.addEventListener('wheel', onWheel, { passive: false })
      const detachWheel = () => container.removeEventListener('wheel', onWheel)
      // Stash so the cleanup block can find it.
      ;(terminal as unknown as { __detachWheel?: () => void }).__detachWheel = detachWheel
    }

    init()

    return () => {
      // PTY ownership policy:
      //   We DO NOT call pty.dispose() here on every effect cleanup. When
      //   <XTerminal> lives inside <LiveTerminalsRoot>'s persistent portal
      //   pool, this cleanup can fire on transient React lifecycle events
      //   (StrictMode double-mount, concurrent rendering, even brief
      //   detach/reattach during reparenting). Disposing the PTY there sends
      //   SIGHUP to the tmux pane and kills the agent's `claude` process —
      //   exactly the regression users hit ("다른 화면 갔다오면 클로드가 꺼짐").
      //
      //   The PTY is owned by the App-level pool: LiveTerminalsRoot disposes
      //   it when a host is pruned (member removed, team swap) or when the
      //   window closes (main process ptyManager.disposeAll on window-all-
      //   closed). For shell tabs (no agent), the parent UI already owns the
      //   tab lifecycle and explicitly disposes via the terminals store.
      disposed = true
      cleanupData?.()
      cleanupExit?.()
      resizeObserver?.disconnect()
      if (terminal) {
        ;(terminal as unknown as { __detachWheel?: () => void }).__detachWheel?.()
      }
      // Only dispose the renderer (xterm canvas/WebGL). The PTY survives.
      if (terminal) terminal.dispose()
      terminalRef.current = null
      fitAddonRef.current = null
      searchAddonRef.current = null
      // Keep ptyIdRef populated so a re-mount can re-attach to the same PTY
      // if the parent component (LiveTerminalsRoot via portal) hands us back
      // the same agent binding. Today XTerminal always creates a fresh PTY
      // on mount; a follow-up can wire the pool to reuse ptyId on re-mount.
    }
  }, [cwd, tabId, paneId])

  // Focus management
  useEffect(() => {
    if (isActive && terminalRef.current) {
      terminalRef.current.focus()
      try { fitAddonRef.current?.fit() } catch { /* noop */ }
    }
  }, [isActive])

  // Search focus
  useEffect(() => {
    if (searchVisible && searchInputRef.current) {
      searchInputRef.current.focus()
    }
  }, [searchVisible])

  const handleSearch = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') {
      const query = (e.target as HTMLInputElement).value
      if (e.shiftKey) {
        searchAddonRef.current?.findPrevious(query)
      } else {
        searchAddonRef.current?.findNext(query)
      }
    }
    if (e.key === 'Escape') {
      searchAddonRef.current?.clearDecorations()
      terminalRef.current?.focus()
    }
  }

  return (
    <div className="relative flex flex-col h-full w-full">
      {searchVisible && (
        <div className="absolute top-0 right-0 z-10 flex items-center gap-1.5 px-2 py-1.5 bg-surface-2 border border-border rounded-bl-lg shadow-lg">
          <input
            ref={searchInputRef}
            type="text"
            placeholder="Search..."
            className="bg-surface-1 text-text-primary text-sm px-2 py-1 rounded border border-border focus:border-accent outline-none w-56"
            onKeyDown={handleSearch}
          />
          <span className="text-2xs text-text-muted">Enter/Shift+Enter</span>
        </div>
      )}
      <div
        ref={containerRef}
        className="flex-1 w-full"
        style={{ padding: '8px 0 0 8px' }}
        onClick={() => terminalRef.current?.focus()}
      />
    </div>
  )
}
