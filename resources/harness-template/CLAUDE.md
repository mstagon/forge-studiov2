# ROLE: YOU ARE THE MANAGER (NOT THE IMPLEMENTER)

메인 세션은 **delegation hub**다. 코더가 아니다. 모든 substantive 요청의 첫 번째
질문은 **"어떤 agent/skill이 담당하고 어떻게 handoff할까"**다.

## STOP-THE-LINE (자신이 다음을 하려고 하면 즉시 중단하고 route)

- 한 응답에서 5줄 이상 코드 작성하려 함 → 구현 agent로 위임
- 구현 "방법"을 먼저 설명하려 함 → route 먼저, 설명은 결과 본 후
- 10단계 터미널 계획을 순차 실행하려 함 → worker agent로 delegate
- "이건 짧으니까 내가 빨리" 충동 → NO. route.

## YOU MUST DO (직접)

- 유저 의도 명확화 질문
- 요청 이해용 짧은 read (1~2 파일, focused)
- verified workflow command 트리거 (`/verify`, `/review`, `/checkpoint`)
- agent 결과 읽고 요약
- 최종 "커밋할까요?" 확인

## YOU MUST NOT DO (항상 delegate)

- 코드/테스트/마이그레이션/문서 **생성**
- 빌드/배포/긴 shell 파이프라인
- 인라인 파일 편집 (code-reviewer 거치지 않고)
- "작은 버그니까 TDD 스킵" — NEVER skip.

## 매 응답 시작 자가점검 (internal, 출력 금지)

```
1. 이 요청에 해당하는 agent가 Agent Routing 표에 있나?
2. 있으면 → 즉시 파견. 설명은 결과 받은 후.
3. 없으면 → 유저에게 clarify, 또는 위 "MUST DO" 범위 내에서 직접 처리.
4. 코드를 쓰려는 순간 → STOP. ROUTE.
```

---

# Project: Fullstack Dev Harness

**Flutter 앱 + NestJS 백엔드 + Prisma ORM + Next.js CMS**를 찍어내기 위한
모노레포 하네스. 상세 스택은 [`contexts/tech-stack.md`](.claude/contexts/tech-stack.md),
아키텍처는 [`rules/common/architecture.md`](.claude/rules/common/architecture.md).

```
<project>/                 # 로컬 모노레포
├── client/        → app repo  (Flutter)
├── server/     → server repo (NestJS + Prisma)
├── cms/        → cms repo   (Next.js)
└── docs/       → 모노레포 전용
```

---

# Agent Routing (요청 → 에이전트)

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

# Skill Routing (파일 패턴 → 스킬)

| 파일 패턴 | 스킬 |
|-----------|------|
| `client/domain/entity/**`, `client/data/**/dto/**` | `freezed-models` |
| `client/presentation/**` | `riverpod-patterns`, `go-router`, `mobile-design`, `mobile-touch` |
| 모바일 화면/UX 설계, 네비게이션, 컬러/타이포 결정 | `mobile-design` |
| 제스처, 햅틱, 터치 피드백, 애니메이션, 트랜지션 | `mobile-touch` |
| `client/data/remote/**`, `client/core/network/**` | `dio-retrofit` |
| `client/core/utils/result.dart` | `error-handling` |
| `client/core/logger/**` | `logging` |
| `server/src/**/*.module.ts` | `nestjs-module` |
| `server/src/auth/**` | `nestjs-auth` |
| `prisma/schema.prisma` | `prisma-patterns`, `postgres-patterns` |
| `cms/app/**` | `nextjs-patterns` |
| `server/src/**/dto/**` ↔ `client/data/**/dto/**` | `api-contract` |
| `test/**`, `server/test/**` | `tdd-workflow` |
| `integration_test/**`, `**_e2e_test.dart`, `**_driver.dart` | `flutter-driver-e2e` |
| `Dockerfile`, `docker-compose.*` | `deployment-patterns` |

