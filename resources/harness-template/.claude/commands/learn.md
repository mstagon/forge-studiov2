"$ARGUMENTS" 교훈을 기록한다.

## 즉시 기록

`docs/lessons-learned.md`에 아래 형식으로 추가:

```markdown
### YYYY-MM-DD: [교훈 제목]
- **상황**: 무엇을 하고 있었는가
- **문제**: $ARGUMENTS
- **원인**: 왜 발생했는가
- **해결**: 어떻게 고쳤는가
- **방지**: 재발 방지 방법 (훅? 규칙? 스킬?)
- **태그**: #flutter #nestjs #prisma #nextjs #security #performance #architecture 중 해당
```

## 자동 Escalation 체크

기록 후 `docs/lessons-learned.md`를 스캔:
1. 같은 **태그** + 유사 **문제** 패턴이 3회 이상 → Escalation 후보
2. Escalation 후보가 있으면:
   - CLAUDE.md "금지 패턴"에 추가 제안
   - 해당 스킬 규칙 업데이트 제안
   - PreToolUse 훅으로 자동 차단 가능하면 훅 추가 제안
3. 유저 확인 후 반영

## 승격 이력

승격된 교훈은 원본에 `[ESCALATED → CLAUDE.md]` 마크 추가.
