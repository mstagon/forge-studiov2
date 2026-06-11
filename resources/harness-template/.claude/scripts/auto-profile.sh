#!/bin/bash
# Auto Profile: 세션 컨텍스트 기반 훅 프로파일 자동 감지
# SessionStart 훅에서 호출
#
# 우선순위:
#   1. 명시 override — FORGE_HOOK_PROFILE env 또는 .claude/hook-profile 파일
#   2. 프로덕션 계열 브랜치 (prd/stg/hotfix/*) → strict (ultracode 보다 우선)
#   3. 메인 세션 (FORGE_TEAM_ID 없음) + settings.json effortLevel=max → ultracode
#   4. 브랜치 기반 (dev/feat → standard, explore/poc → minimal)
#
# 프로파일 파일은 프로젝트별 격리 — 메인 세션과 멤버 worktree 세션이 서로
# 덮어쓰지 않게 경로 해시 키 사용. (구버전 /tmp/ecc-hook-profile 단일 파일은
# 워크스페이스 2개 이상 열면 서로 클로버되는 결함이 있었음)

PROJECT_DIR="${CLAUDE_PROJECT_DIR:-$(cd "$(dirname "$0")/../.." && pwd)}"
KEY=$(echo "$PROJECT_DIR" | md5 -q 2>/dev/null || echo "$PROJECT_DIR" | md5sum | cut -d' ' -f1)
PROFILE_FILE="/tmp/forge-hook-profile-$KEY"

write_profile() {
  echo "$1" > "$PROFILE_FILE"
  echo "$2" >&2
  exit 0
}

# 1. 명시 override
if [ -n "${FORGE_HOOK_PROFILE:-}" ]; then
  write_profile "$FORGE_HOOK_PROFILE" "🔧 Profile: $FORGE_HOOK_PROFILE (env override)"
fi
if [ -f "$PROJECT_DIR/.claude/hook-profile" ]; then
  P=$(head -1 "$PROJECT_DIR/.claude/hook-profile" | tr -d '[:space:]')
  [ -n "$P" ] && write_profile "$P" "🔧 Profile: $P (.claude/hook-profile)"
fi

BRANCH=$(cd "$PROJECT_DIR" && git branch --show-current 2>/dev/null || echo "")

# 2. 프로덕션 계열 브랜치는 항상 strict (ultracode 보다 우선)
case "$BRANCH" in
  prd|hotfix/*)
    write_profile "strict" "🔒 Profile: strict ($BRANCH → 프로덕션 엄격 검증)"
    ;;
  stg)
    write_profile "strict" "🔒 Profile: strict ($BRANCH → 스테이징 QA 검증)"
    ;;
esac

# 3. 메인 세션 + max-tier 설정 → ultracode (hand-holding 제거)
#    멤버 세션 (FORGE_TEAM_ID set) 은 제외 — 멤버는 가드 전부 유지.
#    ultracode 가 꺼지는 것: gateguard 체크리스트, skill-injector 주입,
#    Stop 학습/텔레메트리 훅 (learn / evaluate-session / cost-tracker).
#    유지되는 것: 위험 명령 차단, 시크릿 스캔, 커밋 컨벤션 검증, 포맷팅.
if [ -z "${FORGE_TEAM_ID:-}" ] && command -v jq >/dev/null 2>&1; then
  EFFORT=$(jq -r '.effortLevel // ""' "$PROJECT_DIR/.claude/settings.json" 2>/dev/null)
  if [ "$EFFORT" = "max" ]; then
    write_profile "ultracode" "🚀 Profile: ultracode (메인 세션 + effortLevel=max — 조사/학습 훅 우회, 안전 차단은 유지)"
  fi
fi

# 4. 브랜치 기반
case "$BRANCH" in
  dev|feat/*|fix/*|refactor/*)
    write_profile "standard" "🔧 Profile: standard ($BRANCH → 개발)"
    ;;
  explore/*|poc/*|spike/*|experiment/*|prototype/*)
    write_profile "minimal" "⚡ Profile: minimal ($BRANCH → 빠른 프로토타이핑)"
    ;;
  *)
    write_profile "standard" "🔧 Profile: standard (${BRANCH:-no branch})"
    ;;
esac
