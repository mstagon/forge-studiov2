#!/bin/bash
# Hook Profiles: minimal/standard/strict 환경별 훅 강도 조절
# ECC_HOOK_PROFILE 환경변수로 제어
# PreToolUse 에서 호출 — 현재 프로파일에 따라 차단/경고 수준 결정

PROFILE="${ECC_HOOK_PROFILE:-standard}"

# 프로파일 정의:
# minimal  — 위험 명령 차단만 (빠른 프로토타이핑용)
# standard — 시크릿 탐지 + GateGuard 경고 + 포맷팅 (기본값)
# strict   — 모든 경고가 차단으로 승격 + 추가 검증

case "$1" in
  "check-level")
    # 다른 스크립트에서 현재 프로파일 레벨 조회용
    echo "$PROFILE"
    ;;

  "should-block-warning")
    # strict 모드에서는 경고도 차단으로 승격
    [ "$PROFILE" = "strict" ] && exit 1
    exit 0
    ;;

  "should-gateguard")
    # minimal 모드에서는 GateGuard 비활성화
    [ "$PROFILE" = "minimal" ] && exit 1
    exit 0
    ;;

  "should-format")
    # minimal 모드에서는 자동 포맷팅 비활성화
    [ "$PROFILE" = "minimal" ] && exit 1
    exit 0
    ;;

  "should-secret-scan")
    # minimal 모드에서도 시크릿 스캔은 항상 실행
    exit 0
    ;;

  "should-lint")
    # strict 모드에서만 Stop 시 lint 실행
    [ "$PROFILE" = "strict" ] && exit 0
    [ "$PROFILE" = "standard" ] && exit 0
    exit 1
    ;;

  "info")
    echo "📋 Hook Profile: $PROFILE" >&2
    case "$PROFILE" in
      "minimal")
        echo "  ⚡ 최소 검증 — 위험 명령 차단 + 시크릿 탐지만" >&2
        echo "  → 빠른 프로토타이핑, 탐색 작업에 적합" >&2
        ;;
      "standard")
        echo "  ✅ 표준 검증 — GateGuard + 포맷팅 + 시크릿 탐지" >&2
        echo "  → 일반 개발 작업에 적합 (기본값)" >&2
        ;;
      "strict")
        echo "  🔒 엄격 검증 — 모든 경고 차단 승격 + 추가 lint" >&2
        echo "  → 프로덕션 코드, PR 준비에 적합" >&2
        ;;
    esac
    ;;

  *)
    echo "Usage: hook-profiles.sh {check-level|should-block-warning|should-gateguard|should-format|should-secret-scan|should-lint|info}" >&2
    exit 1
    ;;
esac
