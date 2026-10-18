import {test} from 'node:test';import assert from 'node:assert/strict';
import {supabase,isSupabaseClientEnabled,isSupabaseMocked,supabaseConfigErrorMessage,getOfflineTables} from '../../src/lib/supabase';
test('missing frontend configuration cannot report simulated providers, signals, sessions or successful writes',async()=>{
 assert.equal(isSupabaseClientEnabled,false);assert.equal(isSupabaseMocked,false);assert.ok(supabaseConfigErrorMessage);assert.deepEqual(getOfflineTables(),{});
 const providers=await supabase.from('provider_status').select('*');assert.equal(providers.data,null);assert.ok(providers.error);
 const write=await supabase.from('signals').insert({symbol:'BTCUSDT'});assert.ok(write.error);
 const action=await supabase.functions.invoke('market-scanner',{body:{action:'scan'}});assert.ok(action.error);assert.equal(action.data,null);
 assert.equal((await supabase.auth.getSession()).data.session,null);
});
