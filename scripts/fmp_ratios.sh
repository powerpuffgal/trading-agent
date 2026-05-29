#!/usr/bin/env bash
# Usage: bash scripts/fmp_ratios.sh SYMBOL [SYMBOL ...]
# Pulls P/E, P/B, D/E, net margin, FCF yield, ROE, rev growth from FMP stable API

source "$(dirname "$0")/../.env" 2>/dev/null || true

BASE="https://financialmodelingprep.com/stable"

for SYM in "$@"; do
  echo "=== $SYM ==="

  R=$(curl -s "$BASE/ratios-ttm?symbol=$SYM&apikey=$FMP_API_KEY")
  K=$(curl -s "$BASE/key-metrics-ttm?symbol=$SYM&apikey=$FMP_API_KEY")
  G=$(curl -s "$BASE/financial-growth?symbol=$SYM&limit=1&apikey=$FMP_API_KEY")

  printf '{"r":%s,"k":%s,"g":%s}' "$R" "$K" "$G" | node -e '
let raw=""; process.stdin.on("data",d=>raw+=d).on("end",()=>{
  const {r:ra,k:ka,g:ga}=JSON.parse(raw);
  const r=Array.isArray(ra)?ra[0]:ra||{};
  const k=Array.isArray(ka)?ka[0]:ka||{};
  const g=Array.isArray(ga)?ga[0]:ga||{};
  const pct=(v,dp=1)=>v!=null?(v*100).toFixed(dp)+"%":"N/A";
  const num=(v,dp=1)=>v!=null?(+v).toFixed(dp):"N/A";
  const fcfY=r.priceToFreeCashFlowRatioTTM?(1/r.priceToFreeCashFlowRatioTTM*100).toFixed(2)+"%":"N/A";
  console.log(JSON.stringify({
    PE:num(r.priceToEarningsRatioTTM),
    PB:num(r.priceToBookRatioTTM),
    DE:num(r.debtToEquityRatioTTM,2),
    NetMargin:pct(r.netProfitMarginTTM),
    FCFYield:fcfY,
    ROE:pct(k.returnOnEquityTTM),
    RevGrowth:pct(g.revenueGrowth),
    EPSGrowth:pct(g.epsgrowth),
  },null,2));
});
'
done
