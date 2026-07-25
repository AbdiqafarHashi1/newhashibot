export type OperatorActionStatus = 'RUNNING' | 'SUCCESS' | 'PARTIAL' | 'BLOCKED' | 'FAILED';

export interface OperatorActionResult {
  status: OperatorActionStatus;
  action: string;
  summary: string;
  timestamp: string;
  startedAt?: string;
  finishedAt?: string;
  durationMs?: number;
  provider?: string;
  symbolsAffected?: string[];
  runtimeEventId?: string;
  telegramSent?: boolean;
  blocker?: string;
  route?: string;
  functionName?: string;
  target?: string;
  httpStatus?: number;
  errorCode?: string;
  timedOut?: boolean;
  authFailed?: boolean;
  error?: string;
  raw?: unknown;
}

function value(v: unknown) {
  if (v === undefined || v === null || v === '') return '—';
  if (typeof v === 'boolean') return v ? 'YES' : 'NO';
  return String(v);
}

export function ActionResult({ result }: { result: OperatorActionResult | null }) {
  if (!result) return null;
  const tone = result.status === 'SUCCESS'
    ? 'border-emerald-500/30 bg-emerald-500/10 text-emerald-200'
    : result.status === 'FAILED' || result.status === 'BLOCKED'
      ? 'border-red-500/30 bg-red-500/10 text-red-200'
      : 'border-blue-500/30 bg-blue-500/10 text-blue-200';
  return (
    <div className={`rounded-2xl border p-4 ${tone}`}>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <div className="text-xs font-bold uppercase tracking-[0.22em]">{result.status}</div>
          <h3 className="mt-1 text-lg font-bold text-zinc-50">{result.action}</h3>
          <p className="mt-1 text-sm text-zinc-200">{result.summary}</p>
        </div>
        {result.status === 'RUNNING' && <div className="h-5 w-5 rounded-full border-2 border-blue-300 border-t-transparent animate-spin" />}
      </div>
      <div className="mt-4 grid gap-2 sm:grid-cols-2 lg:grid-cols-4 text-xs text-zinc-200">
        <div><b>Started:</b> {value(result.startedAt ? new Date(result.startedAt).toLocaleString() : new Date(result.timestamp).toLocaleString())}</div>
        <div><b>Finished:</b> {value(result.finishedAt ? new Date(result.finishedAt).toLocaleString() : undefined)}</div>
        <div><b>Duration:</b> {result.durationMs === undefined ? '—' : `${result.durationMs}ms`}</div>
        <div><b>Provider:</b> {value(result.provider)}</div>
        <div><b>Telegram sent:</b> {value(result.telegramSent)}</div>
        <div><b>Runtime event:</b> {value(result.runtimeEventId)}</div>
        <div><b>Route:</b> {value(result.route)}</div>
        <div><b>Function:</b> {value(result.functionName)}</div>
        <div><b>Target:</b> {value(result.target)}</div>
        <div><b>HTTP:</b> {value(result.httpStatus)}</div>
        <div><b>Error code:</b> {value(result.errorCode)}</div>
        <div><b>Timed out:</b> {value(result.timedOut)}</div>
        <div><b>Auth failed:</b> {value(result.authFailed)}</div>
        <div><b>Blocker:</b> {value(result.blocker)}</div>
      </div>
      {!!result.symbolsAffected?.length && <p className="mt-3 text-xs text-zinc-200"><b>Symbols affected:</b> {result.symbolsAffected.join(', ')}</p>}
      {result.error && <p className="mt-3 rounded-xl border border-red-500/30 bg-red-950/40 p-3 text-sm text-red-100"><b>Exact error:</b> {result.error}</p>}
      <details className="mt-3">
        <summary className="cursor-pointer text-xs font-bold uppercase tracking-wide text-zinc-300">View Raw JSON</summary>
        <pre className="mt-2 max-h-80 overflow-auto rounded-xl bg-zinc-950 p-3 text-xs text-zinc-200">{JSON.stringify(result.raw ?? result, null, 2)}</pre>
      </details>
    </div>
  );
}
