import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Client-Info, Apikey",
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

function minutesAgo(value: unknown): number | null {
  if (typeof value !== "string") return null;
  const ms = Date.now() - new Date(value).getTime();
  if (!Number.isFinite(ms)) return null;
  return Math.round(ms / 60000);
}

async function verifyAdmin(req: Request, supabase: ReturnType<typeof createClient>) {
  const authHeader = req.headers.get("Authorization") ?? "";
  const token = authHeader.replace("Bearer ", "");
  if (!token) return { ok: false, status: 401, error: "Unauthorized" };

  const { data: { user }, error: authErr } = await supabase.auth.getUser(token);
  if (authErr || !user) return { ok: false, status: 401, error: "Unauthorized" };

  const { data: profile } = await supabase.from("profiles").select("role").eq("id", user.id).maybeSingle();
  if (!profile || profile.role !== "admin") return { ok: false, status: 403, error: "Forbidden" };

  return { ok: true, status: 200, userId: user.id };
}

async function probeFunction(supabaseUrl: string, functionName: string) {
  try {
    const res = await fetch(`${supabaseUrl}/functions/v1/${functionName}`, { method: "OPTIONS" });
    return {
      name: functionName,
      status: res.status,
      deployed: res.status !== 404,
      state: res.status === 404 ? "missing" : res.ok ? "deployed" : "unknown",
    };
  } catch (e) {
    return { name: functionName, status: null, deployed: null, state: "unknown", error: e instanceof Error ? e.message : "probe failed" };
  }
}

