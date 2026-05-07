/**
 * Library data — Compositions / Agents / Skills / Commands / Hooks pools.
 *
 * Source: design handoff at /tmp/forge_design/forge/project/src/library_data.jsx
 * + composition seed from library.jsx.
 *
 * NOTE: these are seed values. Once the harness file system layer lands,
 * resolvers should hydrate from .claude/agents, .claude/skills, .claude/commands,
 * and .claude/settings.json hooks, plus the team registry.
 */

export type Owner = 'team' | 'you' | 'system'

export interface CompositionSeed {
  id: string
  name: string
  desc: string
  /** AGENTS_LIB ids in roster order */
  members: string[]
  runs: number
  lastUsed: string
  featured?: boolean
  owner: Owner
}

export interface LibAgent {
  id: string
  name: string
  role: string
  /** CSS color expression (var(--role-*) or literal) */
  color: string
  desc: string
  skills: string[]
  hooks: string[]
  runs: number
  lastUsed: string
  model: string
  effort: 'low' | 'medium' | 'high'
  cmdAllow: string[]
  cmdDeny: string[]
  owner: Owner
}

export interface LibSkill {
  id: string
  name: string
  desc: string
  type: 'skill'
  lines: number
  used: number
  agents: string[]
  owner: Owner
  lastUsed: string
}

export interface LibCommand {
  id: string
  name: string
  desc: string
  args: string
  builtin: boolean
  uses: number
  owner: Owner
}

export type HookTrigger =
  | 'pre-write'
  | 'post-write'
  | 'pre-tool-use'
  | 'pre-merge'
  | 'test-failure'

export interface LibHook {
  id: string
  name: string
  trigger: HookTrigger
  desc: string
  enabled: boolean
  fires: number
  lastFire: string
  agents: string[]
  owner: Owner
  script: string
}

// ─── Compositions ──────────────────────────────────────────────────

export const COMPOSITIONS: CompositionSeed[] = [
  {
    id: 'c-01',
    name: 'Full-Stack Sprint',
    desc: '프론트 + 백엔드 + DB + 테스트 + 리뷰까지 한 번에 돌리는 표준 5인 구성.',
    members: ['flutter-ui', 'nestjs-auth', 'prisma', 'qa-runner', 'reviewer'],
    runs: 24,
    lastUsed: '2일 전',
    featured: true,
    owner: 'team',
  },
  {
    id: 'c-02',
    name: 'Auth Feature Trio',
    desc: '인증/세션/JWT 작업에 최적화. UI + 백엔드 + 시큐리티 리뷰.',
    members: ['flutter-ui', 'nestjs-auth', 'reviewer'],
    runs: 17,
    lastUsed: '어제',
    owner: 'team',
  },
  {
    id: 'c-03',
    name: 'Schema Migration',
    desc: 'Prisma 스키마 변경 → 마이그레이션 → 백엔드 리팩터 → 회귀 테스트.',
    members: ['prisma', 'nestjs-auth', 'qa-runner'],
    runs: 9,
    lastUsed: '1주 전',
    owner: 'you',
  },
  {
    id: 'c-04',
    name: 'UI Polish Pass',
    desc: '디자인 토큰/스페이싱/접근성 정리. 단독 또는 PR 직전 사용.',
    members: ['flutter-ui', 'designer', 'reviewer'],
    runs: 12,
    lastUsed: '3일 전',
    owner: 'you',
  },
  {
    id: 'c-05',
    name: 'Bug Hunt',
    desc: '재현 → 원인 분석 → 패치 → 회귀 테스트. 인시던트 대응에.',
    members: ['architect', 'nestjs-auth', 'qa-runner'],
    runs: 6,
    lastUsed: '5일 전',
    owner: 'team',
  },
  {
    id: 'c-06',
    name: 'Docs & ADR',
    desc: '구조 변경 후 문서/ADR 동기화. 짧고 빠르게.',
    members: ['architect', 'doc-writer'],
    runs: 31,
    lastUsed: '오늘',
    owner: 'team',
  },
  {
    id: 'c-07',
    name: 'Infra Touchup',
    desc: 'Dockerfile/CI/배포 설정. 한 명이 짚고 리뷰어가 검토.',
    members: ['infra', 'reviewer'],
    runs: 4,
    lastUsed: '2주 전',
    owner: 'you',
  },
  {
    id: 'c-08',
    name: 'Solo Refactor',
    desc: '한 명에게 좁은 범위만. 사이드 이펙트 추적용.',
    members: ['reviewer'],
    runs: 8,
    lastUsed: '어제',
    owner: 'you',
  },
]

