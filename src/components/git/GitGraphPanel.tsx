import { useEffect, useMemo } from 'react'
import { useGitStore } from '@/stores/git'
import { useWorkspaceStore } from '@/stores/workspace'
import { VscClose, VscRefresh, VscGitMerge, VscTag } from 'react-icons/vsc'
import type { GitCommit } from '@/types'

const GRAPH_COLORS = [
  '#58a6ff', '#3fb950', '#bc8cff', '#f85149',
  '#d29922', '#39d353', '#ffa198', '#79c0ff',
  '#d2a8ff', '#56d364', '#e3b341', '#b1bac4',
]

const COL_WIDTH = 16
const ROW_HEIGHT = 32
const NODE_RADIUS = 4

interface GraphNode {
  col: number
  color: string
  parentLines: { fromCol: number; toCol: number; toRow: number; color: string }[]
}

function computeGraph(commits: GitCommit[]): Map<string, GraphNode> {
  const graph = new Map<string, GraphNode>()
  const columns: (string | null)[] = []

  const findOrAllocCol = (hash: string): number => {
    const existing = columns.indexOf(hash)
    if (existing !== -1) return existing
    const empty = columns.indexOf(null)
    if (empty !== -1) { columns[empty] = hash; return empty }
    columns.push(hash)
    return columns.length - 1
  }

  for (let row = 0; row < commits.length; row++) {
    const c = commits[row]
    let col = columns.indexOf(c.hash)
    if (col === -1) col = findOrAllocCol(c.hash)

    const color = GRAPH_COLORS[col % GRAPH_COLORS.length]
    const parentLines: GraphNode['parentLines'] = []

    // First parent inherits column
    if (c.parents.length > 0) {
      columns[col] = c.parents[0]

      // Find where parent commit is
      const parentRow = commits.findIndex((pc) => pc.hash === c.parents[0])
      if (parentRow !== -1) {
        const parentCol = findOrAllocCol(c.parents[0])
        if (parentCol !== col) columns[parentCol] = c.parents[0]
        parentLines.push({
          fromCol: col,
          toCol: columns.indexOf(c.parents[0]),
          toRow: parentRow,
          color,
        })
      }

      // Additional parents (merge commits)
      for (let p = 1; p < c.parents.length; p++) {
        const mergeParent = c.parents[p]
        const mergeCol = findOrAllocCol(mergeParent)
        const mergeRow = commits.findIndex((pc) => pc.hash === mergeParent)
        parentLines.push({
          fromCol: col,
          toCol: mergeCol,
          toRow: mergeRow !== -1 ? mergeRow : row + 1,
          color: GRAPH_COLORS[mergeCol % GRAPH_COLORS.length],
        })
      }
    } else {
      columns[col] = null
    }

    graph.set(c.hash, { col, color, parentLines })
  }

  return graph
}

function parseRefs(refs: string[]): { branches: string[]; tags: string[]; head: boolean } {
  const branches: string[] = []
  const tags: string[] = []
  let head = false
  for (const ref of refs) {
    const r = ref.trim()
    if (r === 'HEAD') { head = true; continue }
    if (r.startsWith('HEAD -> ')) { head = true; branches.push(r.replace('HEAD -> ', '')); continue }
    if (r.startsWith('tag: ')) { tags.push(r.replace('tag: ', '')); continue }
    branches.push(r)
  }
  return { branches, tags, head }
}

function timeAgo(dateStr: string): string {
  const diff = Date.now() - new Date(dateStr).getTime()
  const mins = Math.floor(diff / 60000)
  if (mins < 1) return 'just now'
  if (mins < 60) return `${mins}m ago`
  const hours = Math.floor(mins / 60)
  if (hours < 24) return `${hours}h ago`
  const days = Math.floor(hours / 24)
  if (days < 30) return `${days}d ago`
  const months = Math.floor(days / 30)
  return `${months}mo ago`
}

