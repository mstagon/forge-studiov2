import { create } from 'zustand'
import type { GitCommit, GitStatus, GitBranch, GitFileChange } from '@/types'

interface GitState {
  status: GitStatus | null
  commits: GitCommit[]
  branches: GitBranch[]
  selectedCommit: GitCommit | null
  selectedCommitFiles: GitFileChange[]
  diffContent: string
  diffFile: string | null
  commitMessage: string
  loading: boolean
  error: string | null

  refresh: (cwd: string) => Promise<void>
  refreshStatus: (cwd: string) => Promise<void>
  refreshLog: (cwd: string) => Promise<void>
  refreshBranches: (cwd: string) => Promise<void>

  stage: (cwd: string, files: string[]) => Promise<void>
  stageAll: (cwd: string) => Promise<void>
  unstage: (cwd: string, files: string[]) => Promise<void>
  unstageAll: (cwd: string) => Promise<void>
  discard: (cwd: string, file: string) => Promise<void>

  commit: (cwd: string) => Promise<void>
  push: (cwd: string) => Promise<void>
  pull: (cwd: string) => Promise<void>
  fetch: (cwd: string) => Promise<void>

  checkout: (cwd: string, branch: string) => Promise<void>
  createBranch: (cwd: string, name: string) => Promise<void>
  deleteBranch: (cwd: string, name: string) => Promise<void>

  selectCommit: (cwd: string, commit: GitCommit | null) => Promise<void>
  viewDiff: (cwd: string, file: string, staged: boolean) => Promise<void>
  viewCommitDiff: (cwd: string, hash: string) => Promise<void>

  setCommitMessage: (msg: string) => void
  clearError: () => void
}

export const useGitStore = create<GitState>((set, get) => ({
  status: null,
  commits: [],
  branches: [],
  selectedCommit: null,
  selectedCommitFiles: [],
  diffContent: '',
  diffFile: null,
  commitMessage: '',
  loading: false,
  error: null,

  refresh: async (cwd) => {
    await Promise.all([
      get().refreshStatus(cwd),
      get().refreshLog(cwd),
      get().refreshBranches(cwd),
    ])
  },

  refreshStatus: async (cwd) => {
    try {
      const status = await window.api.git.status(cwd)
      set({ status })
    } catch (err: any) {
      set({ error: err.message })
    }
  },

  refreshLog: async (cwd) => {
    try {
      const commits = await window.api.git.log(cwd, 200)
      set({ commits })
    } catch (err: any) {
      set({ error: err.message })
    }
  },

  refreshBranches: async (cwd) => {
    try {
      const branches = await window.api.git.branches(cwd)
      set({ branches })
    } catch (err: any) {
      set({ error: err.message })
    }
  },

  stage: async (cwd, files) => {
    await window.api.git.stage(cwd, files)
    await get().refreshStatus(cwd)
  },

  stageAll: async (cwd) => {
    await window.api.git.stageAll(cwd)
    await get().refreshStatus(cwd)
  },

  unstage: async (cwd, files) => {
    await window.api.git.unstage(cwd, files)
    await get().refreshStatus(cwd)
  },

  unstageAll: async (cwd) => {
    await window.api.git.unstageAll(cwd)
    await get().refreshStatus(cwd)
  },

  discard: async (cwd, file) => {
    await window.api.git.discard(cwd, file)
    await get().refreshStatus(cwd)
  },

  commit: async (cwd) => {
    const msg = get().commitMessage.trim()
    if (!msg) return
    set({ loading: true, error: null })
    try {
      await window.api.git.commit(cwd, msg)
      set({ commitMessage: '' })
      await get().refresh(cwd)
    } catch (err: any) {
      set({ error: err.message })
    } finally {
      set({ loading: false })
    }
  },

  push: async (cwd) => {
    set({ loading: true, error: null })
    try {
      await window.api.git.push(cwd)
      await get().refreshStatus(cwd)
    } catch (err: any) {
      set({ error: err.message })
    } finally {
      set({ loading: false })
    }
  },

  pull: async (cwd) => {
    set({ loading: true, error: null })
    try {
      await window.api.git.pull(cwd)
      await get().refresh(cwd)
    } catch (err: any) {
      set({ error: err.message })
    } finally {
      set({ loading: false })
    }
  },

  fetch: async (cwd) => {
    set({ loading: true })
    try {
      await window.api.git.fetch(cwd)
      await get().refreshStatus(cwd)
    } catch (err: any) {
      set({ error: err.message })
    } finally {
      set({ loading: false })
    }
  },

  checkout: async (cwd, branch) => {
    set({ loading: true, error: null })
    try {
      await window.api.git.checkout(cwd, branch)
      await get().refresh(cwd)
    } catch (err: any) {
      set({ error: err.message })
    } finally {
      set({ loading: false })
    }
  },

  createBranch: async (cwd, name) => {
    await window.api.git.createBranch(cwd, name)
    await get().refresh(cwd)
  },

  deleteBranch: async (cwd, name) => {
    await window.api.git.deleteBranch(cwd, name)
    await get().refresh(cwd)
  },

  selectCommit: async (cwd, commit) => {
    if (!commit) {
      set({ selectedCommit: null, selectedCommitFiles: [], diffContent: '' })
      return
    }
    set({ selectedCommit: commit })
    const files = await window.api.git.commitFiles(cwd, commit.hash)
    set({ selectedCommitFiles: files })
  },

  viewDiff: async (cwd, file, staged) => {
    const content = await window.api.git.diff(cwd, file, staged)
    set({ diffContent: content, diffFile: file })
  },

  viewCommitDiff: async (cwd, hash) => {
    const content = await window.api.git.commitDiff(cwd, hash)
    set({ diffContent: content })
  },

  setCommitMessage: (msg) => set({ commitMessage: msg }),
  clearError: () => set({ error: null }),
}))
