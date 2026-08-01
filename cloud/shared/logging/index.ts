import type { EventEnvelope } from "../contracts/events.ts";

const SENSITIVE = /authorization|cookie|secret|password|token|credential|api[-_]?key|private[-_]?key|signature/i;
export function redact(value: unknown, seen = new WeakSet<object>()): unknown {
  if (!value || typeof value !== "object") return value;
  if (seen.has(value as object)) return "[Circular]"; seen.add(value as object);
  if (Array.isArray(value)) return value.map((x) => redact(x, seen));
  return Object.fromEntries(Object.entries(value as Record<string, unknown>).map(([k, v]) => [k, SENSITIVE.test(k) ? "[REDACTED]" : redact(v, seen)]));
}
export function normalizeError(error: unknown): { error_code: string; message: string; retryable: boolean } {
  const e = error instanceof Error ? error : new Error(String(error));
  const retryable = /timeout|temporar|rate.?limit|ECONN|5\d\d/i.test(e.message);
  return { error_code: e.name || "Error", message: e.message.replace(/(token|secret|password|api[_-]?key)=?[^\s,]*/gi, "$1=[REDACTED]"), retryable };
}
export interface LogContext { correlation_id?: string; causation_id?: string | null; signal_id?: string | null; trade_id?: string | null; customer_id?: string | null; runtime_id?: string | null; execution_scope_key?: string | null; event_type?: string; provider?: string; provider_request_id?: string; }
export function contextFromEvent(e: EventEnvelope): LogContext { return { correlation_id:e.correlation_id, causation_id:e.causation_id, signal_id:e.signal_id, trade_id:e.trade_id, customer_id:e.customer_id, runtime_id:e.runtime_id, execution_scope_key:e.execution_scope_key, event_type:e.event_type }; }
export function createLogger(meta: { service: string; revision: string; environment: string }, sink: (line: string) => void = console.log) {
  return (severity: "DEBUG"|"INFO"|"NOTICE"|"WARNING"|"ERROR"|"CRITICAL", message: string, fields: LogContext & Record<string, unknown> = {}) => {
    sink(JSON.stringify(redact({ timestamp:new Date().toISOString(), severity, ...meta, message, event_type:null, outcome:null, error_code:null, retryable:null, latency_ms:null, correlation_id:null, causation_id:null, signal_id:null, trade_id:null, customer_id:null, runtime_id:null, execution_scope_key:null, provider:null, provider_request_id:null, ...fields })));
  };
}
