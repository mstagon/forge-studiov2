확인된 instinct를 스킬/규칙으로 승격한다.

## 프로세스

1. `docs/instincts.jsonl`에서 승격 대상 필터링
   - confidence >= 0.8 AND occurrences >= 3
   - status == "confirmed"
2. 각 instinct의 승격 대상 결정:
   - 코딩 패턴 → `.claude/rules/` 규칙 파일
   - 워크플로우 패턴 → `.claude/skills/` 스킬
   - 금지 패턴 → CLAUDE.md 금지 패턴 섹션
3. 유저 확인 후 승격 적용
4. instinct 상태를 "promoted"로 업데이트

## 출력

```markdown
## Evolve — 승격 후보

| # | 패턴 | 신뢰도 | 승격 대상 |
|---|------|:------:|----------|
| 1 | "Controller에서 Prisma 직접 호출 금지" | 0.9 | CLAUDE.md 금지패턴 |
| 2 | "freezed 수정 후 build_runner" | 0.85 | rules/flutter.md |

승격하시겠습니까? (전체/선택/취소)
```
