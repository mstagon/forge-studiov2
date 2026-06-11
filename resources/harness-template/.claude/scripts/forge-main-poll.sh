#!/usr/bin/env bash
# forge-main-poll.sh — Stop hook 메인 세션에서 팀 완료 신호 자동 surface.
#
# 문제: 멤버 작업 끝내고 forge-team complete-member 호출해도 메인 세션
# (사용자 외부 터미널의 claude code) 은 그걸 모름. macOS 알림은 Forge Studio
# GUI 보는 사람만 봄. 사용자 보고: "팀원 작업 종료했다 이런거 메인 세션에
# 바로바로 안 옴".
#
# 해결: 메인 세션의 Stop event (claude 가 한 turn 끝낼 때마다 발사) 마다
# 워크스페이스의 모든 팀의 main.json inbox 를 폴링. 읽지 않은 team:done /
# 멤버 완료 메시지 보이면 stdout 으로 출력 → claude 다음 turn 의 hook 결과
# 컨텍스트에 자동 들어감 → 사용자에게 자연스럽게 보고.
#
# 멤버 세션 (FORGE_TEAM_ID set) 은 통과 — 이 hook 은 메인 전용.

set -e

# 멤버 세션이면 skip (FORGE_TEAM_ID 있음 = 멤버 worktree 의 claude)
if [ -n "${FORGE_TEAM_ID:-}" ]; then
  exit 0
fi

command -v jq >/dev/null 2>&1 || exit 0

WS_ROOT="${CLAUDE_PROJECT_DIR:-$(pwd)}"
TEAMS_DIR="$WS_ROOT/.claude/teams"
[ ! -d "$TEAMS_DIR" ] && exit 0

# rate limit — 같은 메시지를 같은 메인 turn 끝마다 반복 출력하면 시끄러우니
# 마지막 surface 시점 기록 (NDJSON line, msg.timestamp)
SEEN_FILE="$WS_ROOT/.claude/.forge-main-seen.json"
SEEN=$(cat "$SEEN_FILE" 2>/dev/null || echo "[]")

OUTPUT=""
NEW_SEEN="$SEEN"

for TEAM_PATH in "$TEAMS_DIR"/*/; do
  [ -d "$TEAM_PATH" ] || continue
  TEAM_ID=$(basename "$TEAM_PATH")

  # archive 된 팀은 history — 신호 surface 대상 아님 (v0.13.0)
  if [ -f "$TEAM_PATH/config.json" ]; then
    ARCHIVED=$(jq -r '.archivedAt // ""' "$TEAM_PATH/config.json" 2>/dev/null)
    [ -n "$ARCHIVED" ] && continue
  fi

  MAIN_INBOX="$TEAM_PATH/inboxes/main.json"
  [ ! -f "$MAIN_INBOX" ] && continue

  # team:done + 멤버 완료 메시지 추출 (unread + 이 hook 이 아직 surface 안 한 것)
  MESSAGES=$(jq -c '.[] | select(.read == false or .read == null)' "$MAIN_INBOX" 2>/dev/null || echo "")
  [ -z "$MESSAGES" ] && continue

  while IFS= read -r MSG; do
    [ -z "$MSG" ] && continue
    TS=$(echo "$MSG" | jq -r '.timestamp // ""')
    KIND=$(echo "$MSG" | jq -r '.kind // .summary // ""')
    TEXT=$(echo "$MSG" | jq -r '.text // ""')

    # 이미 surface 한 메시지 dedup (team_id + timestamp 키)
    SEEN_KEY="$TEAM_ID|$TS"
    ALREADY=$(echo "$NEW_SEEN" | jq --arg k "$SEEN_KEY" 'any(. == $k)' 2>/dev/null || echo "false")
    [ "$ALREADY" = "true" ] && continue

    # team 정보로 컨텍스트 만들기
    CONFIG="$TEAM_PATH/config.json"
    if [ -f "$CONFIG" ]; then
      TEAM_NAME=$(jq -r '.name // "(unnamed)"' "$CONFIG")
      TEAM_STATUS=$(jq -r '.status // "active"' "$CONFIG")
    else
      TEAM_NAME="$TEAM_ID"
      TEAM_STATUS="unknown"
    fi

    OUTPUT="$OUTPUT
📬 [팀 신호] $TEAM_NAME ($TEAM_ID, status=$TEAM_STATUS)
  kind: $KIND
  text: $TEXT"
    NEW_SEEN=$(echo "$NEW_SEEN" | jq --arg k "$SEEN_KEY" '. + [$k]' 2>/dev/null || echo "$NEW_SEEN")
  done <<< "$MESSAGES"
done

# surface 한 키 영속 (최대 200 개로 cap — 메모리 누수 방지)
if [ -n "$OUTPUT" ]; then
  echo "$NEW_SEEN" | jq '.[-200:]' > "$SEEN_FILE" 2>/dev/null || echo "$NEW_SEEN" > "$SEEN_FILE"
  cat <<EOF

────────── Forge Team 신호 ──────────$OUTPUT
─────────────────────────────────────
다음 단계: 완료된 팀이면 \`forge-team merge\` 또는 자세한 결과 확인.
EOF
fi

exit 0
