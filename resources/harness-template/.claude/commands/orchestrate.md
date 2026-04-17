"$ARGUMENTS" 작업을 자율 오케스트레이션으로 실행한다.

이 커맨드는 명시적으로 호출할 수도 있지만, CLAUDE.md의 "자율 오케스트레이션" 규칙에 따라 **모든 구현 요청에 자동으로 적용**된다.

## 자동 실행 프로세스

### 1단계: 분석 (즉시)
- $ARGUMENTS의 영향 스택 파악 (Flutter/NestJS/Prisma/CMS)
- 필요한 에이전트 자동 매칭 (Agent Routing 테이블)
- 적용할 스킬 자동 결정 (Skill Routing 테이블)
- 의존성 → 순차 체이닝 / 독립 → 병렬 팀 파견

### 2단계: 에이전트 파견 (자동)

#### 독립 작업 → 팀 병렬 파견
```
Agent(에이전트A, run_in_background: true, isolation: "worktree") → 작업1
Agent(에이전트B, run_in_background: true, isolation: "worktree") → 작업2
Agent(에이전트C, run_in_background: true, isolation: "worktree") → 작업3
→ 전체 완료 → 결과 머지
```

#### 의존 작업 → 순차 체이닝
```
Agent(prisma-data) → 완료 확인
  → Agent(nestjs-backend) → 완료 확인
    → Agent(flutter-ui) + Agent(riverpod-logic) → 병렬 가능
      → 완료 확인
```

### 3단계: 자동 검증
구현 완료 → 변경 스택별 빌드/테스트/lint 자동 실행
- PASS → 4단계로
- FAIL → loop-operator 자동 수정 (최대 5회)

### 4단계: 보고 + 다음 액션
```
## 오케스트레이션 결과: $ARGUMENTS

| 단계 | 에이전트 | 상태 | 변경 파일 |
|------|---------|:----:|:--------:|
| Schema | prisma-data | ✅ | 2 |
| Backend | nestjs-backend | ✅ | 8 |
| Frontend | flutter-ui | ✅ | 5 |
| State | riverpod-logic | ✅ | 3 |
| 검증 | 자동 | ✅ PASS | — |

→ 리뷰 진행할까요?
```

## 자동 라우팅 규칙

| 요청 패턴 | 실행 모드 | 파견 방식 |
|-----------|----------|----------|
| 단일 파일 수정 | 직접 | 에이전트 1개 |
| 한 스택 피처 | 체이닝 | 에이전트 → test → 검증 |
| 크로스 스택 피처 | 체이닝 | 의존성 순서 자동 |
| 독립 다중 피처 | 팀 병렬 | worktree 동시 실행 |
| 전체 피처 | full-cycle | 8단계 파이프라인 (GATE 포함) |
| 리뷰 요청 | 팀 병렬 | 3종 리뷰 동시 |
| 빌드 에러 | 자동 수정 | build-error-resolver + loop-operator |
| 리팩토링 | 직접 | refactor-cleaner |
