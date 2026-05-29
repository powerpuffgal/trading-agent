#!/usr/bin/env bash
# Telegram bot dispatcher — polls for incoming slash commands and responds.
#
# Run once (call at start of each routine to flush any pending commands):
#   bash scripts/bot.sh
#
# Run in loop locally for real-time responses (Ctrl-C to stop):
#   bash scripts/bot.sh --loop [--interval=10]
#
# All trade execution, Alpaca calls, and logging happen inside bot.js.
# This script is the ONLY entry point for the bot.

set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
node "$ROOT/scripts/bot.js" "$@"
