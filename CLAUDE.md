# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## First Action In Every Session

Before doing anything else, read these files:

```bash
cat memory/TRADING-STRATEGY.md
tail -n 80 memory/TRADE-LOG.md
tail -n 60 memory/RESEARCH-LOG.md
cat memory/PROJECT-CONTEXT.md
```

Then inspect current state:

```bash
bash scripts/alpaca.sh account
bash scripts/alpaca.sh positions
bash scripts/alpaca.sh orders
git status --short
```

Never assume strategy, holdings, or watchlist state — always read memory files first.

## Non-Negotiable Safety Rules

- Stocks only. Never trade options.
- Alpaca paper trading only. `ALPACA_ENDPOINT` must contain `paper-api.alpaca.markets`.
- Never print, commit, or expose secret values.
- Never create or commit `.env`; never stage it.
- All Alpaca calls go through `scripts/alpaca.sh` only. Never curl Alpaca directly.
- All Telegram calls go through `scripts/telegram.sh` only.
- Every planned buy must have a dated entry in `memory/RESEARCH-LOG.md` with fundamental support from FMP MCP.
- Every executed trade must be logged in `memory/TRADE-LOG.md`.
- Run a dry-run check (print order JSON + rule validation) before any `scripts/alpaca.sh order` call.
- If FMP MCP is unavailable, mark fundamentals as missing in the research entry and default to HOLD.
- If web search is unavailable, mark news as unverified and default to HOLD.
- Commit only changed tracked memory files after successful workflows; leave `.env` and unrelated files unstaged.

## Architecture

```
scripts/
  alpaca.sh       # Only entry point for all Alpaca broker and data calls
  telegram.sh     # Only entry point for all Telegram notifications

memory/           # Persistent operating ledger — committed to git after every workflow
  TRADING-STRATEGY.md   # The rulebook. Every workflow reads this first.
  TRADE-LOG.md          # Every trade + daily EOD snapshot
  RESEARCH-LOG.md       # One dated entry per research session
  WEEKLY-REVIEW.md      # Friday recaps
  PROJECT-CONTEXT.md    # Static background, mission, capital

routines/         # Cloud routine prompts (paste verbatim into Claude Code routine UI)
  pre-market.md
  market-open.md
  midday.md
  daily-summary.md
  weekly-review.md

.claude/commands/ # Local ad-hoc slash commands
  portfolio.md
  trade.md
  pre-market.md
  market-open.md
  midday.md
  daily-summary.md
  weekly-review.md
```

**AI role:** research, fundamental interpretation via FMP MCP, writing structured memory.
**Script role:** all Alpaca and Telegram calls. The AI never curls APIs directly.
**FMP MCP:** used in pre-market to pull ratios (P/E, forward P/E, P/B, ROE, debt/equity, FCF yield, revenue growth). If unavailable, mark fundamentals missing and hold.

## Strategy Summary (Long-Term / Opportunistic Position Investing)

Hold periods are months to years, but the system actively surfaces high-conviction opportunities — dips in quality names, valuation dislocations, post-earnings overreactions — and pushes them for execution. The goal is to be patient on mediocre setups and fast on compelling ones.

**Entry criteria (all must pass):**
- Business quality: ROE > 15%, net margin > 10%, manageable debt (D/E < 1.5x for non-financials)
- Valuation: P/E reasonable for sector, P/B not stretched, PEG < 2
- Specific entry reason: dip from a known level, post-earnings panic, sector rotation creating a window — not just "good company at any price"
- Sector not in structural decline
- Position cost ≤ 15% of equity per new position; total positions ≤ 12; available cash covers the buy

**Conviction tiers — how aggressively to push:**
- **High conviction** (Telegram alert fires immediately): all quality metrics pass AND valuation is at a clear multi-year low (P/E at or below 3-year low, or a post-earnings panic with no fundamental deterioration). This should trigger at most 1-2 times per month — if it's firing more often, the criteria are too loose.
- **Medium conviction** (logged in research, included in weekly digest only): quality passes, valuation reasonable but not cheap, worth accumulating context over weeks
- **Low conviction** (watchlist only, no Telegram): good business but fairly or richly valued — wait for a better entry

