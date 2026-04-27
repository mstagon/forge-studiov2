# Forge Studio — Claude Code Harness Template

Forge Studio가 새 워크스페이스를 만들 때 `.claude/` 디렉터리로 **그대로 복사되는** Claude Code 하네스 템플릿입니다.
Flutter 앱 + NestJS 백엔드 + Prisma ORM + Next.js CMS 풀스택을 **한 번에 찍어내기 위한** 에이전트/스킬/룰/훅 세트가 들어 있습니다.

> 이 템플릿은 `resources/harness-template/` 에 원본이 존재하며,
> Forge Studio의 **Create Workspace** 또는 **Update Harness** 액션이 실행될 때
> 워크스페이스 루트의 `.claude/` 로 복사됩니다.

---

## 1. 이 하네스가 뭔가

- **사용 대상**: Flutter(앱) + NestJS(API) + Prisma(DB) + Next.js(CMS)로 구성된 모노레포
- **역할**: Claude Code가 이 워크스페이스에서 동작할 때 따라야 할 **규칙(rules) / 에이전트(agents) / 스킬(skills) / 커맨드(commands) / 훅(hooks)** 의 합본
- **철학**: 메인 세션은 **매니저(delegation hub)** — 코드를 직접 쓰지 않고, 요청을 적절한 서브 에이전트로 라우팅한다
- **배포**: Forge Studio UI에서 **Update Harness** 버튼을 누르면 이 디렉터리의 최신 버전이 워크스페이스에 덮어써진다 (기존 사용자 커스터마이즈는 `docs/` 하위 파일 등으로 보존)

---

## 2. 디렉터리 구조

```
resources/harness-template/
├── CLAUDE.md               # 최상위 프로젝트 룰 (매니저 롤, 에이전트 라우팅 표)
├── README.md               # ← 이 파일
├── .env.example            # mcp.json이 참조하는 env 변수 샘플
└── .claude/
    ├── mcp.json            # MCP 서버 목록 (context7, supabase, playwright 등)
    ├── settings.json       # 훅 wiring, 퍼미션, 모델 설정
    ├── agents/             # 서브 에이전트 정의 (.md)
    ├── skills/             # 파일 패턴 매칭 스킬 (<name>/SKILL.md)
    ├── commands/           # 슬래시 커맨드 (/verify, /review, /checkpoint 등)
    ├── rules/common/       # 전 스택 공통 룰 (architecture, security, testing 등)
    ├── contexts/           # 기술 스택/디렉터리 레이아웃 같은 참조 컨텍스트
    └── scripts/            # 훅 스크립트 (.sh)
```

| 디렉터리 | 역할 | 주요 파일 |
|---------|------|---------|
| `agents/` | 한 가지 책임을 가진 서브 에이전트 (예: `flutter-ui`, `nestjs-backend`). 메인 세션이 `Agent` 도구로 파견한다. | `flutter-ui.md`, `code-reviewer.md`, `doc-updater.md` |
| `skills/` | 파일 패턴에 매칭되어 자동으로 주입되는 **행동 지침**. `SKILL.md` 한 개당 한 스킬. | `freezed-models/`, `riverpod-patterns/`, `api-contract/` |
| `commands/` | 슬래시 커맨드. `/verify`, `/review`, `/checkpoint save` 처럼 워크플로우 트리거. | `verify.md`, `review.md`, `checkpoint.md` |
| `rules/common/` | MANDATORY 룰. CLAUDE.md에서 `@` 로 자동 로드되어 모든 세션에 적용. | `security.md`, `git-workflow.md`, `testing.md` |
| `scripts/` | PreToolUse / SessionStart / Stop 훅 스크립트. `settings.json`에서 wiring. | `skill-injector.sh`, `gateguard.sh`, `learn.sh` |
| `contexts/` | 자주 참조되는 레퍼런스. 룰보다 부드러운 정보성 컨텍스트. | `tech-stack.md` |
| `mcp.json` | 이 워크스페이스에서 붙일 MCP 서버 목록 + env 변수 이름. | — |
| `settings.json` | Claude Code에게 훅/퍼미션/모델 정책을 알려주는 설정 파일. | — |

---

## 3. 새 Agent 추가하는 법

### 3-1. 에이전트 파일 생성

경로: `.claude/agents/<name>.md`

