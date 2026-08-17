import { X, Share, PlusSquare, CheckCircle, Smartphone, ArrowDown } from 'lucide-react';
import { usePWA } from '../../contexts/PWAContext';

export function IOSInstallGuideModal() {
  const { showIOSGuide, setShowIOSGuide, isSafari } = usePWA();

  if (!showIOSGuide) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-0 sm:p-4 bg-black/80 backdrop-blur-sm animate-in fade-in duration-200">
      <div 
        className="w-full max-w-md bg-zinc-900 border-t sm:border border-zinc-800 rounded-t-3xl sm:rounded-2xl p-6 shadow-2xl shadow-black/80 text-zinc-100 relative pb-safe"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Close Button */}
        <button
          onClick={() => setShowIOSGuide(false)}
          className="absolute top-4 right-4 p-2 rounded-full text-zinc-400 hover:text-white bg-zinc-800/80 hover:bg-zinc-700 transition-colors"
          aria-label="Close"
        >
          <X size={18} />
        </button>

        {/* Header with App Icon */}
        <div className="flex items-center gap-3.5 mb-5">
          <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-blue-600 to-indigo-700 flex items-center justify-center shadow-lg shadow-blue-600/30">
            <Smartphone size={24} className="text-white" />
          </div>
          <div>
            <h3 className="text-lg font-bold text-white leading-snug">Install HashiBot on iOS</h3>
            <p className="text-xs text-zinc-400">Add to Home Screen for native fullscreen speed</p>
          </div>
        </div>

        {!isSafari && (
          <div className="mb-4 p-3 rounded-xl bg-amber-500/10 border border-amber-500/30 text-amber-300 text-xs flex items-start gap-2">
            <span className="text-base leading-none">⚠️</span>
            <span>
              Please open <strong>hashibot</strong> in <strong>Apple Safari</strong> to install to your home screen.
            </span>
          </div>
        )}

        {/* Step by Step Guide */}
        <div className="space-y-3.5 my-5">
          {/* Step 1 */}
          <div className="flex items-start gap-3 p-3 rounded-xl bg-zinc-950/60 border border-zinc-800/60">
            <div className="w-7 h-7 rounded-lg bg-blue-500/20 text-blue-400 font-bold text-xs flex items-center justify-center shrink-0 mt-0.5">
              1
            </div>
            <div className="flex-1 text-xs leading-relaxed text-zinc-300">
              Tap the <span className="inline-flex items-center gap-1 font-semibold text-white px-1.5 py-0.5 bg-zinc-800 rounded border border-zinc-700"><Share size={12} className="text-blue-400" /> Share</span> icon in Safari's bottom toolbar.
            </div>
          </div>

          {/* Step 2 */}
          <div className="flex items-start gap-3 p-3 rounded-xl bg-zinc-950/60 border border-zinc-800/60">
            <div className="w-7 h-7 rounded-lg bg-blue-500/20 text-blue-400 font-bold text-xs flex items-center justify-center shrink-0 mt-0.5">
              2
            </div>
            <div className="flex-1 text-xs leading-relaxed text-zinc-300">
              Scroll down and tap <span className="inline-flex items-center gap-1 font-semibold text-white px-1.5 py-0.5 bg-zinc-800 rounded border border-zinc-700"><PlusSquare size={12} className="text-emerald-400" /> Add to Home Screen</span>.
            </div>
          </div>

          {/* Step 3 */}
          <div className="flex items-start gap-3 p-3 rounded-xl bg-zinc-950/60 border border-zinc-800/60">
            <div className="w-7 h-7 rounded-lg bg-blue-500/20 text-blue-400 font-bold text-xs flex items-center justify-center shrink-0 mt-0.5">
              3
            </div>
            <div className="flex-1 text-xs leading-relaxed text-zinc-300">
              Tap <span className="font-semibold text-white px-1.5 py-0.5 bg-zinc-800 rounded border border-zinc-700">Add</span> in the top-right corner to finish.
            </div>
          </div>
        </div>

        {/* Bottom Pointer Indicator (Pointing towards bottom Safari bar) */}
        <div className="flex items-center justify-center gap-1.5 text-[11px] text-zinc-500 my-2">
          <ArrowDown size={13} className="text-blue-400 animate-bounce" />
          <span>Safari Share button is located in your bottom toolbar</span>
        </div>

        {/* Action Button */}
        <button
          onClick={() => setShowIOSGuide(false)}
          className="w-full mt-3 py-3 rounded-xl bg-blue-600 hover:bg-blue-500 active:bg-blue-700 text-white font-semibold text-sm transition-colors flex items-center justify-center gap-2 shadow-lg shadow-blue-600/30"
        >
          <CheckCircle size={16} />
          Got It
        </button>
      </div>
    </div>
  );
}
