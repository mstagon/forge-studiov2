# Fullstack Dev Harness — Flutter + NestJS + Prisma + Next.js

Flutter 앱 + NestJS 백엔드 + Prisma ORM + Next.js CMS 풀스택 프로젝트를 찍어내기 위한 하네스 프레임워크.

**레포 구조**: 로컬 모노레포 + 원격 git subtree (스택별 독립 레포)
```
<project>/ (로컬 모노레포)
├── lib/        → 원격 app repo (Flutter)
├── server/     → 원격 server repo (NestJS + Prisma)
├── cms/        → 원격 cms repo (Next.js)
└── docs/       → 모노레포 전용
```

## Agent Routing (요청 → 에이전트 매칭)

| 요청 유형 | 에이전트 | 스택 |
|-----------|---------|------|
| Flutter UI/위젯/화면 | `flutter-ui` | Flutter |
| Riverpod 상태관리 | `riverpod-logic` | Flutter |
| NestJS 모듈/서비스/API | `nestjs-backend` | NestJS |
| Prisma 스키마/마이그레이션 | `prisma-data` | Prisma |
| CMS 어드민 페이지 | `nextjs-cms` | Next.js |
| 풀스택 아키텍처 설계 | `tech-architect` | Cross |
| 피처 기획 → 태스크 분해 | `planner` | Cross |
| 코드 리뷰 | `code-reviewer` | Cross |
| 보안 감사 | `security-auditor` | Cross |
| 테스트 작성 | `test-writer` | Cross |
| TDD 가이드 | `tdd-guide` | Cross |
| 스펙-코드 정합성 | `spec-verifier` | Cross |
| 빌드 에러 자동 해결 | `build-error-resolver` | Cross |
| 데드코드 정리 | `refactor-cleaner` | Cross |
| 문서 자동 동기화 | `doc-updater` | Cross |
| 공식 문서 검색 | `docs-lookup` | Cross |
| 자율 루프 실행 | `loop-operator` | Cross |
| 하네스 자체 개선 | `harness-optimizer` | Meta |

### Skill Routing (파일 패턴 → 스킬 자동 참조)

| 파일 패턴 | 스킬 |
|-----------|------|
| `lib/domain/entity/**`, `lib/data/**/dto/**` | `freezed-models` |
| `lib/presentation/**` | `riverpod-patterns`, `go-router` |
| `lib/data/remote/**`, `lib/core/network/**` | `dio-retrofit` |
| `lib/core/utils/result.dart` | `error-handling` |
| `lib/core/logger/**` | `logging` |
| `server/src/**/*.module.ts` | `nestjs-module` |
| `server/src/auth/**` | `nestjs-auth` |
| `prisma/schema.prisma` | `prisma-patterns` |
| `cms/app/**` | `nextjs-patterns` |
| `server/src/**/dto/**` ↔ `lib/data/**/dto/**` | `api-contract` |
| `test/**`, `server/test/**` | `tdd-workflow` |
| `Dockerfile`, `docker-compose.*` | `deployment-patterns` |

## 커맨드 목록

### 자동 실행 (플로우에 녹아있음 — 유저가 칠 필요 없음)
| 커맨드 | 자동 트리거 |
|--------|------------|
| `/implement` | 자연어 구현 요청 시 |
| `/orchestrate` | 모든 요청에 기본 라우팅 |
| `/tdd` | 모든 구현에 TDD 기본 적용 |
| `/verify` | 구현 완료 후 |
| `/eval` | 검증 통과 후 |
| `/test-coverage` | 검증 시 커버리지 측정 |
| `/review` | 검증 PASS 후 3종 자동 |
| `/pre-commit` | 리뷰 PASS 후 |
| `/build-fix` | 빌드 실패 시 loop-operator |
| `/api-sync` | 크로스 스택 변경 시 |
| `/refactor-clean` | 구현 후 TDD Refactor 단계 |
| `/update-docs` | 리뷰 PASS 후 |
| `/checkpoint` | 피처 완료 시 자동 save |
| `/learn` | 세션 종료 시 (Stop 훅) |
| `/learn-eval` | 세션 종료 시 자동 |
| `/evolve` | instinct 3회+ 확인 시 자동 승격 |
| `/prune` | 만료/저신뢰 패턴 자동 정리 |
| `/agent-team` | 독립 작업 2+ 감지 시 자동 팀 파견 |
| `/build` | 구현 후 자동 빌드 |

