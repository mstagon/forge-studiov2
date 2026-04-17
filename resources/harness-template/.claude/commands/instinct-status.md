현재 학습된 instinct 목록을 조회한다.

## 프로세스

1. `docs/instincts.jsonl` 읽기
2. 상태별 분류 (pending/confirmed/promoted/expired)
3. 신뢰도 순 정렬

## 출력

```markdown
## Instinct Status

### Promoted (스킬/규칙 승격됨)
| ID | 패턴 | 신뢰도 | 발생 | 승격 위치 |
|----|------|:------:|:----:|----------|
| inst-003 | Prisma deleteMany에 where 필수 | 0.9 | 5 | CLAUDE.md 금지패턴 |

### Confirmed (확인됨, 승격 대기)
| ID | 패턴 | 신뢰도 | 발생 | 태그 |
|----|------|:------:|:----:|------|
| inst-007 | freezed 수정 후 build_runner 필수 | 0.7 | 3 | flutter |

### Pending (검증 중)
| ID | 패턴 | 신뢰도 | 발생 | 태그 |
|----|------|:------:|:----:|------|
| inst-012 | ... | 0.3 | 1 | nestjs |

### 통계
- 전체: N개
- 승격 가능 (confidence >= 0.8): M개 → `/evolve`로 승격
- 만료 대상 (confidence < 0.2): K개 → `/prune`로 정리
```
