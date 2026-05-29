import { AdminLayout } from '../../components/layout/AdminLayout';
import { AlertTriangle, CheckCircle, Copy, Play, ChevronDown, ChevronUp } from 'lucide-react';
import { useState, useEffect, useCallback } from 'react';
import { ScannerRun } from '../../lib/types';
import { callEdgeFunction, ADMIN_SCHEDULER_DEPLOY_INSTRUCTIONS, ADMIN_SCHEDULER_MISSING_MESSAGE } from '../../lib/edgeFunctionStatus';
import { useAuth } from '../../contexts/AuthContext';
import { useAdminLiveState } from '../../hooks/useAdminLiveState';

const SQL_CRON = `-- Truthful pg_cron command for HashiBot crypto-only MVP
-- Replace placeholders, then run in Supabase SQL Editor.
-- pg_cron proof comes from fresh automatic scanner_runs rows only.
-- net._http_response and cron.job_run_details are secondary diagnostics only.
-- scanner_config.cron_job_active is config only, not proof.

CREATE EXTENSION IF NOT EXISTS pg_cron;
CREATE EXTENSION IF NOT EXISTS pg_net;

-- Remove stale jobs that may call old URLs or market-scanner directly.
DO $$
DECLARE existing_job record;
BEGIN
  FOR existing_job IN
    SELECT jobid FROM cron.job
    WHERE jobname IN ('hashibot_scheduled_market_scanner_5m', 'hashibot-scheduled-scanner')
  LOOP
    PERFORM cron.unschedule(existing_job.jobid);
  END LOOP;
END $$;

SELECT cron.schedule(
  'hashibot_scheduled_market_scanner_5m',
  '*/5 * * * *',
  $$
  SELECT net.http_post(
    url := 'https://<PROJECT-REF>.supabase.co/functions/v1/scheduled-market-scanner',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'x-scanner-cron-secret', '<SCANNER_CRON_SECRET>'
    ),
    body := '{"source":"pg_cron","run_type":"scheduled","market_mode":"crypto_only"}'::jsonb
  ) AS request_id;
  $$
);

UPDATE scanner_config
SET cron_job_active = true, cron_job_name = 'hashibot_scheduled_market_scanner_5m'
WHERE id = 1;

SELECT jobid, jobname, schedule, active, command
FROM cron.job
WHERE jobname = 'hashibot_scheduled_market_scanner_5m';`;

const SQL_CHECK = `-- Verify scheduled scanner rows (0 signals still proves cron ran)
SELECT id, run_type, source, triggered_by, is_automatic, status, started_at, finished_at, symbols_scanned, signals_created, error_message
FROM scanner_runs
WHERE lower(run_type) = 'scheduled'
  AND (source = 'pg_cron' OR triggered_by = 'pg_cron' OR is_automatic = true)
ORDER BY started_at DESC
LIMIT 10;

-- Verify job is registered
SELECT jobid, jobname, schedule, active FROM cron.job WHERE jobname = 'hashibot_scheduled_market_scanner_5m';

-- Check recent HTTP responses (secondary proof)
SELECT id, status_code, timed_out, created, left(content::text, 500) AS content_sample
FROM net._http_response
ORDER BY created DESC
LIMIT 5;

-- Check cron execution details (secondary proof)
SELECT j.jobname, d.status, d.start_time, d.end_time, d.return_message
FROM cron.job_run_details d
JOIN cron.job j ON j.jobid = d.jobid
WHERE j.jobname = 'hashibot_scheduled_market_scanner_5m'
ORDER BY d.start_time DESC
LIMIT 10;`;

const SQL_NET = `CREATE EXTENSION IF NOT EXISTS pg_net;`;

type SchedulerProof = {
  scheduledRunProof?: boolean;
  netHttpProof?: boolean;
  cronDetailProof?: boolean;
  cronProven?: boolean;
  thresholdMinutes?: number;
  missing?: Record<string, boolean>;
};

