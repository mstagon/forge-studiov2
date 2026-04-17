# Continuous Learning v2 — Instinct System

신뢰도 점수 기반 패턴 학습 시스템.

## 개념

**Instinct** = 경험에서 추출된 패턴 + 신뢰도 점수

```yaml
id: "inst-001"
pattern: "Prisma deleteMany 호출 시 반드시 where 조건 확인"
confidence: 0.8  # 0.0 ~ 1.0
occurrences: 3
first_seen: "2024-01-15"
last_seen: "2024-01-20"
status: "confirmed"  # pending | confirmed | promoted | expired
source: "lesson"  # lesson | success | review | error
tags: ["prisma", "safety"]
```

## 신뢰도 점수

| 이벤트 | 점수 변화 |
|--------|----------|
| 첫 발견 (실수) | +0.3 |
| 첫 발견 (성공 패턴) | +0.2 |
| 동일 패턴 재발견 | +0.2 |
| 유저 확인 (맞음) | +0.3 |
| 유저 부정 (틀림) | -0.5 |
| 30일 미발생 | -0.1/월 |

## 상태 흐름

```
발견 → pending (confidence < 0.5)
     → confirmed (confidence >= 0.5, occurrences >= 2)
     → promoted (confidence >= 0.8, occurrences >= 3) → 스킬/규칙 승격
     → expired (confidence < 0.2 또는 60일 미발생)
```

## 저장 위치

`docs/instincts.jsonl` — 한 줄당 하나의 instinct (JSON Lines)

## 커맨드 연계

- `/learn-eval` — 패턴 추출 + 신뢰도 평가 + 저장
- `/instinct-status` — 현재 instinct 목록 조회
- `/instinct-export` — 다른 프로젝트로 이식
- `/instinct-import` — 외부 instinct 가져오기
- `/evolve` — confirmed → promoted, 스킬/규칙 승격
- `/prune` — expired/저신뢰 instinct 정리

## 승격 기준

confidence >= 0.8 AND occurrences >= 3:
1. 코딩 패턴 → `.claude/rules/` 규칙 파일
2. 워크플로우 패턴 → `.claude/skills/` 스킬
3. 금지 패턴 → CLAUDE.md 금지 패턴 섹션
