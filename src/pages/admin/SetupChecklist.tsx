import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { AdminLayout } from '../../components/layout/AdminLayout';
import { supabase } from '../../lib/supabase';
import { getFrontendSupabaseConfig } from '../../lib/supabaseEnv';
import { CheckCircle, Circle, AlertTriangle, ArrowRight, XCircle } from 'lucide-react';

interface CheckItem {
  id: string;
  label: string;
  detail: string;
  instruction: string;
  link?: { to: string; label: string };
  status: 'pass' | 'fail' | 'manual' | 'loading';
}

interface ChecklistData {
  // Frontend env
  urlProjectRef: string | null;
  urlIsCorrect: boolean;
  keyProjectMatch: string;
  keyTypeGuess: string;
  // Auth
  adminCount: number;
  // Edge functions (proxy via market-scanner debug)
  providerConfig: Record<string, unknown> | null;
  providerConfigError: string | null;
  // Scheduler
  pgCronRegistered: boolean;
  latestAutomaticRun: { started_at: string; status: string } | null;
  scheduleEnabled: boolean;
  // Signal data
  signalCount: number;
  cryptoSignalCount: number;
  // Telegram
  tgSentCount: number;
  tgAutoEnabled: boolean;
}

async function loadChecklistData(): Promise<ChecklistData> {
  const envConfig = getFrontendSupabaseConfig();

  const [
    profilesRes,
    signalsRes,
    cryptoSignalsRes,
    tgRes,
    cfgRes,
    automaticRunRes,
  ] = await Promise.all([
    supabase.from('profiles').select('id', { count: 'exact' }).eq('role', 'admin'),
    supabase.from('signals').select('id', { count: 'exact' }),
    supabase.from('signals').select('id', { count: 'exact' }).eq('market_type', 'crypto'),
    supabase.from('telegram_deliveries').select('id', { count: 'exact' }).eq('status', 'sent'),
    supabase.from('scanner_config').select('schedule_enabled,auto_send_telegram').eq('id', 1).maybeSingle(),
    supabase
      .from('scanner_runs')
      .select('started_at,status')
      .or('source.eq.pg_cron,triggered_by.eq.pg_cron,is_automatic.eq.true')
      .order('started_at', { ascending: false })
      .limit(1)
      .maybeSingle(),
  ]);

  // Probe market-scanner debug_provider_config via edge function
  let providerConfig: Record<string, unknown> | null = null;
  let providerConfigError: string | null = null;
  try {
    const supabaseUrl = import.meta.env.VITE_SUPABASE_URL ?? import.meta.env.VITE_HASHIBOT_SUPABASE_URL ?? '';
    const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY ?? import.meta.env.VITE_HASHIBOT_SUPABASE_ANON_KEY ?? '';
    if (supabaseUrl && anonKey) {
      const res = await fetch(`${supabaseUrl}/functions/v1/market-scanner`, {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${anonKey}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ debug_provider_config: true }),
      });
      const json = await res.json() as Record<string, unknown>;
      if (res.ok && json.success !== false) {
        providerConfig = json;
      } else {
        providerConfigError = String(json.error ?? json.reason ?? `HTTP ${res.status}`);
      }
    } else {
      providerConfigError = 'missing_supabase_url_or_key';
    }
  } catch (e) {
    providerConfigError = e instanceof Error ? e.message : 'fetch_failed';
  }

  // Check pg_cron: try to query cron.job table directly
  let pgCronRegistered = false;
  try {
    const { data: cronData } = await supabase
      .from('cron_jobs_view' as never)
      .select('jobname')
      .limit(1)
      .maybeSingle() as { data: { jobname?: string } | null };
    pgCronRegistered = Boolean(cronData);
  } catch {
    // Fallback: check if any automatic run exists recently
    pgCronRegistered = Boolean(automaticRunRes.data);
  }

  const automaticRun = automaticRunRes.data as { started_at: string; status: string } | null;

  return {
    urlProjectRef: envConfig.selectedProjectRef,
    urlIsCorrect: envConfig.projectRefMatch,
    keyProjectMatch: envConfig.keyProjectMatch,
    keyTypeGuess: envConfig.keyTypeGuess,
    adminCount: profilesRes.count ?? 0,
    providerConfig,
    providerConfigError,
    pgCronRegistered,
    latestAutomaticRun: automaticRun,
    scheduleEnabled: cfgRes.data?.schedule_enabled ?? false,
    signalCount: signalsRes.count ?? 0,
    cryptoSignalCount: cryptoSignalsRes.count ?? 0,
    tgSentCount: tgRes.count ?? 0,
    tgAutoEnabled: cfgRes.data?.auto_send_telegram ?? false,
  };
}

