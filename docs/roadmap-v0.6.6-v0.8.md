# Forge Studio Roadmap v0.6.6 → v0.8.0

> 다음 세션이 컨텍스트 클리어 후에도 이어가도록 영구 저장 문서.
> 이 파일은 항상 최신 상태로 유지하고, 작업 진행에 따라 업데이트한다.

## 0. 사용자 정책 (절대 변경 금지)

- 서브에이전트 (`Agent` / `Task` 도구) **사용 금지**. v0.6.0 의 `permissions.deny` + PreToolUse 훅이 차단.
- 모든 위임은 **Forge Team** 으로만 — 격리 worktree + tmux session + 별 Claude 인스턴스.
- 메인 세션의 호출 인터페이스는 `forge-team` CLI (`bin/forge-team` 또는 `Forge.app/Contents/Resources/forge-cli/bin/forge-team`).

## 1. 현재 상태 (v0.6.5 기준 — 빌드 완료, 사용자 검증 대기 중)

### 작동 중인 것
- LiveTerminalsRoot (App 레벨 portal pool)
- forge-team CLI (create / list / pause / resume / merge / remove)
- TeamOperations.ts 순수 모듈
- React `Rendered more hooks` fix
- agent PTY cache (teams:openAgentTerminal)
- WorkspaceV2 항상 mount + display 토글

### 미해결 / 절반만 구현
- **worktree 생성 실패** — `team/<id>` baseBranch 와 `team/<id>/<agent>` 멤버 브랜치 git refs 디렉토리 hierarchy 충돌. silent fallback to shared 모드 → 모든 멤버 같은 root 에서 작업 → 메인 세션이 위험 감지하고 멈춤. **사용자가 즉시 막힌 이슈**.
- **inbox 백엔드만 구현** — `<teamDir>/inboxes/<member>.json` 읽기, `messageCount`/`unreadCount` 필드 다 있음. **send IPC 없음, UI 없음**.
- **Sprint 분배 메커니즘 없음** — planner agent 가 자유 텍스트로 plan, 표준 output 형식 없음, 자동 dependency 분석 없음.
- **Council (다모델 토론) 없음** — Opus + GPT 동시 활용 메커니즘 부재.
- **ProviderRouter 없음** — 멤버에 model 명시 + provider 별 CLI 분기 없음.

## 2. 사용자 요구사항 정리

### 채팅앱 만들기 시나리오 (이상적 플로우)
1. **Plan**: planner 가 phase + dependency graph 출력
2. **TDD**: test-writer 가 실패 테스트 먼저
3. **Phase 별 sequential** spawn — 안의 멤버는 병렬 (worktree 격리)
4. **충돌 방지**: 같은 파일 건드릴 가능성 있는 작업은 자동 sequential 변환
5. **소통**: inbox 메시지 + shared status 보드
6. **검증**: merge → /verify (build + test + lint) → 충돌 시 loop-operator

### 모델 활용 (사용자 의견)
- **Opus 4.7**: 큰 그림, creative, 긴 reasoning
- **GPT-5.5**: blast radius / 영향 분석 / 형식적 검증 / 세부 디테일

### Council (CCC 토론) 적용
- Plan / Tech-architect / Code review / Merge conflict resolution

## 3. 모델 매핑 표 (에이전트별)

| 에이전트 | 모델 | 이유 |
|---|---|---|
| `planner` | Opus | phase 분해 + creative |
| `tech-architect` | **Council** (Opus+GPT) | 큰 결정 trade-off 다양 |
| `flutter-ui` | Opus | UI = creative |
| `riverpod-logic` | Opus | state 설계 |
| `nestjs-backend` | Opus | API 구현 |
| `prisma-data` | **GPT** | 스키마/FK/인덱스 정확성 |
| `code-reviewer` | **Council** | 다른 시각 가치 |
| `security-auditor` | **GPT** | OWASP 형식적 |
| `spec-verifier` | **GPT** | 영향 분석 |
| `test-writer` | Opus | TDD creative |
| `refactor-cleaner` | **GPT** | blast radius |
| `doc-updater` | Opus | 자연어 |
| `build-error-resolver` | Opus | reasoning chain |
| `loop-operator` | Opus | 반복 reasoning |

## 4. CCC 토론 메커니즘 설계

### Round 구조
```
Round 1: 각 모델 독립 제안
Round 2: 상호 비판 + 보완 (상대 제안 본 후)
Round 3: 합의안 또는 escalate (사용자 결정 요청)
```

### 적용 지점 4개
1. **Plan phase** — planner Council. Opus 가 phase 분해, GPT 가 영향 분석/edge case
2. **Tech-architect** — 아키텍처 결정 (DB, 인증, 상태관리 등)
3. **Code review 3종** — code-reviewer/security-auditor/spec-verifier 모델 다양화
4. **Merge conflict resolution** — 두 모델이 각자 strategy 제안

