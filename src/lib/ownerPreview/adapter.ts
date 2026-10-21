import { createPreviewTables, previewAccounts, previewCustomers, type PreviewRow } from './fixtures.js';

let tables = createPreviewTables();
let customerId = previewCustomers[0].id;
let accountId = previewAccounts[0].id;
let revision = 0;
let view: 'admin' | 'customer' = 'admin';
let accountScoped = false;
const listeners = new Set<() => void>();
export const previewStore = {
  subscribe(fn: () => void) { listeners.add(fn); return () => { listeners.delete(fn); }; },
  snapshot: () => revision,
  customer: () => previewCustomers.find(c => c.id === customerId)!,
  account: () => tables.execution_accounts_safe.find(a => a.id === accountId) ?? previewAccounts.find(a => a.customer_id === customerId)!,
  accounts: () => tables.execution_accounts_safe.filter(a => a.customer_id === customerId),
  selectCustomer(id: string) { if (!previewCustomers.some(c => c.id === id)) return; customerId = id; accountId = previewAccounts.find(a => a.customer_id === id)!.id; revision++; listeners.forEach(fn => fn()); },
  selectAccount(id: string) { if (!previewStore.accounts().some(a => a.id === id)) return; accountId = id; revision++; listeners.forEach(fn => fn()); },
  setView(next: typeof view, scopeAccount = false) { view = next; accountScoped = scopeAccount; },
  reset() { tables = createPreviewTables(); customerId = previewCustomers[0].id; accountId = previewAccounts[0].id; revision++; listeners.forEach(fn => fn()); },
};
const evidence = { simulated: true, evidence_kind: 'SIMULATED_DEMONSTRATION', real_actions: false };
const authError = { message: 'OWNER_PREVIEW_HAS_NO_AUTHENTICATED_SESSION' };
const channel = () => ({ on() { return this; }, subscribe() { return this; }, unsubscribe() {} });