function minutesAgo(iso: string): number {
  return (Date.now() - new Date(iso).getTime()) / 60000;
}

function buildChecks(d: ChecklistData): CheckItem[] {
  const pc = d.providerConfig;
  const supabaseUrlInBrowser = import.meta.env.VITE_SUPABASE_URL ?? import.meta.env.VITE_HASHIBOT_SUPABASE_URL ?? '';
  const keyPresent = Boolean(import.meta.env.VITE_SUPABASE_ANON_KEY ?? import.meta.env.VITE_HASHIBOT_SUPABASE_ANON_KEY);

  const latestRunAge = d.latestAutomaticRun ? minutesAgo(d.latestAutomaticRun.started_at) : null;
  const hasRecentRun = latestRunAge !== null && latestRunAge <= 30;

  const edgeFunctionsDeployed = d.providerConfig !== null;
  const pgCronFired = Boolean(d.latestAutomaticRun);
  const pgCronRecent = hasRecentRun;
  const cryptoProviderActive = pc?.signal_enable_crypto === true;
  const forexDisabled = pc?.signal_enable_forex === false;
  const noServiceRoleInBrowser = d.keyTypeGuess !== 'forbidden_secret';
  const telegramBotConfigured = pc?.telegram_bot_token_set === true;
  const telegramChatConfigured = pc?.telegram_default_channel_id_set === true || pc?.telegram_chat_id_set === true;

  return [
    {
      id: '01',
      label: 'Frontend URL points to correct Supabase project',
      detail: d.urlIsCorrect
        ? `URL resolves to project ref: ${d.urlProjectRef}`
        : `URL points to wrong project ref: ${d.urlProjectRef ?? 'unknown'}. Expected: uqiwbzfcntlcyyeewafc`,
      instruction: 'VITE_HASHIBOT_SUPABASE_URL or VITE_SUPABASE_URL must point to https://uqiwbzfcntlcyyeewafc.supabase.co',
      status: d.urlIsCorrect ? 'pass' : 'fail',
    },
    {
      id: '02',
      label: 'Anon key present in browser',
      detail: keyPresent
        ? `Key present — type: ${d.keyTypeGuess}, project match: ${d.keyProjectMatch}`
        : 'No anon key found in browser env. VITE_SUPABASE_ANON_KEY or VITE_HASHIBOT_SUPABASE_ANON_KEY must be set.',
      instruction: 'Bolt injects VITE_SUPABASE_ANON_KEY at build time from project secrets. Confirm the secret is set in the Supabase project.',
      link: { to: '/admin/control-room', label: 'Control Room' },
      status: keyPresent ? (d.keyTypeGuess === 'forbidden_secret' ? 'fail' : 'pass') : 'fail',
    },
    {
      id: '03',
      label: 'No service-role key in browser',
      detail: noServiceRoleInBrowser
        ? 'Key type looks safe — not a service-role/forbidden secret key.'
        : 'DANGER: browser key appears to be a service-role secret key. This must be replaced with the anon/publishable key.',
      instruction: 'The browser must only ever receive the anon key. The service-role key must remain in edge function secrets only.',
      status: noServiceRoleInBrowser ? 'pass' : 'fail',
    },
    {
      id: '04',
      label: 'Admin profile exists',
      detail: d.adminCount > 0
        ? `${d.adminCount} admin profile(s) found.`
        : 'No admin profile. Register, then visit /admin/setup to claim first admin.',
      instruction: 'Go to /register, create account, then /admin/setup to claim admin role.',
      link: { to: '/admin/setup', label: 'Admin Setup' },
      status: d.adminCount > 0 ? 'pass' : 'fail',
    },
    {
      id: '05',
      label: 'Edge functions deployed and responding',
      detail: edgeFunctionsDeployed
        ? 'market-scanner debug_provider_config returned OK.'
        : `market-scanner not responding: ${d.providerConfigError ?? 'unknown error'}`,
      instruction: 'The market-scanner, scheduled-market-scanner, and telegram-send edge functions must be deployed.',
      link: { to: '/admin/control-room', label: 'Control Room' },
      status: edgeFunctionsDeployed ? 'pass' : 'fail',
    },
    {
      id: '06',
      label: 'Crypto provider active (Binance)',
      detail: cryptoProviderActive
        ? `Crypto enabled. Provider: ${String(pc?.crypto_provider ?? 'binance')}`
        : d.providerConfigError
          ? `Cannot confirm — edge function error: ${d.providerConfigError}`
          : 'SIGNAL_ENABLE_CRYPTO is false. Crypto signals are disabled.',
      instruction: 'SIGNAL_ENABLE_CRYPTO must be true (default). CRYPTO_DATA_PROVIDER defaults to "binance".',
      link: { to: '/admin/providers', label: 'Provider Health' },
      status: !edgeFunctionsDeployed ? 'fail' : cryptoProviderActive ? 'pass' : 'fail',
    },
    {
      id: '07',
      label: 'Forex disabled for MVP',
      detail: forexDisabled
        ? 'SIGNAL_ENABLE_FOREX is false. Forex is correctly disabled for crypto-only MVP.'
        : d.providerConfigError
          ? `Cannot confirm — edge function error: ${d.providerConfigError}`
          : 'SIGNAL_ENABLE_FOREX is true. Forex signals are enabled — disable for crypto-only MVP.',
      instruction: 'SIGNAL_ENABLE_FOREX must be false (default) for the crypto-only MVP.',
      link: { to: '/admin/providers', label: 'Provider Health' },
      status: !edgeFunctionsDeployed ? 'fail' : forexDisabled ? 'pass' : 'fail',
    },
    {
      id: '08',
      label: 'Telegram bot token configured in edge function secrets',
      detail: telegramBotConfigured
        ? 'TELEGRAM_BOT_TOKEN is set in edge function secrets.'
        : d.providerConfigError
          ? `Cannot confirm — edge function error: ${d.providerConfigError}`
          : 'TELEGRAM_BOT_TOKEN is not set. Telegram sends will fail.',
      instruction: 'Add TELEGRAM_BOT_TOKEN as a Supabase edge function secret. Get it from @BotFather on Telegram.',
      link: { to: '/admin/telegram-test', label: 'Telegram Test' },
      status: !edgeFunctionsDeployed ? 'fail' : telegramBotConfigured ? 'pass' : 'fail',
    },
    {
      id: '09',
      label: 'Telegram channel/chat ID configured',
      detail: telegramChatConfigured
        ? 'Telegram channel ID is set in edge function secrets.'
        : d.providerConfigError
          ? `Cannot confirm — edge function error: ${d.providerConfigError}`
          : 'TELEGRAM_DEFAULT_CHANNEL_ID or TELEGRAM_CHAT_ID not set.',
      instruction: 'Add TELEGRAM_DEFAULT_CHANNEL_ID (or TELEGRAM_CHAT_ID) as an edge function secret.',
      link: { to: '/admin/telegram-test', label: 'Telegram Test' },
      status: !edgeFunctionsDeployed ? 'fail' : telegramChatConfigured ? 'pass' : 'fail',
    },
    {
      id: '10',
      label: 'Telegram test send confirmed',
      detail: d.tgSentCount > 0
        ? `${d.tgSentCount} Telegram message(s) delivered.`
        : 'No delivered Telegram messages yet. Go to Telegram Test and send a test message.',
      instruction: 'In Telegram Test, click "Send Test Message". Confirm message arrives in your Telegram channel.',
      link: { to: '/admin/telegram-test', label: 'Telegram Test' },
      status: d.tgSentCount > 0 ? 'pass' : 'manual',
    },
    {
      id: '11',
      label: 'Schedule enabled in Scanner Config',
      detail: d.scheduleEnabled
        ? 'Schedule is enabled. pg_cron calls will trigger scans.'
        : 'Schedule is disabled. Enable it in Scanner Config → Scheduled Scanning.',
      instruction: 'In Scanner Config, enable Schedule. This is required for automatic scans via pg_cron.',
      link: { to: '/admin/scanner-config', label: 'Scanner Config' },
      status: d.scheduleEnabled ? 'pass' : 'fail',
    },
    {
      id: '12',
      label: 'pg_cron job registered (automatic run proof)',
      detail: pgCronFired
        ? `Automatic run detected — last: ${d.latestAutomaticRun!.started_at.slice(0, 16).replace('T', ' ')} UTC (status: ${d.latestAutomaticRun!.status})`
        : 'No automatic pg_cron run found. Check pg_cron registration in Supabase SQL editor.',
      instruction: 'The scheduled-market-scanner must be called by pg_cron. Check migration 014 or run the SQL to register the cron job.',
      link: { to: '/admin/scheduler', label: 'Scheduler Guide' },
      status: pgCronFired ? 'pass' : 'fail',
    },
    {
      id: '13',
      label: 'pg_cron fired within the last 30 minutes',
      detail: pgCronRecent
        ? `Last automatic run was ${latestRunAge?.toFixed(0)} minute(s) ago.`
        : pgCronFired
          ? `Last automatic run was ${latestRunAge?.toFixed(0)} minute(s) ago — more than 30 min. May be stale or paused.`
          : 'No automatic run found.',
      instruction: 'Confirm pg_cron is actively firing. A healthy setup should have a run every 5–15 minutes.',
      link: { to: '/admin/scanner', label: 'Scanner Status' },
      status: pgCronRecent ? 'pass' : pgCronFired ? 'fail' : 'fail',
    },
    {
      id: '14',
      label: 'At least one crypto signal generated',
      detail: d.cryptoSignalCount > 0
        ? `${d.cryptoSignalCount} crypto signal(s) exist (${d.signalCount} total).`
        : 'No crypto signals yet. Wait for the scanner to find a qualifying setup, or create a manual signal.',
      instruction: 'Run the scanner a few times. When a strategy identifies a qualifying crypto setup, a signal is auto-created.',
      link: { to: '/admin/signals', label: 'Signals Manager' },
      status: d.cryptoSignalCount > 0 ? 'pass' : 'manual',
    },
    {
      id: '15',
      label: 'Auto Telegram send produces a delivered message',
      detail: d.tgAutoEnabled && d.tgSentCount > 0
        ? `Auto Telegram is ON and ${d.tgSentCount} message(s) delivered.`
        : d.tgAutoEnabled
          ? 'Auto Telegram is ON but no delivered messages yet. Wait for a signal with eligible subscribers.'
          : `Auto Telegram is OFF. ${d.tgSentCount} message(s) delivered manually or via test.`,
      instruction: 'Enable Auto Send Telegram in Scanner Config. When a signal is created, it will automatically be sent to connected subscribers.',
      link: { to: '/admin/scanner-config', label: 'Scanner Config' },
      status: d.tgSentCount > 0 ? 'pass' : 'manual',
    },
    {
      id: '16',
      label: 'UI project ref matches expected Supabase project',
      detail: d.urlIsCorrect && d.adminCount > 0
        ? `Frontend is connected to correct project (${d.urlProjectRef}) and admin data is loading.`
        : d.urlIsCorrect
          ? `Frontend URL is correct (${d.urlProjectRef}) but no admin profile found.`
          : `Frontend URL project ref mismatch: ${d.urlProjectRef ?? 'unknown'}`,
      instruction: 'The frontend must connect to project uqiwbzfcntlcyyeewafc. Confirm login works and admin data is visible.',
      link: { to: '/admin/control-room', label: 'Control Room' },
      status: d.urlIsCorrect && d.adminCount > 0 ? 'pass' : 'fail',
    },
    {
      id: '17',
      label: 'Scanner URL in browser matches Supabase project (no stale old project)',
      detail: supabaseUrlInBrowser.includes('uqiwbzfcntlcyyeewafc')
        ? `Browser URL: ${supabaseUrlInBrowser} — correct project.`
        : supabaseUrlInBrowser
          ? `Browser URL: ${supabaseUrlInBrowser} — may be stale/wrong project.`
          : 'No Supabase URL found in browser env.',
      instruction: 'Both VITE_SUPABASE_URL and VITE_HASHIBOT_SUPABASE_URL should point to uqiwbzfcntlcyyeewafc. Stale zkdwovzagqbfdtxtovli refs must not be used.',
      status: supabaseUrlInBrowser.includes('uqiwbzfcntlcyyeewafc') ? 'pass' : 'fail',
    },
  ];
}

