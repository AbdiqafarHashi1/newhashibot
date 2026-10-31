import {providerEnvironmentContract} from './provider-environment.ts';
import { normalizedQuery, signBybitV5Get } from "./bybit-v5-auth.ts";

export type OnboardingProvider = "binance" | "bybit";
export type OnboardingEnvironment = "testnet" | "demo" | "live";
export type RawCredential = { apiKey: string; apiSecret: string; passphrase?: string; allowDemoWriteProbe?: boolean };
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
  identity_kind?: "NATIVE_ACCOUNT" | "DEMO_CREDENTIAL";
  credential_fingerprint?:string;
  native_account_uid?:string|null;
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

export async function verifyBinanceTestnet(credential: RawCredential, fetcher: typeof fetch = fetch, environment: OnboardingEnvironment = "testnet"): Promise<SafeVerification> {
  validateCredentialShape("binance", credential);
  const timestamp = Date.now();
  const query = `timestamp=${timestamp}&recvWindow=10000`;
  const signature = await hmacSha256(credential.apiSecret, query);
  const headers = { "X-MBX-APIKEY": credential.apiKey };
  const base = providerEnvironmentContract("binance",environment).baseUrl;
  const [accountResponse, ordersResponse] = await Promise.all([
    fetcher(`${base}/fapi/v2/account?${query}&signature=${signature}`, { headers,redirect:"error",signal:AbortSignal.timeout(10000) }),
    (async () => {
      const orderQuery = `timestamp=${timestamp}&recvWindow=10000`;
      return fetcher(`${base}/fapi/v1/openOrders?${orderQuery}&signature=${await hmacSha256(credential.apiSecret, orderQuery)}`, { headers,redirect:"error",signal:AbortSignal.timeout(10000) });
    })(),
  ]);
  const account = await safeJson(accountResponse);
  let keyPermissions:Record<string,unknown>|null=null;
  if(environment==='live'){
   const q=`timestamp=${Date.now()}&recvWindow=10000`,sig=await hmacSha256(credential.apiSecret,q);
   const response=await fetcher(`https://api.binance.com/sapi/v1/account/apiRestrictions?${q}&signature=${sig}`,{headers,redirect:'error',signal:AbortSignal.timeout(10000)});
   if(response.ok)keyPermissions=await safeJson(response);
  }
  let candidateIdentity = typeof account.accountAlias === "string" && account.accountAlias.trim() ? account.accountAlias.trim() : null;
  if(accountResponse.ok&&!candidateIdentity){
    // Binance documents the unique accountAlias on balance, not on account information.
    const balanceResponse=await fetcher(`${base}/fapi/v3/balance?${query}&signature=${signature}`,{headers,signal:AbortSignal.timeout(10000)});
    const balances=await balanceResponse.json().catch(()=>null);
    const aliases=balanceResponse.ok&&Array.isArray(balances)?[...new Set(balances.map(row=>typeof row?.accountAlias==='string'?row.accountAlias.trim():'').filter(Boolean))]:[];
    if(aliases.length===1)candidateIdentity=aliases[0];
  }
  const nativeIdentity = candidateIdentity && isAtomicExecutionIdentity(candidateIdentity) ? candidateIdentity : null;
  // This compatibility marker is never accepted by customer credential persistence.
  // Missing or contradictory native identity remains a blocker, not a shared customer bot.
  const identity = nativeIdentity ?? canonicalBinanceTestnetSystemIdentity();
  const ok = accountResponse.ok && ordersResponse.ok;
  return {
    connection_verified: ok,
    provider: "binance", environment, discovered_account_identity: identity,
    read_permissions: { account: accountResponse.ok, balances: accountResponse.ok && Array.isArray(account.assets), positions: accountResponse.ok && Array.isArray(account.positions), orders: ordersResponse.ok },
    trading_permission:account.canTrade===true&&(environment!=='live'||keyPermissions?.enableFutures===true&&keyPermissions?.enableReading===true),withdrawal_permission:environment==='testnet'?false:typeof keyPermissions?.enableWithdrawals==='boolean'?keyPermissions.enableWithdrawals:null,
    identity_kind:'NATIVE_ACCOUNT',
    warnings: accountResponse.ok && !nativeIdentity ? ["Native stable provider identity unavailable; safe canonical fallback used."] : [],
    first_blocker: !accountResponse.ok ? `BINANCE_AUTH_OR_ACCOUNT_READ_FAILED_${accountResponse.status}` : !ordersResponse.ok ? `BINANCE_ORDER_READ_FAILED_${ordersResponse.status}` : environment==='live'&&!keyPermissions ? "BINANCE_API_KEY_PERMISSIONS_UNVERIFIED" : null,
  };
}

async function bybitGet(path: string, params: Record<string, string>, credential: RawCredential, fetcher: typeof fetch, environment: OnboardingEnvironment = "demo") {
  const timestamp = String(Date.now());
  const recvWindow = "10000";
  const query = normalizedQuery(params);
  const { signature } = await signBybitV5Get({ timestamp, apiKey: credential.apiKey, apiSecret: credential.apiSecret, recvWindow, query });
  const response = await fetcher(`${providerEnvironmentContract("bybit",environment).baseUrl}${path}${query ? `?${query}` : ""}`, { redirect:"error",signal:AbortSignal.timeout(10000),headers: {
    "X-BAPI-API-KEY": credential.apiKey, "X-BAPI-TIMESTAMP": timestamp, "X-BAPI-RECV-WINDOW": recvWindow, "X-BAPI-SIGN": signature,
  } });
  return { response, body: await safeJson(response) };
}

