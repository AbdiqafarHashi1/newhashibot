import {test} from 'node:test';
import assert from 'node:assert/strict';
import {admitBinanceConditionalOrders,admitProviderPositions} from '../../supabase/functions/_shared/provider-snapshot-admission';
test('unknown provider positions/conditional orders are not silently admitted as zero exposure',()=>{
 assert.deepEqual(admitProviderPositions([],'binance'),[]);assert.equal(admitProviderPositions([{symbol:'BTCUSDT',positionAmt:'-.1'}],'binance').length,1);
 for(const bad of [null,{},[{symbol:'BTCUSDT'}],[{symbol:'BTCUSDT',positionAmt:'NaN'}],[{positionAmt:'0'}]])assert.throws(()=>admitProviderPositions(bad,'binance'),/MALFORMED/);
 for(const size of [undefined,null,'',-1,NaN])assert.throws(()=>admitProviderPositions([{symbol:'BTCUSDT',size}],'bybit'),/MALFORMED/);
 assert.deepEqual(admitBinanceConditionalOrders({orders:[]}),[]);assert.throws(()=>admitBinanceConditionalOrders({code:-1}),/MALFORMED/);
});

test('financial observations reject missing, blank, boolean and non-finite values while preserving actual zero',async()=>{
 const {observedFinancialNumber}=await import('../../supabase/functions/_shared/provider-snapshot-admission');
 assert.equal(observedFinancialNumber('0','margin'),0);assert.equal(observedFinancialNumber('123.50','balance'),123.5);
 for(const value of [undefined,null,'',' ',false,true,'NaN',Infinity,-1])assert.throws(()=>observedFinancialNumber(value,'balance'),/FINANCIAL_FIELD_REQUIRED/);
});


test('Binance multi-asset USD totals are not mislabeled as coin USDT balances',async()=>{
 const {admitBinanceFinancials}=await import('../../supabase/functions/_shared/provider-snapshot-admission');
 assert.deepEqual(admitBinanceFinancials({multiAssetsMargin:true,availableBalance:'1000',assets:[{asset:'USDT',availableBalance:'700'}]}),{account_available_balance:1000,provider_account_currency:'USD',multi_assets_margin:true,available_usdt:700});
 assert.equal(admitBinanceFinancials({multiAssetsMargin:false,availableBalance:'0',assets:[]}).available_usdt,null);
 assert.throws(()=>admitBinanceFinancials({availableBalance:'1000',assets:[]}),/FINANCIAL_MODE_REQUIRED/);
});
