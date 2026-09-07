import { runMultiAssetPipelineEngine } from './simulationEngine';
import { AssetCapitalPool, MultiAssetFeedItem, BtCandle } from './types';

async function fetchBars(symbol: string, assetClass: string, range: string): Promise<BtCandle[]> {
  try {
    const url = `http://localhost:3000/api/market-data/history?symbol=${symbol}&interval=15m&assetClass=${assetClass}&range=${range}&limit=1500`;
    const resp = await fetch(url);
    if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
    const data = await resp.json();
    return data.candles || [];
  } catch (e) {
    console.warn(`Fetch error for ${symbol}:`, e);
    return [];
  }
}

async function main() {
  console.log('Fetching real bars for GBPUSD, XAUUSD, BTCUSDT...');
  const gbp = await fetchBars('GBPUSD', 'forex', '60d');
  const gold = await fetchBars('XAUUSD', 'metals', '60d');
  const btc = await fetchBars('BTCUSDT', 'crypto', '60d');

  console.log(`Bars loaded: GBPUSD=${gbp.length}, Gold=${gold.length}, BTC=${btc.length}`);

  const feeds: Record<string, MultiAssetFeedItem> = {
    forex: { category: 'forex', symbol: 'GBPUSD', displayName: 'GBP/USD', assetClass: 'forex_majors', pipOrPointSize: 0.0001, spreadPipsOrPts: 1.0, decimals: 5, fridayWeekendClose: true, enforceSessionWindows: true, candles: gbp, count: gbp.length, status: 'ready', source: 'yahoo' },
    GBPUSD: { category: 'forex', symbol: 'GBPUSD', displayName: 'GBP/USD', assetClass: 'forex_majors', pipOrPointSize: 0.0001, spreadPipsOrPts: 1.0, decimals: 5, fridayWeekendClose: true, enforceSessionWindows: true, candles: gbp, count: gbp.length, status: 'ready', source: 'yahoo' },
    metals: { category: 'metals', symbol: 'XAUUSD', displayName: 'Gold', assetClass: 'metals_gold', pipOrPointSize: 0.01, spreadPipsOrPts: 25, decimals: 2, fridayWeekendClose: true, enforceSessionWindows: false, candles: gold, count: gold.length, status: 'ready', source: 'yahoo' },
    XAUUSD: { category: 'metals', symbol: 'XAUUSD', displayName: 'Gold', assetClass: 'metals_gold', pipOrPointSize: 0.01, spreadPipsOrPts: 25, decimals: 2, fridayWeekendClose: true, enforceSessionWindows: false, candles: gold, count: gold.length, status: 'ready', source: 'yahoo' },
    crypto: { category: 'crypto', symbol: 'BTCUSDT', displayName: 'BTC/USDT', assetClass: 'crypto', pipOrPointSize: 0.01, spreadPipsOrPts: 2, decimals: 2, fridayWeekendClose: false, enforceSessionWindows: false, candles: btc, count: btc.length, status: 'ready', source: 'binance' },
    BTCUSDT: { category: 'crypto', symbol: 'BTCUSDT', displayName: 'BTC/USDT', assetClass: 'crypto', pipOrPointSize: 0.01, spreadPipsOrPts: 2, decimals: 2, fridayWeekendClose: false, enforceSessionWindows: false, candles: btc, count: btc.length, status: 'ready', source: 'binance' },
  };

  const pools: Record<string, AssetCapitalPool> = {
    forex: { category: 'forex', name: 'Forex Majors', symbol: 'GBPUSD', capitalUsd: 100000, riskPct: 0.65, pipOrPointSize: 0.0001, spreadPipsOrPts: 1.0, decimals: 5, fridayClose: true, sessionFilter: true },
    metals: { category: 'metals', name: 'Metals & Gold', symbol: 'XAUUSD', capitalUsd: 100000, riskPct: 0.65, pipOrPointSize: 0.01, spreadPipsOrPts: 25, decimals: 2, fridayClose: true, sessionFilter: false },
    crypto: { category: 'crypto', name: 'Crypto Pool', symbol: 'BTCUSDT', capitalUsd: 100000, riskPct: 0.65, pipOrPointSize: 0.01, spreadPipsOrPts: 2, decimals: 2, fridayClose: false, sessionFilter: false },
  };

  const res = runMultiAssetPipelineEngine(
    feeds,
    pools as any,
    ['FXTrendPullback', 'GoldVolatilityBreakout', 'CryptoMomentumBreakout'],
    { maxConcurrentPositions: 2, minScore: 85, conflictPolicy: 'strict_no_conflict', enableWeights: true }
  );

  console.log('\n--- RESULT SUMMARY ---');
  console.log('Total trades:', res.trades.length);
  console.log('Win rate:', res.metrics.winRate + '%');
  console.log('Profit factor:', res.metrics.profitFactor);
  console.log('Net USD:', res.metrics.netUsd);
  console.log('Max Drawdown %:', res.metrics.maxDrawdownPct);

  const resultsMap: Record<string, number> = {};
  res.trades.forEach(t => resultsMap[t.result] = (resultsMap[t.result] || 0) + 1);
  console.log('Exit results:', resultsMap);

  console.log('\nStrategy stats:');
  res.strategyStats.forEach(s => {
    console.log(`  ${s.strategy}: trades=${s.trades}, winRate=${s.winRate.toFixed(1)}%, PF=${s.profitFactor}, totalR=${s.totalR.toFixed(2)}R, netUsd=$${s.netUsd.toFixed(2)}`);
  });
}

main().catch(console.error);
