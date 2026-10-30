import { isOwnerPreview } from './lib/ownerPreview/state';
import { useSyncExternalStore } from 'react';
import { previewStore } from './lib/ownerPreview/adapter';
import { OwnerPreviewShell } from './components/preview/OwnerPreviewShell';
import { lazy, Suspense } from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { AuthProvider, useAuth } from './contexts/AuthContext';
import { PWAProvider } from './contexts/PWAContext';
import { PWAInstallBanner } from './components/pwa/PWAInstallBanner';
import { IOSInstallGuideModal } from './components/pwa/IOSInstallGuideModal';
import { PWAUpdateToast } from './components/pwa/PWAUpdateToast';
import { RequireAuth, RequireAdmin } from './components/guards/RequireAuth';
import { ScrollToAnchor } from './components/common/ScrollToAnchor';

// Eager: critical infrastructure (tiny, needed on every load)

// Lazy: all pages — each becomes its own chunk loaded on demand
const CustomerVisualBridge = lazy(() => import('./pages/app/CustomerVisualBridge').then(m => ({ default: m.CustomerVisualBridge })));
const AdminVisualBridgeManagement = lazy(() => import('./pages/admin/AdminVisualBridgeManagement').then(m => ({ default: m.AdminVisualBridgeManagement })));

// Public pages
const Home = lazy(() => import('./pages/public/Home'));
const Features = lazy(() => import('./pages/public/Features'));
const AISignals = lazy(() => import('./pages/public/AISignals'));
const Vip = lazy(() => import('./pages/public/Vip'));
const Free = lazy(() => import('./pages/public/Free'));
const Results = lazy(() => import('./pages/public/Results'));
const FAQ = lazy(() => import('./pages/public/FAQ'));
const About = lazy(() => import('./pages/public/About'));
const Contact = lazy(() => import('./pages/public/Contact'));
const ExecutionProduct = lazy(() => import('./pages/public/Execution'));

// Auth pages
const Login = lazy(() => import('./pages/auth/Login'));
const Register = lazy(() => import('./pages/auth/Register'));
const AdminSetup = lazy(() => import('./pages/auth/AdminSetup'));

// User app pages
const Dashboard = lazy(() => import('./pages/app/Dashboard'));
const ActiveSignals = lazy(() => import('./pages/app/ActiveSignals'));
const SignalDetail = lazy(() => import('./pages/app/SignalDetail'));
const TelegramSetup = lazy(() => import('./pages/app/TelegramSetup'));
const Watchlist = lazy(() => import('./pages/app/Watchlist'));
const Account = lazy(() => import('./pages/app/Account'));
const CryptoExecutionPortal = lazy(() => import('./pages/app/CryptoExecutionPortal'));
const MT5PersonalPortal = lazy(() => import('./pages/app/MT5PersonalPortal'));
const MT5PropPortal = lazy(() => import('./pages/app/MT5PropPortal'));
const CustomerBotSetup = lazy(() => import('./pages/app/CustomerBotSetup'));
const Onboarding = lazy(() => import('./pages/app/Onboarding'));
const ExecutionOnboarding = lazy(() => import('./pages/app/ExecutionOnboarding'));
const Readiness = lazy(() => import('./pages/app/Readiness'));
const Billing = lazy(() => import('./pages/app/Billing'));
const PaymentResult = lazy(() => import('./pages/public/PaymentResult'));
const LaunchSetup = lazy(() => import('./pages/admin/LaunchSetup'));
const CommerceOperations = lazy(() => import('./pages/admin/CommerceOperations'));

