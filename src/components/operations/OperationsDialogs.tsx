import React, { useState } from 'react';
import { AlertTriangle, Lock, ShieldAlert, X } from 'lucide-react';

export function ResponsiveDrawer({
  isOpen,
  onClose,
  title,
  children,
}: {
  isOpen: boolean;
  onClose: () => void;
  title: string;
  children: React.ReactNode;
}) {
  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex justify-end bg-black/80 backdrop-blur-sm animate-fadeIn">
      <div className="w-full max-w-lg h-full bg-zinc-950 border-l border-zinc-800 p-6 space-y-6 overflow-y-auto shadow-2xl flex flex-col justify-between">
        <div className="space-y-4">
          <div className="flex items-center justify-between pb-4 border-b border-zinc-800">
            <h3 className="font-bold text-base text-zinc-100">{title}</h3>
            <button onClick={onClose} className="p-1.5 rounded-lg text-zinc-500 hover:text-zinc-200 hover:bg-zinc-900">
              <X size={18} />
            </button>
          </div>
          {children}
        </div>

        <div className="pt-4 border-t border-zinc-900">
          <button
            onClick={onClose}
            className="w-full py-2.5 rounded-xl border border-zinc-800 bg-zinc-900 hover:bg-zinc-800 text-xs font-bold text-zinc-300"
          >
            Close Specification
          </button>
        </div>
      </div>
    </div>
  );
}

export function DetailPanel({
  title,
  items,
}: {
  title: string;
  items: Array<{ label: string; value: React.ReactNode; fullWidth?: boolean }>;
}) {
  return (
    <div className="rounded-2xl border border-zinc-800 bg-zinc-900/60 p-4 space-y-3">
      <h4 className="font-bold text-xs uppercase tracking-wider text-zinc-400">{title}</h4>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs font-mono">
        {items.map((item, idx) => (
          <div
            key={idx}
            className={`bg-zinc-950/80 p-3 rounded-xl border border-zinc-800/80 space-y-1 ${
              item.fullWidth ? 'sm:col-span-2' : ''
            }`}
          >
            <span className="text-zinc-500 text-[10px] block uppercase">{item.label}</span>
            <div className="text-zinc-100 font-semibold break-all">{item.value}</div>
          </div>
        ))}
      </div>
    </div>
  );
}

