import { useState } from 'react';
import { AdminLayout } from '../../components/layout/AdminLayout';
import { useAuth } from '../../contexts/AuthContext';
import { Send, CheckCircle, XCircle, AlertTriangle } from 'lucide-react';
import { getFrontendSupabaseUrl } from '../../lib/supabaseEnv';

export default function TelegramTest() {
  const { session } = useAuth();
  const [result, setResult] = useState<{
    success: boolean;
    config?: { bot_token_configured: boolean; chat_id_configured: boolean };
    telegram_message_id?: string;
    error?: string;
  } | null>(null);
  const [loading, setLoading] = useState(false);

  async function sendTest() {
    if (!session) return;
    setLoading(true);
    setResult(null);
    try {
      const res = await fetch(
        `${getFrontendSupabaseUrl()}/functions/v1/telegram-test`,
        {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${session.access_token}`,
            'Content-Type': 'application/json',
          },
        }
      );
      const data = await res.json();
      setResult(data);
    } catch (e) {
      setResult({ success: false, error: e instanceof Error ? e.message : 'Network error' });
    }
    setLoading(false);
  }

  const tokenOk = result?.config?.bot_token_configured;
  const chatOk = result?.config?.chat_id_configured;

  return (
    <AdminLayout>
      <div className="mb-6">
        <h1 className="text-2xl font-bold">Telegram Verification</h1>
        <p className="text-sm text-zinc-500 mt-0.5">Test Telegram bot connectivity from the server side</p>
      </div>

      <div className="max-w-xl space-y-4">
        {/* Info */}
        <div className="bg-blue-500/10 border border-blue-500/20 rounded-xl p-4 flex gap-3">
          <AlertTriangle size={16} className="text-blue-400 mt-0.5 shrink-0" />
          <div className="text-sm text-blue-300">
            The bot token is <strong>never sent to the browser</strong>. All checks run server-side
            inside the <code className="text-xs bg-blue-900/30 px-1 py-0.5 rounded">telegram-test</code> Edge Function.
            Clicking the button below triggers a real Telegram API call from the server.
          </div>
        </div>

        {/* Config status */}
        {result?.config && (
          <div className="bg-zinc-900 border border-zinc-800 rounded-xl overflow-hidden">
            <div className="border-b border-zinc-800 px-5 py-3 text-sm font-semibold">Secret Configuration</div>
            <div className="divide-y divide-zinc-800">
              <ConfigRow
                label="TELEGRAM_BOT_TOKEN"
                ok={tokenOk ?? false}
                okText="Configured"
                failText="Not configured — add this secret in Supabase Edge Function settings"
              />
              <ConfigRow
                label="TELEGRAM_DEFAULT_CHANNEL_ID"
                ok={chatOk ?? false}
                okText="Configured"
                failText="Not configured — set your channel or chat ID"
              />
            </div>
          </div>
        )}

        {/* Send test */}
        <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-5">
          <div className="text-sm font-semibold mb-1">Send Test Message</div>
          <p className="text-xs text-zinc-500 mb-4">
            Sends "HashiBot Telegram connection test successful" to your configured channel.
            The delivery is logged in Telegram Delivery Logs.
          </p>
          <button
            onClick={sendTest}
            disabled={loading}
            className="inline-flex items-center gap-2 bg-blue-600 hover:bg-blue-500 disabled:opacity-60 text-white px-5 py-2.5 rounded-lg text-sm font-medium transition-colors"
          >
            {loading
              ? <><div className="w-3.5 h-3.5 border-2 border-white/30 border-t-white rounded-full animate-spin" /> Sending...</>
              : <><Send size={14} /> Send Test Message</>}
          </button>
        </div>

        {/* Result */}
        {result !== null && (
          <div className={`rounded-xl border p-5 ${result.success
            ? 'bg-emerald-500/10 border-emerald-500/20'
            : 'bg-red-500/10 border-red-500/20'}`}>
            <div className="flex items-center gap-2 mb-2">
              {result.success
                ? <CheckCircle size={16} className="text-emerald-400" />
                : <XCircle size={16} className="text-red-400" />}
              <span className={`font-semibold text-sm ${result.success ? 'text-emerald-400' : 'text-red-400'}`}>
                {result.success ? 'Test message sent successfully' : 'Test failed'}
              </span>
            </div>
            {result.success && result.telegram_message_id && (
              <p className="text-xs text-zinc-400">Telegram Message ID: <code className="text-zinc-300">{result.telegram_message_id}</code></p>
            )}
            {!result.success && result.error && (
              <p className="text-xs text-red-300">{result.error}</p>
            )}
          </div>
        )}

        {/* Setup instructions */}
        <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-5">
          <div className="text-sm font-semibold mb-3">Setup Instructions</div>
          <ol className="space-y-2 text-xs text-zinc-400">
            <li className="flex gap-2"><span className="text-zinc-600 shrink-0">1.</span> Create a bot via Telegram @BotFather. Copy the bot token.</li>
            <li className="flex gap-2"><span className="text-zinc-600 shrink-0">2.</span> Create a Telegram channel or group. Add your bot as an admin with post permission.</li>
            <li className="flex gap-2"><span className="text-zinc-600 shrink-0">3.</span> Get your channel chat ID: forward a message to @userinfobot, or use the Telegram API <code className="bg-zinc-800 px-1 rounded">getUpdates</code> method.</li>
            <li className="flex gap-2"><span className="text-zinc-600 shrink-0">4.</span> In Supabase dashboard → Edge Functions → Secrets, add: <code className="bg-zinc-800 px-1 rounded">TELEGRAM_BOT_TOKEN</code> and <code className="bg-zinc-800 px-1 rounded">TELEGRAM_DEFAULT_CHANNEL_ID</code>.</li>
            <li className="flex gap-2"><span className="text-zinc-600 shrink-0">5.</span> Return here and click "Send Test Message" to verify.</li>
          </ol>
        </div>
      </div>
    </AdminLayout>
  );
}

function ConfigRow({ label, ok, okText, failText }: {
  label: string; ok: boolean; okText: string; failText: string;
}) {
  return (
    <div className="flex items-start justify-between px-5 py-3 gap-4">
      <div className="flex-1 min-w-0">
        <code className="text-xs text-zinc-300">{label}</code>
        <p className="text-xs text-zinc-600 mt-0.5">{ok ? okText : failText}</p>
      </div>
      {ok
        ? <CheckCircle size={16} className="text-emerald-400 shrink-0 mt-0.5" />
        : <XCircle size={16} className="text-red-400 shrink-0 mt-0.5" />}
    </div>
  );
}
