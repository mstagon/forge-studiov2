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
  onTitleChange?: (title: string) => void
  onPtyCreated?: (ptyId: string) => void
}

export function XTerminal({ tabId, paneId, cwd, isActive, searchVisible, onTitleChange, onPtyCreated }: XTerminalProps) {
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

      // Create PTY
      try {
        ptyId = await window.api.pty.create({
          cols: terminal.cols || 80,
          rows: terminal.rows || 24,
          cwd: cwd || undefined,
        })
      } catch (err) {
        terminal.write(`\r\n\x1b[31mFailed to create terminal: ${err}\x1b[0m\r\n`)
        return
      }

      // Bail if disposed during async PTY creation
      if (disposed || !ptyId) {
        if (ptyId) window.api.pty.dispose(ptyId)
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

      // Auto-fit on resize
      resizeObserver = new ResizeObserver(() => {
        requestAnimationFrame(() => {
          if (!disposed) {
            try { fitAddon.fit() } catch { /* noop */ }
          }
        })
      })
      resizeObserver.observe(container)

      // Explicit wheel fallback. WebGL canvas on macOS sometimes fails to
      // forward wheel events to xterm's internal handler (especially with
      // trackpad momentum scroll), so the viewport silently doesn't move.
      // Translate pixel deltas into line scrolls and feed terminal.scrollLines
      // directly. preventDefault to avoid the page also scrolling.
      const onWheel = (e: WheelEvent) => {
        if (!terminal) return
        e.preventDefault()
        // deltaMode 0 = pixels, 1 = lines, 2 = pages — normalise to lines.
        const lineHeightPx = 14 * 1.35
        let lines: number
        if (e.deltaMode === 1) lines = e.deltaY
        else if (e.deltaMode === 2) lines = e.deltaY * terminal.rows
        else lines = e.deltaY / lineHeightPx
        // Speed up when shift is held (xterm's "fast scroll" convention).
        if (e.shiftKey) lines *= 5
        if (lines !== 0) terminal.scrollLines(Math.trunc(lines) || (lines > 0 ? 1 : -1))
      }
      container.addEventListener('wheel', onWheel, { passive: false })
      const detachWheel = () => container.removeEventListener('wheel', onWheel)
      // Stash so the cleanup block can find it.
      ;(terminal as unknown as { __detachWheel?: () => void }).__detachWheel = detachWheel
    }

    init()

    return () => {
      disposed = true
      cleanupData?.()
      cleanupExit?.()
      resizeObserver?.disconnect()
      if (terminal) {
        ;(terminal as unknown as { __detachWheel?: () => void }).__detachWheel?.()
      }
      if (ptyId) window.api.pty.dispose(ptyId)
      if (terminal) terminal.dispose()
      terminalRef.current = null
      fitAddonRef.current = null
      searchAddonRef.current = null
      ptyIdRef.current = null
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
