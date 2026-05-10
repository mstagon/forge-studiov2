#!/usr/bin/env bash
# forge-boundary-guard.sh — Forge Team 멤버의 자기 영역 외 파일 수정 차단.
#
# 멤버 worktree 의 .claude/teams/<id>/config.json 의 자기 expectedFiles 외의
# 파일을 Edit/Write 시도하면 차단. shared mode 또는 의도치 않은 침범 방지.
#
# Hook 입력 (PreToolUse Write/Edit): JSON via stdin
#   { "tool_input": { "file_path": "/abs/path/to/file" }, ... }
#
# 동작:
#   - FORGE_TEAM_ID + FORGE_MEMBER_NAME env 가 set 이어야 동작 (forge-team
#     spawn 시 tmux env 로 set 필요 — 지금은 멤버 세션 자체 식별 X 라
#     conservative: env 없으면 pass through. v0.10+ 에서 멤버 식별 강화).
#   - 자기 expectedFiles 안이면 OK
#   - 외부 영역 시도 → exit 2 + 명시 에러 stderr (Claude Code 가 사용자에게 표시)
#
# 메인 세션 (멤버 아님) 에선 FORGE_MEMBER_NAME 미설정 → 통과.

set -e

# Read stdin JSON
PAYLOAD=$(cat 2>/dev/null || true)
[ -z "$PAYLOAD" ] && exit 0

# Member 식별 — env 없으면 메인 세션이거나 식별 안 됨, 통과
if [ -z "$FORGE_MEMBER_NAME" ] || [ -z "$FORGE_TEAM_ID" ]; then
  exit 0
fi

# 워크스페이스 root 추론
WS_ROOT="${CLAUDE_PROJECT_DIR:-$(pwd)}"
CONFIG_PATH="$WS_ROOT/.claude/teams/$FORGE_TEAM_ID/config.json"
[ ! -f "$CONFIG_PATH" ] && exit 0  # config 없으면 통과

# 시도하는 파일 path
FILE_PATH=$(echo "$PAYLOAD" | jq -r '.tool_input.file_path // empty' 2>/dev/null)
[ -z "$FILE_PATH" ] && exit 0

# 자기 expectedFiles 추출 (config.json 의 members 배열에서 자기 멤버)
EXPECTED=$(jq -r --arg name "$FORGE_MEMBER_NAME" \
  '.members[] | select(.name == $name) | .expectedFiles // [] | .[]' \
  "$CONFIG_PATH" 2>/dev/null)

# expectedFiles 비어있으면 boundary 없음 → 통과
[ -z "$EXPECTED" ] && exit 0

# Glob match 시도. expectedFiles 의 각 패턴이 path 의 일부와 매칭되면 OK
ALLOWED=0
while IFS= read -r pattern; do
  [ -z "$pattern" ] && continue
  # ** 같은 glob 은 bash 의 extglob 으로 처리. 단순 prefix match 도 포함.
  case "$FILE_PATH" in
    *"$pattern"*) ALLOWED=1; break ;;
  esac
  # path 가 자기 worktree 안이면 OK (worktree path 도 expectedFiles 의 일부로 간주)
  case "$pattern" in
    *"**"*)
      prefix="${pattern%%\*\**}"
      case "$FILE_PATH" in
        *"$prefix"*) ALLOWED=1; break ;;
      esac
      ;;
  esac
done <<< "$EXPECTED"

if [ "$ALLOWED" = "0" ]; then
  echo "🚫 BLOCKED [forge-boundary-guard]: 자기 영역 외 파일 수정 시도" >&2
  echo "  멤버: $FORGE_MEMBER_NAME (팀: $FORGE_TEAM_ID)" >&2
  echo "  시도 파일: $FILE_PATH" >&2
  echo "  자기 영역 (expectedFiles):" >&2
  echo "$EXPECTED" | sed 's/^/    - /' >&2
  echo "" >&2
  echo "다른 멤버 영역 수정 필요하면:" >&2
  echo "  forge-team-cli send-message --team-id $FORGE_TEAM_ID \\" >&2
  echo "    --from $FORGE_MEMBER_NAME --to <상대 멤버> --text \"<요청 내용>\"" >&2
  exit 2
fi

exit 0
