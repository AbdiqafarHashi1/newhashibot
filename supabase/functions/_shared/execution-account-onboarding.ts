import { normalizedQuery, signBybitV5Get } from "./bybit-v5-auth.ts";

export type OnboardingProvider = "binance" | "bybit";
export type OnboardingEnvironment = "testnet" | "demo";
export type RawCredential = { apiKey: string; apiSecret: string; passphrase?: string };
/**
 * Routing identities are atoms in the colon-delimited execution scope key.
 * This value is a product-owned label, not a Binance UID or credential fingerprint.
 */
export const BINANCE_TESTNET_CANONICAL_SYSTEM_IDENTITY = "canonical-binance-testnet-system";
export const EXECUTION_IDENTITY_RESERVED_DELIMITERS = [":"] as const;

export function isAtomicExecutionIdentity(value: string): boolean {
  const identity = value.trim();
  return Boolean(identity) && !EXECUTION_IDENTITY_RESERVED_DELIMITERS.some((delimiter) => identity.includes(delimiter));
}

export function canonicalBinanceTestnetSystemIdentity(): string {
  return BINANCE_TESTNET_CANONICAL_SYSTEM_IDENTITY;
}

export type SafeVerification = {
  connection_verified: boolean;
  provider: OnboardingProvider;
  environment: OnboardingEnvironment;
  discovered_account_identity: string | null;
  read_permissions: { account: boolean; balances: boolean; positions: boolean; orders: boolean };
  trading_permission: boolean;
  withdrawal_permission: boolean | null;
  warnings: string[];
  first_blocker: string | null;
};

export function providerEnvironment(provider: string): OnboardingEnvironment {
  if (provider === "binance") return "testnet";
  if (provider === "bybit") return "demo";
  throw new Error("unsupported_provider");
}

export function validateCredentialShape(provider: string, credential: RawCredential) {
  providerEnvironment(provider);
  if (!credential.apiKey?.trim() || !credential.apiSecret?.trim()) throw new Error("api_key_and_secret_required");
  // Neither active provider contract has a passphrase. Reject it rather than silently
  // creating a provider-independent credential shape.
  if (credential.passphrase?.trim()) throw new Error("passphrase_not_supported_by_active_provider_contract");
}

async function hmacSha256(secret: string, value: string) {
  const key = await crypto.subtle.importKey("raw", new TextEncoder().encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  return Array.from(new Uint8Array(await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(value))))
    .map((byte) => byte.toString(16).padStart(2, "0")).join("");
}

async function safeJson(response: Response): Promise<Record<string, unknown>> {
  const value = await response.json().catch(() => ({}));
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
}

export async function verifyBinanceTestnet(credential: RawCredential, fetcher: typeof fetch = fetch): Promise<SafeVerification> {
  validateCredentialShape("binance", credential);
  const timestamp = Date.now();
  const query = `timestamp=${timestamp}&recvWindow=10000`;
  const signature = await hmacSha256(credential.apiSecret, query);
  const headers = { "X-MBX-APIKEY": credential.apiKey };
  const base = "https://testnet.binancefuture.com";
  const [accountResponse, ordersResponse] = await Promise.all([
    fetcher(`${base}/fapi/v2/account?${query}&signature=${signature}`, { headers }),
    (async () => {
      const orderQuery = `timestamp=${timestamp}&recvWindow=10000`;
      return fetcher(`${base}/fapi/v1/openOrders?${orderQuery}&signature=${await hmacSha256(credential.apiSecret, orderQuery)}`, { headers });
    })(),
  ]);
  const account = await safeJson(accountResponse);
  const candidateIdentity = typeof account.accountAlias === "string" && account.accountAlias.trim() ? account.accountAlias.trim() : null;
  const nativeIdentity = candidateIdentity && isAtomicExecutionIdentity(candidateIdentity) ? candidateIdentity : null;
  // Futures Testnet does not consistently expose accountAlias. This constant is
  // scoped by owner/provider/environment and contains no credential material.
  const identity = nativeIdentity ?? canonicalBinanceTestnetSystemIdentity();
  const ok = accountResponse.ok && ordersResponse.ok;
  return {
    connection_verified: ok,
    provider: "binance", environment: "testnet", discovered_account_identity: identity,
    read_permissions: { account: accountResponse.ok, balances: accountResponse.ok && Array.isArray(account.assets), positions: accountResponse.ok && Array.isArray(account.positions), orders: ordersResponse.ok },
    trading_permission: account.canTrade === true, withdrawal_permission: typeof account.canWithdraw === "boolean" ? account.canWithdraw : null,
    warnings: accountResponse.ok && !nativeIdentity ? ["Native stable provider identity unavailable; safe canonical fallback used."] : [],
    first_blocker: !accountResponse.ok ? `BINANCE_AUTH_OR_ACCOUNT_READ_FAILED_${accountResponse.status}` : !ordersResponse.ok ? `BINANCE_ORDER_READ_FAILED_${ordersResponse.status}` : null,
  };
}

