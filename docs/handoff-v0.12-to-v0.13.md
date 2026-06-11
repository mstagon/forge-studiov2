# Handoff — v0.12.0 → v0.13.0 작업 인수인계

**작성**: 2026-06-11
**전환 사유**: Opus 4.7 (1M) → Opus 4.8 + ultracode mode 로 컨텍스트 새로 시작
**다음 세션 첫 행동**: 이 문서를 Read 한 후 "최근 commit + 펜딩 작업" 섹션부터 확인

---

## 1. 직전 세션 마지막 상태

### 설치된 빌드
- **버전**: Forge Studio `v0.12.0` (이미 `/Applications/Forge Studio.app` 배포 + 실행 중)
- **태그**: `v0.11.1` 만 GitHub release. v0.12.0 은 빌드만 됐고 **release 안 만듦**
- **최근 commit chain** (`git log --oneline -15`):
  ```
  b66eff4 chore(mcp): 더 공격적으로 최소화 — context7 만 자동
  db3e785 feat(v0.12.0): Claude 4.8/GPT 5.5 + DTO 정합성 hook + 메인 폴링 hook + MCP 정리
  d657838 fix(security+team): Codex 적대 검수 7 개 결함 일괄 fix
  9ad1bce chore(release): 0.11.1
  10173e4 fix(team): 멤버 task prompt 에 forge-team complete 호출 안내 추가
  ```
- **origin/main 상태**: v0.11.1 까지 push 됨. **v0.12.0 commits 는 local 만 — push 안 됨**

### 환경
- 마지막 cleanup: 5/27 에 모든 zombie 정리 (forge-team session 0, dead MCP 55+ 개 kill, orphan branches 0)
- 5/27~6/11 사이 다시 누적될 가능성 있음 — pickup 시 inventory 먼저
- macOS APFS path 인코딩 (NFD) vs forge-team CLI 의 NFC 비교 결함 fix 완료 (App.tsx String.normalize('NFC') 양쪽 적용)

---

## 2. v0.12.0 에서 들어간 것 (사용자 검수 대기 중)

| Fix | 위치 | 사용자 검증 |
|---|---|---|
| Codex 7 개 결함 fix (path traversal / 조기 merge / prompt injection / done UI / council watcher / flap suppress / shared task brief) | `d657838` | 완료 (smoke 5/5) |
| Claude 4.7→4.8 일괄 갱신 | 9 파일 | 사용자 확인 X (다음 빌드부터 적용) |
| `forge-dto-broadcast.sh` Stop hook — DTO 파일 변경 시 다른 멤버 inbox broadcast | `db3e785` | 사용자 확인 X — 실제 cross-stack 팀에서 동작 검증 필요 |
| `forge-main-poll.sh` Stop hook — 메인 세션이 모든 팀 main inbox 폴링해서 stdout 으로 surface (next turn 컨텍스트 자동 주입) | `db3e785` | 사용자 확인 X |
| `complete-member` 신규 CLI (멤버용) vs `complete` (orchestrator 용) 분리 | `d657838` | 사용자 확인 X |
| MCP 다이어트 — 하네스 1 개 (context7), 전역 2 개 (context7+filesystem) | `b66eff4` | 사용자 확인 X |

**다음 세션이 검증해야 할 것**:
- 새 팀 만들면 `.claude/forge-task-<agentId>.md` 로 멤버별 격리되어 생기는지
- 멤버 task 끝낼 때 `forge-team complete-member` 호출 안내 따르는지
- DTO broadcast 가 실제 cross-stack 팀에서 fire 되는지

---

## 3. 사용자가 마지막 메시지에서 새로 보고한 결함

> "팀도 작업 끝친거 바로 안 없애더라"
> "가끔 1인팀을 마구마구 만들던데"
> "팀관련 로직도 좀 전부 손보고 최적화"

**해석**:
1. **팀 자동 정리 안 됨** — `forge-team complete` 또는 모든 멤버 complete 후에도 worktree / tmux session / config 가 남아있음. GUI 의 "Close team" 또는 자동 archive 필요
2. **1인팀 남발** — 메인 세션이 "phase-1 백엔드 한 명만", "phase-2 프론트 한 명만" 식으로 단일 멤버 팀 연속 생성. 카테고리 분리는 OK 지만 매 단일-멤버 팀이 4-5개 누적 → CPU/디스크 낭비
3. **팀 관련 로직 전체 손보기** — 위 두 개 포함 전반적 검토

**해결 방향 (다음 세션 작업)**:
- 자동 cleanup: 팀 status='done' + N 분 idle → worktree archive + tmux kill + config 보존 (history 로)
- 1인팀 보호: forge-team create 시 멤버 1 명이면 경고 + "정말 단일 멤버? 메인 세션이 직접 해도 되는데" 확인. 또는 자동 batch: 같은 phase 의 단일 멤버 팀들을 합치기
- GUI: "Active teams" 와 "Done/Archived teams" 분리 표시

