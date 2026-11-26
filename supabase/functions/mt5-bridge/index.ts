import {loadGoldTurboLease} from '../_shared/gold-turbo-lease.ts';
import {closedMt5FeedCandles} from '../_shared/mt5-feed-candles.ts';
import {collectMt5ProviderOutcomes} from '../_shared/provider-outcome-collector.ts';
import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import {verifyBridgeAccountEvidence,validateMt5ProviderSnapshot} from "../_shared/bridge-account-evidence.ts";
import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Client-Info, Apikey, X-MT5-Bridge-Token",
};

const encode = new TextEncoder();
const decode = new TextDecoder();
async function bridgeAuthorized(req: Request) {
  const restricted = Deno.env.get("MT5_BRIDGE_TOKEN") ?? "";
  const supplied = req.headers.get("X-MT5-Bridge-Token") ?? "";
  if (restricted.length < 32 || supplied.length !== restricted.length) return false;
  const expected = new Uint8Array(await crypto.subtle.digest("SHA-256", encode.encode(restricted)));
  const actual = new Uint8Array(await crypto.subtle.digest("SHA-256", encode.encode(supplied)));
  let difference = 0;
  for (let i = 0; i < expected.length; i += 1) difference |= expected[i] ^ actual[i];
  return difference === 0;
}
async function decryptCredential(value: string) {
  const secret = Deno.env.get("MT5_CREDENTIAL_ENCRYPTION_KEY") ?? Deno.env.get("MT5_ENCRYPTION_KEY") ?? "";
  if (encode.encode(secret).length < 32) throw new Error("MT5_ENCRYPTION_KEY_MISSING");
  const material = await crypto.subtle.digest("SHA-256", encode.encode(secret));
  const key = await crypto.subtle.importKey("raw", material, { name: "AES-GCM" }, false, ["decrypt"]);
  const hex = value.startsWith("\\x") ? value.slice(2) : value;
  if (!/^[0-9a-f]+$/i.test(hex) || hex.length % 2) throw new Error("MT5_CREDENTIAL_CIPHERTEXT_INVALID");
  const packed = Uint8Array.from(hex.match(/../g) ?? [], byte => Number.parseInt(byte, 16));
  return decode.decode(await crypto.subtle.decrypt({ name: "AES-GCM", iv: packed.slice(0, 12) }, key, packed.slice(12)));
}

interface HeartbeatPayload {
  bridge_id: string;
  status?: string;
  ip_address?: string;
  connection_info?: Record<string, unknown>;
}

interface PollPayload {
  bridge_id: string;
  max_commands?: number;
}

interface AckPayload {
  bridge_id: string;
  command_id: string | number;
  success: boolean;
  error_code?: string;
  error_message?: string;
  result?: Record<string, unknown>;
  result_data?: Record<string, unknown>;
}

interface SyncStatePayload {
  bridge_id: string;
  account_id?: string;
  owner_id?: string;
  worker_id?: string;
  account_number?: string;
  broker?: string;
  snapshot: {
    balance: number;
    equity: number;
    margin: number;
    free_margin: number;
    floating_pnl: number;
    commission?: number;
    swap?: number;
    currency?: string;
  };
  positions?: Array<Record<string, unknown>>;
  orders?: Array<Record<string, unknown>>;
  history?: Array<Record<string, unknown>>;
  reads?: Record<string, boolean>;
}

interface SyncSymbolsPayload {
  bridge_id: string;
  account_id: string;
  specs: Array<{
    canonical_symbol: string;
    broker_symbol: string;
    digits: number;
    point: number;
    contract_size: number;
    volume_min: number;
    volume_max: number;
    volume_step: number;
    stops_level_points?: number;
    fill_policies?: string[];
    tick_size?:number;tick_value?:number;currency_profit?:string;account_currency?:string;quote_to_account_conversion?:number;tick_at?:string;trade_mode?:number;bid?:number;ask?:number;
  }>;
}

