export type BybitEnvironment = "demo" | "testnet" | "live";
export type EnvReader = (name: string) => string | undefined;

export function resolveBybitEnvironment(env: EnvReader): BybitEnvironment {
  const value = String(env("BYBIT_ENVIRONMENT") || env("BYBIT_MODE") || "demo").trim().toLowerCase();
  if (value === "demo" || value === "bybit_demo") return "demo";
  if (value === "live" || value === "mainnet" || value === "production") return "live";
  return "testnet";
}

export function resolveBybitBaseUrl(environment: BybitEnvironment, env: EnvReader): string {
  const configured = environment === "demo" ? env("BYBIT_DEMO_BASE_URL")
    : environment === "testnet" ? env("BYBIT_TESTNET_BASE_URL")
    : env("BYBIT_BASE_URL");
  const fallback = environment === "demo" ? "https://api-demo.bybit.com"
    : environment === "testnet" ? "https://api-testnet.bybit.com"
    : "https://api.bybit.com";
  return String(configured || fallback).replace(/\/+$/, "");
}

export function normalizedQuery(params: Record<string, string | number | boolean>): string {
  return new URLSearchParams(Object.entries(params)
    .filter(([, value]) => value !== undefined && value !== null)
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([key, value]) => [key, String(value)])).toString();
}

function hex(bytes: ArrayBuffer): string {
  return Array.from(new Uint8Array(bytes)).map((byte) => byte.toString(16).padStart(2, "0")).join("");
}

export async function signBybitV5Get(input: { timestamp: string; apiKey: string; apiSecret: string; recvWindow: string; query: string }): Promise<{ plaintext: string; signature: string }> {
  const plaintext = `${input.timestamp}${input.apiKey}${input.recvWindow}${input.query}`;
  const key = await crypto.subtle.importKey("raw", new TextEncoder().encode(input.apiSecret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  return { plaintext, signature: hex(await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(plaintext))) };
}

export async function safeFingerprint(value: string): Promise<string> {
  if (!value) return "absent";
  return hex(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value))).slice(0, 12);
}

export type BybitBlocker = "BYBIT_INVALID_API_KEY" | "BYBIT_SIGNATURE_INVALID" | "BYBIT_TIMESTAMP_OUT_OF_WINDOW" |
  "BYBIT_IP_RESTRICTED" | "BYBIT_PERMISSION_DENIED" | "BYBIT_ENVIRONMENT_MISMATCH" |
  "BYBIT_KEY_EXPIRED_OR_DISABLED" | "BYBIT_ACCOUNT_TYPE_MISMATCH" | "BYBIT_UNKNOWN_AUTH_FAILURE" | "BYBIT_READ_FAILED";

export function classifyBybitFailure(status: number, retCode?: number, retMsg = ""): { blocker: BybitBlocker; remediation_hint: string } {
  const msg = retMsg.toLowerCase();
  if (retCode === 10004 || msg.includes("signature")) return { blocker: "BYBIT_SIGNATURE_INVALID", remediation_hint: "Verify that the stored API key and secret are a matching pair." };
  if (retCode === 10002 || msg.includes("timestamp") || msg.includes("recv_window")) return { blocker: "BYBIT_TIMESTAMP_OUT_OF_WINDOW", remediation_hint: "Synchronize the runtime clock and retry the read-only proof." };
  if (retCode === 10010 || msg.includes("ip")) return { blocker: "BYBIT_IP_RESTRICTED", remediation_hint: "Add the stable runtime egress IP to the Bybit key allowlist." };
  if (retCode === 10005 || msg.includes("permission")) return { blocker: "BYBIT_PERMISSION_DENIED", remediation_hint: "Enable read permission for the Demo Trading API key." };
  if (retCode === 10003 || msg.includes("environment") || msg.includes("domain")) return { blocker: "BYBIT_ENVIRONMENT_MISMATCH", remediation_hint: "Use a key created inside Mainnet Demo Trading with api-demo.bybit.com." };
  if (retCode === 33004 || msg.includes("expired") || msg.includes("disabled") || msg.includes("deleted")) return { blocker: "BYBIT_KEY_EXPIRED_OR_DISABLED", remediation_hint: "Re-enable the key if possible; create a replacement only if Bybit confirms it cannot be restored." };
  if (retCode === 10008 || retCode === 10028 || retCode === 100028 || msg.includes("account type")) return { blocker: "BYBIT_ACCOUNT_TYPE_MISMATCH", remediation_hint: "Verify the key belongs to a Unified Demo Trading account." };
  if (status === 401 || status === 403 || retCode === 10007) return { blocker: "BYBIT_INVALID_API_KEY", remediation_hint: "Verify the selected key exists in Mainnet Demo Trading; do not rotate it until its environment is confirmed." };
  return { blocker: status >= 400 || (retCode ?? 0) !== 0 ? "BYBIT_UNKNOWN_AUTH_FAILURE" : "BYBIT_READ_FAILED", remediation_hint: "Inspect the safe Bybit retCode and retMsg receipt." };
}

export function clockDeltaMs(serverTimeMs: number | undefined, localTimeMs: number): number | null {
  return Number.isFinite(serverTimeMs) ? localTimeMs - Number(serverTimeMs) : null;
}
