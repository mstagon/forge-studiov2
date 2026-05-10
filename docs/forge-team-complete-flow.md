# Forge Team Complete Flow Design and Implementation Guide

This guide specifies the full design for Forge Team orchestration: isolated multi-member Claude/Codex work via git worktrees, tmux sessions, autonomous task prompts, inbox negotiation, hook enforcement, and conflict pre-prevention. It is grounded in the current implementation in `resources/harness-template/CLAUDE.md`, `electron/services/TeamOperations.ts`, `resources/harness-template/.claude/scripts/forge-boundary-guard.sh`, `bin/forge-team.ts`, and `docs/roadmap-v0.6.6-v0.8.md`.

The current system already provisions teams, writes `.claude/teams/<teamId>/config.json`, creates isolated worktrees when git is available, starts tmux sessions, launches Claude or Codex based on model routing, writes member inbox files, and can merge member branches. The missing pieces are mostly orchestration automation: plan-time overlap conversion, true Council round-robin hooks, Stop-driven next-step dispatch, and complete CLI preservation of rich member metadata.

## 1. Scenario A - Complete Flow for a Small Feature

Example request: "Add OAuth login."

### Classification

Treat this as Scenario A when the repository is already bootstrapped and the requested feature has a bounded surface area. The main session should not implement the feature directly. It should build a small team, set expected file ownership, run the members in the correct dependency order, merge only after verification, and escalate only when the plan or merge cannot be resolved automatically.

Small feature signals:

- `client/`, `server/`, and `prisma/` already exist.
- The request changes a known workflow rather than bootstrapping a full app.
- The dependency chain is short enough to fit into one implementation phase plus one review phase.
- Expected ownership can be declared with concrete files or narrow globs.

### Phase 0 - Clarify External Dependencies

OAuth is an external dependency. Before spawning members, the orchestrator must decide provider and configuration shape.

Required decisions:

- Provider: Google, GitHub, Kakao, Apple, or multiple providers.
- Auth flow: authorization code with PKCE for mobile, server-side callback for web/CMS, or both.
- Environment variables: client ID, client secret, redirect URI, issuer URL, allowed callback URL.
- Token model: short-lived access token plus refresh token, session cookie, or existing JWT pattern.
- Storage: where provider account IDs and refresh tokens are stored.

If the user says "choose defaults", use:

- Google OAuth.
- Authorization code with PKCE for Flutter.
- Server validates provider token and issues the existing app JWT.
- `OAuthAccount` table linked to `User`.
- Secrets in environment variables, never committed.

### Phase 1 - Planning and Ownership Declaration

The plan should explicitly map each member to files. This mapping is the primary pre-prevention mechanism and is later injected into member prompts by `TeamOperations.create()`.

Recommended member composition:

| Member | Role | Model | Assignment | Expected files |
|---|---|---|---|---|
| `test-writer` | Tests | Claude | Write failing auth tests before implementation | `server/test/auth/**/*.spec.ts`, `client/test/auth/**/*_test.dart`, `integration_test/auth/**/*_test.dart` |
| `prisma-data` | Database | GPT | Add OAuth account schema and migration plan | `prisma/schema.prisma`, `prisma/migrations/**` |
| `nestjs-backend` | Backend | Claude | Implement OAuth verification endpoint and JWT issuance | `server/src/auth/**`, `server/src/users/**`, `server/src/common/auth/**`, `server/package.json` |
| `flutter-ui` | Frontend | Claude | Add OAuth button and callback handling | `client/lib/features/auth/**`, `client/lib/core/network/**`, `client/pubspec.yaml` |

Important current-code caveat: `TeamCreateMember` supports `model`, `role`, and `expectedFiles`, and `TeamOperations.create()` stores and injects them. However, `bin/forge-team.ts` currently drops all fields except `agentId` and `task` when parsing `--members` JSON in `parseMembers()`. Until that is fixed, rich metadata is preserved through `forge-team execute --plan ...` because `cmdExecute()` reads `phase.members` from plan JSON directly, but `forge-team create --members '[...]'` will not preserve `model`, `role`, or `expectedFiles`.

Implementation fix for direct `create` usage:

```ts
// bin/forge-team.ts parseMembers JSON branch should preserve TeamCreateMember fields.
return arr.map((m: TeamCreateMember) => ({
  agentId: String(m.agentId),
  task: m.task ? String(m.task) : undefined,
  model: m.model ? String(m.model) : undefined,
  role: m.role ? String(m.role) : undefined,
  expectedFiles: Array.isArray(m.expectedFiles) ? m.expectedFiles.map(String) : undefined,
}))
```

### Phase 2 - Sequential vs Parallel Decisions

Run test creation first, then database, then backend and UI when contract files are available.

Recommended order:

1. `test-writer` runs first and writes failing tests only.
2. `prisma-data` runs second if schema changes are required.
3. `nestjs-backend` and `flutter-ui` run in parallel only after the API contract is stable.
4. `code-reviewer`, `security-auditor`, and `spec-verifier` run after merge and verification.

Parallel is allowed when all of these are true:

- `expectedFiles` do not overlap after glob normalization.
- One member does not need another member's unmerged generated files.
- Shared contract files are either already committed or declared as read-only inputs.
- The worktree strategy is `isolated` and `worktreesCreated === members.length`.

Sequential conversion is mandatory when any of these are true:

- Two members declare the same file or overlapping globs, such as `server/src/auth/**` and `server/src/auth/auth.service.ts`.
- A member owns schema files that other members import generated types from.
- A member needs to modify `package.json`, `pubspec.yaml`, `tsconfig.json`, or shared route/config files also touched by another member.
- `worktreesCreated: 0` or fewer worktrees than members are created.

### Phase 3 - Create and Start the Team

Use a plan file or fix `parseMembers()` before direct JSON create. A safe plan phase for OAuth looks like:

