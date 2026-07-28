import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2";
import { providerEnvironment, safeAccountSummary, verifyProvider, type OnboardingProvider, type RawCredential } from "../_shared/execution-account-onboarding.ts";

const cors = { "Access-Control-Allow-Origin": "*", "Access-Control-Allow-Methods": "POST, OPTIONS", "Access-Control-Allow-Headers": "Content-Type, Authorization, Apikey" };
const reply = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { ...cors, "Content-Type": "application/json" } });
const safeError = (error: unknown) => error instanceof Error ? error.message.replace(/(api[_ -]?key|secret|passphrase)\s*[=:]\s*\S+/gi, "$1=[REDACTED]") : "onboarding_failed";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { status: 204, headers: cors });
  if (req.method !== "POST") return reply({ error: "method_not_allowed" }, 405);
  const service = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!, { auth: { persistSession: false } });
  const token = (req.headers.get("Authorization") ?? "").replace(/^Bearer\s+/i, "");
  const { data: { user } } = await service.auth.getUser(token);
  if (!user) return reply({ error: "unauthorized" }, 401);
  const { data: admin } = await service.from("profiles").select("role").eq("id", user.id).maybeSingle();
  if (admin?.role !== "admin") return reply({ error: "forbidden" }, 403);

  let credential: RawCredential | null = null;
  try {
    const body = await req.json() as Record<string, unknown>;
    const action = String(body.action ?? "");
    if (action === "list_customers") {
      const { data, error } = await service.from("profiles").select("id,email,full_name,role").neq("role", "admin").order("full_name").limit(250);
      if (error) throw error;
      return reply({ customers: data ?? [] });
    }
    const provider = String(body.provider ?? "") as OnboardingProvider;
    const environment = String(body.environment ?? providerEnvironment(provider));
    credential = { apiKey: String(body.api_key ?? ""), apiSecret: String(body.api_secret ?? ""), passphrase: String(body.passphrase ?? "") || undefined };
    delete body.api_key;
    delete body.api_secret;
    delete body.passphrase;
    const verification = await verifyProvider(provider, environment, credential);
    if (action === "test_connection") return reply({ verification });
    if (action !== "create_account") return reply({ error: "unsupported_action" }, 400);
    if (!verification.connection_verified || verification.first_blocker) return reply({ error: "connection_verification_failed", verification }, 422);
    const ownership = body.ownership === "system" ? "system" : "customer";
    const customerId = ownership === "customer" ? String(body.customer_id ?? "") : null;
    if (ownership === "customer" && !customerId) throw new Error("customer_selection_required");
    // Creation RPC owns the transaction: Vault write, duplicate check, operational
    // scoping, and canonical row insertion either all commit or all roll back.
    let secretJson: string | null = JSON.stringify({ api_key: credential.apiKey, api_secret: credential.apiSecret });
    credential = null;
    const { data, error } = await service.rpc("onboard_execution_account", {
      p_ownership: ownership, p_customer_id: customerId, p_display_label: String(body.display_label ?? "").trim(),
      p_provider: provider, p_environment: environment, p_provider_account_id: verification.discovered_account_identity,
      p_secret_json: secretJson, p_selectable: body.selectable !== false, p_monitor_enabled: body.monitor_enabled !== false,
      p_operational: body.operational === true,
    });
    secretJson = null;
    if (error) throw error;
    const inserted = (Array.isArray(data) ? data[0] : data) as Record<string, unknown> | null;
    const accountId = String(inserted?.id ?? "");
    if (!accountId) return reply({ error: "ACCOUNT_INSERT_RESULT_MISSING" }, 500);
    const { data: persisted, error: rereadError } = await service.from("connected_execution_accounts")
      .select("id,display_label,account_id,provider_account_identity,adapter_identity,provider,environment,customer_id,ownership_classification,credential_ref,enabled,monitor_enabled,is_operational,execution_enabled,provider_health,credentials_verified_at,last_synchronized_at,last_error")
      .eq("id", accountId).maybeSingle();
    if (rereadError) return reply({ error: "ACCOUNT_CANONICAL_REREAD_FAILED", account_id: accountId }, 500);
    if (!persisted) return reply({ error: "ACCOUNT_NOT_PERSISTED", account_id: accountId }, 500);
    const expectedOwner = ownership === "system"
      ? (await service.from("execution_system_owner").select("owner_id").eq("singleton", true).single()).data?.owner_id
      : customerId;
    const contractMatches = persisted.customer_id === expectedOwner && persisted.ownership_classification === ownership
      && persisted.provider === provider && persisted.environment === environment
      && Boolean(persisted.credential_ref) && persisted.enabled === (body.selectable !== false)
      && persisted.monitor_enabled === (body.monitor_enabled !== false)
      && persisted.is_operational === (body.operational === true) && persisted.execution_enabled === false;
    if (!contractMatches) return reply({ error: "ACCOUNT_PERSISTED_CONTRACT_MISMATCH", account_id: accountId }, 500);
    return reply({ status: "ACCOUNT_CREATED", verification, account: safeAccountSummary(persisted), execution_default_off: true }, 201);
  } catch (error) {
    return reply({ error: safeError(error) }, 400);
  } finally {
    credential = null;
  }
});
