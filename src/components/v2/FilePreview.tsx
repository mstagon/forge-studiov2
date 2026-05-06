// File preview — when a file is clicked in the Workspace tree (Preview / Diff / Blame tabs)

import { useState } from 'react'
// TODO: foundation import — provided by main session
import { Icon } from './icons'
import { Pill, AgentBadge } from './primitives'

type Lang = 'dart' | 'yaml' | 'markdown'

interface GitMeta {
  branch: string
  changes: string
  agent: string | null
}

interface FileContent {
  lang: Lang
  path: string
  lines: string[]
  highlight: Record<number, '+' | '-'>
  git: GitMeta
  harness?: boolean
}

const FILE_CONTENTS: Record<string, FileContent> = {
  'main.dart': {
    lang: 'dart',
    path: 'lib/main.dart',
    lines: [
      "import 'package:flutter/material.dart';",
      "import 'package:flutter_riverpod/flutter_riverpod.dart';",
      '',
      "import 'app/router.dart';",
      "import 'theme/forge_theme.dart';",
      '',
      'void main() {',
      '  runApp(const ProviderScope(child: ForgeApp()));',
      '}',
      '',
      'class ForgeApp extends ConsumerWidget {',
      '  const ForgeApp({super.key});',
      '',
      '  @override',
      '  Widget build(BuildContext context, WidgetRef ref) {',
      '    final router = ref.watch(routerProvider);',
      '    return MaterialApp.router(',
      "      title: 'Forge',",
      '      theme: forgeTheme,',
      '      routerConfig: router,',
      '    );',
      '  }',
      '}',
    ],
    highlight: { 17: '+', 18: '+', 19: '+' },
    git: { branch: 'feature/auth-flow', changes: '+3 / -1', agent: 'flutter-ui' },
  },
  'pubspec.yaml': {
    lang: 'yaml',
    path: 'pubspec.yaml',
    lines: [
      'name: forge_app',
      'description: Forge — multi-agent coding harness',
      "publish_to: 'none'",
      '',
      'environment:',
      "  sdk: '>=3.2.0 <4.0.0'",
      "  flutter: '>=3.16.0'",
      '',
      'dependencies:',
      '  flutter:',
      '    sdk: flutter',
      '  flutter_riverpod: ^2.4.9',
      '  go_router: ^13.0.0',
      '  freezed_annotation: ^2.4.1',
      '',
      'dev_dependencies:',
      '  build_runner: ^2.4.7',
      '  freezed: ^2.4.5',
    ],
    highlight: { 13: '+', 14: '+' },
    git: { branch: 'feature/auth-flow', changes: '+2 / 0', agent: 'flutter-ui' },
  },
  'CLAUDE.md': {
    lang: 'markdown',
    path: 'CLAUDE.md',
    harness: true,
    lines: [
      '# Forge — Project guide',
      '',
      '## Stack',
      '- Flutter 3.16 + Riverpod + go_router',
      '- NestJS backend with Prisma + Postgres',
      '',
      '## Conventions',
      '- All UI strings go through `intl` ARB.',
      '- Backend modules export a `*.module.ts` barrel only.',
      '- DB migrations are reviewed by `prisma` agent before apply.',
      '',
      '## Active agents (default roster)',
      '- flutter-ui    — Frontend',
      '- nestjs-auth   — Backend',
      '- prisma        — Database',
      '- qa-runner     — Tests',
      '- reviewer      — Gate before merge',
      '',
      '## Skill files',
      '- ./.forge/skills/flutter-widgets.md',
      '- ./.forge/skills/nestjs-modules.md',
      '- ./.forge/skills/prisma-schema.md',
    ],
    highlight: {},
    git: { branch: 'main', changes: 'clean', agent: null },
  },
  'README.md': {
    lang: 'markdown',
    path: 'README.md',
    lines: [
      '# Forge App',
      '',
      'Multi-agent coding harness running in worktree-isolated PTYs.',
      '',
      '## Quickstart',
      '',
      '```bash',
      'pnpm install',
      'pnpm dev',
      '```',
      '',
      '## Documentation',
      '',
      'See `docs/` for architecture decision records and runbooks.',
    ],
    highlight: {},
    git: { branch: 'main', changes: 'clean', agent: null },
  },
}

export interface FilePreviewProps {
  filename: string
  /** When set, renders the actual file text instead of the seed sample. The
   *  filename still drives header chrome (path / git meta), but the body
   *  becomes a line-numbered, mono-font dump of `content`. Falls back to the
   *  curated seed map when omitted. */
  content?: string
  /** Indicates the content was clipped due to size cap — appended a footer
   *  marker so users know they're not seeing the whole file. */
  truncated?: boolean
  onClose: () => void
}

