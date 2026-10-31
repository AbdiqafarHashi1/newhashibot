import assert from 'node:assert/strict';
import {test} from 'node:test';
import {resolveMt5TerminalRoute} from '../../supabase/functions/_shared/mt5-account-routing';
const terminal='33333333-3333-4333-8333-333333333333';
const row={customer_id:'owner',provider:'MT5_PERSONAL',environment:'demo',account_id:'11111111-1111-4111-8111-111111111111',provider_account_identity:terminal,policy_overrides:{mt5_account_id:terminal,bridge_id:'bridge-a'}};
test('verified MT5 mapping separates logical account from physical terminal and bridge',()=>{
 assert.deepEqual(resolveMt5TerminalRoute(row,'owner'),{mt5AccountId:terminal,bridgeId:'bridge-a'});
 assert.throws(()=>resolveMt5TerminalRoute(row,'other'),/SCOPE/);
 assert.deepEqual(resolveMt5TerminalRoute({...row,environment:'live'},'owner'),{mt5AccountId:terminal,bridgeId:'bridge-a'});
 assert.throws(()=>resolveMt5TerminalRoute({...row,environment:'unknown'},'owner'),/SCOPE/);
 assert.throws(()=>resolveMt5TerminalRoute({...row,provider_account_identity:'other-terminal'},'owner'),/PAIRING/);
 assert.throws(()=>resolveMt5TerminalRoute({...row,policy_overrides:{mt5_account_id:terminal}},'owner'),/PAIRING/);
 assert.throws(()=>resolveMt5TerminalRoute({...row,policy_overrides:{}},'owner'),/PAIRING/);
 assert.deepEqual(resolveMt5TerminalRoute({...row,account_id:terminal,policy_overrides:{}},'owner'),{mt5AccountId:terminal,bridgeId:null});
});
