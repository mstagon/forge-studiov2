#!/usr/bin/env bash
# forge-symbol-guard.sh — symbol-level 충돌 조기 경보 (Wit 패턴 lite, P1-6 v1)
#
# 문제: file-level expectedFiles 분리로도 두 멤버가 같은 파일의 **같은 함수**
# 를 건드리면 머지 충돌 확정. file-level 경보는 다른 영역 수정 (hunk 안 겹침)
# 까지 false alarm 을 낸다.
#
# v1 메커니즘 (tree-sitter 없이): git diff 의 hunk header context
# (`@@ ... @@ <enclosing function signature>`) 를 symbol 로 삼는다.
#   1. 멤버 Stop event 마다 자기 worktree diff 의 (file :: function) 목록 추출
#   2. <team>/symbols/<member>.txt 로 영속
#   3. 다른 멤버의 목록과 교집합 → 겹치면 해당 멤버에게 inbox 경보
#   4. 같은 경보 반복 방지: .sent-<me> 캐시
#
# 한계 (v2 = tree-sitter): hunk context 는 git 의 휴리스틱이라 파일 상단
# 수정 등에서 빈 값일 수 있음 — 그 경우 file-level 로 degrade.

set -e

if [ -z "${FORGE_TEAM_ID:-}" ] || [ -z "${FORGE_MEMBER_NAME:-}" ]; then
  exit 0
fi
command -v forge-team >/dev/null 2>&1 || exit 0
command -v git >/dev/null 2>&1 || exit 0
command -v jq >/dev/null 2>&1 || exit 0

WS_ROOT="${CLAUDE_PROJECT_DIR:-$(pwd)}"
case "$WS_ROOT" in
  */.claude/teams/*/worktrees/*) MAIN_WS="${WS_ROOT%%/.claude/teams/*}" ;;
  *) MAIN_WS="$WS_ROOT" ;;
esac
TEAM_DIR="$MAIN_WS/.claude/teams/$FORGE_TEAM_ID"
CONFIG="$TEAM_DIR/config.json"
[ ! -f "$CONFIG" ] && exit 0

cd "$WS_ROOT" || exit 0

# (file :: enclosing-function) 추출 — hunk context 가 빈 줄이면 file 단위로 기록
SYMS=$(git diff -U0 HEAD 2>/dev/null | awk '
  /^\+\+\+ b\// { file = substr($0, 7) }
  /^@@/ {
    ctx = $0
    sub(/^@@[^@]*@@[ ]?/, "", ctx)
    gsub(/[ \t]+$/, "", ctx)
    if (file != "") {
      if (length(ctx) > 0) print file " :: " ctx
      else print file " :: (file-level)"
    }
  }' | sort -u)
[ -z "$SYMS" ] && exit 0

SYM_DIR="$TEAM_DIR/symbols"
mkdir -p "$SYM_DIR"
ME_FILE="$SYM_DIR/$FORGE_MEMBER_NAME.txt"
printf '%s\n' "$SYMS" > "$ME_FILE"

SENT_CACHE="$SYM_DIR/.sent-$FORGE_MEMBER_NAME"
touch "$SENT_CACHE"

OTHERS=$(jq -r --arg me "$FORGE_MEMBER_NAME" \
  '.members[] | select(.name != $me and .agentId != $me) | .name' "$CONFIG" 2>/dev/null) || true
[ -z "$OTHERS" ] && exit 0

for OTHER in $OTHERS; do
  OTHER_FILE="$SYM_DIR/$OTHER.txt"
  [ -f "$OTHER_FILE" ] || continue
  OVERLAP=$(comm -12 <(printf '%s\n' "$SYMS") <(sort -u "$OTHER_FILE") | grep -v ':: (file-level)$' || true)
  [ -z "$OVERLAP" ] && continue

  # 이미 보낸 경보 dedup (상대 + symbol 키)
  NEW_OVERLAP=""
  while IFS= read -r LINE; do
    KEY="$OTHER|$LINE"
    grep -qxF "$KEY" "$SENT_CACHE" 2>/dev/null && continue
    NEW_OVERLAP="$NEW_OVERLAP$LINE
"
    echo "$KEY" >> "$SENT_CACHE"
  done <<< "$OVERLAP"
  [ -z "$NEW_OVERLAP" ] && continue

  COUNT=$(printf '%s' "$NEW_OVERLAP" | grep -c . || echo 0)
  FIRST_3=$(printf '%s' "$NEW_OVERLAP" | head -3 | sed 's/^/  - /')
  TEXT="[symbol 충돌 경보]

당신과 $FORGE_MEMBER_NAME 가 같은 함수/영역을 동시에 수정 중 ($COUNT 곳):

$FIRST_3

머지 충돌 확정 코스 — 누가 그 영역을 소유할지 inbox 로 먼저 합의하세요."

  forge-team send-message \
    --workspace "$MAIN_WS" \
    --team-id "$FORGE_TEAM_ID" \
    --from "$FORGE_MEMBER_NAME" \
    --to "$OTHER" \
    --text "$TEXT" \
    --summary "symbol 충돌: $FORGE_MEMBER_NAME 와 $COUNT 곳 겹침" \
    >/dev/null 2>&1 || true

  # 자기 컨텍스트에도 경고 surface (stdout → 다음 turn 주입)
  echo "⚠️ [symbol-guard] $OTHER 와 같은 함수 $COUNT 곳 동시 수정 중 — inbox 로 영역 합의 권장:"
  echo "$FIRST_3"
done

exit 0
