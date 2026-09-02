import { useState, useEffect, useCallback } from 'react';
import { AppLayout } from '../../components/layout/AppLayout';
import { 
  getLocalStoredAccounts, 
  getActiveAccountId, 
  setActiveAccountId, 
  LiveMT5AccountState 
} from '../../lib/mt5LiveEngine';
import { MT5PropProtectionHub } from '../../components/mt5/MT5PropProtectionHub';
import { ConnectMT5AccountModal } from '../../components/mt5/ConnectMT5AccountModal';
import { Link } from 'react-router-dom';
import { Award, ArrowRight, ShieldCheck, Server } from 'lucide-react';

export default function MT5PropPortal() {
  const [accounts, setAccounts] = useState<LiveMT5AccountState[]>([]);
  const [selectedAccount, setSelectedAccount] = useState<LiveMT5AccountState | null>(null);
  const [isConnectModalOpen, setIsConnectModalOpen] = useState(false);
  const [loading, setLoading] = useState(true);

  const loadAccounts = useCallback(() => {
    const all = getLocalStoredAccounts();
    const propAccounts = all.filter(a => a.accountType === 'prop');
    setAccounts(propAccounts);

    const activeId = getActiveAccountId('prop');
    const matched = propAccounts.find(a => a.id === activeId) || propAccounts[0] || null;
    setSelectedAccount(matched);
    setLoading(false);
  }, []);

  useEffect(() => {
    loadAccounts();
  }, [loadAccounts]);

  const handleSelectAccount = (acc: LiveMT5AccountState) => {
    setSelectedAccount(acc);
    setActiveAccountId('prop', acc.id);
  };

  const handleAccountAdded = (newAcc: LiveMT5AccountState) => {
    loadAccounts();
    setSelectedAccount(newAcc);
    setActiveAccountId('prop', newAcc.id);
  };

  if (loading) {
    return (
      <AppLayout>
        <div className="flex items-center justify-center h-64">
          <div className="w-8 h-8 border-2 border-purple-500 border-t-transparent rounded-full animate-spin" />
        </div>
      </AppLayout>
    );
  }

  return (
    <AppLayout>
      <div className="space-y-6 max-w-7xl mx-auto pb-12">
        {/* Navigation Mode Switcher Bar */}
        <div className="flex flex-wrap items-center justify-between gap-3 bg-zinc-900/80 p-2.5 rounded-2xl border border-zinc-800">
          <div className="flex items-center gap-2">
            <div className="px-3 py-1.5 rounded-xl bg-purple-600/20 text-purple-300 border border-purple-500/40 text-xs font-bold flex items-center gap-2 shadow-sm">
              <Award size={14} className="text-purple-400" />
              <span>Prop Challenge Mode</span>
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
            </div>
            <Link
              to="/app/mt5-personal"
              className="px-3 py-1.5 rounded-xl text-xs font-medium text-zinc-400 hover:text-zinc-100 hover:bg-zinc-800 transition-colors flex items-center gap-1.5"
            >
              <Server size={14} className="text-zinc-500" />
              <span>Switch to Personal Live (High Alpha)</span>
              <ArrowRight size={12} />
            </Link>
          </div>

          <div className="text-[11px] text-zinc-400 hidden sm:flex items-center gap-2">
            <ShieldCheck size={13} className="text-purple-400" />
            <span>5% Daily DD Lock & News Blackout Protection Active</span>
          </div>
        </div>

        {/* Main Prop Hub */}
        <MT5PropProtectionHub
          accounts={accounts}
          selectedAccount={selectedAccount}
          onSelectAccount={handleSelectAccount}
          onOpenConnectModal={() => setIsConnectModalOpen(true)}
          onRefresh={loadAccounts}
        />

        {/* Connect Modal */}
        <ConnectMT5AccountModal
          isOpen={isConnectModalOpen}
          onClose={() => setIsConnectModalOpen(false)}
          defaultType="prop"
          onAccountAdded={handleAccountAdded}
        />
      </div>
    </AppLayout>
  );
}
