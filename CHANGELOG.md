# Changelog

All notable changes to Forge Studio are documented here. The format follows
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/) and this project adheres
to [Semantic Versioning](https://semver.org/).

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