function bybitOk(value: { response: Response; body: Record<string, unknown> }) { return value.response.ok && Number(value.body.retCode) === 0; }

export async function verifyBybitDemo(credential:RawCredential,fetcher:typeof fetch=fetch,environment:OnboardingEnvironment="demo"):Promise<SafeVerification>{
 validateCredentialShape('bybit',credential);
 const [keyInfo,wallet,positions,orders,accountInfo]=await Promise.all([
  bybitGet('/v5/user/query-api',{},credential,fetcher,environment).catch(()=>({response:new Response('{}',{status:503}),body:{} as Record<string,unknown>})),
  bybitGet('/v5/account/wallet-balance',{accountType:'UNIFIED'},credential,fetcher,environment),
  bybitGet('/v5/position/list',{category:'linear',settleCoin:'USDT'},credential,fetcher,environment),
  bybitGet('/v5/order/realtime',{category:'linear',settleCoin:'USDT'},credential,fetcher,environment),
  bybitGet('/v5/account/info',{},credential,fetcher,environment)
 ]);
 const meta=keyInfo.body.result as Record<string,any>|undefined,permissions=meta?.permissions;
 const nativeIdentity=bybitOk(keyInfo)&&meta?.userID!=null?String(meta.userID):null;
 const digest=await crypto.subtle.digest('SHA-256',new TextEncoder().encode(credential.apiKey)),fingerprint=Array.from(new Uint8Array(digest)).map(n=>n.toString(16).padStart(2,'0')).join('');
 const readOK=bybitOk(wallet)&&bybitOk(positions)&&bybitOk(orders)&&bybitOk(accountInfo);
 let identity=nativeIdentity,kind:SafeVerification['identity_kind']='NATIVE_ACCOUNT',trading=bybitOk(keyInfo)&&meta?.readOnly===0&&Array.isArray(permissions?.ContractTrade)&&permissions.ContractTrade.includes('Order');
 const permissionLists=permissions&&typeof permissions==='object'?Object.values(permissions).filter(Array.isArray).flat():[];
 let withdrawal:boolean|null=bybitOk(keyInfo)&&permissions&&typeof permissions==='object'?permissionLists.some(x=>typeof x==='string'&&x.toLowerCase()==='withdraw'):null;
 const notes:string[]=[];
 // Demo keys may not expose the user/key metadata endpoint listed for mainnet. Never invent a UID or reuse a customer identity.
 if(environment==='demo'&&!nativeIdentity&&readOK){
  identity='demo-key-'+fingerprint;kind='DEMO_CREDENTIAL';
  withdrawal=false;notes.push('Demo API does not expose a native account UID: this binding is specific to this verified key. A different key requires a new account record.');
  if(credential.allowDemoWriteProbe===true){
   const p=(positions.body.result as any)?.list,o=(orders.body.result as any)?.list,initialMargin=(wallet.body.result as any)?.list?.[0]?.totalInitialMargin;
   if(!Array.isArray(p)||!Array.isArray(o)||initialMargin===undefined||String(initialMargin).trim()===''||!Number.isFinite(Number(initialMargin))||Number(initialMargin)!==0||p.some((x:any)=>!Number.isFinite(Number(x.size))||Number(x.size)!==0)||o.length!==0)throw Error('EMPTY_DEDICATED_DEMO_ACCOUNT_REQUIRED');
   const timestamp=String(Date.now()),recvWindow='10000',body=JSON.stringify({category:'linear',settleCoin:'USDT'}),signature=await hmacSha256(credential.apiSecret,timestamp+credential.apiKey+recvWindow+body);
   const response=await fetcher('https://api-demo.bybit.com/v5/order/cancel-all',{method:'POST',redirect:'error',signal:AbortSignal.timeout(10000),headers:{'Content-Type':'application/json','X-BAPI-API-KEY':credential.apiKey,'X-BAPI-TIMESTAMP':timestamp,'X-BAPI-RECV-WINDOW':recvWindow,'X-BAPI-SIGN':signature},body});
   const result=await safeJson(response);trading=response.ok&&result.retCode===0;
  }
 }
 if(environment==='demo'&&readOK)withdrawal=false; // The locked demo domain cannot withdraw real funds.
 return {credential_fingerprint:fingerprint,native_account_uid:nativeIdentity,identity_kind:kind,connection_verified:readOK&&Boolean(identity),provider:'bybit',environment,discovered_account_identity:identity,read_permissions:{account:bybitOk(accountInfo),balances:bybitOk(wallet),positions:bybitOk(positions),orders:bybitOk(orders)},trading_permission:trading,withdrawal_permission:withdrawal,warnings:notes,
 first_blocker:!readOK?'BYBIT_ACCOUNT_READ_FAILED':!identity?'BYBIT_STABLE_ACCOUNT_IDENTITY_UNAVAILABLE':!trading?(environment==='demo'&&!nativeIdentity?'DEMO_WRITE_PERMISSION_CONFIRMATION_REQUIRED':'TRADING_PERMISSION_REQUIRED'):null};
}

export async function verifyProvider(provider: OnboardingProvider, environment: string, credential: RawCredential, fetcher: typeof fetch = fetch) {
  providerEnvironmentContract(provider,environment);
  return provider === "binance" ? verifyBinanceTestnet(credential, fetcher, environment as OnboardingEnvironment) : verifyBybitDemo(credential, fetcher, environment as OnboardingEnvironment);
}

export function safeAccountSummary(row: Record<string, unknown>) {
  const { credential_ref, ...safe } = row;
  const ref = String(credential_ref ?? "");
  return { ...safe, credentials_configured: Boolean(ref), masked_credential_reference: ref ? `vault:••••${ref.slice(-8)}` : null };
}
