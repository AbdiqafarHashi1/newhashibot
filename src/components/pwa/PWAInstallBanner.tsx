import { useState, useEffect } from 'react';
import { Download, X, Zap, Sparkles } from 'lucide-react';
import { usePWA } from '../../contexts/PWAContext';

export function PWAInstallBanner() {
  const { isInstallable, isInstalled, promptInstall, dismissPrompt } = usePWA();
  const [isVisible, setIsVisible] = useState(false);

  useEffect(() => {
    // Give user 2 seconds of clean browsing before displaying the subtle install banner
    if (isInstallable && !isInstalled) {
      const timer = setTimeout(() => setIsVisible(true), 2000);
      return () => clearTimeout(timer);
    } else {
      setIsVisible(false);
    }
  }, [isInstallable, isInstalled]);

  if (!isVisible || isInstalled) return null;

  return (
    <aside
      aria-label="App Installation Offer"
      className="fixed bottom-3 sm:bottom-6 left-3 right-3 sm:left-auto sm:right-6 sm:max-w-md z-40 animate-in slide-in-from-bottom-5 duration-300 pb-safe"
    >
      <div className="bg-zinc-900/95 border border-blue-500/30 rounded-2xl p-4 shadow-2xl shadow-black/80 backdrop-blur-md text-zinc-100 flex items-center gap-3.5 relative overflow-hidden">
        {/* Ambient Top Highlight */}
        <div className="absolute top-0 inset-x-0 h-0.5 bg-gradient-to-r from-transparent via-blue-500 to-transparent opacity-60" />

        {/* App Logo */}
        <div className="w-11 h-11 rounded-xl bg-gradient-to-br from-blue-600 to-indigo-700 flex items-center justify-center shrink-0 shadow-md shadow-blue-600/30 ring-1 ring-white/10">
          <Zap size={22} className="text-white" />
        </div>

        {/* Copy */}
        <div className="flex-1 min-w-0 pr-1">
          <div className="flex items-center gap-1.5">
            <h4 className="text-xs sm:text-sm font-bold text-white tracking-tight truncate">
              Install Hashibot App
            </h4>
            <span className="inline-flex items-center gap-0.5 px-1.5 py-0.2 rounded-full bg-blue-500/20 text-blue-400 font-mono text-[9px] font-semibold uppercase tracking-wider shrink-0">
              <Sparkles size={9} /> Fast
            </span>
          </div>
          <p className="text-[11px] text-zinc-400 leading-tight mt-0.5 truncate sm:whitespace-normal">
            Install for instant speed, real-time alerts & fullscreen mode.
          </p>
        </div>

        {/* Action Buttons */}
        <div className="flex items-center gap-1.5 shrink-0">
          <button
            onClick={() => promptInstall()}
            className="px-3.5 py-2 rounded-xl bg-blue-600 hover:bg-blue-500 active:bg-blue-700 text-white font-semibold text-xs transition-all shadow-md shadow-blue-600/30 flex items-center gap-1.5"
          >
            <Download size={13} />
            <span>Install</span>
          </button>
          <button
            onClick={() => {
              setIsVisible(false);
              dismissPrompt();
            }}
            className="p-2 rounded-xl text-zinc-500 hover:text-zinc-300 hover:bg-zinc-800 transition-colors"
            aria-label="Dismiss installation prompt"
          >
            <X size={15} />
          </button>
        </div>
      </div>
    </aside>
  );
}
