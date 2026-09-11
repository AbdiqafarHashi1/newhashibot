import 'jsr:@supabase/functions-js/edge-runtime.d.ts';
import { createClient } from 'npm:@supabase/supabase-js@2';

const headers = {
  'Content-Type': 'application/json',
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, apikey, content-type, x-client-info',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  Vary: 'Origin',
};
const reply = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers });
const encode = (value: string) => new TextEncoder().encode(value);
const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

class ApiError extends Error {
  constructor(public code: string, message: string, public status = 500, public details?: string) {
    super(message);
  }
}

type DatabaseError = { code?: string; message?: string; details?: string; hint?: string };

function encryptionSecret(): Uint8Array {
  const value = Deno.env.get('MT5_CREDENTIAL_ENCRYPTION_KEY');
  if (!value) throw new ApiError('MT5_ENCRYPTION_KEY_MISSING', 'MT5 credential encryption is not configured. Contact an administrator.');
  const bytes = encode(value);
  if (bytes.byteLength < 32 || bytes.byteLength > 1024) {
    throw new ApiError('MT5_ENCRYPTION_KEY_MALFORMED', 'MT5 credential encryption key must contain between 32 and 1024 UTF-8 bytes.');
  }
  return bytes;
}

async function encryptionKey() {
  const material = await crypto.subtle.digest('SHA-256', encryptionSecret());
  return crypto.subtle.importKey('raw', material, { name: 'AES-GCM' }, false, ['encrypt']);
}

async function encrypt(value: string) {
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const ciphertext = new Uint8Array(await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, await encryptionKey(), encode(value)));
  const out = new Uint8Array(iv.length + ciphertext.length);
  out.set(iv);
  out.set(ciphertext, iv.length);
  return `\\x${Array.from(out, byte => byte.toString(16).padStart(2, '0')).join('')}`;
}

async function digest(value: string) {
  return Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256', encode(value))), byte => byte.toString(16).padStart(2, '0')).join('');
}

function databaseFailure(operation: string, error: DatabaseError): never {
  throw new ApiError(`MT5_DATABASE_${operation.toUpperCase()}_FAILED`, 'The MT5 account could not be persisted.', 500, error.message);
}

function safeLog(operation: string, error: unknown, context: Record<string, unknown>) {
  const database = error as DatabaseError;
  console.error(JSON.stringify({
    operation,
    error_code: error instanceof ApiError ? error.code : database?.code ?? 'UNEXPECTED_ERROR',
    database: {
      code: database?.code ?? null,
      message: database?.message ?? (error instanceof Error ? error.message : 'Unknown error'),
      details: database?.details ?? null,
      hint: database?.hint ?? null,
    },
    context,
  }));
}