/** In-memory UI projection adapter. No credentials, roles, HTTP or provider adapters. */
export const previewClient = {
  get tables() { return tables; },
  auth: {
    getSession: async () => ({ data: { session: null }, error: null }),
    getUser: async () => ({ data: { user: null }, error: authError }),
    refreshSession: async () => ({ data: { session: null }, error: authError }),
    signInWithPassword: async () => ({ data: { user: null, session: null }, error: authError }),
    signUp: async () => ({ data: { user: null, session: null }, error: authError }),
    signOut: async () => ({ error: null }),
    onAuthStateChange: () => ({ data: { subscription: { unsubscribe() {} } } }),
  },
  channel, removeChannel: async () => {},
  functions: { invoke: async (name: string, options?: { body?: PreviewRow }) => {
    try { return { data: await previewFunction(name, options?.body ?? {}), error: null }; }
    catch (error) { return { data: null, error: { message: (error as Error).message } }; }
  } },
  rpc: async (name: string) => {
    const reads: Record<string, PreviewRow> = {
      telegram_operations_status: { queue_depth: 2, failures: 1, dead_letters: 0, unlinked_customers: 1, membership_drift: 1, configuration_issues: 0 },
      my_release1_customer_subscription: {...tables.customer_subscriptions.find(r=>r.user_id===customerId),package_name:'VIP Signals',product_slug:'crypto_signal_room',verified_commerce:true},
      my_vip_commerce_status: customerId === previewCustomers[0].id ? { state:'ACTIVE', expires_at:'2099-01-01', provider:'DEMONSTRATION' } : { state:'VERIFYING', reference:'DEMONSTRATION_PENDING' },
      my_vip_telegram_status: customerId === previewCustomers[0].id ? { state:'HEALTHY',username:'demo_amina',access_state:'DEMONSTRATION',last_success_at:new Date().toISOString() } : { state:'LINKING_FAILED',safe_error:'Simulated pending membership; no Telegram action' },
    };
    return reads[name] ? { data: { ...reads[name], ...evidence }, error:null }
      : { data:null, error:{ message:`DEMONSTRATION_UNAVAILABLE: RPC ${name} has no fixture; payment and entitlement authority remains server-side` } };
  },
  from(table: string) {
    let predicates: ((row: PreviewRow) => boolean)[] = [];
    let operation: 'read'|'insert'|'upsert'|'update'|'delete' = 'read';
    let payload: PreviewRow | PreviewRow[] = {};
    let single = false, count = false, head = false, limit = Infinity, offset = 0;
    let order: { column: string; ascending: boolean } | null = null;
    const builder: any = {
      select(_columns?: string, options?: { count?: string; head?: boolean }) { count = !!options?.count; head = !!options?.head; return builder; },
      eq(column: string, value: unknown) { predicates.push(row => row[column] === value); return builder; },
      neq(column: string, value: unknown) { predicates.push(row => row[column] !== value); return builder; },
      in(column: string, values: unknown[]) { predicates.push(row => values.includes(row[column])); return builder; },
      is(column: string, value: unknown) { predicates.push(row => (row[column] ?? null) === value); return builder; },
      not(column: string, op: string, value: unknown) { predicates.push(row => op === 'is' ? (row[column] ?? null) !== value : row[column] !== value); return builder; },
      gte(column: string, value: any) { predicates.push(row => row[column] >= value); return builder; },
      lte(column: string, value: any) { predicates.push(row => row[column] <= value); return builder; },
      gt(column: string, value: any) { predicates.push(row => row[column] > value); return builder; },
      lt(column: string, value: any) { predicates.push(row => row[column] < value); return builder; },
      ilike(column: string, value: string) { predicates.push(row => String(row[column] ?? '').toLowerCase().includes(value.replace(/%/g,'').toLowerCase())); return builder; },
      like(column: string, value: string) { return builder.ilike(column, value); },
      or(expression: string) { predicates.push(row => expression.split(',').some(term => { const [col,op,...value] = term.split('.'); return op === 'eq' ? String(row[col]) === value.join('.') : String(row[col] ?? '').includes(value.join('.').replace(/%/g,'')); })); return builder; },
      order(column: string, options?: { ascending?: boolean }) { order = { column, ascending: options?.ascending !== false }; return builder; },
      limit(n: number) { limit = n; return builder; },
      range(from: number, to: number) { offset = from; limit = to - from + 1; return builder; },
      insert(value: PreviewRow | PreviewRow[]) { operation = 'insert'; payload = value; return builder; },
      upsert(value: PreviewRow | PreviewRow[]) { operation = 'upsert'; payload = value; return builder; },
      update(value: PreviewRow) { operation = 'update'; payload = value; return builder; },
      delete() { operation = 'delete'; return builder; },
      single() { single = true; return builder; }, maybeSingle() { single = true; return builder; },
      then(resolve: (value: any) => unknown, reject?: (error: unknown) => unknown) {
        return Promise.resolve().then(() => {
          if (!tables[table]) return { data: single ? null : [], count: count ? 0 : null, error: { message: `DEMONSTRATION_UNAVAILABLE: ${table} has no fixture` } };
          const forbidden = (value: unknown): boolean => !!value && typeof value === 'object' && Object.entries(value).some(([key, item]) => /^(password|api_?key|api_?secret|access_token|refresh_token|credentials|role|session)$/i.test(key) || forbidden(item));
          if (operation !== 'read' && forbidden(payload)) return { data: null, error: { message: 'OWNER_PREVIEW_CREDENTIALS_AND_AUTH_FIELDS_DISABLED' } };
          const all = tables[table];
          const visible = (row: PreviewRow) => view !== 'customer' || (!row.customer_id && !row.user_id) || (row.customer_id ?? row.user_id) === customerId;
          let rows = all.filter(row => visible(row) && (!accountScoped || (!row.execution_account_id && !['execution_accounts_safe','execution_accounts','connected_execution_accounts','mt5_accounts','mt5_accounts_safe'].includes(table)) || (row.execution_account_id ?? row.id) === accountId) && predicates.every(fn => fn(row)));
          if (operation === 'update') rows.forEach(row => Object.assign(row, payload, evidence));
          if (operation === 'delete') tables[table] = all.filter(row => !rows.includes(row));
          if (operation === 'insert' || operation === 'upsert') {
            rows = (Array.isArray(payload) ? payload : [payload]).map(item => ({ ...item, id: item.id ?? `preview-local-${crypto.randomUUID()}`, ...evidence }));
            for (const row of rows) { const existing = operation === 'upsert' && all.find(x => x.id === row.id); if (existing) Object.assign(existing, row); else all.push(row); }
          }
          const total = rows.length;
          if (order) { const { column, ascending } = order; rows.sort((a,b) => (a[column] < b[column] ? -1 : a[column] > b[column] ? 1 : 0) * (ascending ? 1 : -1)); }
          rows = rows.slice(offset, offset + limit);
          return { data: head ? null : single ? rows[0] ?? null : rows, count: count ? total : null, error: null };
        }).then(resolve, reject);
      },
    };
    return builder;
  },
};