The pre-market routine scores every active watchlist name daily but sends a Telegram alert only for genuine high-conviction dislocations. **Most days should produce zero alerts.** A week with no alerts is a good week — it means the market hasn't handed us anything exceptional.

**Scaling in:**
- Adding to an existing position on a meaningful dip (> 7% from last buy, fundamentals unchanged) is allowed if the position would remain ≤ 15% of equity after the add

**Trimming — let winners run:**
- Do NOT trim just because a position is up 20-30%. Quality compounders look expensive for years while continuing to compound.
- Only consider trimming when ALL THREE of the following are true simultaneously:
  1. Valuation has stretched to 2x or more above the stock's own 5-year average P/E
  2. Revenue or earnings growth is visibly decelerating (not just a single bad quarter)
  3. A clearly cheaper, equally high-quality alternative exists in the watchlist
- If you can't name the specific stock you'd swap into, don't trim.

**Exit criteria:**
- Thesis has broken: business deterioration, fraud, major guidance cut, regulatory kill — sell regardless of price
- Hard stop: -15% from cost basis, evaluated at weekly review and at midday on crash days
- Valuation swap: stretched valuation + growth deceleration + better alternative (all three, per trimming rule above)

**What does NOT trigger a sell:**
- Stock up 20%, 30%, 50% — price appreciation is not a sell signal for a quality business
- Normal volatility (5-15% swings)
- Broad market down days without stock-specific news
- Sector rotation noise

**Position management:**
- No trailing stops as GTC orders — they shake out long-term positions on noise
- Hard stops and trim triggers are evaluated at weekly review and flagged via Telegram; execution is manual or via the market-open routine
- Re-evaluate full thesis monthly; check price vs fair value weekly

## Wrapper Scripts

### scripts/alpaca.sh

```bash
bash scripts/alpaca.sh account          # equity, cash, buying_power
bash scripts/alpaca.sh positions        # all open positions with unrealized P&L
bash scripts/alpaca.sh position SYM     # single position
bash scripts/alpaca.sh quote SYM        # latest bid/ask
bash scripts/alpaca.sh orders [status]  # default status=open
bash scripts/alpaca.sh order '<json>'   # POST new order
bash scripts/alpaca.sh cancel ORDER_ID
bash scripts/alpaca.sh cancel-all
bash scripts/alpaca.sh close SYM        # market-sell entire position
bash scripts/alpaca.sh close-all
```

Order shapes used by this strategy:

```json
// Market buy
{"symbol":"AAPL","qty":"10","side":"buy","type":"market","time_in_force":"day"}

// Market sell (full exit on thesis break or -15% stop)
{"symbol":"AAPL","qty":"10","side":"sell","type":"market","time_in_force":"day"}
```

No trailing stops. No GTC stop orders. Exits are deliberate and logged.

Alpaca gotchas:
- `qty` is a string, not a number.
- Market data uses `data.alpaca.markets`; trading uses `api.alpaca.markets`. The wrapper handles this.
- Timestamps are UTC. Routines use America/New_York.
- PDT rule: 3 day trades per 5 rolling business days on accounts under $25k. Long-term holds rarely trigger this, but check `daytrade_count` before any same-day sell.

### scripts/telegram.sh

```bash
bash scripts/telegram.sh "<message>"    # send message to configured TELEGRAM_CHAT_ID
```

If `TELEGRAM_BOT_TOKEN` or `TELEGRAM_CHAT_ID` is unset, appends to `notifications/TELEGRAM-FALLBACK.md` and exits 0.

