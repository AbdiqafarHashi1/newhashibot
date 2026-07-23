import React from 'react';
import { Clock, XCircle, CheckCircle, Radio } from 'lucide-react';

export type EventItem = {
  id?: string;
  timestamp: string;
  source?: string;
  title: string;
  summary?: string;
  result?: 'SUCCESS' | 'FAILED' | 'PENDING' | 'SKIPPED' | string;
  actor?: string;
  error?: string;
};

export function EventRow({ event }: { event: EventItem }) {
  const isFailed = event.result === 'FAILED';
  const isSuccess = event.result === 'SUCCESS';

  return (
    <div className="flex items-start gap-3 p-3 rounded-xl border border-zinc-800/60 bg-zinc-950/40 hover:bg-zinc-900/60 transition-colors">
      <div className="mt-0.5 shrink-0">
        {isFailed ? (
          <XCircle size={15} className="text-red-400" />
        ) : isSuccess ? (
          <CheckCircle size={15} className="text-emerald-400" />
        ) : (
          <Radio size={15} className="text-blue-400 animate-pulse" />
        )}
      </div>

      <div className="flex-1 min-w-0 space-y-0.5">
        <div className="flex items-center justify-between gap-2">
          <span className="font-semibold text-xs text-zinc-100 truncate">{event.title}</span>
          <span className="text-[10px] font-mono text-zinc-500 shrink-0">
            {new Date(event.timestamp).toLocaleTimeString()}
          </span>
        </div>

        {event.summary && <p className="text-xs text-zinc-400 leading-relaxed font-mono">{event.summary}</p>}

        {event.error && (
          <div className="mt-1 text-[11px] font-mono text-red-300 bg-red-500/10 border border-red-500/20 px-2 py-1 rounded-md">
            {event.error}
          </div>
        )}

        <div className="flex items-center gap-3 text-[10px] text-zinc-500 pt-1 font-mono">
          {event.source && <span>Source: {event.source}</span>}
          {event.actor && <span>Actor: {event.actor}</span>}
        </div>
      </div>
    </div>
  );
}

export function Timeline({ events, title = 'Runtime Event Stream' }: { events: EventItem[]; title?: string }) {
  if (!events || events.length === 0) {
    return (
      <div className="rounded-2xl border border-zinc-800 bg-zinc-900/60 p-6 text-center text-xs text-zinc-500">
        No runtime events recorded in the current session window.
      </div>
    );
  }

  return (
    <div className="rounded-2xl border border-zinc-800 bg-zinc-900/80 p-4 space-y-3 shadow-lg">
      <div className="flex items-center justify-between pb-2 border-b border-zinc-800">
        <div className="flex items-center gap-2">
          <Clock size={16} className="text-blue-400" />
          <h3 className="font-bold text-xs uppercase tracking-wider text-zinc-300">{title}</h3>
        </div>
        <span className="text-[11px] font-mono text-zinc-500">{events.length} Events</span>
      </div>

      <div className="space-y-2 max-h-96 overflow-y-auto pr-1 scrollbar-thin">
        {events.map((evt, idx) => (
          <EventRow key={evt.id || idx} event={evt} />
        ))}
      </div>
    </div>
  );
}
