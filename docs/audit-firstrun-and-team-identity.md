# 전수조사 — 최초실행/프리셋/워크스페이스 플로우 + 팀 정체성 재평가

**작성**: 2026-06-11 (v0.14.0 릴리즈 직후)
**트리거**: 사용자 — "최초실행 플로우/프리셋/디렉토리 열기 전부 손봐야함. 버전/UI 수치 검수.
Fable 5 때문에 팀 의미 없어진 것 아니냐 — 무조건 만들지 말고 생각해봐."

---

## 1. 발견된 결함 (전수조사 결과)

### 🔴 프리셋 시스템 — 사실상 베이퍼웨어
- `flutter-nest` (코드가 "기본 프리셋"으로 참조) — **디스크에 존재하지 않음**
- `empty` / `nextjs-only` — `.claude/` 빈 디렉토리뿐 (파일 0개)
- git 추적 0개 → 클론하면 그마저 사라짐
- **`package.json` extraResources 에 presets 미포함 → 패키징 앱엔 bundled preset 0개**
- NewWorkspaceDialog 의 프리셋 picker 는 장식. 빈 프리셋 선택 시 빈 하네스 워크스페이스 생성

### 🔴 Wizard AGENT_POOL (src/components/v2/data.ts) — mock 이 실배선됨
- 18개 id 중 실제 `.claude/agents/` 와 일치: **flutter-ui, nestjs-backend 단 2개**
- 나머지 (flutter-state, prisma-schema, next-app, reviewer, architect, test-unit, infra-k8s...)
  전부 가짜 id → GUI 로 만든 팀 멤버 대부분이 존재하지 않는 agent
- Onboarding Step5 "Sample Run" prefill = `['flutter-ui','nestjs-auth','reviewer']`
  — nestjs-auth 는 skill (agent 아님), reviewer 는 미존재. **첫 경험이 깨진 팀**

### 🔴 agents/ 정의가 spawn 에 사용되지 않음 (서사 ≠ 실제)
- `ProviderRouter.launchCommand` = `claude --dangerously-skip-permissions [--model X]` 뿐
- `.claude/agents/<id>.md` 의 system prompt 는 멤버 부팅에 **전혀 주입 안 됨**
- 멤버 정체성은 tmux 로 보내는 task prompt 텍스트 한 장이 전부
- CLAUDE.md 의 "agentId 는 agents/ 정의 참조, system prompt 가 역할을 정한다" = 현재 거짓

### 🟡 StatusBar fake 수치
- `mcpOk=4 / mcpTotal=5` 디폴트 — 실제 MCP 상태와 무관하게 "4/5" 표시
- `fileMeta='UTF-8 · LF · TypeScript'` 하드코딩
- 실값은 agents 수 / run 수만

### 🟡 버전 표기
- 하네스 버전 = 앱 버전을 그대로 기록 (`writeVersionFile(app.getVersion())`)
  — "하네스 업데이트 가능" 판정이 사실상 앱 버전 비교. 독립 버저닝 아님
- UpdateChecker (GitHub release 비교) 자체는 정상

### 🟡 Onboarding (5-step)
- Step2 deps 체크 / Step3 워크스페이스는 동작하나, Step4 "하네스 투어" + Step5 샘플런이
  구 독트린 (팀 만능) + 가짜 agent pool 기준 — 아래 2번 결론에 따라 재설계 대상

---

## 2. 팀 정체성 재평가 — "Fable 5 때문에 팀 의미 없어진 것 아니냐"

**결론: 절반은 맞다. "무조건 팀" 독트린은 Fable 5 에서 음수가 됐다.
하지만 팀이 이기는 3가지 시나리오는 남는다.**

### 약해진 근거 (정직하게)
1. Fable 5 메인 (1M ctx + max effort) 혼자 풀스택 피처를 끝냄 — 오늘 세션이 실증:
   v0.13+v0.14 전체 (훅 12개 + 팀 로직 + GUI + 릴리즈 2회) 를 메인 단독으로.
   팀이었으면 부팅 대기 + 계약 협의 + 머지 + 재검수 오버헤드가 더 컸음
2. 멤버는 Opus 4.8 = 메인보다 약함 → 위임 결과를 메인이 재검수 → 위임 이득 잠식
3. 이번에 고친 결함 목록이 곧 증거: dto-broadcast 무발사, cleanup 누수, 1인팀 남발,
   prompt 주입 타이밍, NFC/NFD… **멀티 인스턴스 조정비용은 구조적으로 비쌈**
4. agents/ 정의가 spawn 에 안 쓰임 — "전문 에이전트 팀" 서사의 핵심이 이미 허상이었음
5. 1인팀 남발의 뿌리 = "메인은 코더 아님" 독트린. LLM 에게 위임을 강제하니
   모든 작업을 팀으로 만들었던 것. 가드는 증상 치료였음

### 그래도 팀이 이기는 곳
1. **wall-clock 병렬** — 독립 스택 30분+ 작업 (긴 빌드/테스트/대량 마이그레이션) 진짜 동시 실행
2. **cross-provider 적대 검수** — Codex 가 7결함 잡은 건 실증된 가치. Council 모드
3. **격리** — worktree = 폭주 에이전트의 blast radius 차단 + 백그라운드 장기 잡

### 제안: v0.15 = "독트린 역전" (Identity Reset)
- **ROLE 재작성**: "메인 = 기본 실행자 (Fable 5). 팀 = 3가지 시나리오 전용 도구"
  (병렬 워커 / Council 검수 / 백그라운드 잡). 5줄 금지 룰 폐기
- **agents/ 정리**: 멤버 spawn 시 `--append-system-prompt "$(cat .claude/agents/<id>.md)"`
  로 정의를 실제 주입하거나, 18개 → 핵심 6개로 통폐합 (서사와 실제 일치시키기)
- **Wizard**: mock AGENT_POOL 폐기 → HarnessScanner 실데이터 (이미 IPC 있음)
- **프리셋**: flutter-nest = harness-template 자체를 가리키게 + empty/nextjs-only 는
  실파일 채우거나 제거. extraResources 등록
- **Onboarding**: 5-step → 3-step (welcome / deps / 워크스페이스). 샘플런은 실존 agent 로
- **StatusBar**: fake 수치 제거 — 실값 없으면 표시 안 함
- **하네스 버전**: 독립 버저닝 또는 "앱과 동일" 명시 표기

---

## 3. 작업 순서 (합의 후 착수)

| 순서 | 항목 | 크기 |
|---|---|---|
| 1 | 독트린 역전 — CLAUDE.md/orchestration ROLE 재작성 | 중 |
| 2 | agents 정의 실주입 (`--append-system-prompt`) 또는 통폐합 | 중 |
| 3 | Wizard 실데이터 전환 + 샘플런 fix | 중 |
| 4 | 프리셋 정리 (채우기 or 제거) + 패키징 | 소 |
| 5 | Onboarding 재설계 | 중 |
| 6 | StatusBar/버전 표기 정리 | 소 |