---

## 4. P0~P2 최적화 plan (다음 세션 = v0.13.0 = P0 4 개)

리서치 결과 + 분석 합의된 우선순위 (전체 plan 은 직전 세션에서 user 에게 제출, 동의 받음):

### v0.13.0 = P0 (작업량 3 일, 큰 임팩트 + 적은 작업)

**P0-1. 토큰 다이어트** — CLAUDE.md + rules → lazy-load
- 현재 SessionStart 에 CLAUDE.md 599 + rules 659 = **1258 줄 강제 로드**
- 목표: CLAUDE.md ~150 줄 (포인터만), rules 8개를 skill 로 변환 + file-pattern trigger
- 결과: SessionStart 토큰 ~80% 절감 (1258 → 250)
- 파일: `resources/harness-template/CLAUDE.md`, `resources/harness-template/.claude/rules/common/*.md`, `resources/harness-template/.claude/scripts/skill-injector.sh`

**P0-2. Headroom 패턴 — bash output 압축**
- 새 PostToolUse hook `compress-bash-output.sh`
- Heuristics: >100 줄 = head20+tail5+count, JSON >10 아이템 = collapse, file tree = depth 제한
- Per Bash 호출 50-90% 토큰 절감 (특히 `ls -la node_modules`, `git log`, `npm ls` 등)

**P0-3. Ultracode 모드 프로파일**
- 사용자 요구: 메인 세션을 Opus 4.8 + ultracode 로 돌릴 예정
- 새 hook profile `ultracode` (minimal/standard/strict 와 별도)
- 메인이 max capability 라 하네스 hand-holding 제거:
  - Stop hook 의 cost-tracker / learn / evaluate-session 우회 (3 개 hook off)
  - gateguard.sh 의 5개 조사 체크리스트 강제 stdout 우회 (메인은 이미 알아서 검증)
  - skill-injector 도 메인 세션 (FORGE_TEAM_ID 없음) 일 때는 less aggressive
- 메인 turn latency ↓
- auto-profile.sh 가 branch + 사용자 설정 보고 자동 선택

**P0-4. MCP profile 동적 선택**
- `forge-mcp-profile.sh` SessionStart hook (또는 워크스페이스 setup 시)
- 워크스페이스 stack 자동 감지:
  - `pubspec.yaml` 있으면 → dart MCP 추가
  - `playwright.config.{ts,js}` 있으면 → playwright MCP 추가
  - `package.json` 에 `@supabase/*` 있으면 → supabase 추가 (선택)
- 또는 GUI Settings: "Per-workspace MCP enable" 토글
- 결과: Flutter 안 쓰는 워크스페이스는 dart MCP 안 켜짐

**+ 사용자 신규 요구 합치기**:
- 팀 자동 cleanup (done 후 N 분 idle → archive)
- 1인팀 경고 / batch

---

### v0.14.0 = P1 (작업량 1 주)

- **P1-5**: Context lineage compression (Hermes — Haiku 4.5 로 older turns 요약)
- **P1-6**: Symbol-level lock (Wit 패턴 — tree-sitter AST 기반 멤버 간 함수/클래스 충돌)
- **P1-7**: DTO contract-first 디렉토리 (`<workspace>/contracts/`)
- **P1-8**: Code graph 자동화 (tree-sitter → `.claude/code-graph/`)

### v0.15+ = P2

- Obsidian vault 양방향 (`<workspace>/.obsidian-vault/`)
- SCIP semantic search (대형 monorepo)
- spec→DAG→execute→backprop (Forge.dev 스타일)
- Multi-provider (Bedrock / Gemini)

---

## 5. 외부 리서치 핵심 인사이트 (다음 세션 참고)

리서치 에이전트가 정리한 2026 동향:

- **Hermes (Nous Research)**: 9-component agent harness. **Provider abstraction / Context lineage / Tool registration ≠ exposure / SQLite+FTS session plane / Editor-agnostic**. Forge 와 가장 비슷한 영감 소스
- **OpenCode (172k stars)**: CLI coding agent 중 1 위. cmux 21.5k 도 강자
- **Headroom**: 60-95% 토큰 절감 도구 — wrapping bash output / RAG chunks. **P0-2 의 직접 근거**
- **LangGraph vs CrewAI vs AutoGen**: prod 는 LangGraph, prototype 은 CrewAI. Forge 의 forge-team CLI 가 CrewAI-style → OK
- **Sourcegraph Cody**: SCIP + tree-sitter + embedding RAG. 3-layer context (local file / repo / remote). P2 의 reference
- **Wit pattern**: tree-sitter AST symbol lock for parallel agents. P1-6 직접 차용
- **Forge.dev**: spec → DAG → execute → backprop bug-to-spec. P2 (autonomous loop)
- **Smart Connections (Obsidian)**: 로컬 임베딩, 4.7k stars. P2 의 vault 연계 reference

