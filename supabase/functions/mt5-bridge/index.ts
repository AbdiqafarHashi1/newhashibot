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
}

interface AckPayload {
  bridge_id: string;
  command_id: number;
  success: boolean;
  error_message?: string;
  result_data?: Record<string, unknown>;
}

interface SyncPayload {
  account_number: string;
  broker: string;
  balance: number;
  equity: number;
  margin: number;
  unrealized_pnl: number;
  positions: Array<{
    symbol: string;
    side: "long" | "short" | "buy" | "sell";
    quantity: number;
    entry_price: number;
    current_price: number;
    unrealized_pnl: number;
    ticket?: string;
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

      const { data, error } = await supabase
        .from("mt5_bridge_registry")
        .upsert({
          bridge_id: payload.bridge_id,
          last_heartbeat_at: new Date().toISOString(),
          status: payload.status ?? "online",
          ip_address: payload.ip_address,
          connection_info: payload.connection_info ?? {},
        }, { onConflict: "bridge_id" })
        .select()
        .maybeSingle();

      if (error) {
        return jsonResponse({ success: false, error: `Heartbeat upsert failed: ${error.message}` }, 500);
      }

      return jsonResponse({ success: true, registry: data });
    }

    // ─── 2. POLL COMMANDS ACTION ───────────────────────────────────────────
    if (action === "poll_commands") {
      const payload = body as PollPayload;
      if (!payload.bridge_id) {
        return jsonResponse({ success: false, error: "Missing bridge_id" }, 400);
      }

      // Claim pending commands for this bridge ID or unclaimed commands
      // In MT5 bridges, they poll for unclaimed command queues
      const { data: commands, error: selectErr } = await supabase
        .from("mt5_commands_queue")
        .select("*")
        .eq("status", "pending")
        .order("id", { ascending: true })
        .limit(10);

      if (selectErr) {
        return jsonResponse({ success: false, error: `Failed to poll commands: ${selectErr.message}` }, 500);
      }

      if (!commands || commands.length === 0) {
        return jsonResponse({ success: true, commands: [] });
      }

      const commandIds = commands.map(c => c.id);

      // Transition those commands to claimed
      const { error: updateErr } = await supabase
        .from("mt5_commands_queue")
        .update({
          status: "claimed",
          bridge_id: payload.bridge_id,
          claimed_at: new Date().toISOString(),
        })
        .in("id", commandIds);

      if (updateErr) {
        return jsonResponse({ success: false, error: `Failed to claim commands: ${updateErr.message}` }, 500);
      }

      // Re-map to return the updated status array
      const claimedCommands = commands.map(c => ({
        ...c,
        status: "claimed",
        bridge_id: payload.bridge_id,
        claimed_at: new Date().toISOString()
      }));

      return jsonResponse({ success: true, commands: claimedCommands });
    }

    // ─── 3. ACKNOWLEDGE COMMAND ACTION ──────────────────────────────────────
    if (action === "ack_command") {
      const payload = body as AckPayload;
      if (!payload.bridge_id || !payload.command_id) {
        return jsonResponse({ success: false, error: "Missing bridge_id or command_id" }, 400);
      }

      const status = payload.success ? "ack" : "failed";
      const { data, error } = await supabase
        .from("mt5_commands_queue")
        .update({
          status,
          ack_at: new Date().toISOString(),
          error_message: payload.error_message ?? null,
          result_data: payload.result_data ?? {},
        })
        .eq("id", payload.command_id)
        .select()
        .maybeSingle();

      if (error) {
        return jsonResponse({ success: false, error: `Ack update failed: ${error.message}` }, 500);
      }

      return jsonResponse({ success: true, command: data });
    }

