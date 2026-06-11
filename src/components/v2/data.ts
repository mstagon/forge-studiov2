/**
 * Forge Studio v2 — seed data for prototype-fidelity rendering.
 * Will be replaced by real store data piece-by-piece.
 *
 * Source: /tmp/forge_design/forge/project/src/data.jsx
 */

import type {
  Agent,
  ActivityEntry,
  Team,
  TerminalLines,
  WorkspaceSummary,
} from './types'

export const AGENTS: Agent[] = [
  // v0.15 — harness-template/.claude/agents/ 의 실제 18개와 1:1 동기.
  // (구버전: design seed 의 가짜 id 18개 중 2개만 실존 → GUI 로 만든 팀
  // 멤버 대부분이 존재하지 않는 agent 였음. 감사 문서 참조)
  { id: 'flutter-ui', name: 'flutter-ui', role: 'Flutter UI', color: 'var(--role-fe)', icon: 'F', desc: '화면/위젯/테마/네비게이션' },
  { id: 'riverpod-logic', name: 'riverpod-logic', role: 'State / Riverpod', color: 'var(--role-fe)', icon: 'R', desc: 'Riverpod 상태관리, usecase' },
  { id: 'nestjs-backend', name: 'nestjs-backend', role: 'NestJS API', color: 'var(--role-be)', icon: 'N', desc: 'Controller/Service/DTO' },
  { id: 'prisma-data', name: 'prisma-data', role: 'Prisma Schema', color: 'var(--role-db)', icon: 'P', desc: '스키마/마이그레이션/관계' },
  { id: 'nextjs-cms', name: 'nextjs-cms', role: 'Next.js CMS', color: 'var(--role-fe)', icon: 'C', desc: 'App Router 어드민' },
  { id: 'test-writer', name: 'test-writer', role: 'Tests', color: 'var(--role-test)', icon: 'T', desc: 'unit/widget/e2e 테스트 작성' },
  { id: 'tdd-guide', name: 'tdd-guide', role: 'TDD Guide', color: 'var(--role-test)', icon: 'G', desc: 'Red→Green→Refactor 가이드' },
  { id: 'code-reviewer', name: 'code-reviewer', role: 'Code Review', color: 'var(--role-review)', icon: 'R', desc: 'diff 리뷰, 스타일 비평' },
  { id: 'security-auditor', name: 'security-auditor', role: 'Security', color: 'var(--role-review)', icon: 'S', desc: 'OWASP 취약점 검수' },
  { id: 'spec-verifier', name: 'spec-verifier', role: 'Spec Verify', color: 'var(--role-review)', icon: 'V', desc: '스펙-코드 정합성 검증' },
  { id: 'tech-architect', name: 'tech-architect', role: 'Architect', color: 'var(--role-arch)', icon: 'A', desc: '풀스택 아키텍처 설계' },
  { id: 'planner', name: 'planner', role: 'Planner', color: 'var(--role-arch)', icon: 'P', desc: '피처 기획 → 태스크 분해' },
  { id: 'refactor-cleaner', name: 'refactor-cleaner', role: 'Refactor', color: 'var(--role-arch)', icon: 'C', desc: '데드코드 탐지/정리' },
  { id: 'build-error-resolver', name: 'build-error-resolver', role: 'Build Fixer', color: 'var(--role-infra)', icon: 'B', desc: '빌드 에러 자동 분석/수정' },
  { id: 'loop-operator', name: 'loop-operator', role: 'Auto Loop', color: 'var(--role-infra)', icon: 'L', desc: '조건 충족까지 자율 반복' },
  { id: 'harness-optimizer', name: 'harness-optimizer', role: 'Harness Meta', color: 'var(--role-infra)', icon: 'H', desc: '하네스 자체 분석/개선' },
  { id: 'doc-updater', name: 'doc-updater', role: 'Docs', color: 'var(--role-doc)', icon: 'D', desc: '코드 변경 → 문서 동기화' },
  { id: 'docs-lookup', name: 'docs-lookup', role: 'Docs Lookup', color: 'var(--role-doc)', icon: 'Q', desc: '공식 문서/API 레퍼런스 검색' },
]

export const AGENT_POOL = AGENTS

export const AGENT_BY_ID: Record<string, Agent> = Object.fromEntries(
  AGENTS.map((a) => [a.id, a]),
)

