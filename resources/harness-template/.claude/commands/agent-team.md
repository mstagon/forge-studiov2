"$ARGUMENTS" 작업을 Forge Team 으로 병렬 실행한다.

> ⚠️ **이 커맨드는 `forge-team` CLI 를 호출한다**. `Agent` / `Task` 도구는
> 차단되어 있으므로 절대 사용하지 마라.

## Forge Team 시스템

독립적인 작업을 여러 멤버가 **격리 git worktree + tmux 세션 + 별 Claude 인스턴스**
로 동시에 실행. 각 멤버는 자기 worktree 에서 자기 task 만 수행하고, 완료 후
베이스 브랜치로 머지.

## 실행 모드

### Mode 1: 병렬 구현 (독립 피처)
```
/agent-team "auth API + board UI + CMS dashboard"

→ Bash(forge-team create \
    --workspace . \
    --name "multi-feature" \
    --members "nestjs-backend:auth API,flutter-ui:board UI,nextjs-cms:CMS dashboard" \
    --worktree-strategy isolated \
    --merge-strategy squash \
    --auto-start)
→ 3개 worktree + 3개 tmux + 3개 Claude
→ 완료 후 forge-team merge
```

### Mode 2: 병렬 리뷰 (동시 검수)
```
/agent-team "review"

→ Bash(forge-team create \
    --workspace . \
    --name "review-team" \
    --members "code-reviewer:diff 리뷰,security-auditor:취약점,spec-verifier:스펙 정합성")
→ 결과 취합 → 종합 보고서
```

### Mode 3: 스택별 병렬 테스트
```
/agent-team "test all"

→ Bash(forge-team create \
    --workspace . \
    --name "test-all" \
    --members "test-writer:flutter test,test-writer:server jest test,test-writer:cms build")
→ 결과 취합
```

## 실행 절차

1. **작업 분해**: $ARGUMENTS를 독립 단위로 분해
2. **의존성 확인**: 순서 필수인 것과 병렬 가능한 것 분류
   - 순서 필수: prisma → nestjs → flutter DTO (체이닝 — sequential merge)
   - 병렬 가능: 독립 피처, 리뷰 3종, 테스트 (squash merge)
3. **forge-team create**: 멤버 명단 + 전략 결정 후 단일 CLI 호출
4. **결과 수집**: tmux 세션 관찰 또는 `forge-team list` 로 상태 폴링
5. **머지 전략**: `forge-team merge` 자동 호출
   - 충돌 없으면: squash 또는 sequential 머지 진행
   - 충돌 있으면: exit 2 + conflict 정보 → 수동 해결 요청
6. **통합 검증**: 머지 후 `/review` 실행

## 절대 하면 안 되는 것

- ❌ `Agent` / `Task` 도구 호출 — `permissions.deny` 차단됨
- ❌ 메인 세션이 직접 5줄 이상 코드 작성
- ❌ `git worktree add` 직접 — `forge-team create` 가 처리

## 워크트리 규칙

- 멤버 브랜치 네이밍: `team/<teamId>/<agentId>` (forge-team 자동 생성)
- 베이스 브랜치: `team/<teamId>` (forge-team 자동 생성)
- 작업 완료 후 `forge-team remove` 로 정리 (worktree + branch + tmux)
- 메인 브랜치 직접 수정 금지

## 적합한 작업 vs 부적합

✅ 적합:
- 독립 스택 피처 동시 구현
- 리뷰 3종 병렬
- 테스트 병렬
- 리팩토링 + 테스트 동시

❌ 부적합:
- DB 스키마 → API → DTO 체이닝 (의존성 있음 — sequential merge 권장)
- 같은 파일 수정하는 작업
- 순차 워크플로우 (→ `/full-cycle` 사용)

## Output

```
## Forge Team 결과

| Member | 작업 | 브랜치 | 상태 | 변경 파일 |
|--------|------|--------|------|-----------|
| nestjs-backend | auth API | team/<id>/nestjs-backend | ✅ | 12 files |
| flutter-ui | board UI | team/<id>/flutter-ui | ✅ | 8 files |
| nextjs-cms | CMS dash | team/<id>/nextjs-cms | ✅ | 6 files |

### 머지 상태
- forge-team merge: exit 0 / exit 2 (conflict)
- → 자동 머지 완료 / 수동 해결 필요

### 통합 검증
- flutter analyze: ✅
- npm run lint: ✅
- 전체 테스트: ✅
```
