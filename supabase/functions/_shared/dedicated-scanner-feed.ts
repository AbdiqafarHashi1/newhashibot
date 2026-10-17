/** Dedicated quote/history feed setup; never adopts a customer execution terminal. */
export async function configureDedicatedScannerFeed(db:any,actor:string,input:{accountId:string;feedIdentity:string;enabled:boolean}){
 if(typeof input.enabled!=='boolean'||!/^[-a-zA-Z0-9_.]{3,80}$/.test(input.feedIdentity))throw Error('VALID_FEED_IDENTITY_REQUIRED');
 const profile=await db.from('profiles').select('role').eq('id',actor).maybeSingle();if(profile.error||profile.data?.role!=='admin')throw Error('ADMIN_REQUIRED');
 const owned=await db.from('mt5_accounts').select('id,user_id,owner_kind,credential_capability,execution_enabled,bridge_id').eq('id',input.accountId).eq('user_id',actor).maybeSingle();const a=owned.data;
 if(owned.error||!a||a.owner_kind!=='system'||a.credential_capability!=='investor'||a.execution_enabled!==false||!a.bridge_id)throw Error('OWNER_INVESTOR_FEED_ACCOUNT_REQUIRED');
 const execution=await db.from('connected_execution_accounts').select('id').eq('provider_account_identity',a.id).limit(1);if(execution.error||execution.data?.length!==0)throw Error('CUSTOMER_EXECUTION_FEED_FORBIDDEN');
 const prior=await db.from('mt5_scanner_feeds').select('*').eq('bridge_id',a.bridge_id).maybeSingle();if(prior.error)throw Error('SCANNER_FEED_READ_FAILED');
 const same=prior.data?.history_account_id===a.id&&prior.data?.feed_identity===input.feedIdentity&&prior.data?.enabled===true;
 const row={bridge_id:a.bridge_id,feed_identity:input.feedIdentity,history_account_id:a.id,owner_controlled:true,execution_account_id:null,enabled:input.enabled,status:input.enabled&&same?prior.data.status:input.enabled?'CONFIGURATION_REQUIRED':'DISABLED',last_heartbeat_at:same?prior.data.last_heartbeat_at:null,last_valid_candle_at:same?prior.data.last_valid_candle_at:null,validation_evidence:same?prior.data.validation_evidence:{}};
 const saved=await db.from('mt5_scanner_feeds').upsert(row,{onConflict:'bridge_id'}).select('id,feed_identity,status,enabled,history_account_id').single();if(saved.error||!saved.data)throw Error('SCANNER_FEED_SAVE_FAILED');return saved.data;
}
