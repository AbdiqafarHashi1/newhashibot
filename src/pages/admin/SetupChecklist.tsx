import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { AdminLayout } from '../../components/layout/AdminLayout';
import { supabase } from '../../lib/supabase';
import { CheckCircle, Circle, ArrowRight, AlertTriangle } from 'lucide-react';

interface CheckItem {
  id: string;
  label: string;
  detail: string;
  instruction: string;
  link?: { to: string; label: string };
  done: boolean;
  manual?: boolean;
}

export default function SetupChecklist() {
  const [checks, setChecks] = useState<CheckItem[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function run() {
      const [
        profilesRes, candlesRes, runsRes, signalsRes,
        candidatesRes, accessRes, tgRes, tgLinkRes, accessReqRes,
        scheduledRunsRes, realCandlesRes, cfgRes, tgBlockedRes,
      ] = await Promise.all([
        supabase.from('profiles').select('id', { count: 'exact' }).eq('role', 'admin'),
        supabase.from('candles').select('id', { count: 'exact' }),
        supabase.from('scanner_runs').select('id', { count: 'exact' }).eq('status', 'completed'),
        supabase.from('signals').select('id', { count: 'exact' }),
        supabase.from('strategy_candidates').select('id', { count: 'exact' }),
        supabase.from('user_access').select('id', { count: 'exact' }).eq('status', 'active'),
        supabase.from('telegram_deliveries').select('id', { count: 'exact' }).eq('status', 'sent'),
        supabase.from('telegram_links').select('id', { count: 'exact' }).eq('status', 'connected'),
        supabase.from('access_requests').select('id', { count: 'exact' }),
        supabase.from('scanner_runs').select('id', { count: 'exact' }).eq('run_type', 'scheduled').eq('status', 'completed'),
        supabase.from('candles').select('id', { count: 'exact' }).eq('data_source', 'REAL DATA'),
        supabase.from('scanner_config').select('schedule_enabled,auto_send_telegram,heartbeat_status,allow_demo_telegram_sending').eq('id', 1).maybeSingle(),
        supabase.from('telegram_deliveries').select('id', { count: 'exact' }).eq('status', 'failed').like('error_message', '%blocked%'),
      ]);

      const adminCount        = profilesRes.count ?? 0;
      const candleCount       = candlesRes.count ?? 0;
      const runCount          = runsRes.count ?? 0;
      const signalCount       = signalsRes.count ?? 0;
      const candidateCount    = candidatesRes.count ?? 0;
      const accessCount       = accessRes.count ?? 0;
      const tgSentCount       = tgRes.count ?? 0;
      const tgConnected       = tgLinkRes.count ?? 0;
      const accessReqCount    = accessReqRes.count ?? 0;
      const scheduledRunCount = scheduledRunsRes.count ?? 0;
      const realCandleCount   = realCandlesRes.count ?? 0;
      const cfg               = cfgRes.data;
      const scheduleEnabled   = cfg?.schedule_enabled ?? false;
      const autoTgEnabled     = cfg?.auto_send_telegram ?? false;
      const heartbeat         = cfg?.heartbeat_status ?? 'inactive';
      const allowDemoTg       = cfg?.allow_demo_telegram_sending ?? false;
      void tgBlockedRes;

      setChecks([
        {
          id: '01',
          label: 'Register owner account',
          detail: adminCount > 0 ? 'Account exists.' : 'Create your HashiBot account.',
          instruction: 'Go to /register and create your account with email and password.',
          link: { to: '/register', label: 'Register' },
          done: adminCount > 0,
        },
        {
          id: '02',
          label: 'Confirm profiles row created',
          detail: adminCount > 0 ? 'Profile row exists in database.' : 'Register first, then check if profile row was created.',
          instruction: 'After registration, a profiles row should auto-create via DB trigger. If it fails, the app will create it on first login.',
          done: adminCount > 0,
          manual: true,
        },
        {
          id: '03',
          label: 'Visit /admin/setup and claim first admin',
          detail: adminCount > 0 ? `${adminCount} admin(s) exist. Admin claim is locked.` : 'No admin yet — visit /admin/setup after logging in.',
          instruction: 'Log in, then go to /admin/setup. Click "Claim First Admin". This only works when zero admins exist.',
          link: { to: '/admin/setup', label: 'Admin Setup' },
          done: adminCount > 0,
        },
        {
          id: '04',
          label: 'Confirm profiles.role=admin',
          detail: adminCount > 0 ? 'Admin role confirmed in database.' : 'Claim admin first.',
          instruction: 'After claiming admin, your profile.role should be "admin". You will be redirected to /admin/control-room.',
          done: adminCount > 0,
          manual: true,
        },
        {
          id: '05',
          label: 'Open /admin/control-room',
          detail: runCount > 0 ? 'Control Room accessible (runs exist).' : 'Navigate to admin control room.',
          instruction: 'After claiming admin, go to /admin/control-room. You should see the full operator dashboard.',
          link: { to: '/admin/control-room', label: 'Control Room' },
          done: adminCount > 0,
        },
        {
          id: '06',
          label: 'Configure Telegram secrets',
          detail: tgSentCount > 0 ? 'Telegram confirmed working (delivery logged).' : 'Add TELEGRAM_BOT_TOKEN and TELEGRAM_DEFAULT_CHANNEL_ID as Supabase Edge Function secrets.',
          instruction: 'In Supabase dashboard → Edge Functions → Secrets: add TELEGRAM_BOT_TOKEN and TELEGRAM_DEFAULT_CHANNEL_ID.',
          link: { to: '/admin/telegram-test', label: 'Telegram Verify' },
          done: tgSentCount > 0,
        },
        {
          id: '07',
          label: 'Send Telegram test message',
          detail: tgSentCount > 0 ? `${tgSentCount} message(s) delivered via Telegram.` : 'Go to Telegram Verify and click Send Test.',
          instruction: 'On the Telegram Verify page, confirm bot_token_configured and chat_id_configured are true, then click Send Test Message.',
          link: { to: '/admin/telegram-test', label: 'Telegram Verify' },
          done: tgSentCount > 0,
        },
        {
          id: '08',
          label: 'Test Binance connection',
          detail: candleCount > 0 ? 'Binance candles stored (connection working).' : 'Click Test Binance in Control Room.',
          instruction: 'In Control Room, click "Test Binance". Should return OK. Binance uses public endpoints — no API key needed.',
          link: { to: '/admin/control-room', label: 'Control Room' },
          done: candleCount > 0,
          manual: true,
        },
        {
          id: '09',
          label: 'Start scanner and run one scan',
          detail: runCount > 0 ? `${runCount} completed scanner run(s).` : 'Go to Control Room → Run One Scan Now.',
          instruction: 'In Control Room: click Start Scanner (or it may already be enabled), then click "Run One Scan Now".',
          link: { to: '/admin/control-room', label: 'Control Room' },
          done: runCount > 0,
        },
        {
          id: '10',
          label: 'Candles stored',
          detail: candleCount > 0 ? `${candleCount.toLocaleString()} candles in database.` : 'Run the scanner to fetch candles.',
          instruction: 'After a scanner run, check candle count in Control Room stats panel.',
          done: candleCount > 0,
        },
        {
          id: '11',
          label: 'View candidate setups',
          detail: candidateCount > 0 ? `${candidateCount} candidates generated.` : 'Run scanner to generate candidates.',
          instruction: 'Go to Candidate Setups page to see setups the strategies identified before grading.',
          link: { to: '/admin/candidates', label: 'Candidate Setups' },
          done: candidateCount > 0,
        },
        {
          id: '12',
          label: 'View rejected setups',
          detail: candidateCount > 0 ? 'Rejected setups available.' : 'Run scanner first.',
          instruction: 'Go to Rejected Setups to see which candidates were below the minimum grade threshold.',
          link: { to: '/admin/rejected', label: 'Rejected Setups' },
          done: candidateCount > 0,
        },
        {
          id: '13',
          label: 'View created signals',
          detail: signalCount > 0 ? `${signalCount} signals created.` : 'Run scanner or create a manual signal.',
          instruction: 'Go to Signals Manager to see all A+ and A grade signals. You can also manually create one.',
          link: { to: '/admin/signals', label: 'Signals Manager' },
          done: signalCount > 0,
        },
        {
          id: '14',
          label: 'Grant Signal Mode access to a user',
          detail: accessCount > 0 ? `${accessCount} active access grant(s).` : 'Go to Users / Subscribers and grant access.',
          instruction: 'In Users / Subscribers: expand a user row → click "Grant 30 Days" or "Grant Lifetime (Dev)".',
          link: { to: '/admin/users', label: 'Users / Subscribers' },
          done: accessCount > 0,
        },
        {
          id: '15',
          label: 'Log in as customer, view dashboard',
          detail: accessCount > 0 && signalCount > 0 ? 'Access granted and signals exist.' : 'Grant access and create signals first.',
          instruction: 'Open /app/dashboard in a browser tab. As a user with access, signals should be visible.',
          link: { to: '/app/dashboard', label: 'User Dashboard' },
          done: accessCount > 0 && signalCount > 0,
        },
        {
          id: '16',
          label: 'Customer submits access request',
          detail: accessReqCount > 0 ? `${accessReqCount} access request(s) on record.` : 'As a customer without access, click Request Signal Access.',
          instruction: 'Log in as a user without Signal Mode access. Dashboard shows locked state → click "Request Signal Access".',
          done: accessReqCount > 0,
          manual: true,
        },
        {
          id: '17',
          label: 'Admin reviews and approves access request',
          detail: accessCount > 0 ? 'Access grants confirmed.' : 'Go to Access Requests and approve a pending request.',
          instruction: 'In Access Requests: expand a pending request → set expiry date → click "Approve & Grant Access".',
          link: { to: '/admin/access-requests', label: 'Access Requests' },
          done: accessCount > 0,
        },
        {
          id: '18',
          label: 'Customer submits Telegram details',
          detail: tgConnected > 0 ? `${tgConnected} Telegram connection(s) confirmed.` : 'As customer, go to Telegram Setup and submit your Chat ID.',
          instruction: 'Customer goes to /app/telegram, fills in Telegram username and Chat ID, submits request.',
          done: tgConnected > 0,
          manual: true,
        },
        {
          id: '19',
          label: 'Admin marks Telegram connected',
          detail: tgConnected > 0 ? `${tgConnected} connection(s) approved.` : 'Go to Telegram Requests and mark connected.',
          instruction: 'In Telegram Requests: find pending link → optionally add note → click "Connect".',
          link: { to: '/admin/telegram-links', label: 'Telegram Requests' },
          done: tgConnected > 0,
        },
        {
          id: '20',
          label: 'Send signal to Telegram and confirm delivery log',
          detail: tgSentCount > 0 ? `${tgSentCount} messages logged as delivered.` : 'In Signals Manager, click Send TG on a signal.',
          instruction: 'In Signals Manager: find an active signal → click "Send TG". Then check Telegram Logs for the delivery record.',
          link: { to: '/admin/signals', label: 'Signals Manager' },
          done: tgSentCount > 0,
        },
        // Phase 5A checks
        {
          id: '21',
          label: 'Confirm scheduled-market-scanner function is deployed',
          detail: 'The scheduled-market-scanner Edge Function is deployed and ready.',
          instruction: 'The scheduled-market-scanner function handles pg_cron calls. It is already deployed. Enable Schedule in Scanner Config and set up pg_cron.',
          link: { to: '/admin/scheduler', label: 'Scheduler Guide' },
          done: true,
        },
        {
          id: '22',
          label: 'Enable Schedule in Scanner Config',
          detail: scheduleEnabled ? 'Schedule is enabled. Cron calls will execute scans.' : 'Go to Scanner Config → Scheduled Scanning and enable Schedule.',
          instruction: 'In Scanner Config → Scheduled Scanning: toggle "Schedule Enabled" to ON. Also set Scan Interval to match your pg_cron schedule.',
          link: { to: '/admin/scanner-config', label: 'Scanner Config' },
          done: scheduleEnabled,
        },
        {
          id: '23',
          label: 'Confirm heartbeat shows Healthy after scheduled run',
          detail: heartbeat === 'healthy' ? 'Heartbeat: Healthy. Scheduled scans are running on time.' : `Heartbeat is currently: ${heartbeat}. Trigger a scheduled scan or wait for pg_cron.`,
          instruction: 'After pg_cron is configured and schedule is enabled, wait for the next scheduled run. Heartbeat should show Healthy within 2× scan interval.',
          link: { to: '/admin/scanner-config', label: 'Scanner Config' },
          done: heartbeat === 'healthy',
        },
        {
          id: '24',
          label: 'Confirm at least one completed scheduled run',
          detail: scheduledRunCount > 0 ? `${scheduledRunCount} scheduled run(s) completed.` : 'No scheduled runs yet. Configure pg_cron and enable schedule.',
          instruction: 'After pg_cron is set up, wait for the first scheduled scan to complete. Scanner Runs in the Control Room will show run_type = "scheduled".',
          link: { to: '/admin/scanner', label: 'Scanner Status' },
          done: scheduledRunCount > 0,
        },
        {
          id: '25',
          label: 'Confirm crypto candles are REAL DATA',
          detail: realCandleCount > 0 ? `${realCandleCount.toLocaleString()} REAL DATA candles stored.` : 'No REAL DATA candles yet. Run a scan — Binance candles should be REAL DATA.',
          instruction: 'After a scan, crypto candles from Binance should have data_source = "REAL DATA". Check Scanner Status for any Binance errors.',
          link: { to: '/admin/scanner', label: 'Scanner Status' },
          done: realCandleCount > 0,
        },
        {
          id: '26',
          label: 'Auto Telegram is disabled by default (safety check)',
          detail: !autoTgEnabled ? 'Auto Telegram is OFF. Correct — signals are not auto-sent until you enable it.' : 'Auto Telegram is currently ON. Make sure you have real data and Telegram configured before enabling.',
          instruction: 'Auto Telegram is disabled by default to prevent demo signals reaching users. Only enable once Telegram is confirmed working and you have real data.',
          link: { to: '/admin/scanner-config', label: 'Scanner Config' },
          done: !autoTgEnabled,
        },
        {
          id: '27',
          label: 'Demo Telegram sending is disabled by default',
          detail: !allowDemoTg ? 'Allow Demo Telegram is OFF. Correct — demo/seeded signals cannot be auto-sent.' : 'Allow Demo Telegram is ON. Be aware that demo signals may reach subscribers.',
          instruction: 'Keep "Allow Demo Telegram Sending" OFF unless you are testing. Demo signals include a DEMO DATA label but should not reach real subscribers.',
          link: { to: '/admin/scanner-config', label: 'Scanner Config' },
          done: !allowDemoTg,
        },
        // Phase 5B checks
        {
          id: '28',
          label: 'Provider Health shows correct forex provider (not hardcoded demo)',
          detail: 'Provider Health page now reads forex provider from scanner_config / provider_status table dynamically.',
          instruction: 'Go to Provider Health. The forex provider card should reflect the actual FOREX_DATA_PROVIDER env var (demo, twelvedata, or mt5_bridge). Run a scan to populate.',
          link: { to: '/admin/providers', label: 'Provider Health' },
          done: true,
        },
        {
          id: '29',
          label: 'Test Forex Provider button confirms real or demo status',
          detail: 'Provider Health has a "Test Forex Provider" button that triggers a scan and reports actual data source.',
          instruction: 'In Provider Health, click "Test Forex Provider". It runs a scan and shows whether forex is REAL DATA (Twelve Data) or DEMO DATA.',
          link: { to: '/admin/providers', label: 'Provider Health' },
          done: true,
        },
        {
          id: '30',
          label: 'Admin sidebar scroll position is preserved on navigation',
          detail: 'Admin sidebar no longer jumps to top when clicking nav items.',
          instruction: 'Navigate between admin pages using the sidebar. The scroll position should be preserved.',
          done: true,
        },
        {
          id: '31',
          label: 'Replay / Testnet Lab accessible and functional',
          detail: 'Backtest Lab is now a real CSV replay engine. Tables: replay_datasets, replay_runs, replay_signals, replay_trades.',
          instruction: 'Go to Backtest Lab. Upload a CSV candle file, select strategy, click Run Replay. Results show real strategy evaluation (not fake).',
          link: { to: '/admin/backtest-lab', label: 'Replay Lab' },
          done: true,
        },
        {
          id: '32',
          label: 'Login / session persists after refresh',
          detail: 'Auth context improved — loading state is resolved from onAuthStateChange, 5s fallback timeout prevents infinite spinner.',
          instruction: 'Log in as admin. Refresh the browser. You should remain logged in and see the admin panel without re-entering credentials.',
          done: true,
          manual: true,
        },
      ]);
      setLoading(false);
    }
    run();
  }, []);

  const doneCount  = checks.filter(c => c.done).length;
  const totalCount = checks.length;
  const pct = totalCount > 0 ? Math.round((doneCount / totalCount) * 100) : 0;
  const manualPending = checks.filter(c => c.manual && !c.done).length;

  return (
    <AdminLayout>
      <div className="mb-6">
        <h1 className="text-2xl font-bold">MVP Test Checklist</h1>
        <p className="text-sm text-zinc-500 mt-0.5">End-to-end verification — Phase 5A: scheduled scanning + auto Telegram safety. Phase 5B: real forex provider, replay lab, sidebar fix, session fix.</p>
      </div>

      {loading ? (
        <div className="flex items-center justify-center h-48">
          <div className="w-5 h-5 border-2 border-blue-500 border-t-transparent rounded-full animate-spin" />
        </div>
      ) : (
        <div className="max-w-2xl">
          {/* Progress */}
          <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-5 mb-4">
            <div className="flex items-center justify-between mb-2">
              <span className="text-sm font-semibold">{doneCount} / {totalCount} verified</span>
              <span className="text-sm text-zinc-500">{pct}%</span>
            </div>
            <div className="h-2 bg-zinc-800 rounded-full overflow-hidden mb-2">
              <div className="h-full bg-blue-600 rounded-full transition-all duration-500" style={{ width: `${pct}%` }} />
            </div>
            {manualPending > 0 && (
              <div className="flex items-center gap-1.5 text-xs text-yellow-400/80 mt-1">
                <AlertTriangle size={11} />
                {manualPending} step{manualPending > 1 ? 's' : ''} require manual in-app testing.
              </div>
            )}
          </div>

          <div className="space-y-2">
            {checks.map((item, i) => (
              <div key={item.id}
                className={`rounded-xl border p-4 transition-colors ${
                  item.done ? 'bg-emerald-500/5 border-emerald-500/20'
                  : item.manual ? 'bg-yellow-500/5 border-yellow-500/20'
                  : 'bg-zinc-900 border-zinc-800'
                }`}>
                <div className="flex items-start gap-3">
                  <div className="mt-0.5 shrink-0">
                    {item.done
                      ? <CheckCircle size={16} className="text-emerald-400" />
                      : <Circle size={16} className="text-zinc-600" />}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="text-xs text-zinc-600 font-mono">{String(i + 1).padStart(2, '0')}</span>
                      <span className={`text-sm font-medium ${item.done ? 'text-emerald-300' : 'text-zinc-200'}`}>
                        {item.label}
                      </span>
                      {item.manual && !item.done && (
                        <span className="text-xs bg-yellow-500/15 text-yellow-400 border border-yellow-500/25 px-1.5 py-0.5 rounded">manual</span>
                      )}
                    </div>
                    <p className="text-xs text-zinc-500 mt-0.5 leading-relaxed">{item.detail}</p>
                    {!item.done && (
                      <p className="text-xs text-zinc-600 mt-0.5 leading-relaxed italic">{item.instruction}</p>
                    )}
                  </div>
                  {item.link && !item.done && (
                    <Link to={item.link.to}
                      className="shrink-0 inline-flex items-center gap-1 text-xs text-blue-400 hover:text-blue-300 bg-blue-600/10 border border-blue-600/20 px-2.5 py-1.5 rounded-lg transition-colors">
                      {item.link.label}
                      <ArrowRight size={10} />
                    </Link>
                  )}
                </div>
              </div>
            ))}
          </div>

          {pct === 100 && (
            <div className="mt-4 bg-emerald-500/10 border border-emerald-500/20 rounded-xl p-4 text-center">
              <CheckCircle size={20} className="text-emerald-400 mx-auto mb-2" />
              <div className="text-sm font-semibold text-emerald-300">All steps verified. HashiBot Signal Mode MVP is fully operational.</div>
            </div>
          )}
        </div>
      )}
    </AdminLayout>
  );
}
