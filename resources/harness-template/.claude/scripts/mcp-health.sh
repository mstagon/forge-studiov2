#!/bin/bash
# MCP Health Check: MCP 서버 상태 확인 + 지수 백오프 재시도
# SessionStart 또는 수동 호출

HEALTH_DIR="/tmp/claude-mcp-health"
mkdir -p "$HEALTH_DIR" 2>/dev/null

PROJECT_DIR="$(cd "$(dirname "$0")/../.." && pwd)"

# MCP 설정 파일 위치
MCP_CONFIG="$HOME/.claude.json"
PROJECT_MCP="$PROJECT_DIR/.claude/mcp.json"

check_mcp_server() {
  local name="$1"
  local fail_file="$HEALTH_DIR/${name}.failures"
  local last_check="$HEALTH_DIR/${name}.last"

  # 지수 백오프: 실패 횟수에 따라 체크 간격 증가
  if [ -f "$fail_file" ]; then
    FAILURES=$(cat "$fail_file")
    # 백오프: 2^failures 분 (최대 60분)
    BACKOFF_SECS=$(( (1 << FAILURES) * 60 ))
    [ "$BACKOFF_SECS" -gt 3600 ] && BACKOFF_SECS=3600

    if [ -f "$last_check" ]; then
      LAST=$(cat "$last_check")
      NOW=$(date +%s)
      ELAPSED=$(( NOW - LAST ))
      if [ "$ELAPSED" -lt "$BACKOFF_SECS" ]; then
        WAIT_MIN=$(( (BACKOFF_SECS - ELAPSED) / 60 ))
        echo "  ⏳ $name: 백오프 중 (${WAIT_MIN}분 후 재시도, 실패 ${FAILURES}회)" >&2
        return 2
      fi
    fi
  fi

  date +%s > "$last_check"
  return 0
}

reset_failures() {
  local name="$1"
  rm -f "$HEALTH_DIR/${name}.failures"
}

record_failure() {
  local name="$1"
  local fail_file="$HEALTH_DIR/${name}.failures"
  if [ -f "$fail_file" ]; then
    CURRENT=$(cat "$fail_file")
    echo $(( CURRENT + 1 )) > "$fail_file"
  else
    echo 1 > "$fail_file"
  fi
}

# 헬스 체크 실행
echo "🏥 MCP Health Check" >&2
echo "───────────────────" >&2

ALL_HEALTHY=true

# MCP 설정에서 서버 목록 추출
if [ -f "$MCP_CONFIG" ]; then
  SERVERS=$(jq -r '.mcpServers // {} | keys[]' "$MCP_CONFIG" 2>/dev/null)
elif [ -f "$PROJECT_MCP" ]; then
  SERVERS=$(jq -r '.mcpServers // {} | keys[]' "$PROJECT_MCP" 2>/dev/null)
else
  echo "  ℹ️ MCP 설정 파일 없음 — 스킵" >&2
  exit 0
fi

if [ -z "$SERVERS" ]; then
  echo "  ℹ️ 등록된 MCP 서버 없음" >&2
  exit 0
fi

for server in $SERVERS; do
  check_mcp_server "$server"
  STATUS=$?

  if [ $STATUS -eq 2 ]; then
    ALL_HEALTHY=false
    continue
  fi

  # 기본 가용성 체크 (프로세스 존재 확인)
  # MCP 서버는 stdio 기반이므로 설정 유효성만 확인
  ENABLED=$(jq -r ".mcpServers.\"$server\".disabled // false" "$MCP_CONFIG" 2>/dev/null)
  if [ "$ENABLED" = "true" ]; then
    echo "  ⏸️  $server: 비활성화됨" >&2
    continue
  fi

  COMMAND=$(jq -r ".mcpServers.\"$server\".command // empty" "$MCP_CONFIG" 2>/dev/null)
  if [ -z "$COMMAND" ]; then
    echo "  ❌ $server: command 미설정" >&2
    record_failure "$server"
    ALL_HEALTHY=false
    continue
  fi

  # command 실행 가능 여부 확인
  if command -v "$COMMAND" &>/dev/null || [ -x "$COMMAND" ]; then
    echo "  ✅ $server: 정상 (command: $COMMAND)" >&2
    reset_failures "$server"
  else
    echo "  ⚠️  $server: command '$COMMAND' 찾을 수 없음" >&2
    record_failure "$server"
    ALL_HEALTHY=false
  fi
done

if [ "$ALL_HEALTHY" = true ]; then
  echo "───────────────────" >&2
  echo "✅ 모든 MCP 서버 정상" >&2
else
  echo "───────────────────" >&2
  echo "⚠️ 일부 MCP 서버 점검 필요" >&2
fi
