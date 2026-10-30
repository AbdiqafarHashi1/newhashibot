import {test} from 'node:test';import assert from 'node:assert/strict';
import {assertConfirmedEntry,loadConfirmedEntry} from '../../supabase/functions/_shared/confirmed-entry';
const now=Date.parse('2026-10-30T06:00:00Z');
const signal={id:'signal',status:'active',created_at:'2026-10-30T05:00:00Z',expires_at:'2026-10-30T07:00:00Z'};
const confirmed={signal_id:'signal',new_status:'active',price:100,reason:'candle_entry_trigger',created_at:'2026-10-30T05:59:00Z'};
test('only persisted movement confirmation for this active signal admits an entry',()=>{
 assert.equal(assertConfirmedEntry(signal,confirmed,now),confirmed);
 for(const status of ['waiting','new','expired','tp1_hit','sl_hit'])assert.throws(()=>assertConfirmedEntry({...signal,status},confirmed,now),/NOT_CONFIRMED/);
 for(const patch of [{signal_id:'other'},{new_status:'waiting'},{price:null},{price:NaN},{price:0},{reason:'manual_approval'},{created_at:'2026-10-30T06:01:00Z'},{created_at:'2026-10-30T04:00:00Z'}])assert.throws(()=>assertConfirmedEntry(signal,{...confirmed,...patch},now),/CONFIRMATION_REQUIRED/);
 assert.throws(()=>assertConfirmedEntry(signal,null,now),/CONFIRMATION_REQUIRED/);
 assert.throws(()=>assertConfirmedEntry({...signal,expires_at:new Date(now).toISOString()},confirmed,now),/CONFIRMATION_REQUIRED/);
});
test('waiting plans never even read a journal and missing observations stay blocked',async()=>{
 await assert.rejects(loadConfirmedEntry({from(){throw Error('unexpected read')}},{...signal,status:'waiting'},now),/NOT_CONFIRMED/);
 let filters:any[]=[];const chain:any={select:()=>chain,eq:(...x:any[])=>{filters.push(x);return chain},order:()=>chain,limit:()=>chain,maybeSingle:async()=>({data:confirmed,error:null})};
 assert.equal(await loadConfirmedEntry({from:()=>chain},signal,now),confirmed);assert.deepEqual(filters,[['signal_id','signal'],['new_status','active']]);
 chain.maybeSingle=async()=>({data:null,error:new Error('unavailable')});await assert.rejects(loadConfirmedEntry({from:()=>chain},signal,now),/CONFIRMATION_REQUIRED/);
});
