#!/bin/bash
# Hook Profiles: minimal/standard/strict/ultracode 환경별 훅 강도 조절
# 다른 hook 스크립트가 should-* 질의로 호출 — 프로파일에 따라 차단/우회 결정
#
# 프로파일 결정 우선순위:
#   1. ECC_HOOK_PROFILE env (구버전 호환)
#   2. FORGE_HOOK_PROFILE env
#   3. auto-profile.sh 가 SessionStart 에 기록한 프로젝트별 파일
#      (/tmp/forge-hook-profile-<projectdir md5>)
#   4. standard (기본값)
#
# 프로파일 정의:
# minimal   — 위험 명령 차단 + 시크릿 탐지만 (빠른 프로토타이핑)
# standard  — 시크릿 탐지 + GateGuard + 스킬 주입 + 포맷팅 (기본값)
# strict    — 모든 경고가 차단으로 승격 + 추가 검증
# ultracode — 메인 세션이 max-tier 모델일 때. 조사 강제(gateguard) / 스킬
#             주입 / Stop 학습·텔레메트리 훅을 우회해 turn latency 절감.
#             위험 명령 차단 / 시크릿 / 커밋 컨벤션 / 포맷팅은 유지.
#             멤버 세션 (FORGE_TEAM_ID set) 은 auto-profile 이 ultracode 를
#             주지 않으므로 멤버 가드는 그대로.

resolve_profile() {
  if [ -n "${ECC_HOOK_PROFILE:-}" ]; then
    echo "$ECC_HOOK_PROFILE"
    return
  fi
  if [ -n "${FORGE_HOOK_PROFILE:-}" ]; then
    echo "$FORGE_HOOK_PROFILE"
    return
  fi
  local project_dir="${CLAUDE_PROJECT_DIR:-$(cd "$(dirname "$0")/../.." && pwd)}"
  local key
  key=$(echo "$project_dir" | md5 -q 2>/dev/null || echo "$project_dir" | md5sum | cut -d' ' -f1)
  local from_file
  from_file=$(head -1 "/tmp/forge-hook-profile-$key" 2>/dev/null | tr -d '[:space:]')
  echo "${from_file:-standard}"
}

PROFILE=$(resolve_profile)

case "$1" in
  "check-level"|"resolve")
    echo "$PROFILE"
    ;;

  "should-block-warning")
    # strict 모드에서는 경고도 차단으로 승격
    [ "$PROFILE" = "strict" ] && exit 1
    exit 0
    ;;

  "should-gateguard")
    # minimal / ultracode 에서는 GateGuard 비활성화
    [ "$PROFILE" = "minimal" ] && exit 1
    [ "$PROFILE" = "ultracode" ] && exit 1
    exit 0
    ;;

  "should-skill-inject")
    # ultracode 메인 세션은 스킬 주입 생략 — 메인은 orchestrator 라 구현
    # 편집이 드물고, max-tier 모델은 스스로 스킬을 Read 함. 멤버는 standard.
    [ "$PROFILE" = "ultracode" ] && exit 1
    exit 0
    ;;

  "should-stop-telemetry")
    # learn.sh / evaluate-session.sh / cost-tracker.sh — Stop 훅 학습/기록.
    # ultracode (메인 max-tier) / minimal 에서는 latency 절감을 위해 우회.
    [ "$PROFILE" = "ultracode" ] && exit 1
    [ "$PROFILE" = "minimal" ] && exit 1
    exit 0
    ;;

  "should-format")
    # minimal 모드에서는 자동 포맷팅 비활성화
    [ "$PROFILE" = "minimal" ] && exit 1
    exit 0
    ;;

  "should-secret-scan")
    # 어느 모드에서도 시크릿 스캔은 항상 실행
    exit 0
    ;;

  "should-lint")
    [ "$PROFILE" = "strict" ] && exit 0
    [ "$PROFILE" = "standard" ] && exit 0
    exit 1
    ;;

  "info")
    echo "📋 Hook Profile: $PROFILE" >&2
    case "$PROFILE" in
      "minimal")
        echo "  ⚡ 최소 검증 — 위험 명령 차단 + 시크릿 탐지만" >&2
        ;;
      "standard")
        echo "  ✅ 표준 검증 — GateGuard + 스킬 주입 + 포맷팅 + 시크릿 탐지" >&2
        ;;
      "strict")
        echo "  🔒 엄격 검증 — 모든 경고 차단 승격 + 추가 lint" >&2
        ;;
      "ultracode")
        echo "  🚀 max-tier 메인 — 조사/학습 훅 우회, 안전 차단은 유지" >&2
        ;;
    esac
    ;;

  *)
    echo "Usage: hook-profiles.sh {resolve|check-level|should-block-warning|should-gateguard|should-skill-inject|should-stop-telemetry|should-format|should-secret-scan|should-lint|info}" >&2
    exit 1
    ;;
esac
