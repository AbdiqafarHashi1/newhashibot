import { AdminLayout } from '../../components/layout/AdminLayout';
import { Clock, AlertTriangle, CheckCircle, Copy, Play } from 'lucide-react';
import { useState } from 'react';
import { supabase } from '../../lib/supabase';

const SQL_CRON = `-- Run this in Supabase SQL Editor to enable scheduled scanning
-- Requires pg_cron + pg_net extensions (enabled by default on Supabase)

-- Enable extensions if not already enabled
CREATE EXTENSION IF NOT EXISTS pg_cron;
CREATE EXTENSION IF NOT EXISTS pg_net;

-- Schedule scheduled-market-scanner to run every 5 minutes
-- Replace YOUR_SUPABASE_URL and YOUR_SERVICE_ROLE_KEY with actual values
SELECT cron.schedule(
  'hashibot-scheduled-scanner',     -- job name
  '*/5 * * * *',                    -- every 5 minutes
  $$
  SELECT
    net.http_post(
      url := 'YOUR_SUPABASE_URL/functions/v1/scheduled-market-scanner',
      headers := jsonb_build_object(
        'Content-Type', 'application/json',
        'Authorization', 'Bearer YOUR_SERVICE_ROLE_KEY'
      ),
      body := '{}'::jsonb
    ) AS request_id;
  $$
);

-- View scheduled jobs
SELECT * FROM cron.job;

-- To disable/remove the job:
-- SELECT cron.unschedule('hashibot-scheduled-scanner');`;

const SQL_NET = `-- Enable pg_net extension (required for HTTP calls from cron)
CREATE EXTENSION IF NOT EXISTS pg_net;`;

const SQL_CHECK = `-- Check if cron job is active
SELECT jobid, jobname, schedule, active
FROM cron.job
WHERE jobname = 'hashibot-scheduled-scanner';`;

