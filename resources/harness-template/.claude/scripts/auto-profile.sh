#!/bin/bash
# Auto Profile: 브랜치 기반 훅 프로파일 자동 감지
# SessionStart 훅에서 호출
# 환경: dev(개발) / stg(스테이징) / prd(프로덕션)

PROJECT_DIR="$(cd "$(dirname "$0")/../.." && pwd)"
PROFILE_FILE="/tmp/ecc-hook-profile"
BRANCH=$(cd "$PROJECT_DIR" && git branch --show-current 2>/dev/null || echo "")

if [ -z "$BRANCH" ]; then
  echo "standard" > "$PROFILE_FILE"
  echo "🔧 Profile: standard (no branch)" >&2
  exit 0
fi

case "$BRANCH" in
  prd|hotfix/*)
    echo "strict" > "$PROFILE_FILE"
    echo "🔒 Profile: strict ($BRANCH → 프로덕션 엄격 검증)" >&2
    ;;
  stg)
    echo "strict" > "$PROFILE_FILE"
    echo "🔒 Profile: strict ($BRANCH → 스테이징 QA 검증)" >&2
    ;;
  dev)
    echo "standard" > "$PROFILE_FILE"
    echo "🔧 Profile: standard ($BRANCH → 개발 통합)" >&2
    ;;
  feat/*|fix/*|refactor/*)
    echo "standard" > "$PROFILE_FILE"
    echo "🔧 Profile: standard ($BRANCH → 피처 개발)" >&2
    ;;
  explore/*|poc/*|spike/*|experiment/*|prototype/*)
    echo "minimal" > "$PROFILE_FILE"
    echo "⚡ Profile: minimal ($BRANCH → 빠른 프로토타이핑)" >&2
    ;;
  *)
    echo "standard" > "$PROFILE_FILE"
    echo "🔧 Profile: standard ($BRANCH)" >&2
    ;;
esac

exit 0
