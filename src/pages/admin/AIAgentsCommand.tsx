import { useState, useEffect } from 'react';
import { AdminLayout } from '../../components/layout/AdminLayout';
import { supabase } from '../../lib/supabase';
import {
  Bot, Sparkles, Send, MessageSquare, TrendingUp, Copy, Check,
  RefreshCw, MapPin, CheckCircle2, Settings2, Plus, Trash2,
  Eye, EyeOff, Radio, ShieldCheck, ImageIcon, X
} from 'lucide-react';
import hubPreviewImg from '../../assets/images/ai_agents_hub_preview_1787772786427.jpg';

interface TelegramChannelConfig {
  id: string;
  name: string;
  chatId: string; // e.g. @HashiKenyaForex or -1001234567890
  type: 'public_marketing' | 'free_signals' | 'vip_forex' | 'vip_crypto';
}

export default function AIAgentsCommand() {
  const [activeTab, setActiveTab] = useState<'marketing' | 'pulse' | 'advisor' | 'alpha' | 'channels'>('marketing');
  const [copiedIndex, setCopiedIndex] = useState<string | null>(null);
  const [showScreenshotModal, setShowScreenshotModal] = useState(false);

  // Telegram Dispatcher Configuration
  const [botToken, setBotToken] = useState<string>(() => localStorage.getItem('hashibot_telegram_bot_token') || '');
  const [showBotToken, setShowBotToken] = useState(false);
  const [channels, setChannels] = useState<TelegramChannelConfig[]>(() => {
    const saved = localStorage.getItem('hashibot_telegram_channels');
    if (saved) {
      try { return JSON.parse(saved); } catch { /* ignore */ }
    }
    return [
      { id: '1', name: '🇰🇪 Kenya Forex & MT5 Open Group', chatId: '@HashiBotKenya', type: 'public_marketing' },
      { id: '2', name: '📢 Free VIP Signals Channel', chatId: '@HashiBotSignals', type: 'free_signals' },
      { id: '3', name: '💎 VIP MT5 Prop Pass Desk', chatId: '-1002345678901', type: 'vip_forex' },
      { id: '4', name: '⚡ VIP Crypto Futures VIP', chatId: '-1003456789012', type: 'vip_crypto' },
    ];
  });

  const [selectedBroadcastChannelId, setSelectedBroadcastChannelId] = useState<string>('all');
  const [broadcastStatus, setBroadcastStatus] = useState<{ loading: boolean; message?: string; success?: boolean }>({ loading: false });

  // New Channel Input Form State
  const [newChannelName, setNewChannelName] = useState('');
  const [newChannelId, setNewChannelId] = useState('');
  const [newChannelType, setNewChannelType] = useState<'public_marketing' | 'free_signals' | 'vip_forex' | 'vip_crypto'>('public_marketing');

  // Agent 1: Marketing / Outreach State
  const [marketingNiche, setMarketingNiche] = useState<string>('kenya_forex');
  const [websiteUrl, setWebsiteUrl] = useState<string>(window.location.origin);
  const [telegramChannelUrl, setTelegramChannelUrl] = useState<string>('https://t.me/HashiBotSignals');
  const [adminTelegramContact, setAdminTelegramContact] = useState<string>('@HashiAdmin');
  const [marketingResult, setMarketingResult] = useState<string>('');
  const [marketingLoading, setMarketingLoading] = useState(false);

  // Agent 2: Market Pulse State
  const [pulseAssets, setPulseAssets] = useState<string>('XAUUSD, EURUSD, BTCUSDT, ETHUSDT');
  const [pulseTone, setPulseTone] = useState<'institutional' | 'community' | 'urgent_alpha'>('institutional');
  const [pulseResult, setPulseResult] = useState<string>('');
  const [pulseLoading, setPulseLoading] = useState(false);

  // Agent 3: VIP Advisor State
  const [customers, setCustomers] = useState<Array<{ id: string; email: string; full_name?: string; package_name?: string }>>([]);
  const [selectedCustomerId, setSelectedCustomerId] = useState<string>('');
  const [advisorQuestion, setAdvisorQuestion] = useState<string>('What is my current drawdown risk, and should I adjust my lot size for the NY session?');
  const [advisorResult, setAdvisorResult] = useState<string>('');
  const [advisorLoading, setAdvisorLoading] = useState(false);

  // Agent 4: Early Alpha State
  const [alphaSectors, setAlphaSectors] = useState<string>('AI Agents in Crypto, Solana Ecosystem, Layer 1 Micro-caps');
  const [alphaResult, setAlphaResult] = useState<string>('');
  const [alphaLoading, setAlphaLoading] = useState(false);

  // Save Telegram Settings
  useEffect(() => {
    localStorage.setItem('hashibot_telegram_bot_token', botToken);
  }, [botToken]);

  useEffect(() => {
    localStorage.setItem('hashibot_telegram_channels', JSON.stringify(channels));
  }, [channels]);

  // Load Customers for Advisor Demo
  useEffect(() => {
    supabase
      .from('customer_subscriptions')
      .select('id, email, full_name, package_name')
      .then(({ data }) => {
        if (data && data.length > 0) {
          setCustomers(data);
          setSelectedCustomerId(data[0].id);
        }
      });
  }, []);

  const handleCopy = (text: string, id: string) => {
    navigator.clipboard.writeText(text);
    setCopiedIndex(id);
    setTimeout(() => setCopiedIndex(null), 2000);
  };

  // Add Channel
  const handleAddChannel = () => {
    if (!newChannelName || !newChannelId) return;
    const item: TelegramChannelConfig = {
      id: Date.now().toString(),
      name: newChannelName,
      chatId: newChannelId.startsWith('@') || newChannelId.startsWith('-') ? newChannelId : `@${newChannelId}`,
      type: newChannelType,
    };
    setChannels(prev => [...prev, item]);
    setNewChannelName('');
    setNewChannelId('');
  };

  // Remove Channel
  const handleRemoveChannel = (id: string) => {
    setChannels(prev => prev.filter(c => c.id !== id));
  };

  // Deliberately fail closed: editorial agents may draft content, but only the
  // backend router may approve, route, deduplicate, and record a publication.
  const handleBroadcastToTelegram = async (messageText: string) => {
    if (!messageText) return;
    setBroadcastStatus({ loading: false, success: false, message: 'Direct broadcasts are disabled. Submit approved content through the backend Telegram publication router.' });

    setTimeout(() => {
      setBroadcastStatus(prev => ({ ...prev, message: undefined }));
    }, 6000);
  };

  // 1. Generate Marketing Campaign via Server-side Gemini API
  const handleGenerateMarketing = async () => {
    setMarketingLoading(true);
    try {
      const site = websiteUrl || window.location.origin;
      const tg = telegramChannelUrl || 'https://t.me/HashiBotSignals';
      const dm = adminTelegramContact || '@HashiAdmin';

      const res = await fetch('/api/ai/marketing', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          niche: marketingNiche,
          websiteUrl: site,
          telegramChannelUrl: tg,
          adminContact: dm,
        }),
      });

      if (!res.ok) {
        throw new Error(`AI Gateway responded with status: ${res.status}`);
      }

      const data = await res.json();
      if (data.text) {
        setMarketingResult(data.text);
      } else {
        throw new Error(data.error || 'Empty response from Gemini');
      }
    } catch (err: unknown) {
      console.error('Marketing AI generation failed:', err);
      setMarketingResult(`⚠️ Generation failed: ${(err as Error).message}. Check server Gemini API configuration.`);
    } finally {
      setMarketingLoading(false);
    }
  };

  // 2. Generate Market Pulse via Server-side Gemini API
  const handleGeneratePulse = async () => {
    setPulseLoading(true);
    try {
      const now = new Date();
      const eatHour = (now.getUTCHours() + 3) % 24;
      const res = await fetch('/api/ai/pulse', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          assets: pulseAssets,
          tone: pulseTone,
          websiteUrl: websiteUrl || window.location.origin,
          currentSession: `${eatHour}:00 EAT Session`,
        }),
      });

      if (!res.ok) {
        throw new Error(`AI Gateway responded with status: ${res.status}`);
      }

      const data = await res.json();
      if (data.text) {
        setPulseResult(data.text);
      } else {
        throw new Error(data.error || 'Empty response from Gemini');
      }
    } catch (err: unknown) {
      console.error('Market Pulse generation failed:', err);
      setPulseResult(`⚠️ Pulse generation error: ${(err as Error).message}`);
    } finally {
      setPulseLoading(false);
    }
  };

  // 3. Consult VIP Advisor via Server-side Gemini API
  const handleConsultAdvisor = async () => {
    setAdvisorLoading(true);
    try {
      const selected = customers.find(c => c.id === selectedCustomerId) || customers[0];
      const res = await fetch('/api/ai/advisor', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          customerProfile: selected || { full_name: 'VIP Trader', package_name: 'MT5 Prop Challenge' },
          question: advisorQuestion,
        }),
      });

      if (!res.ok) {
        throw new Error(`AI Gateway responded with status: ${res.status}`);
      }

      const data = await res.json();
      if (data.text) {
        setAdvisorResult(data.text);
      } else {
        throw new Error(data.error || 'Empty response from Gemini');
      }
    } catch (err: unknown) {
      console.error('Advisor generation error:', err);
      setAdvisorResult(`⚠️ Advisor consultation error: ${(err as Error).message}`);
    } finally {
      setAdvisorLoading(false);
    }
  };

  // 4. Generate Early Alpha via Server-side Gemini API
  const handleGenerateAlpha = async () => {
    setAlphaLoading(true);
    try {
      const res = await fetch('/api/ai/alpha', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          sectors: alphaSectors,
        }),
      });

      if (!res.ok) {
        throw new Error(`AI Gateway responded with status: ${res.status}`);
      }

      const data = await res.json();
      if (data.text) {
        setAlphaResult(data.text);
      } else {
        throw new Error(data.error || 'Empty response from Gemini');
      }
    } catch (err: unknown) {
      console.error('Alpha generation error:', err);
      setAlphaResult(`⚠️ Alpha scout error: ${(err as Error).message}`);
    } finally {
      setAlphaLoading(false);
    }
  };

  return (
    <AdminLayout>
      <div className="space-y-6 pb-20 max-w-6xl mx-auto">
        
        {/* Header */}
        <div className="border-b border-zinc-800 pb-5">
          <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
            <div className="flex items-center gap-3">
              <div className="p-3 rounded-2xl bg-gradient-to-br from-indigo-500/20 to-purple-500/20 border border-indigo-500/30 text-indigo-400">
                <Bot className="w-7 h-7" />
              </div>
              <div>
                <h1 className="text-2xl font-bold text-white tracking-tight flex items-center gap-2.5">
                  AI Agents Operations Hub
                  <span className="text-xs font-mono font-medium px-2 py-0.5 rounded-full bg-indigo-500/20 text-indigo-300 border border-indigo-500/40">
                    Google Gemini 2.5 Engine
                  </span>
                </h1>
                <p className="text-sm text-zinc-400">
                  Autonomous Marketing, Telegram Channel Analyst, VIP 1-on-1 Account Advisor & Early Alpha Scout
                </p>
              </div>
            </div>

            <div className="flex items-center gap-2">
              <button
                onClick={() => setShowScreenshotModal(true)}
                className="px-3.5 py-1.5 rounded-xl bg-indigo-600/20 hover:bg-indigo-600/30 border border-indigo-500/40 text-xs text-indigo-300 flex items-center gap-2 transition-all"
              >
                <ImageIcon className="w-3.5 h-3.5 text-indigo-400" />
                <span>View Dashboard Snapshot</span>
              </button>

              <button
                onClick={() => setActiveTab('channels')}
                className="px-3.5 py-1.5 rounded-xl bg-zinc-900 hover:bg-zinc-800 border border-zinc-800 text-xs text-zinc-200 flex items-center gap-2 transition-all"
              >
                <Settings2 className="w-3.5 h-3.5 text-indigo-400" />
                <span>Configure Telegram Bot & Channels ({channels.length})</span>
              </button>

              <div className="px-3 py-1.5 rounded-xl bg-zinc-900 border border-zinc-800 text-xs text-zinc-300 flex items-center gap-2">
                <MapPin className="w-3.5 h-3.5 text-emerald-400" />
                <span>Focus: <strong>Kenya (EAT) & Global</strong></span>
              </div>
            </div>
          </div>
        </div>

        {/* Global Broadcast Status Banner */}
        {broadcastStatus.message && (
          <div
            className={`p-3.5 rounded-xl text-xs flex items-center justify-between gap-2 border animate-in fade-in duration-200 ${
              broadcastStatus.success
                ? 'bg-emerald-500/10 border-emerald-500/30 text-emerald-300'
                : 'bg-rose-500/10 border-rose-500/30 text-rose-300'
            }`}
          >
            <div className="flex items-center gap-2">
              {broadcastStatus.success ? <CheckCircle2 className="w-4 h-4 text-emerald-400" /> : <ShieldCheck className="w-4 h-4 text-rose-400" />}
              <span>{broadcastStatus.message}</span>
            </div>
          </div>
        )}

        {/* Tab Selection */}
        <div className="grid grid-cols-2 sm:grid-cols-5 gap-2.5 bg-zinc-950 p-1.5 rounded-2xl border border-zinc-800">
          <button
            onClick={() => setActiveTab('marketing')}
            className={`flex items-center justify-center gap-2 py-2.5 px-3 rounded-xl text-xs font-semibold transition-all ${
              activeTab === 'marketing'
                ? 'bg-blue-600 text-white shadow-md shadow-blue-600/30'
                : 'text-zinc-400 hover:text-zinc-200 hover:bg-zinc-900/60'
            }`}
          >
            <Send className="w-4 h-4" />
            Kenya & Global Outreach
          </button>

          <button
            onClick={() => setActiveTab('pulse')}
            className={`flex items-center justify-center gap-2 py-2.5 px-3 rounded-xl text-xs font-semibold transition-all ${
              activeTab === 'pulse'
                ? 'bg-emerald-600 text-white shadow-md shadow-emerald-600/30'
                : 'text-zinc-400 hover:text-zinc-200 hover:bg-zinc-900/60'
            }`}
          >
            <TrendingUp className="w-4 h-4" />
            Telegram Channel Pulse
          </button>

          <button
            onClick={() => setActiveTab('advisor')}
            className={`flex items-center justify-center gap-2 py-2.5 px-3 rounded-xl text-xs font-semibold transition-all ${
              activeTab === 'advisor'
                ? 'bg-indigo-600 text-white shadow-md shadow-indigo-600/30'
                : 'text-zinc-400 hover:text-zinc-200 hover:bg-zinc-900/60'
            }`}
          >
            <MessageSquare className="w-4 h-4" />
            VIP 1-on-1 Account Advisor
          </button>

          <button
            onClick={() => setActiveTab('alpha')}
            className={`flex items-center justify-center gap-2 py-2.5 px-3 rounded-xl text-xs font-semibold transition-all ${
              activeTab === 'alpha'
                ? 'bg-purple-600 text-white shadow-md shadow-purple-600/30'
                : 'text-zinc-400 hover:text-zinc-200 hover:bg-zinc-900/60'
            }`}
          >
            <Sparkles className="w-4 h-4" />
            Early Crypto Alpha Scout
          </button>

          <button
            onClick={() => setActiveTab('channels')}
            className={`flex items-center justify-center gap-2 py-2.5 px-3 rounded-xl text-xs font-semibold transition-all ${
              activeTab === 'channels'
                ? 'bg-zinc-800 text-white shadow-md shadow-zinc-800/40 border border-zinc-700'
                : 'text-zinc-400 hover:text-zinc-200 hover:bg-zinc-900/60'
            }`}
          >
            <Radio className="w-4 h-4 text-emerald-400" />
            Channels & Bot Setup
          </button>
        </div>

        {/* Tab 5: Telegram Channels & Bot Setup */}
        {activeTab === 'channels' && (
          <div className="space-y-6">
            <div className="p-6 rounded-2xl bg-zinc-900/70 border border-zinc-800 space-y-6">
              <div>
                <h2 className="text-lg font-bold text-white flex items-center gap-2">
                  <Radio className="w-5 h-5 text-emerald-400" />
                  Telegram Channels & Bot Dispatcher Settings
                </h2>
                <p className="text-xs text-zinc-400 mt-1">
                  Connect your Telegram Bot Token and add your target public/private channel IDs. The AI agents will automatically broadcast messages directly into these channels.
                </p>
              </div>

              {/* Bot Token Configuration */}
              <div className="p-4 rounded-xl bg-zinc-950 border border-zinc-800/80 space-y-3">
                <label className="text-xs font-bold text-white flex items-center justify-between">
                  <span>Telegram Bot Token (from @BotFather)</span>
                  <span className="text-[11px] text-zinc-500 font-normal">Stored locally in your browser</span>
                </label>
                <div className="relative flex items-center">
                  <input
                    type={showBotToken ? 'text' : 'password'}
                    value={botToken}
                    onChange={e => setBotToken(e.target.value)}
                    placeholder="e.g. 7123456789:AAFlmQk... (Get from @BotFather on Telegram)"
                    className="w-full bg-zinc-900 border border-zinc-800 rounded-xl px-3.5 py-2.5 text-xs text-white font-mono pr-10 focus:outline-none focus:border-indigo-500"
                  />
                  <button
                    type="button"
                    onClick={() => setShowBotToken(!showBotToken)}
                    className="absolute right-3 text-zinc-500 hover:text-zinc-300"
                  >
                    {showBotToken ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                  </button>
                </div>
                <p className="text-[11px] text-zinc-500 leading-relaxed">
                  💡 <strong>How to get it:</strong> Open Telegram, message <a href="https://t.me/BotFather" target="_blank" rel="noreferrer" className="text-indigo-400 underline">@BotFather</a>, send <code className="text-zinc-300">/newbot</code>, and copy the API token given. Then make your bot an <strong>Administrator</strong> in your target channels.
                </p>
              </div>

              {/* Channels List */}
              <div className="space-y-4">
                <div className="flex items-center justify-between">
                  <h3 className="text-xs font-bold text-zinc-300">Active Telegram Channels & Open Groups</h3>
                  <span className="text-xs text-zinc-500">{channels.length} Configured</span>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                  {channels.map(channel => (
                    <div key={channel.id} className="p-3.5 rounded-xl bg-zinc-950 border border-zinc-800 flex items-center justify-between">
                      <div>
                        <div className="font-semibold text-xs text-white flex items-center gap-1.5">
                          {channel.name}
                        </div>
                        <div className="text-[11px] font-mono text-emerald-400 mt-0.5">
                          {channel.chatId}
                        </div>
                      </div>
                      <button
                        onClick={() => handleRemoveChannel(channel.id)}
                        className="p-1.5 rounded-lg text-zinc-500 hover:text-rose-400 hover:bg-rose-500/10 transition-all"
                        title="Remove Channel"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  ))}
                </div>

                {/* Add New Channel */}
                <div className="p-4 rounded-xl bg-zinc-950/60 border border-zinc-800/80 space-y-3">
                  <h4 className="text-xs font-bold text-zinc-300 flex items-center gap-1.5">
                    <Plus className="w-4 h-4 text-indigo-400" /> Add New Telegram Channel / Group
                  </h4>
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 text-xs">
                    <div>
                      <label className="text-zinc-400 block mb-1">Channel Label</label>
                      <input
                        type="text"
                        value={newChannelName}
                        onChange={e => setNewChannelName(e.target.value)}
                        placeholder="e.g. Kenya FX Telegram"
                        className="w-full bg-zinc-900 border border-zinc-800 rounded-xl px-3 py-2 text-white focus:outline-none focus:border-indigo-500"
                      />
                    </div>
                    <div>
                      <label className="text-zinc-400 block mb-1">Chat ID or Username</label>
                      <input
                        type="text"
                        value={newChannelId}
                        onChange={e => setNewChannelId(e.target.value)}
                        placeholder="e.g. @YourChannel or -100..."
                        className="w-full bg-zinc-900 border border-zinc-800 rounded-xl px-3 py-2 text-white font-mono focus:outline-none focus:border-indigo-500"
                      />
                    </div>
                    <div>
                      <label className="text-zinc-400 block mb-1">Channel Type</label>
                      <select
                        value={newChannelType}
                        onChange={e => setNewChannelType(e.target.value as 'public_marketing' | 'free_signals' | 'vip_forex' | 'vip_crypto')}
                        className="w-full bg-zinc-900 border border-zinc-800 rounded-xl px-3 py-2 text-white focus:outline-none focus:border-indigo-500"
                      >
                        <option value="public_marketing">Public Marketing / Outreach</option>
                        <option value="free_signals">Free Community Signals</option>
                        <option value="vip_forex">VIP MT5 / Prop Pass</option>
                        <option value="vip_crypto">VIP Crypto Futures</option>
                      </select>
                    </div>
                  </div>
                  <div className="flex justify-end">
                    <button
                      onClick={handleAddChannel}
                      className="flex items-center gap-1.5 px-4 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-semibold transition-all"
                    >
                      <Plus className="w-4 h-4" /> Save Channel
                    </button>
                  </div>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Tab 1: Marketing & Group Outreach Agent */}
        {activeTab === 'marketing' && (
          <div className="space-y-6">
            <div className="p-6 rounded-2xl bg-zinc-900/70 border border-zinc-800 space-y-5">
              <div className="flex items-start justify-between">
                <div>
                  <h2 className="text-lg font-bold text-white flex items-center gap-2">
                    <Send className="w-5 h-5 text-blue-400" />
                    Automated Telegram Marketing & Outreach Agent
                  </h2>
                  <p className="text-xs text-zinc-400 mt-1">
                    Generates viral, conversion-tested promotional copy tailored for Kenyan Forex/Crypto communities, prop challenge groups, and gold scalpers.
                  </p>
                </div>
                <span className="text-[11px] font-mono px-2 py-1 rounded bg-blue-500/10 text-blue-400 border border-blue-500/30">
                  Target: Kenya & Global Groups
                </span>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-xs">
                <div>
                  <label className="text-zinc-400 block mb-1.5 font-medium">Target Community Niche</label>
                  <select
                    value={marketingNiche}
                    onChange={e => setMarketingNiche(e.target.value)}
                    className="w-full bg-zinc-950 border border-zinc-800 rounded-xl px-3.5 py-2.5 text-white focus:outline-none focus:border-blue-500"
                  >
                    <option value="kenya_forex">Kenyan Forex & Gold Traders (Nairobi / M-Pesa / MT5)</option>
                    <option value="kenya_crypto">Kenyan Crypto Traders (Binance P2P, Bybit, USDT, BTC)</option>
                    <option value="prop_firm_challengers">Prop Firm Challengers (FTMO, FundedNext, 5% Rule)</option>
                    <option value="gold_scalpers">XAUUSD / Gold Precision Scalpers (London/NY Liquidity)</option>
                  </select>
                </div>

                <div>
                  <label className="text-zinc-400 block mb-1.5 font-medium">Your Website Link</label>
                  <input
                    type="text"
                    value={websiteUrl}
                    onChange={e => setWebsiteUrl(e.target.value)}
                    className="w-full bg-zinc-950 border border-zinc-800 rounded-xl px-3.5 py-2.5 text-white font-mono focus:outline-none focus:border-blue-500"
                  />
                </div>

                <div>
                  <label className="text-zinc-400 block mb-1.5 font-medium">Your Free Telegram Channel Link</label>
                  <input
                    type="text"
                    value={telegramChannelUrl}
                    onChange={e => setTelegramChannelUrl(e.target.value)}
                    placeholder="https://t.me/YourFreeChannel"
                    className="w-full bg-zinc-950 border border-zinc-800 rounded-xl px-3.5 py-2.5 text-white font-mono focus:outline-none focus:border-blue-500"
                  />
                </div>

                <div>
                  <label className="text-zinc-400 block mb-1.5 font-medium">Your Telegram Username / Admin DM for Direct Sales</label>
                  <input
                    type="text"
                    value={adminTelegramContact}
                    onChange={e => setAdminTelegramContact(e.target.value)}
                    placeholder="@YourTelegramUsername"
                    className="w-full bg-zinc-950 border border-zinc-800 rounded-xl px-3.5 py-2.5 text-white font-mono focus:outline-none focus:border-blue-500"
                  />
                </div>
              </div>

              <div className="flex justify-end pt-2">
                <button
                  onClick={handleGenerateMarketing}
                  disabled={marketingLoading}
                  className="flex items-center gap-2 px-5 py-2.5 rounded-xl bg-blue-600 hover:bg-blue-500 text-white text-xs font-semibold transition-all shadow-lg shadow-blue-600/20 disabled:opacity-50"
                >
                  {marketingLoading ? <RefreshCw className="w-4 h-4 animate-spin" /> : <Sparkles className="w-4 h-4" />}
                  Generate High-Converting Outreach Copy
                </button>
              </div>

              {marketingResult && (
                <div className="p-4 rounded-xl bg-zinc-950 border border-zinc-800 space-y-4 animate-in fade-in duration-200">
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-zinc-800/80 pb-3">
                    <span className="text-xs font-bold text-emerald-400 flex items-center gap-1.5">
                      <CheckCircle2 className="w-4 h-4" /> Ready-to-Broadcast Promotional Copy
                    </span>

                    {/* Direct Broadcast Controls */}
                    <div className="flex items-center gap-2">
                      <select
                        value={selectedBroadcastChannelId}
                        onChange={e => setSelectedBroadcastChannelId(e.target.value)}
                        className="bg-zinc-900 border border-zinc-700 text-zinc-200 text-xs rounded-lg px-2.5 py-1 focus:outline-none"
                      >
                        <option value="all">📢 All Configured Channels ({channels.length})</option>
                        {channels.map(c => (
                          <option key={c.id} value={c.id}>{c.name} ({c.chatId})</option>
                        ))}
                      </select>

                      <button
                        onClick={() => handleBroadcastToTelegram(marketingResult)}
                        disabled={broadcastStatus.loading}
                        className="flex items-center gap-1.5 text-xs px-3 py-1 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white font-semibold shadow-md shadow-emerald-600/30 transition-all disabled:opacity-50"
                      >
                        {broadcastStatus.loading ? <RefreshCw className="w-3.5 h-3.5 animate-spin" /> : <Send className="w-3.5 h-3.5" />}
                        Broadcast to Telegram
                      </button>

                      <button
                        onClick={() => handleCopy(marketingResult, 'marketing')}
                        className="flex items-center gap-1 text-xs px-2.5 py-1 rounded-lg bg-zinc-800 hover:bg-zinc-700 text-zinc-200"
                      >
                        {copiedIndex === 'marketing' ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
                        {copiedIndex === 'marketing' ? 'Copied' : 'Copy'}
                      </button>
                    </div>
                  </div>

                  <pre className="text-xs text-zinc-300 font-mono whitespace-pre-wrap leading-relaxed bg-zinc-900/60 p-3.5 rounded-lg border border-zinc-800/80">
                    {marketingResult}
                  </pre>
                </div>
              )}
            </div>
          </div>
        )}

        {/* Tab 2: Market Pulse Agent */}
        {activeTab === 'pulse' && (
          <div className="space-y-6">
            <div className="p-6 rounded-2xl bg-zinc-900/70 border border-zinc-800 space-y-5">
              <div className="flex items-start justify-between">
                <div>
                  <h2 className="text-lg font-bold text-white flex items-center gap-2">
                    <TrendingUp className="w-5 h-5 text-emerald-400" />
                    Telegram Community Market Pulse Agent
                  </h2>
                  <p className="text-xs text-zinc-400 mt-1">
                    Creates daily institutional market recaps, session liquidity setups, and macroeconomic outlooks synchronized with East Africa Time (EAT).
                  </p>
                </div>
                <span className="text-[11px] font-mono px-2 py-1 rounded bg-emerald-500/10 text-emerald-400 border border-emerald-500/30">
                  Channel Broadcaster
                </span>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-xs">
                <div>
                  <label className="text-zinc-400 block mb-1.5 font-medium">Assets to Cover</label>
                  <input
                    type="text"
                    value={pulseAssets}
                    onChange={e => setPulseAssets(e.target.value)}
                    className="w-full bg-zinc-950 border border-zinc-800 rounded-xl px-3.5 py-2.5 text-white font-mono focus:outline-none focus:border-emerald-500"
                  />
                </div>

                <div>
                  <label className="text-zinc-400 block mb-1.5 font-medium">Tone & Perspective</label>
                  <select
                    value={pulseTone}
                    onChange={e => setPulseTone(e.target.value as 'institutional' | 'community' | 'urgent_alpha')}
                    className="w-full bg-zinc-950 border border-zinc-800 rounded-xl px-3.5 py-2.5 text-white focus:outline-none focus:border-emerald-500"
                  >
                    <option value="institutional">Institutional / Quant (Order Blocks, HMM, Liquidity)</option>
                    <option value="community">Community Hype & High Energy</option>
                    <option value="urgent_alpha">Urgent Alpha Alert (Breakout Warning)</option>
                  </select>
                </div>
              </div>

              <div className="flex justify-end pt-2">
                <button
                  onClick={handleGeneratePulse}
                  disabled={pulseLoading}
                  className="flex items-center gap-2 px-5 py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-semibold transition-all shadow-lg shadow-emerald-600/20 disabled:opacity-50"
                >
                  {pulseLoading ? <RefreshCw className="w-4 h-4 animate-spin" /> : <Sparkles className="w-4 h-4" />}
                  Generate Telegram Channel Pulse Update
                </button>
              </div>

              {pulseResult && (
                <div className="p-4 rounded-xl bg-zinc-950 border border-zinc-800 space-y-4 animate-in fade-in duration-200">
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-zinc-800/80 pb-3">
                    <span className="text-xs font-bold text-emerald-400 flex items-center gap-1.5">
                      <CheckCircle2 className="w-4 h-4" /> Ready for Telegram Broadcast
                    </span>

                    {/* Direct Broadcast Controls */}
                    <div className="flex items-center gap-2">
                      <select
                        value={selectedBroadcastChannelId}
                        onChange={e => setSelectedBroadcastChannelId(e.target.value)}
                        className="bg-zinc-900 border border-zinc-700 text-zinc-200 text-xs rounded-lg px-2.5 py-1 focus:outline-none"
                      >
                        <option value="all">📢 All Configured Channels ({channels.length})</option>
                        {channels.map(c => (
                          <option key={c.id} value={c.id}>{c.name} ({c.chatId})</option>
                        ))}
                      </select>

                      <button
                        onClick={() => handleBroadcastToTelegram(pulseResult)}
                        disabled={broadcastStatus.loading}
                        className="flex items-center gap-1.5 text-xs px-3 py-1 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white font-semibold shadow-md shadow-emerald-600/30 transition-all disabled:opacity-50"
                      >
                        {broadcastStatus.loading ? <RefreshCw className="w-3.5 h-3.5 animate-spin" /> : <Send className="w-3.5 h-3.5" />}
                        Broadcast to Telegram
                      </button>

                      <button
                        onClick={() => handleCopy(pulseResult, 'pulse')}
                        className="flex items-center gap-1 text-xs px-2.5 py-1 rounded-lg bg-zinc-800 hover:bg-zinc-700 text-zinc-200"
                      >
                        {copiedIndex === 'pulse' ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
                        {copiedIndex === 'pulse' ? 'Copied' : 'Copy'}
                      </button>
                    </div>
                  </div>

                  <pre className="text-xs text-zinc-300 font-mono whitespace-pre-wrap leading-relaxed bg-zinc-900/60 p-3.5 rounded-lg border border-zinc-800/80">
                    {pulseResult}
                  </pre>
                </div>
              )}
            </div>
          </div>
        )}

        {/* Tab 3: VIP Advisor Agent */}
        {activeTab === 'advisor' && (
          <div className="space-y-6">
            <div className="p-6 rounded-2xl bg-zinc-900/70 border border-zinc-800 space-y-5">
              <div className="flex items-start justify-between">
                <div>
                  <h2 className="text-lg font-bold text-white flex items-center gap-2">
                    <MessageSquare className="w-5 h-5 text-indigo-400" />
                    VIP 1-on-1 Account Advisor Agent
                  </h2>
                  <p className="text-xs text-zinc-400 mt-1">
                    Converses with individual clients, reads their live equity/drawdown stats, and provides quantitative risk advice for MT5 Prop or Crypto.
                  </p>
                </div>
                <span className="text-[11px] font-mono px-2 py-1 rounded bg-indigo-500/10 text-indigo-400 border border-indigo-500/30">
                  Account-Aware AI
                </span>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-xs">
                <div>
                  <label className="text-zinc-400 block mb-1.5 font-medium">Select Customer Profile</label>
                  <select
                    value={selectedCustomerId}
                    onChange={e => setSelectedCustomerId(e.target.value)}
                    className="w-full bg-zinc-950 border border-zinc-800 rounded-xl px-3.5 py-2.5 text-white focus:outline-none focus:border-indigo-500"
                  >
                    {customers.map(c => (
                      <option key={c.id} value={c.id}>
                        {c.full_name || c.email} ({c.package_name || 'MT5 Prop Challenge'})
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="text-zinc-400 block mb-1.5 font-medium">Customer's Question / Telegram DM</label>
                  <input
                    type="text"
                    value={advisorQuestion}
                    onChange={e => setAdvisorQuestion(e.target.value)}
                    className="w-full bg-zinc-950 border border-zinc-800 rounded-xl px-3.5 py-2.5 text-white focus:outline-none focus:border-indigo-500"
                  />
                </div>
              </div>

              <div className="flex justify-end pt-2">
                <button
                  onClick={handleConsultAdvisor}
                  disabled={advisorLoading}
                  className="flex items-center gap-2 px-5 py-2.5 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-semibold transition-all shadow-lg shadow-indigo-600/20 disabled:opacity-50"
                >
                  {advisorLoading ? <RefreshCw className="w-4 h-4 animate-spin" /> : <Sparkles className="w-4 h-4" />}
                  Generate Personalized Advisor Response
                </button>
              </div>

              {advisorResult && (
                <div className="p-4 rounded-xl bg-zinc-950 border border-zinc-800 space-y-4 animate-in fade-in duration-200">
                  <div className="flex items-center justify-between border-b border-zinc-800/80 pb-3">
                    <span className="text-xs font-bold text-indigo-400 flex items-center gap-1.5">
                      <CheckCircle2 className="w-4 h-4" /> AI Advisor Counsel (Ready to Send to Client)
                    </span>
                    <button
                      onClick={() => handleCopy(advisorResult, 'advisor')}
                      className="flex items-center gap-1 text-xs px-2.5 py-1 rounded bg-zinc-800 hover:bg-zinc-700 text-zinc-200"
                    >
                      {copiedIndex === 'advisor' ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
                      {copiedIndex === 'advisor' ? 'Copied' : 'Copy'}
                    </button>
                  </div>
                  <pre className="text-xs text-zinc-300 font-mono whitespace-pre-wrap leading-relaxed bg-zinc-900/60 p-3.5 rounded-lg border border-zinc-800/80">
                    {advisorResult}
                  </pre>
                </div>
              )}
            </div>
          </div>
        )}

        {/* Tab 4: Early Alpha Scout Agent */}
        {activeTab === 'alpha' && (
          <div className="space-y-6">
            <div className="p-6 rounded-2xl bg-zinc-900/70 border border-zinc-800 space-y-5">
              <div className="flex items-start justify-between">
                <div>
                  <h2 className="text-lg font-bold text-white flex items-center gap-2">
                    <Sparkles className="w-5 h-5 text-purple-400" />
                    Early Crypto Alpha & Narrative Scout Agent
                  </h2>
                  <p className="text-xs text-zinc-400 mt-1">
                    Scans emerging crypto narratives, DEX accumulation, and spot investment candidates before main exchange listing.
                  </p>
                </div>
                <span className="text-[11px] font-mono px-2 py-1 rounded bg-purple-500/10 text-purple-400 border border-purple-500/30">
                  Alpha Research
                </span>
              </div>

              <div className="text-xs">
                <label className="text-zinc-400 block mb-1.5 font-medium">Sectors & Themes to Scout</label>
                <input
                  type="text"
                  value={alphaSectors}
                  onChange={e => setAlphaSectors(e.target.value)}
                  className="w-full bg-zinc-950 border border-zinc-800 rounded-xl px-3.5 py-2.5 text-white font-mono focus:outline-none focus:border-purple-500"
                />
              </div>

              <div className="flex justify-end pt-2">
                <button
                  onClick={handleGenerateAlpha}
                  disabled={alphaLoading}
                  className="flex items-center gap-2 px-5 py-2.5 rounded-xl bg-purple-600 hover:bg-purple-500 text-white text-xs font-semibold transition-all shadow-lg shadow-purple-600/20 disabled:opacity-50"
                >
                  {alphaLoading ? <RefreshCw className="w-4 h-4 animate-spin" /> : <Sparkles className="w-4 h-4" />}
                  Scout Early Crypto Alpha Report
                </button>
              </div>

              {alphaResult && (
                <div className="p-4 rounded-xl bg-zinc-950 border border-zinc-800 space-y-4 animate-in fade-in duration-200">
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-zinc-800/80 pb-3">
                    <span className="text-xs font-bold text-purple-400 flex items-center gap-1.5">
                      <CheckCircle2 className="w-4 h-4" /> Formatted VIP Alpha Report
                    </span>

                    {/* Direct Broadcast Controls */}
                    <div className="flex items-center gap-2">
                      <select
                        value={selectedBroadcastChannelId}
                        onChange={e => setSelectedBroadcastChannelId(e.target.value)}
                        className="bg-zinc-900 border border-zinc-700 text-zinc-200 text-xs rounded-lg px-2.5 py-1 focus:outline-none"
                      >
                        <option value="all">📢 All Configured Channels ({channels.length})</option>
                        {channels.map(c => (
                          <option key={c.id} value={c.id}>{c.name} ({c.chatId})</option>
                        ))}
                      </select>

                      <button
                        onClick={() => handleBroadcastToTelegram(alphaResult)}
                        disabled={broadcastStatus.loading}
                        className="flex items-center gap-1.5 text-xs px-3 py-1 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white font-semibold shadow-md shadow-emerald-600/30 transition-all disabled:opacity-50"
                      >
                        {broadcastStatus.loading ? <RefreshCw className="w-3.5 h-3.5 animate-spin" /> : <Send className="w-3.5 h-3.5" />}
                        Broadcast to Telegram
                      </button>

                      <button
                        onClick={() => handleCopy(alphaResult, 'alpha')}
                        className="flex items-center gap-1 text-xs px-2.5 py-1 rounded-lg bg-zinc-800 hover:bg-zinc-700 text-zinc-200"
                      >
                        {copiedIndex === 'alpha' ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
                        {copiedIndex === 'alpha' ? 'Copied' : 'Copy'}
                      </button>
                    </div>
                  </div>

                  <pre className="text-xs text-zinc-300 font-mono whitespace-pre-wrap leading-relaxed bg-zinc-900/60 p-3.5 rounded-lg border border-zinc-800/80">
                    {alphaResult}
                  </pre>
                </div>
              )}
            </div>
          </div>
        )}

        {/* Screenshot Modal */}
        {showScreenshotModal && (
          <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4">
            <div className="bg-zinc-950 border border-zinc-800 rounded-2xl max-w-4xl w-full overflow-hidden shadow-2xl animate-in zoom-in-95 duration-200">
              <div className="p-4 border-b border-zinc-800 flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <ImageIcon className="w-5 h-5 text-indigo-400" />
                  <h3 className="text-sm font-bold text-white">AI Agents Hub & Telegram Broadcast Preview</h3>
                </div>
                <button
                  onClick={() => setShowScreenshotModal(false)}
                  className="p-1 rounded-lg text-zinc-400 hover:text-white hover:bg-zinc-800"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>
              <div className="p-4 bg-zinc-900/50 flex justify-center">
                <img
                  src={hubPreviewImg}
                  alt="AI Agents Operations Hub"
                  className="rounded-xl border border-zinc-800 shadow-lg max-h-[70vh] object-contain"
                  referrerPolicy="no-referrer"
                />
              </div>
              <div className="p-3 border-t border-zinc-800 bg-zinc-950 flex items-center justify-between text-xs text-zinc-400">
                <span>Asset saved in <code className="text-indigo-300">/src/assets/images/</code></span>
                <button
                  onClick={() => setShowScreenshotModal(false)}
                  className="px-3 py-1.5 rounded-lg bg-zinc-800 hover:bg-zinc-700 text-white font-medium"
                >
                  Close
                </button>
              </div>
            </div>
          </div>
        )}

      </div>
    </AdminLayout>
  );
}
