# Changelog

All notable changes to Forge Studio are documented here. The format follows
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/) and this project adheres
to [Semantic Versioning](https://semver.org/).

## [0.18.1] — 2026-06-12

### Changed — 병렬 3단 선택 명문화 (하네스 1.1.0)

- **Workflow / forge-team / 직접** 판정 체계: 분 단위 짧은 fan-out (리서치·
  다관점 리뷰 패널) 은 Workflow 도구, forge-team 은 ①cross-provider 적대 검수
  ②관전/개입 ③세션 독립 장기 잡 — 3용도 전용으로 집중. Agent/Task 차단 유지.
- 프리셋 CLAUDE.md overlay 4종 동기 재생성.

## [0.18.0] — 2026-06-11

### Added — 프리셋 2라운드

- **flutter-only 프리셋**: Flutter + Riverpod + go_router 앱 단독 (백엔드 없음 —
  로컬 우선 또는 Supabase BaaS). 전용 architecture (오프라인 우선, RLS 계약) +
  신규 `supabase-flutter` 스킬 (인증/DB/리얼타임/스토리지/RLS). dart MCP 자동.
- **옵트인 MCP**: New Workspace 에서 프리셋 선택 시 통합 MCP 체크박스 —
  체크한 것만 mcpServers 로 승격 (flutter-only: supabase/playwright ·
  nextjs-web: supabase/vercel/playwright · api-server: supabase/railway).
- **nextauth-patterns 스킬** (nextjs-web): Auth.js v5 세션/미들웨어/Server Action 가드.

## [0.17.0] — 2026-06-11

### Added — 프리셋 시스템 실구현

- **base 상속 + 델타 합성 엔진** (PresetCompose): 프리셋은 manifest (exclude
  목록) + overlay 파일만 보유 — base 하네스에서 합성. 정적 복제 방식의
  이중관리 문제 (v0.15 감사의 베이퍼 프리셋 근본 원인) 원천 차단.
- **번들 프리셋 3종**:
  - `nextjs-web` — Next.js 15 App Router + Prisma + Tailwind (Server Actions 백엔드)
  - `api-server` — NestJS + Prisma 백엔드 단독
  - `minimal-core` — 스택 무관 코어 (팀/안전/학습 하네스만 + 범용 architecture 룰)
  각각 전용 CLAUDE.md / tech-stack / architecture overlay + 스택별 agents/skills 서브셋.
- presets 디렉토리 extraResources 패키징 등록 (기존엔 누락이라 패키징 앱에 0개).

## [0.16.0] — 2026-06-11

### Added

- **symbol-guard v2**: git diff driver 매핑 (brace 언어 → java xfuncname) 으로
  충돌 감지가 class 단위 → **메서드 단위**로 정밀화. tree-sitter 의존성 없음.
- **하네스 독립 버저닝**: `.claude/harness-version` (1.0.0 시작) 이 단일 소스.
  하네스 내용이 바뀔 때만 bump — 앱만 업데이트해도 "하네스 업데이트 가능" 으로
  오판하던 앱 버전 결합 해소. 레거시 마커는 fallback.

### Changed

- **온보딩 5-step → 3-step**: 낡은 하네스 투어 + 구 독트린 기반 샘플팀 스텝 제거.
  환영 / 의존성 / 워크스페이스만.

## [0.15.0] — 2026-06-11

### Changed — Identity Reset (독트린 역전)

- **"무조건 팀" 독트린 폐기**: 메인 세션 (max-tier) 이 기본 실행자. 팀은
  ①병렬 워커 (30분+ 독립 작업 2개+) ②Council 적대 검수 (cross-provider)
  ③백그라운드 잡 — 3용도 전용 스케일 도구로 재정의. "5줄 금지" 룰 폐기.
  (근거: Fable 5 급 메인에선 조정비용이 위임 이득을 잠식 — 감사 문서 참조)
- **agent 정의 spawn 실주입**: `.claude/agents/<id>.md` 가 claude 멤버는
  `--append-system-prompt`, codex 멤버는 task brief 상단으로 실제 주입.
  (기존엔 정의가 spawn 에 전혀 사용되지 않았음)

### Fixed — 전수조사 결함

- Wizard 에이전트 풀: 가짜 18종 → 실제 하네스 18종 (기존 일치율 2/18)
- 온보딩 샘플런이 존재하지 않는 agent (`reviewer`, `nestjs-auth`) 로 팀 생성하던 결함
- 온보딩 Step4 가 삭제된 Library 뷰를 안내하던 잔재
- StatusBar 하드코딩 fake 수치 (MCP "4/5", 'UTF-8 · LF · TypeScript') — 실값 없으면 미표시
- PresetManager 의 실재한 적 없는 bundled preset (flutter-nest 등) 거짓 제거

## [0.14.0] — 2026-06-11

### Added — P1 최적화 (Hermes/Wit 패턴 차용)

- **Contract-first** (P1-7): `contracts/<domain>.contract.md` 가 API 계약의 원본.
  워크스페이스 생성/하네스 업데이트 시 자동 시드. 메인이 팀 spawn 전 작성,
  멤버는 read-only. api-contract 스킬 / skill-injector / dto-broadcast 연동.
- **Symbol 충돌 조기 경보** (P1-6 v1, `forge-symbol-guard.sh`): 두 멤버가 같은
  함수를 동시 수정하면 양쪽 inbox 경보. git diff hunk context 기반 (의존성 0).
- **Context lineage** (P1-5): 컴팩션 직전 팀 진행/inbox 미읽음/contracts/git
  상태를 `.claude/compact-state.md` 로 구조화 스냅샷 + 컴팩션 직후 Read 지시.
  새 세션은 `forge-lineage-restore.sh` 가 48h 이내 스냅샷 포인터 surface.
- **Code graph 자동 갱신** (P1-8, `forge-code-graph.sh`): HEAD 변경 감지 시
  code-review-graph 인덱스 백그라운드 rebuild (CLI 설치된 경우만).

### Fixed

- **dto-broadcast 가 isolated worktree 에서 무동작**: 멤버 CWD 가 worktree 라
  teams registry 경로 조회가 항상 실패 → broadcast 가 한 번도 발사 안 되던
  결함. main workspace 루트 역산으로 fix (symbol-guard 도 같은 패턴 적용).

## [0.13.0] — 2026-06-11

> 0.7.0~0.12.0 엔트리는 미기록 (git log + GitHub release 노트 참조).

### Added — 하네스 토큰/성능 최적화 (P0)

- **토큰 다이어트**: 템플릿 CLAUDE.md 599→132줄. rules 8개 @-include 제거 —
  `skill-injector.sh` 가 편집 파일 패턴에 맞는 룰만 lazy 주입. 세션 시작
  강제 로드 ~90% 절감.
- **bash 출력 압축** (`compress-bash-output.sh`): 출력 폭탄 명령을 head150+tail20
  으로 wrap (PreToolUse updatedInput). 복합 명령/리다이렉션은 안전상 제외.
  `BASH_MAX_OUTPUT_LENGTH=25000` cap.
- **ultracode 훅 프로파일**: 메인 세션 + effortLevel=max 시 gateguard/스킬주입/
  Stop 학습 훅 우회 (안전 차단은 유지). 멤버 세션은 가드 전부 유지.
  프로파일 파일 워크스페이스별 격리 (`/tmp/forge-hook-profile-<md5>`).
- **MCP per-workspace 자동 활성** (`forge-mcp-profile.sh`): pubspec→dart,
  playwright.config→playwright. 자동 추가분만 마커 관리, 수동 설정 불가침.

### Added — 팀 라이프사이클 완결 (사용자 보고 결함)

- **merge 가 부모 브랜치 통합까지 완결**: 멤버 squash → team base →
  parentBranch back-merge. 기존엔 결과가 `team/<id>-base` 에 표류.
- **자동 archive**: merge 성공 시 worktree/tmux/브랜치 자동 정리, config 는
  history 보존 (`archivedAt`). `--no-archive` 옵트아웃. `forge-team archive`
  명령 신설 (미통합 commit 시 거부, `--force` 강제).
- **tmux 지연 정리**: 전원 complete 시 멤버 세션 90초 후 자동 kill.
- **1인팀 가드**: CLI create 멤버 1명 거부 (`--solo` 로만 허용) + 활성 팀
  3개 이상 경고.
- **GUI**: archive 된 팀은 활성 목록에서 제외 (Active/Done 분리).

### Changed — UI 단순화 + 설정화

- **Library (⌘4) / 계획 (⌘5) 뷰 제거** (~3900줄): mock 수준 데드 UI.
  실제 워크플로는 메인 세션의 forge-team CLI 가 담당 — GUI 중복 제거.
  네비게이션 workspace / git / dashboard / settings 4개로 단순화.
- **ForgeConfig** (`~/.forge-studio/config.json`): 하드코딩이던 팀 동작 값
  전부 설정화 — 기본 멤버 모델 · 부팅 대기(ms) · tmux 스크롤백 · 완료 후
  tmux 정리 지연(초) · 1인팀 가드 on/off · 활성 팀 경고 임계치 · merge
  자동 archive. GUI Settings → Agents 의 "팀 동작" 카드에서 편집,
  forge-team CLI 와 같은 파일 공유라 즉시 반영.

### Fixed

- `.gitignore` 의 `.claude/` 가 harness-template 의 신규 스크립트를 삼켜
  v0.12.0 의 `forge-dto-broadcast.sh` / `forge-main-poll.sh` /
  `forge-council-stop.sh` 가 커밋 누락되던 결함 — 루트 한정 (`/.claude/`) 으로
  수정 + 3종 복구.
- `workspaceDirty`: untracked 디렉토리 축약 (`?? .claude/`) 이 forge-owned
  필터를 우회해 깨끗한 워크스페이스도 dirty 오판 → merge 거부되던 결함
  (`git status -uall`).
- `forge-main-poll.sh`: archive 된 팀 신호 무시.

## [0.6.3] — 2026-05-08

### Fixed — claude 프로세스가 화면 이동 시 죽던 진짜 원인

사용자 보고: "다른 화면 갔다오면 클로드가 꺼져있고 그냥 터미널만 보임".
v0.6.0~0.6.2 의 portal lift / host home reparent 까지 했는데도 여전.

#### 진짜 원인

XTerminal 의 두 코드 path 가 PTY dispose 를 호출:
1. **useEffect cleanup** — React 의 어떤 lifecycle (StrictMode double-mount,
   concurrent rendering, transient detach/reattach) 에서든 fire 가능.
2. **init 안의 disposed race** — pty.create 가 await 인 동안 cleanup 이
   먼저 실행되면 disposed=true 로 들어감. 그 후 ptyId 가 도착해서 `if
   (disposed) { pty.dispose(ptyId) }` 분기 진입.

두 path 어느 쪽이든 fire 되면 main process 가 PTY master 를 close →
slave (tmux pane) 에 SIGHUP → pane 안의 claude 프로세스가 종료.

UI 상으로는 터미널 컨테이너 (xterm 인스턴스) 는 살아있고 (lift 작동) 새 attach 가
일어나지만, 안의 claude 는 이미 죽음 → 사용자 눈엔 "터미널만 있고 클로드는
꺼진" 상태로 보임.

#### 수정 — PTY ownership 을 lifecycle 에서 host pruning 으로 이동

PTY 라이프사이클을 React 컴포넌트의 mount/unmount 에 묶지 않고
LiveTerminalsRoot 의 host pruning 에 위임:

- `XTerminal` cleanup 에서 `pty.dispose()` 호출 제거 — 컴포넌트 unmount
  와 PTY 종료를 분리.
- init 의 `if (disposed)` race 분기에서도 `pty.dispose()` 호출 제거. 대신
  `onPtyCreated` 콜백으로 ptyId 를 부모에게 전달 (race 이후라도) — 부모가
  추적 후 host prune 시 정리.
- `LiveTerminalsRegistry`:
  - `setHostPtyId(key, ptyId)` API 추가 — XTerminal 의 onPtyCreated 가
    여기로 보고.
  - `pruneHosts(activeKeys)` 가 활성 키에서 빠진 host 를 제거할 때 해당
    `ptyId` 만 명시적으로 `pty.dispose()` 호출.
  - `disposeAllPtys()` API — 윈도우 close 시 일괄 정리 (main process 의
    ptyManager.disposeAll 과 별개의 안전망).

이제 PTY 는:
- 멤버가 active team 에서 사라질 때 (팀 swap, 멤버 제거) → host 와 함께 dispose
- 워크스페이스 swap → store.clear() → 모든 host prune → 모든 PTY dispose
- .app 종료 → main 의 ptyManager.disposeAll

화면 이동 / React 사이클 / StrictMode 어느 것도 PTY 못 건드림.

#### Verified

dev 서버 + chromium MCP 로 PTY dispose 호출 카운트:
- setActiveTeam('A') → 0번 호출 (이전엔 1번) ✅
- setActiveTeam('A') 재호출 → 0번 ✅
- setActiveTeam('B') (팀 swap) → 1번 (host A 만 정리) ✅

## [0.6.2] — 2026-05-08

### Fixed — 화면 이동 시 터미널 진짜로 유지

0.6.0 의 LiveTerminalsRoot lift 가 충분하지 않았다. 사용자 보고: "여전히 다른
화면 갔다오면 터미널 초기화됨".

#### 진짜 원인

`CellSlot` 이 unmount 되면 `setSlot(key, null)` 만 호출하고 host 는 grid
cell DOM 안에 그대로 남았음. 그 직후 React 가 grid cell DOM 을 tear down
하면 host 도 함께 detach 되고, host 안의 xterm/PTY 도 사라짐.

다음 mount 시 `hosts.get(key)` 는 같은 element 를 반환하지만 그 element 는
이미 destroy 된 grid cell 의 잔재 — 비어있는 컨테이너. → 사용자에겐
"초기화" 로 보임.

#### 수정

- `LiveTerminalsRegistry.setHomeElement(el)` API 추가 — `LiveTerminalsRoot`
  의 hidden div ref 를 registry 에 등록.
- `setSlot(key, null)` 호출 시 `sendHome(key)` 자동 실행 — host 를 home
  으로 미리 reparent. **grid cell tear-down 시 host 가 따라 사라지지 않음**.
- `getOrCreateHost(key)` 새 host 생성 시 home 에 즉시 부착 — React portal
  이 처음부터 DOM 에 valid parent 를 가짐.
- home div 사이즈 0×0 → 800×600 + off-screen `top:-99999px` — xterm
  fitAddon 이 cols=0/rows=0 으로 망가지는 부수 결함 차단. opacity:0 +
  pointer-events:none 으로 숨김 유지.

#### 검증

dev 서버 + chromium MCP 로 host lifecycle 직접 확인:
- `setActiveTeam(...)` 호출 후 home div 안에 host 1개 + xterm 렌더링 정상
- 코드 경로: setSlot(key, null) → sendHome → home.appendChild(host) → grid
  cell tear-down 영향 0

## [0.6.1] — 2026-05-08

### Fixed — Playwright 동적 검수에서 발견된 React 결함 3개

#### React "Rendered more hooks than during the previous render" (App.tsx)
boot 흐름:
1. activeWorkspace 가 null 인 첫 렌더 → `if (!activeSummary) return ...` 가
   line 389 에서 early return → useAgentTeamStore (line 552) 까지 도달 안 함
   → 26 hooks
2. workspace 가 채워진 다음 렌더 → return 안 됨 → 27 hooks
3. React 가 hook order 불일치 감지 → ErrorBoundary 잡힘

0.5.x 에선 부팅 시 workspace 항상 있어서 발현 안 됐을 뿐. dev API stub 으로
처음 발견. fix: realTeams/runs hook 을 early return 위로 hoist —
hook order 안정화.

#### DashboardPanelWired `undefined.length`
`harnessInfo?.agents.length` 패턴이 `harnessInfo` 는 객체이지만 `agents`
필드가 undefined 일 때 throw. 백엔드가 부분 응답을 보내거나 dev stub 이
필드를 빠뜨리면 발생. fix: `harnessInfo?.agents?.length` 등 defensive
optional chaining 으로 바꿈 (5 fields).

#### GitPanelWired 진입 시 `undefined.filter`
status 가 객체이지만 staged/unstaged/untracked 필드가 undefined 일 때
filter 호출에서 throw. dev stub 이 status shape 을 누락한 게 원인 — 실제
backend 는 항상 채움. fix: dev stub 의 git.status 가 staged/unstaged/
untracked/ahead/behind 모두 빈 값으로 반환하도록 보강.

### Added — dev API stub 인프라

`src/devApiStub.ts` (NEW) — Vite dev / Playwright / chromium MCP 환경에서
앱이 부팅하도록 `window.api.*` 을 채우는 stub. Electron production 에선
preload 가 먼저 채우므로 무동작.

main.tsx 가 `import.meta.env.DEV` 일 때만 conditional import. Promise
returning 메서드는 빈 데이터로 resolve, subscribe 류는 noop unsubscribe.
누락된 메서드는 logging proxy 가 첫 호출 시 한번만 warn 출력.

이 인프라 덕에 다음 라운드부터:
- `npm run dev` + chromium MCP 로 모든 화면 routing/onClick 검증 가능
- React invariant 위반 (#310, "more hooks", 등) 부팅 흐름에서 발견 가능

## [0.6.0] — 2026-05-08

### Architecture — Forge Team only (서브에이전트 폐지)

이번 마이너는 메인 Claude Code 세션의 병렬 실행 메커니즘을 **서브에이전트
(`Agent`/`Task` 도구) 에서 Forge Team (격리 worktree + tmux + 별 Claude
인스턴스) 로 전환**한다. 사용자 명시 요구: 서브에이전트는 절대 사용 금지,
모든 위임은 진짜 격리 환경의 별도 Claude 프로세스로.

#### Added

##### `forge-team` CLI — 메인 세션이 호출할 헤드리스 팀 관리자
- `electron/services/TeamOperations.ts` (NEW, 814 LOC) — 워치/Electron 의존성
  없는 순수 함수. tmux/git/fs 작업의 단일 source of truth.
- `bin/forge-team.ts` + `bin/forge-team` (bash shim) — Node 22.6+
  `--experimental-strip-types` 직접 실행. 의존성 추가 0.
- 명령어: `create / list / merge / pause / resume / remove`. stdout 단일 라인
  JSON. exit 코드로 conflict 감지 (merge 실패 시 exit 2).
- 호출 위치 3가지: 레포 체크아웃 / 패키지된 Forge.app / `npm link` 글로벌.
- electron-builder `extraResources` 로 `Forge.app/Contents/Resources/forge-cli/`
  에 번들 — 패키지 환경에서도 즉시 사용.

##### `LiveTerminalsRoot` — App 레벨 XTerminal 인스턴스 풀
- `src/components/v2/LiveTerminalsRoot.tsx` (NEW) — registry + portal hosts
  를 App 레벨로 lift.
- `src/stores/liveTerminals.ts` (NEW) — Zustand store. 활성 팀 멤버 목록
  관리. 워크스페이스 swap 시 `clear()`.
- 결과: **다른 화면 (Library/Dashboard/Settings) 갔다와도 PTY/스크롤백 유지**.
  이전엔 `RunLiveView` unmount → 모든 XTerminal cleanup → tmux attach kill.

#### Changed

##### `electron/services/AgentTeamWatcher.ts` 1076 → 398 LOC 슬림
- create/pause/resume/pauseMember/resumeMember/merge/remove 의 본문은
  `TeamOperations` 위임. 공개 API 100% 호환 (preload.ts/main.ts 변경 0).
- bug fix: `configPathFor()` 가 참조하던 미정의 `this.workspacePath` 필드
  문제도 정리.

##### CLAUDE.md / orchestration.md / agent-team.md 재작성
- Agent Routing 표 → **Team Routing 표** (요청 유형 → 멤버 구성).
- "Agent 도구로 병렬 호출" → "`forge-team create --members ...` 단일 호출".
- ROLE 블록을 "Team Orchestrator" 로 변경. `Agent`/`Task` 도구 호출 금지
  명시 + STOP-THE-LINE 추가.

##### `resources/harness-template/.claude/settings.json`
- `permissions.deny` 에 `"Agent"`, `"Task"` 추가 (서브에이전트 차단).
- `PreToolUse Agent|Task` 인라인 훅 추가 — 사용 시 명시 메시지 ("forge-team
  create 로 대신 만들어라") + exit 2.

#### Removed (no longer used)

- `LiveTerminalGrid` 의 자체 `SlotRegistry` + portal mount 영역 → App 레벨로
  이동. 그리드는 layout + slot ref 등록만.
- 메인 세션의 `Agent` / `Task` 도구 호출 — 정책상 차단.

#### Compatibility

- 기존 워크스페이스의 `.claude/teams/<id>/config.json` 포맷 변경 없음 — CLI
  와 GUI 가 같은 파일을 읽고 쓴다.
- 기존 IPC handler (preload.ts/main.ts) 변경 없음 — Watcher 의 공개 API 가
  보존되었으므로 GUI 쪽은 영향 0.

#### Known limitation (이전과 동일)

`worktreeStrategy: isolated` 시 `team/<id>` 베이스 브랜치와
`team/<id>/<agent>` 멤버 브랜치가 git refs 의 디렉토리 충돌로 동시 존재 불가
→ shared 모드 silent fallback. 결과 envelope 의 `worktreesCreated: 0` 으로
사용자에게 표시. 다음 라운드에서 베이스 브랜치를 `team/<id>-base` 로 변경
검토.

## [0.5.5] — 2026-05-08

### Fixed — Codex adversarial review 라운드2 결함 4개

#### H1. workspaceDirty 가 자기 자신 때문에 항상 true (merge 영구 실패)
`AgentTeamWatcher.create()` 가 `<workspace>/.claude/teams/<teamId>/`,
worktree 디렉터리를 만든다. 그런데 `merge()` 의 dirty-tree gate 는
`git status --porcelain` 비어있어야 통과 — `.claude` 가 추적 대상인
워크스페이스에선 팀 생성 즉시 dirty. Merge 버튼은 자기 자신이 만든
파일 때문에 영구히 `workspace has uncommitted changes` 로 실패.

수정: `workspaceDirty()` 가 porcelain 출력을 라인 단위로 파싱 후
Forge 소유 경로 (`.claude/teams/**`, `.claude/worktrees/**`) 만
필터링. 사용자 WIP 는 그대로 감지. `isForgeOwnedPath()` 헬퍼 추가.

#### H2. Activity tracker 가 부팅·워크스페이스 전환 후 inert
`teamActivityTracker.start()` 는 `teams:create` 핸들러에서만 호출.
앱 재시작 시 `agentTeamWatcher.start()` 가 기존 팀 목록을 cache 에
복원 + `teams:update` 발신하지만 activity tracker 는 안 켜짐 →
RunLiveView 가 JSONL tail 만 보여주고 라이브 edit/commit/state-change
이벤트는 영영 도착 안 함. \"실시간 피드\" 라벨이 거짓말.

수정: `agentTeamWatcher.on('teams', ...)` 안에서
`reconcileActivityTrackers()` 호출. live id Set 과 active tracker Set
diff 해서 빠진 팀 start, 사라진 팀 stop. `agentTeamWatcher.configPathFor()`
public 메서드 추가 — tracker 가 tail 할 config.json 경로 조회용.
재시작/워크스페이스 swap 후에도 라이브 피드 유지.

#### M1. Pause/Resume 백엔드 상태가 v2 어댑터에서 무시됨
`pause()` 는 `team.status='paused'` 작성, `pauseMember()` 는
`member.state='idle'` 작성. 그런데 `toV2Team()` 어댑터는 inbox 파생
`m.status` (AgentStatus) 만 `statusToMemberState()` 통과시킴 → paused
멤버가 inbox 활동 흔적 없으면 그대로 'active' 렌더링. RunLiveView 의
Resume 조건은 그 v2 status 에 의존 → 사용자가 Pause 반복 클릭하지만
실제 프로세스 상태는 이미 변경된 상태 (불일치).

수정:
- `MemberState` 에 `'paused'` 추가 (`primitives.tsx`, `types.ts`)
- `STATE_COLOR/STATE_LABEL` paused 컬러 추가 (`var(--warn)` + `PAUSED`)
- `src/types/index.ts` TeamMember 에 `state?: 'active' | 'idle'` 노출
- `toV2Team()` precedence 명시: team.status='paused' → 모든 멤버 paused;
  member.state='idle' (lifecycle pause) → paused; 그 외 inbox-derived
- 팀 status 집계: paused (team) > blocked > active > paused (members) > idle > done
- `RunLiveView` 의 `state === 'idle' || 'queued'` hack → `state === 'paused'`

#### M2. Agent 터미널 버튼이 PTY 만들고 버림 (누수)
`AgentCard` 의 터미널 아이콘이 `window.api.teams.openAgentTerminal()`
호출 후 `flash('success', 'attached')` 만 띄움. 반환된 PTY id 는 즉시
discard — `pty.onData` 구독 없음, 터미널 store 등록 없음, dispose 없음.
사용자는 'attached' 만 보고 실제 터미널은 안 열림. tmux attach PTY 는
앱 종료까지 alive (dangling).

수정: `LiveTerminalGrid` 가 이미 모든 멤버에 라이브 attach 중 →
중복 PTY 만들 필요 없음. 버튼이 `forge:agent-fullscreen` CustomEvent
dispatch → grid 가 fullscreen mode toggle. `LiveTerminalGrid` 에 이벤트
listener 추가 (member 존재 검증 + agentName/agentId 매칭). 누수 0.

## [0.5.4] — 2026-05-08

### Fixed — Codex adversarial review 결함 4개 (0.5.3 hotfix)

#### H1. tmux 진짜 pane ID 캡처 — 라이브 터미널 attach 동작
이전엔 멤버 config 의 `tmuxPaneId` 가 `\"session:0.0\"` 형식. 그런데
`PtyManager.createTmuxAttach` 는 `%`/`@`/`$` 시작 target 만 받음 →
\"Invalid tmux target\" 으로 라이브 터미널 unmount. 사실상 UI-only.

수정: 세션 생성 직후 `tmux display-message -p '#{pane_id}'` 로 진짜
`%N` 캡처. 정규식 검증 후 저장. 캡처 실패 시 `tmuxPaneId` 미저장 →
UI 가 \"unavailable\" 배너 graceful.

#### H2. Pause 가 진짜 프로세스 정지 (SIGSTOP/SIGCONT)
이전엔 `tmux detach-client` 만 호출. tmux 세션 + Claude/agent 프로세스
계속 실행 → 사용자는 paused UI 보지만 agent 가 토큰 소비 + 파일 편집
계속 (위험).

수정: `tmux display-message -p '#{pane_pid}'` 로 PID 추출 →
`process.kill(-pid, SIGSTOP|SIGCONT)` 프로세스 그룹 (자식 포함). 실패
시 fallback (detach-client + `degraded: true` + `pause:degraded`
이벤트 emit).

#### H3. Merge commit 실패를 머지 실패로 처리
이전엔 squash mode 의 `git commit` 실패 swallow → `ok: true` 반환하지만
repo 는 미커밋 + staged 상태 (UI 거짓말).

수정: commit 결과 명시 체크 — 실패 시 stderr 캡처 + `git reset --merge`
+ `{ ok: false, error }`. 새 `workspaceDirty()` 헬퍼로 머지 진입 / 멤버
머지 후 `git status --porcelain` 검증 → dirty 면 abort.

#### M1. PathManager 통합 — 번들 tmux 우선
이전엔 `AgentTeamWatcher` 가 inherited PATH 의 plain `tmux` 호출. Dock
launched 앱에서 시스템 tmux 없으면 onboarding \"Bundled\" 인데 팀 생성은
\"unavailable\" 처리하는 모순.

수정: `tmuxBin() = pathManager.getTmux() ?? 'tmux'` + `tmuxEnv() =
pathManager.augmentEnv(process.env)`. 24개 `execFileAsync` 호출 모두
번들 binary + augmented env 사용. `hasTmux()` 도 번들 우선 체크.

### Notes
- `merge()` 이제 dirty workspace 거부 (이전엔 WIP 를 silent 하게 squash
  에 fold). 안전한 default 지만 호출자는 새 에러 string 대비 필요.
- `pause()/resume()` 의 `degraded: true` 응답을 renderer 가 토스트로
  surface 하는 wiring 은 후속 작업 (UI 0.5.5 또는 0.6.0).

## [0.5.3] — 2026-05-08

\"진짜 동작\" 라운드 — RunLiveView 의 mock 영역 3개 (grid + Activity feed
+ ResourceBar) 를 모두 실 데이터로 교체.

### Changed — RunLiveView 풀 라이브 동작
- **tmux split grid 실제 PTY attach** — 기존 fake TERMINAL_LINES cycling
  → 멤버 tmux 세션의 라이브 PTY 표시. `LiveTerminalGrid.tsx` 신규,
  paneId(=agentName) 별 single XTerminal 인스턴스 + persistent host
  portal (TerminalAreaV2 패턴 재사용) 로 grid ↔ focus mode ↔ fullscreen
  레이아웃 전환 시에도 PTY 보존. ResizeObserver + FitAddon. tmux 미설치
  / queued 멤버는 기존 fake cycling fallback
- **Activity feed 실 데이터** — chokidar 가 멤버 worktreePath watch +
  1s 간격 git HEAD polling + config.json state 추적. edit/commit/
  state-change 이벤트 stream. `~/.claude-forge/team-activity/<id>.jsonl`
  미러링 (영속성). 빈 상태 \"활동 없음 — 첫 변경을 기다리는 중\"
- **ResourceBar 실 메트릭** — 5s polling. CPU `ps -A -o %cpu` 코어 정규화,
  MEM `vm_stat + sysctl`, DISK 워크스페이스 `du -sk` baseline delta,
  PTY `ptyManager.activeCount()`. 임계 색상 (CPU>80% warning/>90%
  danger, MEM>85% warning/>95% danger)

### Added — 인프라
- `electron/services/TeamActivityTracker.ts` — chokidar + git polling +
  jsonl 영속화. teams:create/remove 에 자동 wire
- `electron/services/ResourceMonitor.ts` — 5s 캐시. macOS 명령 + non-
  darwin os.loadavg fallback
- `PtyManager.activeCount()` 헬퍼
- IPC: `team-activity:list/event`, `resource:snapshot`
- `src/stores/teamActivity.ts` — refcounted subscribe + 팀별 ring buffer
  (max 200, 최신순). 단일 글로벌 IPC 리스너 fanout

### Fixed — Graceful degradation
- chokidar/git 미가용 — 이벤트 stream 정지 (앱 안 죽음)
- system.resourceSnapshot 미존재 — 0 값 표시 (fake 안 띄움)
- team-activity:list 실패 — 빈 상태 + 라이브 stream 시도 계속

## [0.5.2] — 2026-05-08

\"진짜 완벽\" 라운드 — 4개 영역의 미완성 부분 풀.

### Fixed — 번들 도구 packaged 동작 보장
- **cr-graph venv portable 화** — 절대경로 shebang/symlink 가 packaged
  DMG 에서 깨지던 문제. console script 를 path-relative polyglot
  exec wrapper 로 교체 (`#!/usr/bin/env bash` + dirname 계산),
  `bin/python*` 모두 relative symlink 로 변환
- **first-run self-repair** — `PathManager.ensureVenvUsable()`
  (idempotent) 이 절대경로 흔적 감지 후 자동 in-place 재작성.
  cr-graph-venv-repair.flag 로 한 번만 실행
- **SLIM_LANGUAGES=1** 환경변수 — tree-sitter language pack 슬림화
  옵션 (기본 OFF, CI DMG size 최적화 시 활성)

### Added — 하네스 저작 GUI 풀 마무리
- **CommandEditor / HookEditor / McpServerEditor / PermissionsEditor**
  4개 신규 — frontmatter + body 편집, 6 이벤트별 matcher 힌트, transport
  전환, allow/deny 두 컬럼 chip 등
- **LibraryRowMenu** 공유 컴포넌트 — ⋯ dropdown (편집/복제/삭제) +
  DeleteConfirmModal + UndoToast (5초 카운트다운)
- AgentEditor/SkillEditor 에 `duplicateFrom` + `initialName` props
- LibraryTabs 4탭 (Agents/Skills/Commands/Hooks) — 디스크 실데이터
  row 에 ⋯메뉴 + 헤더 \"+ 새 X\" 버튼. Built-in commands 보호
- Hooks 탭 전면 재작성 — listHooks IPC 직접 호출 → per-event 인덱스
  재계산 → (event, perEventIndex) 로 add/remove/update
- Settings → Harness 신규 3카드: MCP servers / Permissions / Hooks

### Added — 하네스 검증 / 프리뷰 / 프리셋
- **HarnessLintPanel** — Settings 카드 + 풀 모달, severity stat tiles
  + 파일별 그룹 + fix 힌트
- **HarnessUpdatePreview** — HarnessBanner \"View diff\" 클릭 → 풀스크린
  added/removed/modified 트리 + unified diff (3-color)
- **SessionPreview** — 글자수 + 추정 토큰 + CLAUDE.md/8 rules/hooks 섹션 접기/펼치기
- **My Presets 탭** — Library 6번째 탭. bundled + user preset 카드 +
  Apply/Delete + \"Save current as preset\" 다이얼로그
- **NewWorkspaceDialog** Advanced 의 \"Harness preset\" 셀렉터

### Added — 관측성
- **HookProfileDashboard** — hook 별 평균/p95/성공률 + 최근 10회 CSS
  막대 그래프 + 최근 실패 펼치기. 5초 자동 refresh
- **SettingsErrorLog** — Settings 6번째 사이드바. 200 ring buffer +
  카테고리 필터 + 검색 + [Copy]/[Details]
- electron main 의 workspace:create / harness:update / git:commit
  핸들러 try/catch + pushErrorToRenderer wrap

### Added — i18n 실 적용 (85+ 키)
- SidebarV2 5개 nav + Settings 5섹션 + Wizard + CommandPalette 그룹 헤더
- locales/ko.json + en.json 키 확장
- Settings → General 에 Language dropdown (한/영)

### Added — GitHub templates + 잡티
- `.github/` 디렉터리 신규:
  - `ISSUE_TEMPLATE/{bug,feature}.md` (한글, 라벨 자동)
  - `ISSUE_TEMPLATE/config.yml` (blank issue 비활성)
  - `PULL_REQUEST_TEMPLATE.md` (Summary/Test plan/영향 스택/closes #)
  - `dependabot.yml` (npm + actions weekly KST 09:00)
  - `labels.yml` (type/priority/status/cross-cutting)
  - `FUNDING.yml` (placeholder)
- TerminalAreaV2 — TabStrip 우측 ≡ 드롭다운 (모든 탭 리스트 + 닫기,
  외부 클릭/ESC 닫힘) — 이슈 #2-3
- README.md — labels.yml 부트스트랩 명령 안내

## [0.5.1] — 2026-05-08

### Added — 필수 도구 사전 번들 (DMG +~90MB)
- **tmux** — Agent Team isolated worktree 다중 세션용
- **uv** — Astral Rust binary, Python 패키지 매니저
- **Python 3.12 (standalone)** — python-build-standalone relocatable
- **code-review-graph** — 번들 Python 으로 venv 사전 빌드, shebang portable
- 사용자 설치 불필요 — 첫 실행부터 tmux/code-review-graph 즉시 동작.
  미번들: Claude Code CLI (라이선스), git (Xcode CLT)

### Added — 인프라
- `electron/services/PathManager.ts` 신규 — 번들 도구 PATH 자동 prepend
  (bundled > cr-graph-venv > python > 기존). 번들 미존재 시 graceful
- `PtyManager.buildEnv()` 가 `pathManager.augmentEnv` 호출 — 사용자
  spawn 셸도 번들 도구 보임
- `CodeReviewGraphManager` — bundled 우선 감지, install() 은 번들 가용
  시 no-op
- `scripts/download-bundled-tools.sh` (idempotent fetcher) +
  `scripts/build-cr-graph-venv.sh` (shebang portable rewrite)
- electron-builder extraResources + after-pack chmod +x sweep 확장

### Added — 워크스페이스 UX
- **부팅 시 자동 활성화** — 등록된 ws 중 가장 최근 (lastOpened DESC)
  자동 setActiveWorkspace. 매번 선택 불필요
- **\"기존 폴더 열기\" 버튼** — empty state 에 신규. 시스템 폴더 picker
  → openWorkspace 호출 → `.claude/` 자동 감지 + 등록
- **\"Recent workspaces\" 카드** — empty state 최대 6개, 클릭 시 즉시 active

### Changed — Onboarding
- Step 2 의존성 체크 — 번들 도구는 \"번들됨\" Pill 표시, Install 버튼 X

### Migration
DMG ~134MB → ~220MB. 첫 실행 시 번들 도구 자동 PATH 추가, 별도 설정 불필요.

## [0.5.0] — 2026-05-08

팀 시스템 풀 자동화 + 하네스 저작 GUI 첫 단계 + 다중 프리셋 + 첫 실행
온보딩 + 관측성 인프라. 2개 PR (#8 #9) 의 변경.

### Added — 팀 시스템 풀 자동화 (PR-E)
- **워크트리 자동 생성** — Wizard 의 isolated 전략 시 `team/<id>` 베이스
  브랜치 + 멤버별 `team/<id>/<agent>` 브랜치 + worktree 자동
  (`<wsPath>/.claude/teams/<id>/worktrees/<agent>`)
- **멤버별 tmux 자동 spawn** — `forge-team-<id>-<agent>` 세션 +
  `autoStartClaude` (기본 true) 로 `claude` 명령 자동 실행
- **팀 일시정지/재개** — `pause` / `resume` / `pauseMember` /
  `resumeMember` IPC + tmux `detach-client` (kill X, context 유지)
- **머지 충돌 3-way diff 뷰** — `merge()` IPC + 충돌 시
  `MergeConflictView` 풀스크린 모달 (3-column ours/merged/theirs +
  Use ours / Use theirs / Manual resolve / Abort)
- **팀 삭제 정리** — tmux kill + worktree --force 제거 + 브랜치 삭제
  단계별 graceful
- 보안: `isPathInside` + agentId 정규식 sanitize 로 path traversal 방지
- 미설치 환경 (git/tmux): graceful — config 자체는 항상 작성

### Added — 하네스 저작 + 검증 + 프리셋 (PR-F)
- **하네스 린트** — frontmatter 누락 / 깨진 참조 / 중복 이름 /
  CLAUDE.md 라우팅 표 정합 / skill-injector grep ↔ SKILL.md 존재 /
  mcp.json 유효성 / settings.json hooks 스크립트 존재 검사.
  errors / warnings / info 분류
- **업데이트 diff 프리뷰** — 번들 template vs 워크스페이스 .claude/
  비교, added/removed/modified + unified diff 생성. HarnessUpdateBanner
  의 \"View diff\" 버튼 (UI 후속)
- **프리셋 시스템** — 다중 프리셋 (`flutter-nest` / `nextjs-only` /
  `empty`) + 사용자 정의 (`~/.claude/my-presets/`). PresetManager 가
  list/apply
- **Agent / Skill 편집기 (CRUD UI 첫 단계)** — frontmatter 필드 +
  body markdown 편집 모달. Settings → Harness → Authoring 카드에서
  호출. 충돌 검증 + 필수 필드 검사

### Added — 관측성
- **HookProfiler** — 모든 훅 실행을 wrapping 해서 시간 / exit 코드 /
  stdout 기록. JSONL 저장 (`~/.claude-forge/hook-profiles.jsonl`).
  `recordExecution` / `getRecent` / `getStats` 메서드. 평균 실행 시간 /
  성공률 / 최근 실패 집계
- **에러 로그 인프라** — IPC / PTY / Git / MCP / FS / VALIDATION 6개
  카테고리 `AppError` 클래스. preload `errorLog` 네임스페이스

### Added — i18n 인프라
- 한/영 두 locale 지원 인프라 (`src/i18n/`). 핵심 50개 문자열을
  `ko.json` / `en.json` 으로 분리. localStorage 영속
  (`forge-studio.language`)
- 현재는 stub (i18next 의존성 미도입) — `setLanguage` / `getLanguage` /
  `t(key)` API 안정. 후속 PR 에서 실제 i18next 교체

### Added — 첫 실행 온보딩
- 풀스크린 5-step 마법사 — 환영 / 의존성 체크 (git/tmux/claude-code/
  code-review-graph) / 첫 워크스페이스 / 하네스 소개 + 단축키 /
  첫 팀 \"Sample Run\"
- `localStorage.forge.hasOnboarded` 영속, Settings → General 에
  \"Show onboarding again\" 토글
- Wizard 가 `initialMembers` prop 받아 멤버 prefilled 상태로 열림

### Added — 문서
- **하네스 아키텍처 문서** — `docs/harness-architecture.html` 단일
  HTML, 12 섹션 + 8개 SVG 다이어그램 (3-tier / Hook sequence / Skill
  injection / 워크스페이스 격리 / Wizard 흐름 / RunLiveView mockup /
  Stop hook chain). 다크 테마 + Forge 디자인 토큰

### 보류 (다음 마이너)
- Command / Hook / MCP / Permissions 편집기 — EditorShell 패턴 그대로
  재사용 가능, 짧은 작업
- Library 5탭 행의 [편집][복제][삭제] 메뉴 wire
- HarnessLintPanel UI / HarnessUpdatePreview UI / SessionPreview UI /
  HookProfileDashboard UI / SettingsErrorLog UI (백엔드 모두 완성,
  UI 컴포넌트만)
- 실제 i18next 도입 + 한/영 번역 풀 진행
- GitHub 라벨 / PR / ISSUE 템플릿 (#1-9)

## [0.4.1] — 2026-05-07

### Fixed
- **앱 아이콘이 너무 작아 보이던 문제** — Ember Cube 아트워크가 1024px
  캔버스의 ~52% 만 차지해 macOS Dock 의 다른 앱 (~80% fill) 대비
  작게 보임. 마스터 SVG 의 cube transform 에 `scale(1.55)` 추가해
  ~80% fill 로 재렌더 후 icns 재빌드. 캔버스 squircle 마스크와
  주변 별 장식은 그대로 유지.

## [0.4.0] — 2026-05-07

대규모 UI 전면 재구성 + 하네스 라우팅 정합성 + 코드 지식 그래프 통합. 4개
PR (#4 #5 #6 #7) 의 변경을 한 릴리즈로 묶음.

### Added — UI 전면 재구성 v2
- **새 사이드바 IA**: Workspace · Git · Dashboard · **Library** · Settings
  (기존 Teams 단독 항목 제거, Run 들은 Workspace 내부 Teams 섹션으로 흡수)
- **Workspace 패널** = 새로운 홈: 헤더 (path/branch/Update Harness 배지) +
  좌패널 (Files 트리 + Teams Run 섹션) + 메인 (실제 xterm 터미널 / FilePreview /
  RunLiveView 분기) + 하단 ResourceBar (CPU/MEM/DISK/PTY)
- **Run 라이브뷰** (777genius 레퍼런스): 멤버 레일 + tmux split grid +
  Activity feed + 컨트롤 바. ESC 로 복귀
- **Library**: Compositions / Agents / Skills / Commands / Hooks 5탭 +
  글로벌 Composition 템플릿 카드 그리드 + "Apply to workspace" 플로우
- **Settings 5섹션 풀 디자인**: General / Harness / Agents / Integrations /
  Account
- **단축키**: ⌘1~4 view · ⌘, Settings · ⌘N New Run · ⌘K 팔레트 · Esc Run 닫기 ·
  Cmd+Shift+. 하네스 파일 토글
- **디자인 토큰**: cool neutral dark + forge orange (#ff6b35) accent +
  8개 role-coded agent 컬러 + Geist (UI) + JetBrains Mono (코드) Google Fonts

### Added — 핵심 기능
- **Wizard → 실제 팀 생성**: AgentTeamWatcher.create() + teams:create IPC.
  Wizard 결과가 `<workspace>/.claude/teams/<id>/config.json` 자동 작성 →
  Run 섹션에 즉시 표시
- **스택별 원격 레포 자동 등록**: `{프로젝트명}-{client,server,cms}` 컨벤션.
  NewWorkspaceDialog 토글 + gh CLI 로 빈 private 레포 자동 생성 옵션
- **실제 파일 시스템 wired**: Files 패널 lazy load + 하네스 토글 +
  path traversal 방어 + 바이너리 감지. FilePreview 실 파일 내용 + truncated 알림
- **Library 실데이터**: 5개 IPC 병렬 호출로 활성 워크스페이스의
  `.claude/{agents,skills,commands,hooks}` + `~/.claude/team-compositions/` 스캔
- **Git/Dashboard 풀 wired**: useGitStore (status/log/diff/stage/composer) +
  useWorkspaceStore (harnessInfo + mcpStatus) 실데이터, 자동 scan/refresh
- **Code Review Graph 통합** (신규): Tree-sitter 기반 코드 지식 그래프 MCP
  (https://github.com/tirth8205/code-review-graph) 풀 통합. 평균 6.8× 토큰 절약
  - mcp.json 에 server 추가 (uvx) + 자동 활용 룰 + code-reviewer agent
    Tools 활용 명시
  - Settings → Harness → Code Review Graph 카드 (상태/통계/Install/Rebuild/
    Open Visualization)
  - Dashboard → Knowledge Graph 섹션 (4-cell stat)
  - 워크스페이스 생성 시 자동 빌드 옵션 (NewWorkspaceDialog Advanced)
  - 풀스크린 D3 시각화 모달 (`code-review-graph viz` iframe 임베드)

### Added — 하네스 강제 메커니즘
- **룰/스킬 강제**: PreToolUse 훅이 stderr → **stdout 주입** 으로 전환.
  매칭된 SKILL.md 절대경로 4줄을 Claude 컨텍스트에 직접 넣음 — 무시 불가
- **커밋 강제**: PreToolUse Bash 훅이 (a) Conventional Commits 형식,
  (b) 한국어 subject ([가-힣] 1자 이상), (c) Co-Authored-By trailer 차단,
  (d) `-A`/`-am` 한 방 커밋 차단 — 모두 `exit 2` 로 피드백
- **CLAUDE.md 라우팅 정합성**: `client/presentation/` → mobile-design +
  mobile-touch 자동 주입 추가 (이전엔 누락). Meta Skills 표 + Hook Routing
  표 신규
- **8개 룰 자동 로드**: `@.claude/rules/common/*.md` 문법으로 매 세션 컨텍스트
  주입

### Added — 하네스 콘텐츠
- `harness-template/README.md` (한글) — agent / skill / rule / hook 추가법 +
  로컬 테스트 + Code Review Graph 절
- `harness-template/.env.example` — Supabase / Exa / Firecrawl / Jira / FAL
  토큰 placeholder + 발급 링크
- **OWASP Top 10 (2025)** 전체 10개 — A01 Broken Access Control,
  A02 Security Misconfiguration, A03 Software Supply Chain Failures,
  A04 Cryptographic Failures, A05 Injection, A06 Insecure Design,
  A07 Authentication Failures, A08 Software/Data Integrity Failures,
  A09 Logging & Alerting Failures, A10 Mishandling of Exceptional
  Conditions. 기준 연도/갱신 주기 메타데이터
- `dio-retrofit` 스킬에 MANDATORY 블록 + pubspec stable 버전
- `git-workflow.md` — 한국어 커밋 강제 + Co-Author 금지 + 원격 레포 네이밍
  컨벤션 명시
- 새 README.ko.md (~360줄, 영문 풀 번역) + 양방향 언어 토글

### Added — 개발 인프라
- **ESLint 9 flat config** + Prettier 복원, `npm run lint` 정상 동작
- `eslint.config.js` (TS strict + React 19 + react-hooks) + `.prettierrc.json`
  (semi:false / singleQuote / printWidth:100)

### Fixed
- **`npm run electron:dev` 창 2번 열림** — single instance lock + 중복
  `electron .` 호출 제거
- **터미널 split 시 PTY 유실** — `splitPane` 이 React 최상위 key 를 바꿔
  XTerminal 이 unmount 되며 PTY dispose 되던 버그. **Portal 라이프타임
  분리** 로 해결 — paneId 별 long-lived host div 가 split/branch-collapse
  에도 살아남음
- **Git 탭 렉** — 하네스 파일 (.claude/, resources/harness-template/, dist/)
  기본 숨김 + Cmd+Shift+. Finder 식 토글
- **Co-Author/영어 메시지 자동 생성** — 하네스 룰 + PreToolUse 훅으로
  이중 차단

### Added — UX 폴리시
- **Split pane 개별 닫기 버튼** — 호버 시 우상단 ×
- **터미널 이름 자동 순번** — `Terminal`, `Terminal (2)`, `Terminal (3)` ...
- **Workspace switcher** (TopBar dropdown): 검색 (≥5개 시), \"기존 폴더 열기\",
  활성 ws 체크마크 + path 미리보기, dropdown 자동 닫기
- **Run ← 백 버튼** 강조 + Esc Kbd 힌트 인라인

### Removed (cleanup)
- v1 컴포넌트 13개 파일 (~2000줄): `src/components/{layout,dashboard,git,
  teams,terminal,workspace/HarnessUpdateBanner}/` — v2 가 전부 대체

### Visual
- 새 앱 아이콘 (Ember Cube) — SVG → icon.icns (16~1024 모든 사이즈)

### Migration
기존 워크스페이스: **Update Harness** 클릭으로 새 mcp.json + 룰 + agent +
README 자동 적용. 보존: `agent-memory/`, `settings.local.json`, `.pdca-*`.
사전 작업 (선택): `pipx install code-review-graph` (또는 pip / uv tool
install) — Code Review Graph 기능 활성화 시.

## [0.3.5] — 2026-04-20

### Fixed
- **Terminals REALLY survive workspace switches now.** 0.3.4 only
  kept tabs mounted for the *current* workspace, so hopping folders
  still unmounted the other workspace's XTerminals and disposed their
  PTYs. Every tab is now rendered unconditionally; visibility is
  gated per-tab (active + belongs-here) with `display:none` hiding
  everything else. Shell history and running processes persist
  across any number of workspace switches.
- **Status bar `MCP N/N` now reports reality.** macOS GUI launches
  inherit a minimal PATH that misses Homebrew, pyenv, uv, cargo.
  `HarnessScanner.getMcpStatus` was `execFileSync`ing `which npx` /
  `which uvx` / `which python3` against that stripped PATH, so every
  MCP was reported "unavailable" and the status bar showed `MCP 0/14`
  even when everything was actually installed. Probe now uses the
  same augmented PATH PtyManager injects (+ `~/.local/bin`,
  `~/.cargo/bin`) and pins `/usr/bin/which` directly.

## [0.3.4] — 2026-04-20

### Added
- **Agent-team terminal attach.** Clicking an agent in the Teams sidebar
  (or its new terminal icon) now opens a terminal tab that attaches to
  that agent's tmux pane via `tmux select-pane + attach-session`, so you
  can watch and drive the agent's session without leaving Forge.
  Re-clicking a running agent re-focuses its existing tab instead of
  spawning a duplicate attach. Splits are disabled on agent tabs (tmux
  already handles panes), and workspace switches no longer steal focus
  from an active agent tab.
- `PtyManager.createTmuxAttach(paneId)` helper + new
  `teams:openAgentTerminal` IPC, reusing the existing `pty:data:*` /
  `pty:exit:*` channels so XTerminal stays uniform.

### Fixed
- **Terminals no longer die when you switch workspaces or tabs.**
  `TerminalPanel` used to render only the active tab, so every other
  XTerminal unmounted and its PTY got disposed — returning to a
  workspace meant fresh shells with no history or running processes.
  All workspace-matching tabs now stay mounted and inactive ones are
  hidden with `display:none`; PTYs survive the switch and xterm refits
  when the tab becomes visible again. Per-tab cwd is frozen at
  creation so hidden tabs don't get rewritten when the user hops
  folders.
- **Dev-mode "hook files not found" at Claude Code startup.**
  `workspace:getTemplatePath` / `getClaudeMdPath` resolved the dev
  template to `<repo>/..`, which doesn't contain `.claude/`. Workspaces
  created via `npm run dev` silently got a partial (or empty) harness,
  so SessionStart / PreToolUse hooks complained about missing
  `auto-profile.sh`, `skill-injector.sh`, `gateguard.sh`, etc. Both
  handlers now point at `resources/harness-template`, matching the
  packaged-build location.

### Changed (harness template)
- **Pinned model/effort to Opus 4.7 at max.** Bundled
  `.claude/settings.json` now sets `model: claude-opus-4-7`,
  `effortLevel: max`. Stripped the per-agent `model:` frontmatter from
  all 18 agents (previously half were pinned to `sonnet`, silently
  downgrading test-writer / flutter-ui / nextjs-cms / etc.) so every
  agent inherits the workspace pin. `CLAUDE_CODE_EFFORT_LEVEL` env var
  still wins if a user wants to temporarily override.

### Migration
Existing workspaces: click **Update Harness** to pick up the settings
pin and any missing hook scripts. No manual steps required — preserved
files (`agent-memory/`, `settings.local.json`, `.pdca-*`) are kept.

## [0.3.3] — 2026-04-18

### Changed (BREAKING for new workspaces — existing workspaces unaffected)
- **Flutter app directory renamed `lib/` → `client/`** across the bundled
  harness so the monorepo tree reads `client/ + server/ + cms/ + docs/`
  instead of the cryptic `lib/` that visually collided with Next.js's
  `lib/` utility folder.
- Renamed everywhere: CLAUDE.md tree + Skill Routing patterns,
  `rules/common/architecture.md` + `orchestration.md` + `git-workflow.md`,
  every `commands/*.md` that referenced Flutter paths, every
  `skills/*/SKILL.md` Flutter pattern, `scripts/skill-injector.sh` regexes,
  `settings.json` Write permission glob and post-edit `flutter analyze`.
- `WorkspaceManager.create` now scaffolds `client/` instead of `lib/`.
- `cms/lib/` (Next.js convention) and `@/lib/...` import paths inside the
  CMS are intentionally preserved.

### Migration for existing workspaces
Update Harness will pull the new template, but **your existing `lib/`
directory keeps its old name** — the rename only changes the docs/rules
that point at it. If you want to align an existing project, do the move
yourself:
```bash
git mv lib client
# then update pubspec.yaml, build.yaml, import paths if any reference lib/
```

## [0.3.2] — 2026-04-18

### Changed
- **Bundled `CLAUDE.md` is now a lean, ROLE-first delegation hub (505 → 146
  lines, 71% shorter).** Prior CLAUDE.md buried the manager directive under
  tech-stack tables and 10-step orchestration flows; model sometimes drifted
  into implementer mode before it ever parsed the routing rules. New layout,
  top to bottom: ROLE: MANAGER → STOP-THE-LINE → YOU MUST DO / MUST NOT DO →
  per-response self-check → Agent/Skill routing tables → pipeline one-liner
  → ask-user list → pointers table.
- Operational detail split into dedicated rule files so the model pulls them
  on demand instead of burning context every turn:
  - `rules/common/orchestration.md` — full dispatch flow, chaining, parallel
    rules, verification automation, TDD loop
  - `rules/common/automation.md` — hooks, profiles, continuous learning,
    verification loop, checkpoint
  - `rules/common/mcp.md` — MCP server inventory + usage rules
  - `contexts/tech-stack.md` — Flutter / NestJS / Prisma / Next.js versions
    + build commands
  - `rules/common/architecture.md` — appended with monorepo + lib/ +
    server/src/ directory layouts

### Upgrade behavior
Existing workspaces see the harness update banner (0.3.1 → 0.3.2). Clicking
*Update* swaps in the lean CLAUDE.md and new rule files; your local
`agent-memory/`, `settings.local.json`, and `.pdca-*` are preserved as
always.

## [0.3.1] — 2026-04-18

### Changed
- **Terminal tabs are now scoped per workspace.** Tabs carry a
  `workspaceId` set when they're created from a workspace context. The
  main terminal panel only shows tabs belonging to the active workspace;
  switching workspaces hides the previous workspace's tabs (kept alive
  in the store) and surfaces the new workspace's group, creating an
  initial tab if it has none. `nextTab` / `prevTab` cycle within the
  same workspace's group.
- **Teams panel is now read-only.** Removed the per-member terminal
  launcher button; Teams is a live status board, terminals belong to
  the main panel. Spawning terminals in an agent's worktree moves to
  Phase 3 (auto-split on member join).

## [0.3.0] — 2026-04-18

### Added
- **Agent Teams panel (Phase 1 of the team-agent visualization roadmap).**
  New 'Teams' sidebar view groups Claude Code Agent Teams metadata
  (`~/.claude/teams/<id>/config.json` + per-member `inboxes/<name>.json`)
  by team, with:
  - Coloured live status (running / idle / shutdown derived from
    `idle_notification` and `shutdown_request` inbox events)
  - Lead vs member distinction
  - Model + agent type
  - Unread message badge
  - Last activity relative timestamp + last summary preview
  - Hover-revealed terminal-launcher button that spawns a new terminal
    tab in the member's worktree (`member.cwd`)
- New `AgentTeamWatcher` service (chokidar) with debounced refresh and
  push updates over `teams:update` IPC.
- New IPC: `api.teams.list()` + `api.teams.onUpdate(callback)`.

### Roadmap progress
This is Phase 1 of the team agent visualization Roadmap item. Phase 2
(inbox viewer + token sparkline from telemetry) and Phase 3 (auto-split
on member spawn + inter-agent comms graph) come next.

## [0.2.9] — 2026-04-18

### Fixed (critical — please upgrade)
- **0.2.7 + 0.2.8 crashed at startup** with `Cannot find module 'node-pty'`.
  Root cause: the `beforeBuild` hook we added in 0.2.7 (to force a fresh
  `vite build` before packaging) silently overrode electron-builder's own
  native-module detection / unpack pipeline. Even after we made the hook
  call `electron-builder install-app-deps` itself, the unpack step that
  creates `app.asar.unpacked/node_modules/node-pty/` never fired.
- Fix: removed the `beforeBuild` hook entirely. Added a
  `npm run release:dmg` script that does
  `npm run build:renderer && CSC_IDENTITY_AUTO_DISCOVERY=false electron-builder ...`
  in one shot. The renderer is rebuilt first via the npm chain (so dist/ +
  dist-electron/ are fresh), then electron-builder runs unmodified and its
  default install-app-deps flow correctly populates app.asar.unpacked.
- Verified the 0.2.9 DMG contains
  `app.asar.unpacked/node_modules/node-pty/build/Release/spawn-helper`
  AND `updates:check` IPC in main.js AND `appUpdate` strings in the
  renderer bundle.

If you installed 0.2.7 or 0.2.8 and saw "A JavaScript error occurred in
the main process: Cannot find module 'node-pty'" — install 0.2.9 to fix.

## [0.2.8] — 2026-04-18

### Fixed (critical — please upgrade)
- **0.2.7 startup crash:** `Error: Cannot find module 'node-pty'`. Fix to
  the build pipeline introduced a `beforeBuild` hook that returned `false`
  to tell electron-builder "we already ran our build step, skip your dep
  install". Per electron-builder docs, that return value also skips packing
  `node_modules` into `app.asar.unpacked`, which is exactly where native
  modules like node-pty live. Result: `app.asar.unpacked` was empty and
  the main process crashed before the window even appeared.
- `scripts/before-build.js` now returns `undefined` so electron-builder
  performs its normal native-module detection and packaging after our
  vite build step. The 0.2.8 DMG is verified to contain
  `app.asar.unpacked/node_modules/node-pty/` again.

## [0.2.7] — 2026-04-18

### Fixed (critical — please upgrade)
- **Releases 0.2.0 → 0.2.6 silently shipped stale renderer + main bundles.**
  The dev shortcut of invoking `npx electron-builder` directly skipped the
  `tsc && vite build` chain, so electron-builder packaged whatever was last in
  `dist/` and `dist-electron/` — which happened to be the pre-0.2.3 build.
  Symptoms users saw:
  - In-app update notifier (added in 0.2.3) never appeared in any installed
    DMG, including 0.2.6.
  - Terminal scroll wheel handler (added in 0.2.6) never reached users.
  - Harness `update` IPC handler shape variations (0.2.5 `.mcp.json` symlink
    logic, etc.) likewise weren't actually inside the installed app.
  - The Info.plist / `app.getVersion()` was correctly bumped, masking the bug.
- `electron-builder` now runs `scripts/before-build.js`, which executes
  `npx vite build` before packaging. This guarantees `dist/` + `dist-electron/`
  are fresh no matter how the build is invoked (full npm script chain or
  direct `electron-builder`).

If you're on **anything 0.2.0 through 0.2.6**, install 0.2.7 manually — the
in-app update notifier in those builds doesn't actually exist to tell you.

## [0.2.6] — 2026-04-18

### Fixed
- **Terminal didn't scroll.** xterm.js + the WebGL renderer on macOS
  trackpads occasionally swallow wheel events at the canvas layer, so the
  viewport stays pinned at the bottom no matter how much you scroll.
  XTerminal now installs an explicit `wheel` listener on the container that
  normalises pixel / line / page deltas into line counts and feeds them
  straight into `terminal.scrollLines()`. Shift-wheel scrolls 5× faster
  (matches xterm's "fast scroll" convention).
- Bumped `scrollSensitivity` to 3 and `fastScrollSensitivity` to 5 so even
  the built-in xterm wheel handler — when it does fire — moves a useful
  amount per tick.

## [0.2.5] — 2026-04-17

### Fixed
- **Project MCP servers now actually load.** Claude Code only auto-discovers
  MCP from `<project>/.mcp.json` (root), but our harness convention puts it at
  `<project>/.claude/mcp.json` — so workspaces silently lost every project-
  scoped server (serena, context7, supabase, …) defined in the bundled
  harness. `WorkspaceManager.create` and `.updateHarness` now drop a relative
  symlink at `<project>/.mcp.json -> .claude/mcp.json` so the harness file
  becomes the single source of truth, and Claude Code picks the servers up
  with no manual wiring.
- The symlink is idempotent: a regular file at `.mcp.json` is left alone
  (user-authored), a stale symlink is re-pointed.

### Workaround for existing workspaces (one-liner)
```bash
cd <workspace>
ln -sf .claude/mcp.json .mcp.json
```
Or just hit *Update* on the harness banner after installing 0.2.5 — the
symlink will be created during the update flow.

## [0.2.4] — 2026-04-17

### Fixed
- **"App is damaged and can't be opened" Gatekeeper error.** macOS Sequoia +
  Apple Silicon refuses to load entirely-unsigned bundles and surfaces the
  failure as a damaged-app dialog that not even right-click → Open recovers
  from. `scripts/after-pack.js` now invokes `codesign --sign - --deep --force`
  on the bundle when no Developer ID is configured, so installed `.app`s carry
  an ad-hoc signature. Gatekeeper will still show "unidentified developer" on
  first launch, but right-click → Open works as expected.
- The ad-hoc signing step is skipped automatically when `CSC_LINK`, `CSC_NAME`,
  or `CSC_IDENTITY_AUTO_DISCOVERY=true` is set — those builds get real
  Developer ID signing from electron-builder later in the pipeline.

### Workaround for 0.2.0 – 0.2.3 installs
If you already installed an earlier release and hit the damaged-app dialog,
run once and the app is healthy again:
```bash
xattr -cr "/Applications/Forge Studio.app"
codesign --sign - --deep --force "/Applications/Forge Studio.app"
```

## [0.2.3] — 2026-04-17

### Added
- **In-app update notifier.** A tiny amber pill in the TopBar (`v0.2.4` etc.)
  appears whenever GitHub has a newer release than the running app. Click it to
  open the release notes in the default browser. The check runs once on
  startup and every 60 minutes thereafter.
- New IPC: `api.updates.check()` returns `{ current, latest, hasUpdate,
  releaseUrl, publishedAt, notes, checkedAt, error }` and is backed by a
  dedicated `UpdateChecker` service hitting GitHub's `/releases/latest`
  endpoint with an 8s timeout.

### Notes
- This is the lightweight half of auto-update: surface the new release, let
  the user grab the DMG. Fully background install via `electron-updater` is
  blocked on restoring code signing + adding notarization, tracked
  separately.

## [0.2.2] — 2026-04-17

### Added
- **Bundled `mobile-design` skill** (vendored from
  [sickn33/antigravity-awesome-skills](https://github.com/sickn33/antigravity-awesome-skills),
  MIT). Mobile-first / touch-first / platform-respectful design discipline,
  including the Mobile Feasibility & Risk Index (MFRI) decision framework and
  per-platform / color / typography / navigation / performance / testing
  references.
- **Bundled `mobile-touch` skill** (vendored from
  [dylantarre/animation-principles](https://github.com/dylantarre/animation-principles),
  MIT). Disney's 12 animation principles applied to mobile gestures, haptics,
  spring/ease curves, and overscroll behavior.
- Skill Routing wired in `CLAUDE.md`: `lib/presentation/**` now auto-attaches
  both new skills, and dedicated rows for "모바일 화면/UX" and "제스처/햅틱/모션"
  trigger them by intent. Agent routing for UI requests now flows
  `pencil → mobile-design (MFRI) → flutter-ui → riverpod-logic`, with a
  separate motion-specific path through `mobile-touch → flutter-ui`.

### Notes
- Both upstream LICENSE files are vendored alongside each skill as
  `LICENSE.upstream` to preserve attribution under MIT.

## [0.2.1] — 2026-04-17

### Fixed
- **`sync-harness.sh` no longer wipes the bundled template on machines without a
  parent harness mono-repo.** The 0.2.0 DMG shipped with an empty
  `Contents/Resources/harness-template/`, so the in-app *Update Harness* button
  failed with `Bundled harness template not found`. The script now checks for
  `$HARNESS_ROOT/.claude/` and exits 0 (keeping the committed template) if it is
  absent.

### Docs
- README rewritten to lead with the harness-as-a-product story and drop
  references to the unrelated bkit plugin ecosystem.

## [0.2.0] — 2026-04-17

### Added
- **Harness auto-update**: per-workspace `.claude/.harness-version` marker, in-app
  banner, and one-click update that backs up the previous harness while preserving
  `agent-memory/`, `settings.local.json`, and `.pdca-*` files.
- **PATH augmentation in PTY**: macOS PTYs now prepend `/opt/homebrew/bin` and
  `/usr/local/bin` so GUI-launched shells find rbenv / nvm / pyenv / fvm without
  requiring `~/.zshrc` workarounds.
- **MesloLGS NF font** as the default xterm font so Powerlevel10k Nerd Font
  glyphs render correctly.
- **`afterPack` hook** (`scripts/after-pack.js`) restores the executable bit on
  `node-pty`'s `spawn-helper` after packaging — fixes `posix_spawnp failed` on
  installed builds.
- GPL-3.0-or-later LICENSE.

### Changed
- `WorkspaceManager.create` now writes a version marker into the freshly copied
  harness so future updates can compare cleanly.

## [0.1.0] — 2026-04

### Added
- Initial release: Electron shell, xterm.js terminal with split panes and tabs,
  workspace manager with bundled harness template, git integration, harness and
  MCP inspector, command palette, dashboard.
