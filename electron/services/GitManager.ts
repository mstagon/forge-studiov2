import { execFile } from 'child_process'
import { promisify } from 'util'

const exec = promisify(execFile)

export interface GitCommit {
  hash: string
  shortHash: string
  parents: string[]
  message: string
  author: string
  email: string
  date: string
  refs: string[]
}

export interface GitFileChange {
  path: string
  status: 'M' | 'A' | 'D' | 'R' | 'C' | 'U' | '?'
  oldPath?: string
}

export interface GitStatus {
  branch: string
  upstream: string
  ahead: number
  behind: number
  staged: GitFileChange[]
  unstaged: GitFileChange[]
  untracked: string[]
  isRepo: boolean
}

export interface GitBranch {
  name: string
  current: boolean
  remote: string
  lastCommitHash: string
  lastCommitMsg: string
}

async function git(cwd: string, args: string[]): Promise<string> {
  try {
    const { stdout } = await exec('git', args, {
      cwd,
      maxBuffer: 10 * 1024 * 1024,
      env: { ...process.env, GIT_TERMINAL_PROMPT: '0', LC_ALL: 'C' },
    })
    return stdout.trim()
  } catch (err: any) {
    if (err.stdout) return err.stdout.trim()
    throw err
  }
}

export class GitManager {
  async isRepo(cwd: string): Promise<boolean> {
    try {
      await git(cwd, ['rev-parse', '--is-inside-work-tree'])
      return true
    } catch {
      return false
    }
  }

  async getStatus(cwd: string): Promise<GitStatus> {
    const status: GitStatus = {
      branch: '',
      upstream: '',
      ahead: 0,
      behind: 0,
      staged: [],
      unstaged: [],
      untracked: [],
      isRepo: false,
    }

    if (!await this.isRepo(cwd)) return status
    status.isRepo = true

    // Branch info
    try {
      status.branch = await git(cwd, ['rev-parse', '--abbrev-ref', 'HEAD'])
    } catch { /* detached HEAD or empty repo */ }

    // Upstream tracking
    try {
      status.upstream = await git(cwd, ['rev-parse', '--abbrev-ref', '@{u}'])
      const counts = await git(cwd, ['rev-list', '--left-right', '--count', 'HEAD...@{u}'])
      const [ahead, behind] = counts.split('\t').map(Number)
      status.ahead = ahead
      status.behind = behind
    } catch { /* no upstream */ }

    // Porcelain status
    try {
      const raw = await git(cwd, ['status', '--porcelain=v1', '-uall'])
      if (!raw) return status

      for (const line of raw.split('\n')) {
        if (!line) continue
        const indexStatus = line[0]
        const workStatus = line[1]
        const filePath = line.slice(3)

        // Parse renames
        const parts = filePath.split(' -> ')
        const path = parts[parts.length - 1]
        const oldPath = parts.length > 1 ? parts[0] : undefined

        // Staged changes
        if (indexStatus !== ' ' && indexStatus !== '?') {
          status.staged.push({ path, status: indexStatus as GitFileChange['status'], oldPath })
        }

        // Unstaged changes
        if (workStatus !== ' ' && workStatus !== '?') {
          status.unstaged.push({ path, status: workStatus as GitFileChange['status'] })
        }

        // Untracked
        if (indexStatus === '?' && workStatus === '?') {
          status.untracked.push(path)
        }
      }
    } catch { /* empty repo */ }

    return status
  }

  async getLog(cwd: string, limit = 100, all = true): Promise<GitCommit[]> {
    if (!await this.isRepo(cwd)) return []

    const format = '%H|%h|%P|%s|%an|%ae|%aI|%D'
    const args = ['log', `--format=${format}`, `-${limit}`, '--topo-order']
    if (all) args.push('--all')

    try {
      const raw = await git(cwd, args)
      if (!raw) return []

      return raw.split('\n').map((line) => {
        const [hash, shortHash, parentStr, message, author, email, date, refStr] = line.split('|')
        return {
          hash,
          shortHash,
          parents: parentStr ? parentStr.split(' ') : [],
          message,
          author,
          email,
          date,
          refs: refStr ? refStr.split(', ').filter(Boolean) : [],
        }
      })
    } catch {
      return []
    }
  }

  async getBranches(cwd: string): Promise<GitBranch[]> {
    if (!await this.isRepo(cwd)) return []

    try {
      const format = '%(HEAD)|%(refname:short)|%(upstream:short)|%(objectname:short)|%(subject)'
      const raw = await git(cwd, ['for-each-ref', `--format=${format}`, 'refs/heads/'])
      if (!raw) return []

      return raw.split('\n').map((line) => {
        const [head, name, remote, lastCommitHash, lastCommitMsg] = line.split('|')
        return {
          name,
          current: head === '*',
          remote: remote || '',
          lastCommitHash,
          lastCommitMsg,
        }
      })
    } catch {
      return []
    }
  }

  async stage(cwd: string, files: string[]): Promise<void> {
    await git(cwd, ['add', '--', ...files])
  }

  async stageAll(cwd: string): Promise<void> {
    await git(cwd, ['add', '-A'])
  }

  async unstage(cwd: string, files: string[]): Promise<void> {
    await git(cwd, ['reset', 'HEAD', '--', ...files])
  }

  async unstageAll(cwd: string): Promise<void> {
    await git(cwd, ['reset', 'HEAD'])
  }

  async commit(cwd: string, message: string): Promise<string> {
    return git(cwd, ['commit', '-m', message])
  }

  async push(cwd: string): Promise<string> {
    return git(cwd, ['push'])
  }

  async pushSetUpstream(cwd: string, remote: string, branch: string): Promise<string> {
    return git(cwd, ['push', '-u', remote, branch])
  }

  async pull(cwd: string): Promise<string> {
    return git(cwd, ['pull'])
  }

  async fetch(cwd: string): Promise<string> {
    return git(cwd, ['fetch', '--all'])
  }

  async checkout(cwd: string, branch: string): Promise<void> {
    await git(cwd, ['checkout', branch])
  }

  async createBranch(cwd: string, name: string, checkout = true): Promise<void> {
    if (checkout) {
      await git(cwd, ['checkout', '-b', name])
    } else {
      await git(cwd, ['branch', name])
    }
  }

  async deleteBranch(cwd: string, name: string): Promise<void> {
    await git(cwd, ['branch', '-d', name])
  }

  async getDiff(cwd: string, file: string, staged: boolean): Promise<string> {
    const args = ['diff']
    if (staged) args.push('--cached')
    args.push('--', file)
    return git(cwd, args)
  }

  async getCommitDiff(cwd: string, hash: string): Promise<string> {
    return git(cwd, ['show', '--format=', '--stat', '--patch', hash])
  }

  async getCommitFiles(cwd: string, hash: string): Promise<GitFileChange[]> {
    const raw = await git(cwd, ['diff-tree', '--no-commit-id', '-r', '--name-status', hash])
    if (!raw) return []

    return raw.split('\n').filter(Boolean).map((line) => {
      const [status, ...pathParts] = line.split('\t')
      const path = pathParts[pathParts.length - 1]
      const oldPath = pathParts.length > 1 ? pathParts[0] : undefined
      return { path, status: status[0] as GitFileChange['status'], oldPath }
    })
  }

  async discard(cwd: string, file: string): Promise<void> {
    await git(cwd, ['checkout', '--', file])
  }

  async getRemotes(cwd: string): Promise<string[]> {
    try {
      const raw = await git(cwd, ['remote'])
      return raw ? raw.split('\n') : []
    } catch {
      return []
    }
  }
}
