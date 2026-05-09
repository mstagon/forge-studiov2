# Forge Studio v2 — Project CLAUDE.md

이 프로젝트는 **Forge Studio** — Claude Code 를 데스크톱 앱으로 감싼 Electron + React + Vite 프로젝트.

## 다음 세션이 반드시 먼저 읽을 것

**[docs/roadmap-v0.6.6-v0.8.md](docs/roadmap-v0.6.6-v0.8.md)** —
컨텍스트 클리어 이후 작업 이어가는 기준 문서. 현재 단계, 막힌 이슈, 단계별
plan, 모델 매핑, Council 메커니즘, 빌드 명령 모두 정리.

## 현재 상태 (요약)

- **버전**: v0.6.5 빌드 완료, 사용자 검증 대기 중
- **다음 작업**: v0.6.6 — worktree 생성 fix (baseBranch 네이밍 변경) + inbox UI
- **이후 milestone**: v0.7.0 (Council + ProviderRouter), v0.8.0 (Sprint Manager UI)

## 절대 정책

- **서브에이전트 (`Agent` / `Task` 도구) 사용 금지** — `permissions.deny` + PreToolUse 훅 차단됨
- 모든 위임은 **`forge-team` CLI** 로만 (격리 worktree + tmux + 별 Claude 인스턴스)
- 커밋 메시지 **한국어 필수** (subject 에 한글 1자 이상). Co-Author trailer 금지. `git add -A` / `-am` 한 방 커밋 금지
- 위 룰들 PreToolUse 훅이 자동 차단

## 빠른 참조

| 항목 | 위치 |
|---|---|
| 다음 단계 plan | `docs/roadmap-v0.6.6-v0.8.md` |
| 메인 세션 ROLE | `resources/harness-template/CLAUDE.md` |
| forge-team CLI | `bin/forge-team` + `bin/forge-team.ts` |
| 팀 라이프사이클 (순수) | `electron/services/TeamOperations.ts` |
| App 레벨 PTY pool | `src/components/v2/LiveTerminalsRoot.tsx` |
| 활성 팀 store | `src/stores/liveTerminals.ts` |
| 빌드 명령 | `npm run release:dmg` |

## 사용자 호출 패턴

```bash
# 현재 빌드 띄우기
pkill -f "Forge Studio" ; sleep 1
xattr -cr "/Applications/Forge Studio.app" 2>/dev/null
open "release/mac-arm64/Forge Studio.app"
```

## 메모

- 사용자 GitHub: mstagon
- 릴리즈 시 `gh auth switch -u mstagon` 필요
- Apple Developer ID 없음 (ad-hoc codesign) — 사용자가 quarantine 우회 필요
