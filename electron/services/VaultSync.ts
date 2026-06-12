import path from 'path'
import fs from 'fs/promises'
import { loadForgeConfig } from './ForgeConfig.ts'

/**
 * VaultSync — Forge 산출물 (Gauntlet 리포트 / 아침 브리핑 / 팀 완료 요약) 을
 * Obsidian 볼트에 markdown 으로 미러 (v0.19).
 *
 * ForgeConfig.obsidianVaultPath 가 설정돼 있으면 `<vault>/Forge/<workspace>/`
 * 아래에 frontmatter (tags/date/verdict) + [[wikilink]] 를 붙여 쓴다 — Obsidian
 * 그래프/검색/백링크가 바로 동작. 설정 안 됐으면 전부 no-op (조용히 통과).
 *
 * electron-free + 동기 config 로드. 실패는 항상 non-fatal (볼트는 부가 기능).
 */

export interface VaultNote {
  /** 볼트 내 상대 폴더 (Forge/<workspace>/ 아래). 예: "gauntlet", "briefing". */
  category: string
  /** 파일명 (확장자 없이). */
  slug: string
  /** frontmatter tags (forge/ prefix 자동). */
  tags?: string[]
  /** frontmatter 추가 키. */
  meta?: Record<string, string | number | boolean>
  /** markdown 본문. */
  body: string
}

function sanitizeSegment(s: string): string {
  return s.replace(/[^A-Za-z0-9._가-힣-]/g, '-').replace(/-+/g, '-').replace(/^-|-$/g, '') || 'untitled'
}

function frontmatter(tags: string[], meta: Record<string, string | number | boolean>): string {
  const lines = ['---']
  lines.push('tags:')
  for (const t of tags) lines.push(`  - ${t}`)
  for (const [k, v] of Object.entries(meta)) {
    lines.push(`${k}: ${typeof v === 'string' ? JSON.stringify(v) : v}`)
  }
  lines.push('---')
  return lines.join('\n')
}

/**
 * 노트 한 장을 볼트에 쓴다. 반환: 쓰여진 절대 경로 또는 null (볼트 미설정/실패).
 * workspaceName 은 볼트 내 폴더 스코프 (워크스페이스별 분리).
 */
export async function syncNote(workspaceName: string, note: VaultNote): Promise<string | null> {
  const cfg = loadForgeConfig()
  const vault = cfg.obsidianVaultPath?.trim()
  if (!vault) return null
  try {
    const dir = path.join(vault, 'Forge', sanitizeSegment(workspaceName), sanitizeSegment(note.category))
    await fs.mkdir(dir, { recursive: true })
    const tags = ['forge', `forge/${note.category}`, ...(note.tags ?? [])]
    const fm = frontmatter(tags, { date: new Date().toISOString(), ...(note.meta ?? {}) })
    const file = path.join(dir, `${sanitizeSegment(note.slug)}.md`)
    await fs.writeFile(file, `${fm}\n\n${note.body}\n`, 'utf-8')
    return file
  } catch {
    return null // 볼트 경로 오류 등 — non-fatal
  }
}

/** 볼트 설정 여부 (UI/진단용). */
export function vaultEnabled(): boolean {
  return !!loadForgeConfig().obsidianVaultPath?.trim()
}