// ─── Agents ────────────────────────────────────────────────────────

export const AGENTS_LIB: LibAgent[] = [
  {
    id: 'flutter-ui',
    name: 'flutter-ui',
    role: 'Frontend · Flutter',
    color: 'var(--role-fe)',
    desc: 'Flutter 위젯/화면/상태관리. shadcn-flutter + riverpod 패턴.',
    skills: ['flutter-widgets', 'riverpod', 'i18n', 'responsive-layout'],
    hooks: ['pre-write-format'],
    runs: 62,
    lastUsed: '오늘',
    model: 'sonnet-4.5',
    effort: 'high',
    cmdAllow: ['dart format', 'dart analyze', 'flutter test'],
    cmdDeny: ['rm -rf', 'git push'],
    owner: 'team',
  },
  {
    id: 'nestjs-auth',
    name: 'nestjs-auth',
    role: 'Backend · NestJS',
    color: 'var(--role-be)',
    desc: 'NestJS 모듈/가드/인터셉터. JWT/세션/RBAC. e2e 작성.',
    skills: ['nestjs-modules', 'jwt-session', 'openapi-gen', 'e2e-test'],
    hooks: ['pre-write-format', 'post-write-test'],
    runs: 58,
    lastUsed: '어제',
    model: 'sonnet-4.5',
    effort: 'high',
    cmdAllow: ['pnpm test', 'pnpm lint'],
    cmdDeny: ['rm -rf'],
    owner: 'team',
  },
  {
    id: 'prisma',
    name: 'prisma',
    role: 'Database · Prisma',
    color: 'var(--role-db)',
    desc: 'Prisma 스키마, 마이그레이션, 시드. 안전한 변경 전략.',
    skills: ['prisma-schema', 'migrate-up-down', 'seed-fixtures'],
    hooks: ['confirm-destructive'],
    runs: 41,
    lastUsed: '2일 전',
    model: 'sonnet-4.5',
    effort: 'medium',
    cmdAllow: ['prisma migrate', 'prisma generate'],
    cmdDeny: ['prisma migrate reset'],
    owner: 'team',
  },
  {
    id: 'qa-runner',
    name: 'qa-runner',
    role: 'QA · Test runner',
    color: 'var(--role-test)',
    desc: '회귀 테스트, 플레이라이트, 커버리지 게이트.',
    skills: ['playwright-e2e', 'vitest-unit', 'coverage-gate'],
    hooks: ['fail-fast'],
    runs: 33,
    lastUsed: '오늘',
    model: 'sonnet-4.5',
    effort: 'medium',
    cmdAllow: ['pnpm test', 'playwright test'],
    cmdDeny: [],
    owner: 'team',
  },
  {
    id: 'reviewer',
    name: 'reviewer',
    role: 'Code Review',
    color: 'var(--role-review)',
    desc: 'PR 분석, 보안/성능/스타일. 머지 전 게이트.',
    skills: ['security-review', 'perf-review', 'style-guide'],
    hooks: ['block-merge-on-fail'],
    runs: 47,
    lastUsed: '어제',
    model: 'opus-4',
    effort: 'high',
    cmdAllow: ['git diff', 'git log'],
    cmdDeny: ['git push'],
    owner: 'team',
  },
  {
    id: 'architect',
    name: 'architect',
    role: 'Architecture',
    color: 'var(--role-arch)',
    desc: '시스템 다이어그램, ADR, 마이그레이션 플랜.',
    skills: ['adr-writing', 'system-mapping', 'tradeoff-analysis'],
    hooks: [],
    runs: 19,
    lastUsed: '1주 전',
    model: 'opus-4',
    effort: 'high',
    cmdAllow: ['git log'],
    cmdDeny: [],
    owner: 'team',
  },
  {
    id: 'infra',
    name: 'infra',
    role: 'Infra · DevOps',
    color: 'var(--role-infra)',
    desc: 'Dockerfile, CI, 배포. 변경 영향 최소화.',
    skills: ['dockerfile', 'github-actions', 'k8s-manifest'],
    hooks: ['dryrun-first'],
    runs: 14,
    lastUsed: '3일 전',
    model: 'sonnet-4.5',
    effort: 'medium',
    cmdAllow: ['docker build', 'kubectl diff'],
    cmdDeny: ['kubectl apply'],
    owner: 'team',
  },
  {
    id: 'doc-writer',
    name: 'doc-writer',
    role: 'Docs',
    color: 'var(--role-doc)',
    desc: 'README, ADR, 변경 노트. 톤앤매너 일관.',
    skills: ['adr-writing', 'release-notes'],
    hooks: [],
    runs: 27,
    lastUsed: '오늘',
    model: 'haiku-4.5',
    effort: 'medium',
    cmdAllow: [],
    cmdDeny: [],
    owner: 'team',
  },
  {
    id: 'designer',
    name: 'designer',
    role: 'Design tokens',
    color: '#f0abfc',
    desc: '토큰/스페이싱/접근성. shadcn 매핑.',
    skills: ['design-tokens', 'a11y-audit'],
    hooks: [],
    runs: 11,
    lastUsed: '어제',
    model: 'sonnet-4.5',
    effort: 'medium',
    cmdAllow: [],
    cmdDeny: [],
    owner: 'you',
  },
]