async function bybitGet(path: string, params: Record<string, string>, credential: RawCredential, fetcher: typeof fetch) {
  const timestamp = String(Date.now());
  const recvWindow = "10000";
  const query = normalizedQuery(params);
  const { signature } = await signBybitV5Get({ timestamp, apiKey: credential.apiKey, apiSecret: credential.apiSecret, recvWindow, query });
  const response = await fetcher(`https://api-demo.bybit.com${path}${query ? `?${query}` : ""}`, { headers: {
    "X-BAPI-API-KEY": credential.apiKey, "X-BAPI-TIMESTAMP": timestamp, "X-BAPI-RECV-WINDOW": recvWindow, "X-BAPI-SIGN": signature,
  } });
  return { response, body: await safeJson(response) };
}

function bybitOk(value: { response: Response; body: Record<string, unknown> }) { return value.response.ok && Number(value.body.retCode) === 0; }

export async function verifyBybitDemo(credential: RawCredential, fetcher: typeof fetch = fetch): Promise<SafeVerification> {
  validateCredentialShape("bybit", credential);
  const [keyInfo, wallet, positions, orders] = await Promise.all([
    bybitGet("/v5/user/query-api", {}, credential, fetcher),
    bybitGet("/v5/account/wallet-balance", { accountType: "UNIFIED" }, credential, fetcher),
    bybitGet("/v5/position/list", { category: "linear", settleCoin: "USDT" }, credential, fetcher),
    bybitGet("/v5/order/realtime", { category: "linear", settleCoin: "USDT" }, credential, fetcher),
  ]);
  const result = keyInfo.body.result as Record<string, unknown> | undefined;
  const identity = result?.userID === undefined || result?.userID === null ? null : String(result.userID);
  const auth = bybitOk(keyInfo);
  const permissionEvidence=result?.permissions,permissionText = JSON.stringify(permissionEvidence ?? {}).toLowerCase(),permissionKnown=Array.isArray(permissionEvidence)||(permissionEvidence!==null&&typeof permissionEvidence==="object");
  const verified = auth && bybitOk(wallet) && Boolean(identity);
  return {
    connection_verified: verified,
    provider: "bybit", environment: "demo", discovered_account_identity: identity,
    read_permissions: { account: auth, balances: bybitOk(wallet), positions: bybitOk(positions), orders: bybitOk(orders) },
    trading_permission: permissionKnown&&(permissionText.includes("order") || permissionText.includes("trade")), withdrawal_permission: permissionKnown?permissionText.includes("withdraw"):null,
    warnings: [],
    first_blocker: !auth ? `BYBIT_AUTH_FAILED_${String(keyInfo.body.retCode ?? keyInfo.response.status)}` : !bybitOk(wallet) ? "BYBIT_WALLET_READ_FAILED" : !bybitOk(positions) ? "BYBIT_POSITION_READ_FAILED" : !bybitOk(orders) ? "BYBIT_ORDER_READ_FAILED" : !identity ? "BYBIT_STABLE_ACCOUNT_IDENTITY_UNAVAILABLE" : null,
  };
}

export async function verifyProvider(provider: OnboardingProvider, environment: string, credential: RawCredential, fetcher: typeof fetch = fetch) {
  if (providerEnvironment(provider) !== environment) throw new Error("provider_environment_mismatch");
  return provider === "binance" ? verifyBinanceTestnet(credential, fetcher) : verifyBybitDemo(credential, fetcher);
}

export function safeAccountSummary(row: Record<string, unknown>) {
  const { credential_ref, ...safe } = row;
  const ref = String(credential_ref ?? "");
  return { ...safe, credentials_configured: Boolean(ref), masked_credential_reference: ref ? `vault:••••${ref.slice(-8)}` : null };
}
