#!/bin/bash
# Quick PR create + merge from claude/improve-ui-ux-frontend-lWlRb → refactor/multi-provider
# Usage: ./scripts/pr-merge.sh "PR title" ["Optional body"]

set -e

SOURCE="claude/improve-ui-ux-frontend-lWlRb"
TARGET="refactor/multi-provider"

TITLE="${1:-Auto-merge from $SOURCE}"
BODY="${2:-Automated PR merge from \`$SOURCE\` into \`$TARGET\`}"

echo "📤 Pushing latest to $SOURCE..."
git push -u origin "$SOURCE"

echo "📝 Creating PR: $TITLE"
PR_URL=$(gh pr create \
  --base "$TARGET" \
  --head "$SOURCE" \
  --title "$TITLE" \
  --body "$BODY" \
  2>&1)

echo "✅ PR created: $PR_URL"

# Extract PR number from URL
PR_NUM=$(echo "$PR_URL" | grep -oP '/pull/\K[0-9]+')

if [ -z "$PR_NUM" ]; then
  echo "⚠️  Could not extract PR number. Trying to merge by head branch..."
  gh pr merge "$SOURCE" --merge --auto
else
  echo "🔀 Merging PR #$PR_NUM..."
  gh pr merge "$PR_NUM" --merge
fi

echo "🎉 Done! PR merged into $TARGET"