### 데이터 흐름 (inbox 활용)
- 멤버 A 의 inbox = 자기 의견
- 멤버 B 의 inbox = 자기 의견
- Round 마다 서로 inbox 읽기 + 추가 메시지
- 합의 시 final inbox entry 출력 (메인 세션이 읽고 적용)

## 5. config.json 확장 안

```json
{
  "members": [
    { "agentId": "planner", "model": "opus-4.7", "task": "..." },
    { "agentId": "spec-verifier", "model": "gpt-5.5", "task": "..." }
  ],
  "council": {
    "phases": ["plan", "review"],
    "rounds": 3,
    "consensus": "manual"
  }
}
```

## 6. 단계별 plan

### v0.6.6 (즉시 — 사용자 막힌 거 풀기)

#### A. worktree 생성 fix
**파일**: `electron/services/TeamOperations.ts`

baseBranch 네이밍 변경:
- 현재: `team/<teamId>` (충돌)
- 신규: `team/<teamId>-base` (refs 디렉토리 hierarchy 충돌 해소)

멤버 브랜치는 그대로 `team/<teamId>/<agentId>`. baseBranch 만 `-base` suffix.

create + merge 로직에서 baseBranch 참조하는 모든 곳 수정. resolveBaseBranch / ensureBranch / merge 의 checkout / branch 정리 path.

#### B. inbox sendMessage IPC + 간단 UI
**파일**:
- `electron/main.ts`: `teams:sendMessage(teamId, fromAgent, toAgent, text)` IPC handler 추가
- `electron/services/TeamOperations.ts`: `sendInboxMessage(teamId, fromAgent, toAgent, text)` 메서드
- `electron/preload.ts`: `window.api.teams.sendMessage` 노출
- `src/components/v2/RunLiveView.tsx`: 멤버 카드 클릭 → 사이드 패널 (inbox list + send box)
- `src/stores/agentTeam.ts`: `sendMessage` action

inbox JSON 포맷 (이미 존재):
```json
{ "from": "planner", "text": "...", "summary": "...", "timestamp": "ISO", "color": "#...", "read": false }
```

#### C. 멤버 config 에 model 필드 (조용한 추가)
**파일**: `electron/services/TeamOperations.ts` RawMember + Wizard
- model 필드 추가 (선택, 기본값 `claude-opus-4-7`)
- 사용은 v0.7.0 부터, 일단 저장만

### v0.7.0 (Council + ProviderRouter)

#### A. ProviderRouter
**파일**: `electron/services/ProviderRouter.ts` (NEW)
- model 패턴 → CLI 명령 매핑:
  - `opus-*` / `claude-*` → `claude` (Anthropic)
  - `gpt-*` / `o1-*` → `codex` (OpenAI, plugins 에 이미 있음)
- TeamOperations.create 가 멤버 spawn 시 ProviderRouter 통해 적절한 CLI 실행

#### B. planner Council 메커니즘
**파일**: `electron/services/CouncilOrchestrator.ts` (NEW)
- 두 멤버 (Opus planner + GPT planner) spawn
- inbox round-robin: Round 1 propose → Round 2 critique → Round 3 consensus
- 결과 plan.json 출력 (phase + dependencies)

#### C. forge-team plan / execute CLI
**파일**: `bin/forge-team.ts`
```bash
forge-team plan --workspace . --goal "채팅앱"
# → plan.json (phases, dependencies, members)

forge-team execute --plan plan.json
# → 의존성 순서로 forge-team create 자동 호출
# → 각 phase 완료 대기 → forge-team merge → next phase
```

### v0.7.1 (Code review Council)

3종 리뷰에 모델 다양화:
- code-reviewer (Opus) + security-auditor (GPT) + spec-verifier (GPT) 병렬 spawn
- 충돌 의견 시 추가 round (Council escalation)
- 결과 합의 안 되면 사용자에게 표시

### v0.8.0 (UI 통합)

#### A. Sprint Manager 탭
- 새 sidebar view (Sprint)
- 현재 plan 의 phase 진행률
- 각 phase 의 멤버 status
- merge 한 번에 (sequential)

#### B. RunLiveView Discussion 탭
- 멤버 옆 "Discussion" 탭
- Council round 별 메시지 리스트
- 합의/escalate 상태

#### C. Wizard "Council mode" 토글
- 팀 생성 시 Council 적용 여부
- 적용할 phase 선택 (plan / review)

#### D. 멤버 카드 model 배지
- Opus 또는 GPT 배지 표시
- composition 미리보기에 model 정보

#### E. 자동 dependency 분석
- planner 결과의 expected_files 추적
- 같은 파일 건드릴 멤버 자동 sequential 변환
- 충돌 가능성 시 사용자에게 경고

## 7. 메인 세션 호출 패턴 (이미 작동 중)