// ─── Skills ────────────────────────────────────────────────────────

export const SKILLS_LIB: LibSkill[] = [
  { id: 'flutter-widgets',   name: 'flutter-widgets',   desc: 'shadcn-flutter 위젯 라이브러리 매핑/생성',   type: 'skill', lines: 142, used: 38, agents: ['flutter-ui'],                 owner: 'team', lastUsed: '오늘' },
  { id: 'riverpod',          name: 'riverpod',          desc: 'Riverpod provider 컨벤션, AsyncValue 패턴', type: 'skill', lines: 96,  used: 34, agents: ['flutter-ui'],                 owner: 'team', lastUsed: '오늘' },
  { id: 'i18n',              name: 'i18n',              desc: 'intl ARB 키 추가/번역 동기화',              type: 'skill', lines: 64,  used: 18, agents: ['flutter-ui'],                 owner: 'team', lastUsed: '어제' },
  { id: 'responsive-layout', name: 'responsive-layout', desc: '반응형 LayoutBuilder + breakpoint 토큰',    type: 'skill', lines: 78,  used: 22, agents: ['flutter-ui'],                 owner: 'team', lastUsed: '2일 전' },
  { id: 'nestjs-modules',    name: 'nestjs-modules',    desc: 'NestJS 모듈 스캐폴딩 + DI 컨벤션',          type: 'skill', lines: 110, used: 31, agents: ['nestjs-auth'],                owner: 'team', lastUsed: '오늘' },
  { id: 'jwt-session',       name: 'jwt-session',       desc: 'JWT 발급/검증, refresh rotation',           type: 'skill', lines: 88,  used: 19, agents: ['nestjs-auth'],                owner: 'team', lastUsed: '어제' },
  { id: 'openapi-gen',       name: 'openapi-gen',       desc: 'Nest → OpenAPI 자동 동기화',                type: 'skill', lines: 52,  used: 14, agents: ['nestjs-auth'],                owner: 'team', lastUsed: '1주 전' },
  { id: 'e2e-test',          name: 'e2e-test',          desc: 'Supertest + factory + DB 트랜잭션 격리',    type: 'skill', lines: 124, used: 26, agents: ['nestjs-auth', 'qa-runner'],   owner: 'team', lastUsed: '오늘' },
  { id: 'prisma-schema',     name: 'prisma-schema',     desc: '관계/인덱스/제약 베스트 프랙티스',          type: 'skill', lines: 92,  used: 21, agents: ['prisma'],                     owner: 'team', lastUsed: '어제' },
  { id: 'migrate-up-down',   name: 'migrate-up-down',   desc: '마이그레이션 안전 작성, rollback',          type: 'skill', lines: 71,  used: 9,  agents: ['prisma'],                     owner: 'team', lastUsed: '3일 전' },
  { id: 'seed-fixtures',     name: 'seed-fixtures',     desc: '재현 가능한 seed + factory',                type: 'skill', lines: 58,  used: 12, agents: ['prisma'],                     owner: 'team', lastUsed: '1주 전' },
  { id: 'playwright-e2e',    name: 'playwright-e2e',    desc: 'Playwright 셀렉터 + 페이지 객체',           type: 'skill', lines: 134, used: 28, agents: ['qa-runner'],                  owner: 'team', lastUsed: '오늘' },
  { id: 'vitest-unit',       name: 'vitest-unit',       desc: 'Vitest + msw 모킹, fast feedback',          type: 'skill', lines: 102, used: 24, agents: ['qa-runner'],                  owner: 'team', lastUsed: '어제' },
  { id: 'coverage-gate',     name: 'coverage-gate',     desc: '라인/브랜치 커버리지 임계치 검사',          type: 'skill', lines: 41,  used: 15, agents: ['qa-runner', 'reviewer'],      owner: 'team', lastUsed: '어제' },
  { id: 'security-review',   name: 'security-review',   desc: 'OWASP top10, 인증/세션/권한 점검',          type: 'skill', lines: 156, used: 32, agents: ['reviewer'],                   owner: 'team', lastUsed: '오늘' },
  { id: 'perf-review',       name: 'perf-review',       desc: 'N+1, 메모리, 렌더 성능 점검',               type: 'skill', lines: 118, used: 17, agents: ['reviewer'],                   owner: 'team', lastUsed: '2일 전' },
  { id: 'style-guide',       name: 'style-guide',       desc: '프로젝트 코딩 스타일 + 자동 적용',          type: 'skill', lines: 67,  used: 23, agents: ['reviewer'],                   owner: 'team', lastUsed: '오늘' },
  { id: 'adr-writing',       name: 'adr-writing',       desc: 'ADR 템플릿, 결정/대안/결과',                type: 'skill', lines: 49,  used: 11, agents: ['architect', 'doc-writer'],    owner: 'team', lastUsed: '1주 전' },
  { id: 'system-mapping',    name: 'system-mapping',    desc: '시스템 컴포넌트/의존성 다이어그램',         type: 'skill', lines: 73,  used: 6,  agents: ['architect'],                  owner: 'team', lastUsed: '2주 전' },
  { id: 'tradeoff-analysis', name: 'tradeoff-analysis', desc: '옵션 비교 매트릭스, 점수화',                type: 'skill', lines: 54,  used: 8,  agents: ['architect'],                  owner: 'team', lastUsed: '1주 전' },
  { id: 'release-notes',     name: 'release-notes',     desc: 'PR 묶음 → 릴리즈 노트 생성',                type: 'skill', lines: 38,  used: 19, agents: ['doc-writer'],                 owner: 'team', lastUsed: '어제' },
  { id: 'design-tokens',     name: 'design-tokens',     desc: '토큰 스키마, Figma → 코드 동기화',          type: 'skill', lines: 86,  used: 13, agents: ['designer'],                   owner: 'you',  lastUsed: '어제' },
  { id: 'a11y-audit',        name: 'a11y-audit',        desc: '키보드/포커스/대비/스크린리더',             type: 'skill', lines: 92,  used: 9,  agents: ['designer'],                   owner: 'you',  lastUsed: '3일 전' },
  { id: 'dockerfile',        name: 'dockerfile',        desc: '멀티스테이지 빌드, 캐시 최적화',            type: 'skill', lines: 64,  used: 7,  agents: ['infra'],                      owner: 'team', lastUsed: '1주 전' },
]

