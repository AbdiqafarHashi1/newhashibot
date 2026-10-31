import {test} from 'node:test';
import assert from 'node:assert/strict';
import {admitExecutionQuote} from '../../supabase/functions/_shared/execution-quote-guard';
test('native quote only admits fixed quantity inside confirmed geometry and account risk budget',()=>{
 const x={side:'BUY',bid:99,ask:100,stop:95,tp1:110,quantity:2,contractMultiplier:1,quoteConversion:1,maximumRiskAmount:10};
 assert.deepEqual(admitExecutionQuote(x),{entry:100,expectedRiskAmount:10});
 assert.throws(()=>admitExecutionQuote({...x,ask:101}),/EXCEEDS_APPROVED_RISK/);
 assert.throws(()=>admitExecutionQuote({...x,ask:111}),/GEOMETRY/);
 assert.throws(()=>admitExecutionQuote({...x,bid:102}),/COMPLETE_NATIVE/);
 assert.throws(()=>admitExecutionQuote({...x,quoteConversion:NaN}),/COMPLETE_NATIVE/);
 assert.equal(admitExecutionQuote({...x,side:'SELL',bid:100,ask:101,stop:105,tp1:90}).expectedRiskAmount,10);
});
