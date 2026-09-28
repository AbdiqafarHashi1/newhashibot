import assert from 'node:assert/strict';
import { actionStillValid, audienceForProduct, boundedBackoffSeconds, classifyTelegramError, desiredMembership } from '../../supabase/functions/_shared/telegram-membership.ts';

assert.equal(audienceForProduct('FREE_SIGNALS'),'FREE');
assert.equal(audienceForProduct('VIP_SIGNALS'),'VIP');
assert.equal(audienceForProduct('FOUNDING_AUTO_EXECUTION'),'EXECUTION');
assert.equal(audienceForProduct('/vip'),null,'URLs and client claims never map to access');
assert.equal(audienceForProduct('ADMIN'),null,'admin audience is outside purchases');
assert.equal(audienceForProduct('OWNER'),null,'owner audience is outside purchases');
assert.equal(desiredMembership('ACTIVE'),'ACTIVE');
assert.equal(desiredMembership('GRACE'),'ACTIVE','grace preserves verified access');
assert.equal(desiredMembership('SUSPENDED'),'SUSPENDED');
assert.equal(desiredMembership('EXPIRED'),'REMOVED');
assert.equal(desiredMembership('REVOKED'),'REMOVED');
for(const action of ['ADD','RESTORE'] as const){assert(actionStillValid(action,'ACTIVE'));assert(!actionStillValid(action,'EXPIRED'),'stale grant cannot override revocation')}
assert(actionStillValid('SUSPEND','SUSPENDED'));assert(actionStillValid('REMOVE','REVOKED'));assert(!actionStillValid('REMOVE','ACTIVE'),'renewal wins over stale removal');
assert.deepEqual(classifyTelegramError(429),{classification:'RATE_LIMITED',retryable:true});
assert.deepEqual(classifyTelegramError(503),{classification:'UNCERTAIN',retryable:true});
assert.deepEqual(classifyTelegramError(400,'bot is not an administrator'),{classification:'PERMISSION_MISSING',retryable:true});
assert.deepEqual(classifyTelegramError(400,'bad request'),{classification:'PROVIDER_REJECTED',retryable:false});
assert.equal(boundedBackoffSeconds(1),5);assert.equal(boundedBackoffSeconds(20),900);

const migration=await import('node:fs').then(fs=>fs.readFileSync('supabase/migrations/20260928180000_phase_j_telegram_membership.sql','utf8'));
for(const guard of ['TOKEN_INVALID_OR_REPLAYED','TOKEN_EXPIRED','TELEGRAM_IDENTITY_ALREADY_BOUND','for update skip locked','SERVICE_ROLE_REQUIRED','READY_FOR_CONFIGURATION','telegram_membership_owner_read','revoke insert,update,delete on public.telegram_links']) assert(migration.includes(guard),`missing ${guard}`);
const worker=await import('node:fs').then(fs=>fs.readFileSync('supabase/functions/telegram-membership/index.ts','utf8'));
for(const action of ['ADD','RESTORE','SUSPEND','REMOVE']) assert(worker.includes(action));
for(const guard of ['actionStillValid','getChatMember','INVITE_SENT_AWAITING_EVIDENCE','claim_token','TELEGRAM_WORKER_SECRET','TELEGRAM_WEBHOOK_SECRET']) assert(worker.includes(guard),`worker missing ${guard}`);
assert(!worker.includes('VITE_TELEGRAM_BOT_TOKEN'));assert(!migration.includes('bot_token text'));
console.log('Phase J deterministic policy, security, queue, lifecycle, and Telegram evidence checks passed');
