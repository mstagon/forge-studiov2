#!/bin/bash
# Context Lineage 복원 (P1-5): 새 세션 시작 시 직전 컴팩션 스냅샷 surface
# SessionStart 훅에서 호출
#
# pre-compact.sh 가 남긴 `.claude/compact-state.md` 가 48시간 이내면
# 포인터 + 핵심 카운트를 stdout 으로 주입 — 세션이 끊겼다 재시작해도
# 직전 작업 단서를 바로 잡는다.

PROJECT_DIR="${CLAUDE_PROJECT_DIR:-$(cd "$(dirname "$0")/../.." && pwd)}"
STATE_FILE="$PROJECT_DIR/.claude/compact-state.md"
[ -f "$STATE_FILE" ] || exit 0

# 48시간 넘은 스냅샷은 noise — 무시
MTIME=$(stat -f %m "$STATE_FILE" 2>/dev/null || stat -c %Y "$STATE_FILE" 2>/dev/null || echo 0)
NOW=$(date +%s)
AGE=$(( NOW - MTIME ))
[ "$AGE" -gt 172800 ] && exit 0

HOURS=$(( AGE / 3600 ))
echo "🧬 직전 세션 상태 스냅샷 있음 (${HOURS}시간 전): .claude/compact-state.md"
echo "   이어서 작업할 거면 먼저 Read — 팀 진행 / 미커밋 / 계약 목록이 들어있다."
exit 0