```markdown
---
name: api-docs-generator
description: OpenAPI spec에서 프런트엔드 클라이언트 코드를 생성한다
tools: Read, Write, Edit, Bash
model: claude-sonnet-4-5
---

당신은 OpenAPI → TypeScript 클라이언트 생성 전문 에이전트다.

## 책임
- `server/openapi.yaml` 을 읽고
- `client/data/remote/generated/` 에 타입 세이프 클라이언트를 쓴다

## 규칙
- 생성된 파일은 반드시 `// GENERATED — DO NOT EDIT` 헤더 포함
- ...
```

frontmatter 필드:

| 필드 | 필수 | 설명 |
|------|:----:|------|
| `name` | O | kebab-case. 파일명과 일치 |
| `description` | O | 메인 세션이 이 에이전트를 언제 불러야 할지 판단하는 기준 |
| `tools` | X | 사용 허용 도구 (`Read`, `Write`, `Edit`, `Bash`, `Grep`, `Glob` 등). 생략 시 전체 |
| `model` | X | 기본은 sonnet. 무거운 분석에는 `claude-opus-4-7` |

### 3-2. Agent Routing 표에 등록

`CLAUDE.md` 의 **Agent Routing** 표에 한 줄 추가:

```markdown
| OpenAPI → 클라이언트 코드 생성 | `api-docs-generator` | Cross |
```

### 3-3. 워크스페이스에 반영

Forge Studio에서 해당 워크스페이스의 **Update Harness** 클릭 → 새 Claude Code 세션을 열어서 `Agent Routing` 에 노출되는지 확인.

---

## 4. 새 Skill 작성하는 법

### 4-1. 스킬 파일 생성

경로: `.claude/skills/<name>/SKILL.md`

```markdown
---
name: graphql-codegen
description: server/src/schema.graphql 변경 시 자동 codegen 수행
files:
  - "server/src/schema.graphql"
  - "client/data/remote/graphql/**"
---

# GraphQL Codegen 스킬

## 적용 시점
- `server/src/schema.graphql` 편집 후
- `client/data/remote/graphql/**` 의 `.graphql` 쿼리 파일 편집 후

## 규칙
1. 스키마 변경 후 **반드시** `npm run codegen` 을 돌려 타입을 갱신
2. 생성된 `__generated__/` 디렉터리는 커밋 대상
3. 수동 편집 금지 (`// DO NOT EDIT` 헤더)

## 예시

\`\`\`bash
cd server && npm run codegen
cd ../client && dart run build_runner build --delete-conflicting-outputs
\`\`\`
```

frontmatter 필드:

| 필드 | 필수 | 설명 |
|------|:----:|------|
| `name` | O | kebab-case |
| `description` | O | 이 스킬이 무엇을 강제/안내하는지 한 줄 |
| `files` | O | 매칭할 glob 패턴 배열. 이 패턴에 걸리는 Read/Edit/Write가 일어나면 주입 |

### 4-2. skill-injector 규칙 추가

`.claude/scripts/skill-injector.sh` 는 파일 경로 → 스킬을 매핑한다.
기존 스킬들과 같은 방식으로 매칭 분기를 추가한다 (이미 `files:` frontmatter 기반으로 도는 경우는 생략 가능).

### 4-3. Skill Routing 표 갱신

`CLAUDE.md` 의 **Skill Routing** 표에 한 줄 추가:

