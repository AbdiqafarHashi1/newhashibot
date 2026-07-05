export type Json = Record<string, unknown>;
export type Role = 'anonymous' | 'customer' | 'admin' | 'owner' | 'service' | 'executor' | 'system';

export const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization, Apikey, Idempotency-Key, x-hashibot-cron-token'
};

const secretPattern = /(secret|password|token|private|api[_-]?key|api[_-]?secret|credential|telegram[_-]?bot|mt5[_-]?password)/i;
const forbiddenPersistenceKeys = /"(candles|ticks|rawCandles|fullHistory|perCandleTrace|websocketFrames|indicatorSeries|scanLoopTrace)"/i;

export function json(body: Json, status = 200) {
  const safe = sanitizePayload(body);
  return new Response(JSON.stringify({ ok: status < 400, success: status < 400, ...safe }), { status, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
}

export function typedError(code: string, message: string, status = 400, details: Json = {}) {
  return json({ error: { code, message, details: sanitizePayload(details) }, error_code: code, message }, status);
}

export function text(v: unknown) { return typeof v === 'string' ? v.trim() : ''; }
export function num(v: unknown, fallback = 0) { const n = Number(v); return Number.isFinite(n) ? n : fallback; }
export function obj(v: unknown): Json { return v && typeof v === 'object' && !Array.isArray(v) ? v as Json : {}; }
export function arr(v: unknown): unknown[] { return Array.isArray(v) ? v : []; }

export function sanitizePayload(input: unknown): Json {
  if (!input || typeof input !== 'object' || Array.isArray(input)) return {};
  const out: Json = {};
  for (const [key, value] of Object.entries(input as Json)) {
    if (secretPattern.test(key)) continue;
    if (value && typeof value === 'object') out[key] = Array.isArray(value) ? value.map((item) => typeof item === 'object' ? sanitizePayload(item) : item).slice(0, 50) : sanitizePayload(value);
    else out[key] = value;
  }
  return out;
}

export function rejectLargeOrTransientPayload(body: Json, maxBytes = 32_000) {
  const serialized = JSON.stringify(body ?? {});
  if (serialized.length > maxBytes) return 'Payload exceeds compact V2 API limit';
  if (forbiddenPersistenceKeys.test(serialized)) return 'Transient candle/tick/indicator/websocket/scan-loop payloads are not accepted';
  return '';
}

export function required(body: Json, key: string) {
  const value = text(body[key]);
  if (!value) throw new Error(`${key} is required`);
  return value;
}

export function roleFromBody(body: Json): Role {
  const role = text(body.actor_role || body.role).toLowerCase();
  return ['customer','admin','owner','service','executor','system'].includes(role) ? role as Role : 'anonymous';
}

export function requireRole(body: Json, allowed: Role[]) {
  const role = roleFromBody(body);
  if (!allowed.includes(role)) throw new Error(`role ${role} is not allowed`);
  return role;
}

export function assertOwnership(body: Json, rowCustomerId: unknown) {
  const role = roleFromBody(body);
  if (['admin','owner','service','system'].includes(role)) return;
  const requestedCustomer = text(body.customer_id);
  if (!requestedCustomer || !rowCustomerId || requestedCustomer !== String(rowCustomerId)) throw new Error('customer ownership verification failed');
}

export function logStructured(event: string, details: Json = {}) {
  console.log(JSON.stringify({ level: 'info', event, at: new Date().toISOString(), ...sanitizePayload(details) }));
}
