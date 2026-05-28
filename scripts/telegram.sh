#!/usr/bin/env bash
# Telegram notification wrapper.
# Usage: bash scripts/telegram.sh "<message>"
# Falls back to notifications/TELEGRAM-FALLBACK.md if credentials are unset.

set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
ENV_FILE="$ROOT/.env"
FALLBACK="$ROOT/notifications/TELEGRAM-FALLBACK.md"

if [[ -f "$ENV_FILE" ]]; then
  set -a
  # shellcheck disable=SC1090
  source "$ENV_FILE"
  set +a
fi

if [[ $# -gt 0 ]]; then
  msg="$*"
else
  msg="$(cat)"
fi

if [[ -z "${msg// /}" ]]; then
  echo "usage: bash scripts/telegram.sh \"<message>\"" >&2
  exit 1
fi

stamp="$(date '+%Y-%m-%d %H:%M %Z')"

# Fallback: write locally if Telegram not configured
if [[ -z "${TELEGRAM_BOT_TOKEN:-}" || -z "${TELEGRAM_CHAT_ID:-}" ]]; then
  mkdir -p "$(dirname "$FALLBACK")"
  printf "\n---\n## %s (fallback — Telegram not configured)\n%s\n" "$stamp" "$msg" >> "$FALLBACK"
  echo "[telegram fallback] appended to notifications/TELEGRAM-FALLBACK.md"
  exit 0
fi

# Resolve python binary — try each candidate and verify it actually runs
PYTHON=""
for candidate in python python3; do
  if command -v "$candidate" &>/dev/null && "$candidate" -c "import sys" &>/dev/null 2>&1; then
    PYTHON="$candidate"
    break
  fi
done
if [[ -z "$PYTHON" ]]; then
  echo "ERROR: no working python/python3 found — needed to build Telegram JSON payload" >&2
  exit 1
fi

# Send in chunks to stay under Telegram's 4096-char limit
MAX=4000
total=${#msg}
offset=0

while [[ $offset -lt $total ]]; do
  chunk="${msg:$offset:$MAX}"
  offset=$((offset + MAX))

  payload=$($PYTHON -c "
import json, sys
print(json.dumps({
  'chat_id': sys.argv[1],
  'text': sys.argv[2],
  'parse_mode': 'HTML',
  'disable_web_page_preview': True
}))
" "$TELEGRAM_CHAT_ID" "$chunk")

  response=$(curl -fsS -w "\n%{http_code}" -X POST \
    "https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/sendMessage" \
    -H "Content-Type: application/json" \
    -d "$payload" 2>&1) || {
      echo "ERROR: Telegram request failed. Response: $response" >&2
      exit 1
    }

  http_code=$(echo "$response" | tail -n1)
  body=$(echo "$response" | head -n-1)

  if [[ "$http_code" != "200" ]]; then
    echo "ERROR: Telegram returned HTTP $http_code. Body: $body" >&2
    exit 1
  fi
done

echo "[telegram] sent"