```json
{
  "goal": "Add Google OAuth login",
  "workspaceId": "forge-studio",
  "phases": [
    {
      "phase": 1,
      "description": "OAuth failing tests",
      "parallel": false,
      "members": [
        {
          "agentId": "test-writer",
          "role": "Tests",
          "task": "Write failing OAuth login tests for backend token issuance and Flutter login flow",
          "expectedFiles": [
            "server/test/auth/**/*.spec.ts",
            "client/test/auth/**/*_test.dart",
            "integration_test/auth/**/*_test.dart"
          ],
          "model": "claude-opus-4-7"
        }
      ]
    },
    {
      "phase": 2,
      "description": "OAuth schema",
      "parallel": false,
      "dependsOn": [1],
      "members": [
        {
          "agentId": "prisma-data",
          "role": "Database",
          "task": "Add OAuthAccount model linked to User with provider account uniqueness and indexes",
          "expectedFiles": ["prisma/schema.prisma", "prisma/migrations/**"],
          "model": "gpt-5.5"
        }
      ]
    },
    {
      "phase": 3,
      "description": "OAuth backend and Flutter UI",
      "parallel": true,
      "dependsOn": [2],
      "members": [
        {
          "agentId": "nestjs-backend",
          "role": "Backend",
          "task": "Implement Google OAuth token verification endpoint and app JWT issuance",
          "expectedFiles": ["server/src/auth/**", "server/src/users/**", "server/package.json"],
          "model": "claude-opus-4-7"
        },
        {
          "agentId": "flutter-ui",
          "role": "Frontend",
          "task": "Add Google sign in entry point and callback handling using existing auth state patterns",
          "expectedFiles": ["client/lib/features/auth/**", "client/lib/core/network/**", "client/pubspec.yaml"],
          "model": "claude-opus-4-7"
        }
      ]
    }
  ]
}
```

Spawn each phase with:

```bash
forge-team execute --workspace . --plan docs/oauth-plan.json --phase 1
forge-team execute --workspace . --plan docs/oauth-plan.json --phase 1 --team-id <teamId> --merge
```

Current `cmdExecute()` only executes one phase at a time and requires `--team-id` for merge. Automatic phase progression is not implemented.

### Conflict Avoidance Checkpoints

Checkpoint before spawn:

- Normalize all `expectedFiles`.
- Detect overlaps and convert unsafe parallel groups to sequential groups.
- Reject plans where a member has no expected files for code-writing tasks.
- Warn if `expectedFiles` includes broad roots such as `server/src/**` while another member owns a child path.

Checkpoint after create:

- Compare `worktreesCreated` to the number of members. If it is lower, stop the line.
- Compare `tmuxSessionsStarted` to the number of members. If it is lower, mark the phase degraded and require manual terminal start.
- Read `.claude/teams/<teamId>/config.json` and confirm each member has `task`, `model`, `role`, and `expectedFiles`.

Checkpoint before merge:

- Run `detectMemberConflicts()` for same-file modifications across worktrees.
- Ensure each member has committed or at least has clean intentional changes according to the team's completion policy.
- If schema changed, run generation before backend/UI verification.

Checkpoint after merge:

- Run build, lint, unit tests, integration tests, and API contract checks.
- Run `security-auditor` for OAuth redirect URI validation, token handling, and secret exposure.

### Verification Gates and Merge Criteria

Merge criteria:

- `forge-team merge` returns `{ "ok": true }`.
- No conflict markers remain.
- Workspace is clean except Forge-owned `.claude/teams/**` paths.
- All OAuth tests written by `test-writer` pass.
- Security review has no high severity findings.
- Environment variable requirements are documented without exposing secret values.

Failure handling:

- Merge conflict: stop automatic merge, spawn Council conflict resolution or a `loop-operator` member with the conflict markers.
- Build failure: spawn `build-error-resolver` with the command output and narrow expected files.
- Security failure: spawn `security-auditor` plus owning implementer, but keep security policy decisions in Council.

## 2. Scenario B - Complete Flow for a Large App Bootstrap

Example request: "Build a 1:1 chat app" from an empty workspace.

### Phase 0 - Infrastructure and Product Contract

No member should write application code until infrastructure decisions are recorded. Empty workspace bootstraps are especially sensitive because generated project scaffolds will touch broad directories and create many shared config files.

Decisions:

| Area | Default | Blocks |
|---|---|---|
| DB | PostgreSQL local Docker | Prisma schema, NestJS config |
| Auth | Email and JWT | User schema, backend auth, Flutter auth flow |
| Realtime | Socket.IO | Backend gateway, Flutter socket client |
| Storage | None for MVP | File upload and media messages |
| Push | None for MVP | Notification worker and mobile setup |
| Deploy | None for MVP | CI/CD and production config |

Phase 0 output is a structured app contract:

```json
{
  "goal": "Build a 1:1 chat app",
  "infrastructure": {
    "db": "PostgreSQL local Docker",
    "auth": "Email and JWT",
    "realtime": "Socket.IO",
    "storage": "none",
    "push": "none",
    "deploy": "none"
  },
  "productScope": {
    "mvp": ["sign up", "login", "contact list", "1:1 room", "send message", "read receipt"],
    "excluded": ["group chat", "attachments", "push notifications", "message search"]
  }
}
```

### Phase 1 - Schema-First Foundation

Composition:

| Member | Role | Blocks |
|---|---|---|
| `test-writer` | Tests | Defines app behavior as failing tests |
| `prisma-data` | Database | Blocks backend modules and DTOs |
| `tech-architect` | Architecture Council or Claude | Blocks route/module boundaries |
| `spec-verifier` | GPT impact reviewer | Blocks phase 2 if schema misses required entities |

Schema-first ordering enforcement:

- `prisma-data` owns `prisma/schema.prisma` and `prisma/migrations/**`.
- Backend and frontend members are not spawned until schema is merged and generated.
- The handoff must include entity names, relation cardinality, unique constraints, and index strategy.
- DTO shape can be drafted, but implementation members cannot create divergent models.

Minimum schema handoff:

```json
{
  "entities": ["User", "ChatRoom", "ChatParticipant", "Message", "MessageRead"],
  "constraints": [
    "User.email unique",
    "ChatRoom direct rooms contain exactly two participants",
    "Message.roomId indexed by createdAt",
    "MessageRead unique by messageId and userId"
  ],
  "generated": ["Prisma Client regenerated"],
  "blockedUntil": ["schema merged", "tests committed"]
}
```

### Phase 2 - Backend Bootstrap

Composition:

| Member | Role | Expected files |
|---|---|---|
| `nestjs-backend` | Backend implementation | `server/src/**`, `server/package.json`, `server/tsconfig.json`, `server/nest-cli.json` |
| `security-auditor` | GPT security review | Read-only unless assigned `docs/security/**` |
| `test-writer` | Backend tests | `server/test/**`, `server/src/**/*.spec.ts` |

Dependency graph:

