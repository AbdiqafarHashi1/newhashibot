import test from 'node:test';import assert from 'node:assert/strict';import {readFile} from 'node:fs/promises';import {gunzipSync} from 'node:zlib';
import {evaluateComplementary,COMPLEMENTARY_ROLES} from '../../supabase/functions/_shared/complementary-strategies.ts';import {calculateActiveIndicators} from '../../supabase/functions/_shared/active-validation-runtime.ts';
const records=JSON.parse(gunzipSync(await readFile(new URL('./fixtures/native-rules.json.gz',import.meta.url))).toString());
for(const role of COMPLEMENTARY_ROLES)test(`${role}: a real historical rule trigger and its mathematical opposite are both reachable`,()=>{
 const r=records.find(x=>x.role===role);assert.ok(r);const a=evaluateComplementary(role,r.context);assert.equal(a.status,'candidate');assert.equal(a.direction,r.expectedDirection);
 const k=2*Math.max(...r.context.candles.map(b=>b.high));const mirror=b=>({...b,open:k-b.open,high:k-b.low,low:k-b.high,close:k-b.close,source:'MIRRORED_UNIT_TEST'});
 const candles=r.context.candles.map(mirror),ctx={...r.context,candles,higher_timeframe_candles:r.context.higher_timeframe_candles.map(mirror),indicators:calculateActiveIndicators(candles)};
 const b=evaluateComplementary(role,ctx);assert.equal(b.status,'candidate');assert.equal(b.direction,a.direction==='buy'?'sell':'buy');
 const sign=b.direction==='buy'?1:-1;assert.ok(sign*(b.entry_high-b.stop_loss)>0);assert.ok(sign*(b.tp1-b.entry_high)>0);assert.ok(sign*(b.tp2-b.tp1)>0);
});