type SchedulerStatus = {
  success?: boolean;
  config?: { cron_job_active?: boolean; schedule_enabled?: boolean; scan_interval_minutes?: number; last_scheduled_scan_at?: string | null } | null;
  latestScheduledRun?: ScannerRun | null;
  recentScheduledRuns?: ScannerRun[];
  latestManualRun?: ScannerRun | null;
  latestRun?: ScannerRun | null;
  latestOutcomeAutoCheck?: { created_at?: string; new_status?: string; message?: string } | null;
  latestOutcomeAutoCheckAgeMinutes?: number | null;
  latestScheduledRunAgeMinutes?: number | null;
  proof?: SchedulerProof;
  statuses?: Record<string, boolean>;
  edgeFunctions?: Record<string, { state?: string; deployed?: boolean | null; status?: number | null }>;
  warnings?: Record<string, string | null>;
};

type TestResult = { ok: boolean; msg: string; json?: unknown };

function metric(value: unknown, fallback = '—') {
  return value === null || value === undefined || value === '' ? fallback : String(value);
}

function runIdFrom(body: Record<string, unknown>) {
  const proxied = body.proxied_body as Record<string, unknown> | undefined;
  return proxied?.run_id ?? body.run_id;
}

export default function SchedulerGuide() {
  const { session } = useAuth();
  const { state: liveState, refresh: refreshLiveState } = useAdminLiveState(session);
  const [copied, setCopied] = useState<string | null>(null);
  const [testing, setTesting] = useState(false);
  const [testResult, setTestResult] = useState<TestResult | null>(null);
  const [showSetup, setShowSetup] = useState(false);
  const [status, setStatus] = useState<SchedulerStatus | null>(null);
  const [loadingStatus, setLoadingStatus] = useState(true);

  const checkCronStatus = useCallback(async () => {
    setLoadingStatus(true);
    try {
      const result = await callEdgeFunction<SchedulerStatus>('admin-scheduler-action', { action: 'status' }, session?.access_token);
      if (result.reachability === 'missing') {
        setStatus({ success: false, warnings: { admin_scheduler_action: `${ADMIN_SCHEDULER_MISSING_MESSAGE} ${ADMIN_SCHEDULER_DEPLOY_INSTRUCTIONS}` } });
        setShowSetup(false);
      } else if (result.reachability === 'forbidden') {
        setStatus({ success: false, warnings: { admin_scheduler_action: 'Admin scheduler action is deployed, but the current user/admin authorization failed.' } });
        setShowSetup(false);
      } else if (!result.ok && !result.data) {
        setStatus({ success: false, warnings: { admin_scheduler_action: result.message } });
        setShowSetup(false);
      } else {
        const data = result.data;
        setStatus(data ?? null);
        setShowSetup(liveState.schedulerProof.status === 'missing' && !(data?.config?.cron_job_active ?? false));
      }
    } catch (e) {
      setStatus({ success: false, warnings: { admin_scheduler_action: e instanceof Error ? e.message : 'Admin scheduler action status check failed.' } });
      setShowSetup(false);
    }
    setLoadingStatus(false);
  }, [liveState.schedulerProof.status, session?.access_token]);

  useEffect(() => {
    void checkCronStatus();
    const id = window.setInterval(() => { void checkCronStatus(); }, 60_000);
    return () => window.clearInterval(id);
  }, [checkCronStatus]);

  function copy(text: string, id: string) {
    navigator.clipboard.writeText(text);
    setCopied(id);
    setTimeout(() => setCopied(null), 2000);
  }

  async function testScheduledScan() {
    setTesting(true);
    setTestResult(null);
    try {
      const result = await callEdgeFunction<Record<string, unknown>>('admin-scheduler-action', { action: 'test_scheduled_scanner' }, session?.access_token);
      if (result.reachability === 'missing') {
        setTestResult({ ok: false, msg: `${ADMIN_SCHEDULER_MISSING_MESSAGE} ${ADMIN_SCHEDULER_DEPLOY_INSTRUCTIONS}` });
        return;
      }
      if (result.reachability === 'forbidden') {
        setTestResult({ ok: false, msg: 'Forbidden/auth warning: admin-scheduler-action is deployed, but the current user is not authorized as admin or the auth token was rejected.' });
        return;
      }
      if (!result.ok && !result.data) throw new Error(result.message);
      const data = result.data;

      const body = (data?.proxied_body ?? data ?? {}) as Record<string, unknown>;
      const proxied = (body.proxied_body ?? {}) as Record<string, unknown>;
      const outcome = (body.outcome_tracking ?? {}) as Record<string, unknown>;
      const runId = runIdFrom(body) ?? runIdFrom(proxied);
      const ok = Boolean(data?.success && body.success !== false);

      setTestResult({
        ok,
        json: data,
        msg: ok
          ? `success=${metric(body.success)} · wrapper=${metric(body.wrapper)} · market_scanner_called=${metric(body.market_scanner_called)} · market_scanner_status=${metric(body.market_scanner_status ?? body.proxied_status ?? data?.proxied_status)} · run_id=${metric(runId)} · TG sent/skipped/failed=${metric(body.telegram_sent ?? proxied.telegram_sent, '0')}/${metric(body.telegram_skipped ?? proxied.telegram_skipped, '0')}/${metric(body.telegram_failed ?? proxied.telegram_failed, '0')} · outcome_called=${metric(body.outcome_called ?? body.outcome_checked)} · outcome_success=${metric(body.outcome_success)} · outcomes_updated=${metric(body.outcomes_updated ?? outcome.signals_updated, '0')} · outcome TG sent/skipped/failed=${metric(body.outcome_telegram_sent ?? outcome.telegram_sent, '0')}/${metric(body.outcome_telegram_skipped ?? outcome.telegram_skipped, '0')}/${metric(body.outcome_telegram_failed ?? outcome.telegram_failed, '0')}`
          : String(body.error ?? data?.error ?? (String(body.error ?? '').includes('SCANNER_CRON_SECRET') ? 'Cron secret warning: backend reported missing/invalid SCANNER_CRON_SECRET.' : 'Scheduled wrapper test failed')),
      });
      await Promise.all([checkCronStatus(), refreshLiveState()]);
    } catch (e) {
      setTestResult({ ok: false, msg: e instanceof Error ? e.message : 'Unknown error' });
    }
    setTesting(false);
  }

  const cfg = status?.config;
  const latestScheduledRun = liveState.latestScheduledRun;
  const recentScheduledRuns = liveState.recentScheduledRuns;
  const cronDetected = liveState.cronProven;
  const cronJobActive = liveState.cronConfigured || cfg?.cron_job_active === true;
  const scheduleEnabled = liveState.scheduleEnabled || cfg?.schedule_enabled === true;
  const scheduledAge = liveState.lastScheduledRunAgeMinutes;
  const latestOutcomeAutoCheckAt = liveState.latestAutomaticOutcomeCheckAt ?? status?.latestOutcomeAutoCheck?.created_at ?? null;
  const cronStatusLabel = liveState.loading && !liveState.latestScheduledRun
    ? 'Checking scheduler status...'
    : liveState.schedulerProof.label;
  const cronReason = liveState.cronReason;
  const loadingAny = liveState.loading || loadingStatus;

  return (
    <AdminLayout>
      <div className="mb-6">
        <div className="flex items-start justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold">Scheduled Scanning Setup</h1>
            <p className="text-sm text-zinc-500 mt-0.5">Configure and verify automatic scanner execution via pg_cron. Primary proof is the latest automatic scanner_runs row where lower(run_type) = 'scheduled' and source/triggered_by/is_automatic proves pg_cron.</p>
          </div>
          <button onClick={async () => { await Promise.all([refreshLiveState(), checkCronStatus()]); }} disabled={loadingAny}
            className="inline-flex items-center gap-2 border border-zinc-700 hover:border-zinc-500 text-zinc-400 hover:text-white px-3 py-2 rounded-lg text-xs transition-colors disabled:opacity-50">
            {loadingAny ? 'Refreshing...' : 'Refresh'}
          </button>
        </div>
      </div>

      <div className="max-w-5xl space-y-4">
        <div className={`rounded-xl p-5 border flex gap-3 ${cronDetected ? 'bg-emerald-500/10 border-emerald-500/20' : liveState.cronStale ? 'bg-yellow-500/10 border-yellow-500/20' : 'bg-zinc-900 border-zinc-800'}`}>
          {loadingStatus && !liveState.latestScheduledRun ? <div className="w-4 h-4 border-2 border-zinc-600 border-t-transparent rounded-full animate-spin mt-0.5 shrink-0" /> : cronDetected ? <CheckCircle size={16} className="text-emerald-400 mt-0.5 shrink-0" /> : <AlertTriangle size={16} className="text-yellow-400 mt-0.5 shrink-0" />}
          <div className="flex-1">
            <div className={`text-sm font-semibold mb-1 ${cronDetected ? 'text-emerald-400' : liveState.cronStale ? 'text-yellow-400' : cronJobActive ? 'text-blue-400' : 'text-zinc-400'}`}>{cronStatusLabel}</div>
            <div className={`text-xs ${cronDetected ? 'text-emerald-300/80' : 'text-yellow-300/80'}`}>{cronReason}</div>
            {latestScheduledRun && (
              <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-2 mt-3 text-xs">
                <ProofDetail label="Latest automatic scheduled run" value={new Date(latestScheduledRun.started_at).toLocaleString()} />
                <ProofDetail label="Age" value={scheduledAge !== null ? `${scheduledAge}m` : '—'} />
                <ProofDetail label="Status" value={latestScheduledRun.status} />
                <ProofDetail label="Symbols scanned" value={metric(latestScheduledRun.symbols_scanned, '0')} />
                <ProofDetail label="Signals created" value={metric(latestScheduledRun.signals_created, '0')} />
                <ProofDetail label="TG sent (not required)" value={String(latestScheduledRun.telegram_sent_count ?? 0)} />
                <ProofDetail label="0-signal proof rule" value="0 signals still counts" />
                <ProofDetail label="Latest auto outcome" value={latestOutcomeAutoCheckAt ? new Date(latestOutcomeAutoCheckAt).toLocaleString() : '—'} />
              </div>
            )}
            <div className="flex gap-3 mt-2 text-xs text-zinc-500">
              <span>Schedule enabled: <span className={scheduleEnabled ? 'text-emerald-400' : 'text-zinc-400'}>{String(scheduleEnabled)}</span></span>
              <span>Cron job active: <span className={cronJobActive ? 'text-emerald-400' : 'text-zinc-400'}>{String(cronJobActive)}</span></span>
            </div>
          </div>
          <button onClick={async () => { await Promise.all([refreshLiveState(), checkCronStatus()]); }} className="text-xs text-zinc-500 hover:text-zinc-300 transition-colors shrink-0">Recheck</button>
        </div>

        {status?.warnings?.admin_scheduler_action && (
          <div className="rounded-xl border border-yellow-500/20 bg-yellow-500/10 p-4 text-sm text-yellow-200 break-words">
            <div className="font-semibold">{String(status.warnings.admin_scheduler_action).includes('not deployed') ? ADMIN_SCHEDULER_MISSING_MESSAGE : 'Admin scheduler action status warning'}</div>
            <div className="mt-1 text-xs text-yellow-100/80">{String(status.warnings.admin_scheduler_action).includes('not deployed') ? ADMIN_SCHEDULER_DEPLOY_INSTRUCTIONS : status.warnings.admin_scheduler_action}</div>
            <div className="mt-2 text-xs text-zinc-400">This is a deployment/admin-function issue, not proof that pg_cron failed.</div>
          </div>
        )}

        <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-5">
          <div className="text-sm font-semibold mb-1">Manual Test of Scheduled Wrapper</div>
          <p className="text-xs text-zinc-500 mb-3">
            Calls the admin-safe <code className="bg-zinc-800 px-1 rounded">admin-scheduler-action</code>, which verifies the signed-in admin server-side and then invokes <code className="bg-zinc-800 px-1 rounded">scheduled-market-scanner</code> with server-only cron authorization. No service-role key or cron secret is sent to the browser.
          </p>
          <button onClick={testScheduledScan} disabled={testing} className="inline-flex items-center gap-2 bg-blue-600 hover:bg-blue-500 disabled:opacity-60 text-white px-4 py-2 rounded-lg text-sm font-medium transition-colors">
            <Play size={13} />
            {testing ? 'Running...' : 'Run Scheduled Scan Now'}
          </button>
          <div className="mt-4 bg-zinc-950 border border-zinc-800 rounded-lg p-3 text-xs text-zinc-500 space-y-1">
            <div className="font-medium text-zinc-300">Truthful verification order</div>
            <div>1. This button is a wrapper test only — it is not pg_cron proof.</div>
            <div>2. Confirm the response includes success, wrapper, market_scanner_called, run_id, Telegram proof fields, and outcome_called.</div>
            <div>3. Wait for real pg_cron and verify it creates fresh <code className="bg-zinc-800 px-1 rounded">scanner_runs.run_type='scheduled'</code> rows every 5 minutes.</div>
            <div>4. Treat <code className="bg-zinc-800 px-1 rounded">net._http_response</code> and <code className="bg-zinc-800 px-1 rounded">cron.job_run_details</code> as secondary diagnostics only.</div>
          </div>
          {testResult && (
            <div className={`mt-3 px-4 py-3 rounded-lg text-xs border ${testResult.ok ? 'bg-emerald-500/10 border-emerald-500/20 text-emerald-300' : 'bg-red-500/10 border-red-500/20 text-red-300'}`}>
              <div>{testResult.msg}</div>
              {testResult.json ? <pre className="mt-3 whitespace-pre-wrap text-[11px] text-zinc-400 max-h-72 overflow-auto">{JSON.stringify(testResult.json, null, 2)}</pre> : null}
            </div>
          )}
        </div>

        <div className="grid sm:grid-cols-2 lg:grid-cols-5 gap-3">
          {[
            ['pg_cron registered', status?.statuses?.pg_cron_registered],
            ['pg_cron fired recently (diagnostic)', status?.statuses?.pg_cron_fired_recently],
            ['scheduled wrapper callable (diagnostic)', status?.statuses?.scheduled_wrapper_callable],
            ['admin manual test callable', status?.warnings?.admin_scheduler_action ? false : status?.statuses?.admin_manual_scheduler_test_callable],
            ['latest automatic scheduled run exists', status?.statuses?.latest_automatic_scheduled_scanner_run_exists],
            ['latest outcome auto-check', status?.statuses?.latest_outcome_auto_check_recent],
          ].map(([label, ok]) => (
            <div key={String(label)} className="bg-zinc-900 border border-zinc-800 rounded-xl p-3 min-w-0">
              <div className="text-[10px] uppercase tracking-wider text-zinc-500 break-words">{label}</div>
              <div className={`mt-1 text-sm font-semibold ${ok ? 'text-emerald-400' : 'text-zinc-400'}`}>{ok ? 'yes' : 'not verified from UI'}</div>
            </div>
          ))}
        </div>

        <div className="bg-zinc-900 border border-zinc-800 rounded-xl overflow-hidden">
          <div className="border-b border-zinc-800 px-5 py-3 text-sm font-semibold">Recent automatic scheduled scanner runs</div>
          {recentScheduledRuns.length === 0 ? (
            <div className="px-5 py-6 text-sm text-zinc-500">No automatic scheduled scanner_runs were returned by the direct scanner_runs query.</div>
          ) : (
            <table className="w-full text-xs">
              <thead><tr className="border-b border-zinc-800 text-zinc-500"><th className="text-left px-5 py-2.5">Started</th><th className="text-left px-5 py-2.5">Finished</th><th className="text-left px-5 py-2.5">Status</th><th className="text-left px-5 py-2.5">Symbols</th><th className="text-left px-5 py-2.5">Signals</th><th className="text-left px-5 py-2.5">TG S/K/F</th></tr></thead>
              <tbody>{recentScheduledRuns.map(r => <tr key={r.id} className="border-b border-zinc-800/50"><td className="px-5 py-2.5 text-zinc-300">{new Date(r.started_at).toLocaleString()}</td><td className="px-5 py-2.5 text-zinc-500">{r.finished_at ? new Date(r.finished_at).toLocaleString() : '—'}</td><td className="px-5 py-2.5 text-zinc-300">{r.status}</td><td className="px-5 py-2.5 text-zinc-300">{r.symbols_scanned}</td><td className="px-5 py-2.5 text-zinc-300">{r.signals_created}</td><td className="px-5 py-2.5 text-zinc-300">{r.telegram_sent_count ?? 0}/{r.telegram_blocked_count ?? 0}/{r.telegram_failed_count ?? 0}</td></tr>)}</tbody>
            </table>
          )}
        </div>

        <div className="bg-zinc-900 border border-zinc-800 rounded-xl overflow-hidden">
          <button onClick={() => setShowSetup(v => !v)} className="w-full flex items-center justify-between px-5 py-3 text-sm font-semibold hover:bg-zinc-800/50 transition-colors">
            <span>pg_cron Setup Instructions</span>
            {showSetup ? <ChevronUp size={14} className="text-zinc-500" /> : <ChevronDown size={14} className="text-zinc-500" />}
          </button>

          {showSetup && (
            <div className="border-t border-zinc-800 px-5 py-4 space-y-5">
              <p className="text-xs text-zinc-400">If the cron job doesn't exist yet, follow these steps in the Supabase SQL Editor.</p>
              <Step n={1} title="Enable pg_net extension"><p className="text-xs text-zinc-400 mb-3">pg_net allows SQL jobs to make HTTP requests.</p><CodeBlock code={SQL_NET} id="net" copied={copied} onCopy={copy} /></Step>
              <Step n={2} title="Schedule the Edge Function"><p className="text-xs text-zinc-400 mb-2">Replace the placeholders. Find values in Project Settings → API.</p><CodeBlock code={SQL_CRON} id="cron" copied={copied} onCopy={copy} /></Step>
              <Step n={3} title="Verify the job and automatic scheduled rows"><CodeBlock code={SQL_CHECK} id="check" copied={copied} onCopy={copy} /></Step>
              <Step n={4} title="Enable Schedule in Scanner Config"><p className="text-xs text-zinc-400">Go to <strong className="text-zinc-300">Scanner Config → Scheduled Scanning</strong> and toggle <strong className="text-zinc-300">Schedule Enabled</strong> to ON. Without this, cron calls will be skipped.</p></Step>
            </div>
          )}
        </div>

        <div className="bg-zinc-900 border border-zinc-800 rounded-xl overflow-hidden">
          <div className="border-b border-zinc-800 px-5 py-3 text-sm font-semibold">Recommended Scan Frequencies</div>
          <div className="divide-y divide-zinc-800">
            {[{ tf: '5m + 15m signals', freq: 'Every 5 minutes', cron: '*/5 * * * *' }, { tf: '1h signals', freq: 'Every 15 minutes', cron: '*/15 * * * *' }, { tf: '4h signals', freq: 'Every 1 hour', cron: '0 * * * *' }, { tf: 'All timeframes', freq: 'Every 5 minutes', cron: '*/5 * * * *' }].map(row => (
              <div key={row.tf} className="px-5 py-3 grid grid-cols-3 gap-4 text-xs"><div className="text-zinc-300">{row.tf}</div><div className="text-zinc-500">{row.freq}</div><div className="font-mono text-blue-400">{row.cron}</div></div>
            ))}
          </div>
        </div>

        {cronDetected && <div className="bg-emerald-500/10 border border-emerald-500/20 rounded-xl p-4 flex gap-3"><CheckCircle size={16} className="text-emerald-400 mt-0.5 shrink-0" /><div className="text-xs text-emerald-300">Scheduler is active. Manual scans from the Control Room continue to work independently at any time.</div></div>}
      </div>
    </AdminLayout>
  );
}

