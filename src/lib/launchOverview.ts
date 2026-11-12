export interface LaunchCheck { name: string; state: string; data: unknown }
export interface LaunchStatus {
  observedAt: string;
  configuration: Record<string, Record<string, unknown>>;
  checks: LaunchCheck[];
  release1?: { salesState: string; strategyState: string; promotedStrategies: number; evidenceNote: string };
}
export type ServiceState = 'recorded' | 'attention' | 'unavailable';
export interface Journey { id: string; title: string; to: string; purpose: string; state: ServiceState; evidence: string; next: string }
const rows = (status: LaunchStatus | null, name: string): Record<string, unknown>[] | null => {
  const check = status?.checks.find(c => c.name === name);
  return check?.state === 'LOADED' && Array.isArray(check.data) ? check.data : null;
};
const recent = (value: unknown, now: number, minutes: number) => {
  if (typeof value !== 'string') return false;
  const at = Date.parse(value);
  return Number.isFinite(at) && at <= now && now - at <= minutes * 60_000;
};
/** An observation is evidence for one step, never a launch or trading authorization. */
export function launchJourneys(status: LaunchStatus | null, now = Date.now()): Journey[] {
  const snapshotAge = status ? now - Date.parse(status.observedAt) : NaN;
  const current = status && Number.isFinite(snapshotAge) && snapshotAge >= -30_000 && snapshotAge <= 300_000 ? status : null;
  const scanner = rows(current, 'scannerRuns'), deliveries = rows(current, 'publicationQueue');
  const memberships = rows(current, 'vipMembership'), payments = rows(current, 'paymentAttempts');
  const releases = rows(current, 'releases'), accounts = rows(current, 'accounts'), workers = rows(current, 'recentWorkerEvidence');
  const observations = (data: Record<string, unknown>[] | null) => data === null ? 'unavailable' : data.length ? 'recorded' : 'attention';
  const freshScanner = scanner?.some(r => recent(r.started_at, now, 30));
  const healthyAccount = accounts?.some(r => recent(r.last_synchronized_at, now, 15));
  return [
    { id:'public', title:'Public website', to:'/', purpose:'Offer, pricing and customer entry points.', state:'recorded', evidence:'Open the public pages to review the offer and purchase journey.', next:'Review Home, VIP, Execution and Results on mobile.' },
    { id:'customers', title:'Customers & access', to:'/admin/customers', purpose:'Registration, onboarding, subscription and expiry.', state:observations(rows(current,'vipEntitlements')), evidence:rows(current,'vipEntitlements') === null ? 'Subscription records could not be loaded.' : `${rows(current,'vipEntitlements')!.length} subscription records returned.`, next:'Rehearse signup, access, renewal and expiry with a test customer.' },
    { id:'payments', title:'Payments', to:'/admin/commerce', purpose:'M-Pesa and Whop configuration, receipts and recovery.', state:observations(payments), evidence:payments === null ? 'Payment observations are unavailable.' : `${payments.length} recent payment attempts returned; inspect their outcomes.`, next:'Save merchant settings, then test payment → entitlement and retry recovery.' },
    { id:'telegram', title:'Telegram & content', to:'/admin/telegram', purpose:'Free, Crypto VIP, Forex VIP, Admin and lifecycle updates.', state:observations(deliveries), evidence:deliveries === null ? 'Publication queue could not be loaded.' : `${deliveries.length} queued publication records; ${memberships?.length ?? 'unknown'} membership records.`, next:'Check each channel, deliver a test message and verify admission and expiry removal.' },
    { id:'scanner', title:'Market scanner', to:'/admin/scanner', purpose:'Fresh data, strategy decisions, watches and follow-ups.', state:scanner === null ? 'unavailable' : freshScanner ? 'recorded' : 'attention', evidence:scanner === null ? 'Scanner run observations are unavailable.' : freshScanner ? 'A scanner run is recorded within 30 minutes; inspect its outcome.' : 'No scanner run within 30 minutes was returned.', next:'Inspect source freshness and trace one setup through confirmation and outcome.' },
    { id:'research', title:'Strategies & research', to:'/admin/research', purpose:'Historical returns, frequency, account costs and strategy improvement.', state:observations(releases), evidence:releases === null ? 'Strategy release records are unavailable. Historical research opens separately.' : `${releases.length} promoted strategy records returned.`, next:'Compare immediate and conditional entries, inspect losses and test changes across periods.' },
    { id:'operations', title:'Workers & recovery', to:'/admin/backtest?workspace=RESULTS', purpose:'Queued research jobs, errors, checkpoints and recovery.', state:observations(workers), evidence:workers === null ? 'Worker observations are unavailable.' : `${workers.length} recent jobs returned; a saved job is not proof of a running worker.`, next:'Inspect job status and heartbeat, then verify restart from a checkpoint.' },
    { id:'execution', title:'Execution accounts', to:'/admin/providers', purpose:'Binance testnet, Bybit demo, MT5 demo and account controls.', state:accounts === null ? 'unavailable' : healthyAccount ? 'recorded' : 'attention', evidence:accounts === null ? 'Account observations are unavailable.' : `${accounts.length} account records; ${healthyAccount ? 'a synchronization is recorded within 15 minutes' : 'no recent synchronization returned'}.`, next:'Connect each demo, then trace an authorized order, protection, closure and report.' },
    { id:'growth', title:'Growth & acquisition', to:'/admin/growth-goal', purpose:'Conversion pages, campaigns and Free/VIP customer goals.', state:observations(rows(current,'conversionEvents')), evidence:rows(current,'conversionEvents') === null ? 'Conversion observations are unavailable.' : `${rows(current,'conversionEvents')!.length} recent conversion records returned.`, next:'Check attribution from a campaign link through signup and purchase.' },
  ];
}