- Backend depends on Phase 1 schema.
- Security review depends on backend auth design, but can start as soon as the auth module compiles.
- Frontend API client depends on backend route contract, not the full backend implementation.

Backend handoff contract:

```json
{
  "apiContract": {
    "auth": ["POST /auth/register", "POST /auth/login", "GET /auth/me"],
    "chat": ["GET /rooms", "POST /rooms/direct", "GET /rooms/:id/messages", "POST /rooms/:id/messages"],
    "realtime": ["message.created", "message.read", "room.updated"]
  },
  "dtoFiles": ["server/src/auth/dto/**", "server/src/chat/dto/**"],
  "openQuestions": []
}
```

### Phase 3 - Frontend and API Client Lanes

Composition:

| Lane | Member | Expected files | Dependency |
|---|---|---|---|
| Mobile UI | `flutter-ui` | `client/lib/features/chat/presentation/**`, `client/lib/features/auth/presentation/**` | API contract |
| State | `riverpod-logic` | `client/lib/features/chat/application/**`, `client/lib/features/auth/application/**` | API client interface |
| API client | `dio-retrofit` | `client/lib/features/**/data/**`, `client/lib/core/network/**` | Backend DTO contract |
| CMS optional | `nextjs-cms` | `cms/app/**`, `cms/components/**`, `cms/lib/**` | Admin scope only |

Safe parallel lanes:

- UI presentation can run in parallel with API client if UI uses interfaces or fixtures.
- Riverpod state can run in parallel with UI only if state owns application providers and UI owns widgets/screens.
- CMS can run in parallel with mobile if it only consumes stable backend endpoints.

Unsafe parallel lanes:

- `dio-retrofit` and `riverpod-logic` both editing repository/provider files.
- `flutter-ui` and `riverpod-logic` both editing route definitions.
- Any member editing `pubspec.yaml` in parallel with another member.

### Phase 4 - Integration and Realtime

Composition:

| Member | Role | Expected files |
|---|---|---|
| `nestjs-backend` | Socket.IO gateway and read receipt integration | `server/src/chat/**`, `server/src/realtime/**` |
| `flutter-ui` | Realtime room/message UI integration | `client/lib/features/chat/**` |
| `test-writer` | E2E and integration tests | `server/test/**`, `integration_test/**` |
| `security-auditor` | Realtime auth and authorization review | read-only findings or `docs/security/**` |

Blocking dependencies:

- Realtime gateway depends on auth guard and room membership checks.
- Flutter realtime connection depends on auth token storage.
- Read receipts depend on `MessageRead` schema and message query ordering.

Phase 4 handoff must include:

- Event names.
- Payload schemas.
- Authorization rule per event.
- Reconnection behavior.
- Failure and retry semantics.

### Phase 5 - Review, Hardening, and Release Readiness

Composition:

| Member | Model | Assignment |
|---|---|---|
| `code-reviewer` | Claude | Review maintainability and architecture drift |
| `security-auditor` | GPT | OWASP, auth, authorization, token storage |
| `spec-verifier` | GPT | Trace MVP requirements to implementation and tests |
| `doc-updater` | Claude | Update README, API docs, environment docs |

Merge criteria:

- All Phase 1-4 merges succeeded.
- Build/test/lint verification passes.
- Review Council has either consensus or explicit escalations.
- No phase left broad unowned generated changes.

### Cross-Phase Handoff Contracts

Each phase must write a handoff message to the next phase's inbox or a phase artifact under `.claude/teams/<teamId>/handoffs/`.

Required fields:

```json
{
  "phase": 2,
  "from": "nestjs-backend",
  "to": ["dio-retrofit", "riverpod-logic", "flutter-ui"],
  "status": "ready",
  "contracts": {
    "api": ["server/src/chat/dto/create-message.dto.ts"],
    "events": ["message.created", "message.read"]
  },
  "changedFiles": ["server/src/chat/chat.controller.ts"],
  "blockedFiles": [],
  "risks": ["Socket reconnect not implemented yet"]
}
```

Members can start when:

- All dependencies are `status: "ready"`.
- Required contract files exist on the merged base branch.
- Their `expectedFiles` do not overlap active members.

Members must not start when:

- Dependency handoff is missing.
- Schema or API contract is still in a member worktree and not merged.
- The phase requires generated artifacts that have not been produced.

## 3. Council Auto-Debate Mechanism

### Current Gap

The current code has an inbox system and a prompt-based Council mode, but not a real round-robin orchestrator.

What exists:

- `TeamOperations.sendInboxMessage()` appends messages to `.claude/teams/<teamId>/inboxes/<member>.json`.
- `TeamOperations.create()` can write a Council instruction message to each inbox when `opts.council` is true.
- `DiscussionView` displays all member inbox messages chronologically.
- The roadmap marks automatic Council debate as not implemented.

Current gaps:

- `bin/forge-team.ts cmdCreate()` does not parse a `--council` flag.
- `cmdExecute()` does not pass `phase.council` into `ops.create()`.
- No Stop hook reads task completion and routes to the next member.
- No round state file exists.
- No deterministic consensus detector exists.
- The main session sees raw inbox messages, not a final synthesis artifact.

### Target Design

Council must be hook-driven and stateful:

- Round 1: each member independently proposes.
- Round 2: each member critiques the previous proposals.
- Round 3: each member emits consensus, dissent, or escalation.
- Stop hook fires when a member completes a response.
- The hook updates a Council state file, sends the next prompt to the next member's inbox, and optionally nudges that member's tmux pane.
- The main session receives only the final synthesis once consensus is detected or escalation is required.

Recommended state file:

`.claude/teams/<teamId>/council/state.json`

```json
{
  "teamId": "team-...",
  "topic": "Select chat app architecture",
  "round": 1,
  "status": "running",
  "members": ["planner-opus", "planner-gpt"],
  "cursor": 0,
  "messages": [
    {
      "round": 1,
      "member": "planner-opus",
      "kind": "proposal",
      "messageId": "2026-05-10T12:00:00.000Z-planner-opus",
      "complete": true
    }
  ],
  "consensus": null,
  "finalSynthesisPath": null,
  "updatedAt": "2026-05-10T12:00:00.000Z"
}
```

### Round Detection

Programmatic round completion should not depend on voluntary natural language alone. Use a structured Council block in every member response:

