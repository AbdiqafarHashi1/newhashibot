export type Json = Record<string, unknown>;

export type InternalInvokeResult = {
  ok: boolean;
  target: string;
  httpStatus: number | null;
  durationMs: number;
  timedOut: boolean;
  authFailed: boolean;
  responseBody: unknown;
  errorCode: string | null;
  errorMessage: string | null;
};

export const DEFAULT_OPERATOR_TIMEOUT_MS = 12000;

function redact(value: unknown): unknown {
  if (typeof value === "string") {
    if (value.length > 12) return `${value.slice(0, 4)}…REDACTED…${value.slice(-4)}`;
    return "REDACTED";
  }
  if (Array.isArray(value)) return value.map(redact);
  if (value && typeof value === "object") {
    const out: Json = {};
    for (const [k, v] of Object.entries(value as Json)) {
      out[k] = /secret|token|key|authorization|apikey|api_key|password/i.test(k) ? "REDACTED" : redact(v);
    }
    return out;
  }
  return value;
}

export function sanitizedLog(label: string, fields: Json) {
  console.error(label, redact(fields));
}

async function parseBody(res: Response): Promise<unknown> {
  const text = await res.text();
  if (!text) return null;
  try { return JSON.parse(text); } catch { return text.slice(0, 4000); }
}

export function internalHeaders(correlationId: string, actionId: string, idempotencyKey?: string): HeadersInit {
  const internalSecret = Deno.env.get("HASHIBOT_INTERNAL_SECRET") ?? Deno.env.get("INTERNAL_FUNCTION_SECRET") ?? "";
  const cronToken = Deno.env.get("HASHIBOT_CRON_TOKEN") ?? Deno.env.get("INTERNAL_CRON_TOKEN") ?? Deno.env.get("SCANNER_CRON_SECRET") ?? "";
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    "x-hashibot-correlation-id": correlationId,
    "x-hashibot-action-id": actionId,
  };
  if (internalSecret) headers["x-hashibot-internal-secret"] = internalSecret;
  else if (cronToken) headers["x-hashibot-cron-token"] = cronToken;
  if (idempotencyKey) headers["Idempotency-Key"] = idempotencyKey;
  return headers;
}

export async function invokeInternalFunction(args: { target: string; payload: Json; correlationId: string; actionId: string; timeoutMs?: number; idempotencyKey?: string }): Promise<InternalInvokeResult> {
  const started = Date.now();
  const timeoutMs = args.timeoutMs ?? DEFAULT_OPERATOR_TIMEOUT_MS;
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  let httpStatus: number | null = null;
  let responseBody: unknown = null;
  try {
    const url = `${Deno.env.get("SUPABASE_URL")}/functions/v1/${args.target}`;
    const res = await fetch(url, { method: "POST", headers: internalHeaders(args.correlationId, args.actionId, args.idempotencyKey), body: JSON.stringify({ ...args.payload, correlation_id: args.correlationId, action_id: args.actionId, idempotency_key: args.idempotencyKey }), signal: controller.signal });
    httpStatus = res.status;
    responseBody = await parseBody(res);
    const errorCode = !res.ok ? (httpStatus === 401 || httpStatus === 403 ? "DOWNSTREAM_AUTH_FAILED" : `DOWNSTREAM_HTTP_${httpStatus}`) : (responseBody && typeof responseBody === "object" && (responseBody as Json).success === false ? String((responseBody as Json).error_code ?? (responseBody as Json).reason ?? "DOWNSTREAM_FAILED") : null);
    const errorMessage = errorCode ? (typeof responseBody === "string" ? responseBody : String((responseBody as Json)?.error ?? (responseBody as Json)?.message ?? (responseBody as Json)?.blocker ?? errorCode)) : null;
    return { ok: res.ok && !errorCode, target: args.target, httpStatus, durationMs: Date.now() - started, timedOut: false, authFailed: httpStatus === 401 || httpStatus === 403, responseBody, errorCode, errorMessage };
  } catch (e) {
    const timedOut = e instanceof DOMException && e.name === "AbortError";
    const errorCode = timedOut ? "DOWNSTREAM_TIMEOUT" : "DOWNSTREAM_NETWORK_ERROR";
    const errorMessage = timedOut ? `${args.target} timed out after ${timeoutMs}ms` : (e instanceof Error ? e.message : String(e));
    sanitizedLog("operator downstream invoke failed", { target: args.target, actionId: args.actionId, correlationId: args.correlationId, errorCode, errorMessage });
    return { ok: false, target: args.target, httpStatus, durationMs: Date.now() - started, timedOut, authFailed: false, responseBody, errorCode, errorMessage };
  } finally {
    clearTimeout(timeout);
  }
}