export default function SchedulerGuide() {
  const [copied, setCopied] = useState<string | null>(null);
  const [testing, setTesting] = useState(false);
  const [testResult, setTestResult] = useState<{ ok: boolean; msg: string } | null>(null);

  function copy(text: string, id: string) {
    navigator.clipboard.writeText(text);
    setCopied(id);
    setTimeout(() => setCopied(null), 2000);
  }

  async function testScheduledScan() {
    setTesting(true);
    setTestResult(null);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      const token = session?.access_token;
      const url = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/scheduled-market-scanner`;
      const res = await fetch(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`,
        },
        body: JSON.stringify({}),
      });
      const json = await res.json();
      if (json.skipped) {
        setTestResult({ ok: false, msg: `Skipped: ${json.reason ?? 'schedule_disabled'}. Enable Schedule in Scanner Config first.` });
      } else if (json.error) {
        setTestResult({ ok: false, msg: json.error });
      } else {
        const s = json.summary;
        setTestResult({ ok: true, msg: `Scan complete. Symbols: ${s?.symbols_scanned ?? '?'}, Signals: ${s?.signals_created ?? '?'}, TG sent: ${s?.telegram_sent ?? '?'}` });
      }
    } catch (e) {
      setTestResult({ ok: false, msg: e instanceof Error ? e.message : 'Unknown error' });
    } finally {
      setTesting(false);
    }
  }

  return (
    <AdminLayout>
      <div className="mb-6">
        <h1 className="text-2xl font-bold">Scheduled Scanning Setup</h1>
        <p className="text-sm text-zinc-500 mt-0.5">Configure automatic scanner execution using Supabase pg_cron + scheduled-market-scanner</p>
      </div>

      <div className="max-w-3xl space-y-4">
        {/* Test button */}
        <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-5">
          <div className="text-sm font-semibold mb-1">Test Scheduled Scan Now</div>
          <p className="text-xs text-zinc-500 mb-3">
            Triggers the <code className="bg-zinc-800 px-1 rounded">scheduled-market-scanner</code> function as an admin user.
            Requires <strong className="text-zinc-300">Schedule Enabled</strong> to be on in Scanner Config.
          </p>
          <button
            onClick={testScheduledScan}
            disabled={testing}
            className="inline-flex items-center gap-2 bg-blue-600 hover:bg-blue-500 disabled:opacity-60 text-white px-4 py-2 rounded-lg text-sm font-medium transition-colors"
          >
            <Play size={13} />
            {testing ? 'Running...' : 'Run Scheduled Scan Now'}
          </button>
          {testResult && (
            <div className={`mt-3 px-4 py-3 rounded-lg text-xs border ${testResult.ok ? 'bg-emerald-500/10 border-emerald-500/20 text-emerald-300' : 'bg-red-500/10 border-red-500/20 text-red-300'}`}>
              {testResult.msg}
            </div>
          )}
        </div>

        {/* Status card */}
        <div className="bg-orange-500/10 border border-orange-500/20 rounded-xl p-4 flex gap-3">
          <AlertTriangle size={16} className="text-orange-400 mt-0.5 shrink-0" />
          <div>
            <div className="text-sm font-semibold text-orange-400 mb-1">Automatic scheduling is not configured by default</div>
            <div className="text-xs text-orange-300/80">
              The scanner only runs when triggered manually from the Control Room, via the test button above,
              or via a properly configured pg_cron job. Follow the instructions below to set up 24/7 automatic scanning.
            </div>
          </div>
        </div>

        {/* What not to do */}
        <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-5">
          <div className="text-sm font-semibold mb-2">Important: Do not fake a scheduler</div>
          <p className="text-xs text-zinc-400 leading-relaxed">
            HashiBot does not use browser-based polling or setInterval to trigger scans.
            Scheduling must happen server-side via Supabase pg_cron or an external scheduler.
            This ensures scans run 24/7 even when no browser is open.
          </p>
        </div>

        {/* Step 1 */}
        <Step n={1} title="Enable pg_net extension">
          <p className="text-xs text-zinc-400 mb-3">pg_net allows cron jobs to make HTTP requests. Run this in the Supabase SQL Editor:</p>
          <CodeBlock code={SQL_NET} id="net" copied={copied} onCopy={copy} />
        </Step>

        {/* Step 2 */}
        <Step n={2} title="Schedule the scheduled-market-scanner Edge Function">
          <p className="text-xs text-zinc-400 mb-2">Replace the placeholders, then run in Supabase SQL Editor:</p>
          <ul className="text-xs text-zinc-500 mb-3 space-y-1">
            <li><code className="bg-zinc-800 px-1 rounded">YOUR_SUPABASE_URL</code> — found in Project Settings → API</li>
            <li><code className="bg-zinc-800 px-1 rounded">YOUR_SERVICE_ROLE_KEY</code> — found in Project Settings → API (service_role key)</li>
          </ul>
          <CodeBlock code={SQL_CRON} id="cron" copied={copied} onCopy={copy} />
        </Step>

        {/* Step 3 */}
        <Step n={3} title="Verify the job is active">
          <p className="text-xs text-zinc-400 mb-3">Run this query to confirm the cron job was created:</p>
          <CodeBlock code={SQL_CHECK} id="check" copied={copied} onCopy={copy} />
        </Step>

        {/* Step 4 */}
        <Step n={4} title="Enable Schedule in Scanner Config">
          <p className="text-xs text-zinc-400 leading-relaxed">
            In <strong className="text-zinc-300">Scanner Config → Scheduled Scanning</strong>, toggle <strong className="text-zinc-300">Schedule Enabled</strong> to ON.
            Without this, cron calls to <code className="bg-zinc-800 px-1 rounded">scheduled-market-scanner</code> will be silently skipped
            and the heartbeat will show <span className="text-zinc-400">Inactive</span>.
          </p>
        </Step>

        {/* Frequency guide */}
        <div className="bg-zinc-900 border border-zinc-800 rounded-xl overflow-hidden">
          <div className="border-b border-zinc-800 px-5 py-3 text-sm font-semibold">Recommended Scan Frequencies</div>
          <div className="divide-y divide-zinc-800">
            {[
              { tf: '5m + 15m signals', freq: 'Every 5 minutes', cron: '*/5 * * * *' },
              { tf: '1h signals', freq: 'Every 15 minutes', cron: '*/15 * * * *' },
              { tf: '4h signals', freq: 'Every 1 hour', cron: '0 * * * *' },
              { tf: 'All timeframes (combined)', freq: 'Every 5 minutes', cron: '*/5 * * * *', note: 'Scanner handles timeframe routing internally' },
            ].map(row => (
              <div key={row.tf} className="px-5 py-3 grid grid-cols-3 gap-4 text-xs">
                <div className="text-zinc-300">{row.tf}</div>
                <div className="text-zinc-500">{row.freq}</div>
                <div className="font-mono text-blue-400">{row.cron}</div>
              </div>
            ))}
          </div>
        </div>

        {/* Alternative */}
        <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-5">
          <div className="text-sm font-semibold mb-2 flex items-center gap-2"><Clock size={14} className="text-zinc-500" /> Alternative schedulers</div>
          <ul className="text-xs text-zinc-500 space-y-1.5">
            <li><span className="text-zinc-400">GitHub Actions:</span> Use a workflow with <code className="bg-zinc-800 px-1 rounded">schedule: cron</code> to POST to <code className="bg-zinc-800 px-1 rounded">/functions/v1/scheduled-market-scanner</code> with a service role key header.</li>
            <li><span className="text-zinc-400">Railway / Render cron:</span> Schedule a lightweight script that POSTs to the Edge Function URL every 5 minutes.</li>
            <li><span className="text-zinc-400">External cron service:</span> Use cron-job.org or EasyCron to hit the Edge Function URL on a schedule.</li>
          </ul>
        </div>

        <div className="bg-emerald-500/10 border border-emerald-500/20 rounded-xl p-4 flex gap-3">
          <CheckCircle size={16} className="text-emerald-400 mt-0.5 shrink-0" />
          <div className="text-xs text-emerald-300">
            Once the cron job is active and Schedule Enabled is ON, the scanner will run automatically every 5 minutes.
            The heartbeat in Scanner Config will show <strong>Healthy</strong> after the first successful scheduled run.
            Manual scans from the Control Room continue to work independently at any time.
          </div>
        </div>
      </div>
    </AdminLayout>
  );
}

