// Time formatting and signal freshness calculation utilities

export interface SignalFreshness {
  level: 'fresh' | 'active' | 'late' | 'stale';
  label: string;
  subtext: string;
  badgeClass: string;
  dotColor: string;
  minutesAgo: number;
  isExecutable: boolean;
}

/**
 * Calculate how fresh a signal setup is based on its creation timestamp
 */
export function getSignalFreshness(dateStr?: string | null): SignalFreshness {
  if (!dateStr) {
    return {
      level: 'stale',
      label: 'UNKNOWN AGE',
      subtext: 'Verify market condition before executing',
      badgeClass: 'bg-zinc-800 text-zinc-400 border-zinc-700',
      dotColor: 'bg-zinc-500',
      minutesAgo: 9999,
      isExecutable: false,
    };
  }

  const createdTime = new Date(dateStr).getTime();
  const now = Date.now();
  const diffMs = Math.max(0, now - createdTime);
  const minutesAgo = Math.floor(diffMs / (1000 * 60));

  if (minutesAgo < 15) {
    return {
      level: 'fresh',
      label: '⚡ FRESH SETUP',
      subtext: 'Optimal execution entry window',
      badgeClass: 'bg-emerald-500/15 text-emerald-300 border-emerald-500/40 animate-pulse',
      dotColor: 'bg-emerald-400',
      minutesAgo,
      isExecutable: true,
    };
  }

  if (minutesAgo < 60) {
    return {
      level: 'active',
      label: '⏳ ACTIVE SETUP',
      subtext: 'Verify current market spread & price',
      badgeClass: 'bg-blue-500/15 text-blue-300 border-blue-500/40',
      dotColor: 'bg-blue-400',
      minutesAgo,
      isExecutable: true,
    };
  }

  if (minutesAgo < 180) { // 1 - 3 hours
    return {
      level: 'late',
      label: '⚠️ LATE ENTRY (>1h ago)',
      subtext: 'Setup may have moved past entry zone',
      badgeClass: 'bg-amber-500/15 text-amber-300 border-amber-500/40',
      dotColor: 'bg-amber-400',
      minutesAgo,
      isExecutable: false,
    };
  }

  return {
    level: 'stale',
    label: '⛔ STALE (>3h ago)',
    subtext: 'Do not execute market order - setup expired',
    badgeClass: 'bg-red-500/15 text-red-300 border-red-500/40',
    dotColor: 'bg-red-400',
    minutesAgo,
    isExecutable: false,
  };
}

/**
 * Format relative time (e.g., "Just now", "3m ago", "45m ago", "2h ago")
 */
export function formatRelativeTime(dateStr?: string | null): string {
  if (!dateStr) return '—';
  const diff = Date.now() - new Date(dateStr).getTime();
  const secs = Math.max(0, Math.floor(diff / 1000));
  
  if (secs < 45) return 'Just now';
  const mins = Math.floor(secs / 60);
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ${mins % 60}m ago`;
  const days = Math.floor(hrs / 24);
  return `${days}d ago`;
}

/**
 * Format timestamp in East Africa Time (EAT / UTC+3 - Nairobi time)
 */
export function formatEATTime(dateStr?: string | null): string {
  if (!dateStr) return '—';
  try {
    const d = new Date(dateStr);
    return new Intl.DateTimeFormat('en-GB', {
      timeZone: 'Africa/Nairobi',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
      day: '2-digit',
      month: 'short',
    }).format(d) + ' EAT';
  } catch {
    return new Date(dateStr).toLocaleTimeString() + ' EAT';
  }
}

/**
 * Format timestamp in UTC
 */
export function formatUtcTime(dateStr?: string | null): string {
  if (!dateStr) return '—';
  try {
    const d = new Date(dateStr);
    return new Intl.DateTimeFormat('en-GB', {
      timeZone: 'UTC',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
    }).format(d) + ' UTC';
  } catch {
    return new Date(dateStr).toUTCString();
  }
}
