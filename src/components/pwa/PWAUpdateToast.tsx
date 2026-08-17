import { RefreshCw, Sparkles, X } from 'lucide-react';
import { usePWA } from '../../contexts/PWAContext';
import { useState } from 'react';

export function PWAUpdateToast() {
  const { isUpdateAvailable, updateApp } = usePWA();
  const [dismissed, setDismissed] = useState(false);

  if (!isUpdateAvailable || dismissed) return null;

  return (
    <div className="fixed top-4 left-1/2 -translate-x-1/2 z-50 max-w-sm w-[92%] animate-in slide-in-from-top-4 duration-300 pt-safe">
      <div className="bg-zinc-900 border border-blue-500/50 rounded-2xl p-3.5 shadow-2xl shadow-blue-950/50 backdrop-blur-md flex items-center justify-between gap-3 text-zinc-100">
        <div className="flex items-center gap-2.5 min-w-0">
          <div className="w-8 h-8 rounded-lg bg-blue-500/20 text-blue-400 flex items-center justify-center shrink-0">
            <Sparkles size={16} />
          </div>
          <div className="min-w-0">
            <h5 className="text-xs font-bold text-white truncate">Update Available</h5>
            <p className="text-[11px] text-zinc-400 truncate">A fresh version of HashiBot is ready</p>
          </div>
        </div>

        <div className="flex items-center gap-1.5 shrink-0">
          <button
            onClick={updateApp}
            className="px-3 py-1.5 rounded-lg bg-blue-600 hover:bg-blue-500 text-white font-semibold text-xs transition-colors flex items-center gap-1 shadow-md shadow-blue-600/30"
          >
            <RefreshCw size={12} />
            Update
          </button>
          <button
            onClick={() => setDismissed(true)}
            className="p-1.5 rounded-lg text-zinc-500 hover:text-zinc-300"
            aria-label="Dismiss update notification"
          >
            <X size={14} />
          </button>
        </div>
      </div>
    </div>
  );
}