function Step({ n, title, children }: { n: number; title: string; children: React.ReactNode }) {
  return (
    <div className="bg-zinc-900 border border-zinc-800 rounded-xl overflow-hidden">
      <div className="border-b border-zinc-800 px-5 py-3 flex items-center gap-3">
        <div className="w-6 h-6 rounded-full bg-blue-600/20 border border-blue-600/30 flex items-center justify-center text-xs font-bold text-blue-400">{n}</div>
        <span className="text-sm font-semibold">{title}</span>
      </div>
      <div className="px-5 py-4">{children}</div>
    </div>
  );
}

function CodeBlock({ code, id, copied, onCopy }: {
  code: string; id: string;
  copied: string | null; onCopy: (text: string, id: string) => void;
}) {
  return (
    <div className="relative">
      <pre className="text-xs text-zinc-300 bg-zinc-950 border border-zinc-800 rounded-lg p-4 overflow-x-auto leading-relaxed scrollbar-thin">
        {code}
      </pre>
      <button
        onClick={() => onCopy(code, id)}
        className="absolute top-2 right-2 flex items-center gap-1.5 bg-zinc-800 hover:bg-zinc-700 border border-zinc-700 text-zinc-400 hover:text-white px-2.5 py-1.5 rounded text-xs transition-colors"
      >
        <Copy size={11} />
        {copied === id ? 'Copied!' : 'Copy'}
      </button>
    </div>
  );
}
