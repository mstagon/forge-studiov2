#!/bin/bash
# Skill Injector: 파일 패턴 기반 스킬 + 룰 자동 주입 (lazy-load)
# PreToolUse Write|Edit 훅에서 호출
# ultracode 프로파일 (메인 max-tier) 에서는 생략 — hook-profiles.sh 가 판정

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
bash "$SCRIPT_DIR/hook-profiles.sh" should-skill-inject || exit 0

FILE=$(jq -r '.tool_input.file_path // empty' 2>/dev/null)
[ -z "$FILE" ] && exit 0

SKILLS=""

# Flutter 스킬 매칭
if echo "$FILE" | grep -qE 'client/domain/entity/|client/data/.*/dto/'; then
  SKILLS="$SKILLS freezed-models"
fi
if echo "$FILE" | grep -qE 'client/presentation/'; then
  SKILLS="$SKILLS riverpod-patterns go-router mobile-design mobile-touch"
fi
if echo "$FILE" | grep -qE 'client/data/remote/|client/core/network/'; then
  SKILLS="$SKILLS dio-retrofit"
fi
if echo "$FILE" | grep -qE 'client/core/utils/result'; then
  SKILLS="$SKILLS error-handling"
fi
if echo "$FILE" | grep -qE 'client/core/logger/'; then
  SKILLS="$SKILLS logging"
fi

# NestJS 스킬 매칭
if echo "$FILE" | grep -qE 'server/src/.*\.module\.ts$'; then
  SKILLS="$SKILLS nestjs-module"
fi
if echo "$FILE" | grep -qE 'server/src/auth/'; then
  SKILLS="$SKILLS nestjs-auth"
fi
if echo "$FILE" | grep -qE 'server/src/.*/dto/'; then
  SKILLS="$SKILLS api-contract"
fi

# Prisma 스킬 매칭
if echo "$FILE" | grep -qE 'prisma/schema\.prisma'; then
  SKILLS="$SKILLS prisma-patterns postgres-patterns"
fi

# CMS 스킬 매칭
if echo "$FILE" | grep -qE 'cms/app/'; then
  SKILLS="$SKILLS nextjs-patterns"
fi

# 테스트 스킬 매칭
if echo "$FILE" | grep -qE 'test/|server/test/|_test\.dart$|\.spec\.ts$'; then
  SKILLS="$SKILLS tdd-workflow"
fi

# E2E / integration_test 스킬 매칭 (flutter_driver + mcp__dart)
if echo "$FILE" | grep -qE 'integration_test/|_e2e_test\.dart$|_driver\.dart$'; then
  SKILLS="$SKILLS flutter-driver-e2e"
fi

# 배포 스킬 매칭
if echo "$FILE" | grep -qiE 'dockerfile|docker-compose'; then
  SKILLS="$SKILLS deployment-patterns"
fi

# ── 룰 lazy-load (v0.13.0 토큰 다이어트) ─────────────────────────────
# CLAUDE.md 가 rules 8개를 @-include 로 강제 로드하던 것을 제거하고,
# 편집 파일 패턴에 맞는 룰만 여기서 포인터로 주입한다.
RULES=""
if echo "$FILE" | grep -qE 'client/|server/src/|cms/(app|lib|components)/|prisma/'; then
  RULES="$RULES architecture coding-style"
fi
if echo "$FILE" | grep -qE 'server/src/auth/|/dto/|cms/app/'; then
  RULES="$RULES security"
fi
if echo "$FILE" | grep -qE 'test/|_test\.dart$|\.spec\.ts$|integration_test/'; then
  RULES="$RULES testing"
fi

if [ -n "$SKILLS" ] || [ -n "$RULES" ]; then
  # stdout으로 출력 → Claude 컨텍스트에 주입됨 (additionalContext)
  echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
  echo "⚠️ MANDATORY — 이 파일을 편집하기 전 반드시 적용:"
  echo ""
  echo "파일: $FILE"
  echo ""
  echo "지금 즉시 다음을 Read 도구로 전부 읽어라 (정확한 경로, 이 세션에서 이미 읽었으면 생략 가능):"
  for skill in $SKILLS; do
    echo "  - $CLAUDE_PROJECT_DIR/.claude/skills/$skill/SKILL.md"
  done
  for rule in $RULES; do
    echo "  - $CLAUDE_PROJECT_DIR/.claude/rules/common/$rule.md"
  done
  echo ""
  echo "위 문서의 규칙을 이 편집에 그대로 적용해라."
  echo "룰 위반 시 편집을 중단하고 사용자에게 보고. 미적용 편집은 반려 사유다."
  echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
fi

exit 0
