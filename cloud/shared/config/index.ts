import type { CloudEnvironment } from "../contracts/events.ts";

export interface CloudConfig {
  service: string; environment: CloudEnvironment; region: string; revision: string; buildId: string;
  port: number; serviceIdentity: string; supabaseUrl: string; supabaseCredentialSecretRef: string;
  topics: Record<string, string>; subscriptions: Record<string, string>; logLevel: string;
  readinessTimeoutMs: number; requestTimeoutMs: number; retryLimit: number; idempotencyLeaseMs: number;
  providerConfigRefs: string[]; runtimeEnabled: boolean; providerMutationEnabled: boolean; productionExecutionEnabled: boolean;
}

export class ConfigurationError extends Error {
  constructor(message: string) { super(message); this.name = "ConfigurationError"; }
}

type Environment = Record<string, string | undefined>;
const required = (env: Environment, key: string): string => {
  const value = env[key]?.trim();
  if (!value) throw new ConfigurationError(`Missing required configuration: ${key}`);
  return value;
};
const integer = (env: Environment, key: string, fallback: number, allowZero = false): number => {
  const raw = env[key]; const value = raw === undefined ? fallback : Number(raw);
  if (!Number.isSafeInteger(value) || value < (allowZero ? 0 : 1)) throw new ConfigurationError(`${key} must be ${allowZero ? "a non-negative" : "a positive"} integer`);
  return value;
};
const flag = (env: Environment, key: string): boolean => env[key] === "true";
const map = (raw: string, key: string): Record<string, string> => {
  try { const parsed = JSON.parse(raw); if (!parsed || Array.isArray(parsed) || typeof parsed !== "object") throw new Error(); return parsed; }
  catch { throw new ConfigurationError(`${key} must be a JSON object`); }
};

export function loadConfig(env: Environment = process.env): CloudConfig {
  const environment = required(env, "HASHIBOT_ENVIRONMENT");
  if (!["dev", "beta", "prod"].includes(environment)) throw new ConfigurationError("HASHIBOT_ENVIRONMENT must be dev, beta, or prod");
  const cfg: CloudConfig = {
    service: required(env, "HASHIBOT_SERVICE"), environment: environment as CloudEnvironment,
    region: required(env, "GOOGLE_CLOUD_REGION"), revision: env.K_REVISION || "local", buildId: env.BUILD_ID || "local",
    port: integer(env, "PORT", 8080, true), serviceIdentity: required(env, "SERVICE_IDENTITY"),
    supabaseUrl: required(env, "SUPABASE_URL"), supabaseCredentialSecretRef: required(env, "SUPABASE_CREDENTIAL_SECRET_REF"),
    topics: map(required(env, "PUBSUB_TOPICS_JSON"), "PUBSUB_TOPICS_JSON"),
    subscriptions: map(required(env, "PUBSUB_SUBSCRIPTIONS_JSON"), "PUBSUB_SUBSCRIPTIONS_JSON"),
    logLevel: env.LOG_LEVEL || "info", readinessTimeoutMs: integer(env, "HEALTH_READINESS_TIMEOUT_MS", 3000),
    requestTimeoutMs: integer(env, "REQUEST_TIMEOUT_MS", 10000), retryLimit: integer(env, "RETRY_LIMIT", 3),
    idempotencyLeaseMs: integer(env, "IDEMPOTENCY_LEASE_MS", 60000),
    providerConfigRefs: (env.PROVIDER_CONFIG_REFS || "").split(",").filter(Boolean),
    runtimeEnabled: flag(env, "RUNTIME_ENABLED"), providerMutationEnabled: flag(env, "PROVIDER_MUTATION_ENABLED"),
    productionExecutionEnabled: flag(env, "PRODUCTION_EXECUTION_ENABLED"),
  };
  if (!/^https:\/\//.test(cfg.supabaseUrl)) throw new ConfigurationError("SUPABASE_URL must use HTTPS");
  if (/service.role|eyJ/i.test(cfg.supabaseCredentialSecretRef)) throw new ConfigurationError("SUPABASE_CREDENTIAL_SECRET_REF must be a secret reference, not a credential value");
  return Object.freeze(cfg);
}