    // ─── 4. SYNCHRONIZE STATE & EVALUATE RULES ──────────────────────────────
    if (action === "sync_state") {
      const payload = body as SyncPayload;
      if (!payload.account_number) {
        return jsonResponse({ success: false, error: "Missing account_number" }, 400);
      }

      // Retrieve the existing profile to evaluate rules against limits
      const { data: profile, error: profileErr } = await supabase
        .from("mt5_account_profiles")
        .select("*")
        .eq("account_number", payload.account_number)
        .maybeSingle();

      if (profileErr) {
        return jsonResponse({ success: false, error: `Failed to fetch profile: ${profileErr.message}` }, 500);
      }

      if (!profile) {
        return jsonResponse({ success: false, error: `No profile registered with account number ${payload.account_number}` }, 404);
      }

      // Check for drawdown breach rules
      const startBalance = Number(profile.account_state?.starting_balance ?? payload.balance);
      const drawdownLimit = Number(profile.drawdown_limit_pct ?? 5.00);
      const maxDailyLoss = Number(profile.max_daily_loss_pct ?? 5.00);

      const maxDrawdownAmount = startBalance * (drawdownLimit / 100);
      const maxDailyLossAmount = payload.balance * (maxDailyLoss / 100);

      // Determine if a breach has occurred
      let isBreached = false;
      let breachReason = "";

      // Overall Drawdown check
      const currentDrawdown = startBalance - payload.equity;
      if (currentDrawdown >= maxDrawdownAmount) {
        isBreached = true;
        breachReason = `Maximum drawdown breach: Current drawdown of $${currentDrawdown.toFixed(2)} exceeds cap of $${maxDrawdownAmount.toFixed(2)} (Starting: $${startBalance.toFixed(2)}, Equity: $${payload.equity.toFixed(2)})`;
      }

      // Daily loss check (using simple day balance vs active equity)
      const dailyLoss = payload.balance - payload.equity;
      if (dailyLoss >= maxDailyLossAmount) {
        isBreached = true;
        breachReason = `Daily loss limit breach: Current loss of $${dailyLoss.toFixed(2)} exceeds daily limit of $${maxDailyLossAmount.toFixed(2)} (Balance: $${payload.balance.toFixed(2)}, Equity: $${payload.equity.toFixed(2)})`;
      }

      // Update account state and handle locks
      const updatedState = {
        balance: payload.balance,
        equity: payload.equity,
        margin: payload.margin,
        unrealized_pnl: payload.unrealized_pnl,
        positions: payload.positions ?? [],
        last_sync_at: new Date().toISOString(),
      };

      const patch: Record<string, unknown> = {
        account_state: updatedState,
        broker: payload.broker ?? profile.broker,
      };

      if (isBreached && !profile.is_locked) {
        patch.is_locked = true;
        patch.last_breach_at = new Date().toISOString();
        patch.is_enabled = false; // Disable automated execution

        // Record a rule breach operator event
        await supabase.from("operator_runtime_events").insert({
          action: "mt5_rule_breach_lock",
          provider: "mt5",
          route: "/functions/v1/mt5-bridge",
          function_name: "mt5-bridge",
          started_at: new Date().toISOString(),
          status: "CRITICAL",
          exact_error: breachReason,
          blocker: "Rule Violation",
          result_summary: `MT5 Account ${payload.account_number} Locked due to Prop Rule Breach`,
          source: "mt5_rules_evaluator",
          raw: {
            account_number: payload.account_number,
            profile_mode: profile.profile_mode,
            balance: payload.balance,
            equity: payload.equity,
            start_balance: startBalance,
            drawdown_limit_pct: drawdownLimit,
            max_daily_loss_pct: maxDailyLoss,
            breach_reason: breachReason
          }
        });
      }

      const { data: updatedProfile, error: updateProfileErr } = await supabase
        .from("mt5_account_profiles")
        .update(patch)
        .eq("id", profile.id)
        .select()
        .maybeSingle();

      if (updateProfileErr) {
        return jsonResponse({ success: false, error: `Profile sync update failed: ${updateProfileErr.message}` }, 500);
      }

      return jsonResponse({
        success: true,
        is_locked: updatedProfile.is_locked,
        breached: isBreached,
        breach_reason: breachReason || null,
        profile: updatedProfile
      });
    }

    return jsonResponse({ success: false, error: `Unsupported action: ${action}` }, 400);

  } catch (e) {
    return jsonResponse({ success: false, error: e instanceof Error ? e.message : String(e) }, 500);
  }
});