// Admin pages
const ScannerStatus = lazy(() => import('./pages/admin/ScannerStatus'));
const ScannerConfig = lazy(() => import('./pages/admin/ScannerConfig'));
const ProviderHealth = lazy(() => import('./pages/admin/ProviderHealth'));
const ProviderOverview = lazy(() => import('./pages/admin/ProviderOverview'));
const Candidates = lazy(() => import('./pages/admin/Candidates'));
const RejectedSetups = lazy(() => import('./pages/admin/RejectedSetups'));
const SignalsManager = lazy(() => import('./pages/admin/SignalsManager'));
const TelegramHub = lazy(() => import('./pages/admin/TelegramHub'));
const AuditLogs = lazy(() => import('./pages/admin/AuditLogs'));
const OutcomeTracking = lazy(() => import('./pages/admin/OutcomeTracking'));
const StrategyConfig = lazy(() => import('./pages/admin/StrategyConfig'));
const Execution = lazy(() => import('./pages/admin/Execution'));
const TradingBrain = lazy(() => import('./pages/admin/TradingBrain'));
const Modes = lazy(() => import('./pages/admin/Modes'));
const BacktestLab = lazy(() => import('./pages/admin/BacktestLab'));
const Handoff = lazy(() => import('./pages/admin/Handoff'));
const Performance = lazy(() => import('./pages/admin/Performance'));
const ProviderComparison = lazy(() => import('./pages/admin/ProviderComparison'));
const BinanceOperations = lazy(() => import('./pages/admin/BinanceOperations'));
const BybitOperations = lazy(() => import('./pages/admin/BybitOperations'));
const MT5PersonalOperations = lazy(() => import('./pages/admin/MT5PersonalOperations'));
const MT5PropOperations = lazy(() => import('./pages/admin/MT5PropOperations'));
const MT5OperationsCenter = lazy(() => import('./pages/admin/MT5OperationsCenter'));
const Customers = lazy(() => import('./pages/admin/Customers'));
const CustomerFleetOps = lazy(() => import('./pages/admin/CustomerFleetOps'));
const GrowthGoal = lazy(() => import('./pages/admin/GrowthGoal'));
const AIAgentsCommand = lazy(() => import('./pages/admin/AIAgentsCommand'));
const PropTradingPanel = lazy(() => import('./pages/admin/PropTradingPanel'));
const OperatorPanel = lazy(() => import('./pages/admin/operator/OperatorPanel'));
const Positions = lazy(() => import('./pages/admin/Positions'));
const Protection = lazy(() => import('./pages/admin/Protection'));
const Recovery = lazy(() => import('./pages/admin/Recovery'));
const Risk = lazy(() => import('./pages/admin/Risk'));
const Capital = lazy(() => import('./pages/admin/Capital'));
const RuntimeTruth = lazy(() => import('./pages/admin/RuntimeTruth'));
const MissionControl = lazy(() => import('./pages/admin/MissionControl'));

// Minimal page-level loading fallback
function PageLoader() {
  return (
    <div className="min-h-screen bg-zinc-950 flex items-center justify-center">
      <div className="w-6 h-6 border-2 border-blue-500 border-t-transparent rounded-full animate-spin" />
    </div>
  );
}

// Smart redirect after login based on role
function AuthRedirect() {
  const { user, profile, profileError, loading } = useAuth();
  if (loading) return <PageLoader />;
  if (!user) return <Navigate to="/login" replace />;
  // Profile failed — send to dashboard where error will surface
  if (profileError) return <Navigate to="/app/dashboard" replace />;
  // Still loading profile — wait
  if (!profile) return <PageLoader />;
  if (profile.role === 'admin') return <Navigate to="/admin/launch" replace />;
  return <Navigate to="/app/onboarding" replace />;
}