/**
 * Resolve an agent id to its v2 UI shape, **never returning null**.
 *
 * Pre-existing bug: AGENT_BY_ID 는 seed prototype 시절의 hardcoded id 만
 * 가짐 (architect, flutter-state, test-unit 등). 실제 하네스의 agentId
 * (tech-architect, planner, riverpod-logic, test-writer, prisma-data 등)
 * 는 매칭 안 됨 → AgentCard 의 `if (!a) return null` 으로 멤버 카드 silent
 * 미렌더. 사용자: "좌측 멤버 2 패널 비어있음".
 *
 * 이 함수는 알려진 id 면 그 entry, 미지의 id 면 generic fallback (id 기준
 * 이니셜 + 회색 컬러) 반환. RunLiveView / LiveTerminalGrid / AgentBadge
 * 모두 이 함수를 통과시키면 silent null 사라짐.
 */
export function getAgent(id: string): Agent {
  const hit = AGENT_BY_ID[id]
  if (hit) return hit
  // Heuristic: agentId 패턴 → 적당한 role 컬러 추측 (없으면 generic gray)
  const lower = id.toLowerCase()
  let color = 'var(--role-arch)'
  if (lower.includes('flutter') || lower.includes('riverpod') || lower.includes('ui') || lower.includes('view')) color = 'var(--role-fe)'
  else if (lower.includes('nest') || lower.includes('api') || lower.includes('backend') || lower.includes('auth')) color = 'var(--role-be)'
  else if (lower.includes('prisma') || lower.includes('schema') || lower.includes('migrat') || lower.includes('data')) color = 'var(--role-db)'
  else if (lower.includes('test') || lower.includes('e2e') || lower.includes('verif')) color = 'var(--role-test)'
  else if (lower.includes('review') || lower.includes('audit') || lower.includes('security')) color = 'var(--role-review)'
  else if (lower.includes('cms') || lower.includes('next')) color = 'var(--role-fe)'
  else if (lower.includes('plan') || lower.includes('architect')) color = 'var(--role-arch)'
  else if (lower.includes('doc')) color = 'var(--role-doc)'
  else if (lower.includes('infra') || lower.includes('docker') || lower.includes('k8s')) color = 'var(--role-infra)'
  return {
    id,
    name: id,
    role: id.replace(/-/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase()),
    color,
    icon: id.charAt(0).toUpperCase(),
    desc: '',
  }
}