```markdown
| `server/src/schema.graphql`, `client/data/remote/graphql/**` | `graphql-codegen` |
```

### 4-4. 실제 동작 예시 (`freezed-models` 스킬)

`client/domain/entity/user.dart` 를 편집하면:

1. `skill-injector.sh` 가 패턴 `client/domain/entity/**` 에 매칭
2. `.claude/skills/freezed-models/SKILL.md` 내용이 Claude 컨텍스트에 주입
3. Claude가 `@freezed` 어노테이션, `.freezed.dart` 파트, build_runner 실행 지침을 따라 코드 작성
4. 편집 후 자동으로 `dart run build_runner build --delete-conflicting-outputs` 트리거

---

## 5. Rules 수정하는 법

### 5-1. 룰 파일 편집

경로: `.claude/rules/common/<topic>.md` (예: `security.md`, `testing.md`, `git-workflow.md`)

```markdown
# Security Rules

## 인증/인가
- JWT Access Token: 15분 만료, 메모리/SecureStorage 저장
- ...
```

### 5-2. CLAUDE.md 에 로드 확인

`CLAUDE.md` 최하단 **항상 로드되는 룰** 섹션에 `@` 참조가 있는지 확인:

```markdown
@.claude/rules/common/architecture.md
@.claude/rules/common/coding-style.md
@.claude/rules/common/git-workflow.md
@.claude/rules/common/security.md
@.claude/rules/common/testing.md
@.claude/rules/common/orchestration.md
@.claude/rules/common/mcp.md
@.claude/rules/common/automation.md
```

없는 룰 파일을 새로 추가했다면 여기에 `@` 로 추가해야 모든 세션에 적용된다.
단순 참조용(강제 아님)이면 `contexts/` 하위에 두고 **Pointers** 표에만 등록.

### 5-3. 룰 위반 시 동작

룰 파일의 내용은 "MANDATORY" 로 표시된다. Claude가 위반을 감지하면 **작업을 거부**해야 한다.
PreToolUse 훅 (`gateguard.sh`, `skill-injector.sh`) 이 일부 룰 (예: 커밋 메시지 한글 강제, env 파일 차단) 을 자동 차단한다.

---

## 6. 로컬 테스트 (적용 확인)

1. `resources/harness-template/` 의 파일을 편집
2. Forge Studio에서 대상 워크스페이스 선택 → **Update Harness** 클릭
3. Forge Studio가 `<workspace>/.claude/` 를 최신 템플릿으로 덮어쓴다
4. 해당 워크스페이스에서 **새 Claude Code 세션을 열고** 다음을 확인:
   - 추가한 에이전트가 `Agent Routing` 에 잡히는가
   - 추가한 스킬이 관련 파일 편집 시 주입되는가 (스킬 이름이 메시지에 노출)
   - 추가한 룰이 `@` 로 로드돼서 Claude 응답에 반영되는가

| 확인 항목 | 기대 동작 |
|----------|----------|
| 에이전트 등록 | 메인 세션에서 해당 요청 패턴이 들어왔을 때 자동 파견 |
| 스킬 주입 | 매칭 파일 Read/Edit 시 `skill-injector.sh` 로그에 스킬명 출력 |
| 룰 로드 | `CLAUDE.md` 의 `@` 참조 기준으로 세션 시작 시 자동 주입 |
| 훅 동작 | `.claude/scripts/` 의 스크립트가 settings.json hooks 섹션을 통해 트리거 |

---

## 7. Hook 스크립트 추가하는 법

### 7-1. 스크립트 작성

경로: `.claude/scripts/<name>.sh`

```bash
#!/usr/bin/env bash
set -euo pipefail

# 입력: Claude Code가 stdin으로 JSON 전달 (tool_input, tool_name 등)
# 출력: exit 0 = 진행, exit 2 = 차단 + 메시지, 그 외 = 에러

INPUT=$(cat)
TOOL_NAME=$(echo "$INPUT" | jq -r '.tool_name // empty')
FILE_PATH=$(echo "$INPUT" | jq -r '.tool_input.file_path // empty')

if [[ "$TOOL_NAME" == "Write" && "$FILE_PATH" == *.env ]]; then
  echo ".env 파일 직접 생성 금지. .env.example을 편집하세요." >&2
  exit 2
fi

exit 0
```

권한 부여 필수:

```bash
chmod +x .claude/scripts/<name>.sh
```

### 7-2. settings.json hooks 섹션에 wiring

`.claude/settings.json` 의 `hooks` 섹션에 추가:

```json
{
  "hooks": {
    "PreToolUse": [
      {
        "matcher": "Write|Edit",
        "hooks": [
          { "type": "command", "command": ".claude/scripts/gateguard.sh" },
          { "type": "command", "command": ".claude/scripts/skill-injector.sh" },
          { "type": "command", "command": ".claude/scripts/<name>.sh" }
        ]
      }
    ],
    "SessionStart": [
      { "hooks": [ { "type": "command", "command": ".claude/scripts/auto-profile.sh" } ] }
    ],
    "Stop": [
      { "hooks": [ { "type": "command", "command": ".claude/scripts/learn.sh" } ] }
    ]
  }
}
```

matcher 예시:

| matcher | 트리거 시점 |
|---------|------------|
| `Write\|Edit` | 파일 쓰기/편집 직전 |
| `Bash` | 쉘 명령 실행 직전 (위험 명령 차단에 유용) |
| `*` | 모든 도구 호출 |

### 7-3. 자동 wiring 대상 (참고)

기존 훅들은 이미 wiring 되어 있으니 참고:

| 스크립트 | 훅 | 역할 |
|---------|-----|------|
| `gateguard.sh` | PreToolUse Write/Edit | 첫 편집 시 조사 강제 (30분 TTL) |
| `skill-injector.sh` | PreToolUse Write/Edit | 파일 패턴 → 스킬 주입 |
| `tmux-dev.sh` | PreToolUse Bash | dev 서버 → tmux 세션 자동 전환 |
| `auto-profile.sh` | SessionStart | 브랜치 기반 훅 프로파일 자동 감지 |
| `learn.sh` | Stop | 교훈 반복 패턴 탐지 (3회+ → 승격) |
| `cost-tracker.sh` | Stop | 세션 메트릭스 JSONL 기록 |
| `mcp-health.sh` | SessionStart | MCP 서버 헬스체크 |
| `pre-compact.sh` | PreCompact | 컴팩션 전 상태 보존 |
| `evaluate-session.sh` | Stop | 세션에서 패턴 추출 + 신뢰도 평가 |

---

## 관련 파일

- `CLAUDE.md` — 매니저 롤, 에이전트/스킬 라우팅 표
- `.claude/rules/common/orchestration.md` — 에이전트 파견/체이닝 규칙
- `.claude/rules/common/automation.md` — 훅 프로파일, continuous learning, verification loop
- `.claude/rules/common/mcp.md` — MCP 서버 활용 규칙
- `.env.example` — mcp.json이 참조하는 env 변수 샘플
