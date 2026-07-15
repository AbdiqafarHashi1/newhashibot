export type RequestClass = 'live' | 'summary' | 'historical' | 'static' | 'broken';

export interface GovernedRequestOptions {
  key: string;
  className?: RequestClass;
  retry?: boolean;
  signal?: AbortSignal;
}

export interface PollerOptions {
  key: string;
  intervalMs: number;
  run: (signal: AbortSignal) => Promise<void>;
  pauseWhen?: () => boolean;
  onDegraded?: (reason: string) => void;
}

type BlockedEndpoint = { reason: string; at: number };

const inFlight = new Map<string, Promise<unknown>>();
const blocked = new Map<string, BlockedEndpoint>();
let operatorActionDepth = 0;

function isDeterministicError(error: unknown): boolean {
  const status = Number((error as { status?: number })?.status ?? (error as { code?: number })?.code ?? 0);
  const message = String((error as { message?: string })?.message ?? error ?? '').toLowerCase();
  return [400, 401, 403, 404].includes(status)
    || (status >= 500 && (message.includes('schema') || message.includes('column') || message.includes('relation') || message.includes('does not exist')));
}

export function markEndpointBroken(key: string, reason: string): void {
  blocked.set(key, { reason, at: Date.now() });
}

export function clearEndpointBroken(key: string): void {
  blocked.delete(key);
}

export function isEndpointBroken(key: string): BlockedEndpoint | null {
  return blocked.get(key) ?? null;
}

export function isOperatorActionRunning(): boolean {
  return operatorActionDepth > 0;
}

export async function withOperatorAction<T>(fn: () => Promise<T>): Promise<T> {
  operatorActionDepth += 1;
  try {
    return await fn();
  } finally {
    operatorActionDepth = Math.max(0, operatorActionDepth - 1);
  }
}

export async function governedRequest<T>(options: GovernedRequestOptions, fn: (signal: AbortSignal) => Promise<T>): Promise<T> {
  const broken = blocked.get(options.key);
  if (broken) throw Object.assign(new Error(`DATA UNAVAILABLE: ${broken.reason}`), { status: 503, deterministic: true });
  const existing = inFlight.get(options.key) as Promise<T> | undefined;
  if (existing) return existing;

  const controller = new AbortController();
  const abort = () => controller.abort();
  options.signal?.addEventListener('abort', abort, { once: true });
  const promise = (async () => {
    try {
      try {
        return await fn(controller.signal);
      } catch (error) {
        if (isDeterministicError(error) || options.retry === false) {
          markEndpointBroken(options.key, error instanceof Error ? error.message : String(error));
          throw error;
        }
        return await new Promise<T>((resolve, reject) => {
          const delay = 750;
          const timer = window.setTimeout(() => {
            fn(controller.signal).then(resolve, reject);
          }, delay);
          controller.signal.addEventListener('abort', () => {
            window.clearTimeout(timer);
            reject(Object.assign(new Error('request aborted'), { status: 0 }));
          }, { once: true });
        });
      }
    } finally {
      options.signal?.removeEventListener('abort', abort);
      inFlight.delete(options.key);
    }
  })();
  inFlight.set(options.key, promise);
  return promise;
}

export function startGovernedPolling(options: PollerOptions): () => void {
  let stopped = false;
  let running = false;
  let failures = 0;
  let timer: number | null = null;
  let controller: AbortController | null = null;

  const schedule = (delay = options.intervalMs) => {
    if (stopped) return;
    if (timer !== null) window.clearTimeout(timer);
    timer = window.setTimeout(tick, delay);
  };

  const tick = async () => {
    if (stopped) return;
    if (document.visibilityState === 'hidden' || isOperatorActionRunning() || options.pauseWhen?.()) {
      schedule(options.intervalMs);
      return;
    }
    if (running) {
      schedule(options.intervalMs);
      return;
    }
    const broken = isEndpointBroken(options.key);
    if (broken) {
      options.onDegraded?.(broken.reason);
      schedule(5 * 60_000);
      return;
    }
    running = true;
    controller = new AbortController();
    try {
      await options.run(controller.signal);
      failures = 0;
      schedule(options.intervalMs);
    } catch (error) {
      failures += 1;
      const delay = Math.min(options.intervalMs * 4, options.intervalMs * 2 ** failures);
      options.onDegraded?.(error instanceof Error ? error.message : String(error));
      schedule(delay);
    } finally {
      running = false;
      controller = null;
    }
  };

  const visibility = () => { if (document.visibilityState === 'visible') schedule(500); };
  document.addEventListener('visibilitychange', visibility);
  tick();
  return () => {
    stopped = true;
    if (timer !== null) window.clearTimeout(timer);
    controller?.abort();
    document.removeEventListener('visibilitychange', visibility);
  };
}
