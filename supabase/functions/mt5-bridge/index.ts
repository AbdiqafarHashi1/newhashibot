import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Client-Info, Apikey",
};

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

    // ─── 1. HEARTBEAT ACTION ───────────────────────────────────────────────
    if (action === "heartbeat") {
      const payload = body as HeartbeatPayload;
      if (!payload.bridge_id) {
        return jsonResponse({ success: false, error: "Missing bridge_id" }, 400);
      }

      const bridgeStatus = payload.status ?? "online";
      const { data, error } = await supabase
        .from("mt5_bridge_registry")
        .upsert({
          bridge_id: payload.bridge_id,
          last_heartbeat_at: new Date().toISOString(),
          status: bridgeStatus,
          ip_address: payload.ip_address,
          connection_info: payload.connection_info ?? {},
        }, { onConflict: "bridge_id" })
        .select()
        .maybeSingle();

      if (error) {
        return jsonResponse({ success: false, error: `Heartbeat upsert failed: ${error.message}` }, 500);
      }

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
        .eq("bridge_id", payload.bridge_id);

      return jsonResponse({ success: true, registry: data });
    }

    // ─── 2. POLL COMMANDS ACTION ───────────────────────────────────────────
    if (action === "poll_commands") {
      const payload = body as PollPayload;
      if (!payload.bridge_id) {
        return jsonResponse({ success: false, error: "Missing bridge_id" }, 400);
      }

      const maxLimit = payload.max_commands || 10;
      const nowIso = new Date().toISOString();
      const leaseCutoffIso = new Date(Date.now() - 2 * 60 * 1000).toISOString();

      // First query primary mt5_commands table (Phase 8A)
      const { data: commands, error: selectErr } = await supabase
        .from("mt5_commands")
        .select("*")
        .eq("bridge_id", payload.bridge_id)
        .or(`status.eq.received,and(status.eq.accepted,claimed_at.lt.${leaseCutoffIso})`)
        .order("created_at", { ascending: true })
        .limit(maxLimit);

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
        const commandIds = certified.map(c => c.id);

        const { error: updateErr } = await supabase
          .from("mt5_commands")
          .update({
            status: "accepted",
            claimed_at: nowIso,
          })
          .in("id", commandIds);

        if (updateErr) {
          return jsonResponse({ success: false, error: `Failed to claim mt5_commands: ${updateErr.message}` }, 500);
        }

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
        .select()
        .maybeSingle();

      if (!cmdErr && updatedCommand) {
        return jsonResponse({ success: true, command_id: payload.command_id, status: finalStatus, command: updatedCommand });
      }

      // Try fallback legacy table mt5_commands_queue
      const legacyStatus = payload.success ? "ack" : "failed";
      const { data: legacyData, error: legacyErr } = await supabase
        .from("mt5_commands_queue")
        .update({
          status: legacyStatus,
          ack_at: nowIso,
          error_message: payload.error_message ?? null,
          result_data: resultObj,
        })
        .eq("id", payload.command_id)
        .select()
        .maybeSingle();

      if (legacyErr) {
        return jsonResponse({ success: false, error: `Ack update failed: ${legacyErr.message}` }, 500);
      }

      return jsonResponse({ success: true, command_id: payload.command_id, status: finalStatus, command: legacyData });
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
        // Insert snapshot into mt5_account_snapshots
        await supabase
          .from("mt5_account_snapshots")
          .insert({
            account_id: targetAccountId,
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
            captured_at: nowIso,
          });

        // Update mt5_accounts connection status & heartbeat
        await supabase
          .from("mt5_accounts")
          .update({
            last_sync_at: nowIso,
            last_heartbeat_at: nowIso,
            connection_status: "connected",
            provider_health: "healthy",
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

    return jsonResponse({ success: false, error: `Unsupported action: ${action}` }, 400);

  } catch (e) {
    return jsonResponse({ success: false, error: e instanceof Error ? e.message : String(e) }, 500);
  }
});
