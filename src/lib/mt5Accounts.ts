import { supabase, supabaseClientConfig } from './supabase';
import type { MT5Account, MT5ExecutionMode } from './exchange/mt5';

export interface MT5AccountActionResult { httpStatus: number; backendCode: string | null; commandId?: string; commandStatus?: string; status?: string; operation?: string }
interface SafeMT5Row { [key: string]: unknown; id:string; user_id:string; broker:string; server:string; account_number_masked:string; nickname:string; currency:string; leverage:number|string; account_type:MT5Account['accountType']; execution_mode:MT5Account['executionMode']; execution_enabled:boolean; connection_status:MT5Account['connectionStatus']; provider_health:MT5Account['providerHealth']; bridge_id?:string|null; last_heartbeat_at?:string|null; last_sync_at?:string|null }

export async function listMT5Accounts(): Promise<MT5Account[]> {
    const { data, error } = await supabase.from('mt5_accounts_safe').select('*').order('created_at');
    if (error) throw new Error(`BACKEND UNAVAILABLE: ${error.message}`);
    return (data ?? []).map((row: SafeMT5Row) => ({
        id: row.id,
        userId: row.user_id,
        broker: row.broker,
        server: row.server,
        accountNumberMasked: row.account_number_masked,
        nickname: row.nickname,
        currency: row.currency,
        leverage: Number(row.leverage),
        accountType: row.account_type,
        executionMode: row.execution_mode,
        executionEnabled: row.execution_enabled === true,
        connectionStatus: row.connection_status,
        providerHealth: row.provider_health,
        bridgeId: row.bridge_id ?? undefined,
        lastHeartbeatAt: row.last_heartbeat_at ?? undefined,
        lastSyncAt: row.last_sync_at ?? undefined
      }));
}
/** Invoke the authenticated MT5 account endpoint with the session that exists at call time. */
async function action(body:Record<string,unknown>){
  const {data:{session},error:sessionError}=await supabase.auth.getSession();
  if(sessionError)throw sessionError;
  if(!session?.access_token)throw new Error('An authenticated session is required to manage MT5 accounts.');

  // functions.invoke accepts per-invocation headers in supabase-js v2. Supplying the
  // current token explicitly avoids the post-login race in which FunctionsClient's
  // cached auth state has not yet observed the new session.
  const response=await fetch(`${supabaseClientConfig.supabaseUrl}/functions/v1/mt5-accounts`,{method:'POST',headers:{Authorization:`Bearer ${session.access_token}`,apikey:supabaseClientConfig.supabaseKey,'Content-Type':'application/json'},body:JSON.stringify(body)});
  let data: { error?: { code?: string; message?: string } | string; code?: string; message?: string; commandId?: string; commandStatus?: string; status?: string; operation?: string };
  try { data=await response.json(); } catch { throw new Error(`MT5 account endpoint returned HTTP ${response.status} without JSON (MT5_INVALID_RESPONSE)`); }
  const nested=typeof data.error==='object'?data.error:null;
  const code=nested?.code??data.code??null;
  const message=nested?.message??data.message??(typeof data.error==='string'?data.error:null);
  if(!response.ok) throw new Error(`HTTP ${response.status}: ${message??'MT5 account action failed'}${code?` (${code})`:''}`);
  return {...data,httpStatus:response.status,backendCode:code} as MT5AccountActionResult;
}
export const connectMT5Account=(input:{broker:string;server:string;accountNumber:string;password:string;nickname:string;currency:string;leverage:number;accountType:'personal'|'prop'|'demo';executionMode:MT5ExecutionMode;ownerKind:'system'|'customer';credentialCapability:'investor'|'master';operational:boolean;monitorEnabled:boolean;policy?:Record<string,unknown>})=>action({action:'connect',...input});
export const setMT5Execution=(accountId:string,enabled:boolean)=>action({action:'set_execution',accountId,enabled});
export const setMT5Mode=(accountId:string,mode:MT5ExecutionMode)=>action({action:'set_mode',accountId,mode});
export const testMT5Connection=(accountId:string)=>action({action:'test_connection',accountId});
export const syncMT5Account=(accountId:string)=>action({action:'sync_account',accountId});
export const requestMT5OperationalAdoption=(accountId:string)=>action({action:'request_operational_adoption',accountId});
export const replaceMT5DemoMasterCredential=(accountId:string,password:string)=>action({action:'replace_demo_master_credential',accountId,password});
export const removeMT5Account=(accountId:string)=>action({action:'remove',accountId});
