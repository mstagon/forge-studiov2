#!/usr/bin/env bash
# forge-mcp-profile.sh — 워크스페이스 stack 감지 → MCP per-workspace 자동 활성
# SessionStart 훅에서 호출.
#
# .claude/mcp.json 의 _optional_recipes 중 stack 에 맞는 것을 mcpServers 로
# 승격하고, stack 이 사라지면 자동 추가했던 것만 되돌린다. 사용자가 수동으로
# 추가한 서버는 절대 건드리지 않음 (.claude/.mcp-auto.json 에 자동 추가분만
# 기록해서 구분).
#
# 감지 규칙:
#   pubspec.yaml (root 또는 client/)            → dart
#   playwright.config.* (root 또는 cms/)        → playwright
#
# 주의: MCP 는 세션 시작 시 로드되므로 변경은 **다음 세션부터** 적용된다.

WS="${CLAUDE_PROJECT_DIR:-$(cd "$(dirname "$0")/../.." && pwd)}"
MCP="$WS/.claude/mcp.json"
AUTO="$WS/.claude/.mcp-auto.json"

command -v jq >/dev/null 2>&1 || exit 0
[ -f "$MCP" ] || exit 0

# 멤버 worktree 세션은 skip — 메인 워크스페이스의 mcp.json 만 관리
[ -n "${FORGE_TEAM_ID:-}" ] && exit 0

WANT=""
if [ -f "$WS/pubspec.yaml" ] || [ -f "$WS/client/pubspec.yaml" ]; then
  WANT="$WANT dart"
fi
if ls "$WS"/playwright.config.* "$WS"/cms/playwright.config.* >/dev/null 2>&1; then
  WANT="$WANT playwright"
fi

PREV=$(cat "$AUTO" 2>/dev/null)
echo "$PREV" | jq -e 'type == "array"' >/dev/null 2>&1 || PREV="[]"
NEW_AUTO="[]"
CHANGED=0

for S in dart playwright; do
  HAS=$(jq --arg s "$S" '.mcpServers[$s] != null' "$MCP" 2>/dev/null)
  HAS_RECIPE=$(jq --arg s "$S" '._optional_recipes[$s] != null' "$MCP" 2>/dev/null)
  WAS_AUTO=$(echo "$PREV" | jq --arg s "$S" 'any(. == $s)' 2>/dev/null)
  if echo " $WANT " | grep -q " $S "; then
    WANTED=1
  else
    WANTED=0
  fi

  if [ "$WANTED" = "1" ] && [ "$HAS" = "false" ] && [ "$HAS_RECIPE" = "true" ]; then
    TMP=$(mktemp)
    if jq --arg s "$S" '.mcpServers[$s] = ._optional_recipes[$s]' "$MCP" > "$TMP" 2>/dev/null; then
      mv "$TMP" "$MCP"
      NEW_AUTO=$(echo "$NEW_AUTO" | jq --arg s "$S" '. + [$s]')
      CHANGED=1
      echo "🔌 MCP 자동 활성: $S (stack 감지 — 다음 세션부터 적용)"
    else
      rm -f "$TMP"
    fi
  elif [ "$WANTED" = "1" ] && [ "$HAS" = "true" ]; then
    # 이미 켜져 있음 — 자동 추가분이었으면 마크 유지
    if [ "$WAS_AUTO" = "true" ]; then
      NEW_AUTO=$(echo "$NEW_AUTO" | jq --arg s "$S" '. + [$s]')
    fi
  elif [ "$WANTED" = "0" ] && [ "$WAS_AUTO" = "true" ] && [ "$HAS" = "true" ]; then
    # 자동으로 켰던 것만 되돌림 — 사용자 수동 추가분은 보존
    TMP=$(mktemp)
    if jq --arg s "$S" 'del(.mcpServers[$s])' "$MCP" > "$TMP" 2>/dev/null; then
      mv "$TMP" "$MCP"
      CHANGED=1
      echo "🔌 MCP 자동 해제: $S (stack 미감지)"
    else
      rm -f "$TMP"
    fi
  fi
done

echo "$NEW_AUTO" > "$AUTO" 2>/dev/null
exit 0
