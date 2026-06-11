#!/usr/bin/env bash
# forge-code-graph.sh — code graph 인덱스 자동 갱신 (P1-8)
# SessionStart 훅에서 호출 (메인 세션만)
#
# code-review-graph CLI (PyPI, GUI Settings 에서 설치 가능) 가 깔려 있으면
# 워크스페이스 인덱스를 백그라운드로 갱신. blast_radius / dependents 쿼리가
# 항상 최신 코드 기준으로 동작하게 한다 — 수동 build 불필요.
#
# 갱신 조건: 마지막 빌드 때의 HEAD sha 와 현재 HEAD 가 다를 때만 (스탬프
# 비교). 빌드는 nohup 백그라운드 — 세션 시작을 블로킹하지 않음.
# CLI 없으면 조용히 통과 (선택 기능).

# 멤버 worktree 세션은 skip — 인덱스는 메인 워크스페이스 것 하나만 유지
[ -n "${FORGE_TEAM_ID:-}" ] && exit 0

command -v code-review-graph >/dev/null 2>&1 || exit 0
command -v git >/dev/null 2>&1 || exit 0

WS="${CLAUDE_PROJECT_DIR:-$(cd "$(dirname "$0")/../.." && pwd)}"
cd "$WS" 2>/dev/null || exit 0

# 인덱싱할 소스가 있는지 — 빈 스켈레톤 워크스페이스면 skip
if ! find client server cms src lib -type f \( -name '*.ts' -o -name '*.tsx' -o -name '*.dart' -o -name '*.py' \) 2>/dev/null | head -1 | grep -q .; then
  exit 0
fi

HEAD=$(git rev-parse HEAD 2>/dev/null) || exit 0
STAMP="$WS/.claude/.code-graph-head"
[ -f "$STAMP" ] && [ "$(cat "$STAMP" 2>/dev/null)" = "$HEAD" ] && exit 0

# 이전 빌드가 아직 도는 중이면 중복 spawn 방지
LOCK="$WS/.claude/.code-graph-build.lock"
if [ -f "$LOCK" ]; then
  LOCK_PID=$(cat "$LOCK" 2>/dev/null)
  if [ -n "$LOCK_PID" ] && kill -0 "$LOCK_PID" 2>/dev/null; then
    exit 0
  fi
fi

LOG="$WS/.claude/.code-graph-build.log"
nohup sh -c "code-review-graph build > \"$LOG\" 2>&1; rm -f \"$LOCK\"" >/dev/null 2>&1 &
echo $! > "$LOCK"
echo "$HEAD" > "$STAMP"

echo "🧠 code graph 인덱스 백그라운드 갱신 시작 (HEAD 변경 감지) — blast_radius/dependents 쿼리 최신화"
exit 0
