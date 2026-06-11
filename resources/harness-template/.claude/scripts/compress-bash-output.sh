#!/bin/bash
# compress-bash-output.sh — Headroom 패턴: 출력 폭탄 bash 명령의 토큰 압축
# PreToolUse Bash 훅에서 호출.
#
# 동작: 알려진 "출력 많은" 명령 (npm install, flutter pub get, git log,
# find, grep -r 등) 을 head 150줄 + tail 20줄 압축 파이프로 감싼
# updatedInput JSON 을 반환. 170줄 이하 출력은 원본 그대로 통과하므로
# 작은 출력엔 영향 없음. updatedInput 미지원 런타임이면 필드가 무시되어
# 원본 명령이 그대로 실행됨 (graceful degradation).
#
# 안전 규칙:
#   - 화이트리스트 명령만 wrap — 전부 읽기 전용이거나 하네스 allowedTools
#     에 이미 있는 빌드/조회 명령. (permissionDecision=allow 가 동반되므로
#     화이트리스트 밖 명령은 절대 건드리지 않는다)
#   - heredoc / 백그라운드(&) / 리다이렉션(>) / 멀티라인 / 기존 truncation
#     파이프 (head·tail·wc·grep -c·jq 등) 있으면 skip
#   - find 의 -exec / -delete 는 쓰기 동작이므로 skip
#   - set -o pipefail 로 원 명령 exit code 보존

command -v jq >/dev/null 2>&1 || exit 0

INPUT=$(cat)
CMD=$(printf '%s' "$INPUT" | jq -r '.tool_input.command // empty' 2>/dev/null)
[ -z "$CMD" ] && exit 0

# 멀티라인 명령은 wrap 하지 않음 (구문 분석 위험)
case "$CMD" in
  *$'\n'*) exit 0 ;;
esac

# 위험/특수 구문 skip — heredoc, 백그라운드, 리다이렉션, 세션 제어 명령
case "$CMD" in
  *"<<"*|*"&"|*">"*|*tmux*|*claude*|*codex*|*forge-team*) exit 0 ;;
esac

# 복합 명령 (&&, ||, ;, 파이프) 은 전부 skip — 화이트리스트 prefix 뒤에
# 비허용 명령이 체이닝된 경우 permissionDecision=allow 로 우회되는 것 방지.
# 단순 단일 명령만 wrap 한다.
case "$CMD" in
  *"&&"*|*"||"*|*";"*|*"|"*|*'$('*|*'`'*) exit 0 ;;
esac

# 화이트리스트 — 출력 폭탄 명령만
if ! printf '%s' "$CMD" | grep -qE '^(npm[[:space:]]+(install|ci|ls|audit|run[[:space:]]+build|test)|yarn([[:space:]]+install)?$|pnpm[[:space:]]+install|flutter[[:space:]]+(pub[[:space:]]+get|analyze|test|build)|dart[[:space:]]+(analyze|run[[:space:]]+build_runner)|npx[[:space:]]+prisma[[:space:]]+(generate|migrate)|git[[:space:]]+(log|diff|show|status)|find[[:space:]]|tree([[:space:]]|$)|grep[[:space:]]+-r|ls[[:space:]]+-[a-zA-Z]*R)'; then
  exit 0
fi

# find 의 쓰기 동작 skip
printf '%s' "$CMD" | grep -qE '(-exec|-delete)' && exit 0

# head 150 + tail 20 압축 awk — 170줄 초과분만 접는다
AWK_PROG='NR<=150{print;next}{b[NR%20]=$0;c++}END{if(c<=20){for(i=NR-c+1;i<=NR;i++)print b[i%20]}else{print"";print"··· [forge-compress] 중간 " c-20 "줄 생략 (총 " NR "줄) — 특정 부분이 필요하면 grep/sed 로 좁혀서 재실행 ···";print"";for(i=NR-20+1;i<=NR;i++)print b[i%20]}}'

WRAPPED="set -o pipefail; ( $CMD ) 2>&1 | awk '$AWK_PROG'"

jq -n --arg cmd "$WRAPPED" '{
  hookSpecificOutput: {
    hookEventName: "PreToolUse",
    permissionDecision: "allow",
    permissionDecisionReason: "forge-compress: 출력 압축 wrap (읽기 전용/허용 목록 명령)",
    updatedInput: { command: $cmd }
  }
}'
exit 0