const runs: PreviewRow[] = [
  { id: 'preview-replay-completed', mode: 'REPLAY', kind: 'SCANNER', status: 'COMPLETED', dataset_id: 'preview-dataset', dataset_hash: 'simulated-dataset', configuration_hash: 'simulated-config', progress_completed: 120, max_cycles: 120, exclusion_count: 2, outcome_metrics: { overall: { tradeCount: 12, winRate: .58, netR: 2.4 } }, ...evidence },
  { id: 'preview-shadow-running', mode: 'SHADOW', kind: 'SHADOW', status: 'RUNNING', dataset_hash: 'simulated-dataset', configuration_hash: 'simulated-config', progress_completed: 8, max_cycles: 120, exclusion_count: 1, ...evidence },
  { id: 'preview-account-completed', kind: 'ACCOUNT', status: 'COMPLETED', progress_completed: 12, outcome_metrics: { overall: { tradeCount: 12 } }, ...evidence },
];
const datasets = [{ id: 'preview-dataset', source: 'SIMULATED', status: 'READY', symbol: 'EURUSD', timeframe: '15m', starts_at: '2026-01-01', ends_at: '2026-01-31', row_count: 120, dataset_hash: 'simulated-dataset', coverage: {}, provenance: 'SIMULATED DEMONSTRATION — illustrative only' }];
const drafts = new Map<string, PreviewRow>();
export async function previewFunction(name: string, body: PreviewRow): Promise<any> {
  const action = String(body.action ?? '');
  if (/credentials|pairing|checkout|payment|generate|ai-completion/.test(action + name)) throw new Error('OWNER_PREVIEW: credentials, payments and provider/AI actions disabled');
  if (name === 'phase-p-workers') {
    if (action === 'inspect') return { ...evidence, jobs: [], results: [], workers: [], stopNewWork: true, configuration: 'DEMONSTRATION' };
    if (action === 'submit') return previewFunction('phase-m-validation', { ...body, kind: body.kind === 'REPLAY' ? 'SCANNER' : body.kind, action: 'start', mode: body.kind === 'REPLAY' ? 'REPLAY' : body.kind });
    if (['stop','resume','cancel','retry'].includes(action)) return { ...evidence, status: 'SIMULATED', message: 'Local preview only; no remote workers activated' };
  }
  if (name === 'phase-h-authority') {
    if (action === 'load_onboarding') return { state: 'SIMULATED', data: { session: drafts.get(customerId) ?? null }, ...evidence };
    if (action === 'save_onboarding') drafts.set(customerId, structuredClone(body.draft));
    if (action === 'create_account_draft') {
      const id = `preview-created-${crypto.randomUUID()}`;
      const row = { ...previewStore.account(), id, customer_id: customerId, user_id: customerId, provider: body.provider, account_mode: body.mode, environment: body.environment, display_label: `${previewStore.customer().full_name.split(' ')[0]} ${body.provider} ${body.mode} — simulated new account`, status: 'pending', phase_h_readiness: 'BLOCKED', phase_h_certification_status: 'SIMULATED_NOT_CERTIFIED', ...evidence };
      for (const table of ['execution_accounts_safe','execution_accounts','connected_execution_accounts']) tables[table].push(structuredClone(row));
      return { state: 'SIMULATED', data: { execution_account_id: id }, ...evidence };
    }
    if (action === 'assign_brain') {
      tables.account_brain_assignments.push({ id: `preview-brain-${crypto.randomUUID()}`, customer_id: customerId, execution_account_id: body.execution_account_id, risk_percent: body.risk, strategies: body.strategies, brain_family: 'DEMONSTRATION', policy_version: 'demo-v1', superseded_at: null, ...evidence });
    }

    if (['save_onboarding','assign_brain','acknowledge_risk','refresh_readiness','create_support_request','request_additional_account','recommend_brain'].includes(action)) return { state: 'SIMULATED', data: { ...evidence, execution_account_id: accountId }, ...evidence };
  }
  if (name === 'phase-n-operations') {
    const account = previewAccounts.find(a => a.id === body.execution_account_id) ?? previewStore.account();
    if (action === 'INSPECT') return { state: 'OK', data: { provider: account.provider, environment: account.environment, ownershipVerified: false, connectionVerified: false, heartbeatState: account.status, entitlement: 'DEMONSTRATION', stopNewEntries: true, protectionEnabled: true, submissionUncertain: account.status === 'uncertain', openProtectionIncident: account.status === 'incident', certificationStatus: 'SIMULATED_NOT_CERTIFIED', nextAction: 'Inspect demonstration; configure authenticated backend for real testing', ...evidence } };
    if (action === 'HISTORY') return { state: 'OK', data: [] };
    if (action === 'CUSTOMER_DETAIL') return { state: 'OK', data: { accounts: previewStore.accounts(), ...evidence } };
    return { state: 'SIMULATED', data: { ...evidence }, message: 'Disposable local demonstration command only' };
  }
  if (['phase-l-validation','phase-m-shadow','phase-m-validation','canonical-reporting-worker'].includes(name)) {
    if (action === 'datasets') return { datasets, ...evidence };
    if (action === 'upload_dataset') return { id: 'preview-dataset', status: 'SIMULATED', ...evidence };
    if (['list','history'].includes(action)) return { runs: runs.filter(r => !body.kind || r.kind === body.kind), ...evidence };
    if (action === 'details') return { run: runs.find(r => r.id === body.runId), evidence: [{ label: 'Illustrative simulation; no backend certification' }], ...evidence };
    if (action === 'cancel') { const run = runs.find(r => r.id === body.runId); if (run) run.status = 'CANCELLED'; return { status: 'CANCELLED', ...evidence }; }
    if (['start','observe','start_account','start_prop','queue','retry'].includes(action)) {
      const row = { ...runs[0], id: `preview-run-${crypto.randomUUID()}`, kind: body.kind ?? body.mode ?? 'SHADOW', mode: body.mode ?? 'SHADOW', status: body.mode === 'SHADOW' || name === 'phase-m-shadow' ? 'RUNNING' : 'COMPLETED', ...evidence }; runs.push(row); return { ...row, runId: row.id, run: row, cycles: 120 };
    }
    if (['queue_health','status','queue_status','health'].includes(action)) return { status: 'SIMULATED', jobs: [], ...evidence };
  }
  if (['admin-operator-action','admin-scheduler-action','market-scanner','scheduled-market-scanner','telegram-membership'].includes(name)) {
    tables.audit_logs.push({ id: `preview-action-${crypto.randomUUID()}`, action, result: 'SIMULATED', created_at: new Date().toISOString(), ...evidence });
    if (/repair|recover/.test(action)) tables.trade_management_truth.forEach(row => { row.latest_error = null; row.protection_status = 'protected'; row.recovery_status = 'simulated_repair'; });
    if (/start|resume/.test(action)) tables.scanner_config[0].is_enabled = true;
    if (/stop|pause/.test(action)) tables.scanner_config[0].is_enabled = false;
    return { success: true, status: 'SIMULATED', message: `Demonstration ${action || name}; no real action`, result_summary: 'Disposable preview state updated; no worker, provider or Telegram request', ...evidence };
  }
  throw new Error(`DEMONSTRATION_UNAVAILABLE: ${name}/${action} has no implemented fixture action`);
}

