#!/bin/bash
# Strategic Compact: 컨텍스트 압축 전 핵심 상태 보존
# PreCompact 훅에서 호출

STATE_DIR="/tmp/claude-compact-state"
mkdir -p "$STATE_DIR" 2>/dev/null

PROJECT_DIR="$(cd "$(dirname "$0")/../.." && pwd)"
TIMESTAMP=$(date +%Y%m%d-%H%M%S)
STATE_FILE="$STATE_DIR/state-$TIMESTAMP.md"

# 현재 작업 상태 수집
BRANCH=$(cd "$PROJECT_DIR" && git branch --show-current 2>/dev/null || echo "unknown")
DIRTY_FILES=$(cd "$PROJECT_DIR" && git diff --name-only 2>/dev/null | head -20)
STAGED_FILES=$(cd "$PROJECT_DIR" && git diff --cached --name-only 2>/dev/null | head -20)
RECENT_COMMITS=$(cd "$PROJECT_DIR" && git log --oneline -5 2>/dev/null)

cat > "$STATE_FILE" << EOF
# Compact State — $TIMESTAMP

## 브랜치: $BRANCH

## 미커밋 변경 파일
$DIRTY_FILES

## 스테이징된 파일
$STAGED_FILES

## 최근 커밋
$RECENT_COMMITS
EOF

echo "💾 컴팩션 전 상태 저장: $STATE_FILE" >&2
echo "  📁 미커밋: $(echo "$DIRTY_FILES" | grep -c . | tr -d ' ')개 파일" >&2
