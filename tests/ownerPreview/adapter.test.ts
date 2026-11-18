import assert from 'node:assert/strict';
import { test } from 'node:test';
import { previewClient, previewFunction, previewStore } from '../../src/lib/ownerPreview/adapter';
import { previewAccounts, previewCustomers } from '../../src/lib/ownerPreview/fixtures';
import { previewDatasetCampaign } from '../../src/lib/ownerPreview/research';
import { permitsPreviewRequest } from '../../src/lib/ownerPreview/isolation';

test('preview supplies no authenticated user, session, JWT or administrator role', async () => {
  assert.equal((await previewClient.auth.getSession()).data.session, null);
  assert.equal((await previewClient.auth.getUser()).data.user, null);
  assert.equal((await previewClient.auth.refreshSession()).data.session, null);
  assert.ok((await previewClient.auth.signInWithPassword()).error);
  assert.ok(previewCustomers.every(customer => customer.role === 'user'));
});
test('two independent fixture customers own distinct account configurations; this is not an RLS test', async () => {
  assert.equal(new Set(previewAccounts.map(a => a.id)).size, 5);
  assert.deepEqual(new Set(previewAccounts.map(a => a.status)), new Set(['healthy','uncertain','incident','blocked','pending']));
  previewStore.setView('customer');
  for (const customer of previewCustomers) {
    previewStore.selectCustomer(customer.id);
    const { data } = await previewClient.from('execution_accounts_safe').select('*');
    assert.ok(data.length > 0);
    assert.ok(data.every((row: any) => row.customer_id === customer.id));
    const foreign = previewAccounts.find(a => a.customer_id !== customer.id)!;
    assert.deepEqual((await previewClient.from('execution_accounts_safe').select('*').eq('id',foreign.id)).data, []);
    previewStore.selectAccount(foreign.id);
    assert.notEqual(previewStore.account().id, foreign.id);
  }
  previewStore.selectCustomer(previewCustomers[1].id);
  previewStore.selectAccount('preview-yusuf-bybit');
  previewStore.setView('customer',true);
  assert.deepEqual((await previewClient.from('execution_accounts_safe').select('*')).data.map((row:any)=>row.id),['preview-yusuf-bybit']);
  previewStore.setView('admin');
});
test('query updates apply filters after update, and modify disposable fixtures only', async () => {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async () => { throw Error('unexpected external request'); };
  try {
    const id = previewAccounts[0].id;
    await previewClient.from('execution_accounts_safe').update({ display_label: 'Local change' }).eq('id',id);
    const { data } = await previewClient.from('execution_accounts_safe').select('*');
    assert.equal(data.filter((row: any) => row.display_label === 'Local change').length,1);
    previewStore.reset();
    assert.notEqual((await previewClient.from('execution_accounts_safe').select('*').eq('id',id).single()).data.display_label,'Local change');
    assert.ok((await previewClient.from('execution_accounts_safe').update({apiSecret:'must-not-be-stored'}).eq('id',id)).error);
    assert.equal((await previewClient.from('execution_accounts_safe').select('*').eq('id',id).single()).data.apiSecret,undefined);
    const run = await previewFunction('phase-l-validation',{ action:'start', mode:'SHADOW' });
    assert.equal(run.simulated,true);
    await previewFunction('phase-l-validation',{action:'cancel',runId:run.id});
    assert.equal((await previewFunction('phase-l-validation',{action:'details',runId:run.id})).run.status,'CANCELLED');
    await assert.rejects(previewFunction('phase-h-authority',{action:'submit_credentials',credentials:{apiKey:'do-not-store'}}),/disabled/);
    await assert.rejects(previewFunction('whop-create-checkout',{}),/disabled/);
    await assert.rejects(previewFunction('unknown-worker',{}),/DEMONSTRATION_UNAVAILABLE/);
  } finally { globalThis.fetch = originalFetch; }
});
test('illustrative research cannot be mistaken for venue-certified data', () => {
  const campaign = previewDatasetCampaign('CRYPTO',['BTCUSDT'],['15m']);
  assert.equal(campaign.datasets[0].bars.length,600);
  assert.equal(campaign.datasets[0].metadata.provider,'CSV');
  assert.equal(campaign.datasets[0].metadata.environment,'OWNER_PREVIEW_SIMULATED');
  assert.ok(campaign.inventory.every(item => !item.certifiable));
});
test('network allowlist rejects all APIs, providers and mutations while permitting local assets', () => {
  const origin='https://hashibot.example';
  assert.ok(permitsPreviewRequest('/assets/app.js','GET',origin));
  assert.ok(permitsPreviewRequest('/research/mission2-results.json','GET',origin));
  assert.equal(permitsPreviewRequest('/research/mission2-results.json','POST',origin),false);
  assert.equal(permitsPreviewRequest('https://example.com/research/mission2-results.json','GET',origin),false);
  for (const [path, method] of [['/api/ai','POST'],['/api/health','GET'],['/functions/v1/admin-operator-action','POST'],['https://api.binance.com/api/v3/order','POST'],['https://example.supabase.co/rest/v1/profiles','GET'],['/assets/app.js','POST']]) assert.equal(permitsPreviewRequest(path,method,origin),false);
});