type PreviewTab = 'preview' | 'diff' | 'blame'

/** Pick a syntax-highlight language from a filename extension. */
function langFromName(name: string): Lang {
  const lower = name.toLowerCase()
  if (lower.endsWith('.dart')) return 'dart'
  if (lower.endsWith('.yaml') || lower.endsWith('.yml')) return 'yaml'
  if (lower.endsWith('.md') || lower.endsWith('.markdown')) return 'markdown'
  return 'markdown'
}

export function FilePreview({ filename, content, truncated, onClose }: FilePreviewProps) {
  const seed = FILE_CONTENTS[filename] ?? FILE_CONTENTS['main.dart']
  // If real content was passed, build a synthetic FileContent with no diff
  // highlight (we don't know git delta from the renderer side yet).
  const file: FileContent =
    content !== undefined
      ? {
          lang: langFromName(filename),
          path: filename,
          lines: content.split('\n'),
          highlight: {},
          git: { branch: '—', changes: 'clean', agent: null },
        }
      : seed
  const [tab, setTab] = useState<PreviewTab>('preview')
  return (
    <div
      style={{
        flex: 1,
        display: 'flex',
        flexDirection: 'column',
        minWidth: 0,
        background: '#06080b',
        overflow: 'hidden',
      }}
    >
      {/* file tab strip */}
      <div
        className="ns"
        style={{
          height: 30,
          flexShrink: 0,
          background: 'var(--bg-1)',
          borderBottom: '1px solid var(--line-1)',
          display: 'flex',
          alignItems: 'stretch',
          paddingLeft: 6,
        }}
      >
        <div
          style={{
            padding: '0 14px',
            display: 'inline-flex',
            alignItems: 'center',
            gap: 8,
            background: '#06080b',
            borderTop: '2px solid var(--accent)',
            borderRight: '1px solid var(--line-1)',
            color: 'var(--text-1)',
            fontSize: 11.5,
            fontFamily: 'var(--font-mono)',
          }}
        >
          <Icon.File size={11} style={{ color: 'var(--text-3)' }} />
          {file.path}
          {file.harness && (
            <Pill color="var(--accent)" style={{ height: 14, fontSize: 9 }}>
              HARNESS
            </Pill>
          )}
          <button
            onClick={onClose}
            style={{
              background: 'transparent',
              border: 'none',
              color: 'var(--text-3)',
              marginLeft: 6,
              cursor: 'pointer',
            }}
          >
            <Icon.X size={11} />
          </button>
        </div>
        <div style={{ flex: 1 }} />
        <div style={{ display: 'flex', alignItems: 'center', gap: 4, padding: '0 8px' }}>
          {(
            [
              { id: 'preview', label: 'Preview' },
              { id: 'diff', label: 'Diff' },
              { id: 'blame', label: 'Blame' },
            ] as { id: PreviewTab; label: string }[]
          ).map((t) => {
            const a = tab === t.id
            return (
              <button
                key={t.id}
                onClick={() => setTab(t.id)}
                style={{
                  height: 22,
                  padding: '0 10px',
                  borderRadius: 4,
                  background: a ? 'var(--bg-3)' : 'transparent',
                  border: `1px solid ${a ? 'var(--line-3)' : 'transparent'}`,
                  color: a ? 'var(--text-1)' : 'var(--text-3)',
                  fontSize: 11.5,
                  fontWeight: a ? 600 : 500,
                  fontFamily: 'var(--font-mono)',
                  cursor: 'pointer',
                }}
              >
                {t.label}
              </button>
            )
          })}
        </div>
      </div>

      {/* file meta strip */}
      <div
        className="ns mono"
        style={{
          height: 24,
          flexShrink: 0,
          padding: '0 14px',
          borderBottom: '1px solid var(--line-1)',
          background: 'var(--bg-1)',
          display: 'flex',
          alignItems: 'center',
          gap: 14,
          fontSize: 10.5,
          color: 'var(--text-3)',
        }}
      >
        <span>
          <Icon.Branch size={10} style={{ verticalAlign: -1, marginRight: 4 }} />
          {file.git.branch}
        </span>
        <span style={{ color: file.git.changes === 'clean' ? 'var(--text-4)' : 'var(--success)' }}>
          {file.git.changes}
        </span>
        {file.git.agent && (
          <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}>
            <span style={{ color: 'var(--text-4)' }}>편집중:</span>
            <AgentBadge agentId={file.git.agent} size={14} />
            <span>{file.git.agent}</span>
          </span>
        )}
        <div style={{ flex: 1 }} />
        <span>
          {file.lines.length} lines · {file.lang}
        </span>
      </div>

      {/* code */}
      <div style={{ flex: 1, overflow: 'auto', padding: '10px 0' }}>
        <pre style={{ margin: 0, fontFamily: 'var(--font-mono)', fontSize: 12.5, lineHeight: 1.55 }}>
          {file.lines.map((ln, i) => {
            const lineNum = i + 1
            const hl = file.highlight[lineNum]
            const bg =
              hl === '+'
                ? 'color-mix(in oklab, var(--success) 12%, transparent)'
                : hl === '-'
                  ? 'color-mix(in oklab, var(--danger) 12%, transparent)'
                  : 'transparent'
            return (
              <div
                key={i}
                style={{
                  display: 'grid',
                  gridTemplateColumns: '44px 14px 1fr',
                  background: bg,
                  padding: '0 14px',
                  minHeight: 19,
                }}
              >
                <span
                  style={{
                    color: 'var(--text-4)',
                    textAlign: 'right',
                    paddingRight: 10,
                    userSelect: 'none',
                  }}
                >
                  {lineNum}
                </span>
                <span
                  style={{
                    color:
                      hl === '+' ? 'var(--success)' : hl === '-' ? 'var(--danger)' : 'transparent',
                    textAlign: 'center',
                    userSelect: 'none',
                  }}
                >
                  {hl || ''}
                </span>
                <span style={{ color: 'var(--text-2)' }}>
                  <Highlight code={ln} lang={file.lang} />
                </span>
              </div>
            )
          })}
          {truncated && (
            <div
              style={{
                padding: '8px 14px',
                fontSize: 11,
                color: 'var(--warning)',
                fontFamily: 'var(--font-mono)',
              }}
            >
              … truncated (file exceeded preview size cap)
            </div>
          )}
        </pre>
      </div>
    </div>
  )
}

