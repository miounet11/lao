#!/usr/bin/env bash
set -euo pipefail

APP_NAME="iatlas-browser"
APP_HOME="${HOME}/.iatlas-browser"
SRC_DIR="${APP_HOME}/src"
BIN_DIR="${HOME}/.local/bin"
REPO_URL="https://github.com/miounet11/lao.git"

need_cmd() {
  command -v "$1" >/dev/null 2>&1 || {
    echo "Missing required command: $1" >&2
    exit 1
  }
}

need_cmd git
need_cmd node
need_cmd corepack

mkdir -p "${APP_HOME}"
mkdir -p "${BIN_DIR}"

if [ -d "${SRC_DIR}/.git" ]; then
  git -C "${SRC_DIR}" fetch origin main --depth=1
  git -C "${SRC_DIR}" checkout main
  git -C "${SRC_DIR}" reset --hard origin/main
else
  git clone "${REPO_URL}" "${SRC_DIR}"
fi

corepack enable >/dev/null 2>&1 || true
corepack prepare pnpm@9.15.0 --activate >/dev/null 2>&1 || true

cd "${SRC_DIR}"
pnpm install --frozen-lockfile
pnpm build

ln -sf "${SRC_DIR}/dist/cli.js" "${BIN_DIR}/iatlas-browser"
ln -sf "${SRC_DIR}/dist/mcp.js" "${BIN_DIR}/iatlas-browser-mcp"

node "${SRC_DIR}/dist/cli.js" setup

echo
echo "Install complete."
echo "Binary path: ${BIN_DIR}/iatlas-browser"
echo "If ${BIN_DIR} is not in PATH, add this line to your shell profile:"
echo "  export PATH=\"${BIN_DIR}:\$PATH\""
