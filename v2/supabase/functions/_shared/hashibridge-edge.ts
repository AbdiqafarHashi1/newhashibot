import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2";

export type Json = Record<string, unknown>;
export const corsHeaders = { "Access-Control-Allow-Origin": "*", "Access-Control-Allow-Methods": "POST, OPTIONS", "Access-Control-Allow-Headers": "Content-Type, Authorization, Apikey, x-hashibridge-device-id, x-hashibridge-timestamp, x-hashibridge-nonce, x-hashibridge-signature" };
const secretKeys = /secret|password|token|key|credential|signature/i;
const encoder = new TextEncoder();

export function sanitizePayload<T>(input: T): T {
  if (Array.isArray(input)) return input.map((v) => sanitizePayload(v)) as T;
  if (input && typeof input === "object") {
    const out: Json = {};
    for (const [key, value] of Object.entries(input as Json)) out[key] = secretKeys.test(key) ? "[redacted]" : sanitizePayload(value as never);
    return out as T;
  }
  return input;
}
export function jsonResponse(body: Json, status = 200) { return new Response(JSON.stringify(sanitizePayload({ ok: status < 400, success: status < 400, ...body })), { status, headers: { ...corsHeaders, "Content-Type": "application/json" } }); }
export function errorResponse(code: string, message: string, status = 400, details: Json = {}) { return jsonResponse({ error: { code, message, details: sanitizePayload(details) } }, status); }
export function logEvent(level: "info"|"warn"|"error", event: string, details: Json = {}) { console.log(JSON.stringify(sanitizePayload({ level, event, at: new Date().toISOString(), ...details }))); }
export function requiredString(body: Json, ...names: string[]) { for (const name of names) { const value = body[name]; if (typeof value === "string" && value.trim()) return value.trim(); } throw new EdgeError("invalid_payload", `Missing required field: ${names.join(" or ")}`, 400); }
export function optionalString(body: Json, name: string) { const value = body[name]; return typeof value === "string" && value.trim() ? value.trim() : undefined; }
export function numberValue(body: Json, name: string, fallback = 0) { const value = body[name]; return typeof value === "number" && Number.isFinite(value) ? value : fallback; }
export function arrayValue(body: Json, name: string) { return Array.isArray(body[name]) ? body[name] as unknown[] : []; }
export function compact(body: Json, maxBytes = 24_000) { const size = encoder.encode(JSON.stringify(body)).byteLength; if (size > maxBytes) throw new EdgeError("payload_too_large", "Payload exceeds compact HashiBridge/MT5 Edge Function limit", 413); return body; }
export class EdgeError extends Error { constructor(readonly code: string, message: string, readonly status = 400, readonly details: Json = {}) { super(message); } }
export async function parseJsonBody(req: Request) { try { return compact(await req.json() as Json); } catch (error) { if (error instanceof EdgeError) throw error; throw new EdgeError("invalid_json", "Request body must be valid compact JSON", 400); } }
export function getEnv(name: string) { const value = Deno.env.get(name); if (!value) throw new EdgeError("missing_secret", `${name} is not configured`, 500); return value; }
export function serviceClient() { return createClient(getEnv("SUPABASE_URL"), getEnv("SUPABASE_SERVICE_ROLE_KEY")); }
export function nowIso() { return new Date().toISOString(); }
export function newId(prefix: string) { return `${prefix}_${crypto.randomUUID()}`; }
function hex(buffer: ArrayBuffer) { return [...new Uint8Array(buffer)].map((b) => b.toString(16).padStart(2, "0")).join(""); }
async function hmac(secret: string, message: string) { const key = await crypto.subtle.importKey("raw", encoder.encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]); return hex(await crypto.subtle.sign("HMAC", key, encoder.encode(message))); }
function timingSafeEqual(a: string, b: string) { if (a.length !== b.length) return false; let out = 0; for (let i=0; i<a.length; i++) out |= a.charCodeAt(i) ^ b.charCodeAt(i); return out === 0; }
export async function verifyBridgeSignature(req: Request, rawBody: string, body: Json) {
  const deviceId = req.headers.get("x-hashibridge-device-id") || optionalString(body, "bridge_id") || optionalString(body, "device_id");
  const timestamp = req.headers.get("x-hashibridge-timestamp") || optionalString(body, "timestamp");
  const nonce = req.headers.get("x-hashibridge-nonce") || optionalString(body, "nonce") || optionalString(body, "request_id");
  const signature = req.headers.get("x-hashibridge-signature") || optionalString(body, "signature");
  if (!deviceId || !timestamp || !nonce || !signature) throw new EdgeError("missing_signature", "Missing HashiBridge signature headers", 401);
  const ts = Date.parse(timestamp);
  if (!Number.isFinite(ts)) throw new EdgeError("invalid_timestamp", "Invalid HashiBridge timestamp", 401);
  if (Math.abs(Date.now() - ts) > 5 * 60 * 1000) throw new EdgeError("stale_timestamp", "HashiBridge request timestamp is outside replay window", 401);
  const canonical = `${deviceId}.${timestamp}.${nonce}.${rawBody}`;
  const expected = await hmac(getEnv("HASHIBRIDGE_SHARED_SECRET"), canonical);
  if (!timingSafeEqual(expected, signature.toLowerCase())) throw new EdgeError("invalid_signature", "Invalid HashiBridge signature", 401);
  return { deviceId, timestamp, nonce, signatureHash: expected.slice(0, 12) };
}
export async function parseSignedBridgeRequest(req: Request) { const rawBody = await req.text(); let body: Json; try { body = compact(JSON.parse(rawBody)); } catch (error) { if (error instanceof EdgeError) throw error; throw new EdgeError("invalid_json", "Request body must be valid compact JSON", 400); } return { body, signature: await verifyBridgeSignature(req, rawBody, body), rawBody }; }
export async function getBridgeOrThrow(supabase: ReturnType<typeof createClient>, bridgeId: string) { const { data, error } = await supabase.from("v2_mt5_bridges").select("id,customer_id,executor_id,status").eq("id", bridgeId).maybeSingle(); if (error) throw new EdgeError("db_error", error.message, 500); if (!data) throw new EdgeError("bridge_not_found", "HashiBridge device is not registered", 404); return data as { id:string; customer_id:string; executor_id:string; status:string }; }
export function assertScope(actual: unknown, expected: unknown, field: string) { if (expected && actual && String(actual) !== String(expected)) throw new EdgeError("ownership_violation", `${field} does not match registered ownership`, 403); }
export async function insertBridgeLog(supabase: ReturnType<typeof createClient>, bridgeId: string, level: string, message: string, payload: Json = {}) { await supabase.from("v2_bridge_logs").insert({ id: newId("blog"), bridge_id: bridgeId, level, message, payload: sanitizePayload(payload) }); }
export async function insertBridgeEvent(supabase: ReturnType<typeof createClient>, bridgeId: string, customerId: string, eventType: string, severity = "info", payload: Json = {}) { await supabase.from("v2_bridge_events").insert({ id: newId("bevt"), bridge_id: bridgeId, customer_id: customerId, event_type: eventType, severity, payload: sanitizePayload(payload) }); }
export async function handleEdge(req: Request, handler: (req: Request) => Promise<Response>) { if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders }); if (req.method !== "POST") return errorResponse("method_not_allowed", "Only POST is supported", 405); try { return await handler(req); } catch (error) { const edge = error instanceof EdgeError ? error : new EdgeError("internal_error", error instanceof Error ? error.message : String(error), 500); logEvent(edge.status >= 500 ? "error" : "warn", edge.code, { message: edge.message, details: edge.details }); return errorResponse(edge.code, edge.message, edge.status, edge.details); } }
