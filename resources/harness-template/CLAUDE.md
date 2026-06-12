# ROLE: 메인 세션 = 기본 실행자. 팀 = 스케일 도구

메인 세션은 max-tier 모델이다. **대부분의 작업은 메인이 직접 한다** — 읽고,
구현하고, 테스트하고, 커밋한다. 팀은 "기본"이 아니라 아래 3가지에만 쓰는 도구다.
(v0.15 독트린 역전 — 구 "메인은 코더 아님" 룰은 폐기됨. 작은 작업까지 팀으로
쪼개면 부팅+계약+머지+재검수 조정비용이 이득을 잡아먹는다.)

## 병렬이 필요할 때 — 3단 선택 (v0.18.1 명문화)

1. **Workflow 도구 (in-process fan-out)** — **분 단위 짧은 병렬**: 리서치 fan-out,
   다관점 리뷰/검증 패널, 대량 파일 스캔. 조정비용 ~0 (부팅/머지/inbox 없음).
   Workflow 도구가 없는 환경이면 직접 순차로.
2. **forge-team** — 다음 3가지 **전용**:
   - **Cross-provider 적대 검수** (`--council`, claude+gpt 혼성) — Workflow 는
     같은 모델뿐이라 self-agreement 위험. 릴리즈 전 최종 검수는 반드시 이걸로.
   - **관전/개입이 필요한 작업** — 사용자가 GUI/tmux 로 지켜보며 중간 개입.
   - **세션 독립 장기 잡** — 30분+ 독립 작업 (병렬 워커 포함). 메인이 죽거나
     다른 일을 해도 격리 worktree 에서 계속 돈다.
3. 어디에도 해당 없으면 → **직접** (기본).

판정 1초 룰: **"쪼개면 조정비용보다 이득이 큰가?"** 아니면 직접 해라.

## 절대 금지 (PreToolUse 훅이 차단)

- ❌ `Agent` / `Task` 도구 호출 — 관전 불가능한 암묵 서브에이전트 금지.
  병렬은 Workflow (결정적 스크립트 + 진행 표시) 또는 forge-team (관전 가능) 만.
- ❌ 1인팀 생성 — CLI 가 거부한다. 단일 작업은 메인이 직접.

## 메인이 직접 하는 것 (= 기본 모드)

- 분석 / 구현 / 테스트 / 리팩토링 / 문서 / 커밋 — 전부. TDD (Red→Green→Refactor)
  와 검증 루프 (/verify → /review) 그대로 적용해서.
- `contracts/<domain>.contract.md` 작성 — 계약은 메인 소유, 멤버는 read-only.
- 팀을 띄웠을 때: 모니터링, inbox 협의 중재, `forge-team merge` (자동 archive), 결과 검수.

---

# 워크플로 (요청 받으면)

1. **병렬 판정** — 짧은 fan-out 은 Workflow, forge-team 3용도 해당 시 팀, 그 외 **직접** (기본).
2. **크로스-스택 피처**: `contracts/<domain>.contract.md` 먼저 작성 — 직접 작업이든
   팀이든 동일. 서버/클라 DTO 둘 다 계약을 따른다.
3. **큰 앱 부트스트랩**: Phase 0 인프라 결정 (사용자에게 선택지 질문 — 결정 없이
   구현 금지) → 스택별 30분+ 독립 작업이면 병렬 워커 팀, 아니면 직접 순차.
   큰 설계 결정은 Council 1회 (tech-architect + planner 혼성).
4. **TDD 필수**: 직접이든 팀이든 실패 테스트 먼저.

**팀을 띄우기로 했다면 plan 전 반드시 Read**: [`rules/common/orchestration.md`](.claude/rules/common/orchestration.md)
— 직접 vs 팀 판정표, file-level 멤버 분배, phases.json schema, Phase 0 인프라 결정표.

# 팀 위생 (위반 시 CLI 가 거부)

- **1인팀 금지** — 멤버 1명 `forge-team create` 는 CLI 가 거부한다. 작은 작업들은 한 팀에
  멀티 멤버로 묶어라. phase 마다 1인팀 연속 생성 금지. 정말 단일 멤버가 필요하면 `--solo` 명시.
- **merge = 정리** — `forge-team merge` 성공 시 부모 브랜치 통합 + worktree/tmux/브랜치
  자동 archive (config 는 history 로 보존). 별도 cleanup 불필요. 옵트아웃: `--no-archive`.
- **활성 팀 3개 이상이면 CLI 가 경고** — 새 팀 만들기 전에 끝난 팀부터 merge/archive.

---

# forge-team CLI (병렬 실행의 유일한 메커니즘)

```bash
# 호출: 레포 안 bin/forge-team | Forge.app 안 Contents/Resources/forge-cli/bin/forge-team | npm link 후 forge-team

forge-team create --workspace . --name "<팀명>" --goal "<한 줄>" \
  --members '[{"agentId":"test-writer","role":"Tests","task":"실패 테스트 먼저 작성","expectedFiles":["server/test/**"],"model":"claude-opus-4-8"},
              {"agentId":"nestjs-backend","role":"Backend","task":"API 구현","expectedFiles":["server/src/**"]}]' \
  --worktree-strategy isolated --merge-strategy squash --auto-start
# → {"teamId":...,"worktreesCreated":N,...}  — worktreesCreated:0 이면 즉시 중단 + 사용자 보고

forge-team list --workspace .                          # 팀 목록 (archivedAt 포함)
forge-team wait --workspace . --team-id <id>           # 모든 멤버 완료까지 폴링 (exit 0 = done)
forge-team merge --workspace . --team-id <id>          # 멤버 브랜치 통합 + 부모 머지 + 자동 archive
forge-team archive --workspace . --team-id <id>        # 수동 정리 (merge 안 한 리뷰팀 등)
forge-team remove --workspace . --team-id <id>         # 완전 삭제 (history 도 제거)
forge-team send-message / read-inbox / mark-inbox-read # 멤버 ↔ 메인 협의
forge-team complete-member --agent <name>              # 멤버 전용 완료 신호
forge-team complete --team-id <id>                     # 팀 강제 완료 (orchestrator 전용)
```

