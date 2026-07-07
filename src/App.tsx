import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { AuthProvider, useAuth } from './contexts/AuthContext';
import { RequireAuth, RequireAdmin } from './components/guards/RequireAuth';

// Public pages
import Home from './pages/public/Home';
import SignalMode from './pages/public/SignalMode';
import PersonalEA from './pages/public/PersonalEA';
import PropEA from './pages/public/PropEA';
import Pricing from './pages/public/Pricing';
import Results from './pages/public/Results';
import FAQ from './pages/public/FAQ';

// Auth pages
import Login from './pages/auth/Login';
import Register from './pages/auth/Register';
import AdminSetup from './pages/auth/AdminSetup';

// User app pages
import Dashboard from './pages/app/Dashboard';
import ActiveSignals from './pages/app/ActiveSignals';
import SignalDetail from './pages/app/SignalDetail';
import TelegramSetup from './pages/app/TelegramSetup';
import Watchlist from './pages/app/Watchlist';
import Account from './pages/app/Account';
import PackageRequest from './pages/app/PackageRequest';

// Admin pages
import ScannerStatus from './pages/admin/ScannerStatus';
import ScannerConfig from './pages/admin/ScannerConfig';
import ProviderHealth from './pages/admin/ProviderHealth';
import Candidates from './pages/admin/Candidates';
import RejectedSetups from './pages/admin/RejectedSetups';
import SignalsManager from './pages/admin/SignalsManager';
import ManualSignal from './pages/admin/ManualSignal';
import TelegramTest from './pages/admin/TelegramTest';
import TelegramLogs from './pages/admin/TelegramLogs';
import TelegramLinks from './pages/admin/TelegramLinks';
import UsersAccess from './pages/admin/UsersAccess';
import AuditLogs from './pages/admin/AuditLogs';
import SchedulerGuide from './pages/admin/SchedulerGuide';
import OutcomeTracking from './pages/admin/OutcomeTracking';
import SetupChecklist from './pages/admin/SetupChecklist';
import AccessRequests from './pages/admin/AccessRequests';
import StrategyConfig from './pages/admin/StrategyConfig';
import Execution from './pages/admin/Execution';
import TradingBrain from './pages/admin/TradingBrain';
import Modes from './pages/admin/Modes';
import BacktestLab from './pages/admin/BacktestLab';
import Handoff from './pages/admin/Handoff';
import Performance from './pages/admin/Performance';
import ProviderComparison from './pages/admin/ProviderComparison';
import BinanceOperations from './pages/admin/BinanceOperations';
import BybitOperations from './pages/admin/BybitOperations';
import MT5PersonalOperations from './pages/admin/MT5PersonalOperations';
import MT5PropOperations from './pages/admin/MT5PropOperations';
import Customers from './pages/admin/Customers';
import PropTradingPanel from './pages/admin/PropTradingPanel';
import OperatorPanel from './pages/admin/operator/OperatorPanel';
import RetentionPolicies from './pages/admin/RetentionPolicies';
import StorageStatus from './pages/admin/StorageStatus';
import Mt5Bridge from './pages/admin/Mt5Bridge';

// Smart redirect after login based on role
function AuthRedirect() {
  const { user, profile, profileError, loading } = useAuth();
  if (loading) return (
    <div className="min-h-screen bg-zinc-950 flex items-center justify-center">
      <div className="w-6 h-6 border-2 border-blue-500 border-t-transparent rounded-full animate-spin" />
    </div>
  );
  if (!user) return <Navigate to="/login" replace />;
  // Profile failed — send to dashboard where error will surface
  if (profileError) return <Navigate to="/app/dashboard" replace />;
  // Still loading profile — wait
  if (!profile) return (
    <div className="min-h-screen bg-zinc-950 flex items-center justify-center">
      <div className="w-6 h-6 border-2 border-blue-500 border-t-transparent rounded-full animate-spin" />
    </div>
  );
  if (profile.role === 'admin') return <Navigate to="/admin/operator" replace />;
  return <Navigate to="/app/dashboard" replace />;
}

