/** Routing identities may be aliases. E/F truth and its RPCs require the canonical account UUID. */
export async function canonicalExecutionAccountId(store:any,owner:Record<string,any>,provider:'BINANCE'|'BYBIT'):Promise<string>{
 if(!owner.customer_id||!owner.account_id||!owner.execution_instance_id||!owner.credential_ref||!owner.execution_scope_key)throw Error('CANONICAL_ACCOUNT_SCOPE_REQUIRED');
 const result=await store.from('connected_execution_accounts').select('id,environment').eq('customer_id',owner.customer_id).eq('account_id',owner.account_id).eq('provider',provider.toLowerCase()).eq('execution_instance_id',owner.execution_instance_id).eq('credential_ref',owner.credential_ref).limit(2);
 if(result.error||!Array.isArray(result.data)||result.data.length!==1)throw Error('CANONICAL_ACCOUNT_BINDING_REQUIRED');
 const account=result.data[0];
 if(!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(account.id)||String(account.environment).toUpperCase()!==(provider==='BINANCE'?'TESTNET':'DEMO'))throw Error('CANONICAL_ACCOUNT_SANDBOX_REQUIRED');
 return account.id;
}
