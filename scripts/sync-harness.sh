#!/bin/bash
# Sync harness template from parent project into forge-studio bundle
# Run before packaging: npm run sync-harness

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
STUDIO_DIR="$(dirname "$SCRIPT_DIR")"
HARNESS_ROOT="$(dirname "$STUDIO_DIR")"
TEMPLATE_DIR="$STUDIO_DIR/resources/harness-template"

echo "Syncing harness template..."
echo "  From: $HARNESS_ROOT"
echo "  To:   $TEMPLATE_DIR"

# Clean previous
rm -rf "$TEMPLATE_DIR/.claude" "$TEMPLATE_DIR/CLAUDE.md"

# Copy .claude/ (exclude local settings, temp files, node_modules)
rsync -a --delete \
  --exclude='settings.local.json' \
  --exclude='.pdca-*' \
  --exclude='__pycache__' \
  --exclude='node_modules' \
  "$HARNESS_ROOT/.claude/" "$TEMPLATE_DIR/.claude/"

# Copy CLAUDE.md
cp "$HARNESS_ROOT/CLAUDE.md" "$TEMPLATE_DIR/CLAUDE.md" 2>/dev/null || true

echo "Done. Template contents:"
echo "  .claude/agents:   $(ls "$TEMPLATE_DIR/.claude/agents" 2>/dev/null | wc -l | tr -d ' ') files"
echo "  .claude/skills:   $(ls "$TEMPLATE_DIR/.claude/skills" 2>/dev/null | wc -l | tr -d ' ') dirs"
echo "  .claude/commands: $(ls "$TEMPLATE_DIR/.claude/commands" 2>/dev/null | wc -l | tr -d ' ') files"
echo "  .claude/scripts:  $(ls "$TEMPLATE_DIR/.claude/scripts" 2>/dev/null | wc -l | tr -d ' ') files"
echo "  CLAUDE.md:        $([ -f "$TEMPLATE_DIR/CLAUDE.md" ] && echo 'yes' || echo 'no')"
