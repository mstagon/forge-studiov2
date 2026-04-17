"$ARGUMENTS" 작업을 Agent Team으로 병렬 실행한다.

## Agent Team 시스템

독립적인 작업을 여러 에이전트가 **git worktree 기반으로 동시에** 실행.
각 에이전트는 격리된 브랜치에서 작업하고, 완료 후 메인 브랜치에 머지.

## 실행 모드

### Mode 1: 병렬 구현 (독립 피처)
```
/agent-team "auth API + board UI + CMS dashboard"

→ Worktree A: nestjs-backend → auth API 구현
→ Worktree B: flutter-ui → board UI 구현
→ Worktree C: nextjs-cms → CMS dashboard 구현
→ 완료 후: 각 브랜치 리뷰 → 순차 머지
```

### Mode 2: 병렬 리뷰 (동시 검수)
```
/agent-team "review"

→ Agent A (isolation: worktree): code-reviewer
→ Agent B (isolation: worktree): security-auditor
→ Agent C (isolation: worktree): spec-verifier
→ 결과 취합 → 종합 보고서
```

### Mode 3: 스택별 병렬 테스트
```
/agent-team "test all"

→ Agent A: flutter test (lib/)
→ Agent B: npm test (server/)
→ Agent C: npm run build (cms/)
→ 결과 취합
```

## 실행 절차

1. **작업 분해**: $ARGUMENTS를 독립 단위로 분해
2. **의존성 확인**: 순서 필수인 것과 병렬 가능한 것 분류
   - 순서 필수: prisma → nestjs → flutter DTO (체이닝)
   - 병렬 가능: 독립 피처, 리뷰 3종, 테스트
3. **Agent 실행**: 각 Agent를 `isolation: "worktree"`로 실행
4. **결과 수집**: 각 Agent 완료 대기
5. **머지 전략**:
   - 충돌 없으면: 순차 머지
   - 충돌 있으면: 수동 해결 요청
6. **통합 검증**: 머지 후 `/review` 실행

## 워크트리 규칙

- 브랜치 네이밍: `agent/{task-name}-{timestamp}`
- 작업 완료 후 워크트리 자동 정리 (변경 없으면)
- 변경 있으면 브랜치 + 경로 반환 → 유저가 머지 결정
- 메인 브랜치 직접 수정 금지

## 적합한 작업 vs 부적합

✅ 적합:
- 독립 스택 피처 동시 구현
- 리뷰 3종 병렬
- 테스트 병렬
- 리팩토링 + 테스트 동시

❌ 부적합:
- DB 스키마 → API → DTO 체이닝 (의존성 있음)
- 같은 파일 수정하는 작업
- 순차 워크플로우 (→ `/full-cycle` 사용)

## Output

```
## Agent Team 결과

| Agent | 작업 | 브랜치 | 상태 | 변경 파일 |
|-------|------|--------|------|-----------|
| A | auth API | agent/auth-xxx | ✅ | 12 files |
| B | board UI | agent/board-xxx | ✅ | 8 files |
| C | CMS dash | agent/cms-xxx | ✅ | 6 files |

### 머지 상태
- 충돌: 없음 / N건
- → 순차 머지 진행 / 수동 해결 필요

### 통합 검증
- flutter analyze: ✅
- npm run lint: ✅
- 전체 테스트: ✅
```
