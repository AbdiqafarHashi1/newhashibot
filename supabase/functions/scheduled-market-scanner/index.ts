import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2";
import { authorizeInternalOrAdmin } from "../_shared/internal-auth.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Client-Info, Apikey, x-scanner-cron-secret, x-hashibot-cron-token",
};

type SupabaseClient = ReturnType<typeof createClient>;

function jsonResponse(body: Record<string, unknown>, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

async function parseBody(res: Response): Promise<Record<string, unknown> | string> {
  const text = await res.text();
  try {
    return JSON.parse(text) as Record<string, unknown>;
  } catch {
    return text;
  }
}

function numberMetric(body: Record<string, unknown> | null, key: string, fallback = 0): number {
  const value = body?.[key];
  return typeof value === "number" && Number.isFinite(value) ? value : fallback;
}

function appendWarning(warnings: string[], warning: string | undefined) {
  if (warning) warnings.push(warning);
}

function compactError(prefix: string, detail: unknown) {
  const text = typeof detail === "string" ? detail : JSON.stringify(detail ?? "unknown");
  return `${prefix}: ${text}`.slice(0, 1800);
}

async function createScheduledRun(supabase: SupabaseClient, source: string) {
  const { data, error } = await supabase.from("scanner_runs").insert({
    status: "running",
    run_type: "scheduled",
    source: source,
    triggered_by: "pg_cron",
    is_automatic: true,
    started_at: new Date().toISOString(),
    error_message: `scheduled-market-scanner accepted cron call (source=${source})`,
  }).select("id").single();
  if (error) throw new Error(`Unable to create scheduled scanner_runs proof row: ${error.message}`);
  return data?.id as string;
}

async function finishScheduledRun(
  supabase: SupabaseClient,
  runId: string | null,
  fields: Record<string, unknown>,
  warnings: string[],
) {
  if (!runId) return;
  const { error } = await supabase.from("scanner_runs").update({
    finished_at: new Date().toISOString(),
    ...fields,
  }).eq("id", runId);
  if (error) warnings.push(`scanner_runs diagnostic update failed: ${error.message}`);
}

async function appendRunError(supabase: SupabaseClient, runId: unknown, message: string, warnings: string[]) {
  if (typeof runId !== "string" || !runId) return;
  const { data } = await supabase.from("scanner_runs").select("error_message").eq("id", runId).maybeSingle();
  const prior = typeof data?.error_message === "string" && data.error_message ? data.error_message : "";
  const next = [prior, message].filter(Boolean).join(" | ").slice(0, 4000);
  const { error } = await supabase.from("scanner_runs").update({ error_message: next }).eq("id", runId);
  if (error) warnings.push(`scanner_runs error_message update failed: ${error.message}`);
}

async function updateOutcomeProof(
  supabase: SupabaseClient,
  runId: unknown,
  proof: Record<string, unknown>,
  warnings: string[],
) {
  if (typeof runId !== "string" || !runId) return;

  // These proof columns are optional in deployed databases. The scan proof still
  // lives in scanner_runs + telegram_deliveries + signal_updates when columns are absent.
  const optionalFields = {
    outcome_checked: proof.outcome_called,
    outcomes_updated: proof.outcomes_updated,
    outcome_telegram_sent: proof.outcome_telegram_sent,
    outcome_telegram_skipped: proof.outcome_telegram_skipped,
    outcome_telegram_failed: proof.outcome_telegram_failed,
  };
  const { error } = await supabase.from("scanner_runs").update(optionalFields).eq("id", runId);
  if (error && !/schema cache|column|PGRST204/i.test(error.message)) {
    warnings.push(`Optional scanner_runs outcome proof columns were not updated: ${error.message}`);
  }
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response(null, { status: 200, headers: corsHeaders });

  const warnings: string[] = [];
  const errors: string[] = [];
  let marketScannerCalled = false;
  let marketScannerSuccess = false;
  let marketScannerStatus: number | null = null;
  let proxiedJson: Record<string, unknown> | null = null;
  let outcomeCalled = false;
  let outcomeSuccess = false;
  let outcomeStatus: number | null = null;
  let outcomeTracking: Record<string, unknown> | null = null;
  let runId: string | null = null;
  let supabaseForCatch: SupabaseClient | null = null;

  try {
    const body = await req.json().catch(() => ({})) as Record<string, unknown>;
    const source = typeof body.source === "string" && body.source ? body.source : "pg_cron";
    const supabaseUrl = Deno.env.get("SUPABASE_URL") ?? "";
    const serviceRole = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
    if (!supabaseUrl || !serviceRole) {
      errors.push("Scheduled scanner is not configured: SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY is missing");
      return jsonResponse({ success: false, wrapper: "scheduled-market-scanner", run_type: "scheduled", market_scanner_called: false, outcome_called: false, warnings, errors }, 500);
    }

    const supabase = createClient(supabaseUrl, serviceRole);
    const cronSecret = Deno.env.get("SCANNER_CRON_SECRET") ?? Deno.env.get("HASHIBOT_CRON_TOKEN") ?? "";

    const auth = await authorizeInternalOrAdmin(req, supabase);
    if (!auth.ok) {
      errors.push(auth.error);
      return jsonResponse({ success: false, wrapper: "scheduled-market-scanner", run_type: "scheduled", market_scanner_called: false, outcome_called: false, warnings, errors }, auth.status);
    }
    supabaseForCatch = supabase;
    runId = await createScheduledRun(supabase, source);

    const { data: cfg, error: cfgError } = await supabase.from("scanner_config").select("*").eq("id", 1).maybeSingle();
    appendWarning(warnings, cfgError?.message ? `scanner_config read warning: ${cfgError.message}` : undefined);

    if (!cfg?.is_enabled) {
      const reason = "scanner_disabled";
      warnings.push(reason);
      await finishScheduledRun(supabase, runId, { status: "failed", error_message: reason }, warnings);
      return jsonResponse({ success: false, wrapper: "scheduled-market-scanner", run_type: "scheduled", run_id: runId, skipped: true, reason, market_scanner_called: false, outcome_called: false, warnings, errors });
    }
    if (!cfg?.schedule_enabled) {
      const reason = "schedule_disabled";
      await supabase.from("scanner_config").update({ heartbeat_status: "inactive", heartbeat_updated_at: new Date().toISOString() }).eq("id", 1);
      warnings.push(reason);
      await finishScheduledRun(supabase, runId, { status: "failed", error_message: reason }, warnings);
      return jsonResponse({ success: false, wrapper: "scheduled-market-scanner", run_type: "scheduled", run_id: runId, skipped: true, reason, heartbeat_status: "inactive", market_scanner_called: false, outcome_called: false, warnings, errors });
    }

    const scannerUrl = `${supabaseUrl}/functions/v1/market-scanner`;
    marketScannerCalled = true;
    const proxy = await fetch(scannerUrl, {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${serviceRole}`,
        "Content-Type": "application/json",
        ...(cronSecret ? { "x-scanner-cron-secret": cronSecret } : {}),
      },
      body: JSON.stringify({ run_type: "scheduled", source, market_mode: "crypto_only", scanner_run_id: runId }),
    });
    marketScannerStatus = proxy.status;
    const proxiedBody = await parseBody(proxy);
    proxiedJson = typeof proxiedBody === "string" ? null : proxiedBody;
    marketScannerSuccess = proxy.ok && proxiedJson?.success !== false;

    if (!marketScannerSuccess) {
      const errorMessage = compactError("market-scanner failed", proxiedJson?.error ?? proxiedJson?.reason ?? proxiedBody ?? `HTTP ${proxy.status}`);
      errors.push(errorMessage);
      await finishScheduledRun(supabase, runId, {
        status: "failed",
        symbols_scanned: numberMetric(proxiedJson, "symbols_scanned"),
        crypto_symbols_scanned: numberMetric(proxiedJson, "crypto_symbols_scanned"),
        forex_symbols_scanned: numberMetric(proxiedJson, "forex_symbols_scanned"),
        forex_skipped_rate_limit: proxiedJson?.forex_skipped_rate_limit === true,
        forex_provider_calls_attempted: numberMetric(proxiedJson, "forex_provider_calls_attempted"),
        signals_created: numberMetric(proxiedJson, "signals_created"),
        telegram_sent_count: numberMetric(proxiedJson, "telegram_sent"),
        error_message: errorMessage,
      }, warnings);
      return jsonResponse({
        success: false,
        wrapper: "scheduled-market-scanner",
        run_type: "scheduled",
        market_scanner_called: marketScannerCalled,
        market_scanner_success: false,
        market_scanner_status: marketScannerStatus,
        run_id: runId,
        symbols_scanned: numberMetric(proxiedJson, "symbols_scanned"),
        crypto_symbols_scanned: numberMetric(proxiedJson, "crypto_symbols_scanned"),
        forex_symbols_scanned: numberMetric(proxiedJson, "forex_symbols_scanned"),
        forex_skipped_rate_limit: proxiedJson?.forex_skipped_rate_limit === true,
        forex_provider_calls_attempted: numberMetric(proxiedJson, "forex_provider_calls_attempted"),
        signals_created: numberMetric(proxiedJson, "signals_created"),
        telegram_status: "not_required",
        telegram_sent: numberMetric(proxiedJson, "telegram_sent"),
        telegram_skipped: numberMetric(proxiedJson, "telegram_skipped"),
        telegram_failed: numberMetric(proxiedJson, "telegram_failed"),
        outcome_called: false,
        outcome_success: false,
        outcomes_checked: 0,
        outcomes_updated: 0,
        outcome_telegram_sent: 0,
        warnings,
        errors,
        proxied_body: proxiedJson ?? proxiedBody,
      }, 502);
    }

    try {
      outcomeCalled = true;
      const outcomeRes = await fetch(`${supabaseUrl}/functions/v1/evaluate-signal-outcomes`, {
        method: "POST",
        headers: {
          "Authorization": `Bearer ${serviceRole}`,
          "Content-Type": "application/json",
          ...(cronSecret ? { "x-scanner-cron-secret": cronSecret } : {}),
        },
        body: JSON.stringify({ source: "scheduled-market-scanner", scanner_run_id: runId, run_type: "scheduled", market_mode: "crypto_only" }),
      });
      outcomeStatus = outcomeRes.status;
      const outcomeBody = await parseBody(outcomeRes);
      outcomeTracking = typeof outcomeBody === "string" ? { raw: outcomeBody } : outcomeBody;
      outcomeSuccess = outcomeRes.ok && outcomeTracking.success !== false;
      if (!outcomeSuccess) warnings.push(String(outcomeTracking.error ?? outcomeTracking.reason ?? `Outcome tracking returned HTTP ${outcomeRes.status}`));
    } catch (e) {
      outcomeSuccess = false;
      warnings.push(`Outcome tracking exception: ${e instanceof Error ? e.message : "unknown"}`);
    }

    const proof = {
      outcome_called: outcomeCalled,
      outcomes_updated: numberMetric(outcomeTracking, "signals_updated", numberMetric(outcomeTracking, "changed")),
      outcome_telegram_sent: numberMetric(outcomeTracking, "telegram_sent"),
      outcome_telegram_skipped: numberMetric(outcomeTracking, "telegram_skipped"),
      outcome_telegram_failed: numberMetric(outcomeTracking, "telegram_failed"),
    };
    await updateOutcomeProof(supabase, runId, proof, warnings);

    const outcomeError = outcomeSuccess ? null : warnings[warnings.length - 1] ?? "outcome_tracking_failed";
    if (outcomeError) await appendRunError(supabase, runId, `outcome_error: ${outcomeError}`, warnings);

    const telegramSent = numberMetric(proxiedJson, "telegram_sent");
    const telegramSkipped = numberMetric(proxiedJson, "telegram_skipped");
    const telegramFailed = numberMetric(proxiedJson, "telegram_failed");
    const telegramStatus = telegramSent > 0 ? "sent" : telegramFailed > 0 ? "failed" : telegramSkipped > 0 ? "skipped" : "not_required";

    return jsonResponse({
      success: true,
      wrapper: "scheduled-market-scanner",
      run_type: "scheduled",
      run_id: runId,
      market_scanner_called: marketScannerCalled,
      market_scanner_success: marketScannerSuccess,
      market_scanner_status: marketScannerStatus,
      symbols_scanned: numberMetric(proxiedJson, "symbols_scanned"),
      crypto_symbols_scanned: numberMetric(proxiedJson, "crypto_symbols_scanned"),
      forex_symbols_scanned: numberMetric(proxiedJson, "forex_symbols_scanned"),
      forex_skipped_rate_limit: proxiedJson?.forex_skipped_rate_limit === true,
      forex_skip_reason: proxiedJson?.forex_skip_reason ?? "",
      forex_provider_calls_attempted: numberMetric(proxiedJson, "forex_provider_calls_attempted"),
      forex_next_allowed_scan_at: proxiedJson?.forex_next_allowed_scan_at ?? null,
      signals_created: numberMetric(proxiedJson, "signals_created"),
      telegram_status: telegramStatus,
      telegram_sent: telegramSent,
      telegram_skipped: telegramSkipped,
      telegram_failed: telegramFailed,
      telegram_skip_reasons: proxiedJson?.telegram_skip_reasons ?? {},
      outcome_called: outcomeCalled,
      outcome_success: outcomeSuccess,
      outcome_status: outcomeStatus,
      outcomes_checked: numberMetric(outcomeTracking, "signals_checked", numberMetric(outcomeTracking, "scanned")),
      outcomes_updated: proof.outcomes_updated,
      outcome_telegram_sent: proof.outcome_telegram_sent,
      outcome_telegram_skipped: proof.outcome_telegram_skipped,
      outcome_telegram_failed: proof.outcome_telegram_failed,
      outcome_state: numberMetric(outcomeTracking, "signals_checked") === 0 ? "no_open_signals" : outcomeSuccess ? "automatic_active" : "error",
      outcome_warning: outcomeError,
      warnings,
      errors,
      proxied_body: proxiedJson,
      outcome_tracking: outcomeTracking,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    errors.push(message);
    if (supabaseForCatch && runId) {
      await finishScheduledRun(supabaseForCatch, runId, { status: "failed", error_message: compactError("scheduled-market-scanner exception", message) }, warnings);
    }
    return jsonResponse({
      success: false,
      wrapper: "scheduled-market-scanner",
      run_type: "scheduled",
      run_id: runId,
      market_scanner_called: marketScannerCalled,
      market_scanner_success: marketScannerSuccess,
      market_scanner_status: marketScannerStatus,
      outcome_called: outcomeCalled,
      outcome_success: outcomeSuccess,
      warnings,
      errors,
    }, 500);
  }
});
