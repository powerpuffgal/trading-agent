#!/usr/bin/env node
/**
 * scripts/bot.js — Two-way Telegram bot dispatcher for the trading agent.
 *
 * Run once (called by each routine to flush pending commands):
 *   node scripts/bot.js
 *
 * Run in loop locally (real-time slash-command responses):
 *   node scripts/bot.js --loop [--interval=10]
 *
 * Slash commands handled:
 *   /status        — market clock & bot health
 *   /portfolio     — equity, cash, all positions with P&L and stops
 *   /positions     — open positions table
 *   /orders        — open orders
 *   /risk          — stop levels, position limits, cash reserve
 *   /alloc A|B|C   — approve pending pre-market allocation and execute trades
 *   /help          — list commands
 */

'use strict';

const https  = require('https');
const { execSync } = require('child_process');
const fs     = require('fs');
const path   = require('path');

// ── environment ───────────────────────────────────────────────────────────────

const ROOT = path.resolve(__dirname, '..');

// Load .env (key=value, one per line, supports quoted values)
try {
  fs.readFileSync(path.join(ROOT, '.env'), 'utf8')
    .split(/\r?\n/)
    .forEach(line => {
      const m = line.match(/^([A-Z_][A-Z0-9_]*)=(.*)$/);
      if (m && !process.env[m[1]]) {
        process.env[m[1]] = m[2].replace(/^["']|["']$/g, '').trim();
      }
    });
} catch (_) {}

const TOKEN   = process.env.TELEGRAM_BOT_TOKEN || '';
const CHAT_ID = String(process.env.TELEGRAM_CHAT_ID || '');

const OFFSET_FILE = path.join(ROOT, 'memory', '.bot_offset');
const ALLOC_FILE  = path.join(ROOT, 'memory', 'PENDING-ALLOCATION.json');
const TRADELOG    = path.join(ROOT, 'memory', 'TRADE-LOG.md');

// ── low-level helpers ─────────────────────────────────────────────────────────

function httpsGet(url) {
  return new Promise((resolve, reject) => {
    https.get(url, res => {
      let d = '';
      res.on('data', c => d += c);
      res.on('end', () => { try { resolve(JSON.parse(d)); } catch(e) { reject(e); } });
    }).on('error', reject);
  });
}

function httpsPost(url, body) {
  return new Promise((resolve, reject) => {
    const data = JSON.stringify(body);
    const u = new URL(url);
    const req = https.request({
      hostname: u.hostname, path: u.pathname,
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(data) }
    }, res => {
      let d = '';
      res.on('data', c => d += c);
      res.on('end', () => { try { resolve(JSON.parse(d)); } catch(e) { reject(e); } });
    });
    req.on('error', reject);
    req.write(data);
    req.end();
  });
}

function tgSend(text) {
  if (!TOKEN || !CHAT_ID) { console.log('[bot] Telegram not configured — would send:\n' + text); return; }
  return httpsPost(`https://api.telegram.org/bot${TOKEN}/sendMessage`, {
    chat_id: CHAT_ID, text, parse_mode: 'HTML', disable_web_page_preview: true
  }).catch(e => console.error('[bot] send error:', e.message));
}

function getOffset() {
  try { return parseInt(fs.readFileSync(OFFSET_FILE, 'utf8')) || 0; } catch { return 0; }
}
function setOffset(n) { fs.writeFileSync(OFFSET_FILE, String(n)); }

// Alpaca via wrapper script — never curl directly
function alpaca(cmd) {
  try {
    // Use forward slashes for bash compatibility on Windows
    const sh = path.join(ROOT, 'scripts', 'alpaca.sh').replace(/\\/g, '/');
    return execSync(`bash "${sh}" ${cmd}`, { encoding: 'utf8', cwd: ROOT, stderr: 'pipe' });
  } catch (e) {
    return '[]';
  }
}

function fmt$(n) { return '$' + parseFloat(n).toFixed(2); }
function fmtPct(n) { const v = (parseFloat(n)*100).toFixed(1); return (v >= 0 ? '+' : '') + v + '%'; }

// ── command handlers ──────────────────────────────────────────────────────────

async function cmdStatus() {
  const acc = JSON.parse(alpaca('account'));
  const orders = JSON.parse(alpaca('orders') || '[]');
  const now = new Date().toLocaleString('en-US', { timeZone: 'America/New_York', hour12: false });
  const hasPending = fs.existsSync(ALLOC_FILE) &&
    JSON.parse(fs.readFileSync(ALLOC_FILE, 'utf8')).status === 'pending';

  return `⚙️ <b>Bot Status</b>
Bot: 🟢 @moneya01_bot running
Time (ET): ${now}
Account: ${acc.status || 'ACTIVE'} | DT count: ${acc.daytrade_count || 0}/3
Open orders: ${orders.length}
Pending allocation: ${hasPending ? '⏳ awaiting /alloc A|B|C' : 'none'}`;
}

async function cmdPortfolio() {
  const acc = JSON.parse(alpaca('account'));
  const pos = JSON.parse(alpaca('positions') || '[]');
  const eq   = parseFloat(acc.equity);
  const cash = parseFloat(acc.cash);
  const pnl  = eq - parseFloat(acc.last_equity);

  let msg = `💼 <b>Portfolio</b>
Equity: ${fmt$(eq)} | Cash: ${fmt$(cash)} (${(cash/eq*100).toFixed(1)}%)
Day P&amp;L: ${pnl >= 0 ? '+' : ''}${fmt$(pnl)} (${fmtPct(pnl/parseFloat(acc.last_equity))})
Positions: ${pos.length}/12 | Day trades: ${acc.daytrade_count || 0}/3\n`;

  if (!pos.length) {
    msg += '\nNo open positions.';
  } else {
    msg += '\n<b>Positions:</b>\n';
    pos.forEach(p => {
      const entry  = parseFloat(p.avg_entry_price);
      const curr   = parseFloat(p.current_price);
      const pl     = parseFloat(p.unrealized_pl);
      const plPct  = parseFloat(p.unrealized_plpc) * 100;
      const stop   = (entry * 0.85).toFixed(2);
      const icon   = pl >= 0 ? '✅' : '🔴';
      const stopOk = curr > entry * 0.85;
      msg += `${icon} <b>${p.symbol}</b> ${p.qty}sh @ ${fmt$(entry)}`;
      msg += ` → ${fmt$(curr)} (${plPct >= 0 ? '+' : ''}${plPct.toFixed(1)}%)`;
      msg += ` | Stop: ${fmt$(stop)} ${stopOk ? '✅' : '🚨'}\n`;
    });
  }
  return msg;
}

async function cmdPositions() {
  const pos = JSON.parse(alpaca('positions') || '[]');
  if (!pos.length) return '📊 No open positions.';

  let msg = '📊 <b>Open Positions</b>\n\n';
  pos.forEach(p => {
    const entry = parseFloat(p.avg_entry_price);
    const curr  = parseFloat(p.current_price);
    const pl    = parseFloat(p.unrealized_pl);
    const plPct = (parseFloat(p.unrealized_plpc)*100).toFixed(1);
    const stop  = (entry * 0.85).toFixed(2);
    const icon  = pl >= 0 ? '✅' : (curr <= entry*0.85 ? '🚨' : '🔴');
    msg += `${icon} <b>${p.symbol}</b>: ${p.qty}sh\n`;
    msg += `   ${fmt$(entry)} → ${fmt$(curr)} | P&amp;L: ${pl >= 0 ? '+' : ''}${fmt$(pl)} (${plPct}%)\n`;
    msg += `   Hard stop: ${fmt$(stop)}\n`;
  });
  return msg;
}

async function cmdOrders() {
  const orders = JSON.parse(alpaca('orders') || '[]');
  if (!orders.length) return '📋 No open orders.';

  let msg = '📋 <b>Open Orders</b>\n\n';
  orders.forEach(o => {
    msg += `${o.side.toUpperCase()} ${o.qty} <b>${o.symbol}</b> @ ${o.type} | ${o.status}\n`;
  });
  return msg;
}

async function cmdRisk() {
  const acc = JSON.parse(alpaca('account'));
  const pos = JSON.parse(alpaca('positions') || '[]');
  const eq   = parseFloat(acc.equity);
  const cash = parseFloat(acc.cash);
  const cashPct = cash / eq;

  let msg = `🛡️ <b>Risk Snapshot</b>
Equity: ${fmt$(eq)}
Cash: ${fmt$(cash)} (${(cashPct*100).toFixed(1)}%) ${cashPct >= 0.10 ? '✅' : '⚠️ BELOW 10% FLOOR'}
Positions: ${pos.length}/12 ${pos.length < 12 ? '✅' : '⚠️ AT LIMIT'}
Day trades: ${acc.daytrade_count || 0}/3\n`;

  if (pos.length) {
    msg += '\n<b>Stop levels (-15% from entry):</b>\n';
    pos.forEach(p => {
      const entry  = parseFloat(p.avg_entry_price);
      const curr   = parseFloat(p.current_price);
      const stop   = entry * 0.85;
      const vsStop = ((curr - stop) / stop * 100).toFixed(1);
      const pct    = ((curr - entry) / entry * 100).toFixed(1);
      let flag;
      if (curr <= stop)       flag = '🚨 BELOW STOP — review immediately';
      else if (curr <= stop * 1.05) flag = '⚠️ within 5% of stop';
      else                    flag = '✅ OK';
      msg += `<b>${p.symbol}</b>: entry ${fmt$(entry)}, stop ${fmt$(stop)}, now ${fmt$(curr)} (${pct >= 0 ? '+' : ''}${pct}%) ${flag}\n`;
    });
  }
  return msg;
}

async function cmdAlloc(arg) {
  const choice = arg.trim().toUpperCase();
  if (!['A','B','C'].includes(choice)) {
    return '❌ Usage: /alloc A, /alloc B, or /alloc C';
  }

  if (!fs.existsSync(ALLOC_FILE)) {
    return '❌ No pending allocation on file. Pre-market routine has not sent proposals today.';
  }

  const alloc = JSON.parse(fs.readFileSync(ALLOC_FILE, 'utf8'));

  if (alloc.status === 'approved') {
    return `⚠️ Already approved: Option ${alloc.chosen} at ${alloc.approved_at}.\nUse /positions to check fills.`;
  }
  if (alloc.status === 'expired') {
    return `❌ Deadline passed. Default ${alloc.default} was applied.`;
  }

  const now = new Date();
  if (new Date(alloc.expires_at) < now) {
    alloc.status = 'expired';
    fs.writeFileSync(ALLOC_FILE, JSON.stringify(alloc, null, 2));
    return `❌ Deadline ${alloc.expires_at} has passed. Default was ${alloc.default}.`;
  }

  const option = alloc.options[choice];
  if (!option) return `❌ Option ${choice} not defined in pending allocation.`;

  // Record approval
  alloc.status    = 'approved';
  alloc.chosen    = choice;
  alloc.approved_at = now.toISOString();
  fs.writeFileSync(ALLOC_FILE, JSON.stringify(alloc, null, 2));

  if (!option.trades || !option.trades.length) {
    return `✅ <b>Option ${choice} approved</b>: ${option.label}\n\nNo trades to execute (conservative hold).`;
  }

  let msg = `✅ <b>Option ${choice} approved</b>: ${option.label}\n\nExecuting ${option.trades.length} order(s)...\n`;
  const today = now.toISOString().slice(0, 10);
  let tradeLogEntries = '';

  for (const trade of option.trades) {
    const orderJson = JSON.stringify(trade);
    let orderResult;
    try {
      const sh = path.join(ROOT, 'scripts', 'alpaca.sh').replace(/\\/g, '/');
      const raw = execSync(`bash "${sh}" order '${orderJson}'`, { encoding: 'utf8', cwd: ROOT, stderr: 'pipe' });
      // alpaca.sh prints "ORDER (paper): {...}" then the response JSON on the next line
      const jsonLine = raw.split('\n').find(l => l.startsWith('{'));
      orderResult = jsonLine ? JSON.parse(jsonLine) : {};
      msg += `✅ ${trade.side.toUpperCase()} ${trade.qty} <b>${trade.symbol}</b> — submitted (id: ${(orderResult.id || '?').slice(0,8)}...)\n`;

      // Build trade log entry (price will be confirmed by daily summary)
      const estPrice = option.est_prices?.[trade.symbol] || 'market';
      const estCost  = option.est_prices?.[trade.symbol]
        ? (option.est_prices[trade.symbol] * parseInt(trade.qty)).toFixed(2)
        : 'TBD';
      const thesis   = option.theses?.[trade.symbol] || option.label;
      const tbExit   = option.thesis_breaks?.[trade.symbol] || 'see RESEARCH-LOG';
      const fv       = option.fair_values?.[trade.symbol] || 'TBD';
      const estStop  = option.est_prices?.[trade.symbol]
        ? (option.est_prices[trade.symbol] * 0.85).toFixed(2)
        : 'TBD';

      tradeLogEntries += `\n## ${today} — ${trade.side.toUpperCase()} ${trade.symbol} (via /alloc ${choice})\n`;
      tradeLogEntries += `- Entry: ~${fmt$(estPrice)} | Shares: ${trade.qty} | Est. cost basis: $${estCost}\n`;
      tradeLogEntries += `- Thesis: ${thesis}\n`;
      tradeLogEntries += `- Thesis-break exit: ${tbExit}\n`;
      tradeLogEntries += `- Fair value: ${fmt$(fv)} (12-month) | Hard stop: ~${fmt$(estStop)} (-15% from entry)\n`;
    } catch (e) {
      msg += `❌ ${trade.symbol} failed: ${e.message.slice(0, 120)}\n`;
    }
  }

  // Append to TRADE-LOG.md
  if (tradeLogEntries) {
    try {
      fs.appendFileSync(TRADELOG, tradeLogEntries + '\n---\n');
    } catch (e) {
      console.error('[bot] Could not write trade log:', e.message);
    }
  }

  // Git commit and push
  try {
    const sh = path.join(ROOT, 'scripts', 'alpaca.sh').replace(/\\/g, '/');
    execSync(
      `git add memory/TRADE-LOG.md memory/PENDING-ALLOCATION.json && ` +
      `git commit -m "bot /alloc ${choice}: ${option.trades.map(t=>t.symbol).join('+')} ${today}" && ` +
      `git push origin main`,
      { cwd: ROOT, encoding: 'utf8', stderr: 'pipe' }
    );
    msg += '\n📝 Trade log committed and pushed.';
  } catch (e) {
    msg += '\n⚠️ Git push failed — log locally saved.';
  }

  msg += '\n\nUse /positions to confirm fills.';
  return msg;
}

// ── update processor ──────────────────────────────────────────────────────────

async function processUpdates() {
  if (!TOKEN || !CHAT_ID) { console.log('[bot] Telegram not configured — skipping'); return; }

  const offset = getOffset();
  let response;
  try {
    response = await httpsGet(
      `https://api.telegram.org/bot${TOKEN}/getUpdates?offset=${offset}&limit=20&timeout=0`
    );
  } catch (e) {
    console.error('[bot] getUpdates error:', e.message);
    return;
  }

  if (!response.ok || !response.result.length) return;

  let maxId = offset;

  for (const upd of response.result) {
    maxId = Math.max(maxId, upd.update_id + 1);

    const msg = upd.message || upd.channel_post;
    if (!msg || !msg.text) continue;

    // Only process commands from the authorised chat
    if (String(msg.chat.id) !== CHAT_ID) continue;

    const text = msg.text.trim();
    if (!text.startsWith('/')) continue;

    const parts = text.split(/\s+/);
    // Strip @botname suffix (e.g. /alloc@moneya01_bot B → /alloc B)
    const cmd   = parts[0].toLowerCase().replace(/@\w+$/, '');
    const arg   = parts.slice(1).join(' ');

    console.log(`[bot] Received: ${cmd} ${arg}`);

    let reply = '';
    try {
      switch (cmd) {
        case '/status':                  reply = await cmdStatus();      break;
        case '/portfolio': case '/p':    reply = await cmdPortfolio();   break;
        case '/positions':               reply = await cmdPositions();   break;
        case '/orders':                  reply = await cmdOrders();      break;
        case '/risk':                    reply = await cmdRisk();        break;
        case '/alloc':                   reply = await cmdAlloc(arg);    break;
        case '/help':
          reply = `<b>@moneya01_bot commands</b>

/status — bot &amp; market clock
/portfolio — full snapshot with P&amp;L
/positions — open positions &amp; stops
/orders — open orders
/risk — stop levels, cash floor, position limits
/alloc A|B|C — approve pending allocation &amp; execute trades
/help — this message`;
          break;
        default:
          reply = `Unknown: <code>${cmd}</code>  Try /help`;
      }
    } catch (e) {
      reply = `❌ Error in ${cmd}: ${e.message.slice(0, 200)}`;
    }

    if (reply) await tgSend(reply);
  }

  if (maxId > offset) setOffset(maxId);
}

// ── entry point ───────────────────────────────────────────────────────────────

async function main() {
  const loop     = process.argv.includes('--loop');
  const intervalArg = process.argv.find(a => a.startsWith('--interval='));
  const interval = intervalArg ? parseInt(intervalArg.split('=')[1]) * 1000 : 10000;

  if (loop) console.log(`[bot] Polling every ${interval/1000}s — Ctrl-C to stop`);

  do {
    await processUpdates();
    if (loop) await new Promise(r => setTimeout(r, interval));
  } while (loop);
}

main().catch(e => { console.error('[bot] Fatal:', e.message); process.exit(1); });
