import { useState } from 'react';
import { PublicLayout } from '../../components/layout/PublicLayout';
import { 
  HelpCircle, ChevronDown, Search 
} from 'lucide-react';
import { Link } from 'react-router-dom';

export default function FAQ() {
  const [searchTerm, setSearchTerm] = useState('');
  const [openIndex, setOpenIndex] = useState<string | null>('gen-1');

  const faqs = [
    // General
    {
      id: 'gen-1',
      category: 'General',
      q: 'What is HashiBot?',
      a: 'HashiBot is a professional trading platform combining AI-assisted market scanning, rule-based strategy qualification, deterministic arbitration, automated execution, risk management, and operational monitoring across Crypto and MetaTrader 5.',
    },
    {
      id: 'gen-2',
      category: 'General',
      q: 'Does HashiBot hold customer funds?',
      a: 'No. HashiBot is a non-custodial software platform. All customer funds remain securely in your personal exchange accounts (Binance/Bybit) or MetaTrader 5 broker terminals.',
    },
    // Signal Mode
    {
      id: 'sig-1',
      category: 'Signal Mode',
      q: 'How are signals delivered?',
      a: 'Signals are delivered instantaneously via high-priority Telegram channel notifications and rendered on your customer web dashboard with exact entry zones, Stop Loss, and Take Profit targets.',
    },
    {
      id: 'sig-2',
      category: 'Signal Mode',
      q: 'Do I need exchange API keys for AI Signals?',
      a: 'No. The Crypto Signal Room package (5,000 KES/month) requires no API keys. Signals are meant for manual execution on any exchange or broker of your choice.',
    },
    // Crypto Automation
    {
      id: 'crypto-1',
      category: 'Crypto Automation',
      q: 'Which exchanges are supported for crypto auto-trading?',
      a: 'Crypto Personal Bot (10,000 KES/mo) currently supports Binance (Spot & USDT-M Futures) and Bybit (Unified Margin V5 & Futures).',
    },
    {
      id: 'crypto-2',
      category: 'Crypto Automation',
      q: 'Is my API key safe?',
      a: 'Yes. API keys are write-only during input, encrypted at rest, and never exposed in the frontend. HashiBot strictly forbids withdrawal permissions.',
    },
    // MT5 Automation
    {
      id: 'mt5-1',
      category: 'MT5 Automation',
      q: 'What is the current status of MetaTrader 5 support?',
      a: 'MetaTrader 5 bridge infrastructure is fully built and operational. Controlled live demo certification is the next milestone. Customers can currently join the waitlist.',
    },
    {
      id: 'mt5-2',
      category: 'MT5 Automation',
      q: 'Can HashiBot be used on prop firm accounts?',
      a: 'Yes. The MT5 Prop Bot tier includes conservative risk profiles (0.25% - 0.75% per trade) and hard daily loss gates specifically designed for FTMO, FundedNext, and similar prop firm accounts.',
    },
    // Payments & M-Pesa
    {
      id: 'pay-1',
      category: 'Payments & M-Pesa',
      q: 'How do I pay using M-Pesa?',
      a: 'Send the exact plan amount to official M-Pesa number 0748 895 225 via M-Pesa Send Money. Save the transaction ref code (e.g. SJK789XYZ) and submit it on the Pricing page confirmation form.',
    },
    {
      id: 'pay-2',
      category: 'Payments & M-Pesa',
      q: 'How long does account activation take after payment?',
      a: 'Submissions are verified manually by the HashiBot admin team. Activations are typically processed within 15 to 60 minutes during standard operational hours.',
    },
    // Risk & Disclaimers
    {
      id: 'risk-1',
      category: 'Risk & Disclaimers',
      q: 'Are profits guaranteed?',
      a: 'No. Trading financial markets carries substantial risk of loss. HashiBot provides software tools and structured market signals, but does not guarantee profitability.',
    },
  ];

  const filteredFaqs = faqs.filter(f => 
    f.q.toLowerCase().includes(searchTerm.toLowerCase()) || 
    f.a.toLowerCase().includes(searchTerm.toLowerCase()) ||
    f.category.toLowerCase().includes(searchTerm.toLowerCase())
  );

  return (
    <PublicLayout>
      {/* Header */}
      <section className="py-16 sm:py-20 px-4 sm:px-6 bg-zinc-900/40 border-b border-zinc-800/80">
        <div className="max-w-4xl mx-auto text-center space-y-4">
          <div className="inline-flex items-center gap-2 bg-blue-500/10 border border-blue-500/20 rounded-full px-3.5 py-1 text-xs text-blue-400 font-bold uppercase tracking-wider">
            <HelpCircle size={14} />
            Knowledge Base & Frequently Asked Questions
          </div>
          <h1 className="text-3xl sm:text-5xl font-extrabold text-white tracking-tight">
            Frequently Asked Questions
          </h1>
          <p className="text-sm sm:text-base text-zinc-300 leading-relaxed max-w-2xl mx-auto">
            Find immediate answers regarding signal mode, automated execution, M-Pesa payments, and platform security.
          </p>

          {/* Search Box */}
          <div className="pt-4 max-w-md mx-auto">
            <div className="relative">
              <Search size={16} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-zinc-500" />
              <input
                type="text"
                placeholder="Search questions or keywords..."
                value={searchTerm}
                onChange={e => setSearchTerm(e.target.value)}
                className="w-full bg-zinc-900 border border-zinc-800 rounded-xl pl-10 pr-4 py-3 text-xs text-white placeholder-zinc-500 focus:outline-none focus:border-blue-500 shadow-xl"
              />
            </div>
          </div>
        </div>
      </section>

      {/* Accordion List */}
      <section className="py-16 px-4 sm:px-6 max-w-4xl mx-auto space-y-4">
        {filteredFaqs.length === 0 ? (
          <div className="text-center py-12 text-zinc-500 text-xs">
            No matching questions found for &quot;{searchTerm}&quot;.
          </div>
        ) : (
          filteredFaqs.map((faq) => {
            const isOpen = openIndex === faq.id;
            return (
              <div 
                key={faq.id} 
                className="bg-zinc-900/80 border border-zinc-800 rounded-2xl overflow-hidden transition-all hover:border-zinc-700"
              >
                <button
                  onClick={() => setOpenIndex(isOpen ? null : faq.id)}
                  className="w-full p-5 text-left flex items-center justify-between gap-4 focus:outline-none"
                >
                  <div className="space-y-1">
                    <span className="text-[10px] font-bold uppercase tracking-wider text-blue-400 font-mono">
                      {faq.category}
                    </span>
                    <h3 className="font-bold text-sm text-white">{faq.q}</h3>
                  </div>
                  <ChevronDown size={18} className={`text-zinc-400 transition-transform duration-200 shrink-0 ${isOpen ? 'rotate-180 text-blue-400' : ''}`} />
                </button>

                {isOpen && (
                  <div className="px-5 pb-5 pt-1 text-xs text-zinc-300 leading-relaxed border-t border-zinc-800/60">
                    {faq.a}
                  </div>
                )}
              </div>
            );
          })
        )}
      </section>

      {/* Still Have Questions CTA */}
      <section className="py-16 px-4 sm:px-6 bg-zinc-900/60 border-t border-zinc-800/80 text-center">
        <div className="max-w-xl mx-auto space-y-4">
          <h2 className="text-2xl font-extrabold text-white">Still Have Questions?</h2>
          <p className="text-xs text-zinc-400">
            Our support team is ready to assist with account setup or M-Pesa payment queries.
          </p>
          <div className="flex items-center justify-center gap-3">
            <Link
              to="/contact"
              className="bg-blue-600 hover:bg-blue-500 text-white font-bold text-xs px-6 py-3 rounded-xl transition-all shadow-lg shadow-blue-600/20"
            >
              Contact Support
            </Link>
            <Link
              to="/pricing"
              className="bg-zinc-800 hover:bg-zinc-700 text-zinc-200 font-semibold text-xs px-6 py-3 rounded-xl transition-all border border-zinc-700"
            >
              View Pricing & Plans
            </Link>
          </div>
        </div>
      </section>
    </PublicLayout>
  );
}
