import {test} from 'node:test';import assert from 'node:assert/strict';
import {researchAccountId,researchAccountResume} from '../../scripts/research/account-resume';
import {HistoricalAccountLedger} from '../../supabase/functions/_shared/historical-account-ledger';
test('fractional CLI risk and persisted numeric risk restore the same cash ledger',()=>{
 const policy:any={purpose:'HISTORICAL_RESEARCH',initialCapital:100,timezone:'UTC',dailyLossPct:5,overallLossPct:12,drawdown:'STATIC',dailyBasis:'DAY_START_BALANCE',stopOutMarginRatio:50};
 const ledger=new HistoricalAccountLedger(policy,[]),snapshot=ledger.snapshot();snapshot.balance=91;snapshot.equity=91;
 const saved={accounts:[{accountId:researchAccountId('MT5_PERSONAL',100,.4),ledger:snapshot}]};
 const id=researchAccountId('MT5_PERSONAL','100','.4');assert.equal(id,saved.accounts[0].accountId);
 const restored=new HistoricalAccountLedger(policy,[],researchAccountResume(saved,id) as any);assert.equal(restored.summary().balance,91);assert.equal(restored.summary().equity,91);
});
test('missing or ambiguous account checkpoint fails instead of silently resetting capital',()=>{
 const id=researchAccountId('BINANCE','1000','.5');assert.equal(id,researchAccountId('BINANCE',1000,.5));assert.equal(researchAccountResume(undefined,id),undefined);
 assert.throws(()=>researchAccountResume({accounts:[]},id),/CHECKPOINT_BINDING/);assert.throws(()=>researchAccountResume({accounts:[{accountId:id,ledger:{}},{accountId:id,ledger:{}}]},id),/CHECKPOINT_BINDING/);
});
