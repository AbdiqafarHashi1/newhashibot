import { AdminLayout } from '../../components/layout/AdminLayout';
import { Clock, AlertTriangle, CheckCircle, Copy, Play, ChevronDown, ChevronUp } from 'lucide-react';
import { useState, useEffect, useCallback } from 'react';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../../contexts/AuthContext';

const SQL_CRON = `-- Run in Supabase SQL Editor after getting your Project URL and service role key
-- (Project Settings → API → Project URL + service_role key)

CREATE EXTENSION IF NOT EXISTS pg_cron;
CREATE EXTENSION IF NOT EXISTS pg_net;

SELECT cron.schedule(
  'hashibot_scheduled_market_scanner_5m',
  '*/5 * * * *',
  $$
  SELECT net.http_post(
    url := 'YOUR_SUPABASE_URL/functions/v1/scheduled-market-scanner',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer YOUR_SERVICE_ROLE_KEY'
    ),
    body := '{}'::jsonb
  ) AS request_id;
  $$
);

-- After running, mark cron job as active in scanner_config:
UPDATE scanner_config SET cron_job_active = true, cron_job_name = 'hashibot_scheduled_market_scanner_5m' WHERE id = 1;

-- View jobs:
SELECT jobid, jobname, schedule, active FROM cron.job;`;

const SQL_CHECK = `-- Verify job is registered
SELECT jobid, jobname, schedule, active FROM cron.job WHERE jobname = 'hashibot_scheduled_market_scanner_5m';

-- Check recent HTTP responses
SELECT id, status_code, timed_out, created FROM net._http_response ORDER BY created DESC LIMIT 5;`;

const SQL_NET = `CREATE EXTENSION IF NOT EXISTS pg_net;`;