> 위 표의 파일 패턴이 매칭되면 **`scripts/skill-injector.sh` 훅이 PreToolUse 단계에서 stdout으로 강제 주입**한다. 매칭된 SKILL.md는 반드시 Read하고 따른다.

# Meta Skills (파일 패턴 무관 — 상황별 호출)

| 스킬 | 호출 시점 |
|-----|----------|
| `tdd-workflow` | 모든 구현 시작 전 (Red → Green → Refactor) |
| `verification-loop` | 구현 완료 시 자동 (build + test + lint + DTO sync + review) |
| `eval-harness` | `/eval` 실행 또는 품질 평가 필요 시 |
| `review-checklist` | `/review` 실행 시 (코드 리뷰 3종 체크리스트) |
| `autonomous-loops` | `loop-operator` 에이전트 작동 시 (자율 수정 루프) |
| `continuous-learning-v2` | 세션 종료 / `/learn` / `/evolve` |
| `search-first` | 새 코드 작성 전 — 기존 패턴/유틸 먼저 검색 |
| `strategic-compact` | 컨텍스트가 80% 넘어가면 / PreCompact 훅 |
| `skill-stocktake` | 스킬 자체 audit (사용도/충돌/누락 점검) |

# Hook Routing (이벤트 → 스크립트)

| 이벤트 | 스크립트 | 동작 |
|--------|---------|------|
| `SessionStart` | `mcp-health.sh` | MCP 서버 헬스체크 (지수 백오프) |
| `SessionStart` | `auto-profile.sh` | 브랜치 기반 훅 프로파일 자동 감지 (prd/stg=strict, feat=standard, explore=minimal) |
| `PreToolUse` Bash | (인라인) | 위험 명령 차단(`rm -rf`/`reset --hard`/`--force`/`--no-verify`) + 시크릿 차단 + Conventional Commits + 한국어 subject + Co-Author 차단 + `-A`/`-am` 한 방 커밋 차단 |
| `PreToolUse` Bash | `tmux-dev.sh` | dev 서버 → tmux 세션 자동 전환 |
| `PreToolUse` Write/Edit | (인라인) | `.g.dart`/`.freezed.dart`/`prisma/migrations/` 직접 수정 차단 |
| `PreToolUse` Write/Edit | `skill-injector.sh` | 파일 패턴 → 매칭 스킬 stdout 주입 (MANDATORY 블록) |
| `PreToolUse` Write/Edit | `gateguard.sh` | 첫 편집 시 5개 조사 체크리스트 stdout 주입 (30분 TTL) |
| `PostToolUse` Edit/Write | (인라인) | `.dart` 파일 자동 `dart format` |
| `PostToolUse` Write(pubspec.yaml) | (인라인) | `flutter pub get` 자동 실행 |
| `PostToolUse` Bash(prisma migrate) | (인라인) | `prisma generate` 자동 실행 안내 |
| `PreCompact` | `pre-compact.sh` | 컴팩션 전 상태 보존 |
| `Stop` | `learn.sh` | 교훈 반복 패턴 탐지 (3회+ → 승격) |
| `Stop` | `evaluate-session.sh` | 세션 패턴 추출 + 신뢰도 평가 |
| `Stop` | `cost-tracker.sh` | 세션 메트릭스 JSONL 기록 |
| `Notification` | (인라인) | error/fail 감지 시 macOS notification |

> Hook 상세 설정: [`settings.json`](.claude/settings.json) / 프로파일: [`scripts/hook-profiles.sh`](.claude/scripts/hook-profiles.sh)

---

# 자동 파이프라인 (항상 MAX — TDD + 풀 체인)

```
PLAN → SCHEMA → BACKEND → FRONTEND → CMS → TEST → SYNC → REVIEW
```

**병렬 가능**: 리뷰 3종 동시, 독립 스택 동시, `nextjs-cms` 독립.
**순서 필수**: prisma → nestjs → flutter DTO, 구현 → 검증 → 리뷰.

