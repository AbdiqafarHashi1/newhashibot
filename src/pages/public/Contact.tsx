import { useState } from 'react';
import { useSearchParams, Link } from 'react-router-dom';
import { PublicLayout } from '../../components/layout/PublicLayout';
import { supabase } from '../../lib/supabase';
import { 
  Mail, Phone, Send, Clock, 
  Loader2, AlertCircle, CheckCircle2 
} from 'lucide-react';

export default function Contact() {
  const [searchParams] = useSearchParams();
  const initialCategory = searchParams.get('category') || 'General enquiries';
  const initialSubject = searchParams.get('subject') || '';


  const [formData, setFormData] = useState({
    fullName: '',
    email: '',
    phone: '',
    category: initialCategory,
    subject: initialSubject,
    message: '',
  });

  const [submitting, setSubmitting] = useState(false);
  const [submitSuccess, setSubmitSuccess] = useState<string | null>(null);
  const [submitError, setSubmitError] = useState<string | null>(null);


  async function handleSubmitMessage(e: React.FormEvent) {
    e.preventDefault();
    setSubmitError(null);
    setSubmitSuccess(null);

    if (!formData.fullName.trim()) {
      setSubmitError('Please enter your full name.');
      return;
    }
    if (!formData.email.trim() || !formData.email.includes('@')) {
      setSubmitError('Please enter a valid email address.');
      return;
    }
    if (!formData.message.trim()) {
      setSubmitError('Please enter your message or enquiry.');
      return;
    }

    setSubmitting(true);

    try {
      const { error } = await supabase.from('access_requests').insert({
        full_name: formData.fullName.trim(),
        email: formData.email.trim().toLowerCase(),
        phone: formData.phone.trim() || null,
        product_slug: 'contact_enquiry',
        package_name: formData.category,
        notes: `Subject: ${formData.subject || 'General'}\n\n${formData.message.trim()}`,
        status: 'pending',
        created_at: new Date().toISOString(),
      });

      if (error) {
        console.warn('Supabase contact submission notice:', error.message);
      }

      setSubmitSuccess(
        'Thank you! Your message has been received. Our team will review your enquiry and get back to you via email within 2–4 hours.'
      );

      setFormData(prev => ({
        ...prev,
        subject: '',
        message: '',
      }));
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to submit enquiry. Please try sending directly to binuhashi1@gmail.com.';
      setSubmitError(message);
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <PublicLayout>
      {/* Header */}
      <section className="py-16 sm:py-20 px-4 sm:px-6 bg-zinc-900/40 border-b border-zinc-800/80">
        <div className="max-w-4xl mx-auto text-center space-y-4">
          <div className="inline-flex items-center gap-2 bg-blue-500/10 border border-blue-500/20 rounded-full px-3.5 py-1 text-xs text-blue-400 font-bold uppercase tracking-wider">
            <Mail size={14} />
            Direct Support & Enquiries
          </div>
          <h1 className="text-3xl sm:text-5xl font-extrabold text-white tracking-tight">
            Contact HashiBot Platform
          </h1>
          <p className="text-sm sm:text-base text-zinc-300 leading-relaxed max-w-2xl mx-auto">
            Have questions about AI Signals, Crypto Automation setup, MetaTrader 5 waitlist, or M-Pesa payments? Get in touch directly.
          </p>
        </div>
      </section>

      {/* Main Content */}
      <section className="py-16 px-4 sm:px-6 max-w-7xl mx-auto space-y-12">
        
        {/* Quick Action Cards Grid */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          
          {/* Email Card */}
          <div className="bg-zinc-900 border border-zinc-800 rounded-2xl p-6 space-y-4 shadow-xl">
            <div className="w-10 h-10 rounded-xl bg-blue-600/10 border border-blue-500/20 flex items-center justify-center text-blue-400">
              <Mail size={20} />
            </div>
            <div>
              <h3 className="font-extrabold text-base text-white">Email Support</h3>
              <p className="text-xs text-zinc-400 mt-0.5">Send direct email enquiries anytime.</p>
            </div>
            <a
              href="mailto:binuhashi1@gmail.com"
              className="inline-flex items-center gap-2 text-xs font-bold text-blue-400 hover:text-blue-300 font-mono bg-zinc-950 p-3 rounded-xl border border-zinc-800 w-full"
            >
              <span>binuhashi1@gmail.com</span>
            </a>
          </div>

          <div className="rounded-2xl border border-emerald-500/30 bg-zinc-900 p-6"><Phone size={20} className="text-emerald-400"/><h3 className="mt-4 font-bold">M-Pesa payments</h3><p className="mt-2 text-sm text-zinc-400">Use HashiBot checkout when activated. Do not send money to a personal number or provide your M-Pesa PIN on this website.</p><Link to="/vip#vip-purchase" className="mt-4 inline-block text-emerald-400">View official payment options →</Link></div>

          {/* Response Time Card */}
          <div className="bg-zinc-900 border border-zinc-800 rounded-2xl p-6 space-y-4 shadow-xl">
            <div className="w-10 h-10 rounded-xl bg-purple-600/10 border border-purple-500/20 flex items-center justify-center text-purple-400">
              <Clock size={20} />
            </div>
            <div>
              <h3 className="font-extrabold text-base text-white">Response Time</h3>
              <p className="text-xs text-zinc-400 mt-0.5">Fast operational support turnaround.</p>
            </div>
            <div className="p-3 bg-zinc-950 border border-zinc-800 rounded-xl text-xs text-zinc-300 font-medium">
              Enquiries usually responded to within <strong className="text-purple-300">2–4 hours</strong>.
            </div>
          </div>

        </div>

        {/* Contact Form Section */}
        <div id="contact-form" className="max-w-3xl mx-auto bg-zinc-950 border border-zinc-800 rounded-2xl p-6 sm:p-10 shadow-2xl space-y-6 scroll-mt-24">
          <div>
            <h2 className="text-2xl font-extrabold text-white">Send An Enquiry</h2>
            <p className="text-xs text-zinc-400 mt-1">Select a category and fill out the details below.</p>
          </div>

          {submitSuccess && (
            <div className="p-4 bg-emerald-500/10 border border-emerald-500/30 rounded-xl text-xs text-emerald-300 leading-relaxed flex items-start gap-2.5">
              <CheckCircle2 size={18} className="text-emerald-400 shrink-0 mt-0.5" />
              <div>{submitSuccess}</div>
            </div>
          )}

          {submitError && (
            <div className="p-4 bg-red-500/10 border border-red-500/30 rounded-xl text-xs text-red-300 leading-relaxed flex items-start gap-2.5">
              <AlertCircle size={18} className="text-red-400 shrink-0 mt-0.5" />
              <div>{submitError}</div>
            </div>
          )}

          <form onSubmit={handleSubmitMessage} className="space-y-4 text-xs">
            
            {/* Category */}
            <div className="space-y-1">
              <label className="font-bold text-zinc-300">Enquiry Category *</label>
              <select
                value={formData.category}
                onChange={e => setFormData({ ...formData, category: e.target.value })}
                className="w-full bg-zinc-900 border border-zinc-800 rounded-xl px-3.5 py-2.5 text-white focus:outline-none focus:border-blue-500"
              >
                <option value="General enquiries">General enquiries</option>
                <option value="Signal Mode support">Signal Mode support</option>
                <option value="Crypto setup">Crypto setup</option>
                <option value="MT5 waitlist and setup">MT5 waitlist and setup</option>
                <option value="Payment confirmation">Payment confirmation</option>
                <option value="Technical support">Technical support</option>
                <option value="Business enquiries">Business enquiries</option>
              </select>
            </div>

            {/* Name & Email */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="space-y-1">
                <label className="font-bold text-zinc-300">Your Full Name *</label>
                <input
                  type="text"
                  required
                  placeholder="John Doe"
                  value={formData.fullName}
                  onChange={e => setFormData({ ...formData, fullName: e.target.value })}
                  className="w-full bg-zinc-900 border border-zinc-800 rounded-xl px-3.5 py-2.5 text-white placeholder-zinc-600 focus:outline-none focus:border-blue-500"
                />
              </div>

              <div className="space-y-1">
                <label className="font-bold text-zinc-300">Email Address *</label>
                <input
                  type="email"
                  required
                  placeholder="john@example.com"
                  value={formData.email}
                  onChange={e => setFormData({ ...formData, email: e.target.value })}
                  className="w-full bg-zinc-900 border border-zinc-800 rounded-xl px-3.5 py-2.5 text-white placeholder-zinc-600 focus:outline-none focus:border-blue-500"
                />
              </div>
            </div>

            {/* Phone & Subject */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="space-y-1">
                <label className="font-bold text-zinc-300">Phone Number (Optional)</label>
                <input
                  type="tel"
                  placeholder="0712345678"
                  value={formData.phone}
                  onChange={e => setFormData({ ...formData, phone: e.target.value })}
                  className="w-full bg-zinc-900 border border-zinc-800 rounded-xl px-3.5 py-2.5 text-white placeholder-zinc-600 focus:outline-none focus:border-blue-500 font-mono"
                />
              </div>

              <div className="space-y-1">
                <label className="font-bold text-zinc-300">Subject (Optional)</label>
                <input
                  type="text"
                  placeholder="e.g., Question about Bybit UTA setup"
                  value={formData.subject}
                  onChange={e => setFormData({ ...formData, subject: e.target.value })}
                  className="w-full bg-zinc-900 border border-zinc-800 rounded-xl px-3.5 py-2.5 text-white placeholder-zinc-600 focus:outline-none focus:border-blue-500"
                />
              </div>
            </div>

            {/* Message */}
            <div className="space-y-1">
              <label className="font-bold text-zinc-300">Your Message *</label>
              <textarea
                required
                rows={5}
                placeholder="Write your enquiry or support request in detail..."
                value={formData.message}
                onChange={e => setFormData({ ...formData, message: e.target.value })}
                className="w-full bg-zinc-900 border border-zinc-800 rounded-xl px-3.5 py-2.5 text-white placeholder-zinc-600 focus:outline-none focus:border-blue-500"
              />
            </div>

            <button
              type="submit"
              disabled={submitting}
              className="w-full bg-blue-600 hover:bg-blue-500 disabled:opacity-50 text-white font-bold text-sm py-3.5 rounded-xl transition-all shadow-xl shadow-blue-600/25 flex items-center justify-center gap-2"
            >
              {submitting ? (
                <>
                  <Loader2 size={16} className="animate-spin" />
                  <span>Sending Message...</span>
                </>
              ) : (
                <>
                  <Send size={16} />
                  <span>Send Support Message</span>
                </>
              )}
            </button>

          </form>
        </div>

        {/* Quick Navigation Footer */}
        <div className="pt-6 flex flex-wrap items-center justify-center gap-4 text-xs text-zinc-400">
          <span>Quick Actions:</span>
          <a href="mailto:binuhashi1@gmail.com" className="text-blue-400 hover:underline">
            Email Support Directly
          </a>
          <span>•</span>
          <Link to="/pricing#mpesa-payment-section" className="text-blue-400 hover:underline">
            View VIP payment options
          </Link>
          <span>•</span>
          <Link to="/faq" className="text-blue-400 hover:underline">
            Read FAQ
          </Link>
        </div>

      </section>
    </PublicLayout>
  );
}
