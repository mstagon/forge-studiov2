"$ARGUMENTS" 패턴을 평가하고 instinct로 저장한다.

## 프로세스

1. **패턴 추출**: $ARGUMENTS에서 학습할 패턴 식별
2. **기존 instinct 검색**: `docs/instincts.jsonl`에서 유사 패턴 탐색
3. **신뢰도 평가**:
   - 기존 패턴 → 신뢰도 +0.2, occurrences +1
   - 새 패턴 → 신뢰도 0.3, occurrences 1
4. **저장**: `docs/instincts.jsonl`에 JSONL 형식 추가
5. **승격 체크**: confidence >= 0.8 AND occurrences >= 3 → 승격 제안

## 형식

```jsonl
{"id":"inst-001","pattern":"...","confidence":0.5,"occurrences":2,"status":"confirmed","tags":["flutter"],"first_seen":"2024-01-15","last_seen":"2024-01-20"}
```

## vs /learn

- `/learn` — lessons-learned.md에 교훈 기록 (v1, 단순)
- `/learn-eval` — instincts.jsonl에 신뢰도 기반 저장 (v2, 고급)

둘 다 사용 가능. v2가 자동 승격/만료를 지원.
