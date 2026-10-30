import {browserId} from '../browserId';
import { createPreviewTables, previewAccounts, previewCustomers, type PreviewRow,type PreviewAccount } from './fixtures.js';

interface PreviewResult {data:PreviewRow|PreviewRow[]|null;count?:number|null;error:{message:string}|null}
interface PreviewQuery extends PromiseLike<PreviewResult> {
 select(columns?:string,options?:{count?:string;head?:boolean}):PreviewQuery;
 eq(column:string,value:unknown):PreviewQuery;neq(column:string,value:unknown):PreviewQuery;in(column:string,values:unknown[]):PreviewQuery;is(column:string,value:unknown):PreviewQuery;not(column:string,op:string,value:unknown):PreviewQuery;
 gte(column:string,value:unknown):PreviewQuery;lte(column:string,value:unknown):PreviewQuery;gt(column:string,value:unknown):PreviewQuery;lt(column:string,value:unknown):PreviewQuery;
 ilike(column:string,value:string):PreviewQuery;like(column:string,value:string):PreviewQuery;or(expression:string):PreviewQuery;
 order(column:string,options?:{ascending?:boolean}):PreviewQuery;limit(n:number):PreviewQuery;range(from:number,to:number):PreviewQuery;
 insert(value:PreviewRow|PreviewRow[]):PreviewQuery;upsert(value:PreviewRow|PreviewRow[]):PreviewQuery;update(value:PreviewRow):PreviewQuery;delete():PreviewQuery;single():PreviewQuery;maybeSingle():PreviewQuery;
}
const compare=(left:unknown,right:unknown)=>typeof left==='number'&&typeof right==='number'?left-right:typeof left==='string'&&typeof right==='string'?left<right?-1:left>right?1:0:NaN;
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
  account: () => (tables.execution_accounts_safe as PreviewAccount[]).find(a => a.id === accountId) ?? previewAccounts.find(a => a.customer_id === customerId)!,
  accounts: () => (tables.execution_accounts_safe as PreviewAccount[]).filter(a => a.customer_id === customerId),
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
    const predicates: ((row: PreviewRow) => boolean)[] = [];
    let operation: 'read'|'insert'|'upsert'|'update'|'delete' = 'read';
    let payload: PreviewRow | PreviewRow[] = {};
    let single = false, count = false, head = false, limit = Infinity, offset = 0;
    let order: { column: string; ascending: boolean } | null = null;
    const builder: PreviewQuery = {
      select(_columns?: string, options?: { count?: string; head?: boolean }) { count = !!options?.count; head = !!options?.head; return builder; },
      eq(column: string, value: unknown) { predicates.push(row => row[column] === value); return builder; },
      neq(column: string, value: unknown) { predicates.push(row => row[column] !== value); return builder; },
      in(column: string, values: unknown[]) { predicates.push(row => values.includes(row[column])); return builder; },
      is(column: string, value: unknown) { predicates.push(row => (row[column] ?? null) === value); return builder; },
      not(column: string, op: string, value: unknown) { predicates.push(row => op === 'is' ? (row[column] ?? null) !== value : row[column] !== value); return builder; },
      gte(column: string, value: unknown) { predicates.push(row => compare(row[column], value) >= 0); return builder; },
      lte(column: string, value: unknown) { predicates.push(row => compare(row[column], value) <= 0); return builder; },
      gt(column: string, value: unknown) { predicates.push(row => compare(row[column], value) > 0); return builder; },
      lt(column: string, value: unknown) { predicates.push(row => compare(row[column], value) < 0); return builder; },
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
      then<TResult1=PreviewResult,TResult2=never>(resolve?:((value:PreviewResult)=>TResult1|PromiseLike<TResult1>)|null,reject?:((error:unknown)=>TResult2|PromiseLike<TResult2>)|null):Promise<TResult1|TResult2> {
        return Promise.resolve().then(():PreviewResult => {
          if (!tables[table]) return { data: single ? null : [], count: count ? 0 : null, error: { message: `DEMONSTRATION_UNAVAILABLE: ${table} has no fixture` } };
          const forbidden = (value: unknown): boolean => !!value && typeof value === 'object' && Object.entries(value).some(([key, item]) => /^(password|api_?key|api_?secret|access_token|refresh_token|credentials|role|session)$/i.test(key) || forbidden(item));
          if (operation !== 'read' && forbidden(payload)) return { data: null, error: { message: 'OWNER_PREVIEW_CREDENTIALS_AND_AUTH_FIELDS_DISABLED' } };
          const all = tables[table];
          const visible = (row: PreviewRow) => view !== 'customer' || (!row.customer_id && !row.user_id) || (row.customer_id ?? row.user_id) === customerId;
          let rows = all.filter(row => visible(row) && (!accountScoped || (!row.execution_account_id && !['execution_accounts_safe','execution_accounts','connected_execution_accounts','mt5_accounts','mt5_accounts_safe'].includes(table)) || (row.execution_account_id ?? row.id) === accountId) && predicates.every(fn => fn(row)));
          if (operation === 'update') rows.forEach(row => Object.assign(row, payload, evidence));
          if (operation === 'delete') tables[table] = all.filter(row => !rows.includes(row));
          if (operation === 'insert' || operation === 'upsert') {
            rows = (Array.isArray(payload) ? payload : [payload]).map(item => ({ ...item, id: item.id ?? `preview-local-${browserId()}`, ...evidence }));
            for (const row of rows) { const existing = operation === 'upsert' && all.find(x => x.id === row.id); if (existing) Object.assign(existing, row); else all.push(row); }
          }
          const total = rows.length;
          if (order) { const { column, ascending } = order; rows.sort((a,b) => (compare(a[column],b[column])||0) * (ascending ? 1 : -1)); }
          rows = rows.slice(offset, offset + limit);
          return { data: head ? null : single ? rows[0] ?? null : rows, count: count ? total : null, error: null };
        }).then(resolve, reject);
      },
    };
    return builder;
  },
};