export default function SchedulerGuide() {
  const { session } = useAuth();
  const [copied, setCopied] = useState<string | null>(null);
  const [testing, setTesting] = useState(false);
  const [testResult, setTestResult] = useState<{ ok: boolean; msg: string } | null>(null);
  const [showSetup, setShowSetup] = useState(false);

  // Cron detection state
  const [cronDetected, setCronDetected] = useState<boolean | null>(null);
  const [cronStatusLabel, setCronStatusLabel] = useState('Checking scheduler status...');
  const [cronReason, setCronReason] = useState('');
  const [lastScheduledRun, setLastScheduledRun] = useState<string | null>(null);
  const [scheduleEnabled, setScheduleEnabled] = useState(false);
  const [cronJobActive, setCronJobActive] = useState(false);

  const checkCronStatus = useCallback(async () => {
    const [cfgRes, scheduledRunRes] = await Promise.all([
      supabase.from('scanner_config').select('cron_job_active,cron_job_name,schedule_enabled,last_scheduled_scan_at,scan_interval_minutes').eq('id', 1).maybeSingle(),
      supabase.from('scanner_runs').select('started_at,run_type').eq('run_type', 'scheduled').order('started_at', { ascending: false }).limit(1).maybeSingle(),
    ]);

    const cfg = cfgRes.data;
    const latestScheduled = scheduledRunRes.data;

    const scheduleOn = cfg?.schedule_enabled ?? false;
    const configured = cfg?.cron_job_active ?? false;
    const interval = cfg?.scan_interval_minutes ?? 5;
    const recentThresholdMinutes = Math.max(10, interval * 2);
    const minsAgo = latestScheduled ? Math.round((Date.now() - new Date(latestScheduled.started_at).getTime()) / 60000) : null;
    const proven = scheduleOn && minsAgo !== null && minsAgo <= recentThresholdMinutes;
    const stale = scheduleOn && minsAgo !== null && minsAgo > recentThresholdMinutes;

    setScheduleEnabled(scheduleOn);
    setCronJobActive(configured);
    setLastScheduledRun(latestScheduled?.started_at ?? cfg?.last_scheduled_scan_at ?? null);

    if (proven) {
      setCronDetected(true);
      setCronStatusLabel('Automatic scheduling detected and working');
      setCronReason(`Real scheduled scanner_run found ${minsAgo} minute${minsAgo !== 1 ? 's' : ''} ago.`);
      setShowSetup(false);
    } else if (stale) {
      setCronDetected(false);
      setCronStatusLabel('Automatic scheduling stale');
      setCronReason(`Last scheduled scanner_run was ${minsAgo} minutes ago; expected within ${recentThresholdMinutes} minutes.`);
      setShowSetup(false);
    } else if (configured) {
      setCronDetected(false);
      setCronStatusLabel('Cron configured, not proven');
      setCronReason('Cron is configured in DB, but no recent scheduled scanner run was found.');
      setShowSetup(false);
    } else if (scheduleOn) {
      setCronDetected(false);
      setCronStatusLabel('Automatic scheduling not yet configured');
      setCronReason('Schedule is enabled but no scheduled runs found yet. Set up the pg_cron job below.');
      setShowSetup(true);
    } else {
      setCronDetected(false);
      setCronStatusLabel('Automatic scheduling not yet configured');
      setCronReason('Schedule is disabled in Scanner Config. Enable it first, then set up the cron job.');
      setShowSetup(true);
    }
  }, []);

  useEffect(() => { checkCronStatus(); }, [checkCronStatus]);

  function copy(text: string, id: string) {
    navigator.clipboard.writeText(text);
    setCopied(id);
    setTimeout(() => setCopied(null), 2000);
  }

  async function testScheduledScan() {
    setTesting(true);
    setTestResult(null);
    try {
      const { data: { session: s } } = await supabase.auth.getSession();
      const token = s?.access_token ?? session?.access_token;
      const url = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/scheduled-market-scanner`;
      const res = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
        body: JSON.stringify({}),
      });
      const json = await res.json();
      if (json.skipped) {
        setTestResult({ ok: false, msg: `Skipped: ${json.reason ?? 'unknown'}. ${json.reason === 'schedule_disabled' ? 'Enable Schedule in Scanner Config first.' : ''}` });
      } else if (json.error) {
        setTestResult({ ok: false, msg: json.error });
      } else {
        const body = json.proxied_body ?? json;
        const outcome = json.outcome_tracking ?? {};
        setTestResult({ ok: true, msg: `Scheduled wrapper proxied successfully. Run type: ${json.run_type ?? body.run_type ?? 'scheduled'}, Run ID: ${body.run_id ?? '?'}, Signals: ${body.signals_created ?? '?'}, TG sent: ${body.telegram_sent ?? 0}. Outcome checked: ${json.outcome_checked ? 'yes' : 'no'}, updates: ${json.outcomes_updated ?? outcome.signals_updated ?? 0}, outcome TG sent/skipped/failed: ${json.outcome_telegram_sent ?? outcome.telegram_sent ?? 0}/${json.outcome_telegram_skipped ?? outcome.telegram_skipped ?? 0}/${json.outcome_telegram_failed ?? outcome.telegram_failed ?? 0}. This manual wrapper test does not prove pg_cron fired by itself.` });
        await checkCronStatus();
      }
    } catch (e) {
      setTestResult({ ok: false, msg: e instanceof Error ? e.message : 'Unknown error' });
    }
    setTesting(false);
  }

  return (
    <AdminLayout>
      <div className="mb-6">
        <h1 className="text-2xl font-bold">Scheduled Scanning Setup</h1>
        <p className="text-sm text-zinc-500 mt-0.5">Configure and verify automatic scanner execution via pg_cron</p>
      </div>

      <div className="max-w-3xl space-y-4">
        {/* Cron status card */}
        <div className={`rounded-xl p-5 border flex gap-3 ${
          cronDetected === true
            ? 'bg-emerald-500/10 border-emerald-500/20'
            : cronDetected === false
              ? 'bg-yellow-500/10 border-yellow-500/20'
              : 'bg-zinc-900 border-zinc-800'
        }`}>
          {cronDetected === true
            ? <CheckCircle size={16} className="text-emerald-400 mt-0.5 shrink-0" />
            : cronDetected === false
              ? <AlertTriangle size={16} className="text-yellow-400 mt-0.5 shrink-0" />
              : <div className="w-4 h-4 border-2 border-zinc-600 border-t-transparent rounded-full animate-spin mt-0.5 shrink-0" />
          }
          <div className="flex-1">
            <div className={`text-sm font-semibold mb-1 ${
              cronDetected === true ? 'text-emerald-400' : cronDetected === false ? 'text-yellow-400' : 'text-zinc-400'
            }`}>
              {cronStatusLabel}
            </div>
            <div className={`text-xs ${cronDetected === true ? 'text-emerald-300/80' : 'text-yellow-300/80'}`}>
              {cronReason}
            </div>
            {lastScheduledRun && (
              <div className="text-xs text-zinc-500 mt-1">
                Last scheduled run: {new Date(lastScheduledRun).toLocaleString()}
              </div>
            )}
            <div className="flex gap-3 mt-2 text-xs text-zinc-500">
              <span>Schedule enabled: <span className={scheduleEnabled ? 'text-emerald-400' : 'text-zinc-400'}>{String(scheduleEnabled)}</span></span>
              <span>Cron job active: <span className={cronJobActive ? 'text-emerald-400' : 'text-zinc-400'}>{String(cronJobActive)}</span></span>
            </div>
          </div>
          <button onClick={checkCronStatus} className="text-xs text-zinc-500 hover:text-zinc-300 transition-colors shrink-0">Recheck</button>
        </div>

        {/* Test button */}
        <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-5">
          <div className="text-sm font-semibold mb-1">Manual Test of Scheduled Wrapper</div>
          <p className="text-xs text-zinc-500 mb-3">
            Manually calls the <code className="bg-zinc-800 px-1 rounded">scheduled-market-scanner</code> wrapper. This can prove the wrapper path writes <code className="bg-zinc-800 px-1 rounded">run_type='scheduled'</code>, but it does <strong className="text-zinc-300">not</strong> prove pg_cron fired by itself. Requires Schedule Enabled and cron auth setup.
          </p>
          <button
            onClick={testScheduledScan}
            disabled={testing}
            className="inline-flex items-center gap-2 bg-blue-600 hover:bg-blue-500 disabled:opacity-60 text-white px-4 py-2 rounded-lg text-sm font-medium transition-colors">
            <Play size={13} />
            {testing ? 'Running...' : 'Run Scheduled Scan Now'}
          </button>
          <div className="mt-4 bg-zinc-950 border border-zinc-800 rounded-lg p-3 text-xs text-zinc-500 space-y-1">
            <div className="font-medium text-zinc-300">Truthful verification order</div>
            <div>1. Click “Run Scheduled Scan Now” to test the wrapper manually.</div>
            <div>2. Confirm the response includes Telegram proof fields.</div>
            <div>3. Confirm the response includes outcome proof fields.</div>
            <div>4. Wait for real pg_cron and verify a new <code className="bg-zinc-800 px-1 rounded">scanner_runs.run_type='scheduled'</code> row appears.</div>
          </div>
          {testResult && (
            <div className={`mt-3 px-4 py-3 rounded-lg text-xs border ${testResult.ok ? 'bg-emerald-500/10 border-emerald-500/20 text-emerald-300' : 'bg-red-500/10 border-red-500/20 text-red-300'}`}>
              {testResult.msg}
            </div>
          )}
        </div>

        {/* Setup instructions — collapsible when cron is detected */}
        <div className="bg-zinc-900 border border-zinc-800 rounded-xl overflow-hidden">
          <button
            onClick={() => setShowSetup(v => !v)}
            className="w-full flex items-center justify-between px-5 py-3 text-sm font-semibold hover:bg-zinc-800/50 transition-colors">
            <span>pg_cron Setup Instructions</span>
            {showSetup ? <ChevronUp size={14} className="text-zinc-500" /> : <ChevronDown size={14} className="text-zinc-500" />}
          </button>

          {showSetup && (
            <div className="border-t border-zinc-800 px-5 py-4 space-y-5">
              <p className="text-xs text-zinc-400">
                If the cron job doesn't exist yet, follow these steps in the Supabase SQL Editor.
              </p>

              <Step n={1} title="Enable pg_net extension">
                <p className="text-xs text-zinc-400 mb-3">pg_net allows SQL jobs to make HTTP requests.</p>
                <CodeBlock code={SQL_NET} id="net" copied={copied} onCopy={copy} />
              </Step>

              <Step n={2} title="Schedule the Edge Function">
                <p className="text-xs text-zinc-400 mb-2">Replace the placeholders. Find values in Project Settings → API.</p>
                <ul className="text-xs text-zinc-500 mb-3 space-y-1">
                  <li><code className="bg-zinc-800 px-1 rounded">YOUR_SUPABASE_URL</code> — Project URL from API settings</li>
                  <li><code className="bg-zinc-800 px-1 rounded">YOUR_SERVICE_ROLE_KEY</code> — service_role key from API settings</li>
                </ul>
                <CodeBlock code={SQL_CRON} id="cron" copied={copied} onCopy={copy} />
              </Step>

              <Step n={3} title="Verify the job is active">
                <CodeBlock code={SQL_CHECK} id="check" copied={copied} onCopy={copy} />
              </Step>

              <Step n={4} title="Enable Schedule in Scanner Config">
                <p className="text-xs text-zinc-400">
                  Go to <strong className="text-zinc-300">Scanner Config → Scheduled Scanning</strong> and toggle <strong className="text-zinc-300">Schedule Enabled</strong> to ON.
                  Without this, cron calls will be silently skipped.
                </p>
              </Step>
            </div>
          )}
        </div>

        {/* Frequencies */}
        <div className="bg-zinc-900 border border-zinc-800 rounded-xl overflow-hidden">
          <div className="border-b border-zinc-800 px-5 py-3 text-sm font-semibold">Recommended Scan Frequencies</div>
          <div className="divide-y divide-zinc-800">
            {[
              { tf: '5m + 15m signals', freq: 'Every 5 minutes', cron: '*/5 * * * *' },
              { tf: '1h signals', freq: 'Every 15 minutes', cron: '*/15 * * * *' },
              { tf: '4h signals', freq: 'Every 1 hour', cron: '0 * * * *' },
              { tf: 'All timeframes', freq: 'Every 5 minutes', cron: '*/5 * * * *' },
            ].map(row => (
              <div key={row.tf} className="px-5 py-3 grid grid-cols-3 gap-4 text-xs">
                <div className="text-zinc-300">{row.tf}</div>
                <div className="text-zinc-500">{row.freq}</div>
                <div className="font-mono text-blue-400">{row.cron}</div>
              </div>
            ))}
          </div>
        </div>

        <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-5">
          <div className="text-sm font-semibold mb-2 flex items-center gap-2"><Clock size={14} className="text-zinc-500" /> Alternative schedulers</div>
          <ul className="text-xs text-zinc-500 space-y-1.5">
            <li><span className="text-zinc-400">GitHub Actions:</span> Use a workflow with <code className="bg-zinc-800 px-1 rounded">schedule: cron</code> to POST to <code className="bg-zinc-800 px-1 rounded">/functions/v1/scheduled-market-scanner</code> with a service role key header.</li>
            <li><span className="text-zinc-400">cron-job.org / EasyCron:</span> Hit the Edge Function URL every 5 minutes with the service role key as Authorization header.</li>
            <li><span className="text-zinc-400">Railway / Render:</span> Schedule a lightweight script that POSTs to the Edge Function URL.</li>
          </ul>
        </div>

        {cronDetected && (
          <div className="bg-emerald-500/10 border border-emerald-500/20 rounded-xl p-4 flex gap-3">
            <CheckCircle size={16} className="text-emerald-400 mt-0.5 shrink-0" />
            <div className="text-xs text-emerald-300">
              Scheduler is active. The scanner will run automatically every {scheduleEnabled ? '5' : '?'} minutes.
              Manual scans from the Control Room continue to work independently at any time.
            </div>
          </div>
        )}
      </div>
    </AdminLayout>
  );
}

function Step({ n, title, children }: { n: number; title: string; children: React.ReactNode }) {
  return (
    <div className="bg-zinc-950 border border-zinc-800 rounded-xl overflow-hidden">
      <div className="border-b border-zinc-800 px-5 py-3 flex items-center gap-3">
        <div className="w-6 h-6 rounded-full bg-blue-600/20 border border-blue-600/30 flex items-center justify-center text-xs font-bold text-blue-400">{n}</div>
        <span className="text-sm font-semibold">{title}</span>
      </div>
      <div className="px-5 py-4">{children}</div>
    </div>
  );
}

function CodeBlock({ code, id, copied, onCopy }: { code: string; id: string; copied: string | null; onCopy: (t: string, id: string) => void }) {
  return (
    <div className="relative">
      <pre className="text-xs text-zinc-300 bg-zinc-950 border border-zinc-800 rounded-lg p-4 overflow-x-auto leading-relaxed">
        {code}
      </pre>
      <button
        onClick={() => onCopy(code, id)}
        className="absolute top-2 right-2 flex items-center gap-1.5 bg-zinc-800 hover:bg-zinc-700 border border-zinc-700 text-zinc-400 hover:text-white px-2.5 py-1.5 rounded text-xs transition-colors">
        <Copy size={11} />
        {copied === id ? 'Copied!' : 'Copy'}
      </button>
    </div>
  );
}