export function TypedConfirmationDialog({
  isOpen,
  onClose,
  onConfirm,
  title,
  description,
  expectedPhrase,
  confirmLabel = 'Confirm Action',
  loading = false,
}: {
  isOpen: boolean;
  onClose: () => void;
  onConfirm: () => void;
  title: string;
  description: string;
  expectedPhrase: string;
  confirmLabel?: string;
  loading?: boolean;
}) {
  const [inputPhrase, setInputPhrase] = useState('');

  if (!isOpen) return null;

  const matches = inputPhrase.trim().toUpperCase() === expectedPhrase.trim().toUpperCase();

  const handleConfirm = () => {
    if (matches && !loading) {
      onConfirm();
      setInputPhrase('');
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm animate-fadeIn">
      <div className="w-full max-w-md rounded-2xl border border-red-500/40 bg-zinc-950 p-6 space-y-4 shadow-2xl">
        <div className="flex items-start justify-between">
          <div className="flex items-center gap-2.5 text-red-400">
            <ShieldAlert size={22} />
            <h3 className="font-bold text-base text-zinc-100">{title}</h3>
          </div>
          <button onClick={onClose} className="p-1 rounded-lg text-zinc-500 hover:text-zinc-200">
            <X size={18} />
          </button>
        </div>

        <p className="text-xs text-zinc-300 leading-relaxed font-mono bg-red-950/20 border border-red-500/20 p-3 rounded-xl">
          {description}
        </p>

        <div className="space-y-2">
          <label className="text-xs font-mono text-zinc-400 block">
            Type <span className="text-red-400 font-bold">{expectedPhrase}</span> to confirm:
          </label>
          <input
            type="text"
            value={inputPhrase}
            onChange={(e) => setInputPhrase(e.target.value)}
            placeholder={expectedPhrase}
            className="w-full px-3.5 py-2.5 rounded-xl border border-zinc-800 bg-zinc-900 text-sm font-mono text-zinc-100 focus:outline-none focus:border-red-500"
          />
        </div>

        <div className="flex items-center justify-end gap-2 pt-2 border-t border-zinc-900">
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 rounded-xl border border-zinc-800 bg-zinc-900 hover:bg-zinc-800 text-xs font-semibold text-zinc-300"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={handleConfirm}
            disabled={!matches || loading}
            className="px-4 py-2 rounded-xl bg-red-600 hover:bg-red-500 text-white font-bold text-xs transition-all shadow-lg shadow-red-950/50 disabled:opacity-40 disabled:pointer-events-none"
          >
            {loading ? 'Executing...' : confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}

export function AuditReasonDialog({
  isOpen,
  onClose,
  onConfirm,
  title,
  actionName,
  loading = false,
}: {
  isOpen: boolean;
  onClose: () => void;
  onConfirm: (reason: string) => void;
  title: string;
  actionName: string;
  loading?: boolean;
}) {
  const [reason, setReason] = useState('');

  if (!isOpen) return null;

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (reason.trim().length >= 5 && !loading) {
      onConfirm(reason.trim());
      setReason('');
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm animate-fadeIn">
      <div className="w-full max-w-md rounded-2xl border border-zinc-800 bg-zinc-950 p-6 space-y-4 shadow-2xl">
        <div className="flex items-start justify-between">
          <div className="flex items-center gap-2 text-blue-400">
            <Lock size={20} />
            <h3 className="font-bold text-base text-zinc-100">{title}</h3>
          </div>
          <button onClick={onClose} className="p-1 rounded-lg text-zinc-500 hover:text-zinc-200">
            <X size={18} />
          </button>
        </div>

        <p className="text-xs text-zinc-400 font-mono">
          Operator Action: <span className="text-zinc-200 font-bold">{actionName}</span>
        </p>

        <form onSubmit={handleSubmit} className="space-y-3">
          <div className="space-y-1.5">
            <label className="text-xs font-mono text-zinc-400 block">
              Audit Reason / Change Order Ticket (min 5 characters):
            </label>
            <textarea
              required
              rows={3}
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              placeholder="e.g. Approved maintenance window for scanner recalibration #OPS-842"
              className="w-full p-3 rounded-xl border border-zinc-800 bg-zinc-900 text-xs font-mono text-zinc-100 focus:outline-none focus:border-blue-500"
            />
          </div>

          <div className="flex items-center justify-end gap-2 pt-2 border-t border-zinc-900">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 rounded-xl border border-zinc-800 bg-zinc-900 hover:bg-zinc-800 text-xs font-semibold text-zinc-300"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={reason.trim().length < 5 || loading}
              className="px-4 py-2 rounded-xl bg-blue-600 hover:bg-blue-500 text-white font-bold text-xs transition-all shadow-lg shadow-blue-950/50 disabled:opacity-40"
            >
              {loading ? 'Recording...' : 'Authorize Action'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

export function ActionFailureModal({
  isOpen,
  onClose,
  title = 'Operator Action Blocked / Failed',
  errorSummary,
  blocker,
  route,
  exactError,
}: {
  isOpen: boolean;
  onClose: () => void;
  title?: string;
  errorSummary: string;
  blocker?: string;
  route?: string;
  exactError?: string;
}) {
  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm animate-fadeIn">
      <div className="w-full max-w-lg rounded-2xl border border-red-500/50 bg-zinc-950 p-6 space-y-4 shadow-2xl">
        <div className="flex items-start justify-between">
          <div className="flex items-center gap-2 text-red-400">
            <AlertTriangle size={22} />
            <h3 className="font-bold text-base text-zinc-100">{title}</h3>
          </div>
          <button onClick={onClose} className="p-1 rounded-lg text-zinc-500 hover:text-zinc-200">
            <X size={18} />
          </button>
        </div>

        <div className="space-y-3 font-mono text-xs">
          <div className="bg-red-500/10 border border-red-500/20 p-3 rounded-xl text-red-300 font-semibold">
            {errorSummary}
          </div>

          {blocker && (
            <div className="bg-zinc-900 p-3 rounded-xl border border-zinc-800 space-y-1">
              <span className="text-zinc-500 text-[10px] uppercase block">Primary Blocker:</span>
              <span className="text-yellow-400 font-bold">{blocker}</span>
            </div>
          )}

          {route && (
            <div className="bg-zinc-900 p-3 rounded-xl border border-zinc-800 space-y-1">
              <span className="text-zinc-500 text-[10px] uppercase block">Target Route:</span>
              <span className="text-blue-300">{route}</span>
            </div>
          )}

          {exactError && (
            <div className="bg-zinc-900 p-3 rounded-xl border border-zinc-800 space-y-1">
              <span className="text-zinc-500 text-[10px] uppercase block">Exact Edge Function Error:</span>
              <pre className="text-red-400 whitespace-pre-wrap text-[11px] font-mono">{exactError}</pre>
            </div>
          )}
        </div>

        <div className="flex justify-end pt-2 border-t border-zinc-900">
          <button
            type="button"
            onClick={onClose}
            className="px-5 py-2 rounded-xl bg-zinc-800 hover:bg-zinc-700 text-xs font-bold text-zinc-200"
          >
            Acknowledge
          </button>
        </div>
      </div>
    </div>
  );
}
