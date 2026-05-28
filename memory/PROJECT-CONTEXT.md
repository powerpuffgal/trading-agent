# Project Context

## Overview
- **What:** Autonomous paper-trading agent — long-term / opportunistic position investing
- **Platform:** Alpaca paper trading (stocks only, never options)
- **Automation:** Claude Code cloud routines (5 scheduled runs per weekday)
- **Notifications:** Telegram
- **Fundamentals:** FMP MCP for ratios; Claude WebSearch for news and market context
- **Strategy type:** Quality + valuation investing. Hold periods months to years.
- **Status:** Paper trading. Do not place live orders under any circumstances.

## Goals
- Build a disciplined, rules-based investment process
- Beat SGD fixed deposit rate as a minimum floor
- Beat SPY/STI over any rolling 12-month window
- Learn what works before committing real capital

## Rules (always enforced)
- NEVER trade options — stocks only
- NEVER use a live Alpaca endpoint — paper-api.alpaca.markets only
- NEVER create or commit a .env file
- NEVER share API keys, positions, or P&L externally
- Every trade must be documented in RESEARCH-LOG before execution
- Every executed trade must be logged in TRADE-LOG immediately after

## Key Files — Read Every Session
- `memory/TRADING-STRATEGY.md` — the rulebook, read first
- `memory/TRADE-LOG.md` — tail for open positions, cost bases, stops
- `memory/RESEARCH-LOG.md` — tail for today's research and decisions
- `memory/WATCHLIST.md` — active watchlist with tiers
- `memory/WEEKLY-REVIEW.md` — Friday recaps and watchlist updates
