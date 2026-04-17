#!/bin/bash
# tmux auto-dev: dev 서버 커맨드를 tmux 세션으로 자동 전환
# PreToolUse Bash 에서 호출
# flutter run, nest start --watch, npm run dev 등을 가로채서 tmux에서 실행

CMD=$(jq -r '.tool_input.command // empty' 2>/dev/null)
[ -z "$CMD" ] && exit 0

# dev 서버 패턴 매칭
IS_DEV=0
case "$CMD" in
  *"flutter run"*) IS_DEV=1; SESSION_NAME="flutter-dev" ;;
  *"nest start"*|*"nest start --watch"*) IS_DEV=1; SESSION_NAME="nest-dev" ;;
  *"npm run dev"*|*"npm run start:dev"*) IS_DEV=1; SESSION_NAME="npm-dev" ;;
  *"npx next dev"*) IS_DEV=1; SESSION_NAME="next-dev" ;;
esac

[ "$IS_DEV" -eq 0 ] && exit 0

# tmux 없으면 스킵
if ! command -v tmux &>/dev/null; then
  echo "⚠️ tmux 미설치 — dev 서버가 Claude 세션을 블록할 수 있음" >&2
  exit 0
fi

# 이미 실행 중인 세션이 있으면 알림만
if tmux has-session -t "$SESSION_NAME" 2>/dev/null; then
  echo "ℹ️ tmux 세션 '$SESSION_NAME' 이미 실행 중" >&2
  echo "  → tmux attach -t $SESSION_NAME 으로 확인" >&2
  echo "  → tmux kill-session -t $SESSION_NAME 으로 종료" >&2
  exit 0
fi

# 새 tmux 세션에서 dev 서버 실행
PROJECT_DIR=$(pwd)
echo "🖥️ tmux 세션 '$SESSION_NAME'에서 dev 서버 시작:" >&2
echo "  → $CMD" >&2
echo "  → tmux attach -t $SESSION_NAME 으로 로그 확인" >&2
echo "  → tmux kill-session -t $SESSION_NAME 으로 종료" >&2

tmux new-session -d -s "$SESSION_NAME" -c "$PROJECT_DIR" "$CMD"
exit 0