Notification rules (designed to stay signal, not noise):
- Pre-market: send only if a genuine high-conviction opportunity is found (rare — aim for ≤ 2/month) or a held position has urgent negative news / crashes > 5% pre-market; silent otherwise
- Market-open: send only if a trade was placed
- Midday: send only if a position hits -15% or thesis breaks intraday; otherwise silent
- Daily summary: always sends, ≤ 15 lines — this is the one predictable daily ping
- Weekly review: always sends — ranked watchlist with conviction scores, any trim candidates meeting all three criteria, performance vs benchmark

## FMP MCP Usage

In the pre-market workflow, use the FMP MCP to pull fundamentals for watchlist names and current holdings. Key ratios to fetch per ticker:
- P/E (trailing), Forward P/E
- P/B ratio
- ROE, net margin
- Debt/Equity
- Free cash flow yield
- Revenue growth (YoY)
- Dividend yield (if any)

If FMP MCP returns an error or is unavailable:
1. Note "FMP unavailable — fundamentals not verified" in the research entry.
2. Do not invent ratios.
3. Default to HOLD for any buy decisions that day.

## Workflow Overview

### Pre-market (06:00 Mon-Fri ET)
1. Read strategy + tail of trade log + tail of research log.
2. Pull live account state (`account`, `positions`, `orders`).
3. Use FMP MCP to pull ratios for all held tickers and active watchlist names — score each against conviction tier criteria.
4. Use WebSearch for: broad market tone, VIX, earnings today, any breaking news on held tickers or watchlist names.
5. Write dated entry to `memory/RESEARCH-LOG.md`: account snapshot, fundamental table with conviction scores, news summary, thesis check on held positions, decisions.
6. Send a Telegram alert **only if** a name scores high conviction (all quality gates pass + valuation at multi-year low) or a held position has urgent negative news / is down > 5% pre-market. On a normal day, send nothing.
7. `git add memory/RESEARCH-LOG.md && git commit -m "pre-market research YYYY-MM-DD" && git push origin main`

### Market-open (09:45 Mon-Fri ET)
1. Read today's research log entry. If missing, run pre-market steps inline first.
2. Re-validate with fresh quotes (`bash scripts/alpaca.sh quote SYM`).
3. Run entry gate on each approved buy: positions ≤ 12, cost ≤ 15% equity, cash covers it, thesis documented.
4. For each approved trade: print order JSON, confirm gate passes, then execute.
5. Log every trade to `memory/TRADE-LOG.md` with thesis, entry price, target, and thesis-break exit condition.
6. Notify via Telegram only if a trade was placed.
7. Commit and push `memory/TRADE-LOG.md` if it changed.

### Midday (12:00 Mon-Fri ET)
Read-only unless a position is at or below -15% or thesis has clearly broken intraday.
- If -15% breach: close position, cancel any open orders for that ticker, log exit.
- If thesis broke intraday (e.g., fraud allegations, major guidance cut): close, log, notify.
- Otherwise: no action, no commit.

