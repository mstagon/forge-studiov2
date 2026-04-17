"$ARGUMENTS" 멀티 에이전트 실행 계획을 실행한다.

## 프로세스

1. **계획 로드**: `/multi-plan` 결과 또는 $ARGUMENTS에서 실행 계획 파싱
2. **병렬 그룹 실행**:
   - 각 독립 태스크를 `isolation: "worktree"`로 에이전트 실행
   - 의존성 있는 태스크는 선행 태스크 완료 대기 후 실행
3. **결과 수집**: 각 에이전트 완료 대기
4. **머지 전략**:
   - 충돌 없음 → 순차 머지
   - 충돌 있음 → 수동 해결 요청
5. **통합 검증**: `/verify` 실행

## vs /agent-team

- `/agent-team` — 단순 병렬 (동시에 실행하고 결과 수집)
- `/multi-execute` — DAG 기반 (의존성 순서 + 병렬 조합)

## 출력

```markdown
## Multi-Execute Result

| # | 태스크 | 에이전트 | 브랜치 | 상태 | 파일 |
|---|--------|---------|--------|:----:|------|
| 1 | Prisma 스키마 | prisma-data | agent/prisma-xxx | OK | 3 |
| 2 | NestJS API | nestjs-backend | agent/api-xxx | OK | 8 |
| 3 | CMS | nextjs-cms | agent/cms-xxx | OK | 5 |

### 머지: 충돌 없음 → 순차 머지 완료
### 통합 검증: /verify PASS
```
