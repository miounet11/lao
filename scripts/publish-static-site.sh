#!/usr/bin/env bash
set -euo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
TARGET_DIR="${TARGET_DIR:-/srv/miaoda.vip}"
PUBLISH_DATE="${PUBLISH_DATE:-}"

cd "$REPO_ROOT"

if [[ -n "$PUBLISH_DATE" ]]; then
  PUBLISH_DATE="$PUBLISH_DATE" node scripts/generate-seo-content.mjs
else
  node scripts/generate-seo-content.mjs
fi

rsync -az --delete "$REPO_ROOT/web/" "$TARGET_DIR/"