export function GitGraphPanel() {
  const { sidebarView } = useWorkspaceStore()
  const { activeWorkspace } = useWorkspaceStore()
  const {
    commits, selectedCommit, selectedCommitFiles, diffContent,
    refreshLog, selectCommit, viewCommitDiff,
  } = useGitStore()

  const cwd = activeWorkspace?.path || ''

  useEffect(() => {
    if (cwd && sidebarView === 'git') refreshLog(cwd)
  }, [cwd, sidebarView, refreshLog])

  const graph = useMemo(() => computeGraph(commits), [commits])
  const maxCol = useMemo(() => {
    let max = 0
    graph.forEach((node) => { if (node.col > max) max = node.col })
    return max
  }, [graph])

  if (sidebarView !== 'git' || !activeWorkspace) return null

  const graphWidth = (maxCol + 2) * COL_WIDTH

  return (
    <div className="flex flex-col h-full bg-surface-1 border-l border-border" style={{ width: '50vw', minWidth: 480, maxWidth: 800 }}>
      {/* Header */}
      <div className="flex items-center justify-between px-3 py-2 border-b border-border shrink-0">
        <div className="flex items-center gap-2">
          <VscGitMerge size={14} className="text-accent" />
          <span className="text-xs font-semibold text-text-secondary uppercase tracking-wider">Git Graph</span>
          <span className="text-2xs text-text-muted">{commits.length} commits</span>
        </div>
        <button
          className="p-1 hover:bg-surface-2 rounded text-text-secondary hover:text-text-primary"
          onClick={() => refreshLog(cwd)}
        >
          <VscRefresh size={14} />
        </button>
      </div>

      <div className="flex flex-1 overflow-hidden">
        {/* Graph + commit list */}
        <div className="flex-1 overflow-y-auto">
          {commits.map((c, row) => {
            const node = graph.get(c.hash)
            if (!node) return null
            const { branches, tags, head } = parseRefs(c.refs)
            const isSelected = selectedCommit?.hash === c.hash

            return (
              <div
                key={c.hash}
                className={`flex items-center h-8 cursor-pointer transition-colors ${
                  isSelected ? 'bg-accent/10' : 'hover:bg-surface-2'
                }`}
                onClick={() => selectCommit(cwd, isSelected ? null : c)}
              >
                {/* Graph column */}
                <svg width={graphWidth} height={ROW_HEIGHT} className="shrink-0">
                  {/* Parent lines */}
                  {node.parentLines.map((line, i) => {
                    const x1 = line.fromCol * COL_WIDTH + COL_WIDTH / 2
                    const x2 = line.toCol * COL_WIDTH + COL_WIDTH / 2
                    const y1 = ROW_HEIGHT / 2
                    const y2 = ROW_HEIGHT
                    if (line.fromCol === line.toCol) {
                      return <line key={i} x1={x1} y1={y1} x2={x2} y2={y2} stroke={line.color} strokeWidth={2} />
                    }
                    return (
                      <path
                        key={i}
                        d={`M ${x1} ${y1} C ${x1} ${y1 + 10}, ${x2} ${y2 - 10}, ${x2} ${y2}`}
                        stroke={line.color}
                        strokeWidth={2}
                        fill="none"
                      />
                    )
                  })}
                  {/* Incoming lines from previous row */}
                  {row > 0 && (() => {
                    const prevCommit = commits[row - 1]
                    const prevNode = graph.get(prevCommit.hash)
                    if (!prevNode) return null
                    return prevNode.parentLines
                      .filter((pl) => pl.toRow > row - 1)
                      .map((pl, i) => {
                        const x = pl.toCol * COL_WIDTH + COL_WIDTH / 2
                        return <line key={`in-${i}`} x1={x} y1={0} x2={x} y2={ROW_HEIGHT / 2} stroke={pl.color} strokeWidth={2} />
                      })
                  })()}
                  {/* Node */}
                  <circle
                    cx={node.col * COL_WIDTH + COL_WIDTH / 2}
                    cy={ROW_HEIGHT / 2}
                    r={c.parents.length > 1 ? NODE_RADIUS + 1 : NODE_RADIUS}
                    fill={head ? '#0d1117' : node.color}
                    stroke={node.color}
                    strokeWidth={2}
                  />
                </svg>

                {/* Commit info */}
                <div className="flex items-center gap-2 flex-1 min-w-0 pr-3">
                  {/* Refs */}
                  {branches.map((b) => (
                    <span key={b} className="shrink-0 text-2xs px-1.5 py-0.5 rounded bg-accent/15 text-accent font-medium truncate max-w-24">
                      {b}
                    </span>
                  ))}
                  {tags.map((t) => (
                    <span key={t} className="shrink-0 flex items-center gap-0.5 text-2xs px-1.5 py-0.5 rounded bg-yellow-500/15 text-yellow-400 font-medium">
                      <VscTag size={10} />{t}
                    </span>
                  ))}
                  {/* Message */}
                  <span className="text-xs text-text-primary truncate flex-1">{c.message}</span>
                  {/* Author + time */}
                  <span className="text-2xs text-text-muted shrink-0 ml-2">{c.author}</span>
                  <span className="text-2xs text-text-muted shrink-0 w-14 text-right">{timeAgo(c.date)}</span>
                </div>
              </div>
            )
          })}
        </div>

        {/* Commit detail panel */}
        {selectedCommit && (
          <div className="w-72 border-l border-border flex flex-col overflow-hidden shrink-0">
            <div className="flex items-center justify-between px-3 py-2 border-b border-border">
              <span className="text-xs font-semibold text-text-secondary">Commit Detail</span>
              <button
                className="p-0.5 hover:bg-surface-2 rounded"
                onClick={() => selectCommit(cwd, null)}
              >
                <VscClose size={12} />
              </button>
            </div>
            <div className="px-3 py-2 border-b border-border space-y-1">
              <div className="text-xs text-text-primary font-medium">{selectedCommit.message}</div>
              <div className="text-2xs text-text-muted">{selectedCommit.author} &lt;{selectedCommit.email}&gt;</div>
              <div className="text-2xs text-text-muted">{new Date(selectedCommit.date).toLocaleString()}</div>
              <div className="text-2xs font-mono text-text-muted">{selectedCommit.shortHash}</div>
            </div>
            <div className="px-3 py-1.5 border-b border-border">
              <button
                className="text-2xs text-accent hover:text-accent-hover"
                onClick={() => viewCommitDiff(cwd, selectedCommit.hash)}
              >
                View full diff
              </button>
            </div>
            <div className="flex-1 overflow-y-auto">
              <div className="px-3 py-1 text-2xs text-text-muted uppercase tracking-wider">
                Changed files ({selectedCommitFiles.length})
              </div>
              {selectedCommitFiles.map((f) => {
                const Icon = STATUS_ICONS[f.status] || VscGitMerge
                const color = STATUS_COLORS[f.status] || 'text-text-muted'
                return (
                  <div key={f.path} className="flex items-center gap-1.5 px-3 py-1 text-xs text-text-secondary hover:bg-surface-2">
                    <Icon size={12} className={color} />
                    <span className="truncate">{f.path}</span>
                  </div>
                )
              })}
            </div>
            {/* Diff preview */}
            {diffContent && (
              <div className="border-t border-border max-h-48 overflow-y-auto">
                <pre className="p-2 text-2xs font-mono whitespace-pre-wrap break-all">
                  {diffContent.split('\n').map((line, i) => (
                    <div
                      key={i}
                      className={
                        line.startsWith('+') && !line.startsWith('+++') ? 'text-green-400 bg-green-400/5' :
                        line.startsWith('-') && !line.startsWith('---') ? 'text-red-400 bg-red-400/5' :
                        line.startsWith('@@') ? 'text-blue-400' :
                        'text-text-muted'
                      }
                    >
                      {line}
                    </div>
                  ))}
                </pre>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  )
}

const STATUS_ICONS: Record<string, any> = {
  M: VscGitMerge,
  A: VscGitMerge,
  D: VscGitMerge,
}

const STATUS_COLORS: Record<string, string> = {
  M: 'text-yellow-400',
  A: 'text-green-400',
  D: 'text-red-400',
}