### 수동 전용 (유저가 필요할 때만)
| 커맨드 | 용도 |
|--------|------|
| `/full-cycle` | 설계 GATE 포함 풀 파이프라인 강제 실행 |
| `/multi-plan` → `/multi-execute` | 복잡한 DAG 직접 설계/실행 |
| `/checkpoint restore` | 특정 시점 복원 |
| `/subtree-push` | 원격 레포 배포 |
| `/sessions` | 세션 히스토리 조회 |
| `/instinct-status` | 학습 현황 조회 |
| `/retrospective` | 의도적 세션 회고 |

## 자율 오케스트레이션 (MANDATORY — YOU MUST FOLLOW)

유저는 자연어로 요청만 한다. 나머지는 전부 자동이다.
커맨드, 에이전트, 스킬은 유저가 호출하는 게 아니라 **시스템이 알아서 실행**한다.

### 핵심 원칙

1. **에이전트 자동 파견**: 요청 분석 → Agent Routing 매칭 → 즉시 파견. "어떤 에이전트 쓸까요?" 묻지 마라.
2. **스킬 자동 적용**: 파일 패턴 → Skill Routing 매칭 → 해당 스킬 읽고 적용. 스킬 적용 여부를 묻지 마라.
3. **커맨드 자동 실행**: verify, review 등 워크플로우 커맨드는 흐름에 따라 자동 트리거. 유저가 `/verify` 칠 필요 없다.
4. **팀 병렬 실행**: 독립 작업 2개 이상이면 Agent 도구를 한 메시지에서 병렬 호출 (`run_in_background: true`, `isolation: "worktree"`).
5. **자동 수정 루프**: 빌드/테스트 실패 시 loop-operator 자동 호출. 5회까지 자동 재시도.

### 자동 실행 플로우 (MAX RESOURCES — 항상 풀 파이프라인)

```
유저: "게시판 만들어줘"
  ↓
[1] 분석 (즉시, 자동)
    - 영향 스택: Prisma + NestJS + Flutter
    - 필요 에이전트: prisma-data → nestjs-backend → flutter-ui + riverpod-logic
    - 의존성: DB → API → 앱 (순차)
    - 적용 스킬: prisma-patterns, nestjs-module, api-contract, freezed-models, riverpod-patterns
  ↓
[2] TDD 테스트 먼저 (자동 — 모든 구현에 TDD 적용)
    - test-writer가 실패하는 테스트 먼저 작성 (Red)
    - 스택별: Flutter unit/widget test + NestJS Jest test
  ↓
[3] 구현 (자동 — 팀 에이전트 병렬 파견)
    - 순차 의존: prisma-data → nestjs-backend → flutter 에이전트
    - 독립 병렬: flutter-ui + riverpod-logic (worktree 동시 파견)
    - 테스트 통과 확인 (Green)
  ↓
[4] 리팩토링 (자동 — refactor-cleaner)
    - 중복 제거, 데드코드 정리, 구조 개선 (Refactor)
    - 테스트 유지 확인
  ↓
[5] 검증 (자동 — /verify + /eval + /test-coverage 자동 실행)
    - flutter analyze + flutter test + 커버리지 측정
    - npm run build + npm test + npm run lint
    - DTO 동기화 확인 (/api-sync)
    - 품질 평가 (/eval)
  ↓
[6] 수정 (자동 — FAIL 시)
    - loop-operator 자동 호출 → 빌드/테스트 수정 → 재검증 (최대 5회)
  ↓
[7] 리뷰 (자동 — 묻지 않고 바로 실행)
    - code-reviewer + security-auditor + spec-verifier 3종 동시 파견
    - FAIL → 자동 수정 후 재리뷰
  ↓
[8] 문서 동기화 (자동 — /update-docs)
    - API 문서, dartdoc, 변경 로그 자동 갱신
  ↓
[9] 체크포인트 (자동 — /checkpoint save)
    - 피처 완료 시점 자동 체크포인트 생성
  ↓
[10] 보고
    - 결과 요약 테이블 출력 (TDD 결과 + 커버리지 + 리뷰 결과 포함)
    - "커밋할까요?" (이것만 유저에게 묻는다)
```

### 에이전트 자동 파견 규칙

