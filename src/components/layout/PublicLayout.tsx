import { ReactNode, useState, useEffect } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { 
  Zap, LogOut, Menu, X, ChevronDown, Copy, Check, Mail, Phone, Shield, Download, KeyRound, Monitor
} from 'lucide-react';
import { useAuth } from '../../contexts/AuthContext';
import { createBridgeZipPackage } from '../../lib/visualBridgeEngine';

interface PublicLayoutProps {
  children: ReactNode;
}

export function PublicLayout({ children }: PublicLayoutProps) {
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [productsDropdownOpen, setProductsDropdownOpen] = useState(false);
  const [scrolled, setScrolled] = useState(false);
  const [copiedMpesa, setCopiedMpesa] = useState(false);
  const [downloadingZip, setDownloadingZip] = useState(false);
  
  const loc = useLocation();
  const nav = useNavigate();
  const { session, loading, isAdmin, signOut, emergencyAdminBypass } = useAuth();
  const isLoggedIn = Boolean(session);

  const handleDirectZipDownload = async () => {
    try {
      setDownloadingZip(true);
      const zipBlob = await createBridgeZipPackage({
        accountSize: 100000,
        dailyDrawdownLimit: 4.5,
        riskPercent: 0.5,
        executionMode: 'prop_firm_guardian',
        platformType: 'mt5'
      });

      const url = URL.createObjectURL(zipBlob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `HashiBot_Visual_MT5_Bridge_Package.zip`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    } catch (err) {
      console.error('Failed downloading zip:', err);
    } finally {
      setDownloadingZip(false);
    }
  };

  useEffect(() => {
    const handler = () => setScrolled(window.scrollY > 20);
    window.addEventListener('scroll', handler, { passive: true });
    return () => window.removeEventListener('scroll', handler);
  }, []);

  // Close menus on route change
  useEffect(() => {
    setMobileMenuOpen(false);
    setProductsDropdownOpen(false);
  }, [loc.pathname]);

  async function handleSignOut() {
    await signOut();
    setMobileMenuOpen(false);
    nav('/');
  }

  function handleCopyMpesa() {
    navigator.clipboard.writeText('0748895225');
    setCopiedMpesa(true);
    setTimeout(() => setCopiedMpesa(false), 2000);
  }

  const isProductsActive = ['/ai-signals', '/crypto-automation', '/mt5-automation', '/signal-mode', '/personal-ea', '/prop-ea'].includes(loc.pathname);

  return (
    <div className="min-h-screen bg-zinc-950 text-zinc-100 flex flex-col font-sans selection:bg-blue-500 selection:text-white">
      {/* Top Banner Notice */}
      <div className="bg-gradient-to-r from-blue-950 via-zinc-900 to-indigo-950 border-b border-blue-900/40 text-xs py-1.5 px-4 text-center text-zinc-300">
        <div className="max-w-7xl mx-auto flex items-center justify-center gap-2 flex-wrap">
          <span className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full bg-emerald-500/20 text-emerald-400 font-semibold text-[10px] uppercase tracking-wider">
            <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
            Platform Live
          </span>
          <span>HashiBot Platform: AI Signals, Crypto Automation &amp; MT5 Forex/Prop Execution are fully Live &amp; Active</span>
          <Link to="/pricing#pricing-plans" className="text-blue-400 hover:text-blue-300 underline font-medium ml-1">
            View Plans →
          </Link>
        </div>
      </div>

      {/* Main Header */}
      <header className={`sticky top-0 z-50 transition-all duration-300 ${
        scrolled ? 'border-b border-zinc-800/80 bg-zinc-950/95 backdrop-blur-md shadow-xl shadow-black/40' : 'bg-zinc-950/80 backdrop-blur-sm border-b border-zinc-800/40'
      }`}>
        <div className="max-w-7xl mx-auto px-4 sm:px-6 h-16 flex items-center justify-between gap-4">
          
          {/* Logo */}
          <Link to="/" className="flex items-center gap-2.5 group">
            <div className="w-8 h-8 rounded-xl bg-blue-600 flex items-center justify-center shadow-lg shadow-blue-600/30 group-hover:scale-105 transition-transform">
              <Zap size={18} className="text-white" />
            </div>
            <div className="flex flex-col">
              <span className="font-extrabold text-lg tracking-tight leading-none text-white">Hashi<span className="text-blue-400">Bot</span></span>
              <span className="text-[10px] text-zinc-500 font-mono tracking-wider">MARKET INTELLIGENCE</span>
            </div>
          </Link>

          {/* Desktop Navigation */}
          <nav className="hidden md:flex items-center gap-1 text-sm font-medium">
            <Link
              to="/"
              className={`px-3 py-1.5 rounded-lg transition-colors ${
                loc.pathname === '/' ? 'text-white bg-zinc-800/80' : 'text-zinc-400 hover:text-white hover:bg-zinc-900'
              }`}
            >
              Home
            </Link>

            {/* Products Dropdown */}
            <div className="relative" onMouseLeave={() => setProductsDropdownOpen(false)}>
              <button
                onClick={() => setProductsDropdownOpen(!productsDropdownOpen)}
                onMouseEnter={() => setProductsDropdownOpen(true)}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg transition-colors ${
                  isProductsActive ? 'text-white bg-zinc-800/80' : 'text-zinc-400 hover:text-white hover:bg-zinc-900'
                }`}
                aria-expanded={productsDropdownOpen}
              >
                <span>Products</span>
                <ChevronDown size={14} className={`transition-transform duration-200 ${productsDropdownOpen ? 'rotate-180 text-blue-400' : ''}`} />
              </button>

              {productsDropdownOpen && (
                <div className="absolute top-full left-0 w-64 pt-2 shadow-2xl z-50">
                  <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-2 space-y-1 shadow-2xl backdrop-blur-xl">
                    <Link
                      to="/ai-signals"
                      className="block p-2.5 rounded-lg hover:bg-zinc-800/80 transition-colors group"
                    >
                      <div className="text-xs font-bold text-white group-hover:text-blue-400 flex items-center justify-between">
                        <span>AI Signals</span>
                        <span className="text-[10px] bg-emerald-500/10 text-emerald-400 px-1.5 py-0.5 rounded border border-emerald-500/20">Live</span>
                      </div>
                      <p className="text-[11px] text-zinc-400 mt-0.5">Structured signals with entry, SL, TP & outcome tracking</p>
                    </Link>

                    <Link
                      to="/crypto-automation"
                      className="block p-2.5 rounded-lg hover:bg-zinc-800/80 transition-colors group"
                    >
                      <div className="text-xs font-bold text-white group-hover:text-blue-400 flex items-center justify-between">
                        <span>Crypto Automation</span>
                        <span className="text-[10px] bg-emerald-500/10 text-emerald-400 px-1.5 py-0.5 rounded border border-emerald-500/20">Live</span>
                      </div>
                      <p className="text-[11px] text-zinc-400 mt-0.5">Direct Binance & Bybit execution for personal accounts</p>
                    </Link>

                    <Link
                      to="/mt5-automation"
                      className="block p-2.5 rounded-lg hover:bg-zinc-800/80 transition-colors group"
                    >
                      <div className="text-xs font-bold text-white group-hover:text-blue-400 flex items-center justify-between">
                        <span>MT5 Automation</span>
                        <span className="text-[10px] bg-emerald-500/10 text-emerald-400 px-1.5 py-0.5 rounded border border-emerald-500/20">Live</span>
                      </div>
                      <p className="text-[11px] text-zinc-400 mt-0.5">MetaTrader 5 bridge for Personal & Prop terminals</p>
                    </Link>
                  </div>
                </div>
              )}
            </div>

            <Link
              to="/features"
              className={`px-3 py-1.5 rounded-lg transition-colors ${
                loc.pathname === '/features' ? 'text-white bg-zinc-800/80' : 'text-zinc-400 hover:text-white hover:bg-zinc-900'
              }`}
            >
              Features
            </Link>

            <Link
              to="/pricing"
              className={`px-3 py-1.5 rounded-lg transition-colors ${
                loc.pathname === '/pricing' ? 'text-white bg-zinc-800/80' : 'text-zinc-400 hover:text-white hover:bg-zinc-900'
              }`}
            >
              Pricing
            </Link>

            <Link
              to="/results"
              className={`px-3 py-1.5 rounded-lg transition-colors ${
                loc.pathname === '/results' ? 'text-white bg-zinc-800/80' : 'text-zinc-400 hover:text-white hover:bg-zinc-900'
              }`}
            >
              Results
            </Link>

            <Link
              to="/about"
              className={`px-3 py-1.5 rounded-lg transition-colors ${
                loc.pathname === '/about' ? 'text-white bg-zinc-800/80' : 'text-zinc-400 hover:text-white hover:bg-zinc-900'
              }`}
            >
              About
            </Link>

            <Link
              to="/contact"
              className={`px-3 py-1.5 rounded-lg transition-colors ${
                loc.pathname === '/contact' ? 'text-white bg-zinc-800/80' : 'text-zinc-400 hover:text-white hover:bg-zinc-900'
              }`}
            >
              Contact
            </Link>
          </nav>

          {/* Desktop Right Actions */}
          <div className="hidden md:flex items-center gap-3">
            {loading ? (
              <div className="w-16 h-8 bg-zinc-900 animate-pulse rounded-lg" />
            ) : isLoggedIn ? (
              <div className="flex items-center gap-2">
                {isAdmin ? (
                  <Link
                    to="/admin/operator"
                    className="text-xs bg-amber-500/10 border border-amber-500/30 text-amber-300 hover:bg-amber-500/20 px-3 py-1.5 rounded-lg font-bold transition-colors"
                  >
                    Admin Control Room
                  </Link>
                ) : (
                  <Link
                    to="/app/dashboard"
                    className="text-xs bg-zinc-900 border border-zinc-800 text-zinc-200 hover:text-white hover:bg-zinc-800 px-3 py-1.5 rounded-lg font-semibold transition-colors"
                  >
                    Dashboard
                  </Link>
                )}
                <Link
                  to="/app/account"
                  className="text-xs text-zinc-400 hover:text-white px-2.5 py-1.5 rounded-lg hover:bg-zinc-900 transition-colors"
                >
                  Account
                </Link>
                <button
                  onClick={handleSignOut}
                  className="text-xs text-zinc-500 hover:text-red-400 px-2.5 py-1.5 rounded-lg hover:bg-zinc-900 transition-colors flex items-center gap-1"
                >
                  <LogOut size={13} />
                  <span>Sign Out</span>
                </button>
              </div>
            ) : (
              <div className="flex items-center gap-2">
                <Link
                  to="/login"
                  className="text-xs text-zinc-300 hover:text-white px-3.5 py-2 rounded-lg font-medium hover:bg-zinc-900 transition-colors"
                >
                  Log In
                </Link>
                <Link
                  to="/register"
                  className="text-xs bg-blue-600 hover:bg-blue-500 text-white px-4 py-2 rounded-lg font-bold transition-all shadow-lg shadow-blue-600/25 active:scale-95"
                >
                  Get Started
                </Link>
              </div>
            )}
          </div>

          {/* Mobile Menu Button */}
          <div className="md:hidden flex items-center gap-2">
            {!loading && isLoggedIn && (
              <Link
                to="/app/dashboard"
                className="text-xs bg-blue-600/20 text-blue-400 border border-blue-500/30 px-2.5 py-1 rounded-md font-bold"
              >
                App
              </Link>
            )}
            <button
              onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
              className="p-2 rounded-lg bg-zinc-900 border border-zinc-800 text-zinc-300 hover:text-white focus:outline-none"
              aria-label="Toggle Navigation Menu"
            >
              {mobileMenuOpen ? <X size={20} /> : <Menu size={20} />}
            </button>
          </div>
        </div>

        {/* Mobile Navigation Drawer */}
        {mobileMenuOpen && (
          <div className="md:hidden border-b border-zinc-800 bg-zinc-950/98 px-4 py-5 space-y-4 shadow-2xl backdrop-blur-2xl">
            <div className="space-y-1">
              <Link
                to="/"
                onClick={() => setMobileMenuOpen(false)}
                className={`block px-3 py-2.5 rounded-lg text-sm font-semibold ${
                  loc.pathname === '/' ? 'bg-blue-600/20 text-blue-400 border border-blue-500/30' : 'text-zinc-300 hover:bg-zinc-900'
                }`}
              >
                Home
              </Link>

              <div className="pt-2 pb-1 px-3 text-[11px] font-bold uppercase tracking-wider text-zinc-500">
                Products
              </div>
              <div className="pl-3 space-y-1 border-l-2 border-zinc-800 ml-3">
                <Link
                  to="/ai-signals"
                  onClick={() => setMobileMenuOpen(false)}
                  className="block py-2 text-sm text-zinc-300 hover:text-blue-400 flex items-center justify-between"
                >
                  <span>AI Signals</span>
                  <span className="text-[10px] bg-emerald-500/10 text-emerald-400 px-1.5 py-0.5 rounded">Live</span>
                </Link>
                <Link
                  to="/crypto-automation"
                  onClick={() => setMobileMenuOpen(false)}
                  className="block py-2 text-sm text-zinc-300 hover:text-blue-400 flex items-center justify-between"
                >
                  <span>Crypto Automation</span>
                  <span className="text-[10px] bg-emerald-500/10 text-emerald-400 px-1.5 py-0.5 rounded">Live</span>
                </Link>
                <Link
                  to="/mt5-automation"
                  onClick={() => setMobileMenuOpen(false)}
                  className="block py-2 text-sm text-zinc-300 hover:text-blue-400 flex items-center justify-between"
                >
                  <span>MT5 Automation</span>
                  <span className="text-[10px] bg-emerald-500/10 text-emerald-400 px-1.5 py-0.5 rounded">Live</span>
                </Link>
              </div>

              <div className="pt-2" />
              <Link
                to="/features"
                onClick={() => setMobileMenuOpen(false)}
                className="block px-3 py-2.5 rounded-lg text-sm font-semibold text-zinc-300 hover:bg-zinc-900"
              >
                Features
              </Link>
              <Link
                to="/pricing"
                onClick={() => setMobileMenuOpen(false)}
                className="block px-3 py-2.5 rounded-lg text-sm font-semibold text-zinc-300 hover:bg-zinc-900"
              >
                Pricing
              </Link>
              <Link
                to="/results"
                onClick={() => setMobileMenuOpen(false)}
                className="block px-3 py-2.5 rounded-lg text-sm font-semibold text-zinc-300 hover:bg-zinc-900"
              >
                Results
              </Link>
              <Link
                to="/about"
                onClick={() => setMobileMenuOpen(false)}
                className="block px-3 py-2.5 rounded-lg text-sm font-semibold text-zinc-300 hover:bg-zinc-900"
              >
                About
              </Link>
              <Link
                to="/contact"
                onClick={() => setMobileMenuOpen(false)}
                className="block px-3 py-2.5 rounded-lg text-sm font-semibold text-zinc-300 hover:bg-zinc-900"
              >
                Contact
              </Link>
            </div>

            <div className="pt-3 border-t border-zinc-800/80 flex flex-col gap-2">
              {isLoggedIn ? (
                <>
                  {isAdmin ? (
                    <Link
                      to="/admin/operator"
                      onClick={() => setMobileMenuOpen(false)}
                      className="w-full text-center py-2.5 bg-amber-500/20 text-amber-300 font-bold text-xs rounded-xl border border-amber-500/30"
                    >
                      Admin Control Room
                    </Link>
                  ) : (
                    <Link
                      to="/app/dashboard"
                      onClick={() => setMobileMenuOpen(false)}
                      className="w-full text-center py-2.5 bg-zinc-800 text-white font-bold text-xs rounded-xl"
                    >
                      User Dashboard
                    </Link>
                  )}
                  <button
                    onClick={handleSignOut}
                    className="w-full text-center py-2.5 bg-zinc-900 text-red-400 font-semibold text-xs rounded-xl border border-zinc-800"
                  >
                    Sign Out
                  </button>
                </>
              ) : (
                <div className="grid grid-cols-2 gap-2">
                  <Link
                    to="/login"
                    onClick={() => setMobileMenuOpen(false)}
                    className="text-center py-2.5 bg-zinc-900 border border-zinc-800 text-zinc-200 font-bold text-xs rounded-xl"
                  >
                    Log In
                  </Link>
                  <Link
                    to="/register"
                    onClick={() => setMobileMenuOpen(false)}
                    className="text-center py-2.5 bg-blue-600 text-white font-bold text-xs rounded-xl shadow-lg shadow-blue-600/20"
                  >
                    Get Started
                  </Link>
                </div>
              )}
            </div>
          </div>
        )}
      </header>

      {/* Main Page Content */}
      <main className="flex-1">{children}</main>

      {/* Footer */}
      <footer className="border-t border-zinc-800/80 bg-zinc-950 text-zinc-400 mt-20 pt-16 pb-12">
        <div className="max-w-7xl mx-auto px-4 sm:px-6">
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-10 pb-12 border-b border-zinc-800/60">
            
            {/* Col 1: Brand */}
            <div className="lg:col-span-2 space-y-4">
              <div className="flex items-center gap-2.5">
                <div className="w-8 h-8 rounded-xl bg-blue-600 flex items-center justify-center shadow-lg shadow-blue-600/30">
                  <Zap size={18} className="text-white" />
                </div>
                <span className="font-extrabold text-xl text-white tracking-tight">Hashi<span className="text-blue-400">Bot</span></span>
              </div>
              <p className="text-xs text-zinc-400 leading-relaxed max-w-sm">
                Professional trading platform combining AI-assisted market scanning, rule-based strategy qualification, deterministic arbitration, automated execution, risk management, and operational monitoring across Crypto and MetaTrader 5.
              </p>

              <div className="pt-2 space-y-2 text-xs">
                <div className="flex items-center gap-2 text-zinc-300">
                  <Mail size={14} className="text-blue-400" />
                  <a href="mailto:binuhashi1@gmail.com" className="hover:text-blue-400 transition-colors">
                    binuhashi1@gmail.com
                  </a>
                </div>
                <div className="flex items-center gap-2 text-zinc-300">
                  <Phone size={14} className="text-emerald-400" />
                  <span>M-Pesa: 0748 895 225</span>
                  <button
                    onClick={handleCopyMpesa}
                    className="ml-2 text-[11px] bg-zinc-900 border border-zinc-800 text-zinc-300 hover:text-white px-2 py-0.5 rounded flex items-center gap-1"
                    title="Copy M-Pesa number"
                  >
                    {copiedMpesa ? <Check size={12} className="text-emerald-400" /> : <Copy size={12} />}
                    <span>{copiedMpesa ? 'Copied' : 'Copy'}</span>
                  </button>
                </div>
              </div>
            </div>

            {/* Col 2: Products */}
            <div className="space-y-3">
              <h3 className="text-xs font-bold uppercase tracking-wider text-zinc-200">Products</h3>
              <ul className="space-y-2 text-xs">
                <li><Link to="/ai-signals" className="hover:text-white transition-colors">AI Signals</Link></li>
                <li><Link to="/crypto-automation" className="hover:text-white transition-colors">Crypto Automation</Link></li>
                <li><Link to="/mt5-automation" className="hover:text-white transition-colors">MT5 Automation</Link></li>
                <li><Link to="/pricing#pricing-plans" className="hover:text-white transition-colors">Pricing & Plans</Link></li>
              </ul>
            </div>

            {/* Col 3: Platform */}
            <div className="space-y-3">
              <h3 className="text-xs font-bold uppercase tracking-wider text-zinc-200">Platform</h3>
              <ul className="space-y-2 text-xs">
                <li><Link to="/features" className="hover:text-white transition-colors">Features & Pipeline</Link></li>
                <li><Link to="/results" className="hover:text-white transition-colors">Results & Performance</Link></li>
                <li><Link to="/faq" className="hover:text-white transition-colors">FAQ</Link></li>
                <li><Link to="/contact#contact-form" className="hover:text-white transition-colors">Contact Support</Link></li>
              </ul>
            </div>

            {/* Col 4: Company & Access */}
            <div className="space-y-3">
              <h3 className="text-xs font-bold uppercase tracking-wider text-zinc-200">Company & Access</h3>
              <ul className="space-y-2 text-xs">
                <li><Link to="/about" className="hover:text-white transition-colors">About HashiBot</Link></li>
                <li><Link to="/login" className="hover:text-white transition-colors">Log In</Link></li>
                <li><Link to="/register" className="hover:text-white transition-colors">Get Started</Link></li>
                <li>
                  <Link to="/app/visual-bridge" className="text-emerald-400 hover:text-emerald-300 font-semibold flex items-center gap-1.5">
                    <Download size={13} />
                    <span>Download MT5 Bridge</span>
                  </Link>
                </li>
                <li>
                  <button
                    onClick={() => {
                      emergencyAdminBypass();
                      nav('/admin/operator');
                    }}
                    className="text-amber-400 hover:text-amber-300 font-mono text-[11px] flex items-center gap-1.5 transition-colors"
                  >
                    <KeyRound size={12} />
                    <span>Admin Bypass (Temp Pass)</span>
                  </button>
                </li>
                {isLoggedIn && (
                  <li>
                    <Link to="/app/dashboard" className="text-blue-400 hover:text-blue-300 font-semibold">
                      Dashboard Access
                    </Link>
                  </li>
                )}
              </ul>
            </div>

          </div>

          {/* Bottom Bar & Risk Disclaimer */}
          <div className="pt-8 space-y-4">
            <div className="p-4 bg-zinc-900/60 border border-zinc-800/80 rounded-xl text-[11px] text-zinc-500 leading-relaxed flex items-start gap-2.5">
              <Shield size={16} className="text-amber-500 shrink-0 mt-0.5" />
              <div>
                <span className="font-bold text-zinc-400">Risk & Operational Disclaimer:</span> Trading foreign exchange, cryptocurrencies, and financial derivatives carries a high level of risk and may not be suitable for all investors. Past performance figures or backtested metrics are not indicative of future results. HashiBot is a trading intelligence software and automation infrastructure provider; it is not a financial advisor, broker, or fund manager.
              </div>
            </div>

            <div className="flex flex-col md:flex-row items-center justify-between gap-4 text-xs text-zinc-500 pt-2">
              <div className="flex items-center gap-3 flex-wrap">
                <p className="text-zinc-400 font-medium">© 2026 HashiBot Platform. All rights reserved.</p>
                <span className="text-zinc-700 hidden sm:inline">•</span>
                <button
                  type="button"
                  onClick={handleDirectZipDownload}
                  disabled={downloadingZip}
                  className="inline-flex items-center gap-1.5 px-3 py-1 rounded-md bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 hover:bg-emerald-500/20 text-xs font-mono font-medium transition-colors disabled:opacity-50"
                  title="Download complete MT5 Bridge package with 1-Click Launchers and GUI"
                >
                  <Download size={13} className={downloadingZip ? "animate-bounce" : ""} />
                  <span>{downloadingZip ? "Preparing .ZIP..." : "Download Desktop Bridge (.zip)"}</span>
                </button>
                <Link
                  to="/app/visual-bridge"
                  className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md bg-blue-500/10 border border-blue-500/20 text-blue-400 hover:bg-blue-500/20 text-xs font-mono transition-colors"
                >
                  <Monitor size={12} />
                  <span>Visual Bridge HUD</span>
                </Link>
                <button
                  type="button"
                  onClick={() => {
                    emergencyAdminBypass();
                    nav('/admin/operator');
                  }}
                  className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md bg-amber-500/10 border border-amber-500/20 text-amber-300 hover:bg-amber-500/20 text-xs font-mono transition-colors"
                  title="Direct 1-Click Admin Access"
                >
                  <KeyRound size={12} />
                  <span>Admin Pass (Bypass)</span>
                </button>
              </div>

              <div className="flex items-center gap-4 text-zinc-400">
                <Link to="/faq" className="hover:text-zinc-200 transition-colors">FAQ</Link>
                <Link to="/contact#contact-form" className="hover:text-zinc-200 transition-colors">Contact</Link>
                <Link to="/pricing#mpesa-payment-section" className="hover:text-zinc-200 transition-colors">M-Pesa Payment</Link>
              </div>
            </div>
          </div>

        </div>
      </footer>
    </div>
  );
}
