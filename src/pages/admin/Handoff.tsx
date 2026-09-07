import { AdminLayout } from '../../components/layout/AdminLayout';
import { CheckCircle, AlertTriangle, XCircle, Clock, Copy } from 'lucide-react';
import { useState } from 'react';

interface Section {
  title: string;
  items: { label: string; status: 'done' | 'demo' | 'placeholder' | 'manual'; note: string }[];
}

const sections: Section[] = [
  {
    title: 'Verified Product Capabilities',
    items: [
      { label: 'Crypto candle data (Binance)', status: 'done', note: 'Real OHLCV via public Binance API. No key needed.' },
      { label: 'Market scanner engine', status: 'done', note: 'EMA/ATR/RSI regime, MicroScalper + CompressionBreakout strategies.' },
      { label: 'Signal creation + grading', status: 'done', note: 'Grade A–D based on RR, regime, momentum. Stored in signals table.' },
      { label: 'Candidate tracking', status: 'done', note: 'strategy_candidates table with approval/rejection flow.' },
      { label: 'Manual scan trigger', status: 'done', note: 'Control Room → Run One Scan Now. Works instantly.' },
      { label: 'Scheduled scanner function', status: 'done', note: 'scheduled-market-scanner deployed. Skips if schedule_enabled=false.' },
      { label: 'Heartbeat tracking', status: 'done', note: 'scanner_config.heartbeat_status updated after every scan.' },
      { label: 'Telegram delivery', status: 'done', note: 'telegram-send function deployed. Sends to verified chat IDs.' },
      { label: 'Telegram deduplication', status: 'done', note: 'Checks telegram_deliveries before sending. No duplicate sends.' },
      { label: 'Auto Telegram gating', status: 'done', note: 'auto_send_telegram + min_auto_send_grade + allow_demo_telegram_sending all checked.' },
      { label: 'User auth + RLS', status: 'done', note: 'Supabase email/password. RLS on all tables. Admin role enforced.' },
      { label: 'Provider Health UI', status: 'done', note: 'Reads provider_status from DB. Shows REAL DATA or DEMO per provider.' },
      { label: 'Backtest / Replay Lab', status: 'manual', note: 'An in-browser/CSV simulation tool is available. It is not a completed historical-validation or prop-firm certification result.' },
      { label: 'Admin sidebar + navigation', status: 'done', note: 'Scroll position preserved across routes. All pages route-guarded.' },
      { label: 'Session persistence', status: 'done', note: 'onAuthStateChange as sole source. Survives page refresh.' },
      { label: 'Mode control (Signal/Personal/Prop)', status: 'manual', note: 'Configuration and paper-intent tracking are implemented; live-mode readiness must be verified per provider account.' },
      { label: 'Risk profile engine', status: 'manual', note: 'Risk limits are implemented in configuration and decision logic, but need provider-specific live proof before relying on them for a prop account.' },
      { label: 'Audit logging', status: 'done', note: 'All admin actions written to audit_logs.' },
    ],
  },
  {
    title: 'What Uses Demo / Fallback Data',
    items: [
      { label: 'Forex candles (default)', status: 'demo', note: 'Forex signal mode uses TwelveData only when explicitly enabled; no demo fallback is allowed.' },
      { label: 'Forex demo fallback', status: 'demo', note: 'If FOREX_DEMO_FALLBACK=false and provider fails, symbol is skipped (PROVIDER_ERROR). With =true, demo data fills in.' },
      { label: 'Auto Telegram (default OFF)', status: 'demo', note: 'auto_send_telegram defaults to false. Enable in Scanner Config after verifying Telegram setup.' },
      { label: 'Demo mode Telegram block (default)', status: 'demo', note: 'allow_demo_telegram_sending defaults to false. Prevents live sends from demo scan data.' },
    ],
  },
  {
    title: 'What Requires Manual Setup',
    items: [
      { label: 'pg_cron scheduled scanning', status: 'manual', note: 'Extensions enabled. Run SQL in Scheduler Guide to register the cron job. Then toggle cron_job_active in scanner_config.' },
      { label: 'Telegram bot token', status: 'manual', note: 'Set TELEGRAM_BOT_TOKEN as Supabase Edge Function secret. Use Telegram Verify page to test.' },
      { label: 'Twelve Data API key (forex)', status: 'manual', note: 'Set TWELVEDATA_API_KEY (or FOREX_DATA_API_KEY) as Edge Function secret. Set SIGNAL_ENABLE_FOREX=true and scanner_config.scan_forex_enabled=true to opt in.' },
      { label: 'Subscriber Telegram chat IDs', status: 'manual', note: 'Users link their Telegram via /app/telegram. Admin approves in Telegram Links page.' },
      { label: 'Admin account', status: 'manual', note: 'Create via /admin/setup. First admin bootstrapped using admin-bootstrap edge function.' },
    ],
  },
  {
    title: 'Live Execution Bridge & Advanced Capabilities',
    items: [
      { label: 'MT5 live execution', status: 'manual', note: 'The bridge, account onboarding, command polling, and state-sync components exist, but a real prop-account proof run has not been captured in this repository. Do not enable execution until the checklist below passes.' },
      { label: 'Live market prices & outcome evaluation', status: 'manual', note: 'Crypto outcome evaluation is implemented. Forex/MT5 live-price and broker-side execution reconciliation require provider credentials, deployment, and observed proof.' },
      { label: 'Customer billing and entitlement automation', status: 'placeholder', note: 'Package selection and admin approval are present, but there is no verified payment processor/webhook entitlement flow. Do not accept paid customers on the assumption that billing is automated.' },
    ],
  },
];

