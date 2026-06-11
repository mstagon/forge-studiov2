#!/bin/bash
# GateGuard: 첫 편집 전 조사 강제
# 파일당 한 번만 작동 (30분 TTL)
# PreToolUse Write|Edit 에서 호출
# minimal / ultracode 프로파일에서는 비활성 (hook-profiles.sh 가 판정)

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
bash "$SCRIPT_DIR/hook-profiles.sh" should-gateguard || exit 0

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

# 첫 편집 → 체크리스트를 stdout으로 주입 (Claude 컨텍스트에 들어감)
# 30분 TTL cache로 재주입 방지
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "🔍 GATEGUARD — 첫 편집 조사 강제 (이 세션에서 최초 수정):"
echo ""
echo "파일: $FILE_PATH"
echo ""
echo "이 편집을 시작하기 전 반드시 다음을 확인하고 답하라:"
echo "1. 이 파일이 어디서 import/참조되는지 확인했나? (Grep으로 검색)"
echo "2. 기존 패턴/컨벤션을 따라가는지 확인했나? (주변 코드 Read)"
echo "3. public API 시그니처 변경이 있다면 호출부 영향 파악했나?"
echo "4. 이 파일의 테스트 영향 확인했나? (관련 *_test 파일)"
echo "5. 유저 요청과 직접 관련된 변경인가? (스코프 일탈 금지)"
echo ""
echo "위 항목을 건너뛴 편집은 반려 사유다. 조사 없이 수정 착수 금지."
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"

# 통과 마크 기록 (30분 TTL)
date +%s > "$GUARD_FILE"
exit 0