```text
FORGE_COUNCIL:
round: 1
kind: proposal
status: complete
decision: none
summary: Use Socket.IO for MVP realtime.
risks:
  - Mobile reconnect behavior needs tests.
```

Round rules:

- Round 1 is complete when every Council member has one `kind: proposal`, `status: complete` entry for the active topic.
- Round 2 is complete when every member has one `kind: critique`, `status: complete` entry referencing at least one Round 1 message.
- Round 3 is complete when every member has one `kind: consensus` or `kind: dissent`, `status: complete`.
- If any member emits `status: blocked`, route to the main session or spawn the owner member needed to unblock.
- If a member emits malformed output, the Stop handler sends a repair prompt to the same member and does not advance the cursor.

### Consensus Detection Algorithm

Use structured signals first, text patterns second.

Structured consensus fields:

```yaml
FORGE_COUNCIL:
round: 3
kind: consensus
status: complete
decision: accept
decision_id: oauth-google-pkce-jwt
confidence: 0.86
requires_user_decision: false
```

Consensus is accepted when:

- All Round 3 messages have `kind: consensus`.
- At least two members share the same `decision_id`, or all members share the same normalized `decision` string.
- No member sets `requires_user_decision: true`.
- No member includes blocker severity `critical` or `security-high`.
- Confidence median is at least `0.70`.

Escalation is required when:

- Any member emits `kind: dissent`.
- Multiple incompatible `decision_id` values remain.
- A decision changes public API, auth/security policy, schema migration strategy, or merge conflict resolution.
- The detector sees text patterns such as `cannot agree`, `needs user decision`, `breaking change`, `security exception`, or `data loss risk`.

Fallback text patterns:

- Consensus positive: `consensus`, `agreed`, `final recommendation`, `we should`, `decision: accept`.
- Escalation: `dissent`, `disagree`, `blocked`, `unsafe`, `requires human`, `cannot verify`.

Text pattern results should never override structured `requires_user_decision: true`.

### Stop Hook Code Flow Sketch

Add a new script such as `resources/harness-template/.claude/scripts/forge-council-stop.sh` and wire it into `settings.json` under `Stop`. This is a design sketch, not current code.

```bash
#!/usr/bin/env bash
set -euo pipefail

payload="$(cat 2>/dev/null || true)"

# Only member sessions participate. Main sessions do not have this env.
team_id="${FORGE_TEAM_ID:-}"
member="${FORGE_MEMBER_NAME:-}"
ws="${CLAUDE_PROJECT_DIR:-$(pwd)}"
[ -z "$team_id" ] && exit 0
[ -z "$member" ] && exit 0

team_dir="$ws/.claude/teams/$team_id"
config="$team_dir/config.json"
state="$team_dir/council/state.json"
lock="$team_dir/council/state.lock"
[ -f "$config" ] || exit 0
[ -f "$state" ] || exit 0

mkdir -p "$team_dir/council"

(
  flock -x 9

  # 1. Extract the latest assistant output or member completion marker.
  # Claude Code hook payload shape can vary, so implementation should support:
  # - payload transcript fields when available
  # - a member-written completion file fallback
  # - the newest unread inbox message from this member as last resort
  council_block="$(printf '%s' "$payload" | node "$ws/.claude/scripts/extract-council-block.js" || true)"

  if [ -z "$council_block" ]; then
    node "$ws/.claude/scripts/send-inbox.js" \
      --workspace "$ws" --team-id "$team_id" \
      --from forge-team --to "$member" \
      --summary "Council output repair requested" \
      --text "Your last response did not include a FORGE_COUNCIL block. Add the structured block for the current round only."
    exit 0
  fi

  # 2. Validate and append member round completion.
  node "$ws/.claude/scripts/council-update-state.js" \
    --state "$state" \
    --member "$member" \
    --block "$council_block"

  # 3. Decide next action.
  action_json="$(node "$ws/.claude/scripts/council-next-action.js" --state "$state" --config "$config")"
  action="$(printf '%s' "$action_json" | jq -r '.action')"

  case "$action" in
    notify_next)
      to="$(printf '%s' "$action_json" | jq -r '.to')"
      prompt="$(printf '%s' "$action_json" | jq -r '.prompt')"
      node "$ws/.claude/scripts/send-inbox.js" \
        --workspace "$ws" --team-id "$team_id" \
        --from forge-team --to "$to" \
        --summary "Council next round" \
        --text "$prompt"

      pane="$(jq -r --arg name "$to" '.members[] | select(.name == $name) | .tmuxPaneId // empty' "$config")"
      if [ -n "$pane" ]; then
        tmux send-keys -t "$pane" "Read your Forge Team inbox and continue the Council round." Enter || true
      fi
      ;;

    finalize)
      final_path="$(printf '%s' "$action_json" | jq -r '.finalSynthesisPath')"
      node "$ws/.claude/scripts/send-inbox.js" \
        --workspace "$ws" --team-id "$team_id" \
        --from forge-team --to main \
        --summary "Council final synthesis ready" \
        --text "Council completed. Final synthesis: $final_path"
      ;;

    escalate)
      reason="$(printf '%s' "$action_json" | jq -r '.reason')"
      node "$ws/.claude/scripts/send-inbox.js" \
        --workspace "$ws" --team-id "$team_id" \
        --from forge-team --to main \
        --summary "Council escalation required" \
        --text "$reason"
      ;;
  esac
) 9>"$lock"
```

### Main Session Receives Only Final Synthesis

The main session should not read every Council inbox message during normal operation. It should watch:

- `.claude/teams/<teamId>/council/final.md`
- `.claude/teams/<teamId>/council/state.json`
- inbox for recipient `main`

Final synthesis format:

```md
# Council Final Synthesis

Status: consensus
Decision ID: oauth-google-pkce-jwt
Confidence: 0.86

## Decision
Use Google OAuth with PKCE on Flutter and server-issued app JWT.

## Rationale
...

## Required Follow-Ups
...

## Dissent
None.
```

Only when `status` is `escalated` should the main session expose decision options to the user.

## 4. Hook Enforcement Mechanism Catalog

### PreToolUse Edit/Write - Boundary Guard

Current file: `resources/harness-template/.claude/scripts/forge-boundary-guard.sh`.

Trigger condition:

- Hook matcher is `Write|Edit` in `settings.json`.
- The script reads JSON from stdin and uses `.tool_input.file_path`.
- It only acts when `FORGE_TEAM_ID` and `FORGE_MEMBER_NAME` are set.

