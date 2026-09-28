import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2";
import { actionStillValid, boundedBackoffSeconds, classifyTelegramError } from "../_shared/telegram-membership.ts";

const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });
const safe = (value: unknown) => String(value instanceof Error ? value.message : value).replace(/https?:\/\/\S+/g, "[redacted]").slice(0, 240);

async function telegram(token: string, method: string, body: Record<string, unknown>) {
  const response = await fetch(`https://api.telegram.org/bot${token}/${method}`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
  const payload = await response.json().catch(() => ({})) as { ok?: boolean; result?: any; description?: string; parameters?: { retry_after?: number } };
  if (!response.ok || !payload.ok) throw Object.assign(new Error(payload.description || `telegram_http_${response.status}`), { status: response.status, retryAfter: payload.parameters?.retry_after });
  return payload.result;
}

Deno.serve(async (request) => {
  const url = Deno.env.get("SUPABASE_URL") ?? "", key = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
  const db = createClient(url, key), secret = Deno.env.get("TELEGRAM_WEBHOOK_SECRET"), token = Deno.env.get("TELEGRAM_BOT_TOKEN");
  const webhookHeader = request.headers.get("X-Telegram-Bot-Api-Secret-Token");
  if (webhookHeader !== null) {
    if (!secret || webhookHeader !== secret) return json({ error: "invalid_webhook_secret" }, 401);
    const update = await request.json().catch(() => ({})) as any;
    const from = update.message?.from ?? update.chat_join_request?.from;
    const match = update.message?.text?.match(/^\/start\s+([a-f0-9]{48})$/i);
    if (match && Number.isSafeInteger(from?.id)) {
      const hash = Array.from(new Uint8Array(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(match[1])))).map(v => v.toString(16).padStart(2, "0")).join("");
      const { error } = await db.rpc("consume_telegram_link_token", { p_token_hash: hash, p_telegram_user_id: from.id, p_username: from.username ?? "", p_display_name: [from.first_name, from.last_name].filter(Boolean).join(" ") });
      return error ? json({ error: "link_rejected" }, 403) : json({ ok: true, state: "LINKED" });
    }
    // A join update is evidence, not a browser assertion. Reconciliation will verify it.
    return json({ ok: true, state: "RECONCILIATION_QUEUED" });
  }
  const authorization = request.headers.get("authorization") ?? "";
  if (authorization !== `Bearer ${Deno.env.get("TELEGRAM_WORKER_SECRET")}`) {
    const userDb = createClient(url, Deno.env.get("SUPABASE_ANON_KEY") ?? "", { global: { headers: { Authorization: authorization } } });
    const { data: { user } } = await userDb.auth.getUser();
    const { data: profile } = user ? await db.from("profiles").select("role").eq("id", user.id).single() : { data: null };
    if (!user || profile?.role !== "admin") return json({ error: "worker_unauthorized" }, 401);
    await db.from("commerce_audit_events").insert({ actor_id: user.id, event_type: "TELEGRAM_RECONCILIATION_REQUESTED", safe_metadata: { source: "operations_center" } });
  }
  const { data: jobs, error: claimError } = await db.rpc("claim_telegram_fulfillment", { p_limit: 10 });
  if (claimError) return json({ error: "claim_failed" }, 500);
  const results: Array<Record<string, unknown>> = [];
  for (const job of jobs ?? []) {
    try {
      const [{ data: entitlement }, { data: link }, { data: config }] = await Promise.all([
        db.from("phase_h_entitlements").select("state,updated_at,product_code").eq("id", job.entitlement_id).single(),
        db.from("telegram_links").select("id,telegram_user_id").eq("user_id", job.customer_id).not("telegram_user_id", "is", null).order("updated_at", { ascending: false }).limit(1).maybeSingle(),
        db.from("telegram_audience_configuration").select("audience,chat_id,enabled,bot_permission_verified_at,join_mode").eq("audience", job.audience).single(),
      ]);
      if (!entitlement || !actionStillValid(job.action, entitlement.state)) {
        await db.from("telegram_fulfillment_requests").update({ status: "SUPERSEDED", completed_at: new Date().toISOString(), provider_classification: "STALE_ENTITLEMENT" }).eq("id", job.id).eq("claim_token", job.claim_token);
        results.push({ id: job.id, state: "SUPERSEDED" }); continue;
      }
      if (!link?.telegram_user_id) throw Object.assign(new Error("telegram_identity_not_linked"), { configuration: true });
      if (!token || !config?.enabled || !config.chat_id || !config.bot_permission_verified_at) throw Object.assign(new Error("telegram_audience_not_configured_or_verified"), { configuration: true });
      const member = await telegram(token, "getChatMember", { chat_id: config.chat_id, user_id: link.telegram_user_id });
      const active = ["creator", "administrator", "member", "restricted"].includes(member?.status);
      let state = "COMPLETED", classification = "VERIFIED", membershipState = "ACTIVE", evidence = { telegram_status: member?.status };
      if (["ADD", "RESTORE"].includes(job.action) && !active) {
        if (job.action === "RESTORE" && member?.status === "kicked") await telegram(token, "unbanChatMember", { chat_id: config.chat_id, user_id: link.telegram_user_id, only_if_banned: true });
        const invite = await telegram(token, "createChatInviteLink", { chat_id: config.chat_id, expire_date: Math.floor(Date.now() / 1000) + 600, ...(config.join_mode === "JOIN_REQUEST" ? { creates_join_request: true } : { member_limit: 1 }), name: `HashiBot ${job.audience} ${job.id.slice(0, 8)}` });
        await telegram(token, "sendMessage", { chat_id: link.telegram_user_id, text: "Your verified HashiBot access is ready. Join within 10 minutes; access becomes active only after Telegram confirms membership.", reply_markup: { inline_keyboard: [[{ text: "Join channel", url: invite.invite_link }]] } });
        state = "ACTION_REQUIRED"; classification = "INVITE_SENT_AWAITING_EVIDENCE"; membershipState = "ACTION_REQUIRED"; evidence = { telegram_status: member?.status };
      } else if (job.action === "SUSPEND") {
        if (active) await telegram(token, "banChatMember", { chat_id: config.chat_id, user_id: link.telegram_user_id, revoke_messages: false });
        const verified = await telegram(token, "getChatMember", { chat_id: config.chat_id, user_id: link.telegram_user_id });
        if (verified?.status !== "kicked") throw Object.assign(new Error("suspension_not_verified"), { status: 0 });
        membershipState = "SUSPENDED"; evidence = { telegram_status: verified.status };
      } else if (job.action === "REMOVE") {
        if (active) await telegram(token, "banChatMember", { chat_id: config.chat_id, user_id: link.telegram_user_id, revoke_messages: false });
        await telegram(token, "unbanChatMember", { chat_id: config.chat_id, user_id: link.telegram_user_id, only_if_banned: true });
        const verified = await telegram(token, "getChatMember", { chat_id: config.chat_id, user_id: link.telegram_user_id });
        if (!["left", "kicked"].includes(verified?.status)) throw Object.assign(new Error("removal_not_verified"), { status: 0 });
        membershipState = "REMOVED"; evidence = { telegram_status: verified.status };
      }
      await db.from("telegram_memberships").upsert({ customer_id: job.customer_id, telegram_link_id: link.id, audience: job.audience, state: membershipState, telegram_status: evidence.telegram_status, last_verified_at: new Date().toISOString(), last_provider_classification: classification, safe_error: null, updated_at: new Date().toISOString() }, { onConflict: "customer_id,audience" });
      await db.from("telegram_fulfillment_requests").update({ status: state, completed_at: state === "COMPLETED" ? new Date().toISOString() : null, provider_classification: classification, evidence, safe_error: null }).eq("id", job.id).eq("claim_token", job.claim_token);
      results.push({ id: job.id, state });
    } catch (error: any) {
      const classified = error.configuration ? { classification: "READY_FOR_CONFIGURATION", retryable: true } : classifyTelegramError(error.status ?? 0, safe(error));
      const dead = !classified.retryable || job.attempt_count >= job.max_attempts;
      const status = error.configuration ? "READY_FOR_CONFIGURATION" : dead ? "DEAD_LETTER" : "FAILED";
      const delay = Number(error.retryAfter) || boundedBackoffSeconds(job.attempt_count);
      await db.from("telegram_fulfillment_requests").update({ status, safe_error: safe(error), provider_classification: classified.classification, available_at: new Date(Date.now() + delay * 1000).toISOString() }).eq("id", job.id).eq("claim_token", job.claim_token);
      results.push({ id: job.id, state: status });
    }
  }
  return json({ ok: true, processed: results.length, results });
});