| 유저 요청 패턴 | 자동 액션 (묻지 않고 실행) |
|---------------|--------------------------|
| "~~ 만들어줘/구현해줘" | 영향 스택 분석 → 에이전트 체이닝 자동 실행 → 검증 → 보고 |
| "~~ 수정해줘/고쳐줘/바꿔줘" | 관련 파일 분석 → 단일 에이전트 직접 실행 → 검증 |
| "리뷰해줘/검토해줘" | code-reviewer + security-auditor + spec-verifier 3종 동시 파견 |
| "빌드 에러/안 돌아가/에러" | build-error-resolver → loop-operator 자동 수정 루프 |
| "테스트 짜줘/테스트 추가" | test-writer 자동 파견 |
| "리팩토링/정리" | refactor-cleaner 자동 파견 |
| "보안/취약점/인증" | security-auditor 자동 파견 |
| "문서/API 문서" | doc-updater 자동 파견 |
| "설계/아키텍처" | tech-architect → planner 체이닝 |
| DB/스키마/테이블 관련 | prisma-data → nestjs-backend 자동 체이닝 |
| API/엔드포인트 관련 | nestjs-backend → api-sync → flutter DTO 자동 체이닝 |
| UI/화면/위젯 관련 | pencil 확인 → flutter-ui → riverpod-logic |
| CMS/어드민 관련 | nextjs-cms 독립 실행 |

### 팀 에이전트 병렬 파견

독립 작업이 감지되면 **한 메시지에서 여러 Agent 호출**로 동시 실행:

```
유저: "로그인 API + 홈화면 UI + 어드민 대시보드"
  ↓
분석: 3개 작업, 스택별 독립
  ↓
동시 파견 (하나의 메시지에서):
  Agent(nestjs-backend, background, worktree) → 로그인 API
  Agent(flutter-ui, background, worktree)     → 홈화면 UI
  Agent(nextjs-cms, background, worktree)     → 어드민 대시보드
  ↓
전부 완료 → 결과 머지 → 자동 검증 → 보고
```

### 스킬 자동 주입 (hook + AI 행동)

skill-injector.sh 훅이 파일 패턴을 감지하고, 나(Claude)는 해당 스킬을 **읽고 적용**한다:
- `lib/domain/entity/` 편집 → freezed-models 스킬 → freezed 패턴, build_runner 후처리
- `server/src/auth/` 편집 → nestjs-auth 스킬 → JWT, Passport, Guard 패턴
- `server/src/**/dto/` 편집 → api-contract 스킬 → NestJS↔Flutter DTO 동기화
- `prisma/schema.prisma` 편집 → prisma-patterns + postgres-patterns 스킬
- 스킬이 매칭되면 `.claude/skills/{name}/SKILL.md`를 읽고 규칙을 따른다

### 검증 자동화 (구현 완료 → 풀 검증 파이프라인)

구현이 끝나면 **모든 검증이 자동 연쇄 실행**된다:
1. git diff로 변경 파일의 스택 감지
2. Flutter 변경 → `flutter analyze` + `flutter test` + 커버리지 측정
3. NestJS 변경 → `npm run build` + `npm test` + `npm run lint`
4. Prisma 변경 → `npx prisma validate`
5. Cross-Stack 변경 → DTO 필드 대조 (/api-sync 자동)
6. 품질 평가 (/eval 자동)
7. FAIL 발생 → loop-operator가 자동 수정 (최대 5회)
8. PASS → 3종 리뷰 자동 실행 (묻지 않음)
9. 리뷰 PASS → 문서 자동 갱신 + 체크포인트 자동 저장
10. 최종 보고 → "커밋할까요?" (이것만 묻는다)

### TDD 기본 적용 (모든 구현에 자동)

모든 구현 요청에 TDD가 기본 적용된다:
1. **Red**: test-writer가 실패하는 테스트 먼저 작성
2. **Green**: 구현 에이전트가 테스트 통과하는 최소 코드 작성
3. **Refactor**: refactor-cleaner가 중복 제거 + 구조 개선 (테스트 유지)
- 스택별: Flutter는 unit/widget test, NestJS는 Jest test
- 커버리지 80% 미달 → test-writer가 추가 테스트 자동 작성

### 자동 학습 (세션 종료 시)

세션 종료 시 학습 시스템이 자동 실행된다:
1. `learn.sh` → 교훈 기록 (Stop 훅)
2. `evaluate-session.sh` → 패턴 추출 + 신뢰도 평가 (Stop 훅)
3. instinct 3회+ 확인 → 자동 승격 제안 (/evolve)
4. 만료/저신뢰 패턴 → 자동 정리 (/prune)

### 유저에게 묻는 경우 (이것만)

