import "jsr:@supabase/functions-js/edge-runtime.d.ts";
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
      let query = supabase.from("mt5_accounts").select("id,user_id,broker,server,account_type,credential_ref,credential_capability,execution_enabled,operational,bridge_id").eq("bridge_id", bridgeId);
      if (explicit.length) query = query.in("id", explicit);
      const { data, error } = await query;
      if (error) return jsonResponse({ success: false, error_code: "DATABASE_ERROR", message: "Database operation failed" }, 500);
      return jsonResponse({ success: true, accounts: (data ?? []).map(a => ({ account_id: a.id, owner_id: a.user_id, broker: a.broker, server: a.server, account_class: a.account_type, credential_ref: a.credential_ref, credential_capability: a.credential_capability, execution_enabled: a.execution_enabled, operational: a.operational, bridge_id: a.bridge_id })) });
    }

    if (action === "retrieve_credential") {
      const { data: account, error } = await supabase.from("mt5_accounts")
        .select("id,user_id,bridge_id,credential_ref,credential_capability,execution_enabled,operational,account_number_ciphertext,password_ciphertext,server")
        .eq("id", String(body.account_id ?? "")).eq("user_id", String(body.owner_id ?? ""))
        .eq("bridge_id", String(body.bridge_id ?? "")).eq("credential_ref", String(body.credential_ref ?? "")).maybeSingle();
      if (error || !account) return jsonResponse({ success: false, error_code: "BRIDGE_ACCOUNT_SCOPE_MISMATCH" }, 403);
      try {
        return jsonResponse({ success: true, credential: { login: await decryptCredential(account.account_number_ciphertext), password: await decryptCredential(account.password_ciphertext), server: account.server, capability: account.credential_capability, execution_enabled: account.execution_enabled } });
      } catch { return jsonResponse({ success: false, error_code: "MT5_CREDENTIAL_DECRYPTION_FAILED" }, 500); }
    }

    // ─── 1. HEARTBEAT ACTION ───────────────────────────────────────────────
    if (action === "heartbeat") {
      const payload = body as HeartbeatPayload;
      if (!payload.bridge_id) {
        return jsonResponse({ success: false, error: "Missing bridge_id" }, 400);
      }
      const accountId = String((body as Record<string, unknown>).account_id ?? "");
      const ownerId = String((body as Record<string, unknown>).owner_id ?? "");
      const { data: scoped } = await supabase.from("mt5_accounts").select("id").eq("id", accountId).eq("user_id", ownerId).eq("bridge_id", payload.bridge_id).maybeSingle();
      if (!scoped) return jsonResponse({ success: false, error_code: "BRIDGE_ACCOUNT_SCOPE_MISMATCH" }, 403);

      const bridgeStatus = payload.status ?? "online";
      const { data, error } = await supabase
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
        .eq("bridge_id", payload.bridge_id)
        .eq("worker_id", String((body as Record<string, unknown>).worker_id ?? ""))
        .select()
        .maybeSingle();

      if (error) {
        return jsonResponse({ success: false, error_code: "DATABASE_ERROR", message: "Database operation failed" }, 500);
      }
      if (!data) return jsonResponse({ success: false, error_code: "BRIDGE_ACCOUNT_SCOPE_MISMATCH", message: "Bridge lease is not owned by this worker" }, 403);

      // Also update connection_status in mt5_accounts linked to this bridge_id
      await supabase
        .from("mt5_accounts")
        .update({
          last_heartbeat_at: new Date().toISOString(),
          // Process reachability is not terminal authentication. Only a verified
          // snapshot may promote the account to connected.
          connection_status: bridgeStatus === "online" ? "pending" : "disconnected",
          updated_at: new Date().toISOString(),
        })
        .eq("id", accountId).eq("user_id", ownerId).eq("bridge_id", payload.bridge_id);

      return jsonResponse({ success: true, registry: data });
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
          if (["TEST_CONNECTION","SYNC_ACCOUNT","RECOVER_PROTECTION","MODIFY_PROTECTION","PARTIAL_CLOSE","MOVE_TO_BREAKEVEN","CLOSE_POSITION","CANCEL_ORDER"].includes(command.operation)) { certified.push(command); continue; }
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

      const snap = payload.snapshot || { balance: 0, equity: 0, margin: 0, free_margin: 0, floating_pnl: 0 };
      const positions = payload.positions || [];
      const orders = payload.orders || [];
      const nowIso = new Date().toISOString();

      // 4A. Target mt5_accounts if account_id is supplied or lookup via bridge_id
      let targetAccountId = payload.account_id;
      if (!targetAccountId) {
        const { data: matchedAcc } = await supabase
          .from("mt5_accounts")
          .select("id")
          .eq("bridge_id", payload.bridge_id)
          .maybeSingle();
        if (matchedAcc) {
          targetAccountId = matchedAcc.id;
        }
      }

      if (targetAccountId) {
        const { data: target } = await supabase.from("mt5_accounts").select("id,user_id,bridge_id,credential_capability,execution_enabled")
          .eq("id", targetAccountId).eq("user_id", payload.owner_id ?? "").eq("bridge_id", payload.bridge_id).maybeSingle();
        if (!target) return jsonResponse({ success: false, error_code: "BRIDGE_ACCOUNT_SCOPE_MISMATCH" }, 403);
        // Insert snapshot into mt5_account_snapshots
        const { error: snapshotError } = await supabase
          .from("mt5_account_snapshots")
          .insert({
            account_id: targetAccountId,
            owner_id: payload.owner_id,
            bridge_id: payload.bridge_id,
            worker_id: payload.worker_id,
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
            terminal_identity: (snap as Record<string, unknown>).terminal ?? {},
            open_positions_count: positions.length,
            pending_orders_count: orders.length,
            captured_at: nowIso,
          });
        if (snapshotError) return jsonResponse({ success: false, error_code: "MT5_SNAPSHOT_WRITE_FAILED" }, 500);

        // Update mt5_accounts connection status & heartbeat
        const verifiedTradePermission = (snap as Record<string, unknown>).trade_permission === true;
        await supabase
          .from("mt5_accounts")
          .update({
            last_sync_at: nowIso,
            last_heartbeat_at: nowIso,
            connection_status: "connected",
            provider_health: "healthy", terminal_authenticated: true,
            trade_permission: verifiedTradePermission,
            terminal_autotrading: (snap as Record<string, unknown>).autotrading === true,
            // Capability is promoted only from the current authenticated terminal
            // account's trade permission, never from stored credential metadata.
            ...(verifiedTradePermission ? { credential_capability: "master" } : {}),
            updated_at: nowIso,
          })
          .eq("id", targetAccountId);
      }

      // 4B. Target mt5_account_profiles (Phase 5 prop rules evaluator) if account_number exists
      let breached = false;
      let breachReason: string | null = null;

      if (payload.account_number) {
        const { data: profile } = await supabase
          .from("mt5_account_profiles")
          .select("*")
          .eq("account_number", payload.account_number)
          .maybeSingle();

        if (profile) {
          const startBalance = Number(profile.account_state?.starting_balance ?? snap.balance);
          const drawdownLimit = Number(profile.drawdown_limit_pct ?? 5.00);
          const maxDailyLoss = Number(profile.max_daily_loss_pct ?? 5.00);

          const maxDrawdownAmount = startBalance * (drawdownLimit / 100);
          const maxDailyLossAmount = snap.balance * (maxDailyLoss / 100);

          const currentDrawdown = startBalance - snap.equity;
          if (currentDrawdown >= maxDrawdownAmount) {
            breached = true;
            breachReason = `Maximum drawdown breach: Current drawdown of $${currentDrawdown.toFixed(2)} exceeds cap of $${maxDrawdownAmount.toFixed(2)}`;
          }

          const dailyLoss = snap.balance - snap.equity;
          if (dailyLoss >= maxDailyLossAmount) {
            breached = true;
            breachReason = `Daily loss limit breach: Current loss of $${dailyLoss.toFixed(2)} exceeds daily limit of $${maxDailyLossAmount.toFixed(2)}`;
          }

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

          if (breached && !profile.is_locked) {
            patch.is_locked = true;
            patch.last_breach_at = nowIso;
            patch.is_enabled = false;

            await supabase.from("operator_runtime_events").insert({
              action: "mt5_rule_breach_lock",
              provider: "mt5",
              route: "/functions/v1/mt5-bridge",
              function_name: "mt5-bridge",
              started_at: nowIso,
              status: "CRITICAL",
              exact_error: breachReason,
              blocker: "Rule Violation",
              result_summary: `MT5 Account ${payload.account_number} Locked due to Prop Rule Breach`,
              source: "mt5_rules_evaluator",
              raw: {
                account_number: payload.account_number,
                balance: snap.balance,
                equity: snap.equity,
                breach_reason: breachReason
              }
            });
          }

          await supabase.from("mt5_account_profiles").update(patch).eq("id", profile.id);
        }
      }

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
        fill_policies: spec.fill_policies ?? ["return"],
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
      const accountId=String(body.account_id??""), ownerId=String(body.owner_id??""), bridgeId=String(body.bridge_id??"");
      const {data:scope}=await supabase.from("mt5_accounts").select("id").eq("id",accountId).eq("user_id",ownerId).eq("bridge_id",bridgeId).maybeSingle();
      if(!scope) return jsonResponse({success:false,error_code:"BRIDGE_ACCOUNT_SCOPE_MISMATCH"},403);
      const {data:lease}=await supabase.from("mt5_bridge_registry").select("bridge_id").eq("bridge_id",bridgeId).eq("worker_id",String(body.worker_id??"")).maybeSingle();
      if(!lease) return jsonResponse({success:false,error_code:"BRIDGE_ACCOUNT_SCOPE_MISMATCH"},403);
      const feeds=Array.isArray(body.feeds)?body.feeds:[]; let candleCount=0;
      const required=["EURUSD","GBPUSD","USDJPY","AUDUSD","USDCAD","XAUUSD"];
      const received=feeds.map((feed:Record<string,unknown>)=>String(feed.canonical_symbol));
      const validFeed=(feed:Record<string,unknown>)=>required.includes(String(feed.canonical_symbol))&&Number(feed.bid)>0&&Number(feed.ask)>0&&Number(feed.ask)>=Number(feed.bid)&&Number.isFinite(new Date(String(feed.last_update_at)).getTime())&&Array.isArray(feed.candles)&&["5m","15m","1h","4h"].every(tf=>(feed.candles as Array<Record<string,unknown>>).some(c=>c.timeframe===tf&&Number(c.open)>0&&Number(c.high)>=Number(c.low)&&Number(c.close)>0));
      if(feeds.length!==required.length||required.some(symbol=>received.filter((value:string)=>value===symbol).length!==1)||!feeds.every(validFeed)) return jsonResponse({success:false,error_code:"MT5_MARKET_DATA_PAYLOAD_INVALID",message:"All six symbols and real scanner-timeframe candles are required"},422);
      for(const feed of feeds){
        const latest={account_id:accountId,owner_id:ownerId,bridge_id:bridgeId,canonical_symbol:feed.canonical_symbol,broker_symbol:feed.broker_symbol,bid:feed.bid,ask:feed.ask,digits:feed.digits,point:feed.point,tick_size:feed.tick_size,tick_value:feed.tick_value,contract_size:feed.contract_size,volume_min:feed.volume_min,volume_step:feed.volume_step,volume_max:feed.volume_max,stops_level:feed.stops_level,freeze_level:feed.freeze_level,market_open:feed.market_open===true,stale:Date.now()-new Date(feed.last_update_at).getTime()>120000,last_update_at:feed.last_update_at};
        const {error}=await supabase.from("mt5_market_data_latest").upsert(latest,{onConflict:"account_id,bridge_id,canonical_symbol"}); if(error)return jsonResponse({success:false,error_code:"MT5_MARKET_DATA_WRITE_FAILED"},500);
        const candles=(Array.isArray(feed.candles)?feed.candles:[]).filter((c:Record<string,unknown>)=>Number(c.open)>0&&Number(c.close)>0).map((c:Record<string,unknown>)=>({account_id:accountId,owner_id:ownerId,bridge_id:bridgeId,canonical_symbol:feed.canonical_symbol,broker_symbol:feed.broker_symbol,...c}));
        if(candles.length){const {error:candleError}=await supabase.from("mt5_market_candles").upsert(candles,{onConflict:"account_id,bridge_id,canonical_symbol,timeframe,open_time"});if(candleError)return jsonResponse({success:false,error_code:"MT5_CANDLE_WRITE_FAILED"},500);candleCount+=candles.length;}
      }
      await supabase.rpc("prune_mt5_market_data",{p_account_id:accountId});
      await supabase.from("mt5_certification_results").upsert({account_id:accountId,owner_id:ownerId,bridge_id:bridgeId,check_key:"market_data",status:"PASS",error_code:null,evidence:{symbols:required,latest_rows:feeds.length,candle_rows:candleCount},checked_at:new Date().toISOString()},{onConflict:"account_id,check_key"});
      return jsonResponse({success:true,feeds:feeds.length,candles:candleCount});
    }

    return jsonResponse({ success: false, error: `Unsupported action: ${action}` }, 400);

  } catch (e) {
    return jsonResponse({ success: false, error: e instanceof Error ? e.message : String(e) }, 500);
  }
});
