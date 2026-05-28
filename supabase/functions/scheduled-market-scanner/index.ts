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

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response(null, { status: 200, headers: corsHeaders });

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL") ?? "";
    const serviceRole = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
    const cronSecret = Deno.env.get("SCANNER_CRON_SECRET") ?? "";
    const suppliedSecret = req.headers.get("x-scanner-cron-secret") ?? "";
    const authHeader = req.headers.get("Authorization") ?? "";
    const isServiceInvocation = Boolean(serviceRole) && authHeader === `Bearer ${serviceRole}`;
    const isCronSecretInvocation = Boolean(cronSecret) && suppliedSecret === cronSecret;

    if (!supabaseUrl || !serviceRole) {
      return jsonResponse({
        success: false,
        wrapper: "scheduled-market-scanner",
        run_type: "scheduled",
        error: "Scheduled scanner is not configured: SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY is missing",
      }, 500);
    }

    if (!isServiceInvocation && !isCronSecretInvocation) {
      return jsonResponse({
        success: false,
        wrapper: "scheduled-market-scanner",
        run_type: "scheduled",
        error: cronSecret
          ? "Forbidden: scheduled scanner requires service-role Authorization or matching x-scanner-cron-secret"
          : "Scheduled scanner setup error: SCANNER_CRON_SECRET is not configured, so only service-role Authorization is accepted",
      }, cronSecret ? 403 : 500);
    }

    const supabase = createClient(supabaseUrl, serviceRole);
    const { data: cfg } = await supabase.from("scanner_config").select("*").eq("id", 1).maybeSingle();

    if (!cfg?.is_enabled) {
      return jsonResponse({
        success: false,
        wrapper: "scheduled-market-scanner",
        run_type: "scheduled",
        skipped: true,
        reason: "scanner_disabled",
      });
    }
    if (!cfg?.schedule_enabled) {
      await supabase.from("scanner_config").update({ heartbeat_status: "inactive", heartbeat_updated_at: new Date().toISOString() }).eq("id", 1);
      return jsonResponse({
        success: false,
        wrapper: "scheduled-market-scanner",
        run_type: "scheduled",
        skipped: true,
        reason: "schedule_disabled",
        heartbeat_status: "inactive",
      });
    }

    const scannerUrl = `${supabaseUrl}/functions/v1/market-scanner`;
    const proxy = await fetch(scannerUrl, {
      method: "POST",
      headers: { "Authorization": `Bearer ${serviceRole}`, "Content-Type": "application/json" },
      body: JSON.stringify({ run_type_override: "scheduled", scheduled_invocation: true }),
    });
    const proxiedBody = await parseBody(proxy);

    if (!proxy.ok) {
      return jsonResponse({
        success: false,
        wrapper: "scheduled-market-scanner",
        proxied_status: proxy.status,
        run_type: "scheduled",
        proxied_body: proxiedBody,
        error: "market-scanner failed",
      }, 502);
    }

    const proxiedJson = typeof proxiedBody === "string" ? null : proxiedBody;
    if (proxiedJson && proxiedJson.success === false) {
      return jsonResponse({
        success: false,
        wrapper: "scheduled-market-scanner",
        proxied_status: proxy.status,
        run_type: "scheduled",
        proxied_body: proxiedJson,
        error: String(proxiedJson.error ?? "market-scanner returned success=false"),
      }, 502);
    }

    let outcomeTracking: Record<string, unknown> | undefined;
    let outcomeWarning: string | undefined;
    try {
      const outcomeRes = await fetch(`${supabaseUrl}/functions/v1/evaluate-signal-outcomes`, {
        method: "POST",
        headers: { "Authorization": `Bearer ${serviceRole}`, "Content-Type": "application/json" },
        body: JSON.stringify({ source: "scheduled-market-scanner", scanner_run_id: proxiedJson?.run_id ?? null }),
      });
      const outcomeBody = await parseBody(outcomeRes);
      if (outcomeRes.ok) {
        outcomeTracking = typeof outcomeBody === "string"
          ? { success: true, raw: outcomeBody }
          : { success: outcomeBody.success !== false, ...outcomeBody };
        if (typeof outcomeBody !== "string" && outcomeBody.success === false) {
          outcomeWarning = String(outcomeBody.error ?? "Outcome tracking returned success=false");
          outcomeTracking = { status: "warning", ...outcomeTracking };
        }
      } else {
        outcomeWarning = `Outcome tracking returned HTTP ${outcomeRes.status}`;
        outcomeTracking = { success: false, status: outcomeRes.status, body: outcomeBody };
      }
    } catch (e) {
      outcomeWarning = `Outcome tracking exception: ${e instanceof Error ? e.message : "unknown"}`;
    }

    return jsonResponse({
      success: true,
      wrapper: "scheduled-market-scanner",
      proxied_status: proxy.status,
      run_type: "scheduled",
      run_id: proxiedJson?.run_id ?? null,
      proxied_success: proxiedJson?.success ?? proxy.ok,
      telegram_sent: proxiedJson?.telegram_sent ?? 0,
      telegram_skipped: proxiedJson?.telegram_skipped ?? 0,
      telegram_failed: proxiedJson?.telegram_failed ?? 0,
      telegram_skip_reasons: proxiedJson?.telegram_skip_reasons ?? {},
      outcome_checked: Boolean(outcomeTracking),
      outcomes_updated: outcomeTracking?.signals_updated ?? outcomeTracking?.changed ?? 0,
      outcome_telegram_sent: outcomeTracking?.telegram_sent ?? 0,
      outcome_telegram_skipped: outcomeTracking?.telegram_skipped ?? 0,
      outcome_telegram_failed: outcomeTracking?.telegram_failed ?? 0,
      outcome_warnings: outcomeWarning ? [outcomeWarning] : [],
      proxied_body: proxiedJson ?? proxiedBody,
      ...(outcomeTracking ? { outcome_tracking: outcomeTracking } : {}),
      ...(outcomeWarning ? { outcome_warning: outcomeWarning } : {}),
    });
  } catch (err) {
    return jsonResponse({
      success: false,
      wrapper: "scheduled-market-scanner",
      run_type: "scheduled",
      error: err instanceof Error ? err.message : "Unknown error",
    }, 500);
  }
});
