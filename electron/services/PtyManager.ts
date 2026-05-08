import * as pty from 'node-pty'
import { v4 as uuid } from 'uuid'
import os from 'os'
import { execFileSync } from 'child_process'
import { pathManager } from './PathManager'

interface PtyInstance {
  process: pty.IPty
  cwd: string
}

export class PtyManager {
  private instances = new Map<string, PtyInstance>()

  private static readonly ALLOWED_SHELLS = new Set([
    '/bin/bash', '/bin/zsh', '/bin/sh', '/usr/bin/fish', '/usr/local/bin/bash',
    '/usr/local/bin/zsh', '/usr/local/bin/fish', '/opt/homebrew/bin/bash',
    '/opt/homebrew/bin/zsh', '/opt/homebrew/bin/fish',
    'powershell.exe', 'cmd.exe',
  ])

  private buildEnv(): Record<string, string> {
    // GUI-launched apps on macOS often miss /opt/homebrew/bin and /usr/local/bin
    // in PATH, breaking rbenv/nvm/pyenv/fvm/etc. Prepend them on darwin. Then
    // pathManager.augmentEnv prepends our bundled bin/cr-graph-venv/python so
    // tmux/uv/code-review-graph resolve from the DMG without a separate user
    // install. Order: bundled > brew/local > inherited PATH.
    const basePath = process.env.PATH || ''
    const augmentedPath = os.platform() === 'darwin'
      ? ['/opt/homebrew/bin', '/usr/local/bin', basePath].filter(Boolean).join(':')
      : basePath
    const baseEnv: Record<string, string> = {
      ...process.env,
      PATH: augmentedPath,
      TERM: 'xterm-256color',
      COLORTERM: 'truecolor',
      TERM_PROGRAM: 'ForgeStudio',
      LANG: process.env.LANG || 'en_US.UTF-8',
    } as Record<string, string>
    return pathManager.augmentEnv(baseEnv)
  }

  create(options: { cols: number; rows: number; cwd: string; shell?: string }): string {
    const id = uuid()
    const systemShell = process.env.SHELL || (os.platform() === 'win32' ? 'powershell.exe' : '/bin/zsh')
    const defaultShell = (options.shell && PtyManager.ALLOWED_SHELLS.has(options.shell))
      ? options.shell
      : systemShell

    const ptyProcess = pty.spawn(defaultShell, [], {
      name: 'xterm-256color',
      cols: options.cols,
      rows: options.rows,
      cwd: options.cwd,
      env: this.buildEnv(),
    })

    this.instances.set(id, {
      process: ptyProcess,
      cwd: options.cwd,
    })

    return id
  }

  /**
   * Spawn a PTY that attaches to an existing tmux pane. Used to surface
   * agent-team tmux panes (Claude Code team backend) inside Forge's terminal.
   * paneId must match tmux's `%N` / `@N` / `$N` format — validated to prevent
   * shell injection since it's interpolated into the exec string.
   */
  createTmuxAttach(options: { cols: number; rows: number; paneId: string }): string {
    if (!/^[%@$][A-Za-z0-9_-]+$/.test(options.paneId)) {
      throw new Error(`Invalid tmux target: ${options.paneId}`)
    }
    const id = uuid()
    // Resolve tmux from the bundled toolchain when available so users on a
    // bare macOS install (no Homebrew) still get a working agent-team backend.
    // Falls back to plain `tmux` (resolved via PATH) when running an older
    // build or when the bundle is absent.
    const tmuxBin = pathManager.getTmux() ?? 'tmux'
    // select-pane then attach-session: `-t <pane-id>` on attach resolves the
    // pane's session automatically. The select-pane focuses the right pane so
    // the user sees that agent's output, not whatever was last viewed.
    const cmd = `'${tmuxBin}' select-pane -t ${options.paneId} 2>/dev/null; exec '${tmuxBin}' attach-session -t ${options.paneId}`
    const ptyProcess = pty.spawn('/bin/sh', ['-c', cmd], {
      name: 'xterm-256color',
      cols: options.cols,
      rows: options.rows,
      cwd: process.env.HOME || '/',
      env: this.buildEnv(),
    })
    this.instances.set(id, { process: ptyProcess, cwd: '' })
    return id
  }

  write(id: string, data: string): void {
    this.instances.get(id)?.process.write(data)
  }

  resize(id: string, cols: number, rows: number): void {
    try {
      this.instances.get(id)?.process.resize(cols, rows)
    } catch {
      // Ignore resize errors on disposed PTY
    }
  }

  onData(id: string, callback: (data: string) => void): void {
    this.instances.get(id)?.process.onData(callback)
  }

  onExit(id: string, callback: (exitCode: number) => void): void {
    this.instances.get(id)?.process.onExit(({ exitCode }) => {
      callback(exitCode)
      this.instances.delete(id)
    })
  }

  getCwd(id: string): string | null {
    const instance = this.instances.get(id)
    if (!instance) return null

    // Try to get the real CWD from the process
    try {
      const pid = instance.process.pid
      const lsofOutput = execFileSync('lsof', ['-p', String(pid), '-Fn'], {
        encoding: 'utf-8',
        timeout: 1000,
      })
      // Parse lsof -Fn output: lines starting with 'n' after 'fcwd' line
      const lines = lsofOutput.split('\n')
      for (let i = 0; i < lines.length; i++) {
        if (lines[i] === 'fcwd' && i + 1 < lines.length && lines[i + 1].startsWith('n')) {
          const cwd = lines[i + 1].slice(1)
          if (cwd) {
            instance.cwd = cwd
            return cwd
          }
        }
      }
    } catch {
      // Fallback to stored cwd
    }
    return instance.cwd
  }

  dispose(id: string): void {
    const instance = this.instances.get(id)
    if (instance) {
      try {
        instance.process.kill()
      } catch {
        // Already dead
      }
      this.instances.delete(id)
    }
  }

  disposeAll(): void {
    for (const [id] of this.instances) {
      this.dispose(id)
    }
  }

  /**
   * Number of currently-live PTY instances. Surfaced to the renderer via
   * `system:resourceSnapshot` so the ResourceBar can show a real PTY count
   * instead of a synthetic value.
   */
  activeCount(): number {
    return this.instances.size
  }
}
