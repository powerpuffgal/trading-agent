---
description: Manual trade helper with full strategy-rule validation. Usage — /trade SYMBOL SHARES buy|sell
---

Execute a manual trade with complete rule validation. Refuse if any rule fails. Ask for missing args.

Args: SYMBOL SHARES SIDE (buy or sell). If missing, ask before proceeding.

1. Pull state:
   ```
   bash scripts/alpaca.sh account
   bash scripts/alpaca.sh positions
   bash scripts/alpaca.sh quote SYMBOL
   ```
   Capture ask price P.

2. For BUY, validate all of the following — stop and list failures if any check fails:
   - Total positions after fill ≤ 12
   - SHARES × P ≤ 15% of current equity
   - SHARES × P ≤ available cash, leaving ≥ 10% cash reserve
   - daytrade_count leaves room (< 3 same-day round trips)
   - A specific catalyst / thesis is documented in today's RESEARCH-LOG entry — if not, ask for it now and write it to RESEARCH-LOG before proceeding
   - Ticker is a stock (not an option)

3. For SELL, confirm:
   - Position exists with sufficient quantity
   - State the reason: thesis-break, hard stop, or trim (and if trim, confirm all 3 trim conditions are met)

4. Print the proposed order JSON and all validation results. Ask "Execute? (y/n)" — wait for confirmation.

5. On confirm:
   ```
   bash scripts/alpaca.sh order '{"symbol":"SYMBOL","qty":"N","side":"buy|sell","type":"market","time_in_force":"day"}'
   ```

6. Append to memory/TRADE-LOG.md with full thesis, entry/exit price, stop level, fair value estimate.

7. `bash scripts/telegram.sh "✅ MANUAL TRADE: [details]"`

8. `git add memory/TRADE-LOG.md memory/RESEARCH-LOG.md && git commit -m "manual trade SYMBOL $(date +%Y-%m-%d)" && git push origin main`
