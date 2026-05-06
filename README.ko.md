<div align="center">

[English](README.md) | 한국어

# Forge Studio

**[Claude Code](https://claude.com/claude-code)를 위한 네이티브 macOS GUI — 터미널, 워크스페이스, git, 그리고 일급 시민으로서의 하네스 매니저까지 한 창에서.**

[![License: GPL v3](https://img.shields.io/badge/License-GPL_v3-blue.svg)](https://www.gnu.org/licenses/gpl-3.0)
[![Electron](https://img.shields.io/badge/Electron-35-47848F?logo=electron&logoColor=white)](https://www.electronjs.org/)
[![React](https://img.shields.io/badge/React-19-61DAFB?logo=react&logoColor=black)](https://react.dev/)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.8-3178C6?logo=typescript&logoColor=white)](https://www.typescriptlang.org/)
[![Vite](https://img.shields.io/badge/Vite-6-646CFF?logo=vite&logoColor=white)](https://vitejs.dev/)

</div>

---

## 이게 뭐예요?

Forge Studio는 Claude Code를 IDE 형태의 워크스페이스로 감싸주는 데스크톱 앱입니다.
앱 안에 **번들된 `.claude/` 하네스**(에이전트, 스킬, 커맨드, 룰, 훅, MCP 설정)를
함께 출하하고, 그 하네스를 **버전 관리되는 업그레이드 가능한 산출물**로 다룹니다.
그 위에 워크스페이스 / 진짜 터미널 / git / 인앱 업데이트 알림이라는 주변 chrome을
얹어, 새 프로젝트를 만들면 한 번의 클릭으로 완전히 배선된 Claude Code 환경이
바로 갖춰지도록 설계되어 있습니다.

```
┌─────────────────────────────────────────────────────────────────┐
│  TopBar — workspace · harness badge · v0.2.4 ↑ · settings       │
├──────────┬──────────────────────────────────────────────────────┤
│          │  Harness update available · 0.2.0 → 0.2.3  [Update]  │
│ Sidebar  ├──────────────────────────────────────────────────────┤
│          │                                                      │
│ • WS     │              xterm-256color · split panes            │
│ • Git    │              ╭─ tab 1 ─╮ ╭─ tab 2 ─╮                 │
│ • Dash   │              │  zsh ▌  │ │ claude  │                 │
│ • Set    │              ╰─────────╯ ╰─────────╯                 │
│          │                                                      │
└──────────┴──────────────────────────────────────────────────────┘
```

---

## 하네스 매니저 (간판 기능)

대부분의 Claude Code 셋업은 `.claude/`를 **한 번 복사하고 끝**으로 다룹니다 —
프로젝트를 만들 때 에이전트/스킬을 한 벌 붙여넣고, 그 뒤로는 워크스페이스마다
조금씩 다른, 점점 낡아가는 스냅샷이 따로 떠다니게 됩니다. Forge Studio는 이 문제를
정면으로 해결합니다 — 하네스를 앱과 함께 출하되는 **버전 관리되는 제품**으로 보고,
인플레이스(in-place)로 안전하게 업데이트합니다.

### 라이프사이클

1. **빌드 시점에 번들링.** 모든 릴리즈는 검증된 `.claude/` + `CLAUDE.md`를
   `Contents/Resources/harness-template/` 안에 패키징합니다. 패키징 직전에
   `npm run sync-harness`가 부모 하네스 모노레포에서 최신 콘텐츠를 끌어옵니다.
   부모 하네스가 없는 클린 빌드 환경에서는 이 스크립트가 **안전한 no-op**으로
   동작해서, 커밋된 템플릿이 그대로 단일 진실 원본(source of truth)이 됩니다.
2. **워크스페이스 생성 시 도장 찍기.** 새 워크스페이스를 만들면
   `WorkspaceManager.create`가 번들된 템플릿을 복사하고, 그 빌드를 만든 앱
   버전을 담은 `.claude/.harness-version`을 같이 써둡니다.
3. **워크스페이스 오픈 시 diff.** 렌더러가
   `api.harness.getInstalledVersion(ws)`와 `api.harness.getBundledVersion()`을
   병렬로 호출해 비교하고, 두 값이 다르거나(혹은 마커 자체가 없는 레거시
   워크스페이스인 경우) 터미널 위에 호박색 배너를 띄웁니다.
4. **원클릭 안전 업데이트.** *Update* 버튼을 누르면 `api.harness.update(ws)`가
   호출되고, 내부적으로 `WorkspaceManager.updateHarness`가 거의-원자적인
   교체를 수행합니다:
   - **보존 목록** — `agent-memory/`, `settings.local.json`, 모든 `.pdca-*`
     파일을 임시 디렉터리에 스냅샷으로 떠둡니다.
   - **백업** — 기존 `.claude/`는 `.claude.bak.<ISO timestamp>`로 이동됩니다
     (절대 삭제하지 않음).
   - **교체** — 번들 템플릿을 복사해서 덮어씁니다 (업스트림 쪽
     `settings.local.json` / `.pdca-*`는 묵은 상태가 다시 끼어들지 않도록 제외).
   - **복원** — 보존해둔 파일들을 다시 위에 얹습니다.
   - **재발급** — 새 앱 버전을 담은 `.harness-version`을 다시 찍습니다.
   - **재마킹** — `harnessApplied=true`를 `workspaces.json`에 플러시합니다.
5. **눈에 보이는 인스펙터.** `HarnessScanner`가 `.claude/`를 훑어서 슬롯별
   카운트(에이전트, 스킬, 커맨드, 스크립트, 룰, MCP 서버, 훅)를 집계하고,
   라이브 MCP 상태와 함께 대시보드 패널에 표시합니다.

### 번들 하네스 안에 들어가는 것

| 슬롯 | 들어 있는 것 | 자동 부착되는 시점 |
|---|---|---|
| `agents/` | Claude Code가 띄울 수 있는 서브 에이전트 정의 (예: `flutter-ui`, `nestjs-backend`, `prisma-data`, `code-reviewer`, `security-auditor`) | Claude가 에이전트 설명에 매칭되는 요청을 라우팅할 때 |
| `skills/` | SKILL.md 파일들. 번들된 `mobile-design`(MFRI + 플랫폼별 레퍼런스), `mobile-touch`(제스처/햅틱용 디즈니 12원칙) 포함 | SKILL frontmatter의 파일 패턴이 지금 편집 중인 파일과 매칭될 때 |
| `commands/` | 슬래시 커맨드 (`/implement`, `/verify`, `/review`, `/checkpoint`, `/api-sync`, …) | 사용자가 `/<name>`을 입력하거나 워크플로가 자동 발사할 때 (대부분 verify/review 파이프라인에 미리 배선되어 있음) |
| `rules/` | 프로젝트 전역 룰: `architecture.md`, `coding-style.md`, `git-workflow.md`(세분화된 커밋 룰 포함), `security.md`, `testing.md` | Claude의 프로젝트 컨텍스트로 항상 로드됨 |
| `scripts/` | 훅 스크립트: `gateguard.sh`(PreToolUse), `skill-injector.sh`(파일 패턴 → 스킬 자동 부착), `learn.sh` + `evaluate-session.sh`(Stop), `mcp-health.sh`(SessionStart), `pre-compact.sh` | Claude Code의 훅 엔진이 트리거할 때 |
| `contexts/` | Claude가 필요할 때 끌어다 쓰는 장문의 도메인 컨텍스트 | CLAUDE.md에서 참조되거나 에이전트가 끌어올 때 |
| `mcp.json` | 프로젝트 단위 MCP 서버 설정 (context7, dart, serena, sequential-thinking, supabase, playwright, …) | Claude Code 세션 시작 시 로드 |
| `settings.json` | 프로젝트별 Claude Code 설정 — 훅 배선, 권한, 환경변수 | Claude Code 세션 시작 시 로드 |
| `.harness-version` | Forge Studio가 찍는 버전 마커 | 업데이트 배너가 읽음. 직접 수정 금지 |

### IPC 표면 (renderer → main)

```ts
api.harness.getBundledVersion()             // → '0.2.3'
api.harness.getInstalledVersion(workspace)  // → '0.2.0' | null (마커 없음)
api.harness.update(workspace)               // → { backupPath, version }
api.harness.scan(workspace)                 // 에이전트/스킬/커맨드/등 카운트
api.harness.getMcpStatus(workspace)         // 프로젝트별 MCP 서버 라이브 상태
api.harness.readFile(absPath)               // 샌드박스: 추적 중인 워크스페이스의 .claude/ 내부만 허용
```

---

## 그 외 기능들

### 진짜 터미널, 제대로

- **node-pty** 백엔드, 풀 xterm-256color, 트루컬러, **MesloLGS NF** Nerd Font
  기본 탑재 (Powerlevel10k 아이콘이 별도 설정 없이 바로 렌더링됨).
- **스플릿 패널**(가로 / 세로), 탭, 인-터미널 검색, 스크롤백 10,000줄.
- **macOS PATH 자동 보강**: PTY를 spawn할 때 `/opt/homebrew/bin`과
  `/usr/local/bin`을 앞에 끼워 넣어, GUI에서 띄운 셸도 `~/.zshrc` 우회 트릭
  없이 rbenv / nvm / pyenv / fvm을 바로 찾을 수 있습니다.
- **`spawn-helper` 권한 패치**가 빌드(`scripts/after-pack.js`)에 박혀 있어,
  설치된 `.app`에서 고전적인 `posix_spawnp failed`를 만나는 일이 없습니다.

### 워크스페이스 관리

- 새 워크스페이스 생성 / 열기 / 제거. 최근 목록은
  `~/Library/Application Support/Forge Studio/workspaces.json`에 저장됩니다.
- 새 워크스페이스 플로우는 표준 디렉터리(`lib/`, `server/`, `cms/`, `docs/`)
  를 만들어주고, `git init`을 돌리고, 번들 하네스를 복사한 뒤 버전 마커를
  찍어둡니다.
- 기존 폴더를 열면 `.claude/`를 자동 감지해, 하네스 인스펙터와 업데이트 배너
  쪽에 자연스럽게 슬롯-인됩니다.

### Git 통합

- 상태, 로그, 브랜치, diff, stage / unstage, commit, push, pull, fetch,
  브랜치 생성 / 체크아웃 / 삭제, discard.
- 커밋별 파일 목록과 diff 뷰어. 전용 Git 패널의 시각적 커밋 그래프 제공.
- StatusBar에 실시간 상태 반영.

### 인앱 업데이트 알림 (0.2.3부터)

- GitHub에 새 릴리즈가 올라오면 TopBar에 작은 호박색 `vX.Y.Z` 알약이 표시됩니다.
  클릭 → 기본 브라우저로 릴리즈 노트 열기. 닫기 → 해당 버전에 한해 숨김.
- `UpdateChecker`가 Electron `net`으로
  `/repos/mstagon/forge-studiov2/releases/latest`를 폴링(8초 타임아웃),
  zustand 스토어가 상태를 들고 있습니다. 마운트 직후 1차 체크 후 60분마다
  재확인합니다.

### 인스펙터 대시보드

- 워크스페이스별 하네스 항목 라이브 카운트.
- MCP 서버 상태 패널 (running / errored / not configured).
- 커맨드 팔레트 (⌘⇧P).

---

## 설치

### 빌드된 패키지 (권장)

[Releases](https://github.com/mstagon/forge-studiov2/releases/latest)에서 최신 DMG를
받으세요.

```bash
open ~/Downloads/Forge\ Studio-*.dmg
# /Applications에 드래그 → 처음 실행할 때는 우클릭 → Open
# (현재 빌드는 서명되지 않았기 때문에, 우클릭 → Open으로 한 번만 Gatekeeper 우회)
```

### 소스에서 빌드

```bash
git clone https://github.com/mstagon/forge-studiov2.git
cd forge-studiov2
npm install                  # @electron/rebuild + isbinaryfile 패치 동시 실행
npm run electron:build       # → release/Forge Studio-<version>-arm64.dmg
```

### 요구 사항

- macOS 12+ (Apple Silicon 또는 Intel)
- Node 20+
- Xcode Command Line Tools (네이티브 node-pty 리빌드용)

---

## 개발

```bash
npm install
npm run electron:dev   # vite dev 서버 + electron, HMR 포함
npm run typecheck      # tsc --noEmit
npm run lint
```

`npm run sync-harness`는 부모 모노레포의 하네스를 `resources/harness-template/`로
끌어옵니다. 부모 하네스가 없는 클린 체크아웃에서는 no-op으로 동작하고
커밋된 템플릿을 그대로 유지합니다 — 어디서 돌려도 안전합니다.

### 새 Flutter 프로젝트 생성 시 — 네트워크 스택은 dio + retrofit

Forge Studio는 워크스페이스 생성 시 `client/`, `server/`, `cms/`, `docs/`
디렉터리만 만들 뿐, 그 안의 Flutter 코드를 직접 scaffolding 하지는 않습니다.
그러므로 새로 만든 `client/` 안에 Flutter 프로젝트(`flutter create .`)를
부어 넣을 때, **네트워크 스택은 `http` 패키지가 아니라 dio + retrofit으로
세팅하는 것이 하네스의 표준 권고**입니다.

번들 하네스의 `dio-retrofit` 스킬(`/.claude/skills/dio-retrofit/SKILL.md`)이
인터셉터 / Auth 갱신 / Repository / 코드젠 패턴을 모두 포괄하며,
`coding-style.md`에는 `http` 패키지 사용을 명시적으로 금지하는 룰이 박혀 있습니다.

`pubspec.yaml` 권장 디펜던시 (pub.dev 최신 stable 기준):

```yaml
dependencies:
  dio: ^5.9.2
  retrofit: ^4.9.2
  json_annotation: ^4.11.0

dev_dependencies:
  retrofit_generator: ^10.2.5
  build_runner: ^2.14.1
  json_serializable: ^6.13.1
```

코드젠은 `dart run build_runner build --delete-conflicting-outputs`로 돌립니다.

### 프로젝트 구조

```
electron/
├── main.ts                    # IPC 핸들러 + 앱 라이프사이클
├── preload.ts                 # contextBridge API surface
└── services/
    ├── PtyManager.ts          # node-pty + macOS PATH 보강
    ├── WorkspaceManager.ts    # 워크스페이스, 하네스 버저닝, updateHarness
    ├── HarnessScanner.ts      # .claude/ 인스펙터 + MCP 상태
    ├── GitManager.ts          # git plumbing
    └── UpdateChecker.ts       # GitHub Releases 폴링

src/
├── App.tsx                    # 레이아웃 셸 + 글로벌 단축키 + 업데이트 폴링
├── components/
│   ├── layout/                # TopBar (+ AppUpdateBadge), Sidebar, StatusBar
│   ├── terminal/              # XTerminal + TerminalPanel (스플릿 패널)
│   ├── git/                   # status, log, diff, branch picker, GitGraph
│   ├── dashboard/             # DashboardPanel + CommandPalette
│   └── workspace/             # NewWorkspaceDialog + HarnessUpdateBanner
├── stores/                    # zustand: workspace + terminal + appUpdate
└── types/

scripts/
├── after-pack.js              # 빌드 후 node-pty spawn-helper에 +x 복원
├── patch-isbinaryfile.js      # @electron/osx-sign isbinaryfile postinstall 패치
└── sync-harness.sh            # resources/로 하네스 끌어옴 (안전 no-op fallback)

resources/
└── harness-template/          # 번들된 .claude/ + CLAUDE.md (커밋된 상태)
```

---

## 버저닝

Forge Studio는 [SemVer](https://semver.org/)를 따릅니다. 번들 하네스는 앱
버전을 그대로 상속받습니다 — `.claude/.harness-version`이 `app.getVersion()`과
다른 워크스페이스를 열면 업데이트 배너가 뜹니다. 인앱 업데이트 알림(0.2.3+)이
앱 자체를 GitHub Releases와 동기화 상태로 유지해 줍니다.

릴리즈 노트는 [CHANGELOG](CHANGELOG.md)에서 확인하세요.

---

## 기술 스택

| 레이어 | 사용 기술 |
|---|---|
| 셸 | Electron 35, contextIsolation on, sandbox off (PTY가 Node를 필요로 함), preload IPC bridge |
| 렌더러 | React 19, Vite 6, Tailwind 3, Zustand |
| 터미널 | xterm.js 5.5 (+ webgl, fit, search, web-links, unicode11, serialize) |
| PTY | node-pty 1.0 (@electron/rebuild로 Electron에 맞춰 리빌드) |
| 빌드 | electron-builder 25 (DMG + ZIP, 네이티브 모듈용 asarUnpack, `afterPack` chmod 보정, `postinstall` isbinaryfile 패치) |

---

## 로드맵 / TODO

검토 중인 큰 그림들. 순서는 대략적이며, PR 환영합니다.

- [ ] **프레임워크 프리셋** — 현재의 Flutter + NestJS + Prisma + Next.js
      모노레포 템플릿 너머로, 플러그인 형태로 갈아끼울 수 있는 번들 하네스.
      후보: Next.js 단독, Vite-React 단독, SvelteKit, FastAPI + Next,
      Tauri + Rust, Expo + Convex, Go + Templ, Rails 8. 각 프리셋은
      `resources/presets/<name>/.claude/` 아래에 살게 되고, 워크스페이스
      생성 시점에 선택됩니다 (New Workspace 다이얼로그에 "Preset"
      드롭다운이 추가됨).
- [ ] **팀 워크스페이스** — 여러 머신, 여러 사용자가 공유하는 워크스페이스
      상태. 실제 모양:
      - 워크스페이스 메타데이터 동기화 (workspaces.json → 서버) — 다른
        랩탑에서 열어도 동일한 최근 목록과 하네스 기대치가 따라옴
      - 워크스페이스별 공유 `agent-memory/` — 팀의 에이전트들이 함께
        조직 지식을 누적
      - 같은 `.claude/` 슬롯을 동시에 편집할 때 presence + lock 인디케이터
- [ ] **하네스 매니지먼트 UI** — 인스펙터를 넘어, 번들 템플릿을 위한 일급
      편집기. 에이전트, 스킬, 커맨드, 룰, 훅을 Forge Studio 안에서 바로
      추가 / 삭제 / 편집하고, 업스트림과 diff를 뜨고, 다시 하네스 모노레포
      또는 팀 전용 비공개 하네스 레지스트리에 publish할 수 있게. 팀이
      자신만의 하네스 fork를 앱에서 떠나지 않고 유지보수하기 위한 토대.
- [ ] **CI/CD 플로우** — 번들 스크립트로 함께 출하되는 GitHub Actions
      배선: 푸시마다 lint + typecheck + electron-builder, 태그 푸시 시
      서명 + 노터라이즈 DMG, CHANGELOG에서 자동 생성되는 릴리즈 노트,
      서명이 복구되면 `electron-updater`가 백그라운드 설치를 할 수 있도록
      latest-mac.yml 퍼블리시까지.
- [ ] **팀 에이전트 시각화** — 지금 이 순간 (팀 머신 전반에서) 어떤
      서브 에이전트가 돌고 있는지, 무엇을 하고 있는지, 토큰을 얼마나
      썼는지, 최근 어떤 결정을 내렸는지의 라이브 그래프. Claude Code가
      이미 내보내고 있는 텔레메트리 스트림을 그대로 사용하고, 그래프
      GUI가 그 위에 빠진 마지막 조각이 됩니다. "지금 누가 뭘 만지고
      있는가" 파악과 에이전트 팀이 만든 피처의 사후 리뷰에 유용.

먼저 출시한 항목들 (이미 출하됨, 맥락 보존을 위해 남겨둠):

- 버전 마커가 박힌 번들 하네스 + 원클릭 인앱 업데이트 (0.2.0–0.2.1)
- macOS PTY PATH 보강 + Powerlevel10k Nerd Font 지원 (0.2.0)
- `mobile-design` + `mobile-touch` 스킬 번들링 (0.2.2)
- GitHub Releases를 폴링하는 인앱 업데이트 알림 (0.2.3)

---

## 라이선스

[GPL-3.0-or-later](LICENSE) © Forge Studio contributors.

본 프로그램은 자유 소프트웨어입니다. Free Software Foundation이 발행한 GNU
General Public License의 버전 3 또는 (선택적으로) 그 이후 버전의 조건에 따라
재배포 및/또는 수정할 수 있습니다.
