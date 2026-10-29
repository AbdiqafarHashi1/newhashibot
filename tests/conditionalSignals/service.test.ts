import {test} from 'node:test';
import assert from 'node:assert/strict';
import {advanceConditionalSetup,selectConditionalSetup,conditionalMessage,conditionalCandidates,type ConditionalSetup} from '../../supabase/functions/_shared/conditional-signal-service.ts';
import {ConditionalSignalStore,observeConditionalSymbol,admitConditionalBatch} from '../../supabase/functions/_shared/conditional-signal-runtime.ts';
import type {StrategyCandle} from '../../supabase/functions/_shared/professional-strategies.ts';
const t=Date.parse('2026-10-29T00:00:00Z'),iso=(n:number)=>new Date(t+n*900000).toISOString();
const setup=():ConditionalSetup=>({id:'test',symbol:'BTCUSDT',timeframe:'15m',track:'INTRADAY',side:'buy',strategy:'crypto.conditional-intraday',variant:'TREND_PULLBACK',policy:'conditional-signals/v1',sourceClose:iso(1),source:'TEST',trigger:100,stop:90,tp1:110,tp2:120,expiresAt:iso(8),holdBars:48,score:85,reason:'Wait for close',status:'WAITING',version:1,lastBar:iso(0)});
const bar=(n:number,o=100,h=103,l=98,c=102):StrategyCandle=>({symbol:'BTCUSDT',market_type:'crypto',timeframe:'15m',open_time:iso(n),open:o,high:h,low:l,close:c,volume:100,source:'TEST'});
test('touch is not confirmation; close arms and only next open fills',()=>{
 let s=advanceConditionalSetup(setup(),bar(1,99,102,97,99));assert.equal(s.status,'WAITING');
 s=advanceConditionalSetup(s,bar(2));assert.equal(s.status,'ARMED');assert.equal(s.fill,undefined);
 s=advanceConditionalSetup(s,bar(3,101,105,99,103));assert.equal(s.status,'ACTIVE');assert.equal(s.fill,101);
 assert.equal(advanceConditionalSetup(s,bar(3)),s);
});
test('gap uncertainty and no chasing, short and terminal behavior',()=>{
 assert.equal(advanceConditionalSetup(setup(),bar(2)).status,'DATA_GAP');
 const armed=advanceConditionalSetup(setup(),bar(1));assert.equal(advanceConditionalSetup(armed,bar(2,104,105,100,102)).status,'INVALIDATED');
 const short={...setup(),side:'sell' as const,stop:110,tp1:90,tp2:80};
 let s=advanceConditionalSetup(short,bar(1,101,102,98,99));assert.equal(s.status,'ARMED');
 s=advanceConditionalSetup(s,bar(2,99,100,95,97));assert.equal(s.status,'ACTIVE');assert.equal(s.fill,99);
});
test('partial accounting is independently calculated, cost applied once, stop wins ambiguity',()=>{
 let s=advanceConditionalSetup(advanceConditionalSetup(setup(),bar(1)),bar(2,100,111,99,110));
 assert.equal(s.partial,true);assert.equal(s.netR,.5);
 s=advanceConditionalSetup(s,bar(3,110,121,105,120));assert.equal(s.status,'CLOSED');assert.equal(s.netR,1.5-.025);
 const ambiguous=advanceConditionalSetup(advanceConditionalSetup(setup(),bar(1)),bar(2,100,121,89,100));
 assert.equal(ambiguous.result,'STOP_FIRST_AMBIGUOUS_BAR');assert.equal(ambiguous.netR,-1.025);
 assert.match(conditionalMessage(s),/not actual fills|Not actual fills/);
});
test('existing arbitrator blocks opposing directions and chooses strongest track',()=>{
 const a=setup(),b={...a,id:'swing',track:'SWING' as const,timeframe:'1h' as const,score:90};
 assert.equal(selectConditionalSetup([a,b],t+900001)?.id,'swing');
 assert.equal(selectConditionalSetup([a,{...a,id:'short',side:'sell',stop:110,tp1:90,tp2:80}],t+900001),undefined);
 assert.equal(conditionalCandidates('UNKNOWN','15m',[],t).length,0);
});
test('concrete adapter reloads and CAS-persists restart progress; batch strongest first',async()=>{
 let current=setup();const saved:string[]=[];
 const db={from:()=>{const q:any={select:()=>q,eq:()=>q,in:()=>q,limit:async()=>({data:[{state:current}],error:null})};return q;},rpc:async(name:string,p:any)=>{
 assert(['commit_conditional_signal_setup','admit_conditional_signal_setup'].includes(name));saved.push(p.p_state.id);
 if(p.p_expected_version&&p.p_expected_version!==current.version)return {data:false};current=p.p_state;return{data:true};}};
 const store=new ConditionalSignalStore(db);
 await observeConditionalSymbol(store,'BTCUSDT','15m',[bar(1),bar(2,100,105,98,103)],t+2700000);
 assert.equal(current.status,'ACTIVE');assert.equal(current.version,3);
 const version=current.version;await observeConditionalSymbol(store,'BTCUSDT','15m',[bar(1),bar(2)],t+2700000);assert.equal(current.version,version);
 saved.length=0;await admitConditionalBatch(store,[{...setup(),symbol:'ETHUSDT',id:'weak',score:80},{...setup(),id:'strong',score:90}],t+900001);
 assert.deepEqual(saved,['strong','weak']);
});
test('closed-candle multi-timeframe evaluator produces a conditional hypothesis, rejects stale and mutable inputs',()=>{
 const rows=Array.from({length:112},(_,i)=>{const c=100+i*.1;return bar(i,c-.05,c+.3,c-.3,c);});
 rows[111].open=rows[111].close+.2;
 const now=t+112*900000,c=conditionalCandidates('BTCUSDT','15m',rows,now);
 assert.equal(c.length,1);assert.equal(c[0].status,'WAITING');assert.equal(c[0].variant,'TREND_PULLBACK');
 assert.ok(c[0].trigger>rows.at(-1)!.close);assert.ok(c[0].stop<c[0].trigger);
 assert.equal(conditionalCandidates('BTCUSDT','15m',rows,now-1).length,0);
 assert.equal(conditionalCandidates('BTCUSDT','15m',rows,now+900000).length,0);
});


test('changed source is unknown; independent tracks survive batch arbitration; messages keep exact setup reference',async()=>{
 const initial=setup();const changed=advanceConditionalSetup(initial,{...bar(1),source:'OTHER_VENUE'});
 assert.equal(changed.status,'DATA_GAP');assert.equal(changed.netR,undefined);assert.match(changed.result!,/unknown/);
 const saved:ConditionalSetup[]=[];const store={save:async(s:ConditionalSetup)=>{saved.push(s);return true;}} as ConditionalSignalStore;
 const swing={...initial,id:'swing',track:'SWING' as const,timeframe:'1h' as const};
 await admitConditionalBatch(store,[initial,swing],t+900001);assert.equal(saved.length,2);assert.deepEqual(new Set(saved.map(s=>s.track)),new Set(['INTRADAY','SWING']));
 for(const s of saved){const msg=conditionalMessage(s);assert.match(msg,new RegExp(s.id));assert.doesNotMatch(msg,/Rule score|backend|manual review/);}
});
