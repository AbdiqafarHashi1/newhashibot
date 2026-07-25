import { useState, useEffect } from 'react';
import { useSearchParams } from 'react-router-dom';
import { AdminLayout } from '../../components/layout/AdminLayout';
import { 
  LayoutDashboard, Shield, Server, Activity, Terminal, 
  Sliders, ShieldCheck, Cpu
} from 'lucide-react';

import { MT5DashboardTab } from '../../components/operations/mt5/MT5DashboardTab';
import { MT5AccountsTab } from '../../components/operations/mt5/MT5AccountsTab';
import { MT5BridgesTab } from '../../components/operations/mt5/MT5BridgesTab';
import { MT5RuntimeTab } from '../../components/operations/mt5/MT5RuntimeTab';
import { MT5CommandsTab } from '../../components/operations/mt5/MT5CommandsTab';
import { MT5DiagnosticsTab } from '../../components/operations/mt5/MT5DiagnosticsTab';
import { MT5EventsTab } from '../../components/operations/mt5/MT5EventsTab';
import { MT5ReconciliationTab } from '../../components/operations/mt5/MT5ReconciliationTab';
import { MT5SettingsTab } from '../../components/operations/mt5/MT5SettingsTab';

export type MT5SubTab = 
  | 'dashboard' 
  | 'accounts' 
  | 'bridges' 
  | 'runtime' 
  | 'commands' 
  | 'diagnostics' 
  | 'events' 
  | 'reconciliation'
  | 'settings';

interface Props {
  defaultTab?: MT5SubTab;
  filterMode?: 'personal' | 'prop' | 'all';
}

export default function MT5OperationsCenter({ defaultTab = 'dashboard' }: Props) {
  const [searchParams, setSearchParams] = useSearchParams();
  const tabFromUrl = (searchParams.get('tab') as MT5SubTab) || defaultTab;
  const [activeTab, setActiveTab] = useState<MT5SubTab>(tabFromUrl);
  const [selectedAccountIdForRuntime, setSelectedAccountIdForRuntime] = useState<string | undefined>();

  useEffect(() => {
    const currentUrlTab = searchParams.get('tab') as MT5SubTab;
    if (currentUrlTab && currentUrlTab !== activeTab) {
      setActiveTab(currentUrlTab);
    }
  }, [searchParams, activeTab]);

  const handleTabChange = (tab: MT5SubTab) => {
    setActiveTab(tab);
    setSearchParams({ tab });
  };

  const handleSelectAccountForRuntime = (accountId: string) => {
    setSelectedAccountIdForRuntime(accountId);
    handleTabChange('runtime');
  };

  const tabs: { id: MT5SubTab; label: string; icon: React.ElementType }[] = [
    { id: 'dashboard', label: 'Dashboard', icon: LayoutDashboard },
    { id: 'accounts', label: 'Accounts', icon: Shield },
    { id: 'bridges', label: 'Bridges', icon: Server },
    { id: 'runtime', label: 'Runtime', icon: Activity },
    { id: 'commands', label: 'Commands', icon: Terminal },
    { id: 'diagnostics', label: 'Diagnostics', icon: Sliders },
    { id: 'events', label: 'Events', icon: Cpu },
    { id: 'reconciliation', label: 'Reconciliation', icon: ShieldCheck },
    { id: 'settings', label: 'Settings', icon: Sliders },
  ];

  return (
    <AdminLayout>
      <div className="space-y-6">
        {/* Header & Operations Breadcrumb */}
        <div className="bg-zinc-900 border border-zinc-800 rounded-2xl p-6 space-y-4 shadow-xl">
          <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
            <div>
              <div className="flex items-center gap-2 text-xs font-semibold text-zinc-500 uppercase tracking-wider mb-1">
                <span>Operations</span>
                <span>/</span>
                <span className="text-blue-400">MT5 Operations Center</span>
                <span>/</span>
                <span className="text-zinc-300 capitalize">{activeTab}</span>
              </div>
              <h1 className="text-xl md:text-2xl font-extrabold text-white tracking-tight flex items-center gap-2.5">
                <Cpu size={24} className="text-blue-500" />
                MT5 Operations Center
              </h1>
              <p className="text-xs text-zinc-400 mt-1">
                Unified control, bridge management, and execution telemetry for MetaTrader 5 Personal, Prop, and Demo terminals.
              </p>
            </div>

            <div className="flex items-center gap-2">
              <span className="text-xs text-emerald-400 bg-emerald-500/10 border border-emerald-500/20 px-3 py-1 rounded-full font-bold uppercase tracking-wider flex items-center gap-1.5">
                <div className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
                Bridge Protocol v1.0.0 Ready
              </span>
            </div>
          </div>

          {/* Sub-Navigation Tabs */}
          <div className="flex items-center gap-1 border-t border-zinc-800 pt-4 overflow-x-auto no-scrollbar">
            {tabs.map((tab) => {
              const Icon = tab.icon;
              const isActive = activeTab === tab.id;
              return (
                <button
                  key={tab.id}
                  onClick={() => handleTabChange(tab.id)}
                  className={`flex items-center gap-2 px-3.5 py-2 rounded-xl text-xs font-bold transition-all whitespace-nowrap ${
                    isActive
                      ? 'bg-blue-600 text-white shadow-lg shadow-blue-600/20'
                      : 'text-zinc-400 hover:text-zinc-200 hover:bg-zinc-800/60'
                  }`}
                >
                  <Icon size={14} />
                  <span>{tab.label}</span>
                </button>
              );
            })}
          </div>
        </div>

        {/* Tab Content Display */}
        <div className="min-h-[500px]">
          {activeTab === 'dashboard' && <MT5DashboardTab onNavigateTab={(t) => handleTabChange(t as MT5SubTab)} />}
          {activeTab === 'accounts' && <MT5AccountsTab onSelectAccountForRuntime={handleSelectAccountForRuntime} />}
          {activeTab === 'bridges' && <MT5BridgesTab />}
          {activeTab === 'runtime' && <MT5RuntimeTab selectedAccountId={selectedAccountIdForRuntime} />}
          {activeTab === 'commands' && <MT5CommandsTab />}
          {activeTab === 'diagnostics' && <MT5DiagnosticsTab />}
          {activeTab === 'events' && <MT5EventsTab />}
          {activeTab === 'reconciliation' && <MT5ReconciliationTab />}
          {activeTab === 'settings' && <MT5SettingsTab />}
        </div>
      </div>
    </AdminLayout>
  );
}
