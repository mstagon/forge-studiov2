#!/bin/bash
# Cost Tracker: 세션별 토큰/비용 추적
# Stop hook에서 호출 — 세션 종료 시 비용 기록

METRICS_DIR="$HOME/.claude/metrics"
COSTS_FILE="$METRICS_DIR/costs.jsonl"
DAILY_FILE="$METRICS_DIR/daily-$(date +%Y-%m-%d).jsonl"

mkdir -p "$METRICS_DIR" 2>/dev/null

# 세션 정보 수집
PROJECT_DIR="$(cd "$(dirname "$0")/../.." && pwd)"
BRANCH=$(cd "$PROJECT_DIR" && git branch --show-current 2>/dev/null || echo "unknown")
COMMITS=$(cd "$PROJECT_DIR" && git log --since="today" --oneline 2>/dev/null | wc -l | tr -d ' ')
FILES_CHANGED=$(cd "$PROJECT_DIR" && git diff --name-only 2>/dev/null | wc -l | tr -d ' ')
SESSION_ID="${CLAUDE_SESSION_ID:-$(date +%s)-$$}"

# JSONL 엔트리 기록
ENTRY=$(cat <<EOF
{"timestamp":"$(date -u +%Y-%m-%dT%H:%M:%SZ)","session_id":"$SESSION_ID","project":"$(basename "$PROJECT_DIR")","branch":"$BRANCH","commits":$COMMITS,"files_changed":$FILES_CHANGED}
EOF
)

echo "$ENTRY" >> "$COSTS_FILE"
echo "$ENTRY" >> "$DAILY_FILE"

# 일일 요약 출력
TODAY_SESSIONS=$(wc -l < "$DAILY_FILE" 2>/dev/null | tr -d ' ')
TODAY_COMMITS=$(cd "$PROJECT_DIR" && git log --since="today" --oneline 2>/dev/null | wc -l | tr -d ' ')

echo "" >&2
echo "💰 세션 메트릭스 기록 완료" >&2
echo "  📊 오늘 세션: ${TODAY_SESSIONS}회" >&2
echo "  📝 오늘 커밋: ${TODAY_COMMITS}건" >&2
echo "  📁 미커밋 변경: ${FILES_CHANGED}개 파일" >&2

# 주간 누적 (월요일 기준)
WEEK_START=$(date -v-monday +%Y-%m-%d 2>/dev/null || date -d 'last monday' +%Y-%m-%d 2>/dev/null || echo "")
if [ -n "$WEEK_START" ]; then
  WEEK_SESSIONS=0
  for f in "$METRICS_DIR"/daily-*.jsonl; do
    [ -f "$f" ] || continue
    FILE_DATE=$(basename "$f" | sed 's/daily-//' | sed 's/.jsonl//')
    if [[ "$FILE_DATE" > "$WEEK_START" ]] || [[ "$FILE_DATE" == "$WEEK_START" ]]; then
      COUNT=$(wc -l < "$f" | tr -d ' ')
      WEEK_SESSIONS=$((WEEK_SESSIONS + COUNT))
    fi
  done
  echo "  📅 이번 주 세션: ${WEEK_SESSIONS}회" >&2
fi
