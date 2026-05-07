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
  { id: 'flutter-ui', name: 'flutter-ui', role: 'Flutter UI', color: 'var(--role-fe)', icon: 'F', desc: 'Widget tree, theme, navigation' },
  { id: 'flutter-state', name: 'flutter-state', role: 'State / Riverpod', color: 'var(--role-fe)', icon: 'F', desc: 'Riverpod, providers, async' },
  { id: 'nestjs-backend', name: 'nestjs-backend', role: 'NestJS API', color: 'var(--role-be)', icon: 'N', desc: 'Controllers, services, DTOs' },
  { id: 'nestjs-auth', name: 'nestjs-auth', role: 'Auth & Security', color: 'var(--role-be)', icon: 'N', desc: 'JWT, OAuth, guards' },
  { id: 'prisma-schema', name: 'prisma-schema', role: 'Prisma Schema', color: 'var(--role-db)', icon: 'P', desc: 'Models, migrations, relations' },
  { id: 'prisma-seed', name: 'prisma-seed', role: 'DB Seeding', color: 'var(--role-db)', icon: 'P', desc: 'Seed scripts, fixtures' },
  { id: 'next-app', name: 'next-app', role: 'Next.js App', color: 'var(--role-fe)', icon: 'N', desc: 'App router, layouts, RSC' },
  { id: 'next-api', name: 'next-api', role: 'Next API Routes', color: 'var(--role-be)', icon: 'N', desc: 'Route handlers, middleware' },
  { id: 'tailwind-ui', name: 'tailwind-ui', role: 'Design Tokens', color: 'var(--role-fe)', icon: 'T', desc: 'Tokens, components, themes' },
  { id: 'test-unit', name: 'test-unit', role: 'Unit Tests', color: 'var(--role-test)', icon: 'T', desc: 'Vitest, Jest, Dart test' },
  { id: 'test-e2e', name: 'test-e2e', role: 'E2E Tests', color: 'var(--role-test)', icon: 'E', desc: 'Playwright, integration_test' },
  { id: 'reviewer', name: 'reviewer', role: 'Code Reviewer', color: 'var(--role-review)', icon: 'R', desc: 'Diff review, style critique' },
  { id: 'infra-docker', name: 'infra-docker', role: 'Docker / Infra', color: 'var(--role-infra)', icon: 'D', desc: 'Dockerfiles, compose, CI' },
  { id: 'infra-k8s', name: 'infra-k8s', role: 'Kubernetes', color: 'var(--role-infra)', icon: 'K', desc: 'Manifests, helm, deploy' },
  { id: 'architect', name: 'architect', role: 'Architect', color: 'var(--role-arch)', icon: 'A', desc: 'ADRs, planning, decomposition' },
  { id: 'doc-writer', name: 'doc-writer', role: 'Docs & ADRs', color: 'var(--role-doc)', icon: 'D', desc: 'README, ADR, API docs' },
  { id: 'perf-profiler', name: 'perf-profiler', role: 'Performance', color: 'var(--role-arch)', icon: 'P', desc: 'Profiling, bundle size' },
  { id: 'i18n', name: 'i18n', role: 'i18n', color: 'var(--role-doc)', icon: 'i', desc: '한/영 catalog, ICU' },
]

export const AGENT_POOL = AGENTS

export const AGENT_BY_ID: Record<string, Agent> = Object.fromEntries(
  AGENTS.map((a) => [a.id, a]),
)

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
