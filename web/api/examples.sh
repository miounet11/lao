#!/usr/bin/env bash
set -euo pipefail

BASE_URL="http://127.0.0.1:19824"

echo "== status =="
curl -s "${BASE_URL}/status"

echo
echo "== snapshot =="
curl -s "${BASE_URL}/command" \
  -H "Content-Type: application/json" \
  -d '{"id":"demo-snapshot","action":"snapshot"}'

echo
echo "== open =="
curl -s "${BASE_URL}/command" \
  -H "Content-Type: application/json" \
  -d '{"id":"demo-open","action":"open","url":"https://example.com"}'
