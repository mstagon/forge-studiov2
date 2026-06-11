#!/usr/bin/env bash
# forge-council-stop.sh — Council 모드 멤버의 Stop event 처리.
#
# 멤버 Claude/Codex 가 응답 종료 시 Stop hook 발동. 이 스크립트가:
#   1. 멤버 Council state file 갱신 (round 완료 표시)
#   2. 다음 멤버에게 inbox 으로 다음 round prompt 전달
#   3. 모든 round 완료 시 final synthesis 작성 + 메인 inbox 알림
#
# Member 식별 (FORGE_TEAM_ID + FORGE_MEMBER_NAME) 없거나 council 모드
# 아니면 통과. 메인 세션도 통과.
#
# 단순 round-robin minimum 버전 — Codex 의 docs/forge-team-complete-flow.md
# 의 FORGE_COUNCIL block parser + consensus detector 는 v0.10.1+ 별도.

set -e

# Member 식별 — env 없으면 메인 또는 비-멤버, 통과
if [ -z "$FORGE_TEAM_ID" ] || [ -z "$FORGE_MEMBER_NAME" ]; then
  exit 0
fi

WS_ROOT="${CLAUDE_PROJECT_DIR:-$(pwd)}"
TEAM_DIR="$WS_ROOT/.claude/teams/$FORGE_TEAM_ID"
COUNCIL_DIR="$TEAM_DIR/council"
STATE_FILE="$COUNCIL_DIR/state.json"
LOCK_FILE="$COUNCIL_DIR/state.lock"
CONFIG_FILE="$TEAM_DIR/config.json"

# Council 모드 아닌 팀이면 state 자체가 없음 → 통과
[ ! -f "$STATE_FILE" ] && exit 0
[ ! -f "$CONFIG_FILE" ] && exit 0

# jq 가 있는지 (없으면 무동작 — 안전)
command -v jq >/dev/null 2>&1 || exit 0

mkdir -p "$COUNCIL_DIR"

# 락으로 동시 진행 방지
exec 9>"$LOCK_FILE"
flock -x 9

# 현재 round + member cursor 읽기
CURRENT_ROUND=$(jq -r '.round // 1' "$STATE_FILE")
STATUS=$(jq -r '.status // "running"' "$STATE_FILE")

# 이미 종료 상태면 무동작
if [ "$STATUS" != "running" ]; then
  exit 0
fi

# 자기 round 완료 표시 (단순 — round + member 조합 unique)
TIMESTAMP=$(date -u +"%Y-%m-%dT%H:%M:%SZ")
TMP=$(mktemp)
jq --arg member "$FORGE_MEMBER_NAME" \
   --argjson round "$CURRENT_ROUND" \
   --arg ts "$TIMESTAMP" \
   '.messages += [{
     "round": $round,
     "member": $member,
     "kind": (if $round == 1 then "proposal" elif $round == 2 then "critique" else "consensus" end),
     "completedAt": $ts
   }] | .updatedAt = $ts' \
   "$STATE_FILE" > "$TMP" && mv "$TMP" "$STATE_FILE"

# 이 round 의 모든 멤버 완료됐는지 검사
MEMBERS=$(jq -r '.members[]' "$STATE_FILE")
COMPLETED=$(jq -r --argjson r "$CURRENT_ROUND" \
  '[.messages[] | select(.round == $r) | .member] | unique | join("\n")' \
  "$STATE_FILE")

ALL_DONE=true
for m in $MEMBERS; do
  if ! echo "$COMPLETED" | grep -qx "$m"; then
    ALL_DONE=false
    break
  fi
done

if [ "$ALL_DONE" = "true" ]; then
  # Round 종료 — 다음 round 시작 또는 finalize
  if [ "$CURRENT_ROUND" -ge 3 ]; then
    # 모든 round 종료 → finalize
    TMP=$(mktemp)
    jq --arg ts "$TIMESTAMP" \
       '.status = "finalized" | .updatedAt = $ts' \
       "$STATE_FILE" > "$TMP" && mv "$TMP" "$STATE_FILE"

    # final synthesis 임시 작성 (간단 — 모든 round 메시지 모아서)
    cat > "$COUNCIL_DIR/final.md" <<EOF
# Council Final Synthesis

Status: finalized
Topic: $(jq -r '.topic // "(no topic)"' "$STATE_FILE")
Members: $(echo "$MEMBERS" | tr '\n' ', ' | sed 's/,$//')

## 진행 round
- Round 1: proposal
- Round 2: critique
- Round 3: consensus

## 멤버별 완료 기록
$(jq -r '.messages[] | "- " + .member + " (round " + (.round | tostring) + ", " + .kind + ")"' "$STATE_FILE")

## Action
메인 세션은 멤버 inbox 의 round 별 답변 직접 읽고 합의안 도출. 자동
consensus detector 는 v0.10.1+ 에서 추가 예정.
EOF

    # 메인 inbox 에 알림
    MAIN_INBOX="$TEAM_DIR/inboxes/main.json"
    [ -f "$MAIN_INBOX" ] || echo "[]" > "$MAIN_INBOX"
    TMP=$(mktemp)
    jq --arg text "[Council finalized] 모든 round 완료. final.md 참조: $COUNCIL_DIR/final.md" \
       --arg ts "$TIMESTAMP" \
       '. += [{ "from": "forge-team", "text": $text, "timestamp": $ts, "read": false }]' \
       "$MAIN_INBOX" > "$TMP" && mv "$TMP" "$MAIN_INBOX"
  else
    # 다음 round 시작
    NEXT_ROUND=$((CURRENT_ROUND + 1))
    TMP=$(mktemp)
    jq --argjson r "$NEXT_ROUND" \
       --arg ts "$TIMESTAMP" \
       '.round = $r | .updatedAt = $ts' \
       "$STATE_FILE" > "$TMP" && mv "$TMP" "$STATE_FILE"

    # 모든 멤버 inbox 에 다음 round 안내
    NEXT_KIND=""
    case "$NEXT_ROUND" in
      2) NEXT_KIND="critique — 다른 멤버의 Round 1 proposal 을 비판/보완" ;;
      3) NEXT_KIND="consensus — 합의안 도출 또는 dissent 명시" ;;
    esac

    for m in $MEMBERS; do
      MEMBER_INBOX="$TEAM_DIR/inboxes/$m.json"
      [ -f "$MEMBER_INBOX" ] || echo "[]" > "$MEMBER_INBOX"
      TMP=$(mktemp)
      jq --arg text "[Council Round $NEXT_ROUND 시작] $NEXT_KIND. 다른 멤버 inbox 의 Round $CURRENT_ROUND 메시지 읽고 답하세요." \
         --arg ts "$TIMESTAMP" \
         '. += [{ "from": "forge-team", "text": $text, "timestamp": $ts, "read": false }]' \
         "$MEMBER_INBOX" > "$TMP" && mv "$TMP" "$MEMBER_INBOX"
    done
  fi
fi

exit 0
