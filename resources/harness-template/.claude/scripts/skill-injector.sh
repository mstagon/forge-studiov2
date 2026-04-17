#!/bin/bash
# Skill Injector: 파일 패턴 기반 스킬 자동 주입
# PreToolUse Write|Edit 훅에서 호출

FILE=$(jq -r '.tool_input.file_path // empty' 2>/dev/null)
[ -z "$FILE" ] && exit 0

SKILLS=""

# Flutter 스킬 매칭
if echo "$FILE" | grep -qE 'lib/domain/entity/|lib/data/.*/dto/'; then
  SKILLS="$SKILLS freezed-models"
fi
if echo "$FILE" | grep -qE 'lib/presentation/'; then
  SKILLS="$SKILLS riverpod-patterns go-router"
fi
if echo "$FILE" | grep -qE 'lib/data/remote/|lib/core/network/'; then
  SKILLS="$SKILLS dio-retrofit"
fi
if echo "$FILE" | grep -qE 'lib/core/utils/result'; then
  SKILLS="$SKILLS error-handling"
fi
if echo "$FILE" | grep -qE 'lib/core/logger/'; then
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

# 배포 스킬 매칭
if echo "$FILE" | grep -qiE 'dockerfile|docker-compose'; then
  SKILLS="$SKILLS deployment-patterns"
fi

if [ -n "$SKILLS" ]; then
  echo "📚 Auto-Skill:$SKILLS → 해당 스킬 규칙 자동 적용" >&2
fi

exit 0
