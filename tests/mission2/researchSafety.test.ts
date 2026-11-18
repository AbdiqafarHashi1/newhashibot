import {test} from 'node:test';import assert from 'node:assert/strict';import {gunzipSync} from 'node:zlib';import {readFileSync} from 'node:fs';
import {ProfessionalStrategyRegistry,type StrategyCandle} from '../../supabase/functions/_shared/professional-strategies.ts';
import {coordinatedCryptoDefinitions,evaluateCryptoTeam} from '../../supabase/functions/_shared/coordinated-crypto.ts';
import {calculateActiveIndicators} from '../../supabase/functions/_shared/active-validation-runtime.ts';
import {strategyAlgorithmParameters,watchedHistoryBars} from '../../supabase/functions/_shared/strategy-runtime-parameters.ts';
import {closedAggregate} from '../../supabase/functions/_shared/regime-opportunities.ts';import {watchWidth} from '../../supabase/functions/_shared/conditional-contract.ts';
import {ResearchConversionFunnel} from '../../supabase/functions/_shared/research-conversion-funnel.ts';
test('genuine native specialist keeps its frozen algorithm while engine metadata stays out of its tuning parameters',()=>{
 const archive=JSON.parse(gunzipSync(readFileSync('tests/phaseP/fixtures/crypto-team-native.json.gz')).toString()),ex=archive.examples[0],rows:StrategyCandle[]=ex.candles.filter((c:StrategyCandle)=>Date.parse(c.open_time)+900000<=Date.parse(ex.decisionAt)).slice(-960),d=coordinatedCryptoDefinitions().find(d=>d.id===ex.role)!;
 const definition={...d,lifecycle:'ENABLED' as const,config:{...d.config,enabled:true,params:{entry_engine_version:1}}};
 const ctx={symbol:ex.symbol,market:'crypto' as const,timeframe:'15m',candles:rows,indicators:calculateActiveIndicators(rows),evaluated_at:ex.decisionAt,reference_candles:ex.reference};
 const actual=new ProfessionalStrategyRegistry([definition]).evaluate(ctx)[0].professional.legacy,expected=evaluateCryptoTeam(d.id,{...ctx,strategy_parameters:{}});
 assert.deepEqual(actual,expected);assert.notEqual(actual.rejection_reason,'TEAM_FROZEN_POLICY_REQUIRED');assert.equal(watchedHistoryBars([definition],ex.symbol,'15m'),960);assert.equal(watchedHistoryBars([{...definition,config:{...definition.config,enabled:false}}],ex.symbol,'15m'),240);
 assert.deepEqual(strategyAlgorithmParameters({entry_engine_version:1,target_r:100}),{target_r:100});assert.equal(evaluateCryptoTeam(d.id,{...ctx,strategy_parameters:{target_r:100}}).status,'rejected');
});
test('complete aggregation preserves native flow totals and bid/ask extrema; weekly context has a real width',()=>{
 const rows:StrategyCandle[]=Array.from({length:3},(_,i)=>({symbol:'BTCUSDT',market_type:'crypto',timeframe:'5m',source:'CONTROLLED_TEST',instrument_type:'SPOT',open_time:new Date(Date.parse('2025-01-01T00:00:00Z')+i*300000).toISOString(),open:100+i,high:103+i,low:99+i,close:101+i,volume:10,quote_volume:1000,trade_count:5,taker_buy_volume:4,taker_buy_quote_volume:400,ask_open:101+i,ask_high:104+i,ask_low:100+i,ask_close:102+i}));
 const result=closedAggregate(rows,15,'2025-01-01T00:15:00Z')[0];assert.equal(result.volume,30);assert.equal(result.quote_volume,3000);assert.equal(result.trade_count,15);assert.equal(result.taker_buy_volume,12);assert.equal(result.ask_open,101);assert.equal(result.ask_close,104);assert.equal(result.ask_high,106);assert.equal(result.ask_low,100);assert.equal(watchWidth('7d'),604800000);assert.equal(closedAggregate(rows,15,'2025-01-01T00:14:59Z').length,0);
});
test('conversion funnel does not count repeated minute polling as independent opportunities or fabricated trades',()=>{
 const funnel=new ResearchConversionFunnel(),at='2025-01-01T00:00:00Z',observation={strategy_id:'crypto.micro-scalper',symbol:'BTCUSDT',timeframe:'5m',checked_at:at,decision:'IMMEDIATE_CONFIRMED',reason:'',evidence:{source_close:at,raw_candidate:true,entry_decision:{opportunityId:'same',kind:'IMMEDIATE_CONFIRMED',reasons:[]}}};
 const evidence={at,observations:[observation],health:[],events:[],rejections:[]},checkpoint={schema:'canonical-historical-replay/v1' as const,lineage:'a'.repeat(64),cursor:1,through:Date.parse(at),store:{schema:'historical-conditional-store/v1' as const,records:[],events:[],rejections:[]}};
 for(let i=0;i<60;i++)funnel.observe(evidence,checkpoint);
 const row=funnel.report(Date.parse(at),Date.parse(at)+86400000).rows[0];assert.equal(row.evaluations,1);assert.equal(row.rawOpportunities,1);assert.equal(row.immediate,1);assert.equal(row.brokerExecuted,null);assert.equal(row.profitFactor,null);
});
test('funnel restart preserves identity sets, rows and duplicate suppression',()=>{
 const funnel=new ResearchConversionFunnel(),at='2025-01-01T00:00:00Z';
 const e={at,observations:[{strategy_id:'crypto.micro-scalper',symbol:'BTCUSDT',timeframe:'5m',checked_at:at,decision:'NO_TRADE',reason:'NO_STRUCTURE',evidence:{source_close:at}}],health:[],events:[],rejections:[]};
 const c={schema:'canonical-historical-replay/v1' as const,lineage:'a'.repeat(64),cursor:1,through:Date.parse(at),store:{schema:'historical-conditional-store/v1' as const,records:[],events:[],rejections:[]}};
 funnel.observe(e,c);const resumed=new ResearchConversionFunnel(JSON.parse(JSON.stringify(funnel.snapshot())));resumed.observe(e,c);assert.deepEqual(resumed.report(Date.parse(at),Date.parse(at)+86400000),funnel.report(Date.parse(at),Date.parse(at)+86400000));
});
