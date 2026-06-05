import fs from 'node:fs';
import path from 'node:path';

const outDir = path.resolve('data/backtests');
fs.mkdirSync(outDir, { recursive: true });

function lcg(seed) {
  let s = seed >>> 0;
  return () => ((s = (s * 1664525 + 1013904223) >>> 0) / 2 ** 32) - 0.5;
}

function make(symbol, startPrice, seed) {
  const rnd = lcg(seed);
  const rows = ['open_time,open,high,low,close,volume'];
  const start = Date.UTC(2026, 4, 1, 0, 0, 0);
  let price = startPrice;
  for (let i = 0; i < 1800; i++) {
    const cycle = i % 300;
    let drift = 0;
    let vol = 0.0018;
    if (cycle < 85) { drift = 0.00065; vol = 0.0023; }
    else if (cycle < 130) { drift = -0.00015; vol = 0.0011; }
    else if (cycle < 150) { drift = 0.00125; vol = 0.0035; }
    else if (cycle < 235) { drift = -0.0006; vol = 0.0022; }
    else if (cycle < 280) { drift = 0.00012; vol = 0.00095; }
    else { drift = -0.00115; vol = 0.0034; }
    const open = price;
    const ret = drift + rnd() * vol;
    const close = Math.max(1, open * (1 + ret));
    const wick = Math.abs(rnd()) * vol * open * 1.8 + open * 0.00025;
    const high = Math.max(open, close) + wick;
    const low = Math.min(open, close) - wick;
    const volume = 1000 + Math.abs(rnd()) * 8000 + (cycle > 140 && cycle < 155 ? 9000 : 0) + (cycle > 275 ? 7000 : 0);
    rows.push(`${new Date(start + i * 5 * 60_000).toISOString()},${open.toFixed(6)},${high.toFixed(6)},${low.toFixed(6)},${close.toFixed(6)},${volume.toFixed(3)}`);
    price = close;
  }
  fs.writeFileSync(path.join(outDir, `${symbol}_5m.csv`), rows.join('\n'));
}

make('ETHUSDT', 3100, 11);
make('BTCUSDT', 68000, 23);
make('SOLUSDT', 145, 37);
console.log('generated data/backtests/ETHUSDT_5m.csv, BTCUSDT_5m.csv, SOLUSDT_5m.csv');
