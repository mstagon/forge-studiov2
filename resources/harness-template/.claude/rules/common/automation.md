# Automation Rules — Harness Framework Internals

## Hook 스크립트 (자동 트리거)

| 스크립트 | 훅 | 동작 |
|---------|-----|------|
| `gateguard.sh` | PreToolUse Write/Edit | 첫 편집 시 조사 강제 (30분 TTL) |
| `skill-injector.sh` | PreToolUse Write/Edit | 파일 패턴 → 스킬 자동 매칭 + 주입 |
| `tmux-dev.sh` | PreToolUse Bash | dev 서버 → tmux 세션 자동 전환 |
| `auto-profile.sh` | SessionStart | 브랜치 기반 훅 프로파일 자동 감지 |
| `learn.sh` | Stop | 교훈 반복 패턴 탐지 (3회+ → 승격) |
| `cost-tracker.sh` | Stop | 세션 메트릭스 JSONL 기록 |
| `mcp-health.sh` | SessionStart | MCP 서버 헬스체크 (지수 백오프) |
| `hook-profiles.sh` | 유틸리티 | minimal/standard/strict 프로파일 |
| `pre-compact.sh` | PreCompact | 컴팩션 전 상태 보존 |
| `evaluate-session.sh` | Stop | 세션에서 패턴 추출 + 신뢰도 평가 |

## Hook Profile (auto-profile.sh가 브랜치 기반 자동 감지)

```
prd, stg, hotfix/*  → strict   (엄격 검증)
dev, feat/*, fix/*  → standard (일반 개발)
explore/*, poc/*    → minimal  (프로토타이핑)
```

## Continuous Learning v2 (자동 — 세션 종료 시 전부 실행)

```
세션 종료 →
  1. learn.sh (Stop 훅) → 교훈 기록
  2. evaluate-session.sh (Stop 훅) → 패턴 추출 + 신뢰도 평가
  3. learn-eval 자동 → instinct 기록 (신뢰도 점수)
  4. 3회+ 확인 → evolve 자동 → 스킬 승격
  5. 만료/저신뢰 → prune 자동 → 정리
```

## Verification Loop (자동 — 구현 완료 시 풀 체인)

```
구현 완료 →
  1. /verify → 빌드 + 테스트 + lint
  2. /test-coverage → 커버리지 측정 (80% 미달 시 test-writer 자동 보강)
  3. /api-sync → DTO 동기화 확인
  4. /eval → 품질 기준 평가
  5. FAIL → loop-operator 자동 수정 → 재검증
  6. PASS → /review 3종 자동 실행
  7. 리뷰 PASS → /update-docs + /checkpoint save 자동
```

## Checkpoint (자동 — 피처 완료 시 자동 저장)

```
피처 구현 + 검증 + 리뷰 PASS → 자동 checkpoint save [피처명]

수동으로도 가능:
  /checkpoint list            → 목록
  /checkpoint diff [이름]     → 비교
  /checkpoint restore [이름]  → 복원 (자동 백업)
```

## 자기개선

- 실수 → `docs/lessons-learned.md` 기록 → 3회 반복 시 CLAUDE.md 승격
- `/retrospective`로 세션 회고
- `/evolve`로 학습 패턴 → 스킬 승격
- `harness-optimizer`로 하네스 자체 개선