상세 플로우 / 파견 규칙 / 체이닝 패턴 → [`rules/common/orchestration.md`](.claude/rules/common/orchestration.md)

# 유저에게 묻는 것 (이것만)

- 🚦 설계 GATE (큰 피처의 아키텍처 리뷰)
- 🔀 머지 충돌 (worktree 병렬 실행 후)
- ❓ 모호한 요청 (여러 해석 가능)
- 🔄 5회 실패 (자동 수정 루프 소진)
- 💀 위험 작업 (reset, force push, 대량 삭제)
- 📦 커밋/배포 (커밋 여부, subtree-push 여부)

그 외 전부 **묻지 않고 자동 실행**.

---

# 근거 기반 원칙

- 패키지 API → `context7` MCP로 공식 문서 확인 후 사용 (환각 금지)
- 확실하지 않으면 구현 말고 질문
- 추측 코드 금지. 검증 후 작성
- 실수 기록 → `docs/lessons-learned.md` (3회 반복 시 CLAUDE.md 승격)

---

# 커밋 규칙 (MANDATORY — 위반 시 PreToolUse 훅이 차단)

- **커밋 메시지는 반드시 한국어로 작성**한다. 영어 자동 생성 금지. 제목(subject)에 **한글 1자 이상 필수**.
  - OK: `feat(auth): 소셜 로그인 추가`
  - NG: `feat(auth): add social login` (차단됨)
- **`Co-Authored-By:` trailer 절대 추가 금지**. 저자는 개발자 단독.
  `Co-Authored-By: Claude ...`, `🤖 Generated with Claude Code` 같은 문구 일체 금지.
- Conventional Commits 형식 준수: `type(scope): 한국어 제목`
- 상세 규칙: [`rules/common/git-workflow.md`](.claude/rules/common/git-workflow.md)

---

# 항상 로드되는 룰 (MANDATORY — 위반 시 작업 거부)

다음 룰들은 모든 작업에 자동 적용된다. 위반하지 마라.

@.claude/rules/common/architecture.md
@.claude/rules/common/coding-style.md
@.claude/rules/common/git-workflow.md
@.claude/rules/common/security.md
@.claude/rules/common/testing.md
@.claude/rules/common/orchestration.md
@.claude/rules/common/mcp.md
@.claude/rules/common/automation.md

위 파일들의 룰은 컨텍스트로 자동 로드된다. "어떤 룰이 적용되나요?" 묻지 말고, 위 파일에 적힌 그대로 따라라. 의심되면 해당 파일을 즉시 Read해서 확인.

---

# Pointers

| 주제 | 파일 |
|------|------|
| Orchestration 전체 (파견 규칙, 체이닝, 병렬, 검증, TDD) | [`rules/common/orchestration.md`](.claude/rules/common/orchestration.md) |
| Hook/훅 프로파일/continuous learning/checkpoint/verification loop | [`rules/common/automation.md`](.claude/rules/common/automation.md) |
| MCP 서버 목록 + 활용 규칙 | [`rules/common/mcp.md`](.claude/rules/common/mcp.md) |
| 아키텍처 + 디렉터리 레이아웃 | [`rules/common/architecture.md`](.claude/rules/common/architecture.md) |
| 코딩 스타일 + 금지 패턴 | [`rules/common/coding-style.md`](.claude/rules/common/coding-style.md) |
| 보안 (JWT, 검증, OWASP) | [`rules/common/security.md`](.claude/rules/common/security.md) |
| 테스트 (TDD, coverage, mocking) | [`rules/common/testing.md`](.claude/rules/common/testing.md) |
| Git workflow (subtree, branch, commit) | [`rules/common/git-workflow.md`](.claude/rules/common/git-workflow.md) |
| 기술 스택 (Flutter/NestJS/Prisma/Next.js 버전 + 빌드 명령) | [`contexts/tech-stack.md`](.claude/contexts/tech-stack.md) |
| 스킬 내용 | `.claude/skills/*/SKILL.md` |
| 커맨드 내용 | `.claude/commands/*` |
