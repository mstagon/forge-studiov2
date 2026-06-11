#!/bin/bash
# Context Lineage (P1-5): 컨텍스트 압축 전 하네스 상태 스냅샷
# PreCompact 훅에서 호출
#
# Claude Code 의 자동 컴팩션은 일반 요약이라 하네스-특화 상태 (팀 진행,
# inbox, 계약 목록, git 상태) 가 뭉개진다. 여기서 구조화 스냅샷을
# `.claude/compact-state.md` 에 쓰고, stdout 으로 "컴팩션 직후 그 파일을
# Read 하라" 는 지시를 남긴다 (요약기가 명시 지시는 보존하는 경향).
# 새 세션 시작 시에는 forge-lineage-restore.sh 가 같은 파일을 surface.

PROJECT_DIR="${CLAUDE_PROJECT_DIR:-$(cd "$(dirname "$0")/../.." && pwd)}"
STATE_FILE="$PROJECT_DIR/.claude/compact-state.md"
mkdir -p "$(dirname "$STATE_FILE")" 2>/dev/null
TIMESTAMP=$(date "+%Y-%m-%d %H:%M:%S")

cd "$PROJECT_DIR" 2>/dev/null || exit 0

BRANCH=$(git branch --show-current 2>/dev/null || echo "unknown")
# untracked 포함 (-uall) — 새로 만든 파일도 작업 단서다
DIRTY_FILES=$(git status --porcelain -uall 2>/dev/null | grep -v '^.. \.claude/' | awk '{print $2}' | head -20)
STAGED_FILES=$(git diff --cached --name-only 2>/dev/null | head -20)
RECENT_COMMITS=$(git log --oneline -5 2>/dev/null)

# 활성 팀 상태 (archive 안 된 것만) — 멤버별 완료 여부 포함
TEAMS_SECTION=""
if command -v jq >/dev/null 2>&1 && [ -d "$PROJECT_DIR/.claude/teams" ]; then
  for CFG in "$PROJECT_DIR"/.claude/teams/*/config.json; do
    [ -f "$CFG" ] || continue
    ARCHIVED=$(jq -r '.archivedAt // ""' "$CFG" 2>/dev/null)
    [ -n "$ARCHIVED" ] && continue
    TEAMS_SECTION="$TEAMS_SECTION
$(jq -r '"- **\(.name)** (\(.status // "active"), \(.members | length)명): " + ([.members[] | .name + (if .completedAt then "✓" else "…" end)] | join(", "))' "$CFG" 2>/dev/null)"
    # main inbox 의 미읽음 최근 3개
    TEAM_DIR=$(dirname "$CFG")
    if [ -f "$TEAM_DIR/inboxes/main.json" ]; then
      UNREAD=$(jq -r '[.[] | select(.read != true)] | .[-3:] | .[] | "  - [\(.from)] \(.summary // .text | .[0:80])"' "$TEAM_DIR/inboxes/main.json" 2>/dev/null)
      [ -n "$UNREAD" ] && TEAMS_SECTION="$TEAMS_SECTION
$UNREAD"
    fi
  done
fi
[ -z "$TEAMS_SECTION" ] && TEAMS_SECTION="
(활성 팀 없음)"

# 계약 목록 (contract-first)
CONTRACTS=$(ls "$PROJECT_DIR"/contracts/*.contract.md 2>/dev/null | xargs -I{} basename {} | sed 's/^/- /')
[ -z "$CONTRACTS" ] && CONTRACTS="(없음)"

cat > "$STATE_FILE" << EOF
# Compact State — $TIMESTAMP

컴팩션/새 세션 직후 이 파일을 읽었다면: 아래가 압축 직전의 하네스 상태다.
진행 중이던 작업의 단서로 사용하고, 팀이 있으면 \`forge-team list\` 로 현황 재확인.

## Git
- 브랜치: $BRANCH
- 미커밋: $(echo "$DIRTY_FILES" | grep -c . | tr -d ' ')개 / 스테이징: $(echo "$STAGED_FILES" | grep -c . | tr -d ' ')개

### 미커밋 파일
$DIRTY_FILES

### 최근 커밋
$RECENT_COMMITS

## 활성 팀 (멤버 ✓=완료 …=작업중 / main inbox 미읽음)
$TEAMS_SECTION

## contracts/
$CONTRACTS
EOF

# stdout → 컨텍스트 주입. 요약을 살아남을 한 줄 지시.
echo "💾 컴팩션 전 상태 스냅샷 저장됨."
echo "⚠️ 컴팩션 직후 반드시 \`.claude/compact-state.md\` 를 Read 해서 직전 상태 (팀 진행/미커밋/계약) 를 복원할 것."
exit 0