Reads:

- `CLAUDE_PROJECT_DIR` or `pwd`.
- `.claude/teams/<teamId>/config.json`.
- `.members[] | select(.name == $FORGE_MEMBER_NAME) | .expectedFiles`.

Writes:

- Nothing on success.
- Error text to stderr on block.

Failure behavior:

- Missing payload: pass.
- Missing member env: pass.
- Missing config: pass.
- Missing `file_path`: pass.
- Empty `expectedFiles`: pass.
- Outside boundary: `exit 2`.

Exact current matching logic:

- Allows the write if the absolute attempted path contains the literal `expectedFiles` pattern string.
- For patterns containing `**`, it strips from the first `**` onward and allows paths containing that prefix.
- It does not perform full glob matching, path normalization, or relative-path conversion.

Gaps:

- No enforcement for read access.
- No `MultiEdit` matcher if Claude Code emits a separate tool name.
- Literal patterns such as `*.ts` are not real globs.
- Absolute paths are compared to relative expected file strings by substring.
- If tmux env injection fails, the guard silently passes.
- If `jq` is unavailable, expected extraction fails and the script passes.

Recommended remediation:

- Move matching to a Node script using `minimatch`.
- Normalize attempted paths relative to the member worktree.
- Fail closed when `FORGE_TEAM_ID` exists but config cannot be read.
- Add a read-only access policy hook for sensitive cross-member files.

### Stop - Member Task Completion to Next Step Trigger

Current state:

- `settings.json` Stop hooks format changed files, run `learn.sh`, `cost-tracker.sh`, `evaluate-session.sh`, and show a notification.
- No Forge Team task-completion Stop handler is wired.

Target trigger condition:

- `FORGE_TEAM_ID` and `FORGE_MEMBER_NAME` exist.
- A member response contains `FORGE_TASK: status: complete`, `FORGE_COUNCIL`, or a member writes `.claude/teams/<teamId>/status/<member>.json`.

Reads:

- Team config.
- Member status file.
- Council state if `config.council` or `council/state.json` exists.
- Git status for the member worktree.

Writes:

- `.claude/teams/<teamId>/status/<member>.json`.
- `.claude/teams/<teamId>/events.jsonl`.
- Inbox messages to next member or main.
- Council state and final synthesis when applicable.

Failure behavior:

- Malformed completion marker: send repair request to same member inbox.
- Dirty uncommitted changes: mark `completeWithUncommittedChanges` and notify main.
- Merge conflict detected: mark `blocked` and trigger Council escalation.

Idempotency:

- Store event IDs by `member`, `round`, `kind`, and content hash.
- Ignore duplicate Stop events with the same hash.
- Use file locks for state updates.

### Notification - Cross-Member Round Progress Alerts

Current state:

- Notification hook only shows a macOS notification when the message contains error/fail/exception.

Target trigger condition:

- New Council round started.
- Member blocked.
- Conflict pre-detected.
- Main synthesis ready.

Reads:

- Hook payload message.
- Council state.
- Team config for member names.

Writes:

- OS notification for user-visible events.
- `.claude/teams/<teamId>/events.jsonl`.
- Optional inbox summary to `main`.

Failure behavior:

- OS notification failure should be ignored.
- State write failure should be logged to `events.jsonl` if possible.

Idempotency:

- Event IDs should be deterministic: `notification:<teamId>:<round>:<action>:<target>`.

### PreCompact - Context-Full Inbox Report

Current state:

- `settings.json` runs `pre-compact.sh`.
- No Forge Team-specific inbox snapshot is documented in current code.

Target trigger condition:

- PreCompact fires in a main or member session.
- If team env exists, snapshot only that team. Otherwise snapshot active workspace team summaries.

Reads:

- Team config.
- All inbox JSON files.
- Council state.
- Member status files.
- Last N lines of `events.jsonl`.

Writes:

- `.claude/teams/<teamId>/snapshots/precompact-<timestamp>.md`.
- `.claude/teams/<teamId>/snapshots/latest.md`.

Snapshot must include:

- Team goal.
- Member list with model, worktree, branch, task, expectedFiles.
- Unread inbox summaries.
- Council round and consensus status.
- Active blockers.
- Merge readiness.
- Next command to run.

Failure behavior:

- If JSON parse fails, include raw file path and parse error.
- Never block compaction unless the snapshot directory cannot be created and the session is in active Council mode.

Idempotency:

- Timestamped snapshots are append-only.
- `latest.md` is overwritten atomically.

### SessionStart - Member Boot and Self Task Config Load

Current state:

- `settings.json` SessionStart prints environment status, runs `mcp-health.sh`, and runs `auto-profile.sh`.
- `TeamOperations.create()` injects `FORGE_TEAM_ID`, `FORGE_MEMBER_NAME`, and `FORGE_TEAM_NAME` into the tmux session environment.
- `TeamOperations.create()` sends the member task prompt by `tmux send-keys` after launching Claude/Codex.

Target trigger condition:

- SessionStart fires inside a member tmux pane with Forge team env vars.

Reads:

- `.claude/teams/<teamId>/config.json`.
- Matching member entry by `name`.
- `.claude/teams/<teamId>/inboxes/<member>.json`.

Writes:

- `.claude/teams/<teamId>/status/<member>.json` with `bootedAt`, `model`, `worktreePath`, and `task`.
- Optional boot acknowledgement inbox message to main.

Exact config schema required for member boot:

```json
{
  "name": "oauth",
  "goal": "Add Google OAuth login",
  "workspacePath": "/abs/workspace",
  "worktreeStrategy": "isolated",
  "mergeStrategy": "squash",
  "baseBranch": "team/team-...-base",
  "members": [
    {
      "agentId": "nestjs-backend",
      "name": "nestjs-backend",
      "model": "claude-opus-4-7",
      "task": "Implement Google OAuth endpoint",
      "role": "Backend",
      "expectedFiles": ["server/src/auth/**"],
      "worktreePath": "/abs/workspace/.claude/teams/team-.../worktrees/nestjs-backend",
      "branch": "team/team-.../nestjs-backend",
      "tmuxPaneId": "%42",
      "state": "active"
    }
  ]
}
```

Failure behavior:

- Missing team env: treat as main session and do nothing.
- Missing member config: write error event and ask main for repair.
- Missing `expectedFiles`: warn loudly because boundary guard will not enforce.

