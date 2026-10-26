import assert from 'node:assert/strict';
import {slowerEntry} from '../../scripts/research/slower-entry-rules.ts';
const bars=Array.from({length:61},(_,i)=>({high:102+i,low:98+i,close:100+i}));
for(const id of ['4H_BREAKOUT','DAILY_MOMENTUM'] as const){
 const up=slowerEntry(bars,60,id);assert.equal(up.sign,id==='4H_BREAKOUT'?0:1);assert.equal(up.atr,4);
 const rising=bars.map((b,i)=>i===60?{...b,high:170,close:170}:b);
 assert.equal(slowerEntry(rising,60,id).sign,1);
 assert.deepEqual(slowerEntry([...rising,{high:1e9,low:.01,close:.01}],60,id),slowerEntry(rising,60,id));
 const mirror=rising.map(b=>({high:400-b.low,low:400-b.high,close:400-b.close}));
 assert.equal(slowerEntry(mirror,60,id).sign,-1);
 assert.equal(slowerEntry(bars,59,id).sign,0);
 const flat=bars.map(()=>({high:100,low:100,close:100}));assert.equal(slowerEntry(flat,60,id).sign,0);
}
console.log('Slower-entry closed-bar, warmup, ATR, direction symmetry and future-invariance checks passed.');