Deno.serve(async req => {
  if (req.method === 'OPTIONS') return new Response(null, { headers });
  let operation = 'parse_request';
  let safeContext: Record<string, unknown> = { method: req.method };
  try {
    if (req.method !== 'POST') throw new ApiError('METHOD_NOT_ALLOWED', 'Only POST is supported.', 405);
    const url = Deno.env.get('SUPABASE_URL');
    const anon = Deno.env.get('SUPABASE_ANON_KEY');
    const service = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
    if (!url || !anon || !service) throw new ApiError('SUPABASE_CONFIGURATION_MISSING', 'The account service is not configured.');

    const match = req.headers.get('Authorization')?.match(/^Bearer\s+(.+)$/i);
    if (!match) throw new ApiError('MISSING_OR_INVALID_AUTHORIZATION', 'Authentication is required.', 401);
    operation = 'authenticate';
    const auth = createClient(url, anon, { auth: { persistSession: false, autoRefreshToken: false } });
    const { data: { user }, error: authError } = await auth.auth.getUser(match[1]);
    if (authError || !user) throw new ApiError('INVALID_JWT', 'The authenticated session is invalid or expired.', 401, authError?.message);

    const db = createClient(url, service, { auth: { persistSession: false, autoRefreshToken: false } });
    // The enqueue RPC authorizes with auth.uid(). Calling it through the service-role
    // client makes auth.uid() null and was the direct cause of
    // MT5_DATABASE_TEST_CONNECTION_FAILED. Preserve the validated caller JWT for
    // ownership checks while retaining the service client for trusted account work.
    const userDb = createClient(url, anon, {
      auth: { persistSession: false, autoRefreshToken: false },
      global: { headers: { Authorization: `Bearer ${match[1]}` } },
    });
    let body: Record<string, unknown>;
    try { body = await req.json(); } catch { throw new ApiError('INVALID_JSON', 'Request body must be valid JSON.', 400); }
    operation = String(body.action ?? 'unknown');
    safeContext = { action: operation, actor_id: user.id };

    if (body.action === 'connect') {
      const accountNumber = String(body.accountNumber ?? '').trim();
      const password = String(body.password ?? '');
      const broker = String(body.broker ?? '').trim();
      const server = String(body.server ?? '').trim();
      const nickname = String(body.nickname ?? '').trim();
      const leverage = Number(body.leverage);
      if (!/^\d{4,20}$/.test(accountNumber) || password.length < 4) throw new ApiError('INVALID_CREDENTIALS', 'Account number or password is invalid.', 400);
      if (!broker || !server || !nickname || !Number.isInteger(leverage) || leverage <= 0) throw new ApiError('INVALID_ACCOUNT_DETAILS', 'Broker, server, nickname, and positive whole-number leverage are required.', 400);
      const accountType = String(body.accountType);
      const executionMode = String(body.executionMode ?? (accountType === 'prop' ? 'prop_challenge' : 'personal'));
      if (!['personal', 'prop', 'demo'].includes(accountType) || !['personal', 'prop_challenge', 'demo'].includes(executionMode)) throw new ApiError('INVALID_CLASSIFICATION', 'Account type or execution mode is invalid.', 400);
      const capability = String(body.credentialCapability ?? 'investor');
      const ownerKind = String(body.ownerKind ?? 'customer');
      if (!['investor', 'master'].includes(capability) || !['system', 'customer'].includes(ownerKind)) throw new ApiError('INVALID_SECURITY_CLASSIFICATION', 'Owner kind or credential capability is invalid.', 400);

      const { data: actorProfile, error: profileError } = await db.from('profiles').select('role').eq('id', user.id).maybeSingle();
      if (profileError) databaseFailure('owner_resolution', profileError);
      const isAdmin = actorProfile?.role === 'admin';
      const requestedOwner = String(body.ownerId ?? user.id);
      if (!uuidPattern.test(requestedOwner)) throw new ApiError('INVALID_OWNER_ID', 'Owner ID must be a canonical UUID.', 400);
      if ((!isAdmin && requestedOwner !== user.id) || (!isAdmin && ownerKind === 'system')) throw new ApiError('OWNER_FORBIDDEN', 'Only an administrator can onboard an account for another owner or the system.', 403);
      safeContext = { ...safeContext, owner_id: requestedOwner, owner_kind: ownerKind, account_type: accountType, credential_capability: capability };

      // Resolve encryption before database work so configuration errors never leave a partial account.
      encryptionSecret();
      const accountHash = await digest(accountNumber);
      const row = {
        user_id: requestedOwner, owner_kind: ownerKind, broker, server,
        account_number_ciphertext: await encrypt(accountNumber), password_ciphertext: await encrypt(password),
        account_number_hash: accountHash, account_number_last4: accountNumber.slice(-4), nickname,
        currency: String(body.currency ?? 'USD').trim().toUpperCase(), leverage,
        account_type: accountType, execution_mode: executionMode, credential_capability: capability,
        operational: body.operational === true, monitor_enabled: body.monitorEnabled !== false,
        execution_enabled: false, connection_status: 'pending', policy: body.policy ?? {},
      };
      let { data: inserted, error: insertError } = await db.from('mt5_accounts').insert(row).select('id,credential_ref').single();
      if (insertError?.code === '23505') {
        const existing = await db.from('mt5_accounts').select('id,credential_ref').eq('user_id', requestedOwner).eq('broker', broker).eq('server', server).eq('account_number_hash', accountHash).maybeSingle();
        if (existing.error) databaseFailure('duplicate_read', existing.error);
        if (!existing.data) throw new ApiError('MT5_ACCOUNT_DUPLICATE', 'An MT5 account with conflicting identity already exists.', 409, insertError.message);
        inserted = existing.data;
      } else if (insertError) databaseFailure('insert', insertError);
      if (!inserted || !uuidPattern.test(inserted.id) || !uuidPattern.test(inserted.credential_ref)) throw new ApiError('INVALID_PERSISTED_IDENTITY', 'The database returned an invalid account identity.');

      const { data: account, error: readError } = await db.from('mt5_accounts_safe').select('*').eq('id', inserted.id).eq('user_id', requestedOwner).single();
      if (readError) databaseFailure('safe_read', readError);
      if (account.execution_enabled !== false) throw new ApiError('UNSAFE_EXECUTION_STATE', 'The new MT5 account did not default execution off.');
      return reply({ accountId: inserted.id, ownerId: requestedOwner, credentialRef: inserted.credential_ref, status: 'REGISTERED', account });
    }

    const accountId = String(body.accountId ?? '');
    if (!uuidPattern.test(accountId)) throw new ApiError('INVALID_ACCOUNT_ID', 'Account ID must be a canonical UUID.', 400);
    const { data: owned, error: ownedError } = await db.from('mt5_accounts').select('id,user_id,bridge_id').eq('id', accountId).maybeSingle();
    if (ownedError) databaseFailure('ownership_read', ownedError);
    if (!owned) throw new ApiError('NOT_FOUND', 'MT5 account was not found.', 404);
    const { data: actorProfile } = await db.from('profiles').select('role').eq('id', user.id).maybeSingle();
    if (owned.user_id !== user.id && actorProfile?.role !== 'admin') throw new ApiError('NOT_FOUND', 'MT5 account was not found.', 404);
    if (body.action === 'remove') { const { error } = await db.from('mt5_accounts').delete().eq('id', accountId); if (error) databaseFailure('remove', error); return reply({ removed: true }); }
    if (body.action === 'set_execution') { const enable = Boolean(body.enabled); const { error } = await db.from('mt5_accounts').update({ execution_enabled: enable, connection_status: enable ? 'connected' : 'disabled', provider_health: enable ? 'healthy' : 'unknown', operational: enable, disabled_at: enable ? null : new Date().toISOString() }).eq('id', accountId); if (error) databaseFailure('set_execution', error); return reply({ enabled: enable, connection_status: enable ? 'connected' : 'disabled' }); }
    if (body.action === 'set_mode') { if (!['personal', 'prop_challenge', 'demo'].includes(String(body.mode))) throw new ApiError('INVALID_MODE', 'Execution mode is invalid.', 400); const { error } = await db.from('mt5_accounts').update({ execution_mode: body.mode }).eq('id', accountId); if (error) databaseFailure('set_mode', error); return reply({ mode: body.mode }); }
    if (body.action === 'update_policy') { const policy = typeof body.policy === 'object' && body.policy !== null ? body.policy : {}; const { error } = await db.from('mt5_accounts').update({ policy }).eq('id', accountId); if (error) databaseFailure('update_policy', error); return reply({ updated: true, policy }); }
    if (body.action === 'request_history') {
      if (!owned.bridge_id) throw new ApiError('BRIDGE_OFFLINE', 'No Desktop Bridge is assigned to this account.', 409);
      const version=String(body.version??''),symbol=String(body.symbol??'').trim().toUpperCase(),timeframe=String(body.timeframe??''),from=Date.parse(String(body.from??'')),to=Date.parse(String(body.to??''));
      if(version!=='1.0')throw new ApiError('INVALID_CONTRACT_VERSION','History contract version must be 1.0.',400);
      if(!/^[A-Z0-9._-]{3,32}$/.test(symbol))throw new ApiError('INVALID_SYMBOL','Symbol is invalid.',400);
      if(!['1m','5m','15m','30m','1h','4h','1d'].includes(timeframe))throw new ApiError('INVALID_TIMEFRAME','Unsupported MT5 timeframe.',400);
      if(!Number.isFinite(from)||!Number.isFinite(to)||from>to||to-from>5*366*86_400_000)throw new ApiError('INVALID_HISTORY_RANGE','History range is invalid or exceeds five years.',400);
      const {data:registry}=await db.from('mt5_bridge_registry').select('status,last_heartbeat_at,lease_expires_at,connection_info').eq('bridge_id',owned.bridge_id).maybeSingle();
      if(!registry||registry.status!=='online'||Date.parse(registry.lease_expires_at??'')<=Date.now())throw new ApiError('BRIDGE_OFFLINE','Desktop Bridge heartbeat is offline or stale.',409);
      const requestId=await digest(`${accountId}|${symbol}|${timeframe}|${new Date(from).toISOString()}|${new Date(to).toISOString()}`);
      const payload={version:'1.0',symbol,source_symbol:body.source_symbol||undefined,timeframe,from:new Date(from).toISOString(),to:new Date(to).toISOString(),request_id:requestId,requested_by:user.id,safe_read_only:true,expires_at:new Date(Date.now()+120_000).toISOString()};
      const {data,error}=await userDb.rpc('enqueue_mt5_command',{p_account_id:accountId,p_operation:'FETCH_HISTORY',p_payload:payload,p_idempotency_key:`fetch_history:${requestId}`}).single();
      if(error)databaseFailure('request_history',error);
      return reply({commandId:data?.command_id,requestId,state:'QUEUED'});
    }
    if (body.action === 'history_status') {
      const {data:account}=await db.from('mt5_accounts').select('id,broker,server,account_type,bridge_id').eq('id',accountId).single();
      const {data:registry}=account?.bridge_id?await db.from('mt5_bridge_registry').select('status,last_heartbeat_at,lease_expires_at,connection_info').eq('bridge_id',account.bridge_id).maybeSingle():{data:null};
      const bridgeOnline=Boolean(registry&&registry.status==='online'&&Date.parse(registry.lease_expires_at??'')>Date.now()),info=(registry?.connection_info??{}) as Record<string,unknown>;
      if(body.statusOnly)return reply({cloudApiReachable:true,bridgeStatus:bridgeOnline?'ONLINE':'OFFLINE',terminalStatus:info.terminal_connected===true?'ONLINE':info.terminal_connected===false?'OFFLINE':'UNKNOWN',authenticated:info.terminal_authenticated===true?'YES':info.terminal_authenticated===false?'NO':'UNKNOWN',accountId,broker:account?.broker,server:account?.server,lastBridgeHeartbeat:registry?.last_heartbeat_at});
      const commandId=String(body.commandId??'');if(!uuidPattern.test(commandId))throw new ApiError('INVALID_COMMAND_ID','Command ID is invalid.',400);
      const {data:command}=await db.from('mt5_commands').select('id,account_id,operation,status,result,error_code,error_message,claimed_at,acknowledged_at').eq('id',commandId).eq('account_id',accountId).eq('operation','FETCH_HISTORY').maybeSingle();
      if(!command)throw new ApiError('COMMAND_NOT_FOUND','History command was not found.',404);
      const state=command.status==='confirmed'?'COMPLETED':command.status==='rejected'?(command.error_code==='TERMINAL_DISCONNECTED'||command.error_code==='MT5_HISTORY_UNAVAILABLE'?'MT5_OFFLINE':'FAILED'):command.claimed_at?'CLAIMED':bridgeOnline?'QUEUED':'BRIDGE_OFFLINE';
      return reply({state,result:state==='COMPLETED'?{...command.result,account_id:accountId,environment:account?.account_type}:undefined,errorCode:command.error_code,message:command.error_message,commandId});
    }
    if (body.action === 'test_connection' || body.action === 'sync_account') {
      if (!owned.bridge_id) throw new ApiError('MT5_BRIDGE_OFFLINE', 'No MT5 bridge is connected.', 409);
      const op = body.action === 'test_connection' ? 'TEST_CONNECTION' : 'SYNC_ACCOUNT';
      const bucket = Math.floor(Date.now() / 30_000); // duplicate clicks share one durable key
      const { data, error } = await userDb.rpc('enqueue_mt5_command', { p_account_id: accountId, p_operation: op, p_payload: { requested_by: user.id, safe_read_only: true, expires_at: new Date(Date.now()+120_000).toISOString() }, p_idempotency_key: `${op.toLowerCase()}:${accountId}:${bucket}` }).single();
      if (error) databaseFailure(body.action, error);
      if (!data?.command_id) throw new ApiError('MT5_COMMAND_ENQUEUE_EMPTY', 'The command queue did not return a durable command.', 500);
      return reply({ commandId: data.command_id, commandStatus: data.status, status: data.status, operation: op, httpStatus: 200 });
    }
    if (body.action === 'request_operational_adoption') {
      const { data: state } = await db.from('mt5_accounts').select('account_type,credential_capability,execution_enabled,operational').eq('id',accountId).single();
      if (!state) throw new ApiError('NOT_FOUND','MT5 account was not found.',404);
      const { error } = await db.from('mt5_accounts').update({ execution_enabled: true, operational: true, connection_status: 'connected', provider_health: 'healthy', disabled_at: null }).eq('id', accountId);
      if (error) databaseFailure('request_operational_adoption', error);
      return reply({ status: 'ADOPTED', execution_enabled: true, operational: true, connection_status: 'connected' });
    }
    if (body.action === 'replace_demo_master_credential') {
      const { data: profile } = await db.from('profiles').select('role').eq('id',user.id).single();
      const { data: state } = await db.from('mt5_accounts').select('account_type').eq('id',accountId).single();
      if (profile?.role !== 'admin') throw new ApiError('ADMIN_REQUIRED','Administrator authentication is required.',403);
      if (state.account_type !== 'demo') throw new ApiError('MT5_DEMO_ONLY','Credentials may only be replaced for Demo.',409);
      const password = String(body.password ?? ''); if(password.length<4) throw new ApiError('INVALID_CREDENTIALS','A Demo Master credential is required.',400);
      const { error } = await db.from('mt5_accounts').update({password_ciphertext:await encrypt(password),credential_capability:'investor',execution_enabled:false,operational:false,connection_status:'pending'}).eq('id',accountId);
      if(error) databaseFailure('credential_replacement',error);
      // Capability remains investor until the bridge validates login and terminal trade permission.
      return reply({status:'VALIDATION_PENDING',capability:'investor'});
    }
    throw new ApiError('UNSUPPORTED_ACTION', 'The requested MT5 account action is not supported.', 400);
  } catch (error) {
    safeLog(operation, error, safeContext);
    const apiError = error instanceof ApiError ? error : new ApiError('MT5_ACCOUNT_OPERATION_FAILED', 'The MT5 account operation failed unexpectedly.');
    return reply({ error: { code: apiError.code, message: apiError.message, details: apiError.details ?? null } }, apiError.status);
  }
});