export const TEAMS: Team[] = [
  {
    id: 't-signup',
    name: '회원가입 피처 팀',
    goal: '이메일/소셜 로그인 + 온보딩 3단계 + 약관 동의 플로우 구현',
    status: 'active',
    progress: 0.47,
    lastActive: '방금 전',
    branch: 'feature/auth-signup',
    worktree: 'isolated',
    merge: 'squash',
    tokens: 184_300,
    durationMin: 38,
    members: [
      { agentId: 'architect', task: 'auth flow ADR 작성', state: 'done', tokens: 22_400, files: 3, pane: 'ARCH' },
      { agentId: 'flutter-ui', task: 'SignupForm + 약관 모달 UI', state: 'active', tokens: 41_900, files: 6, pane: 'UI' },
      { agentId: 'nestjs-auth', task: 'POST /auth/register + JWT issue', state: 'active', tokens: 38_100, files: 4, pane: 'API' },
      { agentId: 'prisma-schema', task: 'User + Verification 테이블 마이그', state: 'blocked', tokens: 12_800, files: 2, pane: 'DB', blockedReason: 'User.email unique 충돌 — architect 결정 대기' },
      { agentId: 'test-e2e', task: 'signup happy-path Playwright', state: 'queued', tokens: 0, files: 0, pane: 'E2E' },
    ],
  },
  {
    id: 't-refactor',
    name: '리팩토링 팀',
    goal: '결제 모듈 NestJS → Hexagonal Architecture 이행',
    status: 'active',
    progress: 0.71,
    lastActive: '2분 전',
    branch: 'refactor/payment-hex',
    worktree: 'isolated',
    merge: 'sequential',
    tokens: 312_900,
    durationMin: 124,
    members: [
      { agentId: 'architect', task: '포트/어댑터 경계 정의', state: 'done', tokens: 48_000, files: 5, pane: 'ARCH' },
      { agentId: 'nestjs-backend', task: 'PaymentService → UseCase', state: 'active', tokens: 92_400, files: 11, pane: 'API' },
      { agentId: 'test-unit', task: '기존 케이스 마이그레이션', state: 'active', tokens: 64_200, files: 14, pane: 'TEST' },
      { agentId: 'reviewer', task: 'diff 리뷰 + 스타일 체크', state: 'active', tokens: 28_900, files: 0, pane: 'REV' },
    ],
  },
  {
    id: 't-perf',
    name: '성능 최적화',
    goal: '초기 로드 < 1.2s · LCP < 2s · 번들 -30%',
    status: 'idle',
    progress: 1.0,
    lastActive: '어제 18:42',
    branch: 'perf/bundle-split',
    worktree: 'shared',
    merge: 'squash',
    tokens: 89_200,
    durationMin: 56,
    members: [
      { agentId: 'perf-profiler', task: 'Lighthouse 베이스라인', state: 'done', tokens: 18_400, files: 0, pane: 'PROF' },
      { agentId: 'next-app', task: '동적 import 적용', state: 'done', tokens: 41_200, files: 8, pane: 'NEXT' },
      { agentId: 'tailwind-ui', task: '사용 안 하는 토큰 정리', state: 'done', tokens: 29_600, files: 3, pane: 'UI' },
    ],
  },
  {
    id: 't-docs',
    name: '문서화 팀',
    goal: '공개 API 레퍼런스 + ADR-0001~0008 한/영 동시 작성',
    status: 'blocked',
    progress: 0.18,
    lastActive: '12분 전',
    branch: 'docs/public-api',
    worktree: 'shared',
    merge: 'squash',
    tokens: 24_100,
    durationMin: 14,
    members: [
      { agentId: 'doc-writer', task: 'ADR-0003 다듬기', state: 'blocked', tokens: 14_200, files: 1, pane: 'DOC', blockedReason: '사용자 결정 대기: "ADR 톤(공식/대화형)"' },
      { agentId: 'i18n', task: '용어집 한/영 정렬', state: 'queued', tokens: 0, files: 0, pane: 'I18N' },
    ],
  },
]

export const ACTIVITY: ActivityEntry[] = [
  { t: '00:38:21', agent: 'flutter-ui', kind: 'edit', text: 'lib/features/auth/widgets/signup_form.dart +124 -8' },
  { t: '00:38:04', agent: 'nestjs-auth', kind: 'commit', text: 'feat(auth): bcrypt + jwt issuance · 4 files' },
  { t: '00:37:51', agent: 'prisma-schema', kind: 'blocked', text: 'User.email unique 충돌 — architect 결정 필요' },
  { t: '00:37:29', agent: 'architect', kind: 'decision', text: '결정: refresh token = httpOnly cookie, 14d' },
  { t: '00:37:10', agent: 'flutter-ui', kind: 'edit', text: 'lib/theme/spacing.dart +12 -2' },
  { t: '00:36:55', agent: 'nestjs-auth', kind: 'tool', text: '$ pnpm prisma generate' },
  { t: '00:36:40', agent: 'test-e2e', kind: 'queued', text: 'task queued: signup happy-path' },
  { t: '00:36:18', agent: 'architect', kind: 'done', text: 'ADR-0007 published · 3 files' },
  { t: '00:35:51', agent: 'flutter-ui', kind: 'edit', text: 'lib/features/auth/widgets/terms_modal.dart +88 -0' },
  { t: '00:35:33', agent: 'nestjs-auth', kind: 'edit', text: 'src/modules/auth/auth.controller.ts +62 -4' },
  { t: '00:35:01', agent: 'prisma-schema', kind: 'edit', text: 'prisma/schema.prisma +18 -3' },
  { t: '00:34:42', agent: 'architect', kind: 'decision', text: '결정: 약관은 별도 테이블 (TermsAcceptance)' },
]

export const WORKSPACES: WorkspaceSummary[] = [
  { id: 'ws-forge', name: 'forge-studio2-main 2', path: '~/Downloads/forge-studio2-main 2', branch: 'dev', harness: '0.3.9', current: true },
  { id: 'ws-tropic', name: 'tropick', path: '~/track/tropick', branch: 'main', harness: '0.3.7' },
  { id: 'ws-mvp', name: '마들워크-mvpv1', path: '~/마들원-mvpv1', branch: 'main', harness: '0.3.7' },
  { id: 'ws-morning', name: 'morning', path: '~/morningmiss', branch: 'main', harness: '—' },
  { id: 'ws-garbage', name: 'garbage', path: '~/garbage', branch: 'wip', harness: '0.3.4' },
]