### Daily summary (16:15 Mon-Fri ET)
1. Pull final account state.
2. Compute: day P&L, phase-to-date P&L, positions table.
3. Append EOD snapshot to `memory/TRADE-LOG.md`.
4. Send one Telegram message (always, even no-trade days), ≤ 15 lines.
5. Commit and push (mandatory — tomorrow's P&L math depends on it).

### Weekly review (16:30 Friday ET)
1. Read full week of trade log, research log, strategy doc.
2. Pull Friday close account state.
3. Compute: week return vs S&P 500 (via WebSearch), W/L counts, best/worst position.
4. Re-evaluate each held position's thesis and stop level (-15% from cost basis, not current price).
5. Check watchlist: any new names ready to add based on FMP ratios?
6. Append full review to `memory/WEEKLY-REVIEW.md`. Update `memory/TRADING-STRATEGY.md` only if a rule has clearly proven or failed over 2+ weeks.
7. Send one Telegram message with headline numbers.
8. Commit and push.

## Cloud Routine Setup (Claude Code)

Five routines in the Claude Code web UI. Each routine:
- Links to the GitHub repo (requires Claude GitHub App installed on the repo)
- Has "Allow unrestricted branch pushes" toggled ON (without this, `git push` silently fails)
- Has env vars set directly on the routine (not in a `.env` file)
- Uses verbatim prompt from `routines/<name>.md`

Required env vars on every routine:
```
ALPACA_API_KEY
ALPACA_SECRET_KEY
ALPACA_ENDPOINT=https://paper-api.alpaca.markets/v2
ALPACA_DATA_ENDPOINT=https://data.alpaca.markets/v2
TELEGRAM_BOT_TOKEN
TELEGRAM_CHAT_ID
FMP_API_KEY          # for FMP MCP server, if self-hosted MCP
```

Cron schedules (America/New_York):
```
Pre-market:     0  6  * * 1-5
Market-open:   45  9  * * 1-5
Midday:         0 12  * * 1-5
Daily summary: 15 16  * * 1-5
Weekly review: 30 16  * * 5
```

**Critical:** Each cloud run is a fresh clone. File changes vanish unless committed and pushed before the run exits. Every routine prompt must end with `git add ... && git commit -m "..." && git push origin main`. On push failure from divergence: `git pull --rebase origin main` then push again. Never force-push.

## Environment Setup (Local)

```bash
cp env.template .env
chmod 600 .env
```

`.env` keys:
- `ALPACA_ENDPOINT=https://paper-api.alpaca.markets/v2`
- `ALPACA_DATA_ENDPOINT=https://data.alpaca.markets/v2`
- `ALPACA_API_KEY` / `ALPACA_SECRET_KEY` — paper keys only
- `TELEGRAM_BOT_TOKEN` / `TELEGRAM_CHAT_ID` — fallback writes to `notifications/TELEGRAM-FALLBACK.md`

Verify `.env` is ignored after editing:
```bash
git status --short --ignored
```
If `.env` appears staged or tracked, stop and fix before continuing.

## Memory File Formats

**TRADE-LOG.md** — one entry per trade, plus daily EOD snapshots:
```
## YYYY-MM-DD — Buy TICKER
- Entry: $X.XX | Shares: N | Cost basis: $X
- Thesis: [specific reason]
- Thesis-break exit: [what would invalidate the thesis]
- Target: $X (12-month estimate) | Hard stop: $X (-15% from entry)

## YYYY-MM-DD — EOD Snapshot (Day N)
**Portfolio:** $X | **Cash:** $X (X%) | **Day P&L:** ±$X (±X%) | **Phase P&L:** ±$X (±X%)
| Ticker | Shares | Cost | Price | Unrealized P&L | vs Stop |
**Notes:** one-paragraph summary.
```

**RESEARCH-LOG.md** — one dated entry per pre-market session:
```
## YYYY-MM-DD — Pre-market Research
### Account Snapshot
### FMP Fundamentals + Conviction Score
| Ticker | P/E | Fwd P/E | P/B | ROE | D/E | FCF Yield | Rev Growth | Conviction |
(Conviction: HIGH / MEDIUM / LOW / WATCH)
### Market Context (WebSearch)
### Thesis Check — Held Positions
### High-Conviction Alerts (sent to Telegram)
### Decisions: [TICKER — action — reason] or HOLD
```

## Common Failure Modes

| Failure | Response |
|---|---|
| Live Alpaca endpoint | Stop immediately; set paper endpoint |
| Missing Alpaca credentials | Stop; help fill `.env`; do not trade |
| FMP MCP unavailable | Mark fundamentals missing; default HOLD |
| WebSearch unavailable | Mark news unverified; default HOLD |
| Telegram unconfigured | Use `notifications/TELEGRAM-FALLBACK.md` |
| Dirty worktree before cloud run | Cloud runner refuses; investigate before retrying |
| Push fails (non-fast-forward) | `git pull --rebase origin main` then retry |
| Position at -15% | Close, log exit, notify — don't hope it recovers |
| Thesis broken but < -15% | Close anyway; log reason clearly |