const runs: PreviewRow[] = [
  { id: 'preview-replay-completed', mode: 'REPLAY', kind: 'SCANNER', status: 'COMPLETED', dataset_id: 'preview-dataset', dataset_hash: 'simulated-dataset', configuration_hash: 'simulated-config', progress_completed: 120, max_cycles: 120, exclusion_count: 2, outcome_metrics: { overall: { tradeCount: 12, winRate: 7/12, netR: 2.4 } }, ...evidence },
  { id: 'preview-shadow-running', mode: 'SHADOW', kind: 'SHADOW', status: 'RUNNING', dataset_hash: 'simulated-dataset', configuration_hash: 'simulated-config', progress_completed: 8, max_cycles: 120, exclusion_count: 1, ...evidence },
  { id: 'preview-account-completed', kind: 'ACCOUNT', status: 'COMPLETED', progress_completed: 12, outcome_metrics: { overall: { tradeCount: 12 } }, ...evidence },
];
const datasets = [{ id: 'preview-dataset', source: 'SIMULATED', status: 'READY', symbol: 'EURUSD', timeframe: '15m', starts_at: '2026-01-01', ends_at: '2026-01-31', row_count: 120, dataset_hash: 'simulated-dataset', coverage: {}, provenance: 'SIMULATED DEMONSTRATION — illustrative only' }];
const drafts = new Map<string, PreviewRow>();
export async function previewFunction(name: string, body: PreviewRow): Promise<PreviewRow> {
  const action = String(body.action ?? '');
  if (/credentials|pairing|checkout|payment|generate|ai-completion/.test(action + name)) throw new Error('OWNER_PREVIEW: credentials, payments and provider/AI actions disabled');
  if(name==='phase-o-agents'){
    if(action==='LAUNCH_OVERVIEW')return {state:'OK',data:{observed_at:new Date().toISOString(),signal_target:50,execution_target:30,paid_signals:1,paid_execution:0,scope:'SIMULATED DEMONSTRATION — sample counts are not existing customers.'},...evidence};
    if(action==='GROWTH_OVERVIEW')return {state:'OK',data:{observed_at:new Date().toISOString(),vip_target:1000,free_target:1000,paid_customers:1,free_customers:2,confirmed_free_members:1,confirmed_vip_members:1,both_vip_channels:1,paid_without_telegram_link:0,pending_fulfillment:1,agent_queue:0,awaiting_approval:0,uncertain_deliveries:0,active_campaigns:0,vip_expiring_7d:0,funnel:{landing_visits:12,signups:2,checkouts:1,renewals:0,churned:0}},...evidence};
  }
  if (name === 'phase-p-workers') {
    if (action === 'inspect') return { ...evidence, jobs: [], results: [], workers: [], stopNewWork: true, configuration: 'DEMONSTRATION' };
    if (action === 'submit') return previewFunction('phase-m-validation', { ...body, kind: body.kind === 'REPLAY' ? 'SCANNER' : body.kind, action: 'start', mode: body.kind === 'REPLAY' ? 'REPLAY' : body.kind });
    if (['stop','resume','cancel','retry'].includes(action)) return { ...evidence, status: 'SIMULATED', message: 'Local preview only; no remote workers activated' };
  }
  if (name === 'phase-h-authority') {
    if(['account_detail','admin_account_detail','account_policy','admin_account_policy'].includes(action)){
      const account=(tables.execution_accounts_safe as PreviewAccount[]).find(a=>a.id===body.execution_account_id&&(action.startsWith('admin_')?a.customer_id===body.customer_id:a.customer_id===customerId));
      if(!account)throw Error('DEMONSTRATION_ACCOUNT_NOT_FOUND');
      if(action.endsWith('account_policy'))return {state:'ASSIGNED',data:{assignmentId:`sample-policy-${account.id}`,family:account.provider==='MT5'?'PERSONAL_MT5_GROWTH':`PERSONAL_${account.provider}_CRYPTO`,version:'demo-v1',risk:account.risk_percent,strategies:[account.provider==='MT5'?'FOREX_TREND':'CRYPTO_TREND']},...evidence};
      return {state:'LOADED',data:{observedAt:new Date().toISOString(),source:'SIMULATED_DEMONSTRATION',finance:{balance:account.balance,equity:account.equity,freeMargin:account.equity-1000,usedMargin:1000,unrealizedPnl:account.equity-account.balance,currency:'USD'},positions:[{symbol:account.provider==='MT5'?'EURUSD':'BTCUSDT',side:'BUY',quantity:.01,entry_price:100,current_price:101,stop_loss:99,evidence_kind:'SIMULATED_DEMONSTRATION'}],orders:[{symbol:account.provider==='MT5'?'EURUSD':'BTCUSDT',type:'STOP',qty:.01,price:99,status:'SAMPLE',evidence_kind:'SIMULATED_DEMONSTRATION'}],outcomes:[{id:'sample-close',provider:account.provider,closed_at:new Date().toISOString(),currency:'USD',net_pnl:-12,source:'SIMULATED_DEMONSTRATION'}],entitlements:[{id:'sample-access',state:'DEMONSTRATION',source:'SIMULATED_NOT_A_PAYMENT',valid_until:new Date(Date.now()+30*86400000).toISOString(),product_code:'AUTO_EXECUTION'}],decisions:[{id:'sample-decision',decision:'BLOCK',reason_codes:['DEMONSTRATION_NO_REAL_EXECUTION'],authorized_risk_pct:0}],incidents:[],plans:[],policy:{},truncated:{}},...evidence};
    }
    if(action==='save_onboarding'){drafts.set(customerId,structuredClone(body.draft as PreviewRow));return {state:'SAVED',...evidence};}
    if(action==='acknowledge_risk')return {state:'ACKNOWLEDGED',...evidence};

    if (action === 'load_onboarding') return { state: 'SIMULATED', data: { session: drafts.get(customerId) ?? null }, ...evidence };
    if (action === 'save_onboarding') drafts.set(customerId, structuredClone(body.draft&&typeof body.draft==='object'?body.draft as PreviewRow:{}));
    if (action === 'create_account_draft') {
      const id=browserId();
      const row = { ...previewStore.account(), id, customer_id: customerId, user_id: customerId, provider: body.provider, account_mode: body.mode, environment: body.environment, display_label: `${previewStore.customer().full_name.split(' ')[0]} ${body.provider} ${body.mode} — simulated new account`, status: 'pending', phase_h_readiness: 'BLOCKED', phase_h_certification_status: 'SIMULATED_NOT_CERTIFIED', ...evidence };
      for (const table of ['execution_accounts_safe','execution_accounts','connected_execution_accounts']) tables[table].push(structuredClone(row));
      return { state:'DRAFT',data:{execution_account_id:id},...evidence };
    }
    if (action === 'assign_brain') {
      const owned=tables.execution_accounts_safe.find(a=>a.id===body.execution_account_id&&a.customer_id===customerId);if(!owned)throw Error('DEMONSTRATION_ACCOUNT_NOT_FOUND');
      for(const name of ['execution_accounts_safe','execution_accounts','connected_execution_accounts'])for(const a of tables[name])if(a.id===owned.id)a.risk_percent=body.risk;
      tables.account_brain_assignments.push({ id: `preview-brain-${browserId()}`, customer_id: customerId, execution_account_id: body.execution_account_id, risk_percent: body.risk, strategies: body.strategies, brain_family: 'DEMONSTRATION', policy_version: 'demo-v1', superseded_at: null, ...evidence });
      return {state:'ASSIGNED',...evidence};
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
    if (action === 'details') {const run=runs.find(r=>r.id===body.runId);return {run,evidence:[{label:'Illustrative simulation; no backend certification',evidence_kind:'SIMULATED_DEMONSTRATION'}],outcomes:run?.kind==='SCANNER'?[1,-1,1,-1,1,-1,1,-1,1,-1,1,1.4].map((net,i)=>({strategy_id:'DEMONSTRATION_STRATEGY',symbol:i%2?'EURUSD':'BTCUSDT',status:net>0?'SAMPLE_WIN':'SAMPLE_LOSS',net_r:net,entry_time:new Date(Date.parse('2026-01-01T00:00:00Z')+i*86400000).toISOString(),exit_time:new Date(Date.parse('2026-01-01T01:00:00Z')+i*86400000).toISOString(),evidence_kind:'SIMULATED_DEMONSTRATION'})):[],...evidence};}
    if (action === 'cancel') { const run = runs.find(r => r.id === body.runId); if (run) run.status = 'CANCELLED'; return { status: 'CANCELLED', ...evidence }; }
    if (['start','observe','start_account','start_prop','queue','retry'].includes(action)) {
      const row = { ...runs[0], id: `preview-run-${browserId()}`, kind: body.kind ?? body.mode ?? 'SHADOW', mode: body.mode ?? 'SHADOW', status: body.mode === 'SHADOW' || name === 'phase-m-shadow' ? 'RUNNING' : 'COMPLETED', ...evidence }; runs.push(row); return { ...row, runId: row.id, run: row, cycles: 120 };
    }
    if (['queue_health','status','queue_status','health'].includes(action)) return { status: 'SIMULATED', jobs: [], ...evidence };
  }
  if (['admin-operator-action','admin-scheduler-action','market-scanner','scheduled-market-scanner','telegram-membership'].includes(name)) {
    tables.audit_logs.push({ id: `preview-action-${browserId()}`, action, result: 'SIMULATED', created_at: new Date().toISOString(), ...evidence });
    if (/repair|recover/.test(action)) tables.trade_management_truth.forEach(row => { row.latest_error = null; row.protection_status = 'protected'; row.recovery_status = 'simulated_repair'; });
    if (/start|resume/.test(action)) tables.scanner_config[0].is_enabled = true;
    if (/stop|pause/.test(action)) tables.scanner_config[0].is_enabled = false;
    return { success: true, status: 'SIMULATED', message: `Demonstration ${action || name}; no real action`, result_summary: 'Disposable preview state updated; no worker, provider or Telegram request', ...evidence };
  }
  throw new Error(`DEMONSTRATION_UNAVAILABLE: ${name}/${action} has no implemented fixture action`);
}

