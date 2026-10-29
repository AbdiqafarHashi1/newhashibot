import {test} from 'node:test';
import assert from 'node:assert/strict';
import {conditionalCandidates,selectConditionalSetup,advanceConditionalSetup,enterConditionalAtOpen,type ConditionalSetup} from '../../supabase/functions/_shared/conditional-signal-service.ts';
import {ConditionalSignalStore,observeConditionalSymbol} from '../../supabase/functions/_shared/conditional-signal-runtime.ts';
import {runConditionalWatch} from '../../supabase/functions/_shared/conditional-watch.ts';
import {scheduledMarketClosed,consecutiveMarketBars} from '../../supabase/functions/_shared/conditional-market.ts';
import {trackedSetupSections} from '../../supabase/functions/_shared/conditional-intelligence.ts';
import {intelligencePublication} from '../../supabase/functions/_shared/intelligence-publication.ts';
import {editorialDestinations} from '../../supabase/functions/_shared/telegram-product.ts';
import type {StrategyCandle} from '../../supabase/functions/_shared/professional-strategies.ts';

const w=900000,t=Date.parse('2026-10-27T00:00:00Z'),iso=(i:number)=>new Date(t+i*w).toISOString();
function rows(symbol:string):StrategyCandle[]{const fx=!symbol.endsWith('USDT'),scale=symbol==='XAUUSD'?25:symbol==='USDJPY'?.2:fx?.002:1,base=symbol==='XAUUSD'?2000:symbol==='USDJPY'?140:fx?1:100;
 return Array.from({length:112},(_,i)=>{const c=base+i*.1*scale;return {symbol,market_type:fx?'forex':'crypto',timeframe:'15m',open_time:iso(i),open:c+(i===111?.2:-.05)*scale,high:c+.3*scale,low:c-.3*scale,close:c,volume:100,source:fx?'mt5_hashibridge:owner':'BINANCE_SPOT_KLINES'};});}
const plan=(symbol='EURUSD')=>conditionalCandidates(symbol,'15m',rows(symbol),t+112*w)[0];
const next=(s:ConditionalSetup,n:number,o:number,h:number,l:number,c:number):StrategyCandle=>({symbol:s.symbol,market_type:s.market!,timeframe:s.timeframe,source:s.source,open_time:iso(n),open:o,high:h,low:l,close:c,volume:100});

