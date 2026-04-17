import * as pty from 'node-pty'
import { v4 as uuid } from 'uuid'
import os from 'os'

interface PtyInstance {
  process: pty.IPty
  cwd: string
}

export class PtyManager {
  private instances = new Map<string, PtyInstance>()

  create(options: { cols: number; rows: number; cwd: string; shell?: string }): string {
    const id = uuid()
    const defaultShell = options.shell || process.env.SHELL || (os.platform() === 'win32' ? 'powershell.exe' : '/bin/zsh')

    const ptyProcess = pty.spawn(defaultShell, [], {
      name: 'xterm-256color',
      cols: options.cols,
      rows: options.rows,
      cwd: options.cwd,
      env: {
        ...process.env,
        TERM: 'xterm-256color',
        COLORTERM: 'truecolor',
        TERM_PROGRAM: 'ForgeStudio',
        LANG: process.env.LANG || 'en_US.UTF-8',
      } as Record<string, string>,
    })

    this.instances.set(id, {
      process: ptyProcess,
      cwd: options.cwd,
    })

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
      const { execSync } = require('child_process')
      const cwd = execSync(`lsof -p ${pid} | grep cwd | awk '{print $NF}'`, {
        encoding: 'utf-8',
        timeout: 1000,
      }).trim()
      if (cwd) {
        instance.cwd = cwd
        return cwd
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
}
