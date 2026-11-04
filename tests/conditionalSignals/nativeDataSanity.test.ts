import {test} from 'node:test';import assert from 'node:assert/strict';import {readFileSync} from 'node:fs';import {createHash} from 'node:crypto';
import {decodeNativeKline} from '../../supabase/functions/_shared/native-kline.ts';
import {validClosedBars} from '../../supabase/functions/_shared/conditional-signal-service.ts';
import {discoverWatchedStrategies} from '../../supabase/functions/_shared/watched-strategy-discovery.ts';
import {watchedStrategyCatalog,CORE_WATCH_STRATEGIES} from '../../supabase/functions/_shared/watched-strategy-catalog.ts';
import {closedAggregate} from '../../supabase/functions/_shared/regime-opportunities.ts';
const root='tests/conditionalSignals/fixtures/btcusdt-5m-20250101',bytes=readFileSync(root+'.json'),manifest=JSON.parse(readFileSync(root+'.manifest.json','utf8'));
test('bounded genuine Binance SPOT candles: native fields, ordering, closed-only warmup and causal scanner inputs',()=>{
 assert.equal(createHash('sha256').update(bytes).digest('hex'),manifest.sha256);const raw=JSON.parse(bytes.toString()),rows=raw.map((r:any[])=>decodeNativeKline('BTCUSDT','5m',r,'SPOT'));
 assert.equal(rows.length,160);assert.equal(rows[0].open_time,new Date(manifest.firstOpenMs).toISOString());
 const definitions=watchedStrategyCatalog(CORE_WATCH_STRATEGIES.map(d=>({strategy_name:d.name,enabled:true})));
 for(const size of [100,120,140,160]){
  const prefix=rows.slice(0,size),now=Date.parse(prefix.at(-1)!.open_time)+300000;
  assert.equal(validClosedBars(prefix,'BTCUSDT','5m',now),true);assert(prefix.every((r:any)=>r.instrument_type==='SPOT'&&r.trade_count!==undefined&&r.taker_buy_volume!==undefined));
  const higher=closedAggregate(prefix,15,new Date(now).toISOString());assert(higher.every(b=>Date.parse(b.open_time)+900000<=now));
  const result=discoverWatchedStrategies({definitions,symbol:'BTCUSDT',tf:'5m',rows:prefix,higher,now});assert.equal(result.observations.length,definitions.filter(d=>d.market==='crypto').length);
  for(const s of result.setups){assert(s.stop>0&&s.tp1>s.trigger&&s.tp2>=s.tp1);assert.equal(s.entryDecision?.executionEligible,false);assert.equal(s.status,'WAITING');}
  const future=discoverWatchedStrategies({definitions,symbol:'BTCUSDT',tf:'5m',rows:prefix,higher,now:now-1});assert.equal(future.setups.length,0);assert(future.observations.every(o=>o.decision==='NO_TRADE'));
 }
});