export const TERMINAL_LINES: TerminalLines = {
  'flutter-ui': [
    { c: 'var(--text-3)', t: '$ flutter analyze lib/features/auth' },
    { c: 'var(--text-2)', t: 'Analyzing auth...' },
    { c: 'var(--success)', t: 'No issues found! (ran in 4.2s)' },
    { c: 'var(--text-3)', t: '$ flutter test --coverage test/auth' },
    { c: 'var(--text-2)', t: '00:02 +0: SignupForm validates email' },
    { c: 'var(--success)', t: '00:03 +1: SignupForm validates email' },
    { c: 'var(--text-2)', t: '00:03 +1: SignupForm shows TOS modal' },
    { c: 'var(--success)', t: '00:04 +2: SignupForm shows TOS modal' },
    { c: 'var(--text-2)', t: '00:04 +2: SignupForm submits with valid input' },
    { c: 'var(--accent)', t: '› widget rebuilt: SignupForm' },
    { c: 'var(--text-2)', t: '› hot reload (124ms)' },
  ],
  'nestjs-auth': [
    { c: 'var(--text-3)', t: '$ pnpm test:watch auth' },
    { c: 'var(--text-2)', t: 'PASS  src/auth/auth.service.spec.ts' },
    { c: 'var(--text-2)', t: '  AuthService' },
    { c: 'var(--success)', t: '    ✓ hashes password with bcrypt (12ms)' },
    { c: 'var(--success)', t: '    ✓ issues JWT on register (8ms)' },
    { c: 'var(--success)', t: '    ✓ rejects duplicate email (4ms)' },
    { c: 'var(--text-2)', t: '  Tests:       3 passed, 3 total' },
    { c: 'var(--text-3)', t: '$ curl -X POST localhost:3000/auth/register' },
    { c: 'var(--info)', t: '{ "id": "usr_8a2b", "email": "..." }' },
    { c: 'var(--accent)', t: '› compiled successfully (218ms)' },
  ],
  'prisma-schema': [
    { c: 'var(--text-3)', t: '$ pnpm prisma migrate dev --name add_verification' },
    { c: 'var(--warning)', t: '⚠ Drift detected: User.email' },
    { c: 'var(--danger)', t: 'Error: Unique constraint conflict on field email' },
    { c: 'var(--text-2)', t: '    at User -> Verification relation' },
    { c: 'var(--text-3)', t: '$ # waiting on architect decision...' },
    { c: 'var(--text-3)', t: '$ _' },
  ],
  architect: [
    { c: 'var(--text-3)', t: '$ # writing ADR-0007' },
    { c: 'var(--text-2)', t: 'Reading: docs/adr/0006-auth-strategy.md' },
    { c: 'var(--text-2)', t: 'Reading: src/modules/auth/*.ts' },
    { c: 'var(--accent)', t: '› decision: refresh token = httpOnly cookie, 14d' },
    { c: 'var(--success)', t: '✓ ADR-0007 written (3 files)' },
    { c: 'var(--text-2)', t: 'Next: review prisma blocker' },
  ],
  'test-e2e': [
    { c: 'var(--text-3)', t: '$ # queued — waiting on flutter-ui + nestjs-auth' },
    { c: 'var(--text-3)', t: '$ _' },
  ],
}

/** Files shown in the Workspace left rail (placeholder until wired to real fs). */
export const RECENT_FILES = [
  { name: 'main.dart', path: 'lib/main.dart', dirty: true, agent: 'flutter-ui' },
  { name: 'auth.controller.ts', path: 'src/modules/auth/auth.controller.ts', dirty: true, agent: 'nestjs-auth' },
  { name: 'schema.prisma', path: 'prisma/schema.prisma', dirty: false, agent: 'prisma-schema' },
  { name: 'CLAUDE.md', path: 'CLAUDE.md', dirty: false, harness: true },
  { name: 'README.md', path: 'README.md', dirty: false },
  { name: 'pubspec.yaml', path: 'pubspec.yaml', dirty: false },
]
