import { create } from 'zustand'

/**
 * One node in the workspace file tree. The root node is the workspace itself
 * (`type: 'dir'`, `path` = absolute workspace path). Children are loaded
 * lazily — `children: undefined` means "not yet expanded", `children: []`
 * means "loaded, empty directory".
 */
export interface FileTreeNode {
  /** Absolute path on disk. */
  path: string
  /** Display name (last segment of `path`). */
  name: string
  type: 'file' | 'dir'
  size?: number
  /** Lazily populated for dirs; undefined until first expand. */
  children?: FileTreeNode[]
  /** Open/expanded state in the UI. */
  open?: boolean
  /** True once children have been fetched at least once. */
  loaded?: boolean
  /** True iff this entry is part of the harness scaffold (.claude, etc.). */
  harness?: boolean
}

const HARNESS_DIR_NAMES = new Set(['.claude'])
const HARNESS_PATH_PARTS = ['/resources/harness-template/', '/framework-agnostic-harness/']

function isHarnessNode(absPath: string, name: string): boolean {
  if (HARNESS_DIR_NAMES.has(name)) return true
  return HARNESS_PATH_PARTS.some((p) => absPath.includes(p))
}

interface FilesState {
  /** Root tree node anchored at the active workspace path. */
  fileTree: FileTreeNode | null
  /** Currently selected file path (absolute). */
  selectedFilePath: string | null
  /** Decoded text content of the selected file, or null while loading/binary. */
  selectedFileContent: string | null
  /** True when the file content was truncated due to size cap. */
  selectedFileTruncated: boolean
  /** True when the selected file looked binary (no text content). */
  selectedFileBinary: boolean
  /** True while a file is being read. */
  loadingFile: boolean
  /** Last error message from a load operation, if any. */
  error: string | null
  /** Whether harness files (.claude/, framework-agnostic-harness/, …) should
   *  be visible in the tree. Mirrors the git store's `showHarnessFiles`. */
  includeHarness: boolean

  /** Initialise the tree at `rootPath` (clears prior state). */
  initRoot: (rootPath: string) => Promise<void>
  /** Toggle a directory open/closed; lazy-loads children on first open. */
  toggleDir: (absPath: string) => Promise<void>
  /** Force-reload a directory (used after harness toggle / refresh). */
  reloadDir: (absPath: string) => Promise<void>
  /** Select a file: stores path + fetches its content. */
  selectFile: (absPath: string) => Promise<void>
  /** Clear current file selection. */
  clearSelection: () => void
  /** Toggle harness-file visibility in the tree. */
  toggleIncludeHarness: () => void
}

function nameFromPath(p: string): string {
  const idx = Math.max(p.lastIndexOf('/'), p.lastIndexOf('\\'))
  return idx >= 0 ? p.slice(idx + 1) : p
}

/**
 * Recursively replace the node at `targetPath` using `updater`. Returns a new
 * tree (or the same reference if no change occurred — useful for early-out).
 */
function patchTree(
  node: FileTreeNode,
  targetPath: string,
  updater: (n: FileTreeNode) => FileTreeNode
): FileTreeNode {
  if (node.path === targetPath) {
    return updater(node)
  }
  if (!node.children) return node
  let changed = false
  const next = node.children.map((c) => {
    const out = patchTree(c, targetPath, updater)
    if (out !== c) changed = true
    return out
  })
  return changed ? { ...node, children: next } : node
}

async function fetchChildren(
  absPath: string,
  includeHarness: boolean
): Promise<FileTreeNode[]> {
  const { entries } = await window.api.fs.listDir(absPath, {
    includeHarness,
    ignoreNodeModules: true,
  })
  return entries.map<FileTreeNode>((e) => {
    const childPath = `${absPath.replace(/[/\\]+$/, '')}/${e.name}`
    return {
      path: childPath,
      name: e.name,
      type: e.type,
      size: e.size,
      harness: isHarnessNode(childPath, e.name),
      children: undefined,
      open: false,
      loaded: false,
    }
  })
}

export const useFilesStore = create<FilesState>((set, get) => ({
  fileTree: null,
  selectedFilePath: null,
  selectedFileContent: null,
  selectedFileTruncated: false,
  selectedFileBinary: false,
  loadingFile: false,
  error: null,
  includeHarness: false,

  initRoot: async (rootPath: string) => {
    set({
      fileTree: null,
      selectedFilePath: null,
      selectedFileContent: null,
      selectedFileTruncated: false,
      selectedFileBinary: false,
      error: null,
    })
    try {
      const children = await fetchChildren(rootPath, get().includeHarness)
      const root: FileTreeNode = {
        path: rootPath,
        name: nameFromPath(rootPath),
        type: 'dir',
        children,
        open: true,
        loaded: true,
      }
      set({ fileTree: root })
    } catch (err) {
      set({ error: err instanceof Error ? err.message : 'Failed to load file tree' })
    }
  },

  toggleDir: async (absPath: string) => {
    const tree = get().fileTree
    if (!tree) return

    // First flip `open` (and lazy-load if needed).
    let needsLoad = false
    const flipped = patchTree(tree, absPath, (n) => {
      if (n.type !== 'dir') return n
      const willOpen = !n.open
      if (willOpen && !n.loaded) needsLoad = true
      return { ...n, open: willOpen }
    })
    set({ fileTree: flipped })

    if (!needsLoad) return

    try {
      const children = await fetchChildren(absPath, get().includeHarness)
      set((s) => ({
        fileTree: s.fileTree
          ? patchTree(s.fileTree, absPath, (n) => ({
              ...n,
              children,
              loaded: true,
            }))
          : s.fileTree,
      }))
    } catch (err) {
      set({ error: err instanceof Error ? err.message : 'Failed to list directory' })
    }
  },

  reloadDir: async (absPath: string) => {
    const tree = get().fileTree
    if (!tree) return
    try {
      const children = await fetchChildren(absPath, get().includeHarness)
      set((s) => ({
        fileTree: s.fileTree
          ? patchTree(s.fileTree, absPath, (n) => ({
              ...n,
              children,
              loaded: true,
              open: true,
            }))
          : s.fileTree,
      }))
    } catch (err) {
      set({ error: err instanceof Error ? err.message : 'Failed to reload directory' })
    }
  },

  selectFile: async (absPath: string) => {
    set({
      selectedFilePath: absPath,
      selectedFileContent: null,
      selectedFileTruncated: false,
      selectedFileBinary: false,
      loadingFile: true,
      error: null,
    })
    try {
      const res = await window.api.fs.readFile(absPath, 256 * 1024)
      set({
        selectedFileContent: res.content,
        selectedFileTruncated: res.truncated,
        selectedFileBinary: res.binary,
        loadingFile: false,
      })
    } catch (err) {
      set({
        error: err instanceof Error ? err.message : 'Failed to read file',
        loadingFile: false,
      })
    }
  },

  clearSelection: () =>
    set({
      selectedFilePath: null,
      selectedFileContent: null,
      selectedFileTruncated: false,
      selectedFileBinary: false,
    }),

  toggleIncludeHarness: () => {
    const next = !get().includeHarness
    set({ includeHarness: next })
    // Re-load the root directory so the new visibility takes effect immediately.
    const tree = get().fileTree
    if (tree) {
      void get().reloadDir(tree.path)
    }
  },
}))
