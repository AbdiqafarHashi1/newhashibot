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
import SignalHistory from './pages/app/SignalHistory';
import SignalDetail from './pages/app/SignalDetail';
import TelegramSetup from './pages/app/TelegramSetup';
import Watchlist from './pages/app/Watchlist';
import Account from './pages/app/Account';

// Admin pages
import ControlRoom from './pages/admin/ControlRoom';
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
  if (profile.role === 'admin') return <Navigate to="/admin/control-room" replace />;
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
          <Route path="/app/history"     element={<RequireAuth><SignalHistory /></RequireAuth>} />
          <Route path="/app/telegram"    element={<RequireAuth><TelegramSetup /></RequireAuth>} />
          <Route path="/app/watchlist"   element={<RequireAuth><Watchlist /></RequireAuth>} />
          <Route path="/app/account"     element={<RequireAuth><Account /></RequireAuth>} />

          {/* Admin */}
          <Route path="/admin/control-room"    element={<RequireAdmin><ControlRoom /></RequireAdmin>} />
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
          <Route path="/admin/access-requests"  element={<RequireAdmin><AccessRequests /></RequireAdmin>} />
          <Route path="/admin/audit"            element={<RequireAdmin><AuditLogs /></RequireAdmin>} />
          <Route path="/admin/scheduler"          element={<RequireAdmin><SchedulerGuide /></RequireAdmin>} />
          <Route path="/admin/outcomes"          element={<RequireAdmin><OutcomeTracking /></RequireAdmin>} />
          <Route path="/admin/performance"       element={<RequireAdmin><Performance /></RequireAdmin>} />
          <Route path="/admin/checklist"         element={<RequireAdmin><SetupChecklist /></RequireAdmin>} />
          <Route path="/admin/strategy-config"   element={<RequireAdmin><StrategyConfig /></RequireAdmin>} />
          <Route path="/admin/execution"         element={<RequireAdmin><Execution /></RequireAdmin>} />
          <Route path="/admin/trading-brain"     element={<RequireAdmin><TradingBrain /></RequireAdmin>} />
          <Route path="/admin/modes"             element={<RequireAdmin><Modes /></RequireAdmin>} />
          <Route path="/admin/backtest-lab"      element={<RequireAdmin><BacktestLab /></RequireAdmin>} />
          <Route path="/admin/handoff"           element={<RequireAdmin><Handoff /></RequireAdmin>} />

          {/* Fallback */}
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </AuthProvider>
    </BrowserRouter>
  );
}

export default App;