// ─── Commands ──────────────────────────────────────────────────────

export const COMMANDS_LIB: LibCommand[] = [
  { id: 'clear',    name: '/clear',    desc: '현재 컨텍스트 초기화',           args: '',                   builtin: true,  uses: 412, owner: 'system' },
  { id: 'compact',  name: '/compact',  desc: '대화 요약하여 토큰 절감',        args: '[focus?]',           builtin: true,  uses: 287, owner: 'system' },
  { id: 'cost',     name: '/cost',     desc: '현재 세션 토큰/비용',            args: '',                   builtin: true,  uses: 198, owner: 'system' },
  { id: 'model',    name: '/model',    desc: '모델 변경',                      args: '<sonnet|opus|haiku>', builtin: true,  uses: 156, owner: 'system' },
  { id: 'review',   name: '/review',   desc: '현재 변경사항 코드 리뷰 트리거', args: '[--strict]',         builtin: false, uses: 89,  owner: 'team' },
  { id: 'ship',     name: '/ship',     desc: '린트→테스트→푸시→PR 생성 일괄',  args: '[--draft]',          builtin: false, uses: 64,  owner: 'team' },
  { id: 'rollback', name: '/rollback', desc: '마지막 머지 되돌리기',           args: '[--commits=N]',      builtin: false, uses: 12,  owner: 'team' },
  { id: 'spec',     name: '/spec',     desc: '현재 작업의 스펙 문서 생성',     args: '<title>',            builtin: false, uses: 31,  owner: 'you' },
  { id: 'explain',  name: '/explain',  desc: '선택된 파일/함수 설명 생성',     args: '[--detail=high]',    builtin: false, uses: 73,  owner: 'you' },
  { id: 'tests',    name: '/tests',    desc: '현재 변경사항 대상 테스트 생성', args: '[--coverage]',       builtin: false, uses: 48,  owner: 'team' },
  { id: 'adr',      name: '/adr',      desc: 'ADR 초안 생성',                  args: '<decision>',         builtin: false, uses: 19,  owner: 'team' },
  { id: 'diagram',  name: '/diagram',  desc: 'Mermaid 다이어그램 생성',        args: '<scope>',            builtin: false, uses: 22,  owner: 'you' },
]