const REQUIRED_SECRETS = `# Required Edge Function Secrets
# Set in Supabase Dashboard → Edge Functions → Manage Secrets

TELEGRAM_BOT_TOKEN=          # From @BotFather on Telegram
TWELVEDATA_API_KEY=           # Twelve Data API key (for real forex candles)
FOREX_DATA_PROVIDER=twelvedata # Single real forex provider; no demo fallback
FOREX_DEMO_FALLBACK=          # Set to "false" to skip on provider error; "true" to fall back to demo`;

const CRON_SQL = `-- Run in Supabase SQL Editor (Settings → Database → SQL Editor)
-- Replace placeholders with your actual values from Project Settings → API

SELECT cron.schedule(
  'hashibot-scheduled-scanner',
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

-- After running, mark cron job as active:
UPDATE scanner_config SET cron_job_active = true WHERE id = 1;`;

const MANUAL_SCAN = `# Trigger a manual scan via curl
curl -X POST \\
  https://YOUR_SUPABASE_URL/functions/v1/market-scanner \\
  -H "Authorization: Bearer YOUR_SERVICE_ROLE_KEY" \\
  -H "Content-Type: application/json"`;

function statusIcon(s: Section['items'][0]['status']) {
  if (s === 'done') return <CheckCircle size={14} className="text-emerald-400 shrink-0 mt-0.5" />;
  if (s === 'demo') return <AlertTriangle size={14} className="text-yellow-400 shrink-0 mt-0.5" />;
  if (s === 'manual') return <Clock size={14} className="text-blue-400 shrink-0 mt-0.5" />;
  return <XCircle size={14} className="text-zinc-500 shrink-0 mt-0.5" />;
}

function statusLabel(s: Section['items'][0]['status']) {
  if (s === 'done') return <span className="text-xs bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 px-1.5 py-0.5 rounded font-medium">DONE</span>;
  if (s === 'demo') return <span className="text-xs bg-yellow-500/10 text-yellow-400 border border-yellow-500/20 px-1.5 py-0.5 rounded font-medium">DEMO</span>;
  if (s === 'manual') return <span className="text-xs bg-blue-500/10 text-blue-400 border border-blue-500/20 px-1.5 py-0.5 rounded font-medium">SETUP NEEDED</span>;
  return <span className="text-xs bg-zinc-800 text-zinc-500 border border-zinc-700 px-1.5 py-0.5 rounded font-medium">PLACEHOLDER</span>;
}