async function getSchedulerStatus(supabase: ReturnType<typeof createClient>) {
  const [cfgRes, latestRunRes, latestScheduledRes, scheduledRowsRes, latestManualRes, latestOutcomeAutoRes] = await Promise.all([
    supabase.from("scanner_config").select("cron_job_active,cron_job_name,schedule_enabled,last_scheduled_scan_at,scan_interval_minutes").eq("id", 1).maybeSingle(),
    supabase.from("scanner_runs").select("*").order("started_at", { ascending: false }).limit(1).maybeSingle(),
    supabase.from("scanner_runs").select("*").ilike("run_type", "scheduled").or("source.eq.pg_cron,triggered_by.eq.pg_cron,is_automatic.eq.true").order("started_at", { ascending: false }).limit(1).maybeSingle(),
    supabase.from("scanner_runs").select("*").ilike("run_type", "scheduled").or("source.eq.pg_cron,triggered_by.eq.pg_cron,is_automatic.eq.true").order("started_at", { ascending: false }).limit(10),
    supabase.from("scanner_runs").select("*").or("triggered_by.eq.manual_button,source.ilike.%manual%,run_type.ilike.manual").order("started_at", { ascending: false }).limit(1).maybeSingle(),
    supabase.from("signal_updates").select("id,signal_id,new_status,message,source,triggered_by,is_automatic,created_at").or("source.eq.scheduled_market_scanner,triggered_by.eq.pg_cron,is_automatic.eq.true").order("created_at", { ascending: false }).limit(1).maybeSingle(),
  ]);

  let latestNetHttpResponse: Record<string, unknown> | null = null;
  let netHttpError: string | null = null;
  try {
    const { data, error } = await supabase
      .schema("net")
      .from("_http_response")
      .select("id,status_code,timed_out,created,content,error_msg")
      .order("created", { ascending: false })
      .limit(20);
    if (error) netHttpError = error.message;
    latestNetHttpResponse = ((data ?? []) as Record<string, unknown>[]).find((row) => {
      const content = typeof row.content === "string" ? row.content : JSON.stringify(row.content ?? "");
      return content.includes("scheduled-market-scanner");
    }) ?? null;
  } catch (e) {
    netHttpError = e instanceof Error ? e.message : "Unable to read net._http_response";
  }

  let latestCronRunDetail: Record<string, unknown> | null = null;
  let cronRunDetailError: string | null = null;
  try {
    const jobName = String(cfgRes.data?.cron_job_name ?? "hashibot_scheduled_market_scanner_5m");
    const { data: jobs, error: jobsErr } = await supabase.schema("cron").from("job").select("jobid,jobname,active").eq("jobname", jobName).limit(1);
    if (jobsErr) cronRunDetailError = jobsErr.message;
    const job = ((jobs ?? []) as Record<string, unknown>[])[0];
    if (job?.jobid) {
      const { data, error } = await supabase
        .schema("cron")
        .from("job_run_details")
        .select("jobid,runid,status,return_message,start_time,end_time")
        .eq("jobid", job.jobid)
        .order("start_time", { ascending: false })
        .limit(1)
        .maybeSingle();
      if (error) cronRunDetailError = error.message;
      latestCronRunDetail = data as Record<string, unknown> | null;
    }
  } catch (e) {
    cronRunDetailError = e instanceof Error ? e.message : "Unable to read cron.job_run_details";
  }

  const latestScheduledRun = latestScheduledRes.data as Record<string, unknown> | null;
  const latestNetAge = minutesAgo(latestNetHttpResponse?.created);
  const latestCronAge = minutesAgo(latestCronRunDetail?.start_time);
  const latestScheduledAge = minutesAgo(latestScheduledRun?.started_at);
  const latestOutcomeAutoAge = minutesAgo(latestOutcomeAutoRes.data?.created_at);

  const scheduledRunProof = latestScheduledAge !== null && latestScheduledAge <= 15;
  const netHttpProof = latestNetHttpResponse?.status_code === 200 && latestNetHttpResponse?.timed_out === false && latestNetAge !== null && latestNetAge <= 15;
  const cronDetailProof = latestCronRunDetail?.status === "succeeded" && latestCronAge !== null && latestCronAge <= 15;

  return {
    config: cfgRes.data ?? null,
    latestRun: latestRunRes.data ?? null,
    latestScheduledRun,
    recentScheduledRuns: scheduledRowsRes.data ?? [],
    latestManualRun: latestManualRes.data ?? null,
    latestOutcomeAutoCheck: latestOutcomeAutoRes.data ?? null,
    latestOutcomeAutoCheckAgeMinutes: latestOutcomeAutoAge,
    latestScheduledRunAgeMinutes: latestScheduledAge,
    latestNetHttpResponse,
    latestCronRunDetail,
    proof: {
      scheduledRunProof,
      netHttpProof,
      cronDetailProof,
      // pg_cron is only proven by a fresh scanner_runs.run_type='scheduled' row.
      // net._http_response and cron.job_run_details are secondary diagnostics.
      cronProven: scheduledRunProof,
      thresholdMinutes: 15,
      missing: {
        scheduled_run: !scheduledRunProof,
        net_http_response: !netHttpProof,
        cron_job_run_detail: !cronDetailProof,
      },
    },
    edgeFunctions: {
      market_scanner: await probeFunction(Deno.env.get("SUPABASE_URL") ?? "", "market-scanner"),
      scheduled_market_scanner: await probeFunction(Deno.env.get("SUPABASE_URL") ?? "", "scheduled-market-scanner"),
      evaluate_signal_outcomes: await probeFunction(Deno.env.get("SUPABASE_URL") ?? "", "evaluate-signal-outcomes"),
      admin_scheduler_action: { name: "admin-scheduler-action", status: 200, deployed: true, state: "deployed" },
    },
    statuses: {
      pg_cron_registered: Boolean(cfgRes.data?.cron_job_active),
      pg_cron_fired_recently: cronDetailProof,
      scheduled_wrapper_callable: netHttpProof,
      admin_manual_scheduler_test_callable: true,
      latest_automatic_scheduled_scanner_run_exists: Boolean(latestScheduledRun),
      latest_outcome_auto_check_exists: Boolean(latestOutcomeAutoRes.data),
      latest_outcome_auto_check_recent: latestOutcomeAutoAge !== null && latestOutcomeAutoAge <= 15,
    },
    warnings: {
      scanner_config: cfgRes.error?.message ?? null,
      latest_run: latestRunRes.error?.message ?? null,
      latest_scheduled_run: latestScheduledRes.error?.message ?? null,
      recent_scheduled_runs: scheduledRowsRes.error?.message ?? null,
      latest_manual_run: latestManualRes.error?.message ?? null,
      latest_outcome_auto_check: latestOutcomeAutoRes.error?.message ?? null,
      net_http_response: netHttpError,
      cron_run_detail: cronRunDetailError,
    },
  };
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response(null, { status: 200, headers: corsHeaders });

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL") ?? "";
    const serviceRole = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
    if (!supabaseUrl || !serviceRole) return jsonResponse({ success: false, error: "Admin scheduler action is not configured" }, 500);

    const supabase = createClient(supabaseUrl, serviceRole);
    const admin = await verifyAdmin(req, supabase);
    if (!admin.ok) return jsonResponse({ success: false, error: admin.error }, admin.status);

    const body = await req.json().catch(() => ({})) as { action?: string };
    const action = body.action ?? "status";

    if (action === "status") {
      return jsonResponse({ success: true, action, ...(await getSchedulerStatus(supabase)) });
    }

    if (action === "test_scheduled_scanner") {
      const cronSecret = Deno.env.get("SCANNER_CRON_SECRET") ?? "";
      const headers: HeadersInit = { "Content-Type": "application/json" };
      if (cronSecret) headers["x-scanner-cron-secret"] = cronSecret;
      else headers.Authorization = `Bearer ${serviceRole}`;

      const proxy = await fetch(`${supabaseUrl}/functions/v1/scheduled-market-scanner`, {
        method: "POST",
        headers,
        body: JSON.stringify({ source: "admin_manual_scheduled_test", triggered_by: "manual_button", is_automatic: false }),
      });
      const proxiedBody = await parseBody(proxy);

      await supabase.from("audit_logs").insert({
        actor_user_id: admin.userId ?? null,
        action: "test_scheduled_scanner",
        entity_type: "scanner_runs",
        entity_id: typeof proxiedBody === "string" ? null : String((proxiedBody.proxied_body as Record<string, unknown> | undefined)?.run_id ?? proxiedBody.run_id ?? ""),
        metadata: { proxied_status: proxy.status, success: proxy.ok && typeof proxiedBody !== "string" ? proxiedBody.success !== false : proxy.ok },
      });

      const status = await getSchedulerStatus(supabase);
      return jsonResponse({
        success: proxy.ok && (typeof proxiedBody === "string" || proxiedBody.success !== false),
        action,
        wrapper: "admin-scheduler-action",
        proxied_status: proxy.status,
        proxied_body: proxiedBody,
        ...status,
      }, proxy.ok ? 200 : 502);
    }

    return jsonResponse({ success: false, error: `Unknown action: ${action}` }, 400);
  } catch (err) {
    return jsonResponse({ success: false, error: err instanceof Error ? err.message : "Unknown error" }, 500);
  }
});
