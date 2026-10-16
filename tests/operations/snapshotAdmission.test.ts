import {test} from 'node:test';
import assert from 'node:assert/strict';
import {admitBinanceConditionalOrders,admitProviderPositions} from '../../supabase/functions/_shared/provider-snapshot-admission';
test('unknown provider positions/conditional orders are not silently admitted as zero exposure',()=>{
 assert.deepEqual(admitProviderPositions([],'binance'),[]);assert.equal(admitProviderPositions([{symbol:'BTCUSDT',positionAmt:'-.1'}],'binance').length,1);
 for(const bad of [null,{},[{symbol:'BTCUSDT'}],[{symbol:'BTCUSDT',positionAmt:'NaN'}],[{positionAmt:'0'}]])assert.throws(()=>admitProviderPositions(bad,'binance'),/MALFORMED/);
 for(const size of [undefined,null,'',-1,NaN])assert.throws(()=>admitProviderPositions([{symbol:'BTCUSDT',size}],'bybit'),/MALFORMED/);
 assert.deepEqual(admitBinanceConditionalOrders({orders:[]}),[]);assert.throws(()=>admitBinanceConditionalOrders({code:-1}),/MALFORMED/);
});