```
유저: "채팅앱 만들어줘"
  ↓
메인 세션 (Claude Code, Opus):
  1. (v0.7.0+) Bash(forge-team plan --goal "채팅앱") → plan.json
  2. (v0.7.0+) Bash(forge-team execute --plan plan.json)
  또는 (v0.6.x):
  1. Bash(forge-team create --members "prisma-data:Message+Room 스키마")
  2. forge-team list 폴링 → 완료 대기
  3. Bash(forge-team merge --team-id <id>)
  4. 다음 phase 반복
  ↓
GUI 가 chokidar 로 자동 반영 (~120ms)
사용자가 RunLiveView 에서 라이브 보기
```

## 8. 진행 추적 체크리스트

### v0.6.5 (현재 빌드 완료, 검증 대기)
- [x] WorkspaceV2 mount 보존
- [ ] 사용자가 새 .app 으로 시나리오 검증 (+ 버튼 → claude → Library → 다시)
- [ ] 결과 보고 — 통과 / 실패

### v0.6.6 (다음)
- [ ] baseBranch 네이밍 fix (`team/<id>-base`)
- [ ] worktree 생성 정상 작동 검증
- [ ] inbox sendMessage IPC + handler
- [ ] inbox UI (RunLiveView 멤버 카드 클릭 → 패널)
- [ ] 멤버 config 에 model 필드 (조용히 추가)
- [ ] CHANGELOG + tag + DMG + release

### v0.7.0
- [ ] ProviderRouter
- [ ] CouncilOrchestrator (planner)
- [ ] forge-team plan / execute CLI
- [ ] CHANGELOG + tag + DMG + release

### v0.7.1
- [ ] Code review 3종 모델 다양화
- [ ] Council escalation 메커니즘

### v0.8.0
- [ ] Sprint Manager 탭
- [ ] Discussion 탭
- [ ] Wizard Council 토글
- [ ] 멤버 model 배지
- [ ] 자동 dependency 분석

## 9. Known issues / 결정사항

### 결정
- 서브에이전트 사용 금지 (정책)
- 모든 위임은 forge-team CLI
- 한국어 커밋 메시지 + Co-Author 금지 (PreToolUse 훅 차단)
- ad-hoc codesign (Apple Developer ID 없음) — 사용자 quarantine 우회 필요

### Known issues
- macOS quarantine — 사용자가 새 DMG 받을 때마다 `xattr -cr "/Applications/Forge Studio.app"` 필요
- forge-team 의 worktree-strategy `isolated` 시 baseBranch 충돌 (v0.6.6 fix)
- gh CLI release create 시 mstagon 활성 계정 필요 (`gh auth switch -u mstagon`)

## 10. 빠른 참조

### 빌드 + 릴리즈 명령
```bash
cd "/Users/macms/Downloads/forge-studiov2-main 2"
sed -i "" "s/\"version\": \"0.6.X\"/\"version\": \"0.6.Y\"/" package.json
npm run typecheck
git checkout -b fix/v0.6.Y-name
git add ... && git commit -m "fix(...): 한글 메시지"
git push -u origin fix/v0.6.Y-name
gh pr create --title "..." --body "..."
gh pr merge --squash --delete-branch
git checkout main && git pull origin main
git tag -a v0.6.Y -m "Release v0.6.Y"
git push origin v0.6.Y
npm run release:dmg
gh auth switch -u mstagon  # 필요 시
gh release create v0.6.Y --title "..." --notes "..." \
  "release/Forge Studio-0.6.Y-arm64.dmg" \
  "release/Forge Studio-0.6.Y-arm64-mac.zip"
```

### 사용자 .app 띄우기
```bash
pkill -f "Forge Studio" ; sleep 1
xattr -cr "/Applications/Forge Studio.app"
open "/Users/macms/Downloads/forge-studiov2-main 2/release/mac-arm64/Forge Studio.app"
```

### 핵심 파일
- `electron/services/TeamOperations.ts` — 팀 라이프사이클 순수 모듈
- `electron/services/AgentTeamWatcher.ts` — chokidar + IPC bridge
- `electron/main.ts` — IPC handlers
- `bin/forge-team` + `bin/forge-team.ts` — 헤드리스 CLI
- `src/App.tsx` — view 라우팅 + LiveTerminalsRoot
- `src/components/v2/LiveTerminalsRoot.tsx` — App 레벨 PTY pool
- `src/components/v2/LiveTerminalGrid.tsx` — RunLiveView 의 멤버 grid
- `src/components/v2/TerminalAreaV2.tsx` — shell 터미널 (+ 버튼)
- `src/stores/liveTerminals.ts` — active team store
- `src/stores/agentTeam.ts` — teams 데이터
- `resources/harness-template/CLAUDE.md` — 메인 세션 ROLE 정의
- `resources/harness-template/.claude/settings.json` — 훅/permissions
