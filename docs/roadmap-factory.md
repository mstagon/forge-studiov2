# Roadmap — Forge as a Trust-Verified Autonomous Dev Factory

**작성**: 2026-06-12
**전환 서사**: "Claude Code GUI 래퍼" → **"계약을 넣으면 공장이 만들고, 중립 심판이 검증하고,
블랙박스로 되돌려볼 수 있는 자율 개발 공장"**. 래퍼의 기능 우위는 시한부 — Anthropic 이
구조적으로 못 만드는 것 (cross-provider 중립 심판) 을 코어로.

## 3종 + 볼트 (사용자 승인: 1,2,4 + Obsidian)

```
계약(contracts/) → [Night Shift 큐·스케줄러] → forge-team 생산 → merge
                                                        ↓
                            [Gauntlet] cross-provider 적대 심판 → verdict
                                                        ↓
                    [Flight Recorder] 전 과정 타임라인 기록 → 리플레이/분기
                                                        ↓
                            [Vault] 리포트·브리핑·결정 → Obsidian 미러
```

---

## v0.19 — Gauntlet 코어 + Obsidian 볼트 (이번)

### Gauntlet (적대 심판)
중립 심판이 영원히 서드파티 자리인 이유: Anthropic 은 GPT 심판을, OpenAI 는 Claude 심판을
자기 제품에 안 넣는다. Forge 만 둘 다 부른다.

- `GauntletRunner` (electron/services/GauntletRunner.ts, electron-free)
  - 입력: workspacePath, diff range (git), 심판 구성 (provider+model 목록, 기본 claude+codex)
  - 각 심판을 headless 로 spawn: `claude -p "<프롬프트>" --output-format json` /
    `codex exec --json -m <model> "<프롬프트>"` — diff 를 프롬프트에 인라인
  - 프롬프트: "이 diff 를 적대적으로 검수하라. 버그/보안/회귀를 찾고, 못 찾으면
    그렇다고 말하라. 각 발견은 {severity, file, line, claim, repro, confidence}."
  - 심판 출력 → verdict JSON 통합 (심판별 findings + 교차 합의/이견 표시)
  - 산출: `.claude/gauntlet/<ts>.json` + `<ts>.md` (사람용 리포트)
- `forge-team gauntlet --workspace . --range HEAD~1..HEAD [--judges claude-opus-4-8,gpt-5.5]`
  - exit 0 = blocker 없음 / exit 3 = blocker 발견 (CI 게이트용)
- 합의 로직: 2개+ 심판이 같은 file:line 을 지적하면 confidence 승격, 1개만이면 "단독 주장"

### Obsidian 볼트 연동
- `ForgeConfig.obsidianVaultPath` (신규 필드)
- `VaultSync` (electron/services/VaultSync.ts): 설정되면 Gauntlet 리포트 / (v0.20)
  아침 브리핑 / 팀 완료 요약을 `<vault>/Forge/<workspace>/` 에 markdown 미러.
  frontmatter (tags: forge/gauntlet, date, verdict) + [[wikilink]] 로 그래프 연결.
- Settings → Agents "팀 동작" 카드에 볼트 경로 필드.

## 구독 랩핑 제약 (v0.19.1 — 전 단계 공통)

claude/codex 는 **구독 랩핑**으로 작동 (API 키 아님). 함의:
- **stray API 키 = 독**: ANTHROPIC_API_KEY 가 env 에 있으면 CLI 가 구독을 무시하고
  저단가 API 로 라우팅 (= "크레딧 부족" 에러). `ForgeConfig.authMode='subscription'`
  (기본) 이 spawn 전 `authScrubbedEnv` 로 제거. GauntletRunner + 멤버 spawn 적용 완료.
- **한도 = 롤링 사용량** (토큰 크레딧 아님): 429 `rate_limit_error`. GauntletRunner 가
  분류 + 백오프 재시도. **Night Shift 는 반드시 순차 + 넉넉한 백오프** — 밤새 버스트로
  돌리면 5시간 한도 소진. factory run 은 한도 감지 시 일시정지 → resets 후 재개.
- 분류: rate_limited(재시도) / auth(크레딧·로그인 — 사용자 개입) / error.

## v0.20 — Night Shift (자율 공장)

- `<workspace>/.claude/factory/queue.json` — 계약 기반 작업 큐 (각 항목: contract 경로,
  목표, 멤버 구성, 의존성)
- `forge-team factory run` — 큐를 순차/의존성 순으로: forge-team 생산 → merge →
  Gauntlet 검수 → 통과 시 다음, blocker 시 멈추고 사람 대기 표시로 큐에 기록
- 아침 브리핑: `factory/briefing-<date>.md` — 완료 PR / 막힌 항목 / 사람 결정 필요 /
  Gauntlet 요약. VaultSync 로 볼트에도.
- 스케줄러: cron 또는 macOS launchd (Forge GUI 가 등록). "관전 GUI = 공장 관제실" 로 의미 전환.
- 부품 재사용: contracts(0.14) + 자동 archive(0.13) + lineage(0.14) + Gauntlet(0.19).

## v0.21 — Flight Recorder (블랙박스/리플레이)

- 멤버 tmux pane 출력 + 파일 변경 + inbox + git 커밋을 단일 타임라인 이벤트 스트림으로 영속
  (`.claude/recorder/<teamId>.jsonl`)
- GUI 타임라인 스크럽 + 시점 분기 (worktree 를 그 시점 커밋으로 reset 후 새 멤버)
- "AI 작업을 믿어도 되나" 의 UI 해법. 아침 브리핑 뷰어가 이것의 진입점.

---

## 알려진 갭 / 다음 단계 (v0.22+)

- **Gauntlet GitHub Action ("적대적 CI")**: PR 마다 cross-provider 적대 심판을 돌려
  blocker 시 체크 실패 + PR 코멘트. Forge 안 쓰는 사람도 유입되는 깔때기.
  난점: forge-cli 가 npm 미publish — CI 러너에 vendoring 하거나 standalone action
  패키지 필요 + CI 는 authMode=api (구독 OAuth 는 headless 불가, secrets 로 API 키).
- **Flight Recorder GUI 스크럽**: 지금 timeline 은 CLI/jsonl 만. GUI 타임라인
  스크럽 + fork 버튼은 미연결.
- **fork 정리 갭**: `recorder fork` 가 만든 `fork/<teamId>/<agent>` worktree/브랜치는
  archiveTeam/remove 가 정리 안 함 (member 브랜치만). 수동 기능이라 후순위.
- **factory GUI run 트리거**: 관제실은 읽기 전용. run 은 장기 프로세스라 GUI 에서
  띄우려면 PtyManager 로 터미널에 명령 주입하는 방식 고려.

## 다음 세션 인수인계
- v0.19 부품: GauntletRunner / VaultSync / forge-team gauntlet CLI / ForgeConfig.obsidianVaultPath
- 새 electron/services 모듈은 **package.json extraResources forge-cli 필터에 추가** ([[forge-packaging-trap]])
- gh push 전 `gh auth switch -u mstagon`
- 하네스 내용 바뀌면 `.claude/harness-version` bump + 프리셋 overlay 4종 재생성
