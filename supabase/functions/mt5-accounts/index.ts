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
      const executionMode = String(body.executionMode);
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
    if (body.action === 'set_execution') { if (body.enabled === true) throw new ApiError('MT5_EXECUTION_ADOPTION_DISABLED', 'MT5 execution cannot be enabled during onboarding.', 409); const { error } = await db.from('mt5_accounts').update({ execution_enabled: false, disabled_at: new Date().toISOString() }).eq('id', accountId); if (error) databaseFailure('set_execution', error); return reply({ enabled: false }); }
    if (body.action === 'set_mode') { if (!['personal', 'prop_challenge', 'demo'].includes(String(body.mode))) throw new ApiError('INVALID_MODE', 'Execution mode is invalid.', 400); const { error } = await db.from('mt5_accounts').update({ execution_mode: body.mode }).eq('id', accountId); if (error) databaseFailure('set_mode', error); return reply({ mode: body.mode }); }
    if (body.action === 'test_connection' || body.action === 'sync_account') {
      if (!owned.bridge_id) throw new ApiError('MT5_BRIDGE_OFFLINE', 'No MT5 bridge is connected.', 409);
      const op = body.action === 'test_connection' ? 'TEST_CONNECTION' : 'SYNC_ACCOUNT';
      const bucket = Math.floor(Date.now() / 30_000); // duplicate clicks share one durable key
      const { data, error } = await db.rpc('enqueue_mt5_command', { p_account_id: accountId, p_operation: op, p_payload: { requested_by: user.id, safe_read_only: true, expires_at: new Date(Date.now()+120_000).toISOString() }, p_idempotency_key: `${op.toLowerCase()}:${accountId}:${bucket}` }).single();
      if (error) databaseFailure(body.action, error); return reply({ commandId: data.command_id, status: data.status, operation: op });
    }
    if (body.action === 'request_operational_adoption') {
      const { data: state } = await db.from('mt5_accounts').select('account_type,credential_capability,execution_enabled,operational').eq('id',accountId).single();
      if (state.account_type !== 'demo') throw new ApiError('MT5_DEMO_ONLY','Only Demo activation is supported.',409);
      if (state.credential_capability !== 'master') throw new ApiError('MT5_INVESTOR_ONLY','Replace and validate the Demo Master credential first.',409);
      if (!state.execution_enabled) throw new ApiError('MT5_EXECUTION_DISABLED','Execution must be explicitly enabled after certification.',409);
      if (!state.operational) throw new ApiError('MT5_OPERATIONAL_DISABLED','Operational adoption has not been approved.',409);
      return reply({status:'ADOPTED'});
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
