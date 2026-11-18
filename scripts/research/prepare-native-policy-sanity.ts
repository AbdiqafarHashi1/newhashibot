import {readFileSync,writeFileSync} from 'node:fs';
import {decodeNativeKline} from '../../supabase/functions/_shared/native-kline.ts';
import {closedAggregate} from '../../supabase/functions/_shared/regime-opportunities.ts';
import {historicalCandleChecksum} from '../../supabase/functions/_shared/canonical-historical-replay.ts';
import {CORE_WATCH_STRATEGIES} from '../../supabase/functions/_shared/watched-strategy-catalog.ts';
const output=process.argv[2];if(!output)throw Error('Output manifest path required');
const base='tests/conditionalSignals/fixtures/btcusdt-5m-20250101',manifest=JSON.parse(readFileSync(base+'.manifest.json','utf8')),rows=JSON.parse(readFileSync(base+'.json','utf8')).map((r:unknown[])=>decodeNativeKline('BTCUSDT','5m',r,'SPOT')),start=Date.parse(rows[120].open_time),end=start+60000;
const datasets=[];for(const [tf,candles] of [['5m',rows],['15m',closedAggregate(rows,15,new Date(end).toISOString())]] as const)datasets.push({id:`native-btc-${tf}`,sha256:await historicalCandleChecksum(candles),symbol:'BTCUSDT',timeframe:tf,candles,provenance:{source:'BINANCE_SPOT_KLINES',instrument:'SPOT',limitations:[manifest.source,`Raw SHA-256 ${manifest.sha256}`,'Bounded engineering sample only; not profitability research']}});
writeFileSync(output,JSON.stringify({datasets,configurations:CORE_WATCH_STRATEGIES.map(d=>({strategy_name:d.name,enabled:true})),releases:[],start:new Date(start).toISOString(),end:new Date(end).toISOString(),maxSteps:2}));