function CodeBlock({ code, id, copied, onCopy }: { code: string; id: string; copied: string | null; onCopy: (text: string, id: string) => void }) {
  return (
    <div className="relative mt-3">
      <pre className="text-xs text-zinc-300 bg-zinc-950 border border-zinc-800 rounded-lg p-4 overflow-x-auto leading-relaxed">
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

export default function Handoff() {
  const [copied, setCopied] = useState<string | null>(null);

  function copy(text: string, id: string) {
    navigator.clipboard.writeText(text);
    setCopied(id);
    setTimeout(() => setCopied(null), 2000);
  }

  return (
    <AdminLayout>
      <div className="mb-6">
        <h1 className="text-2xl font-bold">System Handoff & Readiness</h1>
        <p className="text-sm text-zinc-500 mt-0.5">Evidence-based overview of verified capabilities, manual operational prerequisites, and features that must not be represented as live-ready.</p>
      </div>

      <div className="max-w-4xl space-y-6">
        {/* Status legend */}
        <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-4 flex flex-wrap gap-4 text-xs">
          <div className="flex items-center gap-2"><CheckCircle size={13} className="text-emerald-400" /> <span className="text-zinc-400">Implemented and locally verified</span></div>
          <div className="flex items-center gap-2"><AlertTriangle size={13} className="text-yellow-400" /> <span className="text-zinc-400">Demo/fallback — works but not live data</span></div>
          <div className="flex items-center gap-2"><Clock size={13} className="text-blue-400" /> <span className="text-zinc-400">Manual setup required</span></div>
          <div className="flex items-center gap-2"><XCircle size={13} className="text-zinc-500" /> <span className="text-zinc-400">Placeholder — needs Codex work</span></div>
        </div>

        {/* Status sections */}
        {sections.map(section => (
          <div key={section.title} className="bg-zinc-900 border border-zinc-800 rounded-xl overflow-hidden">
            <div className="border-b border-zinc-800 px-5 py-3 text-sm font-semibold">{section.title}</div>
            <div className="divide-y divide-zinc-800/60">
              {section.items.map(item => (
                <div key={item.label} className="px-5 py-3 flex items-start gap-3">
                  {statusIcon(item.status)}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="text-sm text-zinc-200">{item.label}</span>
                      {statusLabel(item.status)}
                    </div>
                    <p className="text-xs text-zinc-500 mt-0.5 leading-relaxed">{item.note}</p>
                  </div>
                </div>
              ))}
            </div>
          </div>
        ))}

        {/* Required secrets */}
        <div className="bg-zinc-900 border border-zinc-800 rounded-xl overflow-hidden">
          <div className="border-b border-zinc-800 px-5 py-3 text-sm font-semibold">Required Edge Function Secrets</div>
          <div className="px-5 py-4">
            <p className="text-xs text-zinc-500 mb-1">Set these in Supabase Dashboard → Edge Functions → Manage Secrets (or via Supabase CLI).</p>
            <CodeBlock code={REQUIRED_SECRETS} id="secrets" copied={copied} onCopy={copy} />
          </div>
        </div>

        {/* Cron setup */}
        <div className="bg-zinc-900 border border-zinc-800 rounded-xl overflow-hidden">
          <div className="border-b border-zinc-800 px-5 py-3 text-sm font-semibold">Enable Always-On Scheduled Scanning (pg_cron)</div>
          <div className="px-5 py-4">
            <p className="text-xs text-zinc-500 mb-1">
              pg_cron and pg_net extensions are already enabled. Run the SQL below in Supabase SQL Editor to register the cron job.
              Then enable Schedule in Scanner Config.
            </p>
            <CodeBlock code={CRON_SQL} id="cron" copied={copied} onCopy={copy} />
          </div>
        </div>

        {/* Manual scan */}
        <div className="bg-zinc-900 border border-zinc-800 rounded-xl overflow-hidden">
          <div className="border-b border-zinc-800 px-5 py-3 text-sm font-semibold">Trigger Manual Scan via API</div>
          <div className="px-5 py-4">
            <p className="text-xs text-zinc-500 mb-1">Use this curl command to trigger a scan from any external system.</p>
            <CodeBlock code={MANUAL_SCAN} id="curl" copied={copied} onCopy={copy} />
          </div>
        </div>

        {/* Auto Telegram guide */}
        <div className="bg-zinc-900 border border-zinc-800 rounded-xl overflow-hidden">
          <div className="border-b border-zinc-800 px-5 py-3 text-sm font-semibold">Enable / Disable Auto Telegram Delivery</div>
          <div className="px-5 py-4 space-y-2 text-xs text-zinc-400">
            <div className="flex gap-2"><span className="text-zinc-300 font-medium w-48 shrink-0">1. Set bot token</span><span>Add TELEGRAM_BOT_TOKEN to Edge Function secrets.</span></div>
            <div className="flex gap-2"><span className="text-zinc-300 font-medium w-48 shrink-0">2. Verify Telegram</span><span>Go to Telegram Verify page and send a test message to confirm bot is working.</span></div>
            <div className="flex gap-2"><span className="text-zinc-300 font-medium w-48 shrink-0">3. Link subscribers</span><span>Users link their Telegram via /app/telegram. Admin approves in Telegram Links page.</span></div>
            <div className="flex gap-2"><span className="text-zinc-300 font-medium w-48 shrink-0">4. Enable auto send</span><span>Scanner Config → Auto Telegram Delivery → toggle Auto Send Telegram ON.</span></div>
            <div className="flex gap-2"><span className="text-zinc-300 font-medium w-48 shrink-0">5. Set min grade</span><span>Set Min Auto Send Grade (default A). Only signals at or above this grade are auto-sent.</span></div>
            <div className="flex gap-2"><span className="text-zinc-300 font-medium w-48 shrink-0">6. Allow demo sends (optional)</span><span>Scanner Config → allow_demo_telegram_sending. Leave OFF unless testing with demo data.</span></div>
            <div className="flex gap-2"><span className="text-zinc-300 font-medium w-48 shrink-0">Disable at any time</span><span>Toggle Auto Send Telegram OFF in Scanner Config. Takes effect on next scan.</span></div>
          </div>
        </div>

        {/* Codex next steps */}
        <div className="bg-zinc-900 border border-zinc-800 rounded-xl overflow-hidden">
          <div className="border-b border-zinc-800 px-5 py-3 text-sm font-semibold">Required Before a Real Prop Account or Customer Launch</div>
          <div className="px-5 py-4">
            <ol className="text-xs text-zinc-400 space-y-2 list-decimal list-inside">
              <li><span className="text-zinc-300">Demo-account proof</span> — Deploy the MT5 agent, verify heartbeat, place/cancel a deliberately tiny demo order, and reconcile its broker ticket, fill price, stop loss, take profit, and position state in HashiBot.</li>
              <li><span className="text-zinc-300">Prop-rule proof</span> — Configure the exact firm rules, then demonstrate that daily-loss, total/trailing-drawdown, session, news, and weekend restrictions block entries and persist an auditable lock.</li>
              <li><span className="text-zinc-300">Failure and recovery proof</span> — Disconnect the bridge during order handling, restart it, and prove idempotency, reconciliation, alerting, and a safe default of no new entries.</li>
              <li><span className="text-zinc-300">Independent backtest validation</span> — Run versioned, real-bar, out-of-sample tests with spread, commission, slippage, session rules, and survivorship controls; retain the raw data and reports.</li>
              <li><span className="text-zinc-300">Customer money flow</span> — Implement and test payment-provider webhooks, server-side entitlement changes, refund/cancellation handling, and a support/audit trail before taking paid orders.</li>
            </ol>
          </div>
        </div>

        <div className="bg-amber-500/10 border border-amber-500/20 rounded-xl p-4 text-xs text-amber-200 leading-relaxed">
          <strong>Launch gate:</strong> this repository does not by itself prove a real prop-account execution lifecycle or paid-customer billing lifecycle. Keep live execution disabled and do not market automated prop trading as proven until every prerequisite above has been executed in the deployed environment and the resulting evidence has been reviewed.
        </div>
      </div>
    </AdminLayout>
  );
}
