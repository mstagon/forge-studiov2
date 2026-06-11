#!/bin/bash
# Evaluate Session: 세션에서 패턴 추출 + instinct 시스템 연계
# Stop 훅에서 호출
# ultracode / minimal 프로파일에서는 우회 (hook-profiles.sh 가 판정)

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
bash "$SCRIPT_DIR/hook-profiles.sh" should-stop-telemetry || exit 0

PROJECT_DIR="$(cd "$(dirname "$0")/../.." && pwd)"
INSTINCTS_FILE="$PROJECT_DIR/docs/instincts.jsonl"

# instincts.jsonl 없으면 생성
if [ ! -f "$INSTINCTS_FILE" ]; then
  mkdir -p "$PROJECT_DIR/docs"
  touch "$INSTINCTS_FILE"
fi

# 오늘 세션 변경 통계
COMMITS_TODAY=$(cd "$PROJECT_DIR" && git log --since="today" --oneline 2>/dev/null | wc -l | tr -d ' ')
FILES_TODAY=$(cd "$PROJECT_DIR" && git log --since="today" --name-only --pretty=format: 2>/dev/null | sort -u | grep -v '^$' | wc -l | tr -d ' ')

# instinct 통계
if [ -f "$INSTINCTS_FILE" ]; then
  TOTAL_INSTINCTS=$(wc -l < "$INSTINCTS_FILE" | tr -d ' ')
  PROMOTED=$(grep -c '"promoted"' "$INSTINCTS_FILE" 2>/dev/null || echo 0)
  CONFIRMED=$(grep -c '"confirmed"' "$INSTINCTS_FILE" 2>/dev/null || echo 0)
  PENDING=$(grep -c '"pending"' "$INSTINCTS_FILE" 2>/dev/null || echo 0)
else
  TOTAL_INSTINCTS=0
  PROMOTED=0
  CONFIRMED=0
  PENDING=0
fi

echo "" >&2
echo "🧠 Session Evaluation" >&2
echo "───────────────────" >&2
echo "  📝 오늘 커밋: ${COMMITS_TODAY}건, 파일 ${FILES_TODAY}개 변경" >&2
echo "  💡 Instincts: 전체 ${TOTAL_INSTINCTS} (승격 ${PROMOTED}, 확인 ${CONFIRMED}, 대기 ${PENDING})" >&2

# 승격 가능 instinct가 있으면 알림
if [ "$CONFIRMED" -gt 0 ]; then
  echo "  ✨ 승격 가능 instinct ${CONFIRMED}개 → /evolve 실행 고려" >&2
fi