Idempotency:

- Status file key is member name.
- Repeated SessionStart updates `lastBootedAt` but preserves task history.

## 5. Conflict Pre-Prevention Algorithm

### Plan-Time ExpectedFiles Overlap Detection

The algorithm must run before any member starts. It should process the proposed plan, normalize file patterns, detect collisions, and rewrite unsafe phases to sequential execution.

Overlap categories:

- Exact file overlap: `server/src/auth/auth.service.ts` vs same file.
- Parent/child overlap: `server/src/auth/**` vs `server/src/auth/auth.controller.ts`.
- Broad root overlap: `client/**` vs `client/lib/features/chat/**`.
- Shared manifest overlap: `package.json`, `pubspec.yaml`, `prisma/schema.prisma`.
- Generated dependency overlap: `prisma/schema.prisma` affects generated Prisma client used by backend.

Recommended normalized representation:

```ts
interface OwnershipPattern {
  member: TeamCreateMember
  raw: string
  normalized: string
  kind: 'file' | 'dirGlob' | 'glob' | 'manifest'
  root: string
}
```

### Automatic Sequential Conversion

If any pair of members in a phase overlaps:

- Set `phase.parallel = false`, or split into ordered sub-phases.
- Preserve safe parallel lanes in separate groups.
- Put schema and manifest owners first.
- Put implementation members second.
- Put tests after implementation only if tests edit generated snapshots or shared fixtures; otherwise tests can run first as TDD.

Example conversion:

```json
{
  "phase": 3,
  "parallel": true,
  "members": ["flutter-ui", "riverpod-logic", "dio-retrofit"]
}
```

If `flutter-ui` owns `client/lib/features/chat/**` and `riverpod-logic` owns `client/lib/features/chat/application/**`, convert to:

```json
[
  {
    "phase": 3,
    "parallel": true,
    "members": ["dio-retrofit"]
  },
  {
    "phase": 4,
    "parallel": false,
    "dependsOn": [3],
    "members": ["riverpod-logic", "flutter-ui"]
  }
]
```

### Read-Only Cross-Member File Access Policy

Allowed:

- Reading merged base branch files.
- Reading another member's expected files for interface discovery.
- Reading generated artifacts after the owner phase has merged.
- Reading handoff contracts and inbox messages.

Not allowed:

- Editing another member's expected files.
- Running formatters that rewrite broad directories owned by others.
- Updating manifests owned by another active member.
- Reading `.env*`, which is already denied in `settings.json`.

Enforcement:

- Boundary guard blocks writes.
- A future PreToolUse Read hook can warn when a member reads another active member's unmerged worktree path.
- Dependency notification should inform owners when their file changes affect another active member.

### Dependency Change Notification

When member A edits a file that member B imports or depends on, member B should be notified even if there is no file ownership conflict.

Detection inputs:

- `expectedFiles` ownership.
- Git diff from member A worktree.
- Static import graph from TypeScript/Dart where feasible.
- Known dependency rules:
  - `prisma/schema.prisma` affects `server/src/**`.
  - `server/src/**/dto/**` affects `client/lib/**/dto/**` and `dio-retrofit`.
  - `client/lib/core/network/**` affects all client data repositories.
  - `pubspec.yaml` affects all Flutter members.
  - `server/package.json` affects backend test and build members.

Notification output:

```json
{
  "from": "forge-team",
  "to": "flutter-ui",
  "summary": "Dependency changed by dio-retrofit",
  "text": "dio-retrofit changed client/lib/core/network/api_client.dart, which your UI imports. Re-read the file before continuing."
}
```

### Merge Conflict Auto-Detect at Stop Time

Current code includes `TeamOperations.detectMemberConflicts()`, which scans each member worktree with `git status --porcelain` and reports files touched by more than one member. This is a useful minimum but it only catches same-file edits among dirty worktrees.

Stop-time conflict detection should add:

- `git diff --name-only <baseBranch>...<memberBranch>` for committed member branches.
- Same-file changed detection across committed branches.
- Manifest conflict detection even when different lines changed.
- Generated file conflict detection.
- Dry-run merge: `git merge-tree` or temporary worktree merge simulation.

Council escalation trigger:

- Same file changed by multiple active members.
- Dry-run merge returns conflict.
- Conflict touches schema, auth, security policy, public API, migration, or generated lock files.
- Merge failed in `TeamOperations.merge()` and `collectConflicts()` returns files.

### Implementation Pseudocode for TeamOperations.ts

Add this near planning or execution, not inside low-level `create()` only. `create()` can still reject unsafe direct calls or annotate the config.