function App() {
  return (
    <BrowserRouter>
      <AuthProvider>
        <Routes>
          {/* Public */}
          <Route path="/" element={<Home />} />
          <Route path="/signal-mode" element={<SignalMode />} />
          <Route path="/personal-ea" element={<PersonalEA />} />
          <Route path="/prop-ea" element={<PropEA />} />
          <Route path="/pricing" element={<Pricing />} />
          <Route path="/results" element={<Results />} />
          <Route path="/faq" element={<FAQ />} />
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
          <Route path="/app/telegram"    element={<RequireAuth><TelegramSetup /></RequireAuth>} />
          <Route path="/app/package-request" element={<RequireAuth><PackageRequest /></RequireAuth>} />
          <Route path="/app/watchlist"   element={<RequireAuth><Watchlist /></RequireAuth>} />
          <Route path="/app/account"     element={<RequireAuth><Account /></RequireAuth>} />

          {/* Admin */}

          <Route path="/admin/operator" element={<RequireAdmin><OperatorPanel section="dashboard" /></RequireAdmin>} />
          <Route path="/admin/operator/signals" element={<RequireAdmin><OperatorPanel section="signals" /></RequireAdmin>} />
          <Route path="/admin/operator/executions" element={<RequireAdmin><OperatorPanel section="executions" /></RequireAdmin>} />
          <Route path="/admin/operator/trade-manager" element={<RequireAdmin><OperatorPanel section="trade-manager" /></RequireAdmin>} />
          <Route path="/admin/operator/telegram" element={<RequireAdmin><OperatorPanel section="telegram" /></RequireAdmin>} />
          <Route path="/admin/operator/settings" element={<RequireAdmin><OperatorPanel section="settings" /></RequireAdmin>} />
          <Route path="/admin/operator/intelligence" element={<RequireAdmin><OperatorPanel section="intelligence" /></RequireAdmin>} />
          <Route path="/admin/operator/runtime-proof" element={<RequireAdmin><OperatorPanel section="runtime-proof" /></RequireAdmin>} />
          <Route path="/admin/control-room"    element={<RequireAdmin><OperatorPanel section="dashboard" /></RequireAdmin>} />
          <Route path="/admin/scanner"          element={<RequireAdmin><ScannerStatus /></RequireAdmin>} />
          <Route path="/admin/scanner-config"   element={<RequireAdmin><ScannerConfig /></RequireAdmin>} />
          <Route path="/admin/providers"        element={<RequireAdmin><ProviderHealth /></RequireAdmin>} />
          <Route path="/admin/candidates"       element={<RequireAdmin><Candidates /></RequireAdmin>} />
          <Route path="/admin/rejected"         element={<RequireAdmin><RejectedSetups /></RequireAdmin>} />
          <Route path="/admin/signals"          element={<RequireAdmin><SignalsManager /></RequireAdmin>} />
          <Route path="/admin/signals/new"      element={<RequireAdmin><ManualSignal /></RequireAdmin>} />
          <Route path="/admin/telegram-test"    element={<RequireAdmin><TelegramTest /></RequireAdmin>} />
          <Route path="/admin/telegram"         element={<RequireAdmin><TelegramLogs /></RequireAdmin>} />
          <Route path="/admin/telegram-links"   element={<RequireAdmin><TelegramLinks /></RequireAdmin>} />
          <Route path="/admin/telegram-requests" element={<RequireAdmin><TelegramLinks /></RequireAdmin>} />
          <Route path="/admin/users"            element={<RequireAdmin><UsersAccess /></RequireAdmin>} />
          <Route path="/admin/customers"        element={<RequireAdmin><Customers /></RequireAdmin>} />
          <Route path="/admin/access-requests"  element={<RequireAdmin><AccessRequests /></RequireAdmin>} />
          <Route path="/admin/audit"            element={<RequireAdmin><AuditLogs /></RequireAdmin>} />
          <Route path="/admin/scheduler"          element={<RequireAdmin><SchedulerGuide /></RequireAdmin>} />
          <Route path="/admin/outcomes"          element={<RequireAdmin><OutcomeTracking /></RequireAdmin>} />
          <Route path="/admin/performance"       element={<RequireAdmin><Performance /></RequireAdmin>} />
          <Route path="/admin/provider-comparison" element={<RequireAdmin><ProviderComparison /></RequireAdmin>} />
          <Route path="/admin/providers/binance" element={<RequireAdmin><BinanceOperations /></RequireAdmin>} />
          <Route path="/admin/providers/bybit" element={<RequireAdmin><BybitOperations /></RequireAdmin>} />
          <Route path="/admin/providers/mt5-personal" element={<RequireAdmin><MT5PersonalOperations /></RequireAdmin>} />
          <Route path="/admin/providers/mt5-prop" element={<RequireAdmin><MT5PropOperations /></RequireAdmin>} />
          <Route path="/admin/providers/comparison" element={<RequireAdmin><ProviderComparison /></RequireAdmin>} />
          <Route path="/admin/checklist"         element={<RequireAdmin><SetupChecklist /></RequireAdmin>} />
          <Route path="/admin/strategy-config"   element={<RequireAdmin><StrategyConfig /></RequireAdmin>} />
          <Route path="/admin/execution"         element={<RequireAdmin><Execution /></RequireAdmin>} />
          <Route path="/admin/trading-brain"     element={<RequireAdmin><TradingBrain /></RequireAdmin>} />
          <Route path="/admin/modes"             element={<RequireAdmin><Modes /></RequireAdmin>} />
          <Route path="/admin/backtest"          element={<RequireAdmin><BacktestLab /></RequireAdmin>} />
          <Route path="/admin/backtest-lab"      element={<RequireAdmin><BacktestLab /></RequireAdmin>} />
          <Route path="/admin/handoff"           element={<RequireAdmin><Handoff /></RequireAdmin>} />
          <Route path="/admin/prop"              element={<RequireAdmin><PropTradingPanel /></RequireAdmin>} />
          <Route path="/admin/retention"         element={<RequireAdmin><RetentionPolicies /></RequireAdmin>} />
          <Route path="/admin/storage"           element={<RequireAdmin><StorageStatus /></RequireAdmin>} />
          <Route path="/admin/mt5-bridge"       element={<RequireAdmin><Mt5Bridge /></RequireAdmin>} />

          {/* Fallback */}
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </AuthProvider>
    </BrowserRouter>
  );
}

export default App;
