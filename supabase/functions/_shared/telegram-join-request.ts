/** Join requests are authorized against the linked identity and canonical, unexpired entitlement. */
export async function handleTelegramJoinRequest(db: any, request: any, telegram: (method: string, body: Record<string, unknown>) => Promise<any>, now = new Date()) {
  const userId = request?.from?.id, chatId = request?.chat?.id;
  if (!Number.isSafeInteger(userId) || !Number.isSafeInteger(chatId)) throw Error('INVALID_JOIN_REQUEST');
  const [{ data: config, error: configError }, { data: link, error: linkError }] = await Promise.all([
    db.from('telegram_audience_configuration').select('audience,product_code,chat_id,enabled,bot_permission_verified_at').eq('chat_id', String(chatId)).eq('enabled', true).maybeSingle(),
    db.from('telegram_links').select('id,user_id,telegram_user_id').eq('telegram_user_id', userId).order('updated_at', { ascending: false }).limit(1).maybeSingle(),
  ]);
  if (configError || linkError) throw Error('JOIN_AUTHORITY_UNAVAILABLE');
  if (!config?.bot_permission_verified_at || !config.product_code) return { state: 'UNMANAGED_CHANNEL' };
  let entitled = false;
  if (link) {
    let query=db.from('phase_h_entitlements').select('id,valid_until').eq('customer_id',link.user_id).eq('product_code',config.product_code).in('state',['ACTIVE','TRIAL','GRACE']).lte('valid_from',now.toISOString());
    if(config.product_code!=='FREE_SIGNALS')query=query.gt('valid_until',now.toISOString());
    const {data,error}=await query.limit(1).maybeSingle();
    if (error) throw Error('JOIN_ENTITLEMENT_UNAVAILABLE');
    entitled = Boolean(data && (data.valid_until === null || Date.parse(data.valid_until)>now.getTime()));
    if (entitled && config.product_code === 'VIP_SIGNALS') {
      const verified = await db.rpc('has_product_entitlement', {p_user_id:link.user_id,p_product_slug:'crypto_signal_room',p_at:now.toISOString()});
      if(verified.error)throw Error('JOIN_PAYMENT_AUTHORITY_UNAVAILABLE');
      entitled=verified.data===true;
    }
  }
  if (!entitled) {
    await telegram('declineChatJoinRequest', { chat_id: chatId, user_id: userId });
    return { state: 'DECLINED_NO_ACTIVE_ENTITLEMENT' };
  }
  await telegram('approveChatJoinRequest', { chat_id: chatId, user_id: userId });
  const member = await telegram('getChatMember', { chat_id: chatId, user_id: userId });
  if (!['creator', 'administrator', 'member'].includes(member?.status) && !(member?.status === 'restricted' && member?.is_member === true)) throw Error('JOIN_MEMBERSHIP_NOT_VERIFIED');
  const { error } = await db.from('telegram_memberships').upsert({ customer_id: link.user_id, telegram_link_id: link.id, audience: config.audience, state: 'ACTIVE', telegram_status: member.status, last_verified_at: now.toISOString(), last_provider_classification: 'IDENTITY_AND_ENTITLEMENT_VERIFIED', safe_error: null, updated_at: now.toISOString() }, { onConflict: 'customer_id,audience' });
  if (error) throw Error('JOIN_EVIDENCE_NOT_PERSISTED');
  return { state: 'ACTIVE' };
}