function App() {
  const previewRevision = useSyncExternalStore(previewStore.subscribe, previewStore.snapshot);
  return (
    <BrowserRouter>
      <ScrollToAnchor />
      <AuthProvider>
        <PWAProvider>
          <OwnerPreviewShell />
          <Suspense fallback={<PageLoader />}>
            <Routes key={previewRevision}>
              {/* Public Pages */}
            <Route path="/" element={<Home />} />
            <Route path="/features" element={<Features />} />
            <Route path="/ai-signals" element={<AISignals />} />
            <Route path="/crypto-automation" element={<Navigate to="/execution/crypto" replace />} />
            <Route path="/mt5-automation" element={<Navigate to="/execution/mt5" replace />} />
            <Route path="/pricing" element={<Navigate to="/vip" replace />} />
            <Route path="/vip" element={<Vip />} />
            <Route path="/vip/complete" element={<RequireAuth><Navigate to="/app/onboarding" replace /></RequireAuth>} />
            <Route path="/payment/result" element={<RequireAuth><PaymentResult /></RequireAuth>} />
            <Route path="/free" element={<Free />} />
            <Route path="/results" element={<Results />} />
            <Route path="/faq" element={<FAQ />} />
            <Route path="/about" element={<About />} />
            <Route path="/contact" element={<Contact />} />
            <Route path="/execution" element={<ExecutionProduct />} />
            <Route path="/execution/mt5" element={<ExecutionProduct focus="mt5" />} />
            <Route path="/execution/crypto" element={<ExecutionProduct focus="crypto" />} />
            <Route path="/execution/prop" element={<ExecutionProduct focus="prop" />} />

            {/* Legacy Compatibility Redirects */}
            <Route path="/signal-mode" element={<Navigate to="/ai-signals" replace />} />
            <Route path="/crypto-personal-bot" element={<Navigate to="/execution/crypto" replace />} />
            <Route path="/personal-ea" element={<Navigate to="/execution/mt5" replace />} />
            <Route path="/prop-ea" element={<Navigate to="/execution/prop" replace />} />
            <Route path="/forex-mt5-prop-bot" element={<Navigate to="/execution/prop" replace />} />

            {/* Auth pages */}
            <Route path="/login" element={<Login />} />
            <Route path="/register" element={<Register />} />

            {/* Admin bootstrap — accessible without admin role */}
            <Route path="/admin/setup" element={<AdminSetup />} />
            <Route path="/admin-setup" element={<AdminSetup />} />

            {/* Smart post-login redirect */}
            <Route path="/dashboard" element={<RequireAuth><AuthRedirect /></RequireAuth>} />

            {/* User app */}
            <Route path="/app/dashboard"   element={<RequireAuth><Dashboard /></RequireAuth>} />
            <Route path="/app/signals"     element={<RequireAuth><ActiveSignals /></RequireAuth>} />
            <Route path="/app/signals/:id" element={<RequireAuth><SignalDetail /></RequireAuth>} />
            <Route path="/app/history"     element={<RequireAuth><Navigate to="/app/signals" replace /></RequireAuth>} />
            <Route path="/app/crypto-execution" element={<RequireAuth><CryptoExecutionPortal /></RequireAuth>} />
            <Route path="/app/mt5-personal"    element={<RequireAuth><MT5PersonalPortal /></RequireAuth>} />
            <Route path="/app/mt5-prop"         element={<RequireAuth><MT5PropPortal /></RequireAuth>} />
            <Route path="/app/bridge"           element={<CustomerVisualBridge />} />
            <Route path="/app/visual-bridge"    element={<CustomerVisualBridge />} />
            <Route path="/app/bot-setup"        element={<RequireAuth><CustomerBotSetup /></RequireAuth>} />
            <Route path="/app/telegram"    element={<RequireAuth><TelegramSetup /></RequireAuth>} />
            <Route path="/app/package-request" element={<RequireAuth><Navigate to="/vip" replace /></RequireAuth>} />
            <Route path="/app/watchlist"   element={<RequireAuth><Watchlist /></RequireAuth>} />
            <Route path="/app/account"     element={<RequireAuth><Account /></RequireAuth>} />
            <Route path="/app/onboarding"  element={<RequireAuth><Onboarding /></RequireAuth>} />
            <Route path="/app/execution-onboarding" element={<RequireAuth><ExecutionOnboarding /></RequireAuth>} />
            <Route path="/app/readiness"   element={<RequireAuth><Readiness /></RequireAuth>} />
            <Route path="/app/billing" element={<RequireAuth><Billing /></RequireAuth>} />

            {/* Admin */}
            <Route path="/admin/operator" element={<RequireAdmin><OperatorPanel section="dashboard" /></RequireAdmin>} />
            <Route path="/admin/mission-control" element={<RequireAdmin><MissionControl /></RequireAdmin>} />
            <Route path="/admin/mission" element={<RequireAdmin><Navigate to="/admin/mission-control" replace /></RequireAdmin>} />
            <Route path="/admin/operator/signals" element={<RequireAdmin><SignalsManager /></RequireAdmin>} />
            <Route path="/admin/operator/executions" element={<RequireAdmin><OperatorPanel section="executions" /></RequireAdmin>} />
            <Route path="/admin/operator/trade-manager" element={<RequireAdmin><OperatorPanel section="trade-manager" /></RequireAdmin>} />
            <Route path="/admin/operator/telegram" element={<RequireAdmin><Navigate to="/admin/telegram" replace /></RequireAdmin>} />
            <Route path="/admin/operator/settings" element={<RequireAdmin><Navigate to="/admin/scanner-config" replace /></RequireAdmin>} />
            <Route path="/admin/operator/intelligence" element={<RequireAdmin><OperatorPanel section="intelligence" /></RequireAdmin>} />
            <Route path="/admin/operator/runtime-proof" element={<RequireAdmin><OperatorPanel section="runtime-proof" /></RequireAdmin>} />
            <Route path="/admin/control-room"    element={<RequireAdmin><Navigate to="/admin/operator" replace /></RequireAdmin>} />
            <Route path="/admin/scanner"          element={<RequireAdmin><ScannerStatus /></RequireAdmin>} />
            <Route path="/admin/scanner-config"   element={<RequireAdmin><ScannerConfig /></RequireAdmin>} />
            <Route path="/admin/providers"        element={<RequireAdmin><ProviderOverview /></RequireAdmin>} />
            <Route path="/admin/providers/diagnostics" element={<RequireAdmin><ProviderHealth /></RequireAdmin>} />
            <Route path="/admin/candidates"       element={<RequireAdmin><Candidates /></RequireAdmin>} />
            <Route path="/admin/rejected"         element={<RequireAdmin><RejectedSetups /></RequireAdmin>} />
            <Route path="/admin/signals"          element={<RequireAdmin><Navigate to="/admin/operator/signals" replace /></RequireAdmin>} />
            <Route path="/admin/signals/new" element={<RequireAdmin><Navigate to="/admin/telegram?tab=setups" replace /></RequireAdmin>} />
            <Route path="/admin/telegram-test"    element={<RequireAdmin><Navigate to="/admin/telegram?tab=channels" replace /></RequireAdmin>} />
            <Route path="/admin/telegram"         element={<RequireAdmin><TelegramHub /></RequireAdmin>} />
            <Route path="/admin/telegram-links"   element={<RequireAdmin><Navigate to="/admin/telegram?tab=members" replace /></RequireAdmin>} />
            <Route path="/admin/telegram-requests" element={<RequireAdmin><Navigate to="/admin/telegram?tab=members" replace /></RequireAdmin>} />
            <Route path="/admin/users"            element={<RequireAdmin><Navigate to="/admin/customers" replace /></RequireAdmin>} />
            <Route path="/admin/customers"        element={<RequireAdmin><Customers /></RequireAdmin>} />
            <Route path="/admin/customer-fleet"   element={<RequireAdmin><CustomerFleetOps /></RequireAdmin>} />
            <Route path="/admin/onboarding"       element={<RequireAdmin><Navigate to="/admin/customers" replace /></RequireAdmin>} />
            <Route path="/admin/launch" element={<RequireAdmin><LaunchSetup /></RequireAdmin>} />
            <Route path="/admin/commerce" element={<RequireAdmin><CommerceOperations /></RequireAdmin>} />
            <Route path="/admin/customer-engines" element={<RequireAdmin><Navigate to="/admin/customer-fleet" replace /></RequireAdmin>} />
            <Route path="/admin/fleet"            element={<RequireAdmin><Navigate to="/admin/customer-fleet" replace /></RequireAdmin>} />
            <Route path="/admin/growth-goal" element={<RequireAdmin><GrowthGoal /></RequireAdmin>} />
            <Route path="/admin/ai-agents"        element={<RequireAdmin><AIAgentsCommand /></RequireAdmin>} />
            <Route path="/admin/access-requests"  element={<RequireAdmin><Navigate to="/admin/customers" replace /></RequireAdmin>} />
            <Route path="/admin/audit"            element={<RequireAdmin><AuditLogs /></RequireAdmin>} />
            <Route path="/admin/scheduler" element={<RequireAdmin><Navigate to="/admin/telegram?tab=schedules" replace /></RequireAdmin>} />
            <Route path="/admin/outcomes"          element={<RequireAdmin><OutcomeTracking /></RequireAdmin>} />
            <Route path="/admin/performance"       element={<RequireAdmin><Performance /></RequireAdmin>} />
            <Route path="/admin/retention" element={<RequireAdmin><Navigate to="/admin/growth-goal?tab=payments" replace /></RequireAdmin>} />
            <Route path="/admin/provider-comparison" element={<RequireAdmin><ProviderComparison /></RequireAdmin>} />
            <Route path="/admin/providers/binance" element={<RequireAdmin><BinanceOperations /></RequireAdmin>} />
            <Route path="/admin/providers/bybit" element={<RequireAdmin><BybitOperations /></RequireAdmin>} />
            <Route path="/admin/providers/mt5" element={<RequireAdmin><MT5OperationsCenter /></RequireAdmin>} />
            <Route path="/admin/bridge" element={<RequireAdmin><Navigate to="/admin/visual-bridge" replace /></RequireAdmin>} />
            <Route path="/admin/visual-bridge" element={<RequireAdmin><AdminVisualBridgeManagement /></RequireAdmin>} />
            <Route path="/admin/providers/mt5-personal" element={<RequireAdmin><MT5PersonalOperations /></RequireAdmin>} />
            <Route path="/admin/providers/mt5-prop" element={<RequireAdmin><MT5PropOperations /></RequireAdmin>} />
            <Route path="/admin/providers/comparison" element={<RequireAdmin><Navigate to="/admin/provider-comparison" replace /></RequireAdmin>} />
            <Route path="/admin/checklist"         element={<RequireAdmin><Navigate to="/admin/launch" replace /></RequireAdmin>} />
            <Route path="/admin/strategy-config"   element={<RequireAdmin><Navigate to="/admin/strategies" replace /></RequireAdmin>} />
            <Route path="/admin/strategies"        element={<RequireAdmin><StrategyConfig /></RequireAdmin>} />
            <Route path="/admin/arbitrator" element={<RequireAdmin><Navigate to="/admin/candidates" replace /></RequireAdmin>} />
            <Route path="/admin/execution"         element={<RequireAdmin><Execution /></RequireAdmin>} />
            <Route path="/admin/positions"         element={<RequireAdmin><Positions /></RequireAdmin>} />
            <Route path="/admin/protection"        element={<RequireAdmin><Protection /></RequireAdmin>} />
            <Route path="/admin/recovery"          element={<RequireAdmin><Recovery /></RequireAdmin>} />
            <Route path="/admin/risk"              element={<RequireAdmin><Risk /></RequireAdmin>} />
            <Route path="/admin/capital"           element={<RequireAdmin><Capital /></RequireAdmin>} />
            <Route path="/admin/runtime-truth"     element={<RequireAdmin><RuntimeTruth /></RequireAdmin>} />
            <Route path="/admin/runtime"           element={<RequireAdmin><Navigate to="/admin/runtime-truth" replace /></RequireAdmin>} />
            <Route path="/admin/prop-provider"     element={<RequireAdmin><Navigate to="/admin/providers/mt5" replace /></RequireAdmin>} />
            <Route path="/admin/reporting"         element={<RequireAdmin><Navigate to="/admin/performance" replace /></RequireAdmin>} />
            <Route path="/admin/trading-brain"     element={<RequireAdmin><TradingBrain /></RequireAdmin>} />
            <Route path="/admin/modes"             element={<RequireAdmin><Modes /></RequireAdmin>} />
            <Route path="/admin/backtest"          element={<RequireAdmin><BacktestLab /></RequireAdmin>} />
            <Route path="/admin/backtest-lab"      element={<Navigate to="/admin/backtest" replace />} />
            <Route path="/admin/research"          element={<Navigate to="/admin/backtest" replace />} />
            <Route path="/admin/handoff"           element={<RequireAdmin><Handoff /></RequireAdmin>} />
            <Route path="/admin/prop"              element={<RequireAdmin><PropTradingPanel /></RequireAdmin>} />

            {/* Fallback */}
            <Route path="*" element={<Navigate to="/" replace />} />
          </Routes>
          </Suspense>
          {!isOwnerPreview() && <><PWAUpdateToast /><PWAInstallBanner /><IOSInstallGuideModal /></>}
        </PWAProvider>
      </AuthProvider>
    </BrowserRouter>
  );
}


export default App;
