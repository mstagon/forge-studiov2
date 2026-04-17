#!/bin/bash
# GateGuard: 첫 편집 전 조사 강제
# 파일당 한 번만 작동 (30분 TTL)
# PreToolUse Write|Edit 에서 호출

GUARD_DIR="/tmp/claude-gateguard-$$"
mkdir -p "$GUARD_DIR" 2>/dev/null

FILE_PATH=$(jq -r '.tool_input.file_path // .tool_input.file // empty' 2>/dev/null)
[ -z "$FILE_PATH" ] && exit 0

# 해시로 파일별 추적
FILE_HASH=$(echo "$FILE_PATH" | md5 -q 2>/dev/null || echo "$FILE_PATH" | md5sum | cut -d' ' -f1)
GUARD_FILE="$GUARD_DIR/$FILE_HASH"

# 이미 조사 완료된 파일 → 통과
if [ -f "$GUARD_FILE" ]; then
  GUARD_TIME=$(cat "$GUARD_FILE")
  NOW=$(date +%s)
  ELAPSED=$(( NOW - GUARD_TIME ))
  # 30분(1800초) 이내면 통과
  if [ "$ELAPSED" -lt 1800 ]; then
    exit 0
  fi
fi

# 코드젠 파일, 설정 파일 등은 스킵
if echo "$FILE_PATH" | grep -qE '\.(g\.dart|freezed\.dart|json|yaml|yml|lock|md)$'; then
  exit 0
fi

# 새 파일 생성(Write)은 스킵 — 파일이 아직 없으면
if [ ! -f "$FILE_PATH" ]; then
  date +%s > "$GUARD_FILE"
  exit 0
fi

# 첫 편집 → 경고 출력 (exit 0이므로 차단은 안 함, 경고만)
echo "🔍 GateGuard: $FILE_PATH 첫 수정 — 다음을 확인했는지 체크:" >&2
echo "  · 이 파일을 import하는 곳 확인" >&2
echo "  · public API 시그니처 파악" >&2
echo "  · 유저 요청과의 관련성 확인" >&2

# 통과 마크 기록
date +%s > "$GUARD_FILE"
exit 0
