# Bot Listener Routine

Polls Telegram for slash commands and responds. Run every 5 minutes during market hours.

## Cron schedule (America/New_York)
```
*/5 9-17 * * 1-5
```

## Steps

1. Read environment and confirm paper endpoint:
```bash
source .env 2>/dev/null || true
echo "Endpoint: $ALPACA_ENDPOINT"
echo "Bot: $TELEGRAM_BOT_TOKEN" | head -c 20
```

2. Run one poll cycle — process any pending slash commands and respond:
```bash
bash scripts/bot.sh
```

That's it. The bot handles everything: routing, Alpaca calls, trade execution on /alloc, Telegram responses.

3. If git state changed (trade log updated by /alloc), commit:
```bash
git diff --quiet || (git add memory/ && git commit -m "bot: command response $(date +%Y-%m-%d)" && git push origin main)
```

## Notes
- No user interaction needed — runs autonomously.
- The bot reads memory/PENDING-ALLOCATION.json for /alloc commands.
- Trade execution on /alloc writes to memory/TRADE-LOG.md and commits.
- If Telegram is unconfigured, bot exits silently (no error).