test('Forex, Gold and Crypto produce source-bound conditional plans with recorded market cost models',()=>{
 for(const symbol of ['BTCUSDT','EURUSD','USDJPY','XAUUSD']){const s=plan(symbol);assert.ok(s,symbol);assert.equal(s.status,'WAITING');assert.ok(s.validation);assert.ok(s.cost!.price>0);assert.match(s.strategy,new RegExp(symbol.endsWith('USDT')?'crypto':'forex'));assert.equal(s.lastBar,iso(111));assert.equal(selectConditionalSetup([s],t+112*w)?.id,s.id);}
});
test('closed confirmation, next observed open, closed-bar outcomes and restart are separate stages',()=>{
 let s=plan();const r=s.trigger-s.stop;
 s=advanceConditionalSetup(s,next(s,112,s.trigger-r*.1,s.trigger+r*.2,s.trigger-r*.2,s.trigger+r*.1));assert.equal(s.status,'ARMED');assert.equal(s.fill,undefined);
 const open=next(s,113,s.trigger+r*.05,s.trigger+10*r,s.stop-r,s.trigger+5*r);
 s=enterConditionalAtOpen(s,open,t+113*w+1000);assert.equal(s.status,'ACTIVE');assert.equal(s.bars,0);assert.equal(s.netR,0);assert.equal(s.lastBar,iso(112)); // mutable future extrema were ignored
 assert.equal(enterConditionalAtOpen(s,open,t+113*w+2000),s);
 const closed=advanceConditionalSetup(JSON.parse(JSON.stringify(s)),{...open,high:s.tp2+r,low:s.stop-r,close:s.trigger});
 assert.equal(closed.status,'CLOSED');assert.equal(closed.result,'STOP_FIRST_AMBIGUOUS_BAR');assert.ok(closed.netR!< -1);
 const changed=advanceConditionalSetup(s,{...open,source:'mt5_hashibridge:another'});assert.equal(changed.status,'DATA_GAP');assert.equal(changed.exit,undefined);
});
test('watcher covers all 32 streams and keeps existing plans managed with discovery paused',async()=>{
 let saved:ConditionalSetup[]=[plan()];const health:any[]=[],calls:string[]=[];
 const store={open:async(symbol:string,tf:string)=>saved.filter(s=>s.symbol===symbol&&s.timeframe===tf&&['WAITING','ARMED','ACTIVE'].includes(s.status)),save:async(s:ConditionalSetup,v:number)=>{const i=saved.findIndex(x=>x.id===s.id);if(i<0||saved[i].version!==v)return false;saved[i]=s;return true;}} as ConditionalSignalStore;
 const r=saved[0].trigger-saved[0].stop,b=next(saved[0],112,saved[0].trigger-r*.1,saved[0].trigger+r*.2,saved[0].trigger-r*.2,saved[0].trigger+r*.1),opening={...b,open_time:iso(113),open:saved[0].trigger};
 const result=await runConditionalWatch({store,discovery:{crypto:false,forex:false},health:async record=>{health.push(record);},feed:async(symbol)=>{calls.push(symbol);return {candles:[...rows(symbol),b],currentOpen:opening};}},t+113*w+1000);
 assert.equal(result.streams,32);assert.equal(result.assets,16);assert.equal(health.length,32);assert.deepEqual(calls,['EURUSD']);assert.equal(saved[0].status,'ACTIVE');assert.equal(result.admission.admitted,0);
});
test('unavailable streams are persisted as unknown health and do not stop healthy assets',async()=>{
 const health:any[]=[],store={open:async()=>[],save:async()=>true} as unknown as ConditionalSignalStore;
 const result=await runConditionalWatch({store,discovery:{crypto:true,forex:true},health:async record=>{health.push(record);},feed:async(symbol)=>{if(symbol==='EURUSD')throw Error('MT5_DISCONNECTED');return {candles:rows(symbol)};}},t+112*w);
 assert.equal(result.results.length,32);assert.equal(health.filter(r=>r.symbol==='EURUSD'&&r.state==='FEED_UNAVAILABLE').length,2);assert.ok(health.some(r=>r.state==='HEALTHY'));
});
test('original strategy context invalidates a watch; another strategy cannot rescue it',async()=>{
 let s=plan();s={...s,validation:{kind:'RANGE_REJECTION',boundary:s.trigger+1,higherMinutes:60}};
 const store={open:async()=>[s],save:async(next:ConditionalSetup)=>{s=next;return true;}} as unknown as ConditionalSignalStore;
 const r=s.trigger-s.stop;await observeConditionalSymbol(store,s.symbol,'15m',[...rows(s.symbol),next(s,112,s.trigger-r*.1,s.trigger+r*.2,s.trigger-r*.2,s.trigger+r*.1)],t+113*w);
 assert.equal(s.status,'INVALIDATED');assert.equal(s.fill,undefined);assert.match(s.result!,/Original strategy/);
});
test('known weekend closure is distinct from missing market-open candles, including DST',()=>{
 assert.equal(scheduledMarketClosed('EURUSD',Date.parse('2026-10-31T12:00:00Z')),true);
 assert.equal(scheduledMarketClosed('BTCUSDT',Date.parse('2026-10-31T12:00:00Z')),false);
 assert.equal(consecutiveMarketBars('EURUSD',Date.parse('2026-10-30T20:45:00Z'),Date.parse('2026-11-01T22:00:00Z'),w),true);
 assert.equal(consecutiveMarketBars('EURUSD',t,t+2*w,w),false);
});
test('Free intelligence includes only preselected recorded watches and a VIP invitation; paid market routing stays separate',()=>{
 const tracked=[{id:'free-ref',symbol:'EURUSD',track:'INTRADAY',status:'WAITING',strategy:'forex.conditional-intraday',variant:'TREND_PULLBACK',reason:'Recorded plan',free:true},{id:'vip-ref',symbol:'XAUUSD',free:false}];
 assert.equal(trackedSetupSections(tracked,'free')[0].body.includes('vip-ref'),false);assert.equal(trackedSetupSections(tracked,'vip')[0].body.includes('vip-ref'),true);
 const now=Date.now(),output:any={status:'generated',summary:'Observed market analysis',freshness:{generated_at:new Date(now).toISOString()},data_sources:{candles:'owner MT5 feed'},event_id:'record',event_type:'watchlist_pattern_update',market:'forex',title:'Forex watch',metadata:{tracked_setups:tracked}};
 const free=intelligencePublication(output,'free',now),vip=intelligencePublication(output,'vip',now);assert.match(JSON.stringify(free.sections),/VIP analysis/);assert.doesNotMatch(JSON.stringify(free.sections),/vip-ref/);assert.deepEqual(editorialDestinations(vip),['vip_forex_gold']);assert.deepEqual(editorialDestinations(free),['free']);
});

test('confirmation into a known closure is cancelled instead of filling a delayed reopen',()=>{
 const s={...plan(),lastBar:'2026-10-30T20:45:00.000Z',status:'ARMED' as const,armedAt:'2026-10-30T21:00:00.000Z'};
 const reopened={...rows('EURUSD')[0],open_time:'2026-11-01T22:00:00.000Z'};
 const nextState=enterConditionalAtOpen(s,reopened,Date.parse(reopened.open_time)+1000);assert.equal(nextState.status,'INVALIDATED');assert.equal(nextState.fill,undefined);assert.match(nextState.result!,/closure/);
});