```ts
type NormalizedPatternKind = 'file' | 'dirGlob' | 'glob' | 'manifest'

interface NormalizedPattern {
  memberIndex: number
  memberName: string
  raw: string
  normalized: string
  root: string
  kind: NormalizedPatternKind
}

interface Overlap {
  a: NormalizedPattern
  b: NormalizedPattern
  reason: 'exact' | 'parent-child' | 'glob' | 'manifest' | 'generated-dependency'
}

const MANIFESTS = new Set([
  'package.json',
  'server/package.json',
  'cms/package.json',
  'client/pubspec.yaml',
  'pubspec.yaml',
  'prisma/schema.prisma',
])

function normalizeExpectedFile(pattern: string, memberIndex: number, memberName: string): NormalizedPattern {
  const noBackslash = pattern.replace(/\\/g, '/')
  const noLeading = noBackslash.replace(/^\.?\//, '')
  const normalized = noLeading.replace(/\/+/g, '/')
  const hasGlob = /[*?[\]{}]/.test(normalized)

  if (MANIFESTS.has(normalized)) {
    return { memberIndex, memberName, raw: pattern, normalized, root: normalized, kind: 'manifest' }
  }

  if (normalized.endsWith('/**')) {
    const root = normalized.slice(0, -3).replace(/\/$/, '')
    return { memberIndex, memberName, raw: pattern, normalized, root, kind: 'dirGlob' }
  }

  if (hasGlob) {
    const firstGlob = normalized.search(/[*?[\]{}]/)
    const slash = normalized.lastIndexOf('/', firstGlob)
    const root = slash >= 0 ? normalized.slice(0, slash) : ''
    return { memberIndex, memberName, raw: pattern, normalized, root, kind: 'glob' }
  }

  return { memberIndex, memberName, raw: pattern, normalized, root: normalized, kind: 'file' }
}

function isParent(parent: string, child: string): boolean {
  if (!parent) return true
  return child === parent || child.startsWith(parent.endsWith('/') ? parent : `${parent}/`)
}

function patternsOverlap(a: NormalizedPattern, b: NormalizedPattern): Overlap | null {
  if (a.memberIndex === b.memberIndex) return null

  if (a.normalized === b.normalized) return { a, b, reason: 'exact' }

  if (a.kind === 'manifest' && b.kind === 'manifest' && a.normalized === b.normalized) {
    return { a, b, reason: 'manifest' }
  }

  if (a.kind === 'dirGlob' && isParent(a.root, b.root)) {
    return { a, b, reason: 'parent-child' }
  }
  if (b.kind === 'dirGlob' && isParent(b.root, a.root)) {
    return { a, b, reason: 'parent-child' }
  }

  // Conservative glob handling. Use minimatch in production for exactness.
  if (a.kind === 'glob' && (isParent(a.root, b.root) || isParent(b.root, a.root))) {
    return { a, b, reason: 'glob' }
  }
  if (b.kind === 'glob' && (isParent(a.root, b.root) || isParent(b.root, a.root))) {
    return { a, b, reason: 'glob' }
  }

  if (a.normalized === 'prisma/schema.prisma' && b.normalized.startsWith('server/src/')) {
    return { a, b, reason: 'generated-dependency' }
  }
  if (b.normalized === 'prisma/schema.prisma' && a.normalized.startsWith('server/src/')) {
    return { a, b, reason: 'generated-dependency' }
  }

  return null
}

export function detectExpectedFilesOverlaps(members: TeamCreateMember[]): Overlap[] {
  const patterns: NormalizedPattern[] = []

  members.forEach((member, memberIndex) => {
    const memberName = member.agentId
    for (const raw of member.expectedFiles ?? []) {
      patterns.push(normalizeExpectedFile(raw, memberIndex, memberName))
    }
  })

  const overlaps: Overlap[] = []
  for (let i = 0; i < patterns.length; i++) {
    for (let j = i + 1; j < patterns.length; j++) {
      const overlap = patternsOverlap(patterns[i], patterns[j])
      if (overlap) overlaps.push(overlap)
    }
  }
  return overlaps
}

export function enforceSequentialWhenOverlapping(phase: PlanPhase): PlanPhase {
  const overlaps = detectExpectedFilesOverlaps(phase.members)
  if (overlaps.length === 0) return phase

  return {
    ...phase,
    parallel: false,
    // Persist why the conversion happened for GUI and logs.
    conflictPolicy: {
      convertedToSequential: true,
      overlaps: overlaps.map((o) => ({
        members: [o.a.memberName, o.b.memberName],
        patterns: [o.a.raw, o.b.raw],
        reason: o.reason,
      })),
    },
  }
}
```

Integration points:

- `forge-team plan` should run this before emitting the plan.
- `forge-team execute` should run it before `ops.create()`.
- GUI Sprint Manager should run it when loading or editing plan JSON.
- `TeamOperations.create()` should warn or reject when `worktreeStrategy === 'shared'` and overlaps exist.

## 6. Current System Weaknesses and Remediation Priorities

### Known Failures

1. `worktreesCreated: 0` or fewer than members.

Impact: highest. Members silently share the main workspace when worktree creation falls back, causing git races and boundary violations. Current `TeamOperations.create()` now emits stderr and has an empty-repo initial commit guard, but callers still need to stop the line when the count is wrong.

Fix:

- In `bin/forge-team.ts`, after `ops.create()`, compare `result.worktreesCreated` to `members.length` when `worktreeStrategy === 'isolated'`.
- Return non-zero or include `degraded: true` unless caller explicitly passed `--allow-shared-fallback`.
- In GUI create flow, show blocking warning.

2. Auto-start task not injected.

Impact: high. Members boot but do not receive task context, so they idle or act on generic context.

Current behavior:

- `TeamOperations.create()` defaults auto-start to true when `autoStartClaude !== false`.
- `bin/forge-team create` defaults auto-start to false unless `--auto-start` is passed.
- `bin/forge-team execute` defaults auto-start to true unless `--no-auto-start` is passed.

Fix:

- Align CLI behavior with harness guidance: default `create` to auto-start for Forge Team member workflows, or make the help text and orchestrator docs explicit.
- Persist an `autoStartAttempted` and `taskPromptInjectedAt` field per member.
- If launch command or `send-keys` fails, write an event instead of swallowing the error.

3. Rich member metadata is dropped by direct CLI JSON create.

Impact: high and silent. `expectedFiles`, `role`, and `model` are essential for boundary prompts and model routing, but `parseMembers()` currently maps only `agentId` and `task`.

Fix location: `bin/forge-team.ts parseMembers()`.

4. Council mode is prompt-only.

Impact: medium-high. Members must voluntarily follow rounds, so debate can stall or produce no final synthesis.

Fix locations:

- Add `--council` parsing in `bin/forge-team.ts cmdCreate()`.
- Pass `phase.council` through `cmdExecute()`.
- Add `forge-council-stop.sh` and helper scripts.
- Add `council/state.json` and final synthesis artifacts.

5. Boundary guard is incomplete.

Impact: medium-high in shared mode, medium in isolated mode.

Fix location: `resources/harness-template/.claude/scripts/forge-boundary-guard.sh` or replace with a Node script.

6. Plan-time conflict prevention is missing.

Impact: high for large apps. Conflicts are found after work has been done.

Fix locations:

- `electron/services/TeamOperations.ts` for reusable overlap utilities.
- `bin/forge-team.ts cmdPlan()` and `cmdExecute()`.
- `src/components/v2/SprintManager.tsx` for GUI feedback.

7. Merge target semantics are surprising.

Impact: medium. `TeamOperations.merge()` checks out the team base branch and merges member branches into it. It returns `mergedBranch: baseBranch`, not the user's original workspace branch. A later integration step is still needed to merge the team base back into the original branch.

Fix:

- Store `originalBaseBranch` separately from `teamBaseBranch`.
- Add `forge-team integrate --team-id <id>` or extend merge with `--into-original`.
- Document whether verification runs on team base or original branch.

8. Completion state is implicit.

Impact: medium. `forge-team list` returns member state, but member task completion is not reliably inferred from Claude/Codex Stop events.

Fix:

- Add status files.
- Add Stop hook completion markers.
- Add GUI badges based on explicit status.

### GPT-Perspective Structural Gaps

Additional gaps beyond reported issues:

- No durable phase artifact model. Handoffs are inbox messages, which are good for communication but weak as build contracts.
- No schema for plan validation. `PlanDocument` is a TypeScript interface, but CLI accepts arbitrary JSON without runtime validation.
- No lock around inbox writes. Concurrent writes can race because `sendInboxMessage()` reads, appends, and writes the whole JSON array.
- No branch freshness check before member spawn. If the original workspace branch changes after plan creation, worktrees may start from stale assumptions.
- No provider availability check. `ProviderRouter` maps model to `claude` or `codex`, but create does not preflight the selected CLI per member.
- No generated artifact ownership. Deny rules block direct migration edits, while `expectedFiles` examples include `prisma/migrations/**`; the policy should distinguish generated-by-command from hand-edited.
- No dependency graph enforcement in `cmdExecute()`. `dependsOn` exists in the plan interface but is not enforced beyond manual phase selection.

### Impact Ranking

| Rank | Gap | Silent failure risk | Blast radius |
|---|---|---:|---:|
| 1 | Direct CLI drops `expectedFiles` and `model` | Very high | High |
| 2 | `worktreesCreated` degraded fallback allowed | High | High |
| 3 | No plan-time overlap conversion | High | High |
| 4 | Auto-start/task prompt failure swallowed | High | Medium |
| 5 | No explicit completion status | Medium | Medium |
| 6 | Council prompt-only | Medium | Medium |
| 7 | Boundary guard permissive on missing env/config | Medium | Medium |
| 8 | Inbox write races | Low-medium | Low-medium |

### Concrete Fix Recommendations

`bin/forge-team.ts`:

- Preserve all `TeamCreateMember` fields in `parseMembers()`.
- Add `--council` support to `cmdCreate()`.
- Pass `phase.council` to `ops.create()` in `cmdExecute()`.
- Validate `dependsOn` before phase execution.
- Fail or mark degraded when isolated worktree count is lower than member count.

`electron/services/TeamOperations.ts`:

- Add `detectExpectedFilesOverlaps()` and reuse it from CLI and GUI.
- Add optional `rejectOverlappingExpectedFiles` create option.
- Add provider CLI preflight per member.
- Add atomic inbox append with lock file or write-through JSONL.
- Add status and event write helpers.
- Expose `originalBaseBranch` and team integration semantics.

`resources/harness-template/.claude/scripts/forge-boundary-guard.sh`:

- Replace substring matching with normalized glob matching.
- Fail closed when member env exists but config cannot be read.
- Add `MultiEdit` matcher in settings if supported.
- Emit structured JSON error for GUI parsing.

`resources/harness-template/.claude/settings.json`:

- Add Stop hook for Forge member completion and Council round routing.
- Add SessionStart hook for member self-config load.
- Add PreCompact hook extension for team snapshots.
- Add Notification hook extension for team events.

`src/components/v2/SprintManager.tsx`:

- Show expected file overlaps before spawn.
- Show converted sequential lanes.
- Block spawn when member metadata is missing.
- Display worktree degradation warnings.

`src/components/v2/DiscussionView.tsx`:

- Group messages by Council round.
- Highlight final synthesis and escalation state.
- Avoid marking Council messages read just because the global timeline renders.

### GPT vs Claude Model Assignment Guide

Use GPT/Codex when precision, exhaustive impact tracing, or adversarial review matters:

- `prisma-data`: schema normalization, uniqueness, FK cascade, index analysis.
- `security-auditor`: OWASP, auth bypass, token storage, redirect URI risk.
- `spec-verifier`: requirement traceability and missing edge cases.
- `refactor-cleaner`: blast radius and mechanical consistency.
- `migration-reviewer`: data loss, rollback, transactional migration risk.
- `dependency-analyzer`: import graph and affected member notification.

Use Claude when creative synthesis, broad context, or product/architecture trade-offs matter:

- `planner`: phase breakdown and user intent translation.
- `tech-architect`: high-level architecture, unless in Council mode.
- `flutter-ui`: UX, navigation, visual hierarchy.
- `nestjs-backend`: implementation flow and module composition.
- `test-writer`: scenario design and user-flow tests.
- `doc-updater`: readable docs and handoff material.
- `loop-operator`: iterative build/test repair.

Use Council when the decision is high impact:

- Claude proposes architecture and implementation shape.
- GPT critiques precision, security, data consistency, and blast radius.
- Final synthesis is accepted only through structured consensus.

### Decision Escalation Matrix

| Decision | Automatic | Council | User |
|---|---:|---:|---:|
| Add narrow UI screen inside owned files | Yes | No | No |
| Add backend endpoint matching existing pattern | Yes | Optional | No |
| Change database schema | No | Yes | Only if data loss or product ambiguity |
| Change auth/session policy | No | Yes | Yes for security trade-off |
| Select realtime protocol for new app | No | Yes | If infrastructure cost/ops trade-off |
| Merge conflict in implementation file | No | Optional | If Council cannot agree |
| Merge conflict in schema/migration/auth | No | Yes | Yes |
| Add external paid service | No | No | Yes |
| Break public API or DTO contract | No | Yes | Yes |
| Lower test/security standards | No | No | Yes, explicit exception only |

Escalation payload should include:

```json
{
  "decision": "Change JWT refresh token policy",
  "whyCouncil": "Security and breaking behavior",
  "options": [
    { "id": "rotating-refresh", "risk": "more complexity", "benefit": "better replay resistance" },
    { "id": "static-refresh", "risk": "replay window", "benefit": "simpler MVP" }
  ],
  "recommendation": "rotating-refresh",
  "requiresUser": true
}
```

## Implementation Sequence

Recommended order for remediation:

1. Fix CLI metadata preservation in `bin/forge-team.ts`.
2. Add plan-time overlap detection and sequential conversion.
3. Fail closed on degraded isolated worktree creation.
4. Add explicit member status files and Stop completion hook.
5. Wire Council state machine and final synthesis.
6. Harden boundary guard matching.
7. Add dependency change notifications.
8. Add GUI display for overlaps, status, Council rounds, and escalations.

This order removes the highest silent-failure risks before adding more automation. The system should not auto-progress phases or auto-merge Council outcomes until ownership metadata, worktree isolation, and completion state are reliable.