export default function SetupChecklist() {
  const [checks, setChecks] = useState<CheckItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    loadChecklistData()
      .then(data => {
        setChecks(buildChecks(data));
        setLoading(false);
      })
      .catch(err => {
        setError(err instanceof Error ? err.message : 'Unknown error loading checklist data');
        setLoading(false);
      });
  }, []);

  const passCount = checks.filter(c => c.status === 'pass').length;
  const failCount = checks.filter(c => c.status === 'fail').length;
  const manualCount = checks.filter(c => c.status === 'manual').length;
  const totalCount = checks.length;
  const pct = totalCount > 0 ? Math.round((passCount / totalCount) * 100) : 0;
  const allGreen = failCount === 0 && manualCount === 0 && totalCount > 0;

  return (
    <AdminLayout>
      <div className="mb-6">
        <h1 className="text-2xl font-bold">Crypto-Only MVP Checklist</h1>
        <p className="text-sm text-zinc-500 mt-0.5">
          End-to-end verification for the crypto-only production deployment. Confirms frontend env, edge functions, pg_cron, scanner, and Telegram are all wired up correctly.
        </p>
      </div>

      {loading ? (
        <div className="flex items-center justify-center h-48">
          <div className="w-5 h-5 border-2 border-blue-500 border-t-transparent rounded-full animate-spin" />
        </div>
      ) : error ? (
        <div className="bg-red-500/10 border border-red-500/20 rounded-xl p-4 text-sm text-red-400">
          Error loading checklist: {error}
        </div>
      ) : (
        <div className="max-w-2xl">
          {/* Progress */}
          <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-5 mb-4">
            <div className="flex items-center justify-between mb-2">
              <span className="text-sm font-semibold">{passCount} / {totalCount} passing</span>
              <div className="flex items-center gap-3 text-xs">
                {failCount > 0 && <span className="text-red-400">{failCount} failing</span>}
                {manualCount > 0 && <span className="text-yellow-400">{manualCount} manual</span>}
                <span className="text-zinc-500">{pct}%</span>
              </div>
            </div>
            <div className="h-2 bg-zinc-800 rounded-full overflow-hidden">
              <div
                className={`h-full rounded-full transition-all duration-500 ${allGreen ? 'bg-emerald-500' : failCount > 0 ? 'bg-blue-500' : 'bg-blue-500'}`}
                style={{ width: `${pct}%` }}
              />
            </div>
          </div>

          <div className="space-y-2">
            {checks.map((item, i) => (
              <div
                key={item.id}
                className={`rounded-xl border p-4 transition-colors ${
                  item.status === 'pass'
                    ? 'bg-emerald-500/5 border-emerald-500/20'
                    : item.status === 'fail'
                      ? 'bg-red-500/5 border-red-500/20'
                      : 'bg-yellow-500/5 border-yellow-500/20'
                }`}
              >
                <div className="flex items-start gap-3">
                  <div className="mt-0.5 shrink-0">
                    {item.status === 'pass' && <CheckCircle size={16} className="text-emerald-400" />}
                    {item.status === 'fail' && <XCircle size={16} className="text-red-400" />}
                    {item.status === 'manual' && <Circle size={16} className="text-yellow-500" />}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="text-xs text-zinc-600 font-mono">{String(i + 1).padStart(2, '0')}</span>
                      <span className={`text-sm font-medium ${
                        item.status === 'pass' ? 'text-emerald-300'
                        : item.status === 'fail' ? 'text-red-300'
                        : 'text-yellow-300'
                      }`}>
                        {item.label}
                      </span>
                      {item.status === 'manual' && (
                        <span className="text-xs bg-yellow-500/15 text-yellow-400 border border-yellow-500/25 px-1.5 py-0.5 rounded">manual verify</span>
                      )}
                    </div>
                    <p className="text-xs text-zinc-400 mt-0.5 leading-relaxed">{item.detail}</p>
                    {item.status !== 'pass' && (
                      <p className="text-xs text-zinc-600 mt-0.5 leading-relaxed italic">{item.instruction}</p>
                    )}
                  </div>
                  {item.link && item.status !== 'pass' && (
                    <Link
                      to={item.link.to}
                      className="shrink-0 inline-flex items-center gap-1 text-xs text-blue-400 hover:text-blue-300 bg-blue-600/10 border border-blue-600/20 px-2.5 py-1.5 rounded-lg transition-colors"
                    >
                      {item.link.label}
                      <ArrowRight size={10} />
                    </Link>
                  )}
                </div>
              </div>
            ))}
          </div>

          {failCount > 0 && (
            <div className="mt-4 bg-red-500/10 border border-red-500/20 rounded-xl p-4 flex items-start gap-3">
              <AlertTriangle size={16} className="text-red-400 shrink-0 mt-0.5" />
              <div className="text-sm text-red-300">
                <span className="font-semibold">{failCount} item{failCount > 1 ? 's' : ''} failing.</span> Fix the items marked in red before going live. The most common causes are wrong env variables or edge functions not deployed.
              </div>
            </div>
          )}

          {allGreen && (
            <div className="mt-4 bg-emerald-500/10 border border-emerald-500/20 rounded-xl p-4 text-center">
              <CheckCircle size={20} className="text-emerald-400 mx-auto mb-2" />
              <div className="text-sm font-semibold text-emerald-300">All checks passed. Crypto-only MVP is fully operational.</div>
            </div>
          )}
        </div>
      )}
    </AdminLayout>
  );
}