- 🚦 **설계 GATE**: 큰 피처의 아키텍처 설계 리뷰
- 🔀 **머지 충돌**: worktree 병렬 실행 후 충돌 발생 시
- ❓ **모호한 요청**: 여러 해석이 가능할 때 (어떤 의도인지)
- 🔄 **5회 실패**: 자동 수정이 5회에도 해결 안 될 때
- 💀 **위험 작업**: 파괴적 명령 (reset, force push, 대량 삭제)
- 📦 **커밋/배포**: 커밋 여부, subtree-push 여부

그 외 모든 것(리뷰, 테스트, 리팩토링, 문서, 체크포인트, 학습)은 **묻지 않고 자동 실행**한다.

### 파이프라인 (의존성 순서)
```
PLAN → SCHEMA → BACKEND → FRONTEND → CMS → TEST → SYNC → REVIEW
 ↑        ↑         ↑          ↑        ↑      ↑       ↑       ↑
planner prisma   nestjs    flutter   nextjs  test   api-    code-reviewer
+arch    data   backend   ui+logic    cms   writer contract +security+spec
```

### 체이닝 패턴 (항상 MAX — TDD + 풀 파이프라인)
```
[단일 스택] 요청 → TDD 테스트 → 구현 → 리팩토링 → 검증 → 리뷰 → 문서 → 체크포인트 → 보고
[크로스 스택] 요청 → TDD → 의존성 순서 체이닝 → sync → 검증 → 리뷰 → 문서 → 체크포인트 → 보고
[자율 루프] loop-operator → 빌드→테스트→수정 반복 (조건 충족까지)
```

### 병렬 실행 가능 (팀 파견)
- code-reviewer + security-auditor + spec-verifier (리뷰 3종 동시)
- flutter-ui + nestjs-backend (독립 기능일 때 동시)
- flutter-ui + riverpod-logic (같은 스택 내 분업)
- test-writer 내 Flutter test + NestJS test (동시)
- nextjs-cms는 항상 독립 병렬 가능

### 절대 병렬 불가 (순서 필수)
- prisma-data → nestjs-backend (스키마가 먼저)
- nestjs-backend → Flutter DTO sync (API가 먼저)
- 구현 → 검증 → 리뷰 (순차)

### Agent Teams (git worktree 병렬)
독립 작업을 `isolation: "worktree"`로 동시 실행.
각 에이전트는 격리된 worktree에서 작업 → 완료 후 머지.

## Harness Framework (자동화)

| 스크립트 | 훅 | 동작 |
|---------|-----|------|
| `gateguard.sh` | PreToolUse Write/Edit | 첫 편집 시 조사 강제 (30분 TTL) |
| `skill-injector.sh` | PreToolUse Write/Edit | 파일 패턴 → 스킬 자동 매칭 + 주입 |
| `tmux-dev.sh` | PreToolUse Bash | dev 서버 → tmux 세션 자동 전환 |
| `auto-profile.sh` | SessionStart | 브랜치 기반 훅 프로파일 자동 감지 |
| `learn.sh` | Stop | 교훈 반복 패턴 탐지 (3회+ → 승격) |
| `cost-tracker.sh` | Stop | 세션 메트릭스 JSONL 기록 |
| `mcp-health.sh` | SessionStart | MCP 서버 헬스체크 (지수 백오프) |
| `hook-profiles.sh` | 유틸리티 | minimal/standard/strict 프로파일 |
| `pre-compact.sh` | PreCompact | 컴팩션 전 상태 보존 |
| `evaluate-session.sh` | Stop | 세션에서 패턴 추출 + 신뢰도 평가 |

### Hook Profile (auto-profile.sh가 브랜치 기반 자동 감지)
```
prd, stg, hotfix/*  → strict   (엄격 검증)
dev, feat/*, fix/*  → standard (일반 개발)
explore/*, poc/*    → minimal  (프로토타이핑)
```

### Continuous Learning v2 (자동 — 세션 종료 시 전부 실행)
```
세션 종료 →
  1. learn.sh (Stop 훅) → 교훈 기록
  2. evaluate-session.sh (Stop 훅) → 패턴 추출 + 신뢰도 평가
  3. learn-eval 자동 → instinct 기록 (신뢰도 점수)
  4. 3회+ 확인 → evolve 자동 → 스킬 승격
  5. 만료/저신뢰 → prune 자동 → 정리
```

