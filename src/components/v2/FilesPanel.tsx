// FilesPanel — file tree section (collapsible) for the workspace left rail.
// Migrated from workspace_v2.jsx (FILE_TREE + FileNode).

import { useState } from 'react'
// TODO: foundation import — provided by main session
import { Icon } from './icons'
import { Pill } from './primitives'

export interface FileNodeData {
  type: 'file' | 'folder'
  name: string
  open?: boolean
  children?: FileNodeData[]
  flag?: 'harness'
}

const DEFAULT_FILE_TREE: FileNodeData[] = [
  {
    type: 'folder',
    name: 'lib',
    open: true,
    children: [
      {
        type: 'folder',
        name: 'features',
        open: true,
        children: [
          {
            type: 'folder',
            name: 'auth',
            open: true,
            children: [
              { type: 'folder', name: 'widgets', open: false, children: [] },
              { type: 'folder', name: 'providers', open: false, children: [] },
            ],
          },
          { type: 'folder', name: 'home', open: false, children: [] },
        ],
      },
      { type: 'folder', name: 'theme', open: false, children: [] },
      { type: 'file', name: 'main.dart' },
    ],
  },
  { type: 'folder', name: 'test', open: false, children: [] },
  { type: 'folder', name: 'prisma', open: false, children: [] },
  { type: 'file', name: 'pubspec.yaml' },
  { type: 'file', name: 'CLAUDE.md', flag: 'harness' },
  { type: 'file', name: 'README.md' },
]

export interface FilesPanelProps {
  /** File tree data — defaults to a sample tree if not provided. */
  tree?: FileNodeData[]
  selectedFile: string | null
  onSelectFile: (name: string) => void
  /** Maximum height for the scrollable area. */
  maxHeight?: number
}

/**
 * Collapsible "Files" section used inside the workspace left rail.
 * Renders the section header + file tree.
 */
export function FilesPanel({
  tree = DEFAULT_FILE_TREE,
  selectedFile,
  onSelectFile,
  maxHeight = 220,
}: FilesPanelProps) {
  const [filesOpen, setFilesOpen] = useState(true)
  return (
    <>
      <button
        onClick={() => setFilesOpen(!filesOpen)}
        className="ns"
        style={{
          display: 'flex',
          alignItems: 'center',
          padding: '8px 10px',
          background: 'transparent',
          border: 'none',
          borderBottom: '1px solid var(--line-1)',
          color: 'var(--text-3)',
          fontSize: 10.5,
          fontWeight: 600,
          letterSpacing: 1.2,
          textTransform: 'uppercase',
          cursor: 'pointer',
          fontFamily: 'var(--font-mono)',
          gap: 4,
        }}
      >
        <Icon.Chevron
          size={10}
          style={{ transform: filesOpen ? 'rotate(90deg)' : 'none' }}
        />
        Files
        <span style={{ flex: 1 }} />
      </button>
      {filesOpen && (
        <div
          style={{
            maxHeight,
            overflowY: 'auto',
            padding: '4px 0',
            borderBottom: '1px solid var(--line-1)',
          }}
        >
          {tree.map((n, i) => (
            <FileNode
              key={`${n.name}-${i}`}
              node={n}
              selectedFile={selectedFile}
              onSelectFile={onSelectFile}
            />
          ))}
        </div>
      )}
    </>
  )
}

interface FileNodeProps {
  node: FileNodeData
  depth?: number
  selectedFile: string | null
  onSelectFile: (name: string) => void
}

function FileNode({ node, depth = 0, selectedFile, onSelectFile }: FileNodeProps) {
  const [open, setOpen] = useState(Boolean(node.open))
  const isFolder = node.type === 'folder'
  const sel = !isFolder && selectedFile === node.name
  return (
    <div>
      <button
        onClick={() => (isFolder ? setOpen(!open) : onSelectFile(node.name))}
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
              transform: open ? 'rotate(90deg)' : 'none',
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
        {node.flag === 'harness' && (
          <Pill color="var(--accent)" style={{ marginLeft: 'auto', height: 14, fontSize: 9 }}>
            HARNESS
          </Pill>
        )}
      </button>
      {isFolder &&
        open &&
        (node.children ?? []).map((c, i) => (
          <FileNode
            key={`${c.name}-${i}`}
            node={c}
            depth={depth + 1}
            selectedFile={selectedFile}
            onSelectFile={onSelectFile}
          />
        ))}
    </div>
  )
}
