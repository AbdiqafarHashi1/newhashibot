import { useState, useEffect, useCallback } from 'react';
import { AppLayout } from '../../components/layout/AppLayout';
import { 
  getLocalStoredAccounts, 
  getActiveAccountId, 
  setActiveAccountId, 
  LiveMT5AccountState 
} from '../../lib/mt5LiveEngine';
import { MT5PersonalAlphaHub } from '../../components/mt5/MT5PersonalAlphaHub';
import { ConnectMT5AccountModal } from '../../components/mt5/ConnectMT5AccountModal';
import { Link } from 'react-router-dom';
import { Award, Server, Flame } from 'lucide-react';

export default function MT5PersonalPortal() {
  const [accounts, setAccounts] = useState<LiveMT5AccountState[]>([]);
  const [selectedAccount, setSelectedAccount] = useState<LiveMT5AccountState | null>(null);
  const [isConnectModalOpen, setIsConnectModalOpen] = useState(false);
  const [loading, setLoading] = useState(true);

  const loadAccounts = useCallback(() => {
    const all = getLocalStoredAccounts();
    const personalAccounts = all.filter(a => a.accountType === 'personal');
    setAccounts(personalAccounts);

    const activeId = getActiveAccountId('personal');
    const matched = personalAccounts.find(a => a.id === activeId) || personalAccounts[0] || null;
    setSelectedAccount(matched);
    setLoading(false);
  }, []);

  useEffect(() => {
    loadAccounts();
  }, [loadAccounts]);

  const handleSelectAccount = (acc: LiveMT5AccountState) => {
    setSelectedAccount(acc);
    setActiveAccountId('personal', acc.id);
  };

  const handleAccountAdded = (newAcc: LiveMT5AccountState) => {
    loadAccounts();
    setSelectedAccount(newAcc);
    setActiveAccountId('personal', newAcc.id);
  };

  if (loading) {
    return (
      <AppLayout>
        <div className="flex items-center justify-center h-64">
          <div className="w-8 h-8 border-2 border-emerald-500 border-t-transparent rounded-full animate-spin" />
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
            <Link
              to="/app/mt5-prop"
              className="px-3 py-1.5 rounded-xl text-xs font-medium text-zinc-400 hover:text-zinc-100 hover:bg-zinc-800 transition-colors flex items-center gap-1.5"
            >
              <Award size={14} className="text-zinc-500" />
              <span>Switch to Prop Challenge Mode</span>
            </Link>

            <div className="px-3 py-1.5 rounded-xl bg-emerald-600/20 text-emerald-300 border border-emerald-500/40 text-xs font-bold flex items-center gap-2 shadow-sm">
              <Server size={14} className="text-emerald-400" />
              <span>Personal Live Mode (High Alpha)</span>
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
            </div>
          </div>

          <div className="text-[11px] text-zinc-400 hidden sm:flex items-center gap-2">
            <Flame size={13} className="text-emerald-400" />
            <span>Unrestricted Compounding & Multi-Target Runner Execution Active</span>
          </div>
        </div>

        {/* Main Personal Alpha Hub */}
        <MT5PersonalAlphaHub
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
          defaultType="personal"
          onAccountAdded={handleAccountAdded}
        />
      </div>
    </AppLayout>
  );
}
