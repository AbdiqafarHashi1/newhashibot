import { useState, useEffect, useCallback } from 'react';
import { Link } from 'react-router-dom';
import { supabase } from '../../lib/supabase';
import { Signal } from '../../lib/types';
import { signalSound } from '../../lib/signalSound';
import { formatEATTime } from '../../lib/timeUtils';
import {
  Volume2, VolumeX, Bell, X, ArrowRight, Sparkles
} from 'lucide-react';
import { gradeBadge, directionBadge } from '../ui/Badge';

export function LiveSignalNotifier() {
  const [activeSignalNotification, setActiveSignalNotification] = useState<Signal | null>(null);
  const [soundEnabled, setSoundEnabled] = useState(signalSound.isEnabled());
  const [notificationPermission, setNotificationPermission] = useState<NotificationPermission>('default');
  const [isDismissed, setIsDismissed] = useState(false);

  useEffect(() => {
    if ('Notification' in window) {
      setNotificationPermission(Notification.permission);
    }
  }, []);

  const handleNewSignal = useCallback((newSignal: Signal) => {
    // 1. Play synthesized audio chime
    if (newSignal.direction === 'buy') {
      signalSound.playBuySignalChime();
    } else {
      signalSound.playSellSignalChime();
    }

    // 2. Set visible toast banner
    setActiveSignalNotification(newSignal);
    setIsDismissed(false);

    // 3. Trigger Browser Native Push Notification if permitted
    if ('Notification' in window && Notification.permission === 'granted') {
      try {
        const title = `🚨 NEW ${newSignal.direction.toUpperCase()} SIGNAL: ${newSignal.symbol}`;
        const body = `Grade ${newSignal.grade} | Entry: ${newSignal.entry_low ?? '—'} - ${newSignal.entry_high ?? '—'} | SL: ${newSignal.stop_loss} | TP1: ${newSignal.tp1}`;
        new Notification(title, {
          body,
          icon: '/favicon.ico',
          tag: newSignal.id,
        });
      } catch (e) {
        console.warn('Native notification failed:', e);
      }
    }

    // Auto-dismiss in-app popup after 18 seconds
    const timer = setTimeout(() => {
      setIsDismissed(true);
    }, 18000);

    return () => clearTimeout(timer);
  }, []);

  // Subscribe to real-time signals
  useEffect(() => {
    const channel = supabase
      .channel('realtime_signals_listener')
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'signals' },
        (payload: {new: Partial<Signal>}) => {
          if (payload.new) {
            handleNewSignal(payload.new as Signal);
          }
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [handleNewSignal]);

  const toggleSound = () => {
    const next = !soundEnabled;
    setSoundEnabled(next);
    signalSound.setEnabled(next);
    if (next) {
      signalSound.playTestChime();
    }
  };

  const requestPushPermission = async () => {
    if ('Notification' in window) {
      const res = await Notification.requestPermission();
      setNotificationPermission(res);
      if (res === 'granted') {
        signalSound.playBuySignalChime();
      }
    }
  };

  return (
    <>
      {/* Sound & Notification Bar Control */}
      <div className="flex items-center gap-2">
        <button
          onClick={toggleSound}
          title={soundEnabled ? 'Signal Audio Alerts: ON (Click to Mute)' : 'Signal Audio Alerts: MUTED (Click to Enable)'}
          className={`h-8 px-2.5 rounded-lg border text-xs font-medium flex items-center gap-1.5 transition-all ${
            soundEnabled
              ? 'bg-emerald-950/40 border-emerald-500/30 text-emerald-400 hover:bg-emerald-900/50 shadow-sm'
              : 'bg-zinc-900 border-zinc-800 text-zinc-500 hover:text-zinc-300'
          }`}
        >
          {soundEnabled ? <Volume2 size={14} className="text-emerald-400" /> : <VolumeX size={14} />}
          <span className="hidden sm:inline">{soundEnabled ? 'Audio Chimes ON' : 'Muted'}</span>
        </button>

        {notificationPermission !== 'granted' && (
          <button
            onClick={requestPushPermission}
            title="Enable Desktop & Mobile Push Alerts"
            className="h-8 px-2.5 rounded-lg border border-blue-500/30 bg-blue-950/30 text-blue-400 hover:bg-blue-900/40 text-xs font-medium flex items-center gap-1.5 transition-all"
          >
            <Bell size={13} />
            <span className="hidden sm:inline">Enable Push Alerts</span>
          </button>
        )}
      </div>

      {/* Floating Live Signal Popup Banner (Toast) */}
      {activeSignalNotification && !isDismissed && (
        <div className="fixed bottom-6 right-4 sm:right-6 z-50 max-w-md w-full animate-bounce-in">
          <div className="bg-zinc-950/95 border-2 border-emerald-500/80 rounded-2xl p-4 shadow-2xl shadow-emerald-950/80 backdrop-blur-md">
            <div className="flex items-start justify-between gap-3 mb-2.5">
              <div className="flex items-center gap-2">
                <span className="relative flex h-3 w-3">
                  <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
                  <span className="relative inline-flex rounded-full h-3 w-3 bg-emerald-500"></span>
                </span>
                <span className="text-xs font-bold uppercase tracking-wider text-emerald-400 flex items-center gap-1">
                  <Sparkles size={13} /> NEW REAL-TIME SIGNAL DETECTED
                </span>
              </div>
              <button
                onClick={() => setIsDismissed(true)}
                className="text-zinc-500 hover:text-white p-1 rounded-md transition-colors"
                aria-label="Close notification"
              >
                <X size={14} />
              </button>
            </div>

            <div className="flex items-center justify-between gap-2 mb-3 bg-zinc-900/80 p-2.5 rounded-xl border border-zinc-800">
              <div className="flex items-center gap-2">
                <span className="font-mono font-extrabold text-base text-white">
                  {activeSignalNotification.symbol}
                </span>
                {directionBadge(activeSignalNotification.direction)}
                {gradeBadge(activeSignalNotification.grade)}
              </div>
              <div className="text-[11px] font-mono text-zinc-400">
                {formatEATTime(activeSignalNotification.created_at)}
              </div>
            </div>

            <div className="grid grid-cols-3 gap-2 text-xs font-mono mb-3">
              <div className="bg-zinc-900/60 p-2 rounded-lg border border-zinc-800/80">
                <div className="text-[10px] text-zinc-500 uppercase font-sans">Entry Zone</div>
                <div className="text-zinc-200 font-bold truncate">
                  {activeSignalNotification.entry_low ?? '—'}
                </div>
              </div>
              <div className="bg-zinc-900/60 p-2 rounded-lg border border-zinc-800/80">
                <div className="text-[10px] text-red-400/80 uppercase font-sans">Stop Loss</div>
                <div className="text-red-400 font-bold truncate">
                  {activeSignalNotification.stop_loss ?? '—'}
                </div>
              </div>
              <div className="bg-zinc-900/60 p-2 rounded-lg border border-zinc-800/80">
                <div className="text-[10px] text-emerald-400/80 uppercase font-sans">Take Profit</div>
                <div className="text-emerald-400 font-bold truncate">
                  {activeSignalNotification.tp1 ?? '—'}
                </div>
              </div>
            </div>

            <div className="flex items-center gap-2">
              <Link
                to={`/app/signals/${activeSignalNotification.id}`}
                onClick={() => setIsDismissed(true)}
                className="flex-1 bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-bold py-2.5 px-3 rounded-xl flex items-center justify-center gap-1.5 transition-all shadow-md shadow-emerald-600/30"
              >
                <span>View Full Setup & Trade Plan</span>
                <ArrowRight size={13} />
              </Link>
            </div>
          </div>
        </div>
      )}
    </>
  );
}

