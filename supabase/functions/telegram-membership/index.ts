import {processTelegramFulfillmentJobs} from "../_shared/telegram-fulfillment-worker.ts";
import {handleTelegramJoinRequest} from "../_shared/telegram-join-request.ts";
import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2";

const cors={"Access-Control-Allow-Origin":"*","Access-Control-Allow-Headers":"authorization,apikey,content-type,x-client-info","Access-Control-Allow-Methods":"POST,OPTIONS"};
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { ...cors, "content-type": "application/json" } });

async function telegram(token: string, method: string, body: Record<string, unknown>) {
  const response = await fetch(`https://api.telegram.org/bot${token}/${method}`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body), signal: AbortSignal.timeout(8000) });
  const payload = await response.json().catch(() => ({})) as { ok?: boolean; result?: any; description?: string; parameters?: { retry_after?: number } };
  if (!response.ok || !payload.ok) throw Object.assign(new Error(payload.description || `telegram_http_${response.status}`), { status: response.status, retryAfter: payload.parameters?.retry_after });
  return payload.result;
}

Deno.serve(async (request) => {
  if(request.method==='OPTIONS')return new Response(null,{status:204,headers:cors});
  if(request.method!=='POST')return json({error:'method_not_allowed'},405);
  const url = Deno.env.get("SUPABASE_URL") ?? "", key = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
  const db = createClient(url, key), secret = Deno.env.get("TELEGRAM_WEBHOOK_SECRET"), token = Deno.env.get("TELEGRAM_BOT_TOKEN");
  const webhookHeader = request.headers.get("X-Telegram-Bot-Api-Secret-Token");
  if (webhookHeader !== null) {
    if (!secret || webhookHeader !== secret) return json({ error: "invalid_webhook_secret" }, 401);
    const update = await request.json().catch(() => ({})) as any;
    if (update.chat_join_request) {
      if (!token) return json({error:"telegram_not_configured"},503);
      try { return json(await handleTelegramJoinRequest(db, update.chat_join_request, (method, body) => telegram(token, method, body))); }
      catch { return json({error:"join_reconciliation_required"},503); }
    }
    const from = update.message?.from ?? update.chat_join_request?.from;
    const match = update.message?.text?.match(/^\/start\s+([a-f0-9]{48})$/i);
    if (match && Number.isSafeInteger(from?.id)) {
      const hash = Array.from(new Uint8Array(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(match[1])))).map(v => v.toString(16).padStart(2, "0")).join("");
      const { error } = await db.rpc("consume_telegram_link_token", { p_token_hash: hash, p_telegram_user_id: from.id, p_username: from.username ?? "", p_display_name: [from.first_name, from.last_name].filter(Boolean).join(" ") });
      return error ? json({ ok: true, state: "LINK_REJECTED_REQUEST_FRESH_LINK" }) : json({ ok: true, state: "LINKED" });
    }
    // A join update is evidence, not a browser assertion. Reconciliation will verify it.
    return json({ ok: true, state: "RECONCILIATION_QUEUED" });
  }
  const authorization = request.headers.get("authorization") ?? "";
  if (!Deno.env.get("TELEGRAM_WORKER_SECRET") || authorization !== `Bearer ${Deno.env.get("TELEGRAM_WORKER_SECRET")}`) {
    const userDb = createClient(url, Deno.env.get("SUPABASE_ANON_KEY") ?? "", { global: { headers: { Authorization: authorization } } });
    const { data: { user } } = await userDb.auth.getUser();
    const { data: profile } = user ? await db.from("profiles").select("role").eq("id", user.id).single() : { data: null };
    if (!user || profile?.role !== "admin") return json({ error: "worker_unauthorized" }, 401);
    await db.from("commerce_audit_events").insert({ actor_id: user.id, event_type: "TELEGRAM_RECONCILIATION_REQUESTED", safe_metadata: { source: "operations_center" } });
  }
  const {error: sweepError} = await db.rpc("reconcile_release1_vip_memberships");
  if (sweepError) return json({error:"membership_sweep_unavailable"},503);
  try { return json(await processTelegramFulfillmentJobs(db,token,telegram)); }
  catch { return json({error:"fulfillment_worker_failed"},503); }

});
