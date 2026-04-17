#!/bin/bash
# Continuous Learning: 교훈 기록 + 자동 Escalation
# Stop hook에서 호출 — 세션 종료 시 lessons-learned 분석

PROJECT_DIR="$(cd "$(dirname "$0")/../.." && pwd)"
LESSONS_FILE="$PROJECT_DIR/docs/lessons-learned.md"

# lessons-learned.md가 없으면 생성
if [ ! -f "$LESSONS_FILE" ]; then
  mkdir -p "$PROJECT_DIR/docs"
  cat > "$LESSONS_FILE" << 'INIT'
# Lessons Learned

세션에서 발견된 교훈을 기록. 3회 이상 반복되면 CLAUDE.md 규칙으로 승격.

INIT
fi

# 반복 패턴 탐지: 같은 키워드가 3회 이상 등장하는 교훈
REPEATED=$(grep -E '^\*\*문제\*\*:|^- \*\*문제\*\*:' "$LESSONS_FILE" 2>/dev/null | \
  sed 's/.*문제\*\*: //' | \
  sort | uniq -c | sort -rn | \
  awk '$1 >= 3 { $1=""; print substr($0,2) }' | head -5)

if [ -n "$REPEATED" ]; then
  echo "" >&2
  echo "🔄 Escalation 후보 (3회+ 반복 패턴):" >&2
  echo "$REPEATED" | while read -r pattern; do
    echo "  → $pattern" >&2
  done
  echo "  💡 /retrospective 실행하여 CLAUDE.md 규칙 승격 검토" >&2
fi

# 오늘 세션 변경 통계
CHANGED_TODAY=$(cd "$PROJECT_DIR" && git log --since="today" --oneline 2>/dev/null | wc -l | tr -d ' ')
if [ "$CHANGED_TODAY" -gt 0 ]; then
  FILES_TODAY=$(cd "$PROJECT_DIR" && git log --since="today" --name-only --pretty=format: 2>/dev/null | sort -u | grep -v '^$' | wc -l | tr -d ' ')
  echo "📊 오늘 세션: 커밋 ${CHANGED_TODAY}건, 파일 ${FILES_TODAY}개 변경" >&2
fi
