#!/usr/bin/env bash
# forge-dto-broadcast.sh — Stop hook 멤버 worktree 의 DTO/스키마 변경 자동 broadcast.
#
# 문제: isolated worktree 팀에서 backend 멤버가 LoginRequest DTO 추가해도
# frontend 멤버 worktree 는 모름 → 각자 다른 DTO 생성 → 머지 후 정합성 깨짐.
# 사용자 보고: "단일 세션에선 안 그러는데 팀 모드 dto 서로 불일치".
#
# 해결: 멤버 Stop event 마다 자기 worktree 의 최근 diff 에서 DTO/엔티티/스키마
# 변경 감지 → 다른 멤버 inbox 에 "이 파일 수정됨, 확인 권장" broadcast.
# 진짜 sync 아닌 "공지" — 받는 멤버는 자기 turn 시작 시 read-inbox 로 확인 후
# 자기 DTO 맞춤. inbox 알림은 forge-team CLI 가 자동 push (notifyRecipientPane).
#
# Forge Team env (FORGE_TEAM_ID + FORGE_MEMBER_NAME) 없으면 메인/비-멤버라
# 통과.

set -e

if [ -z "${FORGE_TEAM_ID:-}" ] || [ -z "${FORGE_MEMBER_NAME:-}" ]; then
  exit 0
fi

# forge-team CLI 가 PATH 에 없거나 jq/git 없으면 skip — 다른 핵심 기능에 영향 없음
command -v forge-team >/dev/null 2>&1 || exit 0
command -v jq >/dev/null 2>&1 || exit 0
command -v git >/dev/null 2>&1 || exit 0

WS_ROOT="${CLAUDE_PROJECT_DIR:-$(pwd)}"
TEAM_DIR="$WS_ROOT/.claude/teams/$FORGE_TEAM_ID"
CONFIG="$TEAM_DIR/config.json"
[ ! -f "$CONFIG" ] && exit 0

# 멤버 worktree 의 최근 diff (직전 commit ↔ working tree). uncommitted 변경
# 도 포함 — 멤버가 commit 안 했어도 작업 중인 schema 변경 공유.
cd "$WS_ROOT" || exit 0
CHANGED=$(git diff --name-only HEAD 2>/dev/null; git status --porcelain | awk '{print $2}' 2>/dev/null) || true
[ -z "$CHANGED" ] && exit 0

# DTO / 엔티티 / 스키마 후보 패턴 (Flutter + NestJS + Prisma + Next.js)
DTO_FILES=$(echo "$CHANGED" | grep -E '(^|/)contracts/.*\.md$|(/dto/|schema\.prisma|/entity/|/entities/|/models?/|/types?/|\.proto$|openapi\.(yaml|json))' | sort -u || true)
[ -z "$DTO_FILES" ] && exit 0

# 같은 팀의 다른 멤버 (자기 자신 제외)
OTHERS=$(jq -r --arg me "$FORGE_MEMBER_NAME" '.members[] | select(.name != $me and .agentId != $me) | .name' "$CONFIG" 2>/dev/null) || true
[ -z "$OTHERS" ] && exit 0

# 요약 메시지 — 처음 3 파일만 인라인, 나머지는 count
FILE_COUNT=$(echo "$DTO_FILES" | wc -l | tr -d ' ')
FIRST_3=$(echo "$DTO_FILES" | head -3 | sed 's/^/  - /')
EXTRA=""
if [ "$FILE_COUNT" -gt 3 ]; then
  EXTRA=" (+ $((FILE_COUNT - 3)) 개 더)"
fi

SUMMARY="DTO/스키마 변경 by $FORGE_MEMBER_NAME ($FILE_COUNT 파일)"
TEXT=$(cat <<EOF
[DTO sync 알림]

멤버 $FORGE_MEMBER_NAME 가 다음 DTO/엔티티/스키마 파일을 수정했습니다$EXTRA:

$FIRST_3

권장: 자기 worktree 의 같은 DTO 가 있으면 위 멤버 의 정의 확인 후 동기화.
양 worktree 에서 서로 다른 DTO 생성하면 머지 후 정합성 깨짐.
EOF
)

# 각 멤버에게 broadcast (forge-team CLI 가 path traversal 검증 + 알림 push 까지 처리)
for OTHER in $OTHERS; do
  forge-team send-message \
    --workspace "$WS_ROOT" \
    --team-id "$FORGE_TEAM_ID" \
    --from "$FORGE_MEMBER_NAME" \
    --to "$OTHER" \
    --text "$TEXT" \
    --summary "$SUMMARY" \
    >/dev/null 2>&1 || true
done

exit 0