function ProofDetail({ label, value }: { label: string; value: string }) {
  return <div className="bg-zinc-950/70 border border-zinc-800 rounded-lg px-3 py-2"><div className="text-[10px] uppercase tracking-wider text-zinc-600">{label}</div><div className="text-xs text-zinc-200 mt-0.5">{value}</div></div>;
}

function Step({ n, title, children }: { n: number; title: string; children: React.ReactNode }) {
  return <div className="bg-zinc-950 border border-zinc-800 rounded-xl overflow-hidden"><div className="border-b border-zinc-800 px-5 py-3 flex items-center gap-3"><div className="w-6 h-6 rounded-full bg-blue-600/20 border border-blue-600/30 flex items-center justify-center text-xs font-bold text-blue-400">{n}</div><span className="text-sm font-semibold">{title}</span></div><div className="px-5 py-4">{children}</div></div>;
}

function CodeBlock({ code, id, copied, onCopy }: { code: string; id: string; copied: string | null; onCopy: (t: string, id: string) => void }) {
  return <div className="relative"><pre className="text-xs text-zinc-300 bg-zinc-950 border border-zinc-800 rounded-lg p-4 overflow-x-auto leading-relaxed">{code}</pre><button onClick={() => onCopy(code, id)} className="absolute top-2 right-2 flex items-center gap-1.5 bg-zinc-800 hover:bg-zinc-700 border border-zinc-700 text-zinc-400 hover:text-white px-2.5 py-1.5 rounded text-xs transition-colors"><Copy size={11} />{copied === id ? 'Copied!' : 'Copy'}</button></div>;
}