**Forge Studio 가 이미 잘 하고 있는 것**:
- tmux + worktree 격리 + forge-team CLI (CrewAI-style multi-agent)
- inbox 동시성 안전 (O_EXCL lock + atomic rename)
- council (round-robin 토론) 모드
- hook profile (minimal/standard/strict) — Hermes 의 tool exposure 와 비슷한 컨셉
- 한글 path NFC/NFD 매칭

**빠진 것 중 가장 큰 임팩트**:
1. Tool output 압축 (Headroom)
2. CLAUDE.md/rules lazy-load (토큰)
3. Tool registration ≠ exposure (Hermes 식 — skill 으로 일부 구현)
4. Symbol-level lock (parallel 안전)
5. Context lineage compression

---

## 6. 사용자 스타일 / 정책 (반드시 따를 것)

- **커밋 메시지 한국어**, conventional commits 형식. Co-Author trailer 절대 금지 (PreToolUse hook 이 차단)
- `git add -A` / `-am` 한 방 커밋 금지 — 파일/관심사별 분리
- `Agent` / `Task` 도구 사용 금지 — `permissions.deny` + PreToolUse hook 차단. 위임은 `forge-team` CLI 만
- 사용자는 직설적/캐주얼 한국어로 소통. 짧고 핵심만. 헤더 남발 X
- "ㄱ" / "ㄱㄱ" = proceed, "ㅁ" = no
- 사용자는 **builder 본인** — 개발자 직접. Forge Studio 제작자
- GitHub: `mstagon`. 빌드 시 `gh auth switch -u mstagon` 필요 가능
- macOS Apple Silicon, ad-hoc codesign (Developer ID 없음). `xattr -cr` 필요

---

## 7. 다음 세션 첫 30 분 행동

1. 이 문서 (`docs/handoff-v0.12-to-v0.13.md`) Read
2. `git status`, `git log --oneline -10` 확인
3. v0.12.0 이 로컬에만 있는지 확인 (`git rev-list --left-right --count origin/main...HEAD`) — push 필요 시 사용자 확인 받고 push
4. 환경 inventory:
   ```bash
   # 살아있는 forge-team session
   tmux ls | grep forge-team
   # 살아있는 팀 config
   find /Users/macms/{pre/test,마블워크-mvpv1,...} -path "*/.claude/teams/*/config.json"
   # orphan branches
   for ws in ...; do (cd $ws && git branch | grep -c "team/"); done
   ```
5. 사용자에게 "v0.12.0 검증 끝났는지 + v0.13.0 P0 4 개 + 팀 cleanup 신규 결함 묶어서 시작할까?" 확인
6. 사용자 응답에 따라 작업 시작

---

## 8. 작업 시 신경 쓸 것

- **typecheck**: `npx tsc --noEmit -p tsconfig.json` + `tsconfig.node.json` 양쪽 통과
- **빌드 명령**: `npm run release:dmg` (~5 분)
- **Deploy**: `find /Applications/Forge\ Studio.app -mindepth 1 -delete; ditto release/mac-arm64/Forge\ Studio.app /Applications/Forge\ Studio.app; xattr -cr ...; open ...`
- **버전 bump**: `package.json` 의 version → commit `chore(release): X.Y.Z`
- **GitHub release**: `gh release create vX.Y.Z release/Forge\ Studio-X.Y.Z-arm64.dmg ... --notes-file ...`

---

## 9. 환경 cleanup 명령 (자주 씀)

```bash
# 모든 forge-team tmux 죽이기
TMUX="/Applications/Forge Studio.app/Contents/Resources/bundled-tools/bin/tmux"
for s in $("$TMUX" ls 2>/dev/null | grep forge-team | cut -d: -f1); do "$TMUX" kill-session -t "$s"; done

# 모든 워크스페이스 orphan branches
for ws in /Users/macms/pre/test "/Users/macms/마블워크-mvpv1" /Users/macms/reverseluckies/pingk_games/minigame /Users/macms/topick/topick /Users/macms/morning/morning /Users/macms/garbage; do
  (cd "$ws" && git worktree prune 2>/dev/null && git branch | grep "team/" | xargs -I{} git branch -D {} 2>/dev/null)
done

# 모든 워크스페이스 team config 디렉토리 비우기 (forge-team remove 가 hang 할 때 대안)
for ws in ...; do find "$ws/.claude/teams" -mindepth 1 -delete 2>/dev/null; done

# zombie MCP 정리
for P in "exa-mcp" "firecrawl-mcp" "token-optimizer-mcp" "mcp-atlassian" "@railway/mcp-server" "fal-ai-mcp-server" "evalview.*mcp" "code-review-graph.*serve" "@supabase/mcp" "github-mcp"; do
  pkill -f "$P" 2>/dev/null
done
```

---

**문서 끝**. 다음 세션은 이걸 첫 번째로 읽고 사용자에게 인계 보고.