// ─── Hooks ─────────────────────────────────────────────────────────

export const HOOKS_LIB: LibHook[] = [
  {
    id: 'pre-write-format',
    name: 'pre-write-format',
    trigger: 'pre-write',
    desc: '쓰기 전에 dart format / prettier 자동 적용',
    enabled: true,
    fires: 1284,
    lastFire: '2분 전',
    agents: ['flutter-ui', 'nestjs-auth'],
    owner: 'team',
    script: 'dart format --set-exit-if-changed $FILE\nprettier --write $FILE',
  },
  {
    id: 'post-write-test',
    name: 'post-write-test',
    trigger: 'post-write',
    desc: '쓰기 후 해당 파일 테스트만 즉시 실행',
    enabled: true,
    fires: 612,
    lastFire: '5분 전',
    agents: ['nestjs-auth'],
    owner: 'team',
    script: 'pnpm vitest run $(dirname $FILE)',
  },
  {
    id: 'confirm-destructive',
    name: 'confirm-destructive',
    trigger: 'pre-tool-use',
    desc: 'rm -rf / migrate reset 같은 파괴적 명령 사용자 확인',
    enabled: true,
    fires: 14,
    lastFire: '어제',
    agents: ['prisma', 'infra'],
    owner: 'team',
    script: "if echo $CMD | grep -E 'rm -rf|migrate reset'; then ask_user; fi",
  },
  {
    id: 'block-merge-on-fail',
    name: 'block-merge-on-fail',
    trigger: 'pre-merge',
    desc: '리뷰어 결과 fail이면 머지 차단',
    enabled: true,
    fires: 38,
    lastFire: '오늘',
    agents: ['reviewer'],
    owner: 'team',
    script: "if review.status != 'pass': abort('reviewer flagged issues')",
  },
  {
    id: 'fail-fast',
    name: 'fail-fast',
    trigger: 'test-failure',
    desc: '첫 실패에서 즉시 중단, 노이즈 제거',
    enabled: false,
    fires: 0,
    lastFire: '—',
    agents: ['qa-runner'],
    owner: 'you',
    script: 'set -e\npnpm test --bail',
  },
]

// Lookup maps
export const AGENTS_LIB_BY_ID: Record<string, LibAgent> = Object.fromEntries(
  AGENTS_LIB.map((a) => [a.id, a]),
)
export const SKILLS_LIB_BY_ID: Record<string, LibSkill> = Object.fromEntries(
  SKILLS_LIB.map((s) => [s.id, s]),
)
export const HOOKS_LIB_BY_ID: Record<string, LibHook> = Object.fromEntries(
  HOOKS_LIB.map((h) => [h.id, h]),
)
