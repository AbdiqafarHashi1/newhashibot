import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Client-Info, Apikey, x-scanner-cron-secret",
};

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

async function updateOutcomeProof(
  supabase: ReturnType<typeof createClient>,
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

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL") ?? "";
    const serviceRole = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
    const cronSecret = Deno.env.get("SCANNER_CRON_SECRET") ?? "";
    const suppliedSecret = req.headers.get("x-scanner-cron-secret") ?? "";
    const authHeader = req.headers.get("Authorization") ?? "";
    const isServiceInvocation = Boolean(serviceRole) && authHeader === `Bearer ${serviceRole}`;
    const isCronSecretInvocation = Boolean(cronSecret) && suppliedSecret === cronSecret;

    if (!supabaseUrl || !serviceRole) {
      errors.push("Scheduled scanner is not configured: SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY is missing");
      return jsonResponse({ success: false, wrapper: "scheduled-market-scanner", run_type: "scheduled", market_scanner_called: false, outcome_called: false, warnings, errors }, 500);
    }

    if (!isServiceInvocation && !isCronSecretInvocation) {
      errors.push(cronSecret
        ? "Forbidden: scheduled scanner requires service-role Authorization or matching x-scanner-cron-secret"
        : "Scheduled scanner setup error: SCANNER_CRON_SECRET is not configured, so only service-role Authorization is accepted");
      return jsonResponse({ success: false, wrapper: "scheduled-market-scanner", run_type: "scheduled", market_scanner_called: false, outcome_called: false, warnings, errors }, cronSecret ? 403 : 500);
    }

    const supabase = createClient(supabaseUrl, serviceRole);
    const { data: cfg, error: cfgError } = await supabase.from("scanner_config").select("*").eq("id", 1).maybeSingle();
    appendWarning(warnings, cfgError?.message ? `scanner_config read warning: ${cfgError.message}` : undefined);

    if (!cfg?.is_enabled) {
      warnings.push("scanner_disabled");
      return jsonResponse({ success: false, wrapper: "scheduled-market-scanner", run_type: "scheduled", skipped: true, reason: "scanner_disabled", market_scanner_called: false, outcome_called: false, warnings, errors });
    }
    if (!cfg?.schedule_enabled) {
      await supabase.from("scanner_config").update({ heartbeat_status: "inactive", heartbeat_updated_at: new Date().toISOString() }).eq("id", 1);
      warnings.push("schedule_disabled");
      return jsonResponse({ success: false, wrapper: "scheduled-market-scanner", run_type: "scheduled", skipped: true, reason: "schedule_disabled", heartbeat_status: "inactive", market_scanner_called: false, outcome_called: false, warnings, errors });
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
      body: JSON.stringify({ run_type: "scheduled", source: "pg_cron", market_mode: "crypto_only" }),
    });
    marketScannerStatus = proxy.status;
    const proxiedBody = await parseBody(proxy);
    proxiedJson = typeof proxiedBody === "string" ? null : proxiedBody;
    marketScannerSuccess = proxy.ok && proxiedJson?.success !== false;

    if (!marketScannerSuccess) {
      errors.push(String(proxiedJson?.error ?? proxiedJson?.reason ?? `market-scanner failed with HTTP ${proxy.status}`));
      return jsonResponse({
        success: false,
        wrapper: "scheduled-market-scanner",
        run_type: "scheduled",
        market_scanner_called: marketScannerCalled,
        market_scanner_success: false,
        market_scanner_status: marketScannerStatus,
        run_id: proxiedJson?.run_id ?? null,
        symbols_scanned: numberMetric(proxiedJson, "symbols_scanned"),
        signals_created: numberMetric(proxiedJson, "signals_created"),
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
        body: JSON.stringify({ source: "scheduled-market-scanner", scanner_run_id: proxiedJson?.run_id ?? null, run_type: "scheduled", market_mode: "crypto_only" }),
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
    await updateOutcomeProof(supabase, proxiedJson?.run_id, proof, warnings);

    return jsonResponse({
      success: true,
      wrapper: "scheduled-market-scanner",
      run_type: "scheduled",
      market_scanner_called: marketScannerCalled,
      market_scanner_success: marketScannerSuccess,
      market_scanner_status: marketScannerStatus,
      run_id: proxiedJson?.run_id ?? null,
      symbols_scanned: numberMetric(proxiedJson, "symbols_scanned"),
      signals_created: numberMetric(proxiedJson, "signals_created"),
      telegram_sent: numberMetric(proxiedJson, "telegram_sent"),
      telegram_skipped: numberMetric(proxiedJson, "telegram_skipped"),
      telegram_failed: numberMetric(proxiedJson, "telegram_failed"),
      telegram_skip_reasons: proxiedJson?.telegram_skip_reasons ?? {},
      outcome_called: outcomeCalled,
      outcome_success: outcomeSuccess,
      outcome_status: outcomeStatus,
      outcomes_checked: numberMetric(outcomeTracking, "signals_checked", numberMetric(outcomeTracking, "scanned")),
      outcomes_updated: proof.outcomes_updated,
      outcome_telegram_sent: proof.outcome_telegram_sent,
      outcome_telegram_skipped: proof.outcome_telegram_skipped,
      outcome_telegram_failed: proof.outcome_telegram_failed,
      outcome_warning: outcomeSuccess ? null : warnings[warnings.length - 1] ?? null,
      warnings,
      errors,
      proxied_body: proxiedJson,
      outcome_tracking: outcomeTracking,
    });
  } catch (err) {
    errors.push(err instanceof Error ? err.message : "Unknown error");
    return jsonResponse({
      success: false,
      wrapper: "scheduled-market-scanner",
      run_type: "scheduled",
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