### Verification Loop (자동 — 구현 완료 시 풀 체인)
```
구현 완료 →
  1. /verify → 빌드 + 테스트 + lint
  2. /test-coverage → 커버리지 측정 (80% 미달 시 test-writer 자동 보강)
  3. /api-sync → DTO 동기화 확인
  4. /eval → 품질 기준 평가
  5. FAIL → loop-operator 자동 수정 → 재검증
  6. PASS → /review 3종 자동 실행
  7. 리뷰 PASS → /update-docs + /checkpoint save 자동
```

### Checkpoint (자동 — 피처 완료 시 자동 저장)
```
피처 구현 + 검증 + 리뷰 PASS → 자동 checkpoint save [피처명]
수동으로도 가능:
  /checkpoint list            → 목록
  /checkpoint diff [이름]     → 비교
  /checkpoint restore [이름]  → 복원 (자동 백업)
```

## 기술 스택

### 앱 (Flutter)
- Flutter 3.x+ / Dart 3.x+
- Riverpod 2.x (코드젠, @riverpod)
- go_router, dio + retrofit, freezed + json_serializable
- flutter_secure_storage (JWT)

### 서버 (NestJS)
- NestJS (TypeScript) — 모듈 기반
- Prisma — PostgreSQL ORM (migrate 기반)
- Passport.js + JWT
- Bull MQ + Redis

### DB
- PostgreSQL (Supabase Managed — DB 호스팅 전용)

### 환경 (dev / stg / prd)
- `dev` — 개발. 자동 배포. 디버그 로깅. `.env.dev`
- `stg` — 스테이징/QA. 수동 트리거 배포. 표준 로깅. `.env.stg`
- `prd` — 프로덕션. 승인 후 배포. 최소 로깅 + 모니터링. `.env.prd`
- 브랜치: `feat/*` → `dev` → `stg` → `prd`
- DB: 환경별 독립 (dev DB / stg DB / prd DB)

### CMS
- Next.js 15+ (App Router) + Prisma + shadcn/ui

## 앱 아키텍처 (Clean Architecture)

```
lib/
├── core/           # config, network, theme, logger, utils
├── data/           # remote (API), local (cache), repository (구현체)
├── domain/         # entity, repository (추상), usecase
├── presentation/   # 화면별 디렉토리 (위젯 + 컨트롤러)
└── app.dart        # GoRouter, 전역 Provider
```

레이어 규칙: presentation → domain → data 단방향. domain은 순수 Dart.

## 서버 아키텍처 (NestJS)

```
server/src/
├── auth/           # Passport OAuth + JWT (strategies, guards, decorators)
├── users/          # 유저 모듈
├── [도메인]/       # 도메인별 모듈 (controller + service + dto)
├── common/         # guards, interceptors, filters, pipes
├── config/         # 환경변수, 밸런스 JSON
└── prisma/         # PrismaService (싱글턴)
```

## 빌드 & 검증

```bash
# Flutter
flutter pub get && dart run build_runner build -d && flutter analyze && flutter test

# NestJS
cd server && npm install && npm run build && npm run test && npm run lint

# Prisma
npx prisma validate && npx prisma migrate dev && npx prisma generate

# Next.js CMS
cd cms && npm install && npm run build && npm run lint
```

## 워크플로우 (MAX RESOURCES — 유저는 요청만)

유저가 "게시판 만들어줘"라고 하면 아래가 **전부 자동, 최대 자원**으로 진행된다:

1. **분석** → 영향 스택 + 에이전트 + 스킬 자동 결정
2. **설계** → 큰 피처면 tech-architect 자동 파견 → 🚦GATE (유저 확인)
3. **TDD** → test-writer가 실패 테스트 먼저 작성 (Red)
4. **구현** → 에이전트 체이닝/병렬 자동 파견 → 테스트 통과 (Green)
5. **리팩토링** → refactor-cleaner 자동 → 중복 제거 (Refactor)
6. **검증** → verify + eval + test-coverage + api-sync 자동 (풀 체인)
7. **수정** → FAIL 시 loop-operator 자동 수정 (최대 5회)
8. **리뷰** → 3종 병렬 자동 실행 (묻지 않음)
9. **문서** → update-docs 자동
10. **체크포인트** → checkpoint save 자동
11. **보고** → 결과 요약 → "커밋할까요?" (이것만 묻는다)

유저가 직접 커맨드를 칠 수도 있지만, 안 쳐도 전부 최대 자원으로 자동 진행된다.

## 코딩 규칙

