"$ARGUMENTS" 작업을 멀티 에이전트 실행을 위해 분해한다.

## 프로세스

1. **작업 분석**: $ARGUMENTS를 독립 태스크로 분해
2. **의존성 그래프 작성**:
   ```
   Task A (독립) ──┐
   Task B (독립) ──├→ Task D (A,B 의존)
   Task C (독립) ──┘
   ```
3. **에이전트 배정**: 각 태스크에 최적 에이전트 매칭
4. **실행 계획 생성**: 병렬/순차 그룹 분류

## 출력

```markdown
## Multi-Agent Plan

### 태스크 분해
| # | 태스크 | 에이전트 | 의존성 | 병렬 그룹 |
|---|--------|---------|--------|----------|
| 1 | Prisma 스키마 | prisma-data | 없음 | A |
| 2 | NestJS API | nestjs-backend | #1 | B |
| 3 | CMS 페이지 | nextjs-cms | 없음 | A |
| 4 | Flutter UI | flutter-ui | #2 | C |

### 실행 순서
1. 병렬 그룹 A: #1, #3 동시 (worktree)
2. 순차: #2 (#1 완료 후)
3. 병렬 그룹 C: #4 (#2 완료 후)

→ `/multi-execute`로 실행
```

## 다음 단계
생성된 계획을 `/multi-execute`에 전달하여 실행.
