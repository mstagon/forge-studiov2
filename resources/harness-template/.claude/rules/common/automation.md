# Automation Rules — Harness Framework Internals

## Hook 스크립트 (자동 트리거)

| 스크립트 | 훅 | 동작 |
|---------|-----|------|
| `gateguard.sh` | PreToolUse Write/Edit | 첫 편집 시 조사 강제 (30분 TTL). minimal/ultracode 우회 |
| `skill-injector.sh` | PreToolUse Write/Edit | 파일 패턴 → 스킬 + 룰 lazy-load 주입. ultracode 우회 |
| `compress-bash-output.sh` | PreToolUse Bash | 출력 폭탄 명령 head150+tail20 압축 wrap (Headroom 패턴) |
| `tmux-dev.sh` | PreToolUse Bash | dev 서버 → tmux 세션 자동 전환 |
| `auto-profile.sh` | SessionStart | 훅 프로파일 자동 감지 (브랜치 + effortLevel + 세션 종류) |
| `forge-mcp-profile.sh` | SessionStart | stack 감지 → MCP per-workspace 자동 활성 (다음 세션 적용) |
| `mcp-health.sh` | SessionStart | MCP 서버 헬스체크 (지수 백오프) |
| `learn.sh` | Stop | 교훈 반복 패턴 탐지 (3회+ → 승격). ultracode/minimal 우회 |
| `cost-tracker.sh` | Stop | 세션 메트릭스 JSONL 기록. ultracode/minimal 우회 |
| `evaluate-session.sh` | Stop | 세션 패턴 추출 + 신뢰도 평가. ultracode/minimal 우회 |
| `forge-dto-broadcast.sh` | Stop | 멤버 DTO/contracts 변경 → 다른 멤버 inbox broadcast |
| `forge-symbol-guard.sh` | Stop | 멤버 간 같은 함수 동시 수정 감지 → 양쪽 경보 (Wit lite) |
| `forge-main-poll.sh` | Stop | 메인 세션이 팀 신호 (done 등) 자동 surface |
| `hook-profiles.sh` | 유틸리티 | minimal/standard/strict/ultracode 프로파일 판정 |
| `pre-compact.sh` | PreCompact | 하네스 상태 스냅샷 → `.claude/compact-state.md` (팀/inbox/계약/git) |
| `forge-lineage-restore.sh` | SessionStart | 48h 이내 스냅샷 있으면 Read 포인터 surface |
| `forge-code-graph.sh` | SessionStart | HEAD 변경 시 code-review-graph 인덱스 백그라운드 갱신 |

## Hook Profile (auto-profile.sh 가 자동 감지)

우선순위: env/파일 override (`FORGE_HOOK_PROFILE`, `.claude/hook-profile`) →
prd/stg/hotfix 브랜치 → 메인 세션 + effortLevel=max → 브랜치 기본값.
프로파일은 프로젝트별 파일 (`/tmp/forge-hook-profile-<md5>`) 에 기록되어
워크스페이스/멤버 worktree 간 격리된다.

```
prd, stg, hotfix/*            → strict    (엄격 검증)
메인 세션 + effortLevel=max   → ultracode (gateguard/스킬주입/학습 훅 우회 — 안전 차단은 유지)
dev, feat/*, fix/*            → standard  (일반 개발 — 멤버 세션 기본)
explore/*, poc/*              → minimal   (프로토타이핑)
```

멤버 세션 (FORGE_TEAM_ID set) 은 ultracode 가 적용되지 않는다 — 멤버 가드는 항상 유지.

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