- `--members` 는 JSON 배열 권장 — `role` + `expectedFiles` 가 멤버 prompt 에 자동 주입되어
  영역 침범을 사전 차단한다. task 에 콤마 필요하면 JSON 형식 필수.
- `--council` — 멤버끼리 inbox round-robin 토론 후 구현 (큰 설계 결정에 사용).
- agentId 의 `.claude/agents/<id>.md` 정의는 spawn 시 **실제 주입**된다 (claude 는
  `--append-system-prompt`, codex 는 task brief 상단). 멤버는 같은 `.claude/` 룰/스킬을 본다.

---

# 커밋 규칙 (MANDATORY — 훅이 차단)

- 커밋 메시지 **한국어 필수** (subject 에 한글 1자 이상): `feat(auth): 소셜 로그인 추가`
- `Co-Authored-By` / "Generated with Claude" trailer **절대 금지**
- Conventional Commits: `type(scope): 한국어 제목`. `git add -A` / `-am` 한 방 커밋 금지 —
  파일/관심사별 분리 커밋

# 근거 기반 원칙

- 패키지 API → `context7` MCP 로 공식 문서 확인 후 사용 (환각 금지)
- 추측 코드 금지. 모호하면 구현 말고 질문. 실수는 `docs/lessons-learned.md` 기록

# 유저에게 묻는 것 (이것만 — 그 외 전부 자동 실행)

🚦 설계 GATE · 🔀 머지 충돌 · ❓ 모호한 요청 · 🔄 5회 실패 · 💀 위험 작업 · 📦 커밋/배포

---

# Lazy-load 룰 (토큰 다이어트)

이 파일은 포인터만 갖는다. 룰 전문은 아래 시점에 해당 파일을 **Read** 해서 적용한다.
구현 파일 편집 시에는 `skill-injector.sh` 훅이 매칭 스킬 + 룰 경로를 자동 주입한다 —
주입되면 반드시 Read 후 적용 (미적용 편집은 반려).

| 시점 | Read 할 문서 |
|------|-------------|
| 팀 plan / 멤버 구성 / phase 설계 | [`rules/common/orchestration.md`](.claude/rules/common/orchestration.md) |
| 아키텍처 결정 / 레이어 구조 | [`rules/common/architecture.md`](.claude/rules/common/architecture.md) |
| 코드 작성 (스킬 주입과 별개로 확인) | [`rules/common/coding-style.md`](.claude/rules/common/coding-style.md) |
| git push / subtree / 브랜치 전략 | [`rules/common/git-workflow.md`](.claude/rules/common/git-workflow.md) |
| 인증 / 입력 검증 / OWASP | [`rules/common/security.md`](.claude/rules/common/security.md) |
| 테스트 작성 / 커버리지 | [`rules/common/testing.md`](.claude/rules/common/testing.md) |
| MCP 서버 활용 | [`rules/common/mcp.md`](.claude/rules/common/mcp.md) |
| hook / 프로파일 / 학습 루프 | [`rules/common/automation.md`](.claude/rules/common/automation.md) |
| 스택 버전 / 빌드 명령 | [`contexts/tech-stack.md`](.claude/contexts/tech-stack.md) |
| 스킬 전문 | `.claude/skills/*/SKILL.md` |

# Hook 핵심 (상세: automation.md + settings.json)

- PreToolUse: Agent/Task 차단 · 위험 명령/시크릿/커밋 컨벤션 검증 · 스킬/룰 주입 ·
  gateguard 조사 강제 · bash 출력 압축 (compress-bash-output)
- SessionStart: 프로파일 자동 감지 (`auto-profile.sh` — prd/stg=strict, 메인 max-tier=ultracode,
  멤버=standard) · MCP per-workspace 자동 활성 (`forge-mcp-profile.sh`)
- Stop: dart format / eslint · DTO broadcast · symbol 충돌 경보 · 메인 폴링 (팀 신호 surface) ·
  학습 루프 (ultracode 프로파일에서는 학습/텔레메트리 우회)
- PreCompact: 하네스 상태 스냅샷 — **컴팩션 직후 `.claude/compact-state.md` 가 있으면 반드시 Read**

---

# Project: Fullstack Dev Harness

**Flutter 앱 + NestJS 백엔드 + Prisma ORM + Next.js CMS** 모노레포 하네스.

```
<project>/
├── client/   → Flutter (Clean Architecture: core/data/domain/presentation)
├── server/   → NestJS + Prisma
├── cms/      → Next.js (App Router)
└── docs/     → 모노레포 전용
```

원격은 git subtree 로 스택별 분리 (`origin-app` / `origin-server` / `origin-cms`) —
상세는 git-workflow.md.
