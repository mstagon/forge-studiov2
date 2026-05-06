#!/bin/bash
# Skill Injector: 파일 패턴 기반 스킬 자동 주입
# PreToolUse Write|Edit 훅에서 호출

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

if [ -n "$SKILLS" ]; then
  # stdout으로 출력 → Claude 컨텍스트에 주입됨 (additionalContext)
  SKILL_LIST=$(echo "$SKILLS" | sed 's/^ //' | tr ' ' ',' | sed 's/,/, /g')
  echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
  echo "⚠️ MANDATORY SKILL — 이 파일을 편집하기 전 반드시 적용:"
  echo ""
  echo "파일: $FILE"
  echo "매칭 스킬: $SKILL_LIST"
  echo ""
  echo "지금 즉시 다음을 Read 도구로 전부 읽어라 (정확한 경로):"
  for skill in $SKILLS; do
    echo "  - $CLAUDE_PROJECT_DIR/.claude/skills/$skill/SKILL.md"
  done
  echo ""
  echo "그 SKILL.md의 규칙을 이 편집에 그대로 적용해라."
  echo "룰 위반 시 편집을 중단하고 사용자에게 보고."
  echo "스킬 미적용 편집은 반려 사유다."
  echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
fi

exit 0
