import assert from 'node:assert/strict';
import { TelegramBrain, SaasRouter, TelegramFeatureFlags } from '../../src/lib/exchange/telegramBrain.js';
import { runtimeTruth } from '../../src/lib/exchange/runtimeTruth.js';

console.log('Running Telegram Brain & SaaS Routing tests...');

// 1. Test Feature Flags & Routing
const brain = new TelegramBrain();

// Mock the sending function
let sends: Array<{ channel: string; text: string }> = [];
brain.onSendMessageMock = async (channel, text) => {
  sends.push({ channel, text });
  return { success: true };
};

// Route a standard signals-created event (should go to VIP and Free)
sends = [];
await brain.routeMessage({
  signalId: 'sig1',
  eventType: 'SIGNAL_CREATED',
  text: 'LONG BTCUSDT entry 100 SL 90 TP 110',
});

assert.equal(sends.length, 2, 'Should route SIGNAL_CREATED to VIP and Free channels');
const freeMsg = sends.find(s => s.channel === 'free');
const vipMsg = sends.find(s => s.channel === 'vip');

assert.ok(freeMsg, 'Should have sent to Free channel');
assert.ok(vipMsg, 'Should have sent to VIP channel');
assert.match(freeMsg.text, /FREE PREVIEW - DELAYED/, 'Free preview message should contain a preview delay notice');
assert.match(freeMsg.text, /Upgrade to VIP/, 'Free preview should contain upgrade CTA');
assert.equal(vipMsg.text, 'LONG BTCUSDT entry 100 SL 90 TP 110', 'VIP should receive untouched original text');

// 2. Test Deduplication
brain.clearSentKeys();
sends = [];
await brain.routeMessage({
  signalId: 'sig1',
  eventType: 'SIGNAL_CREATED',
  text: 'LONG BTCUSDT entry 100 SL 90 TP 110',
});
assert.equal(sends.length, 2, 'First send should route to 2 channels');

sends = [];
await brain.routeMessage({
  signalId: 'sig1',
  eventType: 'SIGNAL_CREATED',
  text: 'LONG BTCUSDT entry 100 SL 90 TP 110',
});
assert.equal(sends.length, 0, 'Subsequent duplicate sends with deduplication enabled should be suppressed');

// Disable dedupe and try again
brain.updateFeatureFlags({ TELEGRAM_DEDUPE_ENABLED: false });
sends = [];
await brain.routeMessage({
  signalId: 'sig1',
  eventType: 'SIGNAL_CREATED',
  text: 'LONG BTCUSDT entry 100 SL 90 TP 110',
});
assert.equal(sends.length, 2, 'With dedupe disabled, duplicates should be allowed through');

// Re-enable dedupe
brain.updateFeatureFlags({ TELEGRAM_DEDUPE_ENABLED: true });

// 3. Test Routing Rules for Channels
// Admin/Ops rules: failures, recoveries, cleanup
sends = [];
await brain.routeMessage({
  eventType: 'DELIVERY_FAILED',
  text: 'Critical DB error occurred',
});
assert.equal(sends.length, 1, 'DELIVERY_FAILED event should route to admin');
assert.equal(sends[0].channel, 'admin', 'Channel should be admin');

// Analytics rules: watchlists, news
sends = [];
await brain.routeMessage({
  eventType: 'watchlist_update',
  text: 'BTC is breaking key resistance level',
});
assert.equal(sends.length, 1, 'watchlist_update event should route to analytics');
assert.equal(sends[0].channel, 'analytics', 'Channel should be analytics');

// 4. Test Retries & Exponential Backoff & Critical Alerts
brain.clearSentKeys();
let triggerFailure = true;
sends = [];
const deliveryAttempts: string[] = [];

brain.onSendMessageMock = async (channel, text) => {
  deliveryAttempts.push(channel);
  if (channel === 'vip' && triggerFailure) {
    return { success: false, error: 'Telegram Rate Limit' };
  }
  sends.push({ channel, text });
  return { success: true };
};

// Route a VIP message that will fail
await brain.routeMessage({
  signalId: 'sig_retry_test',
  eventType: 'SIGNAL_APPROVED',
  text: 'VIP Premium signal',
  channels: ['vip'],
});

// Since the send failed, it should trigger a retry attempt and enqueue a DELIVERY_RETRIED operational warning to admin
const health = brain.getHealth();
assert.equal(health.retryQueueSize, 1, 'Message should be in the retry queue');

// Clear failures and trigger retry now manually
triggerFailure = false;
await brain.forceTriggerRetryNow();

assert.ok(sends.length >= 1, 'Retry should successfully deliver the message');
assert.ok(sends.some(s => s.channel === 'vip'), 'The retried message should be delivered to the VIP channel');

// 5. Test SaaS Permissions Routing
const freePreviewPermissions = SaasRouter.getPermissions({
  userId: 'user1',
  packageSlug: 'free_preview',
  status: 'active',
});
assert.equal(freePreviewPermissions.hasSignalAccess, true, 'Free Preview has signal access');
assert.equal(freePreviewPermissions.hasExecutionAccess, false, 'Free Preview does not have automated execution access');
assert.equal(freePreviewPermissions.hasTelegramAccess, false, 'Free Preview does not have telegram access');

const cryptoBotPermissions = SaasRouter.getPermissions({
  userId: 'user2',
  packageSlug: 'crypto_personal_bot',
  status: 'active',
});
assert.equal(cryptoBotPermissions.hasSignalAccess, true, 'Crypto Bot has signal access');
assert.equal(cryptoBotPermissions.hasExecutionAccess, true, 'Crypto Bot has execution access');
assert.equal(cryptoBotPermissions.hasTelegramAccess, true, 'Crypto Bot has telegram access');
assert.deepEqual(cryptoBotPermissions.allowedProviders, ['binance', 'bybit'], 'Crypto Bot allows Binance and Bybit');

const forexPropPermissions = SaasRouter.getPermissions({
  userId: 'user3',
  packageSlug: 'forex_mt5_prop_bot',
  status: 'active',
});
assert.equal(forexPropPermissions.hasFutureMt5Access, true, 'Forex MT5 Prop Bot has future MT5 access');
assert.ok(forexPropPermissions.allowedProviders.includes('mt5_prop'), 'Forex MT5 Prop Bot allows MT5 Prop provider');

// 6. Test Runtime Truth Updates
runtimeTruth.setAllHealthy();
let truth = runtimeTruth.getTruth();
assert.equal(truth.scanner.status, 'healthy', 'Initially scanner should be healthy');
assert.equal(truth.providers.list.binance.status, 'connected', 'Initially Binance provider should be connected');

// Trigger warning on protection
runtimeTruth.updateComponent('protection', { status: 'warning', actionsRequired: 'Investigate SL offset mismatch' });
truth = runtimeTruth.getTruth();
assert.equal(truth.protection.status, 'warning', 'Protection component should be updated to warning');
assert.equal(truth.protection.actionsRequired, 'Investigate SL offset mismatch', 'Actions required should update');

// Disconnect Bybit provider and require recovery
runtimeTruth.updateProvider('bybit', { status: 'disconnected', recoveryRequired: true });
truth = runtimeTruth.getTruth();
assert.equal(truth.providers.list.bybit.status, 'disconnected', 'Bybit should be disconnected');
assert.equal(truth.providers.status, 'critical', 'Overall provider state should become critical when key provider needs recovery');

console.log('Telegram Brain & SaaS Routing tests passed successfully!');
