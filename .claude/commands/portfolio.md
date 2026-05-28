---
description: Read-only portfolio snapshot — account, positions, open orders, stop headroom
---

Print a clean snapshot. No state changes, no orders, no file writes.

1. `bash scripts/alpaca.sh account`
2. `bash scripts/alpaca.sh positions`
3. `bash scripts/alpaca.sh orders`

Format output as:

```
Portfolio — <today's date>
Equity: $X | Cash: $X (X%) | Buying power: $X
Phase P&L: ±$X (±X%) vs $10,000 starting capital

Positions:
  TICKER | N shares | cost $X.XX | now $X.XX | ±X% | stop at $X (Xcm headroom)

Open orders:
  TYPE | TICKER | qty | details | order_id

No commentary unless: a position has no documented stop, or is within 3% of its -15% hard stop level.
```
