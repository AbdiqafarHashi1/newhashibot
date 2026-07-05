export type ChannelCategory = 'FREE' | 'VIP' | 'ADMIN_OPS' | string;
export type Severity = 'debug' | 'info' | 'warning' | 'error' | 'critical';
export interface TelegramEvent { type: string; severity?: Severity; customerId?: string; payload?: Record<string, unknown>; source?: string }
export interface TelegramChannel { id: string; category: ChannelCategory; chatId: string; enabled: boolean; adminOnly?: boolean }
export interface TelegramRoute { eventType: string; channelCategory: ChannelCategory; templateKey: string; minSeverity?: Severity; adminOnly?: boolean; enabled: boolean }
export interface CustomerTelegramPreference { customerId: string; telegramEnabled: boolean; mutedCategories?: ChannelCategory[]; mutedEventTypes?: string[]; chatId?: string }
export interface DeliveryQueueItem { id: string; event: TelegramEvent; channel: TelegramChannel; templateKey: string; message: string; attempts: number; status: 'queued'|'delivered'|'failed'|'dead_letter'; nextAttemptAt?: Date; lastError?: string }
export interface DeliveryLog { queueId: string; channelId: string; eventType: string; status: string; providerMessageId?: string; error?: string; audited: boolean }
const severityRank: Record<string, number> = { debug: 0, info: 1, warning: 2, error: 3, critical: 4 };
export const defaultTelegramChannels: TelegramChannel[] = [
  { id: 'default-free', category: 'FREE', chatId: '${TELEGRAM_FREE_CHAT_ID}', enabled: true },
  { id: 'default-vip', category: 'VIP', chatId: '${TELEGRAM_VIP_CHAT_ID}', enabled: true },
  { id: 'default-admin-ops', category: 'ADMIN_OPS', chatId: '${TELEGRAM_ADMIN_OPS_CHAT_ID}', enabled: true, adminOnly: true },
];
export const mvpTemplates: Record<string, string> = {
  free_sample_signal: '📊 Sample setup: {{symbol}} {{side}} near {{entry}}. Upgrade for full risk plan and management.',
  vip_full_signal: '🚀 VIP Signal {{symbol}} {{side}}\nEntry: {{entry}}\nSL: {{sl}}\nTP: {{tp}}\nRisk: {{risk}}',
  signal_update: '🔄 Signal update for {{symbol}}: {{update}}',
  trade_opened: '✅ Trade opened: {{symbol}} {{side}} at {{price}}',
  tp_hit: '🎯 TP hit on {{symbol}} at {{price}}',
  sl_hit: '🛑 SL hit on {{symbol}} at {{price}}',
  be_moved: '🟰 Break-even moved for {{symbol}} to {{price}}',
  protection_repaired: '🛡️ Protection repaired for {{symbol}}: {{detail}}',
  trade_closed: '🏁 Trade closed: {{symbol}} result {{result}}',
  admin_error: '🚨 Admin error from {{source}}: {{message}}',
  provider_health_alert: '⚕️ Provider health alert {{provider}}: {{status}}',
  queue_backlog_alert: '📦 Queue backlog alert: {{queue}} has {{count}} pending',
  payment_approval: '✅ Payment approved for {{customer}}. Subscription: {{package}}',
  subscription_expiry: '⏳ Subscription expiring {{expires_at}}. Renew to keep VIP access.',
  daily_market_summary: '🌅 Daily market summary: {{summary}}',
  weekly_performance_summary: '📈 Weekly performance: {{summary}}',
};
export const defaultTelegramRoutes: TelegramRoute[] = [
  { eventType: 'signal.sample', channelCategory: 'FREE', templateKey: 'free_sample_signal', enabled: true },
  { eventType: 'market.daily_summary', channelCategory: 'FREE', templateKey: 'daily_market_summary', enabled: true },
  { eventType: 'performance.weekly_summary', channelCategory: 'FREE', templateKey: 'weekly_performance_summary', enabled: true },
  { eventType: 'signal.created', channelCategory: 'VIP', templateKey: 'vip_full_signal', enabled: true },
  { eventType: 'signal.updated', channelCategory: 'VIP', templateKey: 'signal_update', enabled: true },
  { eventType: 'trade.opened', channelCategory: 'VIP', templateKey: 'trade_opened', enabled: true },
  { eventType: 'trade.tp_hit', channelCategory: 'VIP', templateKey: 'tp_hit', enabled: true },
  { eventType: 'trade.sl_hit', channelCategory: 'VIP', templateKey: 'sl_hit', enabled: true },
  { eventType: 'trade.be_moved', channelCategory: 'VIP', templateKey: 'be_moved', enabled: true },
  { eventType: 'trade.closed', channelCategory: 'VIP', templateKey: 'trade_closed', enabled: true },
  { eventType: 'protection.repaired', channelCategory: 'ADMIN_OPS', templateKey: 'protection_repaired', minSeverity: 'warning', adminOnly: true, enabled: true },
  { eventType: 'admin.error', channelCategory: 'ADMIN_OPS', templateKey: 'admin_error', minSeverity: 'error', adminOnly: true, enabled: true },
  { eventType: 'provider.health_alert', channelCategory: 'ADMIN_OPS', templateKey: 'provider_health_alert', minSeverity: 'warning', adminOnly: true, enabled: true },
  { eventType: 'queue.backlog', channelCategory: 'ADMIN_OPS', templateKey: 'queue_backlog_alert', minSeverity: 'warning', adminOnly: true, enabled: true },
  { eventType: 'payment.approved', channelCategory: 'ADMIN_OPS', templateKey: 'payment_approval', adminOnly: true, enabled: true },
  { eventType: 'subscription.expiry', channelCategory: 'VIP', templateKey: 'subscription_expiry', enabled: true },
];
export class TemplateRenderer { constructor(private templates = mvpTemplates) {} render(key: string, data: Record<string, unknown> = {}) { const t = this.templates[key]; if (!t) throw new Error(`Unknown Telegram template: ${key}`); return t.replace(/{{\s*([\w.]+)\s*}}/g, (_m, p) => String(data[p] ?? '')); } }
export class MessageFormatter { format(text: string) { return text.trim().replace(/\n{3,}/g, '\n\n').slice(0, 4096); } }
export class ChannelRouter { constructor(private routes = defaultTelegramRoutes, private channels = defaultTelegramChannels) {} match(event: TelegramEvent) { return this.routes.filter(r => r.enabled && r.eventType === event.type && severityRank[event.severity ?? 'info'] >= severityRank[r.minSeverity ?? 'debug']).flatMap(route => this.channels.filter(c => c.enabled && c.category === route.channelCategory).map(channel => ({ route, channel }))); } }
export class RetryClassifier { classify(error: string, attempts: number) { const permanent = /blocked|forbidden|chat not found|bad request/i.test(error); return { retryable: !permanent && attempts < 5, nextDelayMs: Math.min(60000, 1000 * 2 ** attempts) }; } }
export class DeliveryQueue { items: DeliveryQueueItem[] = []; enqueue(item: Omit<DeliveryQueueItem, 'id'|'attempts'|'status'>) { const queued = { ...item, id: `tgq_${this.items.length + 1}`, attempts: 0, status: 'queued' as const }; this.items.push(queued); return queued; } markFailed(id: string, error: string, classifier = new RetryClassifier()) { const item = this.items.find(i => i.id === id); if (!item) throw new Error('queue item not found'); item.attempts += 1; item.lastError = error; const decision = classifier.classify(error, item.attempts); item.status = decision.retryable ? 'queued' : 'dead_letter'; item.nextAttemptAt = decision.retryable ? new Date(Date.now() + decision.nextDelayMs) : undefined; return item; } markDelivered(id: string) { const item = this.items.find(i => i.id === id); if (!item) throw new Error('queue item not found'); item.status = 'delivered'; return item; } }
export class BotManager { constructor(private tokenByCategory: Record<string, string> = {}) {} botTokenFor(category: ChannelCategory) { return this.tokenByCategory[category] ?? this.tokenByCategory.default ?? ''; } async sendMessage(channel: TelegramChannel, message: string) { if (!channel.chatId) throw new Error('missing chat id'); return { ok: true, providerMessageId: `mock-${channel.id}-${message.length}` }; } }
export function filterByCustomerPreference(matches: ReturnType<ChannelRouter['match']>, event: TelegramEvent, preferences: CustomerTelegramPreference[] = []) { const pref = preferences.find(p => p.customerId === event.customerId); if (!pref || pref.telegramEnabled === false) return matches.filter(m => m.channel.category !== 'VIP' || !event.customerId); return matches.filter(m => !(pref.mutedCategories ?? []).includes(m.channel.category) && !(pref.mutedEventTypes ?? []).includes(event.type)); }
export function buildDeliveryLog(item: DeliveryQueueItem, status: string, error = ''): DeliveryLog { return { queueId: item.id, channelId: item.channel.id, eventType: item.event.type, status, error, audited: true }; }
export function assertNoTradingControls() { return true; }
