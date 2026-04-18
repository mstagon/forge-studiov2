# Orchestration Rules (MANDATORY)

> CLAUDE.md에 ROLE = MANAGER 블록이 있다. 이 파일은 그 룰의 **operational
> 디테일**이다. 충돌 시 CLAUDE.md ROLE 블록이 우선.

## 핵심 원칙

1. **에이전트 자동 파견**: 요청 분석 → Agent Routing 매칭 → 즉시 파견. "어떤 에이전트 쓸까요?" 묻지 마라.
2. **스킬 자동 적용**: 파일 패턴 → Skill Routing 매칭 → 해당 스킬 읽고 적용. 스킬 적용 여부를 묻지 마라.
3. **커맨드 자동 실행**: verify, review 등 워크플로우 커맨드는 흐름에 따라 자동 트리거. 유저가 `/verify` 칠 필요 없다.
4. **팀 병렬 실행**: 독립 작업 2개 이상이면 Agent 도구를 한 메시지에서 병렬 호출 (`run_in_background: true`, `isolation: "worktree"`).
5. **자동 수정 루프**: 빌드/테스트 실패 시 loop-operator 자동 호출. 5회까지 자동 재시도.

## 자동 실행 플로우 (MAX RESOURCES — 항상 풀 파이프라인)

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
    - 결과 요약 테이블 출력
    - "커밋할까요?" (이것만 유저에게 묻는다)
```

## 에이전트 자동 파견 규칙

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
| UI/화면/위젯 관련 | pencil 확인 → mobile-design (MFRI) → flutter-ui → riverpod-logic |
| 제스처/햅틱/모션/애니메이션/트랜지션 | mobile-touch → flutter-ui (애니메이션 컨트롤러 + 스프링/이징 적용) |
| CMS/어드민 관련 | nextjs-cms 독립 실행 |

## 팀 에이전트 병렬 파견

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

## 스킬 자동 주입 (hook + AI 행동)

skill-injector.sh 훅이 파일 패턴을 감지하고, 나(Claude)는 해당 스킬을 **읽고 적용**한다:

- `lib/domain/entity/` 편집 → freezed-models 스킬 → freezed 패턴, build_runner 후처리
- `lib/presentation/` 편집 → riverpod-patterns + go-router + **mobile-design** + **mobile-touch**
  - mobile-design: MFRI(Mobile Feasibility & Risk Index) 평가 → 화면 구조/네비/컬러/타이포 의사결정
  - mobile-touch: Disney 12 원칙 → 제스처/햅틱/스프링/이징/오버스크롤 모션
- `server/src/auth/` 편집 → nestjs-auth 스킬 → JWT, Passport, Guard 패턴
- `server/src/**/dto/` 편집 → api-contract 스킬 → NestJS↔Flutter DTO 동기화
- `prisma/schema.prisma` 편집 → prisma-patterns + postgres-patterns 스킬
- 스킬이 매칭되면 `.claude/skills/{name}/SKILL.md`를 읽고 규칙을 따른다

## 검증 자동화 (구현 완료 → 풀 검증 파이프라인)

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

## TDD 기본 적용 (모든 구현에 자동)

모든 구현 요청에 TDD가 기본 적용된다:

1. **Red**: test-writer가 실패하는 테스트 먼저 작성
2. **Green**: 구현 에이전트가 테스트 통과하는 최소 코드 작성
3. **Refactor**: refactor-cleaner가 중복 제거 + 구조 개선 (테스트 유지)

- 스택별: Flutter는 unit/widget test, NestJS는 Jest test
- 커버리지 80% 미달 → test-writer가 추가 테스트 자동 작성

## 체이닝 패턴 (항상 MAX — TDD + 풀 파이프라인)

```
[단일 스택]   요청 → TDD 테스트 → 구현 → 리팩토링 → 검증 → 리뷰 → 문서 → 체크포인트 → 보고
[크로스 스택] 요청 → TDD → 의존성 순서 체이닝 → sync → 검증 → 리뷰 → 문서 → 체크포인트 → 보고
[자율 루프]   loop-operator → 빌드 → 테스트 → 수정 반복 (조건 충족까지)
```

## 병렬 실행 가능 (팀 파견)

- code-reviewer + security-auditor + spec-verifier (리뷰 3종 동시)
- flutter-ui + nestjs-backend (독립 기능일 때 동시)
- flutter-ui + riverpod-logic (같은 스택 내 분업)
- test-writer 내 Flutter test + NestJS test (동시)
- nextjs-cms는 항상 독립 병렬 가능

## 절대 병렬 불가 (순서 필수)

- prisma-data → nestjs-backend (스키마가 먼저)
- nestjs-backend → Flutter DTO sync (API가 먼저)
- 구현 → 검증 → 리뷰 (순차)

## 파이프라인 (의존성 순서)

```
PLAN → SCHEMA → BACKEND → FRONTEND → CMS → TEST → SYNC → REVIEW
 ↑        ↑         ↑          ↑        ↑      ↑       ↑       ↑
planner prisma   nestjs    flutter   nextjs  test   api-    code-reviewer
+arch    data   backend   ui+logic    cms   writer contract +security+spec
```

## Agent Teams (git worktree 병렬)

독립 작업을 `isolation: "worktree"`로 동시 실행. 각 에이전트는 격리된 worktree에서
작업 → 완료 후 머지.

## 유저에게 묻는 경우 (이것만)

- 🚦 **설계 GATE**: 큰 피처의 아키텍처 설계 리뷰
- 🔀 **머지 충돌**: worktree 병렬 실행 후 충돌 발생 시
- ❓ **모호한 요청**: 여러 해석이 가능할 때 (어떤 의도인지)
- 🔄 **5회 실패**: 자동 수정이 5회에도 해결 안 될 때
- 💀 **위험 작업**: 파괴적 명령 (reset, force push, 대량 삭제)
- 📦 **커밋/배포**: 커밋 여부, subtree-push 여부

그 외 모든 것(리뷰, 테스트, 리팩토링, 문서, 체크포인트, 학습)은 **묻지 않고 자동 실행**한다.