### Flutter
- const 생성자 활용, setState 금지 (Riverpod), Navigator.push 금지 (go_router)
- BuildContext를 async gap 넘기지 마라
- 에러 핸들링: Result 패턴
- freezed 수정 후 `dart run build_runner build -d`
- 새 패키지 후 `cd ios && pod install`

### NestJS
- TypeScript strict mode
- Controller 얇게, Service에 비즈니스 로직
- Swagger 데코레이터 필수, DTO는 class-validator
- Prisma migrate 기반, ConfigModule로 환경변수
- Controller에서 Prisma 직접 호출 금지

### Next.js (CMS)
- Server Components 기본, 'use client'는 인터랙션 시만
- Server Actions + zod 검증, 어드민 세션 검증 필수
- Tailwind + shadcn/ui, inline styles 금지

### Cross-Stack
- API 계약 원본 = NestJS Swagger DTO → Flutter DTO가 따름
- JSON key는 camelCase 통일
- Prisma schema = DB 단일 소스

## MCP 활용 (MANDATORY)

글로벌 MCP (모든 프로젝트 공용):
- **github** — PR/이슈 관리, 코드 검색
- **pencil** — UI 디자인 (.pen 파일)

프로젝트 MCP (하네스 자동 포함):

| MCP | 용도 | 자동 활용 시점 |
|-----|------|---------------|
| `context7` | 공식 문서 조회 | 패키지 API 사용 전 필수 조회 |
| `dart` | Dart 언어 서버 | Dart/Flutter 코드 작성 시 |
| `serena` | 코드베이스 분석 | 아키텍처 파악, 리팩토링 시 |
| `sequential-thinking` | 체계적 추론 | 복잡한 설계/디버깅/아키텍처 결정 시 |
| `supabase` | DB 관리 | 스키마 변경, 데이터 조회, RLS 정책 |
| `playwright` | E2E 테스트 | CMS/웹 UI 테스트, 브라우저 자동화 |
| `exa-web-search` | 웹 검색 | 기술 조사, 라이브러리 비교 |
| `firecrawl` | 웹 스크래핑 | 문서 크롤링, 경쟁 분석 |
| `token-optimizer` | 컨텍스트 최적화 | 대규모 파일 분석 시 토큰 절약 |
| `jira` | 이슈 트래킹 | 티켓 조회/생성/업데이트 |
| `vercel` | CMS 배포 | Next.js CMS 배포/프리뷰 |
| `railway` | 서버 배포 | NestJS 서버 배포 |
| `fal-ai` | AI 생성 | 이미지/에셋 생성 |
| `evalview` | 회귀 테스트 | 에이전트 행동 스냅샷/검증 |

### MCP 자동 활용 규칙
1. 패키지 API 사용 → `context7`로 문서 확인 후 작성 (환각 금지)
2. DB 스키마/데이터 작업 → `supabase` MCP 활용
3. 복잡한 설계 결정 → `sequential-thinking`으로 추론 체인
4. UI 디자인 → `pencil`로 .pen 파일 확인 후 구현
5. E2E 테스트 → `playwright`로 브라우저 자동화
6. 배포 → CMS는 `vercel`, 서버는 `railway`
7. API 키 미설정 MCP → 무시하고 진행 (에러 시 사용자에게 설정 안내)

## 근거 기반 원칙 (IMPORTANT)

- 패키지 API → context7 MCP로 공식 문서 확인 후 사용 (환각 금지)
- 확실하지 않으면 구현 말고 질문
- 추측 코드 금지. 검증 후 작성
- `docs/lessons-learned.md` 반드시 참고

## 금지 패턴 (YOU MUST NOT)

### 공통
- `any`, `dynamic` 타입 금지
- `print()` / `console.log()` 금지 → logger 사용
- `!` (null assertion) 금지
- `.env` 하드코딩 금지, git에 시크릿 커밋 금지

### NestJS/Prisma
- Controller → Prisma 직접 호출 금지 (Service 경유)
- `prisma db push` 금지 → `prisma migrate dev`
- `deleteMany` without `where` 금지
- Raw SQL 남용 금지

### Next.js
- Client Component → Prisma 직접 호출 금지
- Server Action 인증 체크 누락 금지
- `dangerouslySetInnerHTML` 금지
- Pages Router 패턴 금지 → App Router

## 자기개선

- 실수 → `docs/lessons-learned.md` 기록 → 3회 반복 시 CLAUDE.md 승격
- `/retrospective`로 세션 회고
- `/evolve`로 학습 패턴 → 스킬 승격
- `harness-optimizer`로 하네스 자체 개선
