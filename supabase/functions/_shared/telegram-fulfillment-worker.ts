import {actionStillValid,boundedBackoffSeconds,classifyTelegramError} from "./telegram-membership.ts";
const safe = (value: unknown) => String(value instanceof Error ? value.message : value).replace(/https?:\/\/\S+/g, "[redacted]").slice(0, 240);
/** Shared by the authenticated Edge worker and mocked end-to-end tests. */
export async function processTelegramFulfillmentJobs(db:any,token:string|undefined,telegram:(token:string,method:string,body:Record<string,unknown>)=>Promise<any>) {
  const { data: jobs, error: claimError } = await db.rpc("claim_telegram_fulfillment", { p_limit: 25 });
  if (claimError) throw Error("FULFILLMENT_CLAIM_FAILED");
  const results: Array<Record<string, unknown>> = [];
  for (const job of jobs ?? []) {
    try {
      const [{ data: entitlement }, { data: link }, { data: config }] = await Promise.all([
        db.from("phase_h_entitlements").select("state,updated_at,product_code,valid_from,valid_until").eq("id", job.entitlement_id).single(),
        db.from("telegram_links").select("id,telegram_user_id").eq("user_id", job.customer_id).not("telegram_user_id", "is", null).order("updated_at", { ascending: false }).limit(1).maybeSingle(),
        db.from("telegram_audience_configuration").select("audience,chat_id,enabled,bot_permission_verified_at,join_mode").eq("audience", job.audience).single(),
      ]);
      let effectiveState=entitlement?.state;
      if(entitlement?.product_code==='VIP_SIGNALS'){
        const authority=await db.rpc('has_product_entitlement',{p_user_id:job.customer_id,p_product_slug:'crypto_signal_room',p_at:new Date().toISOString()});
        if(authority.error)throw Object.assign(new Error('payment_authority_unavailable'),{configuration:true});
        if(authority.data!==true && ['ACTIVE','TRIAL','GRACE'].includes(effectiveState))effectiveState='REVOKED';
        if(authority.data===true && ['REMOVE','SUSPEND'].includes(job.action)){await db.from('telegram_fulfillment_requests').update({status:'SUPERSEDED',provider_classification:'CURRENT_VERIFIED_ENTITLEMENT'}).eq('id',job.id).eq('claim_token',job.claim_token);results.push({id:job.id,state:'SUPERSEDED'});continue;}
      }
      // An older expired purchase must never revoke a newer active subscription.
      if (["REMOVE","SUSPEND"].includes(job.action) && entitlement && entitlement.product_code!=="VIP_SIGNALS") {
        const {data:active,error:activeError}=await db.from("phase_h_entitlements").select("id").eq("customer_id",job.customer_id).eq("product_code",entitlement.product_code).in("state",["ACTIVE","TRIAL","GRACE"]).lte("valid_from",new Date().toISOString()).gt("valid_until",new Date().toISOString()).limit(1).maybeSingle();
        if(activeError) throw Object.assign(new Error("entitlement_authority_unavailable"),{configuration:true});
        if(active){await db.from("telegram_fulfillment_requests").update({status:"SUPERSEDED",provider_classification:"NEWER_ACTIVE_ENTITLEMENT"}).eq("id",job.id).eq("claim_token",job.claim_token);results.push({id:job.id,state:"SUPERSEDED"});continue;}
      }
      if (!entitlement || !actionStillValid(job.action, effectiveState) || ["ADD", "RESTORE"].includes(job.action) && (entitlement.valid_until && Date.parse(entitlement.valid_until) <= Date.now() || entitlement.valid_from && Date.parse(entitlement.valid_from) > Date.now())) {
        await db.from("telegram_fulfillment_requests").update({ status: "SUPERSEDED", completed_at: new Date().toISOString(), provider_classification: "STALE_ENTITLEMENT" }).eq("id", job.id).eq("claim_token", job.claim_token);
        results.push({ id: job.id, state: "SUPERSEDED" }); continue;
      }
      if (!link?.telegram_user_id) throw Object.assign(new Error("telegram_identity_not_linked"), { configuration: true });
      if (!token || !config?.enabled || !config.chat_id || !config.bot_permission_verified_at) throw Object.assign(new Error("telegram_audience_not_configured_or_verified"), { configuration: true });
      const member = await telegram(token, "getChatMember", { chat_id: config.chat_id, user_id: link.telegram_user_id });
      const active = (["creator", "administrator", "member"].includes(member?.status) || member?.status === "restricted" && member?.is_member === true);
      let state = "COMPLETED", classification = "VERIFIED", membershipState = "ACTIVE", evidence = { telegram_status: member?.status };
      if (["ADD", "RESTORE"].includes(job.action) && !active) {
        if (job.action === "RESTORE" && member?.status === "kicked") await telegram(token, "unbanChatMember", { chat_id: config.chat_id, user_id: link.telegram_user_id, only_if_banned: true });
        const invite = await telegram(token, "createChatInviteLink", { chat_id: config.chat_id, expire_date: Math.floor(Date.now() / 1000) + 600, creates_join_request: true, name: `HashiBot ${job.audience} ${job.id.slice(0, 8)}` });
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
      const saved = await db.from("telegram_memberships").upsert({ customer_id: job.customer_id, telegram_link_id: link.id, audience: job.audience, state: membershipState, telegram_status: evidence.telegram_status, last_verified_at: new Date().toISOString(), last_provider_classification: classification, safe_error: null, updated_at: new Date().toISOString() }, { onConflict: "customer_id,audience" });
      if(saved.error)throw Object.assign(new Error("membership_evidence_not_persisted"),{status:0});
      const finished=await db.from("telegram_fulfillment_requests").update({ status: state, completed_at: state === "COMPLETED" ? new Date().toISOString() : null, provider_classification: classification, evidence, safe_error: null }).eq("id", job.id).eq("claim_token", job.claim_token);
      if(finished.error)throw Object.assign(new Error("fulfillment_state_not_persisted"),{status:0});
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
  return { ok: true, processed: results.length, results };
}