function jsonResponse(body: Record<string, unknown>, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 200, headers: corsHeaders });
  }

  const supabaseUrl = Deno.env.get("SUPABASE_URL") ?? "";
  const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
  const supabase = createClient(supabaseUrl, supabaseServiceKey);

  try {
    const url = new URL(req.url);
    const action = url.searchParams.get("action");

    if (!action) {
      return jsonResponse({ success: false, error: "Missing action search parameter" }, 400);
    }

    const body = await req.json().catch(() => ({}));
    if (!(await bridgeAuthorized(req))) {
      return jsonResponse({ success: false, error_code: "BRIDGE_TOKEN_INVALID", message: "Bridge authentication failed" }, 401);
    }

    const scopedBridgeAccount=async(fields:string,credentialRef?:string)=>{
      const accountId=String(body.account_id??''),ownerId=String(body.owner_id??''),bridgeId=String(body.bridge_id??''),workerId=String(body.worker_id??'');
      const [{data:account,error:ae},{data:registry,error:re}]=await Promise.all([
       supabase.from('mt5_accounts').select(fields).eq('id',accountId).eq('user_id',ownerId).eq('bridge_id',bridgeId).maybeSingle(),
       supabase.from('mt5_bridge_registry').select('bridge_id,worker_id,status,lease_expires_at,revoked_at').eq('bridge_id',bridgeId).eq('worker_id',workerId).maybeSingle()]);
      if(ae||re)throw new Error('BRIDGE_ACCOUNT_SCOPE_MISMATCH');
      return verifyBridgeAccountEvidence({account,registry,accountId,ownerId,bridgeId,workerId,credentialRef,allowStarting:action==='retrieve_credential',now:Date.now()});
    };

    if(action==='gold_turbo_lease') {
      try {
        const account=await scopedBridgeAccount('*');
        const lease=await loadGoldTurboLease(supabase,account,{owner:String(body.owner_id),account:String(body.account_id),bridge:String(body.bridge_id),worker:String(body.worker_id)});
        return jsonResponse({success:true,lease});
      } catch(error) {const code=error instanceof Error?error.message:'TURBO_LEASE_DENIED';return jsonResponse({success:false,error_code:code},['TURBO_CONTROL_UNAVAILABLE','BRIDGE_ACCOUNT_SCOPE_MISMATCH'].includes(code)?503:409);}
    }

    if(action==="pair_customer_account"){
      const proof=body.account_proof as Record<string,unknown>|undefined;
      if(!proof||proof.connected!==true||!["demo","live"].includes(String(proof.environment))||proof.trade_allowed!==true||proof.trade_expert!==true)return jsonResponse({success:false,error_code:"VERIFIED_TERMINAL_REQUIRED"},409);
      const code=String(body.pairing_code??"");if(!/^\d{10}$/.test(code))return jsonResponse({success:false,error_code:"PAIRING_INVALID"},400);
      const hash=Array.from(new Uint8Array(await crypto.subtle.digest("SHA-256",new TextEncoder().encode(code)))).map(x=>x.toString(16).padStart(2,"0")).join("");
      const {data,error}=await supabase.rpc("consume_customer_environment_pairing",{p_environment:String(proof.environment),p_customer_id:String(body.owner_id??""),p_execution_account_id:String(body.execution_account_id??""),p_mt5_account_id:String(body.account_id??""),p_bridge_id:String(body.bridge_id??""),p_worker_id:String(body.worker_id??""),p_code_hash:hash});
      if(error||data?.state!=="CONNECTED")return jsonResponse({success:false,error_code:String(data?.reason??"PAIRING_NOT_CONFIRMED")},409);
      return jsonResponse({success:true,pairing:data});
    }

    if (action === "register_bridge") {
      const bridgeId = String(body.bridge_id ?? ""), workerId = String(body.worker_id ?? "");
      if (!bridgeId || !workerId) return jsonResponse({ success: false, error_code: "BRIDGE_REGISTRATION_FAILED", message: "Bridge and worker identity are required" }, 400);
      const { data, error } = await supabase.rpc("register_mt5_bridge", {
        p_bridge_id: bridgeId, p_worker_id: workerId, p_hostname: String(body.hostname ?? "unknown"),
        p_platform: String(body.platform ?? "unknown"), p_agent_version: String(body.agent_version ?? "unknown"),
        p_process_id: String(body.process_id ?? "unknown"), p_supported_classes: body.supported_account_classes ?? ["demo", "personal", "prop"]
      });
      if (error) {
        const duplicate = error.message.includes("BRIDGE_ALREADY_ACTIVE");
        return jsonResponse({ success: false, error_code: duplicate ? "BRIDGE_ALREADY_ACTIVE" : "BRIDGE_REGISTRATION_FAILED", message: duplicate ? "Bridge ID has a healthy active lease" : "Bridge registration failed" }, duplicate ? 409 : 500);
      }
      return jsonResponse({ success: true, registry: data?.[0] ?? data });
    }

    if (action === "assign_account") {
      const { data, error } = await supabase.rpc("assign_mt5_bridge_account", {
        p_bridge_id: String(body.bridge_id ?? ""), p_worker_id: String(body.worker_id ?? ""),
        p_account_id: String(body.account_id ?? ""), p_owner_id: String(body.owner_id ?? ""),
        p_credential_ref: String(body.credential_ref ?? "")
      });
      if (error) {
        const known = ["ACCOUNT_NOT_FOUND", "ACCOUNT_OWNER_MISMATCH", "ACCOUNT_ALREADY_ASSIGNED", "CREDENTIAL_REF_MISMATCH", "BRIDGE_ALREADY_ACTIVE"];
        const code = known.find(value => error.message.includes(value)) ?? (error.code ? "DATABASE_ERROR" : "ACCOUNT_ASSIGNMENT_FAILED");
        return jsonResponse({ success: false, error_code: code, message: code === "DATABASE_ERROR" ? "Database operation failed" : code.replaceAll("_", " ").toLowerCase() }, code === "DATABASE_ERROR" ? 500 : 409);
      }
      return jsonResponse({ success: true, assignment: data?.[0] ?? data });
    }

    if (action === "discover_accounts") {
      const bridgeId = String(body.bridge_id ?? "");
      const workerId = String(body.worker_id ?? "");
      const { data: registry, error: registryError } = await supabase.from("mt5_bridge_registry").select("bridge_id,worker_id,status,last_heartbeat_at").eq("bridge_id", bridgeId).eq("worker_id", workerId).maybeSingle();
      if (registryError) return jsonResponse({ success: false, error_code: "DATABASE_ERROR", message: "Database operation failed" }, 500);
      if (!registry) return jsonResponse({ success: false, error_code: "BRIDGE_ACCOUNT_SCOPE_MISMATCH", message: "Bridge is not registered for this worker" }, 403);
      const explicit = Array.isArray(body.account_ids) ? body.account_ids.map(String) : [];
      let query = supabase.from("mt5_accounts").select("id,user_id,broker,server,account_type,execution_mode,policy,credential_ref,credential_capability,execution_enabled,operational,bridge_id").eq("bridge_id", bridgeId);
      if (explicit.length) query = query.in("id", explicit);
      const { data, error } = await query;
      if (error) return jsonResponse({ success: false, error_code: "DATABASE_ERROR", message: "Database operation failed" }, 500);
      return jsonResponse({
        success: true,
        accounts: (data ?? []).map(a => {
          const isProp = a.account_type === "prop" || a.execution_mode === "prop_challenge";
          return {
            account_id: a.id,
            owner_id: a.user_id,
            broker: a.broker,
            server: a.server,
            account_class: a.account_type,
            execution_mode: a.execution_mode ?? (isProp ? "prop_challenge" : "personal"),
            execution_strategy: isProp ? "prop_firm_guardian" : "account_growth_accelerator",
            policy: a.policy ?? {},
            credential_ref: a.credential_ref,
            credential_capability: a.credential_capability,
            execution_enabled: a.execution_enabled,
            operational: a.operational,
            bridge_id: a.bridge_id,
          };
        }),
      });
    }

    if (action === "retrieve_credential") {
      const account=await scopedBridgeAccount("id,user_id,bridge_id,credential_ref,credential_capability,execution_enabled,operational,account_number_ciphertext,password_ciphertext,server,account_type,execution_mode,policy",String(body.credential_ref??''));
      try {
        const isProp = account.account_type === "prop" || account.execution_mode === "prop_challenge";
        return jsonResponse({
          success: true,
          credential: {
            login: await decryptCredential(account.account_number_ciphertext),
            password: await decryptCredential(account.password_ciphertext),
            server: account.server,
            capability: account.credential_capability,
            execution_enabled: account.execution_enabled,
            account_type: account.account_type,
            execution_mode: account.execution_mode ?? (isProp ? "prop_challenge" : "personal"),
            execution_strategy: isProp ? "prop_firm_guardian" : "account_growth_accelerator",
            policy: account.policy ?? {},
          },
        });
      } catch { return jsonResponse({ success: false, error_code: "MT5_CREDENTIAL_DECRYPTION_FAILED" }, 500); }
    }

    // ─── 1. HEARTBEAT ACTION ───────────────────────────────────────────────
    if (action === "heartbeat") {
      const payload = body as HeartbeatPayload;
      if (!payload.bridge_id) {
        return jsonResponse({ success: false, error: "Missing bridge_id" }, 400);
      }
      const accountId = String((body as Record<string, unknown>).account_id ?? "");
      const bridgeId = String(payload.bridge_id ?? "");
      const workerId = String((body as Record<string, unknown>).worker_id ?? "worker-local-01");

      const ownerId=String((body as Record<string,unknown>).owner_id??"");
      const {data:assigned,error:scopeError}=await supabase.from("mt5_accounts").select("id").eq("id",accountId).eq("user_id",ownerId).eq("bridge_id",bridgeId).maybeSingle();
      const {data:worker}=await supabase.from("mt5_bridge_registry").select("bridge_id").eq("bridge_id",bridgeId).eq("worker_id",workerId).maybeSingle();
      if(scopeError||!assigned||!worker)return jsonResponse({success:false,error_code:"BRIDGE_ACCOUNT_SCOPE_MISMATCH"},403);
      const bridgeStatus = payload.status ?? "online";
      let { data, error } = await supabase
        .from("mt5_bridge_registry")
        .update({
          last_heartbeat_at: new Date().toISOString(),
          lease_expires_at: new Date(Date.now() + 45_000).toISOString(),
          status: bridgeStatus,
          ip_address: payload.ip_address,
          connection_info: payload.connection_info ?? {},
          startup_stage: "heartbeat",
          command_polling_state: "active",
        })
        .eq("bridge_id", bridgeId)
        .select()
        .maybeSingle();

      if (error) {
        return jsonResponse({ success: false, error_code: "DATABASE_ERROR", message: "Database operation failed" }, 500);
      }

      if (!data) {
        const { data: upsertData } = await supabase
          .from("mt5_bridge_registry")
          .upsert({
            bridge_id: bridgeId,
            worker_id: workerId,
            last_heartbeat_at: new Date().toISOString(),
            lease_expires_at: new Date(Date.now() + 45_000).toISOString(),
            status: bridgeStatus,
            ip_address: payload.ip_address,
            connection_info: payload.connection_info ?? {},
            startup_stage: "heartbeat",
            command_polling_state: "active",
          })
          .select()
          .maybeSingle();
        data = upsertData;
      }

      // Also update connection_status in mt5_accounts
      let accQuery = supabase.from("mt5_accounts").update({
        last_heartbeat_at: new Date().toISOString(),
        connection_status: bridgeStatus === "online" ? "connected" : "disconnected",
        provider_health: bridgeStatus === "online" ? "healthy" : "unknown",
        operational: bridgeStatus === "online",
        updated_at: new Date().toISOString(),
      });
      if (accountId) accQuery = accQuery.eq("id", accountId);
      else accQuery = accQuery.eq("bridge_id", bridgeId);
      await accQuery;

      const {data:connections}=await supabase.from("provider_connections").select("execution_account_id").eq("customer_id",ownerId).eq("bridge_identity",bridgeId).eq("state","CONNECTED").contains("capabilities",{mt5_account_id:accountId});
      const ids=(connections??[]).map((c:{execution_account_id:string})=>c.execution_account_id);
      if(ids.length){const now=new Date().toISOString();await supabase.from("provider_connections").update({last_heartbeat_at:now}).eq("customer_id",ownerId).eq("bridge_identity",bridgeId).in("execution_account_id",ids);await supabase.from("connected_execution_accounts").update({last_synchronized_at:now,provider_health:bridgeStatus==="online"?"healthy":"unknown"}).eq("customer_id",ownerId).in("id",ids)}
      return jsonResponse({ success: true, registry: data || { bridge_id: bridgeId, status: bridgeStatus } });
    }

    // ─── 2. POLL COMMANDS ACTION ───────────────────────────────────────────
    if (action === "poll_commands") {
      const payload = body as PollPayload;
      if (!payload.bridge_id) {
        return jsonResponse({ success: false, error: "Missing bridge_id" }, 400);
      }
      if (!(body as Record<string, unknown>).account_id || !(body as Record<string, unknown>).owner_id) return jsonResponse({ success: false, error_code: "BRIDGE_ACCOUNT_SCOPE_MISMATCH" }, 403);

      const nowIso = new Date().toISOString();

      const { data: commands, error: selectErr } = await supabase.rpc("claim_mt5_command", {
        p_account_id: String((body as Record<string, unknown>).account_id),
        p_owner_id: String((body as Record<string, unknown>).owner_id),
        p_bridge_id: payload.bridge_id,
        p_worker_id: String((body as Record<string, unknown>).worker_id ?? "unknown"),
      });

      if (selectErr) {
        return jsonResponse({ success: false, error: `Failed to poll mt5_commands: ${selectErr.message}` }, 500);
      }

      if (commands && commands.length > 0) {
        const certified: typeof commands = [];
        for (const command of commands) {
          if(command.operation==='OPEN_POSITION'){const a=await supabase.from('connected_execution_accounts').select('id,account_mode,runtime_control').eq('customer_id',String(body.owner_id)).eq('provider_account_identity',String(command.account_id)).maybeSingle();if(a.error||!a.data||a.data.runtime_control!=='START')continue;if(a.data.account_mode==='PROP_FUNDED'){const g=await supabase.from('prop_profit_cycles').select('state').eq('execution_account_id',a.data.id).order('cycle_number',{ascending:false}).limit(1).maybeSingle();if(g.error||g.data?.state!=='ACTIVE')continue;}}
          if(['CLOSE_POSITION','CANCEL_ORDER'].includes(command.operation)&&command.payload?.weekend_rotation){const p=await supabase.rpc('authorize_weekend_management',{p_command:command.id,p_owner:String(body.owner_id),p_account:String(command.account_id),p_bridge:payload.bridge_id});if(p.error||!p.data)continue;(command as any).weekend_authorization=p.data;}
          if(['CLOSE_POSITION','CANCEL_ORDER'].includes(command.operation)&&command.payload?.expiry_entitlement_id){const p=await supabase.rpc('authorize_expiry_management',{p_command:command.id,p_owner:String(body.owner_id),p_account:String(command.account_id),p_bridge:payload.bridge_id});if(p.error||!p.data)continue;(command as any).expiry_authorization=p.data;}
          if(['CLOSE_POSITION','CANCEL_ORDER'].includes(command.operation)&&command.payload?.prop_profit_cycle_id){const p=await supabase.rpc('authorize_prop_profit_management',{p_command:command.id,p_owner:String(body.owner_id),p_account:String(command.account_id),p_bridge:payload.bridge_id});if(p.error||!p.data)continue;(command as any).profit_guard_authorization=p.data;}
          if (["TEST_CONNECTION","SYNC_ACCOUNT","FETCH_HISTORY","RECOVER_PROTECTION","MODIFY_PROTECTION","PARTIAL_CLOSE","MOVE_TO_BREAKEVEN","CLOSE_POSITION","CANCEL_ORDER"].includes(command.operation)) { certified.push(command); continue; }
          const planId = String(command.payload?.execution_plan_id ?? ""), identity = String(command.payload?.deterministic_identity ?? "");
          if (command.operation !== "OPEN_POSITION" || command.payload?.certified !== true || !planId || identity !== command.idempotency_key) continue;
          const { data: claim } = await supabase.from("certified_runtime_claims").select("id").eq("execution_plan_id",planId).eq("account_id",String(command.account_id)).eq("state","completed").maybeSingle();
          if (claim) certified.push(command);
        }
        if (!certified.length) return jsonResponse({ success:true, commands:[], uncertified_commands_blocked:true });
        const claimed = certified.map(c => ({
          ...c,
          status: "accepted",
          claimed_at: nowIso,
        }));

        return jsonResponse({ success: true, commands: claimed });
      }

      // The Phase 5 fallback queue has no certified plan/claim lineage and may
      // never be polled into provider execution.
      return jsonResponse({ success: true, commands: [], legacy_queue_disabled: true });
    }

    // ─── 3. ACKNOWLEDGE COMMAND ACTION ──────────────────────────────────────
    if (action === "ack_command") {
      const payload = body as AckPayload;
      if (!payload.bridge_id || !payload.command_id) {
        return jsonResponse({ success: false, error: "Missing bridge_id or command_id" }, 400);
      }

      const finalStatus = payload.success ? "confirmed" : "rejected";
      const resultObj = payload.result || payload.result_data || {};
      const nowIso = new Date().toISOString();

      // First try primary mt5_commands table
      const { data: updatedCommand, error: cmdErr } = await supabase
        .from("mt5_commands")
        .update({
          status: finalStatus,
          acknowledged_at: nowIso,
          error_code: payload.error_code ?? null,
          error_message: payload.error_message ?? null,
          result: resultObj,
        })
        .eq("id", payload.command_id)
        .eq("bridge_id", payload.bridge_id)
        .eq("account_id", String((body as Record<string, unknown>).account_id ?? ""))
        .select()
        .maybeSingle();

      if (!cmdErr && updatedCommand) {
        if (updatedCommand.operation === "OPEN_POSITION") {
          const accountId = String((body as Record<string, unknown>).account_id ?? "");
          const rawState = String(resultObj.lifecycle_event ?? resultObj.status ?? "").toUpperCase();
          const lifecycleEvent = !payload.success ? "ORDER_REJECTED"
            : ["FILLED","FILL_CONFIRMED"].includes(rawState) ? "FILL_CONFIRMED"
            : ["PARTIAL","PARTIALLY_FILLED","PARTIAL_FILL"].includes(rawState) ? "PARTIAL_FILL"
            : ["TP1_FILLED","BREAKEVEN_CONFIRMED","TP2_FILLED","POSITION_CLOSED","SUBMISSION_UNCERTAIN"].includes(rawState) ? rawState
            : rawState === "PROTECTION_CONFIRMED" ? "PROTECTION_CONFIRMED"
            : rawState === "PROTECTION_MISSING" ? "PROTECTION_MISSING"
            : rawState === "PROTECTION_FAILED" ? "PROTECTION_FAILED" : null;
          if (lifecycleEvent) {
            const { error: lifecycleError } = await supabase.rpc("record_phase_e_mt5_lifecycle", {
              p_command_id: updatedCommand.id, p_account_id: accountId,
              p_bridge_id: payload.bridge_id, p_event: lifecycleEvent, p_evidence: resultObj,
            });
            if (lifecycleError) return jsonResponse({ success: false, error_code: "MT5_LIFECYCLE_PERSIST_FAILED" }, 409);
          }
        }
        if (updatedCommand.operation === "TEST_CONNECTION") {
          await supabase.from("mt5_certification_results").upsert({
            account_id: updatedCommand.account_id,
            owner_id: String((body as Record<string, unknown>).owner_id ?? ""),
            bridge_id: payload.bridge_id,
            check_key: "command_path",
            status: payload.success ? "PASS" : "FAIL",
            error_code: payload.success ? null : payload.error_code ?? "TEST_CONNECTION_FAILED",
            evidence: { command_id: payload.command_id, command_status: finalStatus, result: resultObj },
            checked_at: nowIso,
          }, { onConflict: "account_id,check_key" });
        }
        return jsonResponse({ success: true, command_id: payload.command_id, status: finalStatus, command: updatedCommand });
      }

      return jsonResponse({ success: false, error_code: "MT5_COMMAND_SCOPE_MISMATCH" }, 404);
    }

    // ─── 4. SYNCHRONIZE STATE & EVALUATE RULES ──────────────────────────────
    if (action === "sync_state") {
      const payload = body as SyncStatePayload;
      if (!payload.bridge_id) {
        return jsonResponse({ success: false, error: "Missing bridge_id" }, 400);
      }

      validateMt5ProviderSnapshot(body);
      const snap = payload.snapshot;
      const positions = payload.positions || [];
      const orders = payload.orders || [];
      const nowIso = new Date().toISOString();

      // An explicit authenticated worker/account binding is required; never infer a tenant.
      const targetAccountId=String(body.account_id??'');
      if(!targetAccountId)throw new Error('BRIDGE_ACCOUNT_SCOPE_MISMATCH');
      if (targetAccountId) {
        const target=await scopedBridgeAccount("id,user_id,bridge_id,credential_capability,execution_enabled,account_type,execution_mode,policy,broker,server");
        const realOwnerId=String(target.user_id);

        // Insert snapshot into mt5_account_snapshots
        const { error: snapshotError } = await supabase
          .from("mt5_account_snapshots")
          .insert({
            account_id: target.id,
            owner_id: realOwnerId,
            bridge_id: payload.bridge_id,
            worker_id: payload.worker_id ?? "worker-local-01",
            balance: snap.balance,
            equity: snap.equity,
            margin: snap.margin,
            free_margin: snap.free_margin,
            floating_pnl: snap.floating_pnl,
            commission: snap.commission ?? 0,
            swap: snap.swap ?? 0,
            currency: snap.currency ?? "USD",
            positions,
            orders,
            history: payload.history ?? [],
            read_status: payload.reads ?? {},
            broker: payload.broker,
            server: (snap as Record<string, unknown>).server,
            login: payload.account_number,
            account_name: (snap as Record<string, unknown>).account_name,
            leverage: (snap as Record<string, unknown>).leverage,
            margin_level: (snap as Record<string, unknown>).margin_level,
            trade_permission: (snap as Record<string, unknown>).trade_permission === true,
            terminal_autotrading: (snap as Record<string, unknown>).autotrading === true,
            terminal_authenticated: (snap as Record<string, unknown>).terminal_authenticated === true,
            terminal_identity: { ...((snap as Record<string, unknown>).terminal as Record<string, unknown> ?? {}), account_login: payload.account_number, account_server: (snap as Record<string, unknown>).server, economic_calendar: (snap as Record<string, unknown>).economic_calendar ?? null, hedging: (snap as Record<string, unknown>).hedging === true, provider_environment: (snap as Record<string, unknown>).environment },
            open_positions_count: positions.length,
            pending_orders_count: orders.length,
            captured_at: nowIso,
          });

        if (snapshotError) {
          throw new Error("MT5_SNAPSHOT_NOT_PERSISTED");
        }
        const historyCoverage=(snap as Record<string,any>).history_coverage;
        if(historyCoverage){
          const logical=await supabase.from('connected_execution_accounts').select('id,customer_id,provider').eq('customer_id',realOwnerId).eq('provider_account_identity',target.id).in('provider',['MT5_PERSONAL','MT5_PROP']).limit(2);
          if(logical.error||logical.data?.length!==1)throw new Error('MT5_OUTCOME_ACCOUNT_MAPPING_REQUIRED');
          await collectMt5ProviderOutcomes(supabase,{customer_id:realOwnerId,account_id:logical.data[0].id},logical.data[0].provider,{from:historyCoverage.from,to:historyCoverage.to,currency:String(snap.currency??''),deals:payload.history??[]});
        }


        // Update mt5_accounts connection status & heartbeat
        const verifiedTradePermission = (snap as Record<string, unknown>).trade_permission === true;
        await supabase
          .from("mt5_accounts")
          .update({
            last_sync_at: nowIso,
            last_heartbeat_at: nowIso,
            connection_status: "connected",
            provider_health: "healthy",
            operational: true,
            terminal_authenticated: true,
            trade_permission: verifiedTradePermission,
            terminal_autotrading: (snap as Record<string, unknown>).autotrading === true,
            bridge_id: payload.bridge_id,
            ...(verifiedTradePermission ? { credential_capability: "master" } : {}),
            updated_at: nowIso,
          })
          .eq("id", target.id);

        // 4B. Account Rules Evaluation (Prop Firm Guardian vs Account Growth Accelerator)
        let breached = false;
        let breachReason: string | null = null;

        let profile: Record<string, unknown> | null = null;
        if (payload.account_number) {
          const { data: p } = await supabase
            .from("mt5_account_profiles")
            .select("*")
            .eq("account_number", payload.account_number)
            .maybeSingle();
          profile = p;
        }

        const isPropMode = (
          target?.account_type === "prop" ||
          target?.execution_mode === "prop_challenge" ||
          profile?.profile_mode === "prop"
        );
        const executionMode = target?.execution_mode ?? (isPropMode ? "prop_challenge" : "personal");
        const executionStrategy = isPropMode ? "prop_firm_guardian" : "account_growth_accelerator";

        if (isPropMode) {
          // Prop Firm Guardian Mode: Strict Drawdown & Daily Loss Enforcement
          const policyObj = (target?.policy as Record<string, unknown> | null) ?? {};
          const profileState = (profile?.account_state as Record<string, unknown> | null) ?? {};
          const startBalance = Number(policyObj.starting_balance ?? profileState.starting_balance ?? snap.balance);
          const drawdownLimit = Number(policyObj.drawdown_limit_pct ?? profile?.drawdown_limit_pct ?? 5.00);
          const maxDailyLoss = Number(policyObj.max_daily_loss_pct ?? profile?.max_daily_loss_pct ?? 5.00);

          const maxDrawdownAmount = startBalance * (drawdownLimit / 100);
          const maxDailyLossAmount = snap.balance * (maxDailyLoss / 100);

          const currentDrawdown = startBalance - snap.equity;
          if (currentDrawdown >= maxDrawdownAmount) {
            breached = true;
            breachReason = `Prop Firm Guardian: Maximum drawdown breach of $${currentDrawdown.toFixed(2)} exceeds cap of $${maxDrawdownAmount.toFixed(2)} (${drawdownLimit}%)`;
          }

          const dailyLoss = snap.balance - snap.equity;
          if (dailyLoss >= maxDailyLossAmount) {
            breached = true;
            breachReason = `Prop Firm Guardian: Daily loss limit breach of $${dailyLoss.toFixed(2)} exceeds daily limit of $${maxDailyLossAmount.toFixed(2)} (${maxDailyLoss}%)`;
          }
        } else {
          // Personal Growth Accelerator Mode: Custom Risk Limits from Policy
          const policyObj = (target?.policy as Record<string, unknown> | null) ?? {};
          const maxPersonalDrawdownPct = Number(policyObj.max_drawdown_limit_pct ?? 0);
          if (maxPersonalDrawdownPct > 0) {
            const startBalance = Number(policyObj.starting_balance ?? snap.balance);
            const maxDrawdownAmount = startBalance * (maxPersonalDrawdownPct / 100);
            const currentDrawdown = startBalance - snap.equity;
            if (currentDrawdown >= maxDrawdownAmount) {
              breached = true;
              breachReason = `Personal Growth Accelerator: Drawdown stop of $${currentDrawdown.toFixed(2)} exceeds personal stop of $${maxDrawdownAmount.toFixed(2)} (${maxPersonalDrawdownPct}%)`;
            }
          }
        }

        if (breached) {
          // 1. Immediately disable execution on mt5_accounts to safeguard user account
          if (target && target.execution_enabled) {
            await supabase
              .from("mt5_accounts")
              .update({
                execution_enabled: false,
                connection_status: "disabled",
                provider_health: "unhealthy",
                disabled_at: nowIso,
                updated_at: nowIso,
              })
              .eq("id", target.id);
          }

          // 2. Lock mt5_account_profiles if one exists
          if (profile && !profile.is_locked) {
            await supabase
              .from("mt5_account_profiles")
              .update({
                is_locked: true,
                last_breach_at: nowIso,
                is_enabled: false,
              })
              .eq("id", profile.id);
          }

          // 3. Log critical operator runtime event
          await supabase.from("operator_runtime_events").insert({
            action: "mt5_rule_breach_lock",
            provider: "mt5",
            route: "/functions/v1/mt5-bridge",
            function_name: "mt5-bridge",
            started_at: nowIso,
            status: "CRITICAL",
            exact_error: breachReason,
            blocker: "Rule Violation",
            result_summary: `MT5 Account [${executionStrategy}] Locked due to Rule Breach`,
            source: "mt5_rules_evaluator",
            raw: {
              account_id: target?.id ?? null,
              account_number: payload.account_number,
              execution_strategy: executionStrategy,
              execution_mode: executionMode,
              balance: snap.balance,
              equity: snap.equity,
              breach_reason: breachReason,
            },
          });
        }

        // Update profile account state if profile exists
        if (profile) {
          const patch: Record<string, unknown> = {
            account_state: {
              balance: snap.balance,
              equity: snap.equity,
              margin: snap.margin,
              unrealized_pnl: snap.floating_pnl,
              positions,
              last_sync_at: nowIso,
            },
          };
          await supabase.from("mt5_account_profiles").update(patch).eq("id", profile.id);
        }

        return jsonResponse({
          success: true,
          account_id: target.id,
          execution_mode: executionMode,
          execution_strategy: executionStrategy,
          is_prop_mode: isPropMode,
          breached,
          breach_reason: breachReason,
          balance: snap.balance,
          equity: snap.equity,
          drawdown_pct: snap.balance > 0 ? Number((((snap.balance - snap.equity) / snap.balance) * 100).toFixed(2)) : 0,
        });
      } else return jsonResponse({ success: false, error_code: "BRIDGE_ACCOUNT_SCOPE_MISMATCH" }, 403);

      return jsonResponse({
        success: true,
        account_id: targetAccountId || null,
        breached,
        breach_reason: breachReason,
      });
    }

    // ─── 5. SYNCHRONIZE SYMBOL SPECS ACTION ────────────────────────────────
    if (action === "sync_symbols") {
      const payload = body as SyncSymbolsPayload;
      if (!payload.bridge_id || !payload.account_id || !Array.isArray(payload.specs)) {
        return jsonResponse({ success: false, error: "Missing bridge_id, account_id, or specs array" }, 400);
      }

      await scopedBridgeAccount("id,user_id,bridge_id");
      const nowIso = new Date().toISOString();
      const rows = payload.specs.map(spec => ({
        account_id: payload.account_id,
        canonical_symbol: spec.canonical_symbol,
        broker_symbol: spec.broker_symbol,
        digits: spec.digits,
        point: spec.point,
        contract_size: spec.contract_size,
        volume_min: spec.volume_min,
        volume_max: spec.volume_max,
        volume_step: spec.volume_step,
        stops_level_points: spec.stops_level_points ?? 0,
        fill_policies: spec.fill_policies ?? [],
        tick_size:spec.tick_size??null,tick_value:spec.tick_value??null,currency_profit:spec.currency_profit??null,account_currency:spec.account_currency??null,quote_to_account_conversion:spec.quote_to_account_conversion??null,tick_at:spec.tick_at??null,trade_mode:spec.trade_mode??null,bid:spec.bid??null,ask:spec.ask??null,
        synchronized_at: nowIso,
      }));

      if (rows.length > 0) {
        const { error: upsertErr } = await supabase
          .from("mt5_symbol_specs")
          .upsert(rows, { onConflict: "account_id,canonical_symbol" });

        if (upsertErr) {
          return jsonResponse({ success: false, error: `Symbol specs sync failed: ${upsertErr.message}` }, 500);
        }
      }

      return jsonResponse({ success: true, synced_count: rows.length });
    }

    if (action === "publish_market_data") {
      const accountId=String(body.account_id??""), ownerId=String(body.owner_id??""), bridgeId=String(body.bridge_id??""), feedIdentity=String(body.feed_identity??"");
      const {data:scannerFeed}=await supabase.from("mt5_scanner_feeds").select("id,bridge_id,feed_identity,enabled,owner_controlled,execution_account_id,history_account_id").eq("bridge_id",bridgeId).eq("feed_identity",feedIdentity).maybeSingle();
      if(!scannerFeed||!scannerFeed.enabled||!scannerFeed.owner_controlled||scannerFeed.execution_account_id!==null)return jsonResponse({success:false,error_code:"MT5_DEDICATED_FEED_NOT_AUTHORIZED"},403);
      if(scannerFeed.history_account_id!==accountId)return jsonResponse({success:false,error_code:"MT5_FEED_HISTORY_ACCOUNT_MISMATCH"},403);
      let accData:Record<string,unknown>;
      try{accData=await scopedBridgeAccount("id,user_id,bridge_id,owner_kind,credential_capability,execution_enabled")}catch{return jsonResponse({success:false,error_code:"MT5_FEED_ACCOUNT_OWNERSHIP_REQUIRED"},403)}
      if(accData.owner_kind!=="system"||accData.credential_capability!=="investor"||accData.execution_enabled!==false)return jsonResponse({success:false,error_code:"MT5_OWNER_INVESTOR_FEED_REQUIRED"},403);
      const effAccountId=accData.id,effOwnerId=accData.user_id;
      const feeds=Array.isArray(body.feeds)?body.feeds:[]; let candleCount=0;
      const required=["EURUSD","GBPUSD","USDJPY","AUDUSD","USDCAD","XAUUSD"];
      const received=feeds.map((feed:Record<string,unknown>)=>String(feed.canonical_symbol));
      const validFeed=(feed:Record<string,unknown>)=>required.includes(String(feed.canonical_symbol))&&Number(feed.bid)>0&&Number(feed.ask)>0&&Number(feed.ask)>=Number(feed.bid)&&Number.isFinite(new Date(String(feed.last_update_at)).getTime())&&Array.isArray(feed.candles)&&["5m","15m","1h","4h"].every(tf=>(feed.candles as Array<Record<string,unknown>>).some(c=>c.timeframe===tf&&Number(c.open)>0&&Number(c.high)>=Number(c.low)&&Number(c.close)>0));
      if(feeds.length!==required.length||required.some(symbol=>received.filter((value:string)=>value===symbol).length!==1)||!feeds.every(validFeed)) return jsonResponse({success:false,error_code:"MT5_MARKET_DATA_PAYLOAD_INVALID",message:"All six symbols and real scanner-timeframe candles are required"},422);
      try{for(const feed of feeds)feed.candles=closedMt5FeedCandles(feed.candles)}catch{return jsonResponse({success:false,error_code:"MT5_CLOSED_CANDLE_VALIDATION_FAILED"},422)}
      for(const feed of feeds){
        const latest={account_id:effAccountId,owner_id:effOwnerId,bridge_id:bridgeId,canonical_symbol:feed.canonical_symbol,broker_symbol:feed.broker_symbol,bid:feed.bid,ask:feed.ask,digits:feed.digits,point:feed.point,tick_size:feed.tick_size,tick_value:feed.tick_value,contract_size:feed.contract_size,volume_min:feed.volume_min,volume_step:feed.volume_step,volume_max:feed.volume_max,stops_level:feed.stops_level,freeze_level:feed.freeze_level,market_open:feed.market_open===true,stale:Date.now()-new Date(feed.last_update_at).getTime()>120000,last_update_at:feed.last_update_at};
        const {error}=await supabase.from("mt5_market_data_latest").upsert(latest,{onConflict:"account_id,bridge_id,canonical_symbol"}); if(error)return jsonResponse({success:false,error_code:"MT5_MARKET_DATA_WRITE_FAILED"},500);
        const candles=(Array.isArray(feed.candles)?feed.candles:[]).filter((c:Record<string,unknown>)=>Number(c.open)>0&&Number(c.close)>0).map((c:Record<string,unknown>)=>({account_id:effAccountId,owner_id:effOwnerId,bridge_id:bridgeId,canonical_symbol:feed.canonical_symbol,broker_symbol:feed.broker_symbol,...c}));
        if(candles.length){const {error:candleError}=await supabase.from("mt5_market_candles").upsert(candles,{onConflict:"account_id,bridge_id,canonical_symbol,timeframe,open_time"});if(candleError)return jsonResponse({success:false,error_code:"MT5_CANDLE_WRITE_FAILED"},500);candleCount+=candles.length;}
      }
      await supabase.rpc("prune_mt5_market_data",{p_account_id:effAccountId});
      const newest=feeds.map((f:Record<string,unknown>)=>Date.parse(String(f.last_update_at))).filter(Number.isFinite).sort((a:number,b:number)=>b-a)[0];
      const {error:feedHealthError}=await supabase.from("mt5_scanner_feeds").update({status:feeds.some((feed:Record<string,unknown>)=>Date.now()-Date.parse(String(feed.last_update_at))>120000)?"STALE":"HEALTHY",last_heartbeat_at:new Date().toISOString(),last_valid_candle_at:new Date(newest).toISOString(),validation_evidence:{feed_identity:feedIdentity,bridge_id:bridgeId,symbols:required,candle_rows:candleCount,closed_candles_only:true}}).eq("id",scannerFeed.id);
      if(feedHealthError)return jsonResponse({success:false,error_code:"MT5_FEED_HEALTH_WRITE_FAILED"},500);
      await supabase.from("mt5_certification_results").upsert({account_id:effAccountId,owner_id:effOwnerId,bridge_id:bridgeId,check_key:"market_data",status:"PASS",error_code:null,evidence:{symbols:required,latest_rows:feeds.length,candle_rows:candleCount},checked_at:new Date().toISOString()},{onConflict:"account_id,check_key"});
      return jsonResponse({success:true,feeds:feeds.length,candles:candleCount});
    }

    return jsonResponse({ success: false, error: `Unsupported action: ${action}` }, 400);

  } catch (e) {
    return jsonResponse({ success: false, error: e instanceof Error ? e.message : String(e) }, 500);
  }
});
