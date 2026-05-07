/**
 * FilesPanelWired — production wiring of the v2 Files panel.
 *
 * Bridges `useFilesStore` (real workspace filesystem) to the v2 left-rail
 * Files section. Visually mirrors `FilesPanel.tsx` (the seed/static version)
 * but renders the live `FileTreeNode` tree, lazy-loads directories on expand,
 * and routes file clicks through `selectFile` so `FilePreview` can show real
 * content.
 *
 * Harness visibility honors the global Cmd+Shift+. toggle (`useGitStore.
 * showHarnessFiles`); when off, `.claude/` and harness-template paths are
 * filtered server-side by the IPC layer.
 */
import { useEffect } from 'react'
import { Icon } from '../icons'
import { Pill } from '../primitives'
import { useFilesStore, type FileTreeNode } from '@/stores/files'
import { useGitStore } from '@/stores/git'

export interface FilesPanelWiredProps {
  /** Absolute path of the active workspace; tree re-roots when this changes. */
  workspacePath: string
  /** Maximum height for the scrollable area. */
  maxHeight?: number
}

export function FilesPanelWired({ workspacePath, maxHeight = 220 }: FilesPanelWiredProps) {
  const fileTree = useFilesStore((s) => s.fileTree)
  const selectedFilePath = useFilesStore((s) => s.selectedFilePath)
  const error = useFilesStore((s) => s.error)
  const initRoot = useFilesStore((s) => s.initRoot)
  const toggleDir = useFilesStore((s) => s.toggleDir)
  const selectFile = useFilesStore((s) => s.selectFile)
  const includeHarness = useFilesStore((s) => s.includeHarness)
  const setIncludeHarness = useFilesStore((s) => s.toggleIncludeHarness)

  // Mirror the global git "showHarnessFiles" toggle into the files store, so
  // Cmd+Shift+. (already wired in App.tsx) hides .claude/ etc. consistently.
  const showHarnessFiles = useGitStore((s) => s.showHarnessFiles)
  useEffect(() => {
    if (showHarnessFiles !== includeHarness) {
      setIncludeHarness()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [showHarnessFiles])

  // (Re)load the root tree whenever the active workspace changes.
  useEffect(() => {
    if (workspacePath) void initRoot(workspacePath)
  }, [workspacePath, initRoot])

  return (
    <>
      <div
        className="ns"
        style={{
          display: 'flex',
          alignItems: 'center',
          padding: '8px 10px',
          borderBottom: '1px solid var(--line-1)',
          color: 'var(--text-3)',
          fontSize: 10.5,
          fontWeight: 600,
          letterSpacing: 1.2,
          textTransform: 'uppercase',
          fontFamily: 'var(--font-mono)',
          gap: 4,
        }}
      >
        Files
        <span style={{ flex: 1 }} />
        {showHarnessFiles && (
          <Pill color="var(--text-3)" style={{ height: 14, fontSize: 9 }}>
            +HARNESS
          </Pill>
        )}
      </div>
      <div
        style={{
          maxHeight,
          overflowY: 'auto',
          padding: '4px 0',
          borderBottom: '1px solid var(--line-1)',
        }}
      >
        {error && (
          <div
            style={{
              padding: '6px 10px',
              fontSize: 11,
              color: 'var(--danger)',
              fontFamily: 'var(--font-mono)',
            }}
          >
            {error}
          </div>
        )}
        {!fileTree && !error && (
          <div
            style={{
              padding: '6px 10px',
              fontSize: 11,
              color: 'var(--text-4)',
              fontFamily: 'var(--font-mono)',
            }}
          >
            Loading…
          </div>
        )}
        {fileTree?.children?.map((c) => (
          <FileNode
            key={c.path}
            node={c}
            depth={0}
            selectedFilePath={selectedFilePath}
            onToggle={(p) => void toggleDir(p)}
            onSelect={(p) => void selectFile(p)}
          />
        ))}
        {fileTree && (fileTree.children?.length ?? 0) === 0 && (
          <div
            style={{
              padding: '6px 10px',
              fontSize: 11,
              color: 'var(--text-4)',
              fontFamily: 'var(--font-mono)',
            }}
          >
            (empty)
          </div>
        )}
      </div>
    </>
  )
}

interface FileNodeProps {
  node: FileTreeNode
  depth: number
  selectedFilePath: string | null
  onToggle: (path: string) => void
  onSelect: (path: string) => void
}

function FileNode({ node, depth, selectedFilePath, onToggle, onSelect }: FileNodeProps) {
  const isFolder = node.type === 'dir'
  const sel = !isFolder && selectedFilePath === node.path
  return (
    <div>
      <button
        onClick={() => (isFolder ? onToggle(node.path) : onSelect(node.path))}
        style={{
          width: '100%',
          display: 'flex',
          alignItems: 'center',
          gap: 4,
          padding: `2px 8px 2px ${8 + depth * 12}px`,
          background: sel ? 'var(--bg-3)' : 'transparent',
          borderLeft: `2px solid ${sel ? 'var(--accent)' : 'transparent'}`,
          border: 'none',
          color: sel ? 'var(--text-1)' : 'var(--text-2)',
          fontSize: 11.5,
          cursor: 'pointer',
          textAlign: 'left',
          fontFamily: 'var(--font-ui)',
        }}
      >
        {isFolder ? (
          <Icon.Chevron
            size={10}
            style={{
              transform: node.open ? 'rotate(90deg)' : 'none',
              color: 'var(--text-3)',
              flexShrink: 0,
            }}
          />
        ) : (
          <span style={{ width: 10, flexShrink: 0 }} />
        )}
        {isFolder ? (
          <Icon.Folder size={11} style={{ color: 'var(--text-3)' }} />
        ) : (
          <Icon.File
            size={11}
            style={{ color: sel ? 'var(--accent)' : 'var(--text-4)' }}
          />
        )}
        <span
          style={{
            overflow: 'hidden',
            textOverflow: 'ellipsis',
            whiteSpace: 'nowrap',
          }}
        >
          {node.name}
        </span>
        {node.harness && (
          <Pill color="var(--accent)" style={{ marginLeft: 'auto', height: 14, fontSize: 9 }}>
            HARNESS
          </Pill>
        )}
      </button>
      {isFolder &&
        node.open &&
        (node.children ?? []).map((c) => (
          <FileNode
            key={c.path}
            node={c}
            depth={depth + 1}
            selectedFilePath={selectedFilePath}
            onToggle={onToggle}
            onSelect={onSelect}
          />
        ))}
    </div>
  )
}