// Tiny syntax highlighter — keyword-list colorizer per language
interface HlRules {
  kw: RegExp | null
  str: RegExp | null
  num: RegExp | null
  type: RegExp | null
}

const HL_RULES: Record<Lang, HlRules> = {
  dart: {
    kw: /\b(import|class|extends|return|final|const|void|var|if|else|for|in|new|super|this|override)\b/g,
    str: /'[^']*'|"[^"]*"/g,
    num: /\b\d+(\.\d+)?\b/g,
    type: /\b(Widget|BuildContext|String|int|double|bool)\b/g,
  },
  yaml: {
    kw: /^[\s-]*[\w\-]+(?=:)/gm,
    str: /'[^']*'|"[^"]*"/g,
    num: /\b\d+(\.\d+)?\b/g,
    type: null,
  },
  markdown: {
    kw: /^#{1,6} .*$/gm,
    str: /`[^`]+`/g,
    num: null,
    type: /^- /gm,
  },
}

interface HighlightProps {
  code: string
  lang: Lang
}

function Highlight({ code, lang }: HighlightProps) {
  const rules = HL_RULES[lang] ?? HL_RULES.dart
  const ranges: { s: number; e: number; cls: 'str' | 'kw' | 'type' | 'num' }[] = []
  const apply = (re: RegExp | null, cls: 'str' | 'kw' | 'type' | 'num') => {
    if (!re) return
    re.lastIndex = 0
    let m: RegExpExecArray | null
    while ((m = re.exec(code))) {
      ranges.push({ s: m.index, e: m.index + m[0].length, cls })
      if (re.lastIndex === m.index) re.lastIndex++
    }
  }
  apply(rules.str, 'str')
  apply(rules.kw, 'kw')
  apply(rules.type, 'type')
  apply(rules.num, 'num')
  ranges.sort((a, b) => a.s - b.s)
  const merged: typeof ranges = []
  for (const r of ranges) {
    if (merged.length && r.s < merged[merged.length - 1].e) continue
    merged.push(r)
  }
  let pos = 0
  const out: React.ReactNode[] = []
  for (const r of merged) {
    if (r.s > pos) out.push(<span key={`p-${pos}`}>{code.slice(pos, r.s)}</span>)
    const color =
      r.cls === 'kw'
        ? '#ff8758'
        : r.cls === 'str'
          ? '#a3e635'
          : r.cls === 'type'
            ? '#7eb6fc'
            : r.cls === 'num'
              ? '#facc15'
              : 'var(--text-2)'
    out.push(
      <span key={`r-${r.s}`} style={{ color }}>
        {code.slice(r.s, r.e)}
      </span>,
    )
    pos = r.e
  }
  if (pos < code.length) out.push(<span key={`t-${pos}`}>{code.slice(pos)}</span>)
  return <>{out}</>
}
