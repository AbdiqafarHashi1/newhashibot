import { getBotToken, getVipChatId } from "./telegram-registry.ts";

type Db = { from: (table: string) => any; rpc: (name: string, args: Record<string, unknown>) => Promise<{ data: unknown; error: { message: string } | null }> };
const api = async (method: string, body: Record<string, unknown>) => {
  const token = getBotToken();
  if (!token) throw new Error("telegram_bot_not_configured");
  const response = await fetch(`https://api.telegram.org/bot${token}/${method}`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body), signal: AbortSignal.timeout(8000) });
  const result = await response.json() as { ok: boolean; result?: any; description?: string };
  if (!response.ok || !result.ok) throw new Error(`telegram_${method}_failed:${result.description ?? response.status}`);
  return result.result;
};
const safeError = (error: unknown) => String(error instanceof Error ? error.message : error).slice(0, 240);

export async function fulfillVipAccess(db: Db, userId: string, telegramUserId: number, linkId: string) {
  const chatId = getVipChatId();
  if (!chatId) throw new Error("vip_chat_not_configured");
  const { data: entitled, error } = await db.rpc("has_product_entitlement", { p_user_id: userId, p_product_slug: "crypto_signal_room", p_at: new Date().toISOString() });
  if (error || entitled !== true) throw new Error("active_vip_entitlement_required");
  await db.from("telegram_links").update({ last_fulfillment_attempt_at: new Date().toISOString(), fulfillment_attempts: 1 }).eq("id", linkId).eq("user_id", userId);
  try {
    const member = await api("getChatMember", { chat_id: chatId, user_id: telegramUserId });
    if (["creator", "administrator", "member", "restricted"].includes(member?.status)) {
      await db.from("telegram_links").update({ access_state: "healthy", status: "connected", last_fulfillment_success_at: new Date().toISOString(), fulfillment_error: null, invite_link: null, invite_expires_at: null, updated_at: new Date().toISOString() }).eq("id", linkId).eq("user_id", userId);
      return { state: "HEALTHY", alreadyMember: true };
    }
    const expires = Math.floor(Date.now() / 1000) + 600;
    const invite = await api("createChatInviteLink", { chat_id: chatId, expire_date: expires, creates_join_request: true, name: `HashiBot VIP ${linkId.slice(0, 8)}` });
    await api("sendMessage", { chat_id: telegramUserId, text: "Your HashiBot VIP entitlement is active. Use this private, identity-verified join request within 10 minutes:", reply_markup: { inline_keyboard: [[{ text: "Join HashiBot VIP", url: invite.invite_link }]] } });
    await db.from("telegram_links").update({ access_state: "invite_sent", status: "connected", invite_link: invite.invite_link, invite_expires_at: new Date(expires * 1000).toISOString(), last_fulfillment_success_at: new Date().toISOString(), fulfillment_error: null, updated_at: new Date().toISOString() }).eq("id", linkId).eq("user_id", userId);
    return { state: "INVITE_SENT", alreadyMember: false };
  } catch (error) {
    await db.from("telegram_links").update({ access_state: "failed", fulfillment_error: safeError(error), updated_at: new Date().toISOString() }).eq("id", linkId).eq("user_id", userId);
    throw error;
  }
}

export async function revokeVipAccess(db: Db, userId: string, telegramUserId: number, linkId: string) {
  const chatId = getVipChatId();
  if (!chatId) throw new Error("vip_chat_not_configured");
  const { data: entitled, error } = await db.rpc("has_product_entitlement", { p_user_id: userId, p_product_slug: "crypto_signal_room", p_at: new Date().toISOString() });
  if (error || typeof entitled !== "boolean") throw new Error("entitlement_authority_unavailable");
  if (entitled === true) return { state: "ACTIVE_NO_REVOKE" };
  try {
    await api("banChatMember", { chat_id: chatId, user_id: telegramUserId, revoke_messages: false });
    await api("unbanChatMember", { chat_id: chatId, user_id: telegramUserId, only_if_banned: true });
    await db.from("telegram_links").update({ access_state: "revoked", status: "revoked", invite_link: null, invite_expires_at: null, last_fulfillment_attempt_at: new Date().toISOString(), last_fulfillment_success_at: new Date().toISOString(), fulfillment_error: null, updated_at: new Date().toISOString() }).eq("id", linkId).eq("user_id", userId);
    return { state: "REVOKED" };
  } catch (error) {
    await db.from("telegram_links").update({ access_state: "failed", last_fulfillment_attempt_at: new Date().toISOString(), fulfillment_error: safeError(error), updated_at: new Date().toISOString() }).eq("id", linkId).eq("user_id", userId);
    throw error;
  }
}
