---
description: Score the current Active watchlist using FMP MCP and WebSearch. No trades — research only.
---

Run an ad-hoc fundamental scoring of the Active watchlist. Useful any time, not just pre-market.

1. `cat memory/WATCHLIST.md` — read active tier names
2. `bash scripts/alpaca.sh account` — current equity context
3. For each Active tier ticker, use FMP MCP to pull: P/E, Fwd P/E, P/B, ROE, D/E, FCF yield, revenue growth YoY
4. Use WebSearch for any recent news on each ticker
5. Score each ticker against conviction tiers (from TRADING-STRATEGY.md)
6. Print a ranked table:

```
Watchlist Scoring — <date>
| Ticker | P/E | Fwd P/E | ROE | D/E | FCF Yield | Conviction | Entry trigger met? |
|--------|-----|---------|-----|-----|-----------|------------|-------------------|
```

7. Flag any HIGH conviction names clearly.
8. No trades, no commits — this is a read-only research tool.
